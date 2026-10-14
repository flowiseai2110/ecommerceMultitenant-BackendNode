# Spec: motor de reservas del hotel

> Estado (2026-10-14): propuesta. Tareas: [tasks.md](tasks.md).
> Base: [hotel-inventario](../hotel-inventario/spec.md) (cupo real, anulación, reprogramación), [reserva-directa-hotel](../reserva-directa-hotel/spec.md) (apartado y confirmación automática).
> Repos: BackendNode, FrontendAdmin, FrontendStore.

## Qué somos para un hotel

El rubro `hotel` atiende dos formas de trabajar, y cada una tiene su spec:

| | **Hotel** (esta spec) | **Hostal al paso** ([recepcion](../recepcion/spec.md)) |
|---|---|---|
| Cómo vende | Por noche, con reserva previa (web, Booking, WhatsApp) | Por horas o por noche, al que llega; la habitación se vuelve a vender varias veces al día |
| Su operación (entrada, salida, caja, limpieza) | **En su propio PMS o Excel**: no la llevamos | En Recepción: habitaciones físicas, tablero, caja por turno |
| Qué le damos | **Motor de reservas directas** + su panel (como la extranet de Booking.com) | Mostrador + vitrina "libres ahora" |
| Inventario | Por tipo y noche (pool), sin habitaciones físicas | Habitaciones físicas (101, 102…) |

La forma no es un rubro aparte: la tienda usa Recepción cuando crea sus habitaciones físicas (capacidad, no identidad). Esta spec no agrega nada que exija habitaciones físicas.

Responsabilidades de un motor de reservas (investigación 2026-10-14: RateGain, Amenitiz, SiteMinder, Exely, extranet de Booking.com):

1. Publicar disponibilidad y precio por tipo y noche, al instante.
2. Aplicar restricciones: fechas cerradas, mínimo de noches, anticipación.
3. Llevar al huésped de las fechas a la confirmación, con la política de cancelación visible antes de pagar.
4. Cobrar (adelanto o total) apartando el cupo mientras paga.
5. Confirmar por correo y dejar que el huésped consulte, cancele o cambie su reserva.
6. **No vender lo que no hay**, también lo vendido por otros canales.
7. Dar al dueño un panel para atender reservas y fijar cupos, precios y cierres.

Lo que **no** le toca (es del PMS o del Excel del hotel): habitaciones físicas, tape chart, entrada y salida, limpieza, caja, facturación.

## Problema

- **El cupo no se entera de lo vendido fuera de la web.** Hoy libres = `unidades` − reservas de la web. El hotel también vende por Booking, WhatsApp y en la puerta, y lo anota en su PMS o Excel. Si no lo descuenta aquí, la web vende una habitación ocupada. Es la responsabilidad 6 y hoy falla.
- **Disponibilidad solo se mira.** Contesta "¿cuántas me quedan?", pero no deja corregirlo ni cerrar un tipo desde la misma grilla.
- **La bandeja obliga a entrar y salir.** Cada reserva abre otra pantalla; para responder cinco solicitudes hay cinco idas y vueltas, y la lista no dice cuándo vence cada una.

## Requisitos

### M1. Bandeja con panel de detalle (todos los rubros con reserva)

Prototipo A (Diseño › "Prototipos Reservas Admin"). Es la pantalla de Reservas de todos los rubros: no tiene ramas por rubro.

- **M1.1** Lista a la izquierda y detalle a la derecha (≥ 1024 px). En el celular la lista ocupa la pantalla y el detalle se abre encima, con "Volver".
- **M1.2** El detalle es la ficha actual (`/reservas/:id`) como ruta hija de la lista: la misma URL abre la lista con esa reserva elegida. Los enlaces del dashboard y de los correos siguen funcionando.
- **M1.3** Bandejas como chips con contador (Por responder, Pago por verificar, Próximas, las del rubro, Historial). Búsqueda y rango de fechas como hoy.
- **M1.4** Fila: titular, servicio, fechas cortas y el plazo ("vence en 6 h" en Por responder y Pago por verificar, en naranja cuando faltan menos de 12 h; "en 7 días" en Próximas). Cada dato una vez: el código y el estado van en el detalle.
- **M1.5** Al confirmar, rechazar o verificar, la lista y los contadores se actualizan y la ficha queda abierta: después de cada acción la ficha ofrece el WhatsApp con el mensaje listo, y saltar a la siguiente lo perdería.
- **M1.6** Hotel: el detalle de una solicitud dice si hay cupo esas noches ("Hay cupo: 1 de 2 libres"), con el dato de M2.

