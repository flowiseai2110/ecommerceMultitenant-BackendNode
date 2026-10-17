# Tareas: mejoras de la reserva del hotel

Spec: [spec.md](spec.md). Una pieza a la vez: se cierra y se prueba antes de la siguiente.

## Pieza 1 — Precio por noche en el calendario (H1)
- [x] 1.1 Backend: `GET /store/reservas/habitaciones-precios` (`hotel/precios-calendario.js`, con `precioNoche` de la cotización): precio por noche de cada tipo, null si está cerrada. Se hizo aparte de la disponibilidad, que solo trae los tipos con inventario. Backend: 1533 tests (2026-10-16).
- [x] 1.2 Tienda (`hotel/precios-calendario.ts`):
  - buscador: el más bajo entre los tipos con cupo, con las noches sin ninguna libre tachadas;
  - página de la habitación: su precio;
  - punto y leyenda "Tarifa más baja" solo si el mes tiene precios distintos.
  - Tienda: 219 tests.
- [ ] 1.3 Probar en el navegador (Nobility tiene el mismo precio todas las noches: para ver el punto, cargar un precio de viernes y sábado o una temporada).

## Pieza 2 — Precios con o sin impuestos (H2)
- [x] 2.1 SQL `docs/sql/reserva_hotel_impuestos.sql` y config: `precios_con_impuestos` (default true), `recargo_servicio_pct` (default 0, 0–13) y `reservas.impuestos`. **Corrido en Supabase por el usuario (2026-10-16).**
- [x] 2.2 `aplicarImpuestos` en `cotizar.js`:
  - con impuestos incluidos, el desglose solo se informa y el extranjero descuenta el IGV del alojamiento;
  - sin impuestos, las líneas son netas y se agregan las de IGV y servicio.
  - El rechazo de early/late y la tarifa por noche suman los impuestos al extra (`totalFinalExtra`).
  - Backend: 1538 tests.
- [x] 2.3 Admin:
  - "Cómo muestras tus precios", el % de servicio y un ejemplo en Configuración;
  - debajo de cada precio (habitación y extras), el otro valor y el del extranjero (`impuestos/precio-impuestos`);
  - desglose en la ficha.
  - Admin: 165 tests.
- [x] 2.4 Tienda: "+ impuestos" en las tarjetas, la ficha y la leyenda del calendario. El panel muestra las líneas de IGV y servicio, o "Impuestos y cargos: incluidos". Tienda: 219 tests.
- [ ] 2.5 Probar en el navegador los dos modos.

## Pieza 3 — Código promocional (H3): pospuesta, se hace cuando un cliente la pida
- [ ] 3.1 Backend: tabla de códigos, validación en la cotización y usos al confirmar.
- [ ] 3.2 Admin: Reservas › Códigos.
- [ ] 3.3 Tienda: campo en el buscador y en el panel, y `?codigo=`.

## Pieza 4 — Términos, promociones y tarjeta (H4, H5)
- [x] 4.1 `config_reservas.terminos` (se traduce con IA) y `reservas.acepta_terminos` / `acepta_promociones` (`docs/sql/reserva_hotel_terminos.sql`):
  - la solicitud pide aceptar los términos si existen y tiene la casilla opcional de promociones;
  - el backend rechaza la solicitud sin términos aceptados;
  - las fichas del Admin muestran si el cliente acepta promociones.
- [x] 4.2 `hotel_tipos_habitacion.metros`: en el Admin, junto a las camas; en la tienda, en las tarjetas y en una casilla de la ficha del celular. "Media por noche" en los resultados con fechas.
  - Tests: backend 1539, Admin 165, tienda 219.
- [x] 4.3 SQL `docs/sql/reserva_hotel_terminos.sql` corrido por el usuario (2026-10-16).
- [ ] 4.4 Probar en el navegador.
