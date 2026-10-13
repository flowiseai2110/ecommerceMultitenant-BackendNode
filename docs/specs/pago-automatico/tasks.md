# Tareas: pago automático

> Implementa [spec.md](spec.md). Es la etapa E1 de [plantillas-por-rubro/analisis.md](../plantillas-por-rubro/analisis.md). Marcar `[x]` al cerrar cada tarea.

## Cómo retomar

1. Aplicar la **Fase 0** (SQL) **antes** de arrancar o desplegar el backend. Prisma ya está regenerado con `tiendas.modo_pago`: sin la columna fallan el login del admin, el storefront y `/store/pagos/config`.
2. Todo está escrito pero **sin commit** en BackendNode (rama `main`).

## Fase 0: Base de datos (bloqueante)

- [x] **T0.1** `docs/sql/pago_automatico.sql` en el SQL Editor de Supabase.
  - Verificar: `select modo_pago, count(*) from tiendas group by modo_pago;` → todas en `manual`.
- [x] **T0.2** `npx prisma generate` en local.

## Fase 1: Backend

- [x] **T1.1** `tiendas.modo_pago` en `schema.prisma`.
- [x] **T1.2** `config.pagos.proveedor` (`PAGOS_PROVEEDOR`) y `config.pagos.simulador` (`PAGOS_SIMULADOR`, `_URL`, `_WEBHOOK_URL`, `_DEMORA_MS`).
- [x] **T1.3** Simulador: `modules/pagos/simulador/simulador.js` (lógica en memoria) y `simulador.routes.js`, montado en `/api/v1/simulador-pagos` solo si está activo.
- [x] **T1.4** `SimuladoProvider` (por HTTP) + `requiereCredenciales` y `ProveedorPagoError` en `PaymentProvider`; `proveedorPlataforma()` en `provider-factory`.
- [x] **T1.5** `modo-pago.service.js`: `obtenerModo`, `cambiarModo` (422 `PASARELA_NO_LISTA`), `modoEfectivo`, `configPublica`, `exigirAutomatico`, `exigirManual`.
- [x] **T1.6** Destinos de pago (`pasarela/destinos.js`): `destinoPedido` y el registro para el webhook. `PasarelaService.cobrar(destino)`, que pasa a `pagado` una sola vez (UPDATE condicionado) y bloquea un segundo cargo en curso (`PAGO_EN_CURSO`).
- [x] **T1.7** Reservas: `reservas.pago.js` (`destinoReserva`, `pagarReserva` y el resolutor del webhook) y `destinoCuota` en `locales/cuotas.service.js` (validación compartida con la captura: `exigirCuotaPagable`).
- [x] **T1.8** Eventos: `por_pagar ─pago_pasarela─▶ confirmada`.
- [x] **T1.9** Capturas bloqueadas en automático (409 `PAGO_AUTOMATICO`), en la reserva y en las cuotas.
- [x] **T1.10** Rutas:
  - `GET /store/pagos/config`
  - `POST /store/pagos/cargo` (usa el proveedor de la plataforma y exige automático)
  - `POST /store/reservas/seguimiento/:token/pago`
  - `GET|PUT /admin/pagos/modo`
- [x] **T1.11** Tests: `modules/pagos/__tests__/` (simulador, proveedor simulado, modo de pago, cobro e idempotencia) y rutas de reservas. Suite completa: 1190 en verde.

## Fase 2: Verificación (después de T0.1)

Variables en `.env` del backend local:

```env
PAGOS_SIMULADOR=true
PAGOS_PROVEEDOR=simulado
```

- [ ] **T2.1** `PUT /admin/pagos/modo { modo: "automatico" }` en una tienda demo → 200 con `listo: true`. `GET /store/pagos/config` → `proveedor: "simulado"`, `urlTokens`.
- [ ] **T2.2** Hotel o tours: crear una solicitud, aceptarla en el admin y luego:
  1. `POST /simulador-pagos/tokens` con 4111 1111 1111 1111;
  2. `POST /store/reservas/seguimiento/:token/pago` → la reserva queda `confirmada` y llega el correo.
- [ ] **T2.3** Con 4000 0000 0000 0002 → 422 con "Tu tarjeta no tiene fondos suficientes."; la reserva sigue `aceptada`.
- [ ] **T2.4** Con 4000 0000 0000 0119 → el pago queda pendiente y, ~5 s después, el webhook confirma la reserva.
- [ ] **T2.5** Eventos: una compra en `por_pagar` pagada en línea → `confirmada` y el cupo pasa a vendido.
- [ ] **T2.6** Locales: pagar la separación en línea → confirma y bloquea la fecha; pagar una cuota siguiente → solo queda pagada.
- [ ] **T2.7** En automático, subir una captura → 409 `PAGO_AUTOMATICO`. Volver a manual → las capturas funcionan como antes.

## Pendiente para otras etapas

- [x] Pantallas (E3): `app-pago-en-linea` en el seguimiento (reservas y cuotas) y en el checkout; Admin › Pagos › "Cómo cobras" con `PUT /admin/pagos/modo/credenciales`. Pruebas manuales en [plantillas-por-rubro/tasks.md](../plantillas-por-rubro/tasks.md) §3.
- Apartado corto con pasarela (10 min en eventos, mini-booking R9.1): hoy usa `apartadoManualMin`.
- Reembolso automático y firma HMAC del webhook de Culqi.