### M2. Cupo a la venta (hotel)

La pestaña Disponibilidad pasa a ser el lugar donde el dueño **fija** lo que vende en la web, como en la extranet de Booking.com. Absorbe la fase 2 de hotel-inventario.

- **M2.1 Ocupadas fuera de la web.** Tabla `hotel_cupo_externo` (tienda, tipo, fecha de la noche, `ocupadas` ≥ 0, `origen` `manual | ical`, quién y cuándo). `ocupacion()` las suma a las de la web: libres = `unidades` − web − fuera de la web. Las estadías de Recepción ya cuentan aparte: esto no las toca.
- **M2.2 Editar "libres" en la celda.** El dueño escribe cuántas quedan (lo que dice su Excel) y el sistema guarda la diferencia como ocupadas fuera de la web (`manual` = `unidades` − web − ical − libres). No se puede ofrecer más que `unidades` − web − ical: "Tienes 2 vendidas en la web; puedes ofrecer hasta 3".
- **M2.3 Cambio por rango.** Tipo, desde, hasta y días de la semana (p. ej. vie y sáb) → "libres N" o "cerrar la venta" (`cierres_fecha` del tipo, que ya existe y la tienda ya respeta).
- **M2.4 Grilla.** Tipos × noches con libres/total, color por ocupación (verde, ámbar con 1 libre, rojo sin cupo, sobrevendido con −N) y "+N por responder" en las noches con solicitudes. Rango de 14 o 30 días, hoy resaltado.
- **M2.5 Detalle de la noche.** Al tocar una celda: las reservas de la web de esa noche (con acceso a la ficha), lo marcado fuera de la web (manual o iCal) y el campo para corregir los libres.
- **M2.6 Sin `unidades`** (tipo sin control de cupo): la fila invita a cargar el total; no se puede editar.

### M3. Calendario iCal (opcional, hotel)

Sincronización gratis con Booking.com y Airbnb para el hotel sin channel manager.

- **M3.1 Exportar:** un enlace `.ics` por tipo (con token) con las noches sin cupo, para importarlo en Booking o Airbnb.
- **M3.2 Importar:** el dueño pega el enlace `.ics` de Booking o Airbnb de un tipo. Un job lo lee cada 30 min y guarda sus noches como ocupadas fuera de la web (`origen = ical`), reemplazando las anteriores de ese enlace.
- **M3.3 Avisar el límite:** "Se actualiza cada 30 min: entre una lectura y otra se puede vender la misma noche en los dos lados". iCal solo bloquea fechas, no lleva precios.

## Decisiones

| Tema | Decisión | Descartado | Estado |
|---|---|---|---|
| Habitaciones físicas, tape chart, entrada y salida | **Solo para el hostal** (Recepción). El hotel las lleva en su PMS o Excel | Fase 5 de hotel-inventario para todos los hoteles | Tomada (2026-10-14) |
| Cupo de otros canales | **"Libres" editable por noche**, guardado como ocupadas fuera de la web | Que el dueño cambie `unidades` (pierde el total real); allotment separado por canal | Propuesta |
| Bandeja | **Lista + detalle (prototipo A)** para todos los rubros | Agenda "hoy primero" (B): se cubre con A y con "Hoy y mañana", que se queda (imprimible) | Tomada (2026-10-14) |
| iCal | Fase opcional después de M2 | Channel manager | Propuesta |

## Fuera de alcance

Habitaciones físicas, tape chart, entrada y salida, caja y limpieza en hoteles (son del PMS del hotel; en el hostal, de Recepción). Channel manager y conexión con OTAs por API. Precios por canal.
