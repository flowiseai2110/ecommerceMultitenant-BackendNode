# Tareas: consulta de RUC para autocompletar la factura

> Implementa [spec.md](spec.md) según [plan.md](plan.md). Marcar `[x]` al cerrar cada tarea.

## Cómo retomar

1. No requiere SQL ni migraciones. Las variables de entorno son opcionales (tienen valores por defecto).
2. Seguir con la Fase 3 (verificación) y luego commitear (Fase 4). Todo está escrito pero **sin commit** en BackendNode y FrontendStore (rama `main`).

Orden de despliegue: backend → tienda. Con la tienda nueva y el backend viejo, la consulta da 404 y el checkout pasa a ingreso manual (R3.4).

## Fase 1 — Backend

- [x] **T1.1** `esRucValido` (formato + módulo 11) — `modules/sunat/ruc.service.js`.
- [x] **T1.2** `consultarRuc` con descarga por prefijo de 5 dígitos, `MemoryCache` (8 trozos, 6 h), dedupe en vuelo, timeout y 404 → trozo vacío.
- [x] **T1.3** `GET /store/sunat/ruc/:ruc` con `Cache-Control` solo en 200 — `ruc.store.routes.js`, montado en `routes/store/index.js`.
- [x] **T1.4** `config.sunat.padron` (`SUNAT_PADRON_URL`, `SUNAT_PADRON_TIMEOUT_MS`).
- [x] **T1.5** 7 tests: dígito verificador, datos, RUC de baja sin domicilio, 400, 404, 503 — `npm test -- modules/sunat`.
- [x] **T1.6** Prueba contra el CDN real (2026-10-01): 20100047218 (BCP) y 20131312955 (SUNAT) devuelven ACTIVO/HABIDO.

## Fase 2 — Checkout (FrontendStore)

- [x] **T2.1** `esRucValido` y `ConsultaRuc` en `pedido.model.ts`; `RucService`.
- [x] **T2.2** `onRucChange`: consulta, descarte de respuestas viejas, relleno de razón social y dirección fiscal.
- [x] **T2.3** `UbigeoService.buscarDistritoPorCodigo` + `direccionFiscalSunat` ("dirección, Distrito - Provincia - Departamento").
- [x] **T2.4** Estado `SUNAT: <estado> · <condición>` bajo el input y avisos para 404/fallo.
- [x] **T2.5** `errorComprobante('ruc')`: módulo 11 + bloqueo si el RUC no está ACTIVO.
- [x] **T2.6** Consulta automática al precargar el RUC desde la cuenta.
- [x] **T2.7** `ng build` sin errores.

## Fase 3 — Verificación

- [ ] **T3.1** En el checkout, factura con `20100047218` → se rellena "BANCO DE CREDITO DEL PERU" y "JR. CENTENARIO Nro. 156 LADERAS DE MELGAREJO URB., La Molina - Lima - Lima"; estado verde.
- [ ] **T3.2** RUC de baja (`20100001226`) → rojo y no deja continuar.
- [ ] **T3.3** `20100047219` (dígito verificador incorrecto) → error de formato, sin request en la pestaña Network.
- [ ] **T3.4** Con `SUNAT_PADRON_URL` apuntando a una URL inválida → aviso "No pudimos consultar SUNAT…" y deja completar a mano y confirmar el pedido.
- [ ] **T3.5** Cambiar el RUC rápido durante la consulta → queda la razón social del último RUC.
- [ ] **T3.6** Cliente con RUC guardado en su cuenta → al abrir factura ya aparece autocompletado.

## Fase 4 — Cierre

- [ ] **T4.1** Fork de `alb3rt0ru1z/tribio-padron-ruc`, activar su GitHub Action y poner `SUNAT_PADRON_URL` en Railway.
- [ ] **T4.2** Commit en BackendNode y FrontendStore.

## Pendientes (fuera de alcance)

- [ ] Exigir el dígito verificador en `createPedidoSchema` (ajustar el RUC de ejemplo en `pedidos.schema.comprobante.test.js`).
- [ ] Revalidar en `pedidos.service.js` que el RUC de la factura esté ACTIVO.
