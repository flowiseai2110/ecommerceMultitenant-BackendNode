# Spec: paquetes del hotel

> Estado (2026-10-16): **borrador para revisar**. Tareas: [tasks.md](tasks.md).
> Base: [hospedaje-completo](../hospedaje-completo/spec.md) (temporadas, extras, planes, inglés), [reserva-directa-hotel](../reserva-directa-hotel/spec.md) (cupo y pago), [ciclo-reserva-hotel](../ciclo-reserva-hotel/spec.md) (bandeja, cancelación, early/late).
> Repos: BackendNode, FrontendAdmin, FrontendStore.

## Por qué

En la reserva directa, el paquete es lo que más vende un hotel de destino. Las OTAs no lo ofrecen igual: estadía, comidas y actividades por un solo precio.

Hoy la tienda no puede publicar un paquete:
- un plan de tarifa (`hotel_planes`) solo ajusta el precio en %;
- los extras se eligen uno por uno y cada uno tiene su precio;
- no hay noches fijas, fechas de llegada propias, itinerario ni página del paquete.

### Caso de referencia: Hotel Viñas Queirolo (Ica)

Revisado el 2026-10-16 en hotelvinasqueirolo.com. El hotel está dentro de las viñas y casi no recibe pasajeros que lleguen solo a dormir: vende sobre todo paquetes, con las comidas incluidas.

| | Escapada a Ica | Canción Criolla 2026 |
|---|---|---|
| Duración | 3 días / 2 noches consecutivas | 3 días / 2 noches consecutivas |
| Llegada | 12 ago – 21 dic, sin feriados | Solo del 30 oct al 1 nov |
| Incluye | Bebida de bienvenida. Día 1: cena. Día 2: desayuno, almuerzo y cena. Día 3: desayuno. Tour del viñedo con cata (solo mayores de 18). Museo de autos | Lo mismo y un show criollo |
| Niños | 0–3 sin comida; 4–12: plato de fondo, postre y gaseosa | Igual |
| Precio | No lo publican en la página; "no incluye IGV ni 10 % de servicio" | Igual |
| Reserva | Página propia con "Reservar ahora", que abre su motor de reservas con el paquete ya elegido | Igual |
| Early / late | "Sujeto a disponibilidad y cargo adicional" | Igual |

## Decisiones propuestas (para revisar)

| Tema | Propuesta | Alternativa descartada |
|---|---|---|
| Qué es un paquete | Un producto propio del hotel (`hotel_paquetes`) con su página, no un plan de tarifa | Plan de tarifa con extras incluidos: no tiene ni página ni itinerario |
| Duración | **Noches fijas** (2). Opcionalmente, noches adicionales con precio propio | Solo mínimo de noches |
| Precio | **Por habitación y noche según la ocupación** (simple, doble, triple), por tipo de habitación, como lo cobra Viñas Queirolo: Doble Junior Classic, 2 adultos, 2 noches = 2 × US$ 273. Niños por tramo de edad | Por persona: la web del hotel lo vende por habitación |
| Impuestos | El precio que escribe el hotel es el **final** (como el resto de la tienda) | Precio + IGV + servicio calculado: ver Preguntas abiertas |
| Cupo | Usa el inventario del tipo de habitación, como cualquier reserva. Opcionalmente, un tope de habitaciones para el paquete | Inventario propio del paquete |
| Solo paquetes | Configuración por tienda: la tienda no vende habitación sola, como en Viñas Queirolo | Siempre las dos cosas |

## Requisitos

### P1. El paquete
- **P1.1** `hotel_paquetes`:
  - nombre, slug, resumen, descripción y fotos;
  - noches fijas;
  - tipos de habitación en los que se vende;
  - activo y orden.
- **P1.2** Se traduce con IA al inglés, como el resto del contenido, y se corrige en Traducciones.
- **P1.3** Condiciones del paquete (texto): niños, edad mínima de una actividad, lo que no incluye. Si no tiene política de cancelación propia, rige la de la tienda (ciclo-reserva-hotel C5).

