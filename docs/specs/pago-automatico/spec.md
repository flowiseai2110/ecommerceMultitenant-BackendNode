# Pago automático

Estado: aprobado para implementar (2026-10-13).
Origen: [plantillas-por-rubro/analisis.md](../plantillas-por-rubro/analisis.md), decisión 1.

## Qué es

Cada tienda elige cómo cobra:

- **Manual** (lo que hay hoy): el cliente paga por Yape, Plin o transferencia, sube la captura y el negocio verifica.
- **Automático**: el cliente paga con tarjeta o Yape dentro de la tienda y la pasarela confirma al instante. Sin capturas ni verificación.

El negocio no elige proveedor. La plataforma decide cuál usa (hoy Culqi) y el admin solo dice "Pago automático" y pide las llaves que ese proveedor necesite. Por dentro, el código admite varios proveedores (`PaymentProvider` + `provider-factory`, ya existentes).

Para probar sin Culqi hay un **simulador de pasarela**: una API falsa con tarjetas de prueba, que se usa igual que una pasarela real.

## Requisitos

### R1. Configuración de la tienda

- **R1.1** `tiendas.modo_pago`: `manual` | `automatico`. Por defecto `manual`. Las tiendas existentes no cambian.
- **R1.2** Admin: `GET /admin/pagos/modo` devuelve `{ modo, listo, faltan[] }`. `PUT /admin/pagos/modo` recibe `{ modo }` (owner o admin).
- **R1.3** Pasar a `automatico` exige que la pasarela esté lista: el proveedor de la plataforma existe y, si pide credenciales, la tienda tiene su configuración activa con llave secreta. Si no, responde 422 `PASARELA_NO_LISTA` con lo que falta.
- **R1.4** Volver a `manual` siempre se puede. Lo ya pagado no cambia.

### R2. Proveedor de la plataforma

- **R2.1** El proveedor sale de la configuración del servidor (`PAGOS_PROVEEDOR`, por defecto `culqi`). La tienda nunca lo elige y el admin no lo muestra.
- **R2.2** Cada proveedor declara si necesita credenciales de la tienda (`requiereCredenciales`). El simulador no las necesita.
- **R2.3** Store: `GET /store/pagos/config?tiendaId=` devuelve `{ modo, proveedor, llavePublica, metodos }`. El front usa `proveedor` solo para saber cómo pedir el token y no lo muestra.

### R3. Cobro de una reserva

- **R3.1** `POST /store/reservas/seguimiento/:token/pago` con `{ tokenId, metodo, cuotaId? }`. Exige `modo_pago = automatico`.
- **R3.2** El monto sale del servidor, nunca del cliente:
  - hotel, tours, canchas y eventos: `reserva.montoAPagar`;
  - locales: el monto de la cuota (`cuotaId`).
- **R3.3** El cargo se puede pedir en `aceptada` (hotel, tours, canchas, locales) o en `por_pagar` (eventos). En otro estado responde 409.
- **R3.4** Si la pasarela confirma el pago:
  - la reserva pasa a `confirmada` (acción `pago_pasarela`) y se actualizan `montoPagado` y `estadoPago`;
  - en eventos, el cupo apartado pasa a vendido;
  - en locales, la primera cuota confirma y bloquea la fecha, y las siguientes solo quedan pagadas;
  - se envía el correo de confirmación.
  Es lo mismo que hoy hace "verificar" a mano.
- **R3.5** Si la pasarela rechaza el pago, responde 422 con un mensaje para el cliente. La reserva sigue esperando el pago y puede reintentar.
- **R3.6** Si queda pendiente, la reserva no cambia. El webhook la confirma después (R5).
- **R3.7** Con `automatico`, subir capturas (de la reserva o de una cuota) responde 409 `PAGO_AUTOMATICO`.
- **R3.8** Es idempotente: un pago confirmado dos veces (respuesta más webhook) aplica la confirmación una sola vez.

### R4. Cobro de un pedido (comercio)

- **R4.1** Sigue `POST /store/pagos/cargo` (ya existe). El monto es `pedido.total` y, al pagar, `estadoPago = pagado`.
- **R4.2** Con `automatico`, ese endpoint ya no recibe `proveedor` del cliente: usa el de la plataforma.

### R5. Webhook

- **R5.1** `POST /webhooks/:proveedor` sigue siendo la fuente de verdad: registra el evento sin duplicar, reconfirma con el proveedor y aplica el resultado al destino del pago (pedido, reserva o cuota) con las mismas reglas de R3.4 y R4.1.

### R6. Simulador de pasarela

- **R6.1** Se monta en `/api/v1/simulador-pagos` solo con `PAGOS_SIMULADOR=true`. Con `NODE_ENV=production` no se monta nunca.
- **R6.2** Endpoints, con la forma de una pasarela real:
  - `POST /tokens`: `{ tarjeta: { numero, vencimiento, cvv }, email }` o `{ yape: { celular, otp } }` → `{ id: "tkn_sim_…" }`. El token dura 10 minutos y sirve una sola vez.
  - `POST /cargos`: `{ token, monto, moneda, email, descripcion, metadata }` → `{ id: "chr_sim_…", estado, codigo, mensaje }`.
  - `GET /cargos/:id` → el estado actual.
- **R6.3** Tarjetas de prueba:

  | Número | Resultado |
  |---|---|
  | 4111 1111 1111 1111 | Pagado |
  | 4000 0000 0000 0002 | Rechazada: fondos insuficientes |
  | 4000 0000 0000 0069 | Rechazada: tarjeta vencida |
  | 4000 0000 0000 0119 | Pendiente. A los 5 s pasa a pagado y llama al webhook `/webhooks/simulado` |

  Yape: OTP `123456` paga y cualquier otro es rechazado.
- **R6.4** Guarda todo en memoria: al reiniciar se pierde.
- **R6.5** El proveedor `simulado` habla con el simulador por HTTP, como lo hace Culqi.

## Diseño

- **Strategy (proveedores):** `PaymentProvider`, `CulqiProvider`, `SimuladoProvider`. `provider-factory` registra `simulado` solo con el simulador activo.
- **Strategy (destino del pago):** `PasarelaService` deja de saber de pedidos. Cobra un **destino** que sabe tres cosas: cuánto cobrar, una descripción y qué hacer al pagar.
  - `DestinoPedido` (comercio)
  - `DestinoReserva` (hotel, tours, canchas, eventos)
  - `DestinoCuota` (locales)
  `destinoDePago(pago)` lo reconstruye en el webhook a partir de `pago.pedidoId`, `pago.cuotaId` y `pedido.reserva`.
- Las confirmaciones reusan lo que ya existe en reservas (`aplicarAccion`, `moverVendidos`, `actualizarOcupacion`, correos). No se duplica la lógica de "verificar".

## Fuera de alcance (va en otras etapas)

- Pantallas de pago del storefront y ajuste en el admin: etapa E3 de la hoja de ruta.
- Reembolsos automáticos (el método `refund` ya existe, pero no se conecta todavía).
- Firma HMAC del webhook de Culqi (pendiente de antes).
