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
- Exigir el dígito verificador en `createPedidoSchema`. Igual se exige en la práctica: `datosFactura` lo valida al crear el pedido.
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
- **R2.3** Cuando jsDelivr falla o tarda más de `SUNAT_PADRON_TIMEOUT_MS` (15 s por defecto, cabeceras + cuerpo), debe reintentar con GitHub directo (`SUNAT_PADRON_FALLBACK_URL`). Si ambas fuentes fallan, debe responder 503 `SUNAT_NO_DISPONIBLE`.
  - Nota (2026-10-07): los trozos no pesan 1–2 MB como se midió con `20100`; los de prefijos `10xxx` y `206xx` llegan a ~15 MB y en frío tardan 6–9 s. Con el timeout original de 8 s fallaban a menudo. Por memoria, solo se cachean 2 trozos (~40 MB de heap el más grande) y aparte los RUC ya consultados.
- **R2.4** Solo las respuestas 200 llevan `Cache-Control: public, max-age=3600`. Un 503 no se cachea.

### R3 — Checkout
- **R3.1** Al completar un RUC válido, el checkout debe mostrar "Buscando en SUNAT…" y luego rellenar la razón social y la dirección fiscal ("dirección, Distrito - Provincia - Departamento"). Los nombres salen del dataset INEI (`peru-utils`) a partir del ubigeo.
- **R3.2** Debe mostrar `SUNAT: <estado> · <condición>`: verde si está ACTIVO y HABIDO, ámbar si está NO HABIDO, rojo si no está activo.
- **R3.3** Cuando el RUC no está ACTIVO, no debe dejar avanzar con factura ("El RUC figura como BAJA DEFINITIVA en SUNAT").
- **R3.4** ~~Cuando la consulta responde 404 o falla, debe dejar completar los datos a mano.~~ Reemplazado por R4 (2026-10-07).
- **R3.5** Si el RUC viene precargado desde la cuenta del cliente, debe consultarse automáticamente.
- **R3.6** Si el comprador cambia el RUC mientras una consulta está en curso, la respuesta vieja debe descartarse.

### R4 — Los datos de la factura vienen solo de SUNAT (2026-10-07)
- **R4.1** El comprador solo escribe el RUC. El checkout y la solicitud de reserva no tienen cajas de razón social ni dirección: se muestran como tarjeta de solo lectura (`app-ruc-verificado`).
- **R4.2** Al crear el pedido o la reserva, el backend toma razón social y dirección del padrón (`datosFactura`). Lo que mande el navegador en esos campos se ignora.
- **R4.3** Cuando el RUC no figura en el padrón (404), no se puede pedir factura: "Revisa el número o pide boleta". El backend responde 400.
- **R4.4** Cuando el RUC no está ACTIVO, no se puede pedir factura (frontend y backend).
- **R4.5** Cuando el padrón no responde (503), el checkout ofrece Reintentar y deja continuar con "verificaremos tu RUC al emitir la factura". El backend acepta el pedido con razón social null; el vendedor la completa al emitir.
- **R4.6** La dirección del adquiriente no es obligatoria en la factura electrónica: si el padrón no tiene domicilio (frecuente en RUC 10), se guarda null y no se pide.
- **R4.7** Al cambiar el RUC se limpian la razón social y la dirección del RUC anterior antes de mostrar las del nuevo.