### P2. Fechas de llegada
- **P2.1** Ventana de llegada (desde / hasta). Si "desde" y "hasta" son el mismo día, el paquete tiene **fecha única**, como Canción Criolla.
- **P2.2** Días de la semana en que se puede llegar (opcional: "llegadas viernes y sábado").
- **P2.3** Fechas excluidas (feriados o rangos).
- **P2.4** Los cierres de la tienda y el cupo del tipo de habitación siguen rigiendo.
- **P2.5** La salida es la llegada más las noches fijas.

### P3. Precio
- **P3.1** Una tabla por tipo de habitación con el precio por noche de la habitación en simple, doble y triple (cada valor es opcional; sin precio, esa ocupación no se vende). La tienda lo muestra como "media por noche" y el total de las noches del paquete.
- **P3.2** Niños por tramo de edad ("0–3: gratis", "4–12: S/ 180"). Si no hay tramos, el niño cuenta como adulto.
- **P3.3** Con varias habitaciones, los adultos se reparten: 5 adultos en 2 habitaciones son una triple y una doble.
- **P3.4** Noche adicional (opcional): precio por habitación y noche según la ocupación, para quien quiere quedarse más. Hasta N noches adicionales.
- **P3.5** Al paquete no se le aplican temporadas ni planes de tarifa: su precio ya es el de esas fechas.
- **P3.7** IGV del turista extranjero (hospedaje-completo B5). Según lo revisado el 2026-10-16, la Ley del IGV (art. 33 num. 4) considera exportación **"los servicios de hospedaje, incluyendo la alimentación"**, prestados a no domiciliados "en forma individual o a través de un paquete turístico", hasta por 60 días y con la TAM y el pasaporte. Así funciona el PMS en el check-out: el alojamiento y la alimentación salen sin IGV.
  - Paquete: se exonera todo, **salvo** un "monto por persona que no se exonera" que pone el hotel (las actividades: tour, cata o show). Por defecto es 0.
  - Extras: `hotel_extras.exonerable` (sí: desayuno, cena; no: traslado, spa). Cambia la regla actual de B5 ("los extras no se exoneran").
  - Las bebidas entran como alimentación. El hotel debe confirmar con su contador si el reglamento (DS 122-2001-EF, modificado por el DS 342-2017-EF y el DS 087-2022-EF) excluye algún consumo. El sistema solo aplica lo que el hotel marca.
- **P3.6** La cotización es una función pura (`cotizarPaquete`), como `cotizarHotel`, y la usan la tienda, la creación de la reserva y el asesor IA.

### P4. Lo que incluye (itinerario)
- **P4.1** Una lista por día del paquete (Día 1, Día 2, Día 3). Cada ítem tiene:
  - un texto;
  - una clase: desayuno, almuerzo, cena, bebida, actividad u otro;
  - una condición opcional ("Solo mayores de 18").
- **P4.2** Ítems para toda la estadía ("Visita al museo de autos").
- **P4.3** La reserva guarda una copia del itinerario: si el hotel cambia el paquete después, la reserva conserva lo que compró el huésped.

### P5. Cupo del paquete
- **P5.1** Ocupa el inventario del tipo de habitación como una reserva por noche (reserva-directa-hotel).
- **P5.2** Tope opcional de habitaciones vendidas por fecha de llegada (útil en fechas únicas: "20 habitaciones para Canción Criolla"). "Quedan 3" igual que en las habitaciones.

### P6. Tienda
- **P6.1** `/paquetes`: los paquetes activos con foto, noches, fechas, "desde S/ X por persona" y lo principal que incluye.
- **P6.2** `/paquetes/:slug`: la página del paquete, con fotos, itinerario por día, condiciones y el panel de reserva:
  - fecha de llegada (solo las válidas);
  - tipo de habitación;
  - adultos, niños con edad y habitaciones;
  - noches adicionales;
  - extras de la tienda (early check-in, late check-out, traslado).
- **P6.3** El enlace de la página sirve tal cual para campañas y para WhatsApp. `?llegada=YYYY-MM-DD` deja la fecha elegida.
- **P6.4** La home de reservas tiene una sección `paquetes` en el Diseño. La página de una habitación muestra "Paquetes con esta habitación".
- **P6.5** Se reserva y se paga con el mismo flujo (aparta, paga y confirma). El seguimiento muestra el paquete y su itinerario.
- **P6.6** Con **solo paquetes** activo:
  - las habitaciones se muestran como información, con los paquetes en los que se venden;
  - el buscador de fechas lleva a los paquetes de esa fecha;
  - no se puede reservar una habitación sola.

