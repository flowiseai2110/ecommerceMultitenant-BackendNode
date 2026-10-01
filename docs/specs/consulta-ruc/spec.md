# Spec: consulta de RUC para autocompletar la factura

> Estado: **implementado sin commit, pendiente de verificación en navegador** (ver [tasks.md](tasks.md)).
> Diseño técnico: [plan.md](plan.md).
> Repos involucrados: BackendNode, FrontendStore.
> Extiende el comprobante de [checkout-envio-pago](../checkout-envio-pago/spec.md) (R2.3), que dejaba esto como "No incluye".

## Problema

Para pedir factura, el comprador escribía a mano el RUC, la razón social y la dirección fiscal. Eso traía tres problemas:

1. **Errores de tipeo.** Una razón social o dirección mal escrita invalida la factura y obliga a reemitirla.
2. **RUC inexistente o de baja.** Solo se validaba el formato (`^(10|15|17|20)\d{9}$`), no el dígito verificador ni si el contribuyente existe o está activo.
3. **Fricción.** Son tres campos largos en el paso de pago, justo donde más se abandona el carrito.

## Investigación

- **Fuente oficial gratuita:** el [Padrón Reducido del RUC](https://www.sunat.gob.pe/descargaPRR/mrc137_padron_reducido.html) de SUNAT es un dato abierto que se publica a diario. Es un ZIP con un txt separado por `|` (latin-1) de más de 11 millones de filas. Trae RUC, razón social, estado, condición de domicilio, ubigeo y dirección fiscal. **No trae** actividad económica, fecha de inscripción, nombre comercial ni representantes, pero para facturar no hacen falta.
- **APIs comerciales** ([Decolecta](https://decolecta.com/) (antes apis.net.pe), [apiperu.dev](https://apiperu.dev/), [peruapi.com](https://peruapi.com/)): todas cuestan o tienen planes gratis pequeños (unas 100 consultas al mes) y te hacen depender de un tercero.
- **Open source sobre el padrón:**
  - [APISunat-RUC](https://github.com/antonyayansi/APISunat-RUC) (Laravel, MIT)
  - [consulta-peru](https://github.com/Kembec/consulta-peru) (Python/React)
  - [sunat_padron_ruc](https://github.com/jorgechavez6816/sunat_padron_ruc)
  - [ruc-peru](https://github.com/fnaquira/ruc-peru) (a MongoDB)

  Todos cargan el padrón completo en una base de datos propia, que ocupa del orden de 1–2 GB. Eso no entra en el free tier de Railway/Supabase.
- **[tribio-padron-ruc](https://github.com/alb3rt0ru1z/tribio-padron-ruc):** una GitHub Action diaria parte el padrón en JSON por los **5 primeros dígitos** del RUC y jsDelivr lo sirve por CDN. Cada consulta baja un solo trozo de 1–2 MB, y el peso total lo cargan GitHub y jsDelivr. Lo verificamos el 2026-10-01: `chunks/20100.json` pesa 1,36 MB, tenía `updated_at` del mismo día y traía el BCP (20100047218) ACTIVO y HABIDO.

**Decisión:** usar el padrón de tribio a través del backend, con caché en memoria. Cuesta cero y no necesita base de datos ni almacenamiento propio.

## Objetivo

Que al escribir un RUC válido en la factura se rellenen solos la razón social y la dirección fiscal con los datos de SUNAT, y que no se pueda pedir factura a un RUC que no esté ACTIVO. Todo eso **sin que una caída del CDN impida comprar**.

## Alcance

**Incluye**
- Validación del dígito verificador (módulo 11) en el frontend y en el endpoint de consulta.
- Endpoint público `GET /store/sunat/ruc/:ruc`.
- Autocompletado en el checkout, con estado y condición visibles.
- Bloqueo de la factura si el RUC no está ACTIVO.

**No incluye** (futuro)
- Exigir el dígito verificador en `createPedidoSchema`. El test `pedidos.schema.comprobante.test.js` usa `20123456789`, que no lo cumple.
- Revalidar en el servidor, al crear el pedido, que el RUC esté ACTIVO.
- Consulta de DNI (RENIEC no tiene un dato abierto equivalente).
- Fork propio de tribio-padron-ruc (ver riesgo en [plan.md](plan.md)).
- Autocompletado del RUC en el admin (datos de facturación de la tienda).

## Requisitos

Formato: *Cuando [condición], el sistema debe [comportamiento].*

### R1 — Validación
- **R1.1** Cuando el RUC no cumple el formato o el dígito verificador, el checkout debe marcarlo como inválido sin consultar al backend.
  - Criterio: `20100047219` → "Ingresa un RUC válido de 11 dígitos"; `20100047218` → válido.
- **R1.2** Cuando el endpoint recibe un RUC inválido, debe responder 400 sin descargar nada.

### R2 — Consulta
- **R2.1** Cuando el RUC es válido, el backend debe devolver razón social, estado, condición, tipo de contribuyente, ubigeo y dirección. Si figura `-` en la dirección, debe devolver `null`.
- **R2.2** Cuando el RUC no figura en el padrón, debe responder 404 ("El RUC no figura en el padrón de SUNAT").
- **R2.3** Cuando el CDN falla o tarda más de `SUNAT_PADRON_TIMEOUT_MS` (8 s por defecto), debe responder 503 `SUNAT_NO_DISPONIBLE`.
- **R2.4** Solo las respuestas 200 llevan `Cache-Control: public, max-age=3600`. Un 503 no se cachea.

### R3 — Checkout
- **R3.1** Al completar un RUC válido, el checkout debe mostrar "Buscando en SUNAT…" y luego rellenar la razón social y la dirección fiscal ("dirección, Distrito - Provincia - Departamento"). Los nombres salen del dataset INEI (`peru-utils`) a partir del ubigeo.
- **R3.2** Debe mostrar `SUNAT: <estado> · <condición>`: verde si está ACTIVO y HABIDO, ámbar si está NO HABIDO, rojo si no está activo.
- **R3.3** Cuando el RUC no está ACTIVO, no debe dejar avanzar con factura ("El RUC figura como BAJA DEFINITIVA en SUNAT").
- **R3.4** Cuando la consulta responde 404 o falla, debe avisar y dejar que el comprador complete los datos a mano. **La consulta ayuda, no bloquea.**
- **R3.5** Si el RUC viene precargado desde la cuenta del cliente, debe consultarse automáticamente.
- **R3.6** Si el comprador cambia el RUC mientras una consulta está en curso, la respuesta vieja debe descartarse.
