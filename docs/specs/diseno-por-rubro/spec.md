# Spec: diseño por tipo de negocio (hospedaje, tours, eventos)

> Estado: **Fases 1, 1b, 2 y 3a (hospedaje, esquema del admin, tours y eventos con entradas) implementadas** (2026-10-05), falta la prueba en el navegador. Fase 3b (alquiler de locales) pendiente de especificar: es un tipo de negocio nuevo, fuera de mini booking.
> El esquema del admin reemplaza las pestañas de estructura-tienda R7.1 (Apariencia / Inicio / Producto / Anuncio).
> Tareas: [tasks.md](tasks.md).
> Repos involucrados: BackendNode, FrontendAdmin, FrontendStore.
> Base: [estructura-tienda](../estructura-tienda/spec.md) (plantillas, secciones, copia, tema). Vitrina y reservas: [mini-booking](../mini-booking/spec.md).
> Prototipo visual: canvas "Prototipo Diseño por rubro" (claude.ai), con el esquema del admin y las pantallas de cada rubro.

## Problema

El motor de diseño (plantillas, secciones de la home, paleta, tipografía) solo sirve a las tiendas de productos. Una tienda `hotel` o `tours` no lo usa: su home es una grilla fija (`HabitacionesGridComponent` / `ToursGridComponent`) y lo que el dueño configura en Diseño no se ve. Además, los tipos de sección son de e-commerce (categorías, productos, ofertas): un hotel necesita buscar por fechas, listar habitaciones, mostrar servicios, ubicación y políticas.

## Objetivo

Que cada tipo de negocio tenga **sus plantillas y sus secciones**, editadas con el mismo editor del admin, y que la tienda las dibuje. Se hace en tres fases, una por tipo de negocio:

| Fase | Tipo | Plantillas (investigación de patrones) |
|---|---|---|
| 1 | Hospedaje (`hotel`) | **Boutique**: portada con buscador de fechas, habitaciones con precio, servicios, reseñas, ubicación y políticas. **Casa única**: para un solo alojamiento, al estilo alquiler vacacional |
| 2 | Tours (`tours`) | **Catálogo** (tipo Viator/GetYourGuide) y **Operador** (tipo Peek/Wilderness Travel) |
| 3a | Eventos con entradas (`eventos`) | **Cartelera** (tipo Joinnus/Teleticket: buscador por fecha, varios eventos) y **Evento único** (festival, obra en temporada: el evento primero, fechas en agenda) |
| 3b | Alquiler de locales (tipo nuevo) | **Local propio** (por ocasión, paquetes por invitado, calendario de fechas libres, cotización) y **Varios espacios** (salones con capacidad y precio por hora) |

El 2026-10-05 se vio que `eventos` en mini booking es **venta de entradas** (funciones y tipos de entrada con cupo), mientras que el nicho comercial prioritario es el **alquiler de locales** (salones para cumpleaños, bodas, fiestas), que mini booking deja fuera ("Salones y banquetes"). Se decidió hacer primero el diseño de entradas (3a, sobre lo que ya existe) y después especificar y construir el alquiler de locales como su propia fase (3b).

## Conceptos nuevos

- **Tipo de negocio de la plantilla.** Cada plantilla declara `tipoNegocio` (`productos` por defecto). El admin solo ofrece las del tipo de la tienda, y el backend rechaza aplicar una de otro tipo.
- **Secciones por tipo de negocio.** Cada tipo tiene su lista de secciones permitidas (`TIPOS_POR_NEGOCIO`). Las de e-commerce (categorías, productos, oferta) no existen en un hotel, y las de hotel no existen en una tienda de productos.
- **Estructura por defecto del tipo.** Una tienda sin estructura guardada se ve con la plantilla por defecto de su tipo: `clasica` para productos (como hoy) y `hotel-boutique` para hotel.

## Fase 1 — Hospedaje

### Secciones nuevas

| Tipo | Qué muestra | Datos que edita el dueño | De dónde salen los datos reales |
|---|---|---|---|
| `habitaciones` | Las habitaciones con foto, capacidad y precio "desde" | título, subtítulo, variante (`grilla` / `carrusel`), límite | `GET /store/reservas/habitaciones` |
| `servicios` | Íconos con lo que ofrece el hospedaje (wifi, desayuno, cochera…) | título, variante (`iconos` / `lista`), de 2 a 12 items (ícono + texto) | El dueño |
| `ubicacion` | Mapa, dirección y lugares cercanos | título, texto opcional, hasta 4 "cercanos", mostrar mapa sí/no | `tiendas.direccion` |
| `politicas` | Check-in, check-out, cancelación e instrucciones | título | Configuración de reservas (`/store/reservas/config`) |

Además, la **portada** (`hero`) gana `buscador: boolean`. En un hotel, el buscador pide llegada, noches y huéspedes y lleva a `/habitaciones` con esos datos. La ficha de la habitación los toma para precargar el panel de solicitud.

Secciones permitidas en hotel: `hero`, `habitaciones`, `servicios`, `imagen-texto`, `testimonios`, `ubicacion`, `politicas`, `faq`, `cinta`, `contacto`, `beneficios`. Topes: una de cada una, salvo `imagen-texto` (3).

### Requisitos

