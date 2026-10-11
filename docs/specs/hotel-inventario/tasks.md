# Tareas: inventario, anulación y reprogramación de hotel

Spec: [spec.md](spec.md).

Antes de la fase 1: confirmar las 3 decisiones marcadas "Por confirmar" en la spec.

## Fase 0 — Formulario de reserva (FrontendStore)
- [x] 0.1 Encabezado de precio por modalidad + "Impuestos incluidos" / ≈ US$.
- [x] 0.2 Modalidad como control segmentado (oculto con una sola).
- [x] 0.3 Calendario de rango (Entrada | Salida): `calendario-estadia.ts` (reglas puras) + `calendario-estadia.component.ts`. Días pasados, cierres, noches sin cupo, mínimo de noches de temporada, máximo 30; salida permitida en noche llena. Un solo mes visible: el panel es angosto también en escritorio.
- [x] 0.4 Horas: Fecha | Hora de ingreso (lista de 30 min). Hoy no se ofrece si ya no se llega a la anticipación mínima (por noche, antes del check-in; por horas, ninguna hora); el día por defecto pasa al primero válido.
- [x] 0.5 Panel plegable de huéspedes y habitaciones con ayudas, edades de niños adentro, habitaciones que suben solas según los huéspedes, tope `min(5, quedan)`, 2 adultos por defecto.
- [x] 0.6 Resumen: Ingreso/Salida en filas, "N noches × S/ X × H hab." (backend `lineasPrecio`), "Impuestos y cargos: Incluidos", total con separador de miles (`soles()`); se atenúa mientras recotiza.
- [x] 0.7 Recuadro de política de cancelación (oculto sin texto; "No reembolsable" con ese plan).
- [x] 0.8 Disponibilidad en vivo: "Quedan N", sin cupo con botón deshabilitado (ya existía; se mantiene).
- [x] 0.9 Botón "Reservar" con confirmación inmediata, "Solicitar reserva" en modo solicitud (panel y barra móvil).
- [x] 0.10 Barra fija inferior en móvil (ya existía).
- [x] 0.11 Textos EN (claves nuevas en `textos.en.ts`; "Entrada|estadia" para no chocar con eventos). Tests: backend 176 de reservas en verde; tienda 8 nuevos del calendario (la única falla es el test de ejemplo de `app.component`, previa). Navegador (Playwright): demobooking escritorio y mirador-miraflores móvil, en español.
- [ ] 0.12 Pendiente: revisar en inglés y con noches llenas reales en el calendario (la regla está cubierta por tests; en el navegador no se vio un día tachado).

## Fase 1 — Cupo real
- [ ] 1.0 Schema + `docs/sql/hotel_inventario_fase_1.sql` (unidades NOT NULL ≥ 1 con migración de los null, `respuesta_horas` para hotel). Aplicar con `db push`.
- [ ] 1.1 `ocupacion()` por intervalos, incluidas las horas; tests de solapes (noche + horas, salida = llegada).
- [ ] 1.2 `reservarCupo(tx)` con bloqueo ordenado; usarla en crear, aceptar y verificar pago.
- [ ] 1.3 Apartado de la solicitud (plazo de respuesta) y de la aceptada (plazo de pago); `persistirVencimientos` y `ocupaCupo` acordes.
- [ ] 1.4 `forzar` con motivo e historial.
- [ ] 1.5 Test de concurrencia: dos `crearSolicitud` / `aceptarReserva` simultáneas por la última unidad → una pasa y la otra recibe `SIN_CUPO`.
- [ ] 1.6 Admin: aviso en los tipos migrados; unidades obligatorias en la ficha.
  - [x] (adelantado 2026-10-10) "Total de habitaciones" obligatorio: backend (`habitacionSchema`), ficha "Estadía y precios" (primer campo de "Habitaciones y capacidad") y formulario de "Tipo de habitación" (categoría), que edita total, personas por habitación y camas de la ficha de su habitación cuando el tipo tiene una sola; con varias, o sin precios, enlaza a cada ficha. Tests: backend 176, admin 50. Falta verlo en el navegador (requiere sesión del dueño) y la migración de los null (1.0).

