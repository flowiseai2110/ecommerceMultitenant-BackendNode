# Spec: reserva directa de hospedaje (el sistema confirma, no la recepción)

> Estado (2026-10-13): implementado sin commit en BackendNode, FrontendStore y FrontendAdmin. SQL corrido. Probado con una reserva real (killa-hostal PED-0002): confirmada al instante y la habitación agotada.
> Rubro: **solo hospedaje** (`hotel`). Los demás rubros siguen como están; cada uno tendrá su regla en su estrategia (`modules/reservas/<rubro>/vertical.js`).
> Base: [hospedaje-completo C1](../hospedaje-completo/spec.md) (inventario y apartado), [pago-automatico](../pago-automatico/spec.md) (pasarela y simulador).

## Problema

Un hotel con inventario cargado y pago automático igual dependía de la recepcionista:

- En modo `solicitud` la reserva nacía `solicitada`. **No apartaba el cupo** (dos huéspedes podían pedir la última cama) y el pago se habilitaba recién cuando la recepción aceptaba en el admin.
- La prueba T2.2 de pago-automatico lo fijaba así: "crear una solicitud, aceptarla en el admin y luego pagar". El simulador de Culqi quedaba detrás de una validación humana.
- El apartado duraba `apartadoManualMin` (120 min), pensado para subir una captura de Yape, no para pagar con tarjeta.

Confirmar a mano tiene sentido cuando el hotel trabaja por WhatsApp. Si el sistema conoce el inventario, decide el sistema.

## Cómo lo hace la industria (investigación 2026-10-13)

- Se aparta al reservar, no al mirar: la reserva queda pendiente mientras se paga (lo común, 10–15 min) y, si no se paga, se libera sola (Expedia Rapid "hold and resume"; diseño estándar de motores de reserva).
- El árbitro contra la sobreventa es la base de datos: se bloquea el inventario dentro de la transacción. Quien vio "1 disponible" puede perderla al pagar, y se le avisa.
- Booking: con pago en el hotel, la reserva se confirma al instante y descuenta el inventario.

## Reglas (estrategia del hotel)

- **RD1** Un tipo de habitación **con inventario** (`hotel_tipos_habitacion.unidades` no nulo) se reserva siempre en modo directo, sin importar `modoConfirmacion` de la tienda. Sin inventario sigue la configuración (solicitud por WhatsApp, como hoy).
- **RD2** En modo directo:

  | Cobro | Pago de la tienda | La reserva nace | Apartado | Interviene la recepción |
  |---|---|---|---|---|
  | Se paga al llegar (`en_destino`) | — | `confirmada` | — (descuenta el cupo) | No |
  | Adelanto o total | Automático (simulador / Culqi) | `aceptada` | `apartadoEnLineaMin` (15 por defecto) | No: la pasarela confirma |
  | Adelanto o total | Manual (Yape con captura) | `aceptada` | `apartadoManualMin` (120) | Solo verifica el **dinero** |

- **RD3** Se aparta siempre, no solo con pocas habitaciones: con 4 libres y 5 personas pagando a la vez, la quinta pagaría sin habitación. El apartado vence solo; no cuesta nada.
- **RD4** La creación revalida el cupo con el tipo bloqueado (ya existía, C1), **sin contar la reserva que se está creando** (corregido 2026-10-13: antes la última habitación siempre salía ocupada). Si se ocupó la última: "Se acaba de ocupar el último cupo para esas fechas".
- **RD5** Vencido el apartado, la reserva queda `vencida`, la pasarela rechaza el cobro y el cupo vuelve (ya existía: `estadoEfectivo`, `ocupaCupo`).
- **RD6** `config_reservas.apartado_en_linea_min`: entero de 5 a 60, por defecto 15. Se edita en Admin › Reservas.
- **RD7** La cotización devuelve `modoConfirmacion` efectivo: la tienda elige textos y flujo con ese dato y no pregunta por el rubro.
- **RD8** Lo que ve el cliente: "Quedan N" con pocas habitaciones (ya existía) y el contador del apartado mientras paga (seguimiento).

## Fuera de esta etapa

- Los otros rubros (tours, canchas, locales, eventos): cada uno en su estrategia, cuando se trabaje su piloto.
- Extender el apartado si el cliente ya está en la pasarela cuando vence (hoy: el pago queda registrado y anotado para devolverlo, R3.4 de pago-automatico).
- Reservar la última habitación solo para venta directa (práctica con OTAs; aquí no hay canales externos).

## Archivos

- Backend: `modules/reservas/hotel/vertical.js` (`modoConfirmacion`), `reservas.service.js` (estado inicial, apartado y cotización con el modo efectivo), `reservas.config.service.js` y `reservas.schema.js` (`apartadoEnLineaMin`), `prisma/schema.prisma`, `docs/sql/apartado_en_linea.sql`.
- Tienda: `Cotizacion.modoConfirmacion`; ficha de habitación y pantalla de datos usan el modo efectivo.
- Admin: campo "Minutos para pagar en línea" en la configuración de reservas.
