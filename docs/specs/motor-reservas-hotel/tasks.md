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
- [ ] 2.0 Schema `hotel_cupo_externo` + `docs/sql/cupo_externo.sql`.
- [ ] 2.1 `ocupacion()` suma lo de fuera de la web; tests (con reservas web, con iCal, sobreventa).
- [ ] 2.2 Endpoints: grilla con "+N por responder", detalle de la noche, fijar libres (celda y rango).
- [ ] 2.3 Admin: grilla editable, detalle de la noche, cambio por rango.
- [ ] 2.4 M1.6: "Hay cupo" en el detalle de una solicitud de hotel.
- [ ] 2.5 Probar: fijar libres, reservar en la tienda, ver que no deja pasar del cupo.

## M3 — iCal
- [ ] 3.1 Exportar `.ics` por tipo.
- [ ] 3.2 Importar: enlace por tipo, job cada 30 min, `origen = ical`.
- [ ] 3.3 Admin: enlaces y aviso del límite.
