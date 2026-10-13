# Plantillas estándar por rubro: análisis de datos y componentes

Estado: **para evaluar**, sin implementar.
Diseños: lienzo "Plantillas estándar por rubro" (claude.ai/artifact/VUn82KP1ALcqC2HLzv7Gpk), páginas Móvil y Desktop.
Alcance: FrontendStore (pantallas) y BackendNode (datos). El admin solo entra donde haga falta cargar un dato nuevo.

Cómo se hizo: se compararon los campos de cada pantalla del lienzo con `src/app/models/reserva.model.ts`, `producto.model.ts`, `tienda.model.ts`, los endpoints de `ReservasService`, y con búsquedas en las plantillas de `features/reservas` y en `BackendNode` (`prisma/schema.prisma`, `modules`). Lo marcado "por confirmar" no se abrió en detalle.

---

## 1. Análisis de datos

Estados:

- **Hay**: existe en la API y la pantalla lo muestra.
- **Hay, sin mostrar**: llega al storefront y ninguna pantalla lo dibuja.
- **Parcial**: existe una parte.
- **Falta**: no existe en BD ni en la API.

### 1.1 Comunes a los rubros de reserva

| Dato del diseño | Fuente | Estado |
|---|---|---|
| Resumen de precio: líneas, total, a pagar ahora, saldo | `Cotizacion` (`POST cotizar`): `lineas`, `total`, `montoAPagar`, `saldoDestino` | Hay |
| Política de cancelación, instrucciones, check-in/out | `ConfigReservasPublica` | Hay |
| Rating en la ficha | `rating` en `Habitacion`, `Tour`, `Salon`, `Cancha` | Hay, sin mostrar (solo la grilla de tours lo dibuja) |
| Reseñas en otros sitios | `config.resenasExternas` | Hay (hotel y tours) |
| Código, estado y link de seguimiento | `ReservaSeguimiento` | Hay |
| "Te guardamos X minutos" | `apartadoHasta`, `config.apartadoManualMin` | Hay |
| Agregar al calendario | `inicio` / `fin` de la reserva | Hay el dato; falta la acción (archivo `.ics`, solo front) |
| Pago con tarjeta al instante | Culqi en `modules/pagos/pasarela` | Por confirmar si cubre reservas. Hoy las reservas van por `modoConfirmacion` (solicitud o pago directo con captura) |

### 1.2 Productos

| Dato del diseño | Fuente | Estado |
|---|---|---|
| Filtros de categoría, marca, precio, orden | `catalog-page` | Hay |
| Filtro por talla / color | `opciones` / `variantes` del producto | Falta: el listado no filtra por valor de opción |
| Envío y plazo en la ficha | métodos de envío, `envioGratisMinimo` | Hay. Por confirmar el plazo por método |
| Cambios y devoluciones | ficha y pie | Hay |
| Carrito lateral | `mini-carrito-capa` | Hay |
| Seguimiento del pedido | `/rastrear` | Hay |

### 1.3 Hotel

| Dato del diseño | Fuente | Estado |
|---|---|---|
| Buscador de fechas y huéspedes | `buscador-hotel`, `?fecha&noches&adultos` | Hay |
| Total de la estadía en el listado | `cotizar` por habitación | Parcial: la ficha da el total, el listado muestra "desde". Se puede calcular en el front (modalidad × noches) o pedir un cotizar por lote |
| "Quedan N" | `Cotizacion.quedan`, `getDisponibilidad` | Hay |
| Extras, planes de tarifa, temporadas | `TarifasHotel` | Hay |
| Check-in en línea | — | Falta |
| Cambiar fechas desde la reserva | — | Falta (solo `puedeCancelar`) |
| Pagar el saldo antes de llegar | `saldoDestino`, subir captura | Parcial: no hay flujo para adelantar el saldo |

### 1.4 Tours

| Dato del diseño | Fuente | Estado |
|---|---|---|
| Itinerario, incluye / no incluye, qué llevar, requisitos, edad mínima, idiomas, recojo, video | `Tour` | Hay |
| Precio por tipo de viajero | `tiposPasajero` | Hay |
| Punto de encuentro con mapa | `puntoEncuentro` (texto) | Parcial: falta `mapaUrl`. Eventos ya lo tiene: copiar ese patrón |
| Dificultad | — | Falta |
| Filtros del listado (duración, dificultad, incluye) | `buscador-tours` filtra fecha y personas; `duracionHoras` existe | Parcial |
| Cupos por horario en el calendario | solo al cotizar (`quedan`) | Falta endpoint de cupos por fecha y hora. Hoy la agencia confirma |
| Voucher con QR | código de reserva | Parcial: hay código, no QR |

