# Tareas: paquetes del hotel

Spec: [spec.md](spec.md). Una pieza a la vez: se cierra y se prueba antes de la siguiente.

## Pieza 0 — Aprobar
- [ ] 0.1 Revisar las decisiones y las preguntas abiertas de la spec.
- [ ] 0.2 Prototipo de la página del paquete (tienda) y del formulario (Admin), con el caso Viñas Queirolo.

## Pieza 1 — Backend: datos y cotización
- [ ] 1.1 SQL `docs/sql/paquetes_hotel.sql` y schema Prisma: `hotel_paquetes`, `reservas.paquete` y `config_reservas.solo_paquetes`.
- [ ] 1.2 `hotel/paquetes.js`: `cotizarPaquete` puro (P2, P3, P5), con tests.
- [ ] 1.3 CRUD del Admin, duplicar y traducción con IA (P1.2, P7.2).
- [ ] 1.4 Tienda: lista, detalle con fechas válidas, cotizar y reservar (aparta, paga y confirma); la reserva guarda la copia del paquete.

## Pieza 2 — Admin: Reservas › Paquetes
- [ ] 2.1 Lista y formulario (P7.1), con precios por tipo y ocupación y el itinerario por día.
- [ ] 2.2 "Vender solo paquetes" en Configuración (P7.3).

## Pieza 3 — Tienda
- [ ] 3.1 `/paquetes` y `/paquetes/:slug` en `negocio/hotel/ui.ts` (P6.1–P6.3).
- [ ] 3.2 Sección `paquetes` del Diseño y "Paquetes con esta habitación" (P6.4).
- [ ] 3.3 Seguimiento con el itinerario (P6.5). Modo solo paquetes (P6.6).

## Pieza 4 — Recepción
- [ ] 4.1 Paquete en la tabla y la ficha, filtro y el itinerario con fechas reales (P8.1, P8.2).
- [ ] 4.2 Comidas incluidas de hoy (P8.3).
- [ ] 4.3 Modificar, cambiar salida, cancelar y no llegó con paquete (P8.4).