- [x] 1.7b (2026-10-11) Formulario del tipo de habitación (producto en un hotel): encabezado y migas "Tipos de habitación › Nuevo/Editar tipo de habitación"; sin precio, oferta, stock ni alerta (el precio lo fija la estadía: `precioBase` = el más bajo de sus modalidades; al crear se manda 1 provisional); sin "Opciones y variantes" (las variantes de precio son modalidades y planes). Admin 50 tests.
- [x] 1.7 (revisado 2026-10-11) Hoteles sin categorías: menú sin "Categorías", formulario del tipo sin categoría y con "Código" (= SKU) y nombre de 100; la tienda no carga categorías en hoteles. Se revirtieron los cambios al formulario de categoría (límites 100/500, tarjeta de capacidad) y a Ayuda/asistente. Store 74/75 (falla previa de `app.component`), admin 50. Antes (2026-10-10): nombres según el modelo Booking, solo en hospedaje. Menú y migas: "Categorías" (`/categorias`) y "Tipos de habitación" (`/habitaciones`, y `/productos/...` con `breadcrumbHotelUrl`); textos de la pantalla de categorías, lista de tipos, ficha de estadía, formulario del producto (categoría requerida, "Tipo de habitación creado") y tarjeta del formulario de categoría. La vitrina sigue diciendo "Habitaciones" (es lo que busca el huésped). "Habitaciones" en el admin queda libre para las físicas (fase 5). Admin compila, 50 tests; falta verlo en el navegador (requiere sesión).

## Fase 2 — Vista de recepción
- [ ] 2.1 Backend: disponibilidad con solicitudes pendientes y reservas por celda (`?detalle=1` o endpoint de celda).
- [ ] 2.2 Admin: grilla con colores, "+N por responder", rango 14/30, totales del día.
- [ ] 2.3 Admin: detalle de celda con acciones.

## Fase 3 — Anulación
- [ ] 3.0 Schema: `config_reservas.cancelacion_tramos`, `reservas.politica`, `reserva_devoluciones`.
- [ ] 3.1 Cálculo puro de la penalidad (tramos, primera noche, no reembolsable) + tests.
- [ ] 3.2 Transiciones: cliente cancela `pago_en_revision`/`confirmada`; negocio cancela `aceptada`/`pago_en_revision`.
- [ ] 3.3 Devoluciones y saldo a favor; "Devoluciones por hacer" en el admin.
- [ ] 3.4 No show con penalidad y liberación de las noches restantes.
- [ ] 3.5 Store: política calculada en la ficha (reemplaza 0.7) y cancelación desde el seguimiento.
- [ ] 3.6 Admin: plantillas de política en configuración; cancelar con desglose y cortesía.
- [ ] 3.7 Correos.

## Fase 4 — Modificar y reprogramar
- [ ] 4.1 Backend: `modificarReserva` (cotizar, `reservarCupo`, diferencia, `reserva_cambios`, límites).
- [ ] 4.2 Cobro de la diferencia desde el seguimiento; diferencia negativa → devolución o saldo.
- [ ] 4.3 Admin: diálogo "Modificar reserva" con vista previa del nuevo total y del cupo.
- [ ] 4.4 Correo de reserva modificada.
- [ ] 4.5 Tests (alarga sin cupo, acorta, cambio de tipo, no reembolsable, máximo de reprogramaciones).

## Fase 5 — Habitaciones físicas y tape chart
- [ ] 5.0 Schema: `hotel_habitaciones`, `reserva_habitaciones`; migración de unidades a habitaciones.
- [ ] 5.1 Cupo a partir de las habitaciones activas y los bloqueos de habitación.
- [ ] 5.2 Asignación sugerida al aceptar; reasignar.
- [ ] 5.3 Admin: tape chart (agrupado por tipo, "Sin asignar", arrastrar para mover).
- [ ] 5.4 Check-in / check-out.
