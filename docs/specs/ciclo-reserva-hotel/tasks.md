# Tareas: ciclo de la reserva del hotel

Spec: [spec.md](spec.md). Una pieza a la vez: se cierra y se prueba antes de la siguiente.

## Pieza 1 — Backend: estados, check-in/out, código PMS y notas
- [x] 1.1 SQL `docs/sql/ciclo_reserva_hotel.sql` y schema Prisma:
  - `reservas`: `codigo_pms`, `checkin_en`, `checkout_en`, `notas` jsonb, `cancelacion` jsonb, `retenido`;
  - `config_reservas`: `cancelacion_gratis_horas`, `penalidad_noches`.
  - **Corrido en Supabase (2026-10-16).**
- [x] 1.2 Estado `hospedada` y `TRANSICIONES_HOTEL` (`check_in`, `check_out`); `tieneCicloEstadia` se deduce de la máquina.
  - `estadoEfectivo` recibe `tipo`, y `persistirVencimientos` no cierra solas las reservas con ciclo (C0.1).
  - `hospedada` ocupa cupo (disponibilidad, noche) y cuenta en el dashboard, las reseñas, los comunicados, la agenda y Próximas.
- [x] 1.3 `hotel/ciclo.service.js`: `registrarCheckin` (acompañantes, hora, cobro opcional) y `registrarCheckout` (cobra el saldo con medio y comprobante); `cobrarEnMostrador` deja el pago con proveedor `mostrador`. Rutas `POST /:id/check-in` y `/check-out`.
- [x] 1.4 Recepción: `registrarLlegada` hace el check-in de la reserva confirmada; `registrarSalida` de la última habitación hace el check-out.
- [x] 1.5 `PUT /:id/codigo-pms` (rechaza un código repetido en la tienda) y `POST /:id/notas` (concatena en la base). Búsqueda por código PMS y por texto de las notas.
- [x] 1.6 `whereHotel` (activas, por_confirmar, reservada, ocupada, finalizada, no_llego, anulada, llegadas, salidas, atender) con `sinPms` y `conNotas`; `GET /resumen-hotel`. La lista y la ficha del Admin llevan `codigoPms`, `checkinEn`, `checkoutEn`, `notas`, `cancelacion` y `retenido`.
- [x] 1.7 Tests: `hotel.ciclo.test.js` y rutas. Backend: 1506 tests en verde (2026-10-16).

## Pieza 2 — Backend: cambios, cancelación, no-show, early/late
- [x] 2.1 Modificar (C3), `PUT /:id/estadia`:
  - recotiza con `verticalHotel.cotizar` y `excluirPedidoId` (la reserva no se cuenta en el cupo);
  - rehace las líneas del pedido;
  - sin pagos recalcula todo; con pagos, el saldo absorbe la diferencia;
  - revalida el cupo con el tipo bloqueado.
- [x] 2.2 Cambiar salida (C4), `POST /:id/cambiar-salida`: cotiza solo las noches que se agregan o se quitan. Con tarifa no reembolsable, la salida anticipada no descuenta.
- [x] 2.3 Cancelar con política (C5) y no llegó con cargo (C6):
  - `POST /:id/cancelar-hotel` (quién y motivo) y `POST /:id/no-llego`;
  - política en `config_reservas` (`cancelacionGratisHoras`, `penalidadNoches`), que también ve la tienda;
  - `penalidadCancelacion` y `tarifaPorNoche` son funciones puras;
  - guarda `cancelacion` y `retenido`.
- [x] 2.4 Early/late (C7):
  - `hotel_extras.horario` (`docs/sql/ciclo_reserva_hotel_2.sql`, **corrido 2026-10-16**);
  - el extra queda pedido con su hora en la foto de la reserva;
  - `POST /:id/horario` aprueba, o rechaza y descuenta;
  - `POST /:id/salida-tardia` agrega el extra del mostrador y mueve la hora de salida.
- [x] 2.5 Tests. Backend: 1526 tests en verde (2026-10-16).

## Pieza 3 — Admin: bandeja del hotel
- [x] 3.1 Capacidad `reservas.cicloEstadia` en el perfil (solo hotel).
  - `cicloEstadiaMatch` (canMatch, espera la sesión) hace que `/reservas` abra `hotel-bandeja/bandeja-hotel` y `/reservas/:id` su ficha; las demás tiendas siguen con la bandeja M1.
  - La bandeja de tarjetas por día (motor-reservas-hotel, sin commit) se descartó: la M1 volvió a su versión, conservando solo `venceEn` en el plazo.
- [x] 3.2 Bandeja (C10.1–C10.3):
  - tarjetas de hoy que filtran;
  - ciclo con contadores;
  - búsqueda, llegada, tipo, "Sin código PMS" y "Con notas";
  - tabla con código y PMS, notas, early/late, estado, garantía y saldo, y la acción del momento.
- [x] 3.3 Ficha en panel lateral (`?accion=` abre la acción) con pasos, early/late por responder, acciones por estado, notas, código PMS, estadía, antes de la llegada, huéspedes, pago e historial. `accion-hotel`: check-in, check-out, modificar, cambiar salida, salida tardía, cancelar, no llegó y verificar pago.
- [x] 3.4 Celular: tarjetas con borde del estado y la acción abajo; filtros que se deslizan; ficha a pantalla completa; acciones como hoja inferior con botones fijos.
- [x] Configuración: "Cancelación gratis hasta N horas" y "se retienen N noches" (sección check-in/out).
- [x] Tests: `hotel-bandeja.util.spec.ts`. Admin: 162 tests en verde, compila (2026-10-16).
- [ ] 3.5 Probar en el navegador con Hotel Nobility (escritorio y celular).

## Pieza 4 — Tienda: early/late como pedido
- [ ] 4.1 El extra con horario se pide con hora y no se cobra hasta aprobarlo (C7.1). El seguimiento muestra si se aprobó.