- **H1** Las plantillas `hotel-boutique` y `hotel-casa` existen en el catálogo con `tipoNegocio: "hotel"`. El catálogo marca el `tipoNegocio` de cada plantilla y la lista de tipos de sección permitidos por tipo de negocio.
- **H2** Aplicar una plantilla de otro tipo de negocio responde 400 ("Esta plantilla es para otro tipo de negocio").
- **H3** Guardar una estructura con una sección que no corresponde al tipo de la tienda responde 400 y señala la sección.
- **H4** Una tienda `hotel` sin estructura guardada se ve con `hotel-boutique` (con las reglas de copia de siempre). Las tiendas de productos no cambian.
- **H5** Reglas de copia (como R3 de estructura-tienda): `servicios` afirma cosas del negocio y se copia **oculta y como ejemplo**. Los "cercanos" de `ubicacion` también afirman cosas (distancias), así que la plantilla no trae ninguno. `habitaciones` y `politicas` muestran datos reales y se copian visibles.
- **H6** La tienda dibuja la home del hotel con las secciones del diseño en lugar de la grilla fija. Una sección sin datos no se dibuja: `ubicacion` sin dirección, `politicas` si la configuración no responde y `testimonios` sin reseñas.
- **H7** El botón de la portada de un hotel lleva a `/habitaciones`, no a `/productos`.
- **H8** El buscador de la portada lleva a `/habitaciones?fecha=…&noches=…&adultos=…`. La grilla conserva esos datos en el link de cada habitación y oculta las que no tienen capacidad para esos huéspedes, con un aviso. La ficha precarga fecha, noches y adultos.
- **H9** El admin ofrece en Diseño solo las plantillas y los tipos de sección del tipo de negocio de la tienda, con formularios para las cuatro secciones nuevas y el interruptor del buscador en la portada.

### Fuera de la fase 1

- Opciones de la **ficha de habitación** y **esquema del admin**: fase 1b (abajo).
- Disponibilidad real en el buscador. El hotel sigue confirmando (mini booking R2.6).

## Fase 1b — Ficha de habitación y esquema del admin

- **B1** `layout.habitacion` = `{ galeria: carrusel|mosaico, servicios, politicas, mapa, otras }`, con defaults (carrusel y todo visible). Como en el detalle de producto (estructura-tienda R5.3), el orden de los bloques es fijo. Casa única trae la galería en mosaico.
- **B2** La ficha de habitación muestra el mapa (si la tienda tiene dirección), hasta 3 otras habitaciones y, en el celular, una barra fija con el total y el botón de solicitud.
- **B3** El admin organiza Diseño como el esquema de la página (patrón del editor de temas de Shopify): un selector **Inicio / Ficha** y, en Inicio, los grupos **Estilo**, **Encabezado** (barra de anuncios con su interruptor y posición del logo), **Página de inicio** (portada fija + secciones con ↑↓ e interruptor) y **Pie** (informativo: se arma con los datos de la tienda). En el celular, tocar una fila abre su detalle a pantalla completa con "‹ Esquema"; en escritorio, el detalle va a la derecha. `?tab=` sigue funcionando para la Guía (`anuncio`, `inicio` = portada) y suma `apariencia`, `encabezado`, `seccion` (con `?s=<id>`) y `pie`.

## Fase 2 — Tours

- **T1** Plantillas `tours-catalogo` (buscador, tours con precio desde y duración, por qué viajar con nosotros, reseñas, preguntas, políticas) y `tours-operador` (portada sin buscador, quiénes somos, tours en carrusel, ubicación). Una agencia sin estructura se ve con el Catálogo.
- **T2** Sección `tours` (grilla o carrusel, límite). Servicios, ubicación y políticas se comparten con hotel; servicios suma íconos de agencia (guía, grupo, seguro, fechas, idiomas). Políticas no muestra check-in/check-out fuera de un hotel.
- **T3** Servicios y preguntas de la plantilla se copian ocultos y como ejemplo (H5).
- **T4** `layout.tour` = `{ galeria: carrusel|mosaico, itinerario, incluye, otros }`. Duración, días de salida, punto de encuentro, requisitos y el panel de solicitud se muestran siempre.
- **T5** El buscador de la portada pide fecha y personas y lleva a `/tours?fecha&personas`: la grilla muestra los tours que salen ese día de la semana y aceptan esa cantidad (las fechas cerradas las descarta la ficha). La ficha precarga las personas en el primer tipo de pasajero.

## Decisiones

| Decisión | Por qué | Alternativa descartada |
|---|---|---|
| Mismos `estructura` y editor para todos los tipos de negocio | El copiado, el deshacer, la migración y el editor ya están probados | Un editor de diseño por vertical |
| `tipoNegocio` en la plantilla y validación por tipo en el backend | El backend manda; el admin solo filtra | Confiar en que el admin no ofrezca tipos ajenos |
| `servicios` como sección nueva, no ampliar `beneficios` | Los íconos de hotel (wifi, desayuno, cochera) no son los de una tienda (envío, cambios), y un hotel muestra de 6 a 12, no de 2 a 4 | Más íconos en `beneficios` |
| `politicas` lee la configuración de reservas | Ya existe y es la que vale para la solicitud; dos textos se desincronizarían | Texto libre en la sección |
| Mapa con el embed público de Google Maps (`maps?q=…&output=embed`) | Sin API key ni costo, y la tienda no tiene coordenadas | Mapa con API key o Leaflet + geocodificación |