### 1.5 Eventos

| Dato del diseño | Fuente | Estado |
|---|---|---|
| Funciones, tipos de entrada, estado, "quedan", máximo por compra | `Evento`, `EventoFuncion`, `EventoTipoEntrada` | Hay |
| Lugar, dirección, mapa, organizador, edad mínima | `Evento` | Hay |
| Filtro por fecha (hoy, fin de semana) | `buscador-eventos` | Hay |
| Cargo por servicio | — | No aplica: no se cobra, el total es la suma |
| Entrada con QR por persona y validación en la puerta | — | Falta. El QR del seguimiento es para pagar |
| Transferir una entrada | — | Falta |

### 1.6 Locales

| Dato del diseño | Fuente | Estado |
|---|---|---|
| Turnos, paquetes, precios por día | `Salon.turnos`, `Salon.paquetes` | Hay |
| Calendario por turno | `getCalendarioSalon` → `FechaCalendario` | Hay |
| Cotizador, cotización por link | `cotizar`, `guardarCotizacion` | Hay (PDF por confirmar) |
| Plan de pagos, contrato, garantía | `ReservaLocal` | Hay |
| Aforo banquete / cóctel | `aforoMaximo` | Parcial: un solo aforo |
| Disponibilidad en el listado para una fecha | — | Falta: el calendario es por salón |
| Plano de distribución | `imagenes`, `video` | Parcial: sin campo propio |

### 1.7 Canchas

| Dato del diseño | Fuente | Estado |
|---|---|---|
| Grilla cancha × hora con tarifa día / noche | `AgendaCanchas`, `precioDia` / `precioNoche` | Hay |
| Duraciones | `config.canchaDuraciones` | Hay |
| Adelanto o total | `cobro`, `adelantoPct` | Hay |
| Reserva fija semanal, liga | `fijo-semanal`, `liga-canchas` | Hay (por confirmar si la fija es solicitud por WhatsApp) |
| Extras (pelota, chalecos) | — | Falta |
| Pago dividido entre jugadores | — | Falta |
| Volver a reservar | historial de la cuenta | Parcial: hay historial, falta la acción |

---

## 2. Análisis de componentes

### 2.1 Qué se repite hoy

- **Armazón de ficha.** Las 5 fichas de reserva (tour, habitación, evento, salón, cancha) arman a mano el mismo esqueleto: `app-product-gallery`, secciones, `<aside class="lg:sticky">` con el panel y barra fija en el celular.
- **Calendario.** Hay 3 calendarios de mes: `hotel/calendario-estadia`, uno dentro de `salon-page.html` y otro dentro de `tour-page.html`.
- **Contadores por tipo.** Pasajeros, entradas y huéspedes se dibujan a mano en cada ficha. `shared/quantity-selector` solo lo usa comercio.
- **Resumen de precio.** Líneas, total, "a pagar ahora" y saldo se repiten en cada panel, en `solicitud-page` y en `seguimiento-page`.
- **Filtros de comercio.** `catalog-page` (aside más bottom sheet) y `category-page` (aside propio) los duplican.

### 2.2 Propuesta

