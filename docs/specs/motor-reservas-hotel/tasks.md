# Tareas: motor de reservas del hotel

Spec: [spec.md](spec.md). Una pieza a la vez: se cierra y se prueba antes de la siguiente.

## M1 — Bandeja con panel de detalle (FrontendAdmin)
- [x] 1.1 Rutas: `/reservas/:id` es hija de la lista (`<router-outlet>` en el panel derecho); `agenda`, `disponibilidad` y `configuracion` van antes para que `:id` no las tome. Enlace lista ↔ ficha: `reservas-list/bandeja-reservas.ts` (lo provee la lista; la ficha lo inyecta opcional).
- [x] 1.2 Lista: chips con contador, filas "titular · plazo" / "tipo · fechas cortas" (`fechasCortas`), plazo naranja con menos de 12 h, estado solo en Historial, fila elegida resaltada.
- [x] 1.3 Lado a lado desde `lg` (lista de 24rem, fija con su propio scroll); en el celular, la lista o la ficha, con "Volver".
- [x] 1.4 Ficha en el panel: sin ancho máximo, "Volver" solo en el celular y columnas por container query (`@3xl`) en vez de `lg`. Las acciones ya iban primero en la ficha: no se movieron.
- [x] 1.5 Al resolver: la lista y los contadores se recargan; la ficha queda abierta (WhatsApp).
- [ ] 1.6 Probar en el navegador: hotel, tours y canchas; escritorio y celular. (Admin compila y 99 tests en verde, 2026-10-14; falta verlo.)

## M2 — Cupo a la venta
- [x] 2.0 Schema `hotel_cupo_externo` + `docs/sql/cupo_externo.sql` (DDL de `prisma migrate diff` + CHECK de origen y ocupadas > 0 + RLS). **Falta correrlo en Supabase.**
- [x] 2.1 `ocupacion()` suma lo de fuera de la web (opción `externas: false` para la grilla); `externasPorTipo`, `solicitudesPorNoche`; `calcularManual` pura. Tests: `hotel.cupo.test.js`.
- [x] 2.2 `GET /disponibilidad` (con `detalle`: en sistema, fuera de la web, por responder, saldo, tipos sin cupo), `GET /disponibilidad/noche`, `PUT /disponibilidad/libres` (editor+, en transacción con el tipo bloqueado). Backend: 1255 tests en verde.
- [x] 2.3 Admin: celdas que abren la noche (reservas web, por responder, mostrador, iCal y "Libres para la web"), "Cambiar varias noches" (tipo, rango, días, libres), sobrevendida en rojo, punto en las noches con ventas de fuera, "+N" por responder. Admin compila, 99 tests.
- [-] 2.4 M1.6 descartado: con cupo cargado no hay solicitudes (RD1).
- [ ] 2.5 Probar (después del SQL): fijar libres, reservar en la tienda, ver que no deja pasar del cupo; rango con vie/sáb; noche sobrevendida.

## M3 — iCal
- [ ] 3.1 Exportar `.ics` por tipo.
- [ ] 3.2 Importar: enlace por tipo, job cada 30 min, `origen = ical`.
- [ ] 3.3 Admin: enlaces y aviso del límite.