### P7. Admin: paquetes
- **P7.1** Reservas › Paquetes: lista con estado (activo, fuera de fecha) y vendidas. El formulario tiene datos, fechas, precios por tipo y ocupación, niños, itinerario por día, condiciones, cupo, fotos y activo.
- **P7.2** Duplicar un paquete, para armar el de la siguiente fecha.
- **P7.3** Configuración › Reservas: "Vender solo paquetes".

### P8. Recepción (bandeja del hotel)
- **P8.1** La tabla y la ficha muestran el nombre del paquete. Hay un filtro por paquete.
- **P8.2** La ficha muestra el itinerario con las fechas reales ("Sáb 31: almuerzo y cena") y las condiciones.
- **P8.3** En el resumen de hoy: comidas incluidas hoy (desayunos, almuerzos y cenas, con número de personas), para avisar a cocina.
- **P8.4** Cambios con paquete:
  - Modificar respeta las reglas del paquete (fecha válida, ocupación con precio).
  - Extender suma noches adicionales del paquete o, si el paquete no las tiene, noches a la tarifa de la habitación.
  - La salida anticipada no descuenta: el paquete se vende entero.
  - Cancelar y No llegó usan la política (C5, C6), y la noche se valora como total del paquete ÷ noches.

## Datos (borrador)

- `hotel_paquetes`:
  - id, tienda_id, slug, nombre, resumen, descripcion, fotos jsonb;
  - noches, llegada_desde, llegada_hasta, dias_llegada int[], fechas_excluidas jsonb;
  - precios jsonb (`[{ tipoId, simple, doble, triple }]`, por habitación y noche), ninos jsonb (`[{ desde, hasta, precio }]`);
  - noche_adicional, max_noches_adicionales, tope_habitaciones;
  - no_exonerable_persona (P3.7, default 0);
  - itinerario jsonb, condiciones;
  - politica_cancelacion (null = la de la tienda);
  - activo, orden, traducciones jsonb y auditoría.
- `reservas.paquete` jsonb: copia del paquete al reservar (id, nombre, noches, ocupaciones con precio e itinerario).
- `config_reservas.solo_paquetes` boolean.
- `hotel_extras.exonerable` boolean (P3.7, default false: así se mantiene lo que hacen hoy).
- SQL a mano en `docs/sql/paquetes_hotel.sql`.

## Preguntas abiertas
1. **Impuestos:** Viñas Queirolo publica el precio sin impuestos (US$ 273 "+ US$ 76.44 impuestos y tasas por noche") y en el pago suma el IGV (18 %) y el servicio (10 %): 546 + 98.28 + 54.60 = 698.88. Propuesta: una opción por tienda "Mis precios no incluyen IGV ni servicio" con el % de recargo al consumo; la tienda muestra igual el total con impuestos en grande y el desglose debajo. Así el huésped no se sorprende en el pago. Al turista extranjero se le quita el IGV y el servicio se mantiene. Es una pieza aparte de los paquetes, porque afecta a toda la tienda.
2. ~~**IGV del turista extranjero**~~: resuelto en P3.7 (alojamiento y alimentación se exoneran; las actividades no).
3. **Varias habitaciones de tipos distintos** (una doble y una triple de otro tipo): queda fuera, igual que en las habitaciones (hospedaje-completo).

## Fuera de alcance
- Paquetes con servicios de otras tiendas (tours de una agencia) o con vuelos.
- Precio dinámico del paquete por día.
- Asignación de mesa o turno de comida.

## Para el manual
- **Paquetes:** en Reservas › Paquetes arma lo que vendes: noches, fechas de llegada, precio por persona según la habitación, lo que incluye cada día y las condiciones.
- **Fecha única:** pon la misma fecha en "desde" y "hasta" (por ejemplo, un fin de semana festivo) y, si quieres, un tope de habitaciones.
- **Comparte el enlace** del paquete en WhatsApp o en tus campañas: abre la página lista para reservar.
- **Solo paquetes:** si tu hotel no vende la habitación sola, actívalo en Configuración › Reservas.
- **Recepción:** la ficha de la reserva muestra qué incluye cada día, y el resumen de hoy, cuántas comidas incluidas hay para avisar a cocina.
