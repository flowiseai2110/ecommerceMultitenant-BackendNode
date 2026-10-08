# Spec: hospedaje completo (hostal y hotel)

> Estado: **en implementación** (2026-10-08). Tareas: [tasks.md](tasks.md).
> Origen: [analisis-hostal-hotel-lima.md](../verticales-reserva/analisis-hostal-hotel-lima.md) (prueba con `killa-hostal` y `mirador-miraflores`).
> Base: [mini-booking](../mini-booking/spec.md) (lo construido) y [hotel.md](../verticales-reserva/hotel.md) (diseño completo de referencia).
> Repos: BackendNode, FrontendAdmin, FrontendStore.

## Problema

Un hostal o un hotel puede mostrar sus habitaciones y recibir solicitudes, pero:
1. Parte de la tienda sigue hablando de e-commerce (carrito, envíos, "contra entrega") y algunos textos no corresponden al negocio.
2. El dueño no puede expresar cosas que todo hospedaje de Lima tiene: fechas especiales, extras como el traslado, la política de niños, la exoneración de IGV y los dormitorios solo para mujeres.
3. Faltan piezas que el huésped da por hechas: disponibilidad real, varias habitaciones en una solicitud, inglés, una referencia en dólares, tarifas no reembolsables y reseñas desde el primer día.

## Decisiones tomadas (2026-10-08)

| Tema | Decisión | Descartado |
|---|---|---|
| Confirmación | **El dueño elige**: "confirmo yo" (solicitud) o "confirmación inmediata" (si hay cupo, la reserva queda aceptada y espera el pago). Con inventario cargado, la tienda no ofrece fechas llenas en ningún modo | Siempre inmediata; inventario solo informativo |
| Inglés | Textos fijos de la tienda en inglés + **contenido del dueño traducido con IA al guardar**, que el dueño puede corregir. Selector ES/EN | Traducción a mano; solo textos fijos |
| Dólares | **Referencia**: precios y cobro en soles; la tienda muestra "≈ US$" con un tipo de cambio que fija el dueño | Precios y cobro en dólares |
| Reseñas | **Enlace a reseñas externas** (Google, Booking, Tripadvisor) con su puntaje + **pedido de reseña por correo** al terminar la estadía | Solo reseñas propias |
| Varias habitaciones | Una solicitud lleva **N habitaciones del mismo tipo**. Mezclar tipos queda para después (cambia la relación 1:1 entre pedido y reserva) | Carrito de habitaciones |
| Fechas especiales | **Temporadas** con ajuste porcentual sobre el precio del día y mínimo de noches, para todas las habitaciones o algunas | Precio fijo por fecha y por habitación (más carga para el dueño) |

## Fase A — Textos y vistas (sin cambios de base de datos)

- **A1 Pie de página de reservas.** En hotel, tours y eventos el pie no muestra carrito, rastreo de pedido, envíos, devoluciones ni "todos los productos". Muestra: Inicio, el catálogo (Habitaciones / Tours / Eventos) con sus categorías, Políticas de reserva, Preguntas frecuentes (si la home las tiene), Libro de Reclamaciones y Contacto. En métodos de pago no se muestra "contra entrega".
- **A2 Onboarding de reservas.** Una tienda de hotel, tours o eventos no recibe métodos de envío precargados ni "contra entrega".
- **A3 Subtítulo de `/habitaciones`** (y `/tours`, `/eventos`): usa el de la sección del diseño; el texto fijo queda solo como respaldo.
- **A4 Precio por cama.** Con `porPersona`, la tarjeta, la ficha y "Otras habitaciones" dicen "por cama" y "Dormitorio de N camas" en lugar de "Hasta N personas".
- **A5 Modalidades.** La etiqueta de modalidad ("Noche", "6 horas") se muestra solo si la habitación tiene más de una.
- **A6 Cobro en destino.** El panel dice "Pagas todo al llegar: S/ X" en lugar de "Pagas S/ 0.00 al confirmar".
- **A7 Mapa.** La búsqueda del mapa usa solo la dirección (sin el nombre de la tienda). En "Mi Tienda", la dirección explica que con calle y número el mapa marca el local.
- **A8 Logo vacío.** Sin logo, el encabezado muestra las iniciales del nombre sobre el color principal.

## Fase B — Lo que el dueño configura