| # | Pieza | Patrón | Reemplaza / sirve a |
|---|---|---|---|
| 1 | `app-ficha-reserva` (shared) | **Template Method con slots**: fija el esqueleto (migas, galería, cabecera, cuerpo, panel fijo en desktop, barra fija en celular) y cada ficha llena los huecos con `ng-content select="[cabecera] [cuerpo] [panel] [barra]"` | Armazón de las 5 fichas |
| 2 | `app-calendario-mes` + `EstrategiaCalendario` | **Strategy**: el componente dibuja el mes, navega y emite la selección. La estrategia dice cada día (`habilitado`, `marca`: libre/parcial/ocupado/cerrado, `nota`) y el modo (`dia` o `rango`). Estrategias en `negocio/<rubro>/`: salidas de tour, estadía de hotel (reusa `calendario-estadia.ts`), turnos de local, funciones de evento | Los 3 calendarios |
| 3 | `app-selector-cantidades` | **Composite**: lista de `{id, nombre, precio, max, nota}`, con un `app-quantity-selector` por fila y el total | Pasajeros, entradas, huéspedes, extras de cancha |
| 4 | `app-resumen-cotizacion` | Presentacional puro: recibe `Cotizacion` o las líneas de `ReservaSeguimiento` | Panel de cada ficha, solicitud, seguimiento |
| 5 | `datosClave()` por rubro + `app-datos-clave` | **Adapter**: cada rubro convierte su ítem en `{icono, texto}[]` ("10 h", "Salida 7:00"…). El adaptador vive en `negocio/<rubro>/` y el componente no pregunta por el rubro (regla capacidades, no identidad) | Fila de datos de ficha y tarjetas |
| 6 | `app-pase-qr` + utilidad `.ics` | Presentacional + función pura | Seguimiento: voucher de tour, entradas de evento, "agregar al calendario" |
| 7 | `app-filtros-catalogo` + `FiltroDef[]` | **Strategy / declarativo**: cada filtro es una definición (categoría, marca, precio, opción). Agregar talla/color es agregar una definición cuando el backend filtre por opción | `catalog-page` y `category-page` |

**Abstract Factory (`UiNegocio`).** No necesita piezas nuevas: estas pantallas son rutas de un solo rubro. Solo hace falta una pieza en `PiezasUi` si cambia algo de un componente compartido, por ejemplo la home o el header con el buscador horizontal en desktop. En ese caso va en las dos familias.

**Qué no crear:**

- Una "ficha genérica" que reciba el tipo y decida qué mostrar. Sería un `switch` por rubro escondido y rompe la regla de capacidades.
- Rehacer `checkout-page` (2146 líneas) en esta etapa.

---

## 3. Orden propuesto

| Fase | Contenido | Repos |
|---|---|---|
| 1 | Solo front, con datos que ya existen: piezas 2, 3, 4 y luego 1. Mostrar el rating en las fichas. "Agregar al calendario" | Store |
| 2 | Datos chicos: `mapaUrl` del punto de encuentro de tours, dificultad, filtros del listado de tours, extras de canchas, aforo cóctel | Back, Admin, Store |
| 3 | Funcionalidades: entradas con QR y validación en la puerta, check-in en línea, cambiar fechas, pago dividido, filtro por talla/color, disponibilidad de salones por fecha en el listado, pago con tarjeta en reservas | Back, Admin, Store |

## 4. Decisiones (2026-10-13)

1. **Pago**: cada tienda elige manual o automático. El proveedor lo decide la plataforma (empieza con Culqi) y no se muestra. Para probar hay un simulador. Ver [pago-automatico/spec.md](../pago-automatico/spec.md).
2. **Fase 1**: primero el refactor sin cambio visual y después el rediseño.
3. **Orden**: el que menos rehace trabajo.

## 5. Hoja de ruta

Cada etapa queda probada antes de pasar a la siguiente. Las que dependen de otra van después.

| Etapa | Qué | Depende de | Repos |
|---|---|---|---|
| **E1** | Pago automático en el backend: `modo_pago`, simulador, destinos de pago (pedido, reserva, cuota), cobro de reservas, webhook | — | Back |
| **E2** | Fase 1, refactor sin cambio visual: `app-calendario-mes`, `app-selector-cantidades`, `app-resumen-cotizacion`, `app-ficha-reserva`, `datosClave()` | — | Store |
| **E3** | Pago automático en pantallas: componente de pago (Strategy de cliente: simulador, Culqi) en el seguimiento de reservas y el checkout, más el ajuste "Cobros" en el admin | E1, E2 | Store, Admin |
| **E4** | Rediseño visual con las plantillas (móvil y desktop) sobre las piezas de E2. Mostrar rating y "agregar al calendario" | E2 | Store |
| **E5** | Datos chicos (Fase 2): mapa del punto de encuentro, dificultad, filtros de tours, extras de canchas, aforo cóctel | E4 | Back, Admin, Store |
| **E6** | Entradas con QR por persona y validación en la puerta | E1, E3 | Back, Admin, Store |
| **E7** | Pago dividido de canchas | E1, E3 | Back, Store |
| **E8** | Hotel: pagar el saldo antes, cambiar fechas, check-in en línea | E3 | Back, Admin, Store |
| **E9** | Productos: filtro por talla y color. Locales: disponibilidad por fecha en el listado | E4 | Back, Store |