- **B1 Tipo de alojamiento** (`config_reservas.tipo_alojamiento`: hotel, hostal, casa, apart, lodge, posada). Los textos de la tienda y de los correos dicen "el hostal", "la casa", etc.
- **B2 Temporadas** (`hotel_temporadas`): nombre, desde, hasta, ajuste % (−50 a +300), mínimo de noches (opcional), habitaciones a las que aplica (todas o una lista). Una noche toma el ajuste de la temporada que la contiene (si se superponen, la de mayor ajuste). El mínimo de noches se exige si la **llegada** cae en la temporada. La línea de precio dice el nombre ("2 noches Fiestas Patrias × S/ 390").
- **B3 Extras** (`hotel_extras`): nombre, descripción, precio, cómo se cobra (por estadía, por noche, por persona, por persona y noche), un dato que se le pide al huésped (opcional: "Número de vuelo y hora de llegada"), activo y orden. El huésped los elige en la ficha o en la solicitud; van como líneas del pedido y la reserva guarda una copia.
- **B4 Niños**: `config_reservas.ninos_gratis_hasta` (edad, null = no aplica) y `cargo_nino_noche` (monto por niño mayor a esa edad, por noche). La solicitud pide la edad de cada niño; la reserva guarda las edades. En habitaciones `porPersona` los niños ya cuentan como persona y no se aplica el cargo.
- **B5 IGV turistas** (`config_reservas.exonera_igv_extranjeros`): si está activo y el titular no es peruano, el total se muestra sin IGV (precio ÷ 1.18) con la línea "Exoneración de IGV (turista extranjero)" y el aviso de presentar pasaporte y tarjeta andina. La ficha muestra "Extranjeros: S/ X sin IGV". La reserva guarda `exonerado_igv`.
- **B6 Solo mujeres** (`hotel_tipos_habitacion.solo_mujeres`): la tarjeta y la ficha lo indican y la solicitud pide confirmar "Todas las personas de esta reserva son mujeres". No se guarda el sexo de nadie.
- **B7 Fotos propias en el diseño.** `imagen-texto` acepta `imagen: "propia"` con una foto subida desde el admin, y hay una sección nueva **`galeria`** (de 3 a 12 fotos con pie opcional) para hotel, tours y eventos.

## Fase C — Lo que el huésped espera

- **C1 Inventario y disponibilidad.** `hotel_tipos_habitacion.unidades` (habitaciones de ese tipo, o camas si `porPersona`; null = sin control). Ocupan cupo las reservas aceptadas, en revisión de pago y confirmadas; en modo inmediato también la recién creada, que lo aparta mientras se paga (`apartado_hasta`, como en eventos). La solicitud y la aceptación revalidan el cupo dentro de una transacción con bloqueo del tipo.
  - Tienda: `GET /store/reservas/habitaciones/:slug/disponibilidad?desde&hasta` (cupo por noche); la grilla con fecha oculta los tipos llenos; la ficha marca "Sin cupo" y "Quedan 2".
  - Admin: pestaña **Disponibilidad** en Reservas (tipos × próximos 14 días, con ocupadas / total) y "unidades" en la ficha de la habitación. Al aceptar sin cupo, aviso que pide confirmar.
  - Modo: `modo_confirmacion` = `solicitud` ("confirmo yo") o `pago_directo` ("inmediata"). Inmediata sin inventario cargado se comporta como hoy (aceptada al crearse).
- **C2 Varias habitaciones.** `reservas.habitaciones` (default 1). El panel pide "Habitaciones: 1–5" (con tope en el cupo); la capacidad es por habitación × cantidad y el precio se multiplica. No aplica a `porPersona`.
- **C3 Inglés.**
  - `tiendas.idiomas` (`{es}` o `{es,en}`). Con inglés activo, la tienda muestra el selector ES/EN, respeta `?lang=en` y el idioma del navegador la primera vez, y lo recuerda.
  - Textos fijos en inglés: encabezado, pie, navegación inferior, secciones de la home de reservas, grillas, fichas, solicitud y seguimiento.
  - Contenido: columna `traducciones` (JSONB `{ en: { campo: texto } }`) en `productos` (nombre, descripción corta y larga), `categorias` (nombre), `hotel_tipos_habitacion` (camas, amenities), `hotel_extras`, `hotel_temporadas` (nombre) y `config_reservas` (instrucciones, política de cancelación); y la clave de diseño `traducciones` para los textos de las secciones. Al guardar, el backend traduce con IA lo que cambió (sin bloquear el guardado) y marca lo traducido como "automático"; lo que el dueño edita queda como "manual" y la IA no lo pisa.
  - Admin: pestaña "Inglés" en los formularios con los textos traducidos, editables, y un botón "Traducir todo" en Mi Tienda.
  - Correos al huésped en inglés si reservó en inglés (`reservas.idioma`).
- **C4 Referencia en dólares.** `config_reservas.tipo_cambio_usd` (null = no se muestra). La tienda muestra "≈ US$ 78" junto a los precios de la grilla, la ficha y el total. Se cobra en soles.
- **C5 Planes de tarifa** (`hotel_planes`): nombre ("No reembolsable"), descripción, ajuste % (−50 a 0), reembolsable sí/no, activo. El plan base ("Tarifa flexible") es implícito. La ficha ofrece elegir; la reserva guarda una copia del plan y la política que ve el huésped es la del plan.
- **C6 Reseñas.** `config_reservas.resenas_externas` (hasta 3: fuente, puntaje, cantidad, enlace). La home los muestra cuando la tienda tiene pocas reseñas propias, y la ficha muestra el mejor. Un job envía, una vez, el correo "¿Cómo fue tu estadía?" al terminar una reserva confirmada (`reservas.resena_pedida_en`), con el enlace firmado de reseña.

## Fuera de alcance

- Mezclar tipos de habitación en una solicitud (requiere varias reservas por pedido).
- Cobro en dólares, channel manager, sincronización con Booking/Airbnb y asignación de habitación física.
- Traducción a otros idiomas además del inglés.

## Datos

Una migración por fase (`docs/sql/hospedaje_fase_b.sql`, `hospedaje_fase_c.sql`), generada con `prisma migrate diff`, para correr en el SQL Editor de Supabase.
