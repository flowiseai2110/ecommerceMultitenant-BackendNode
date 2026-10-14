# Plantillas estándar por rubro: mapeo pantalla por pantalla

Estado: **para revisar con el usuario**, sin implementar.
Objetivo: que los 6 flujos del lienzo "Plantillas estándar por rubro" (claude.ai/artifact/VUn82KP1ALcqC2HLzv7Gpk) se vean igual en el FrontStore, en móvil y en desktop. Las plantillas de Admin › Diseño se arman después, cuando las pantallas existan.

Cómo se hizo (2026-10-13): capturas de la tienda local (`localhost:4200`) a 390 px y 1440 px con Playwright, en las demos `zapatillas`, `killa-hostal`, `tour-test`, `evento-test`, `casa-alborada` y `los-cedros`, comparadas con los 12 tableros del lienzo.

No se pudo ver en vivo:

- la confirmación de hotel, locales y canchas, porque esas demos no tienen reservas: se revisó `seguimiento-page` con un tour y un evento;
- el checkout en móvil, porque falló agregar al carrito desde el script;
- un producto con variantes, porque la demo no tiene ninguno con talla o color.

Decisión por pantalla:

- **Reusar**: ya se ve como el prototipo o la diferencia es solo de plantilla (secciones de la home, colores, tipografía).
- **Ajustar**: el componente existe y cambia su estructura.
- **Nuevo**: hay que crear el componente.

---

## 1. Componentes compartidos

Muchas diferencias se repiten en varios rubros. Conviene resolverlas una vez, antes de ir rubro por rubro.

| # | Pieza | Qué hace en el prototipo | Hoy | Decisión | Rubros |
|---|---|---|---|---|---|
| C1 | `app-checkout-reserva` | Datos y pago en secciones numeradas (1. datos, 2. extras o recojo, 3. pago). En desktop, resumen fijo a la derecha con el botón "Pagar S/ X"; en móvil, paso "2/2" con barra fija | `solicitud-page`: una columna, resumen arriba, formulario de titular completo y "Enviar solicitud" | **Nuevo** (armazón) + **ajustar** `solicitud-page` para usarlo. Reusa `app-resumen-cotizacion` | Hotel, tours, eventos, locales, canchas |
| C2 | `app-confirmacion-reserva` | Ícono de check, saludo con el nombre ("¡Te esperamos, Ana!"), código grande, 2 o 3 datos clave (llegada, recojo, turno), acciones (WhatsApp, calendario, mapa, compartir) | `seguimiento-page`: tarjeta con código y estado, más una tabla de detalle | **Nuevo** (cabecera) + **ajustar** `seguimiento-page`. Reusa `calendario-ics`, `entrada-qr` y `pago-en-linea` | Los 5 de reserva |
| C3 | `app-tarjeta-fila` | Listado en filas: foto a la izquierda; datos, rating y "cancelación gratis" al centro; precio total y botón a la derecha | Grillas de tarjetas verticales con "Desde S/ X" | **Nuevo** | Hotel, tours, eventos, locales |
| C4 | `app-resumen-busqueda` | Barra sobre el listado con lo buscado ("vie 13 nov → dom 15 nov · 2 adultos · Cambiar búsqueda", "N tours disponibles el vie 13 nov") | No existe: el listado no muestra lo buscado | **Nuevo** | Hotel, tours, locales, eventos |
| C5 | Filtros: lateral en desktop, chips en móvil | Sidebar con grupos (talla, color, precio; cama; duración, dificultad) y chips de filtros activos | `app-filtro-opciones` existe, pero solo aparece con facetas. `/categorias` muestra solo categorías y `/tours` no muestra filtros | **Ajustar** `app-filtro-opciones` para que sirva a todos los listados | Productos, hotel, tours, locales, eventos (chips) |
| C6 | `app-galeria-mosaico` | Desktop: foto grande + 4 chicas ("+ 5 fotos"). Móvil: carrusel con "1 / 8" | `app-product-gallery` (foto + miniaturas) en todas las fichas | **Nuevo** (desktop). El móvil se reusa | Hotel, tours, locales, productos |
| C7 | `app-apartado-contador` | "Te guardamos las entradas 09:42" / "Turno guardado para ti 04:58" arriba del pago | El contador solo está dentro de `seguimiento-page` | **Nuevo** (sale de `seguimiento-page`) | Eventos, canchas |
| C8 | `app-opciones-pago` | Tarjetas para elegir cuánto pagar: adelanto 50 % / total / dividir entre jugadores, con el monto de cada una | El monto lo fija la tienda (`cobro`, `adelantoPct`); dividir solo está en el seguimiento (E7) | **Nuevo** | Hotel, canchas |
| C9 | `app-hoja-paso` (móvil) | El paso intermedio a pantalla completa: "Elige tu fecha 1/2", "Entradas 1/2", "Tu turno 1/2", "Cotiza tu evento 1/2" | En móvil el panel queda debajo de la ficha y una barra fija lleva hasta él | **Nuevo** | Tours, eventos, locales, canchas, hotel |
| C10 | Header de reserva | Enlaces de secciones (Habitaciones, Servicios, Ubicación…), "ES · S/" y botón principal ("Reservar", "Cotizar", "Mis entradas") | Buscador ancho + barra de categorías. Canchas ya tiene botón "Reservar" | **Ajustar** con las piezas `headerAcciones` y `headerBeneficios` de la familia reserva | Los 5 de reserva |

---

## 2. Por rubro

### 2.1 Productos

| # | Pantalla | Diferencia con el prototipo | Decisión | Pieza |
|---|---|---|---|---|
| 1 | Inicio | Móvil: buscador, banner "Nueva colección", categorías en círculos, más vendidos. Desktop: hero dividido (texto + foto de campaña), 6 categorías, más vendidos. Hoy: hero de foto completa y "La nueva colección" | Reusar | Secciones `hero` (variante `dividido`), `categorias` (`circulos`), `productos` → en la plantilla |
| 2 | Categoría | Desktop: filtros laterales (talla, color, precio, "solo con descuento"), chips de filtros activos ("Talla M ×") y orden. Móvil: chips "Filtros · 2 · Talla · Color · Precio". Hoy: el lateral solo tiene categorías. La tarjeta no muestra "4 colores" | Ajustar | C5 + tarjeta de producto ("N colores", "Envío gratis") |
| 3 | Producto | Falta el rating junto al precio, muestras de color circulares, chips de talla con la agotada tachada, "Guía de tallas" y el bloque de envío, recojo y cambios a la vista (hoy son acordeones). Desktop: galería con zoom | Ajustar | Ficha de producto + C6. Verificar con un producto con variantes |
| 4 | Carrito | Desktop: al agregar se abre el **panel lateral** con "Agregado: …", "Combina con", "Ir a pagar" y "Seguir comprando". Hoy sale un aviso en la ficha y el panel (`mini-carrito-capa`) solo abre con el ícono. Móvil: página con cupón y "Envío: se calcula en el checkout" | Ajustar + Nuevo | Abrir `mini-carrito-capa` al agregar + **`app-combina-con`** (usa los relacionados) |
| 5 | Checkout | Prototipo: **una página** con 1. Contacto, 2. Entrega, 3. Pago y comprobante (tarjeta en línea, boleta/factura), resumen fijo a la derecha. Hoy: 3 pasos (Tu pedido → Pago → Confirmar) con resumen a la derecha | Ajustar (grande) | `checkout-page` (2188 líneas). Ver decisión D2 |
| 6 | Confirmación | Gracias + pedido #, barra de seguimiento de 3 estados (Recibido · En camino · Entregado, con fecha estimada), detalle y "Entrega en" | Ajustar | Paso final de `checkout-page` + `/rastrear` |

Componentes propios: **1 nuevo** (`app-combina-con`), 5 ajustes.

### 2.2 Hotel

| # | Pantalla | Diferencia con el prototipo | Decisión | Pieza |
|---|---|---|---|---|
| 1 | Inicio | El buscador pide **Llegada / Salida** (hoy pide Noches). En desktop va horizontal sobre la foto. Después vienen 4 tarjetas (desayuno, traslado, terraza, mejor precio). Hoy pasa directo a las habitaciones. Header con menú y "Reservar" | Ajustar | `buscador-hotel` (rango con `calendario-estadia`), sección `servicios` variante tarjetas, C10 |
| 2 | Habitaciones | Barra con las fechas buscadas, filtros (cama, incluye) y **filas con el total de la estadía** ("S/ 360 total · 2 noches"), cancelación, desayuno, "Quedan 2" y "Elegir". Hoy: grilla con "Desde S/ X / noche", sin fechas ni filtros | Nuevo | C3 + C4 + C5. Dato: total por estadía en el listado |
| 3 | Habitación | Casi igual: galería, datos, servicios, políticas y panel fijo con "Aún no se te cobra nada". Falta la galería en mosaico y la fila de datos con íconos (personas, cama, m²) | Reusar + ajuste chico | C6 |
| 4 | Resumen de estadía (móvil) / "Agrega a tu estadía" (desktop) | Extras (traslado + S/ 40, early check-in + S/ 50) con el desglose | Ajustar | C1 + `app-selector-cantidades` para los extras |
| 5 | Datos y pago | Nombre, documento, país, correo, **hora estimada de llegada** y "Cómo pagar" (adelanto 50 % o total) con el saldo. Hoy: titular completo, sin elección de pago | Ajustar + Nuevo | C1 + C8 |
| 6 | Confirmación / gestionar | Saludo, código, llegada y salida, saldo, WhatsApp, calendario y mapa. Desktop: "Antes de llegar" (check-in en línea, pagar el saldo, traslado), cambiar fechas, cancelar, comprobante | Ajustar | C2 + `antes-de-llegar` (ya existe, E8) |

Componentes propios: **0 nuevos**. Usa C1, C2, C3, C4, C5, C6, C8 y C10.

### 2.3 Tours

| # | Pantalla | Diferencia con el prototipo | Decisión | Pieza |
|---|---|---|---|---|
| 1 | Inicio | Hero con credencial ("Operador autorizado · RUC"), chips de tipo (día completo, trekking…) y "Más reservados" en tarjetas. Hoy: hero con buscador fecha + personas y grilla | Reusar | Secciones de la plantilla. Dato: RUC visible |
| 2 | Listado | Filtros duración, dificultad e incluye (lateral / chips), "N tours disponibles el vie 13 nov", orden, **filas** con rating, "Cancelación gratis 24 h" y "Quedan 3 cupos". Hoy: grilla sin filtros visibles en `/tours` | Nuevo | C3 + C4 + C5. Dato: cupos por salida |
| 3 | Ficha | Datos clave con íconos (duración, salida, recojo, guía), itinerario con horas, incluye / no incluye, mapa del punto de encuentro. Desktop: panel **compacto** ("desde S/ 180 por persona · Fecha · Viajeros · Ver disponibilidad"). Hoy: el panel ya abre con el calendario completo | Ajustar | `tour-page` + C6 |
| 4 | Fecha y viajeros | Calendario, **horario con cupos** ("7:00 · 6 cupos") y viajeros con precio por tipo. Desktop: dentro del panel. Móvil: pantalla aparte | Reusar + Nuevo | `app-calendario-mes` + `app-selector-cantidades` (existen) + C9 en móvil. Dato: cupos |
| 5 | Datos y pago | Viajero principal (pasaporte, nacionalidad, WhatsApp), **hotel para el recojo**, pago con tarjeta, PayPal o Yape, aviso de exoneración del IGV | Ajustar | C1. Dato: hotel de recojo. PayPal no existe |
| 6 | Voucher | "¡Listo, John!", código, hora y lugar del recojo, "Lleva: …", descargar voucher, contactar al guía | Ajustar | C2. "Qué llevar" existe; falta el voucher en PDF |

Componentes propios: **0 nuevos**. Usa C1–C6, C9 y C10.

### 2.4 Eventos

| # | Pantalla | Diferencia con el prototipo | Decisión | Pieza |
|---|---|---|---|---|
| 1 | Inicio · agenda | Tarjeta **Destacado** (afiche, fecha, "Comprar entradas") + "Próximos" con bloque de fecha. Hoy: hero con buscador de fecha + "Próximos" con bloque de fecha (**ya coincide**) | Reusar + Nuevo | **`app-evento-destacado`** (sección de la home) |
| 2 | Eventos por fecha | Chips (Hoy, Este finde, Próxima semana, Elegir fecha, categorías) y **filas** con afiche, fecha, título, lugar y "desde". Hoy: grilla con la fecha sobre la foto y sin chips en el listado | Ajustar | `buscador-eventos` en el listado + C3 |
| 3 | Página del evento | Desktop: panel derecho con fecha, puertas y show, lugar, mapa, "desde S/ 60", "Comprar entradas" y preventa. Cuerpo con "Antes de ir" (edad, sin reingreso, devoluciones). Hoy: el panel ya trae los contadores de entradas | Ajustar | `evento-page`. Dato: hora de puertas |
| 4 | Tipo de entrada | Desktop: **ventana sobre el evento** con entradas, agotado y resumen. Móvil: pantalla "Entradas 1/2" | Nuevo | **`app-ventana-entradas`** (desktop) + C9 (móvil). Reusa `app-selector-cantidades` |
| 5 | Pago | Contador "te guardamos 09:42", "sin crear cuenta", nombre, DNI, correo, tarjeta o Yape, boleta o factura. Hoy: titular completo (nacionalidad, WhatsApp, comentarios) y "Apartar mis entradas y pagar" | Ajustar | C1 + C7. Ver D4 (campos) |
| 6 | Entradas QR | Móvil: **una entrada por vez** ("Desliza para ver la siguiente"), guardar en el celular, transferir. Desktop: entradas lado a lado, PDF, calendario y "El día del evento". Hoy: QR en lista vertical (E6) | Ajustar | `entrada-qr` en carrusel + C2. Falta: transferir, PDF |

Componentes propios: **2 nuevos** (`app-evento-destacado`, `app-ventana-entradas`).

### 2.5 Locales

| # | Pantalla | Diferencia con el prototipo | Decisión | Pieza |
|---|---|---|---|---|
| 1 | Inicio por tipo de evento | Tarjetas "**¿Qué celebras?**" (Quinceañero 80–250 personas, Boda, Infantil, Corporativo). Desktop: buscador tipo / fecha / invitados. Hoy: hero con "Ver salones" y "Contactar" + "Nuestros ambientes" | Nuevo + Reusar | **`app-tipos-evento`** + `buscador-locales` (ya existe, sin commit) |
| 2 | Salones | Barra (fecha, invitados, tipo), chips (al aire libre, cochera), **filas** con banquete, cóctel, m², techado y "Libre: día y noche". Hoy: fecha + grilla "Hasta N personas" | Nuevo | C3 + C4 + C5. Dato: características (aire libre, cochera) |
| 3 | Ficha del salón | Galería con "Recorrido 360°" y "Plano", datos clave (120 banquete · 180 cóctel · 6 h), incluye, **calendario de disponibilidad** con leyenda (día y noche / un turno / ocupado), turnos del día y "Cotizar mi evento". Hoy: el panel mezcla cotizador y calendario | Ajustar | `salon-page`: la disponibilidad queda en la ficha y el cotizador pasa a la pantalla 4. Reusa `app-calendario-mes` |
| 4 | Cotización | Fecha y turno, invitados, tipo; **paquetes como tarjetas** ("Elegido" / "+ Agregar", buffet por persona, DJ, decoración), total en vivo a la derecha, "Separas con el 30 %", PDF | Nuevo | **`app-opcion-paquete`** + pantalla de cotización (base: `cotizacion-page`). Dato: sumar varios paquetes; PDF |
| 5 | Separación | Responsable, DNI, celular, agasajada; **plan de pagos** con fechas (separación 30 %, 2.° pago, saldo); medio de pago; "la fecha queda bloqueada 48 h" | Ajustar + Nuevo | C1 + **`app-plan-pagos`** |
| 6 | Confirmación y cronograma | "¡El 21 de noviembre es tuyo!", siguientes pasos, coordinadora, contrato, cronograma con estados y "Pagar siguiente cuota" | Ajustar | C2 + `app-plan-pagos` (con estados) + `pago-en-linea` |

Componentes propios: **3 nuevos** (`app-tipos-evento`, `app-opcion-paquete`, `app-plan-pagos`).

### 2.6 Canchas

| # | Pantalla | Diferencia con el prototipo | Decisión | Pieza |
|---|---|---|---|---|
| 1 | Inicio | "Reserva tu cancha en 1 minuto", **deporte** (Fútbol 7, Pádel, Vóley) + **día** en chips + "Ver horarios libres". Desktop: tarifas día/noche, liga (top 3) y mapa. Hoy: hero grande, "Tres pasos y a jugar" y reservador | Ajustar + Nuevo | **`app-selector-deporte-dia`** + `liga-canchas` (existe). Dato: deporte |
| 2 | Grilla de horarios | **Grilla cancha × hora** con todas las canchas, precio en cada celda libre, "—" en las ocupadas, leyenda y nota de tarifa nocturna. Desktop: entra completa sin scroll lateral. Hoy: se elige una cancha y después la hora | Nuevo | **`app-grilla-canchas`** (datos de `AgendaCanchas`, ya existen) |
| 3 | Turno y duración | Desktop: **panel a la derecha de la grilla** (duración, extras, política, total, "Reservar"); una celda contigua alarga el turno. Móvil: pantalla aparte con foto de la cancha. Hoy: el panel "Tu reserva" ya está a la derecha, con duración y extras | Reusar + ajuste | `reservador` conectado a la grilla + C9 (móvil) |
| 4 | Datos y pago | "Turno guardado 04:58", nombre, celular, **¿cuánto pagas ahora?** (adelanto / total / dividir entre jugadores), Yape o tarjeta. Hoy: titular completo y "Continuar al pago"; dividir está en el seguimiento | Ajustar | C1 + C7 + C8 |
| 5 | Confirmación | "¡Cancha reservada!", turno, código, pagado / saldo, mapa, "Muestra el código en recepción", **compartir con el equipo**, calendario | Ajustar | C2 (con compartir) |
| 6 | Mis reservas | Próximas / pasadas, cambiar horario, cancelar, **volver a reservar**, reserva fija semanal | Ajustar | `historial-reservas` + `fijo-semanal` (existe). Falta: cambiar horario y volver a reservar |

Componentes propios: **2 nuevos** (`app-selector-deporte-dia`, `app-grilla-canchas`).

---

## 3. Totales

| | Nuevos | Ajustes | Reuso |
|---|---|---|---|
| Compartidos (C1–C10) | 8 (C1, C2, C3, C4, C6, C7, C8, C9) | 2 (C5, C10) | — |
| Productos | 1 | 5 | 1 |
| Hotel | 0 | 4 | 1 |
| Tours | 0 | 3 | 2 |
| Eventos | 2 | 4 | 1 |
| Locales | 3 | 3 | 1 |
| Canchas | 2 | 4 | 1 |
| **Total** | **16** | **25** | |

Orden propuesto: primero C1, C2 y C3 (casi todos los rubros los usan), después un rubro piloto completo en móvil y desktop, y luego los demás.

---

## 4. Datos que faltan

Sin estos datos la pantalla se puede dibujar, pero sin esa parte. Cada uno es una decisión: entra o se quita del prototipo.

| Rubro | Dato | Estado |
|---|---|---|
| Hotel | Metros cuadrados de la habitación (listado y ficha: "18 m²") | **Descartado** (2026-10-13): no se muestra ni se guarda |
| Hotel | Total de la estadía en el listado | Parcial: hoy solo la ficha cotiza; hace falta cotizar por lote o calcularlo en el front |
| Hotel, canchas | El cliente elige adelanto o total | Falta: hoy lo fija la tienda |
| Tours | Cupos por horario en el calendario | Falta endpoint (ya estaba en el análisis) |
| Tours | Hotel para el recojo en la reserva | Por confirmar |
| Tours | PayPal | No existe (solo Culqi o simulador) |
| Tours, eventos | Voucher / entradas en PDF, guardar en el celular | Falta |
| Eventos | Hora de puertas | Por confirmar |
| Eventos | Transferir una entrada | Falta |
| Eventos | Cargo por servicio | No aplica (no se cobra) |
| Locales | Rango de invitados por tipo de evento | Falta (se puede derivar del aforo de los salones) |
| Locales | Características (al aire libre, cochera, techado) | Por confirmar |
| Locales | Plano y recorrido 360° | Parcial: sin campo propio |
| Locales | Sumar varios paquetes (buffet + DJ) | Por confirmar: hoy un paquete por reserva |
| Locales | Cotización en PDF | Falta |
| Canchas | Deporte (pádel, vóley), no solo formato de fútbol | Falta |
| Canchas | Cambiar horario y volver a reservar | Falta |

---

## 5. Decisiones para el usuario

1. **D1 · Pago en la pantalla de datos.** En el prototipo se paga ahí ("Pagar S/ 180"). Hoy, en modo solicitud, primero confirma el negocio y se paga después en el seguimiento. Propuesta: con pago directo se paga en esa pantalla. Con solicitud se ve igual, pero el botón dice "Enviar solicitud".
2. **D2 · Checkout de productos en una página.** Implica rehacer `checkout-page` (2188 líneas). La alternativa es mantener los 3 pasos y ajustar solo el aspecto.
3. **D3 · Datos faltantes (§4).** Cuáles entran ahora y cuáles se quitan del diseño.
4. **D4 · Campos del formulario.** El prototipo pide menos campos: en eventos, nombre, DNI y correo; en canchas, nombre y celular. Hoy todos piden el titular completo (documento, nacionalidad, WhatsApp, correo). En hotel el documento hace falta para el registro de huéspedes.
5. **D5 · Rubro piloto.** Propuesta: **hotel**, que no necesita componentes propios y estrena C1, C2, C3, C4 y C6.

---

## 6. Avance

Decisiones tomadas por defecto (2026-10-13, el usuario pidió empezar sin elegir): D1 como la propuesta, D3 sin datos nuevos, D4 sin cambios en hotel, D5 hotel como piloto. D2 sigue pendiente.

**Piloto hotel (sin commit):**

- [x] C3 `app-tarjeta-fila` y C4 `app-resumen-busqueda` (`features/reservas/compartido/`).
- [x] C5: se reusa `app-filtro-opciones` tal cual (en el celular, una fila con scroll).
- [x] 2.2-1 buscador con Llegada / Salida (para todas las plantillas de hotel).
- [x] 2.2-2 `/habitaciones` en filas con el total de la estadía: opción de layout `habitacion.listado = 'grilla' | 'filas'` (backend, tienda y Admin › Diseño). `hotel-estandar` usa `filas`; las demás plantillas siguen en grilla.
- [x] C1 `solicitud-page`: formulario a la izquierda y resumen fijo a la derecha con desglose, total, "Pagas ahora / Pagas al llegar" y el botón. Para **todos** los rubros de reserva.
- [x] C2 `app-confirmacion-reserva` en `seguimiento-page` cuando la reserva está confirmada. El saludo es `PerfilReserva.confirmada` por rubro (fijado en `perfiles.spec.ts`). Para todos los rubros de reserva.
- [x] **Parte 1 · Inicio** (2026-10-13). Tres opciones nuevas que prende `hotel-estandar` (backend, tienda y Admin › Diseño):
  - C10 header `layout.header.navegacion = 'buscador' | 'secciones'`: enlaces a la vitrina y a las secciones de la home (Servicios, Ubicación, Contacto, si están) y el botón `perfil.vitrina.accion` ("Reservar"); sin buscador ni barra de categorías. En el celular: ☰ a la izquierda, nombre e idioma; la cuenta va en el menú.
  - Hero `buscador-abajo`: foto de 210 / 330 px y el buscador montado sobre su borde. El buscador de hotel tiene forma `barra` (etiqueta dentro del campo; en desktop una fila con divisores) y huéspedes como "2 adultos".
  - Servicios `franja`: chips en el celular, 4 columnas con detalle (`items[].texto`, nuevo y opcional) en desktop.
  - Para todas las tiendas: el header ya no desborda a 390 px (el nombre se encoge; con logo, el nombre ya no aparece por `line-clamp`) y las anclas quedan debajo del header fijo (`ViewportScroller.setOffset`).
  - Diferencias que quedan: sin "Mejor precio reservando aquí" (es una afirmación del negocio, R3.5); sin "1 habitación" en huéspedes (se reserva una a la vez); "ES · S/" sigue siendo el selector ES / EN; en desktop se mantiene el ícono de la cuenta.
- [x] **Parte 2 · Habitaciones** (2026-10-13), solo tienda:
  - C4 `app-resumen-busqueda` a todo el ancho: en desktop, franja gris con chips ("vie 13 nov → dom 15 nov", "2 adultos"), "2 noches" y "Cambiar búsqueda" con borde; en el celular, barra con volver, "13 – 15 nov / 2 noches · 2 adultos" y lápiz. Abre el buscador en forma barra. El título "Habitaciones" queda para lectores de pantalla.
  - C5 filtros "Cama" e "Incluye": casillas al costado en desktop (`app-filtro-opciones forma="casillas"`), chips con scroll en el celular. La cama se clasifica del texto libre (`hotel/camas.ts`: matrimonial, camas separadas, camarote).
  - Filas: "cama · personas · lo que incluye" en una línea, cancelación en verde y "Quedan N" en rojo en la columna de datos; en el celular, foto de 128 px.
  - Diferencias que quedan: sin m² (descartado por el usuario); el celular conserva los chips de filtro y el header de la tienda arriba de la barra.
  - Precios sin decimales cuando el monto es exacto ("S/ 220"; con céntimos, "S/ 49.90"), en toda la tienda: `soles()`, `currencyFormat` y el checkout.
- [x] **Parte 3 · Habitación** (2026-10-13), solo tienda:
  - Mosaico (`habitacion.galeria = 'mosaico'`) a todo el ancho arriba en desktop, adaptable: 1 foto ancha, 2 a la mitad, o la grande con hasta 4 chicas y "+ N fotos". En el celular, el carrusel. El armazón `app-ficha-reserva` suma el hueco `[arriba]`.
  - Desktop: nombre, una línea de datos (personas · cama · lo que incluye), chips. Celular: casillas de personas y cama (sin m², descartado) y la etiqueta "Incluye".
  - Horarios y Cancelación en dos tarjetas (resumen de la política y el resto debajo); con eso el panel ya no repite la política (salvo tarifa no reembolsable o si el diseño oculta las políticas). Vale para todas las plantillas de hotel.
  - Diferencias que quedan: la descripción y la calificación se mantienen (el prototipo no las muestra); en el celular el panel de fechas sigue debajo de la ficha (el prototipo lo lleva a "Tu estadía 1/2", parte 4); el panel no sube sobre el mosaico.
- [x] **Parte 4 · Datos y pago** (2026-10-13), backend, tienda y admin:
  - Desktop: secciones numeradas (1. titular con el título del rubro, 2. "Agrega a tu estadía" con los extras del hotel como tarjetas y la hora estimada de llegada, 3. "Cómo pagar") y el resumen a la derecha con la foto, el total, "Pagas ahora / al llegar", el botón ("Pagar S/ 220", "Confirmar reserva" si se paga al llegar) y la cancelación. Campos con la etiqueta adentro.
  - Celular en dos pasos (C9): "Tu estadía 1/2" (resumen, extras y total, "Continuar") y "Datos y pago 2/2".
  - Header de pago: el nombre y "Pago seguro", sin menú, barra inferior ni asesor (route data `pagoSeguro`).
  - C8: `config_reservas.cobro_eleccion` (Admin › Reservas: "El cliente elige"); la cotización devuelve `opcionesPago` y recibe `pago`.
  - Formulario configurable por tienda (nivel 1): `modules/reservas/formulario.js`, defaults por rubro en `negocio/<rubro>/datos.js` (`formularioReserva`), `config_reservas.campos_formulario` y la sección "Formulario de reserva" en Admin › Reservas. Fijos: nombres, apellidos, correo y celular. Hotel por defecto: documento y nacionalidad obligatorios, hora de llegada y comentarios opcionales, fecha de nacimiento no (va en el check-in, como Booking; Reglamento de Hospedaje art. 26: el registro es antes de ocupar la habitación).
  - `reservas.hora_llegada` (se ve en el detalle del admin); documento y nacionalidad del titular pasan a nullable.
  - SQL: `docs/sql/formulario_reserva.sql` (después de `apartado_en_linea.sql`).
  - Diferencias que quedan: nombres y apellidos separados (el prototipo tiene "Nombre completo"); el pago con tarjeta sigue en la pantalla siguiente (D1: el botón dice "Pagar S/ X" y lleva al pago en línea); factura y consentimiento debajo del formulario; el pie de la tienda sigue visible.
- [ ] Nivel 2 del formulario: preguntas propias del negocio (sí/no, opciones, texto). Pendiente.
- [x] **Parte 5 · Confirmación y gestionar reserva** (2026-10-13), tienda y backend. Probado con una reserva real de prueba en killa-hostal (PED-0002, Ana Prueba, prueba.killa@yopmail.com, 13–15 nov, triple): nació confirmada al instante y la habitación quedó agotada para esas fechas.
  - C2 `app-confirmacion-reserva`: en desktop, saludo, "Código · Confirmación enviada a a••@correo.com", tarjetas Llegada / Salida / Saldo al llegar, WhatsApp y calendario, y el mapa embebido a la derecha; en el celular, centrado, el código grande, los datos en filas y el mapa debajo. El backend manda `correo` enmascarado.
  - Gestionar: "Tu reserva" (foto, estadía, fechas, personas, pagado y saldo, estado), "Antes de llegar" en tarjetas que abren su formulario (check-in con la hora de llegada precargada, pagar el saldo) y los enlaces Cambiar fechas · Cancelar reserva · Descargar comprobante · Ver el detalle (la constancia imprimible queda plegada y sale siempre al imprimir).
  - Corregido al probar: la revalidación del cupo en la transacción contaba la propia reserva y la última habitación siempre salía "ocupada" (`hotel/vertical.js`, `excluirPedidoId`).
  - Diferencias que quedan: sin tarjeta "Agregar traslado" (no se pueden sumar extras a una reserva hecha); en el celular no hay barra "Reserva confirmada" (va el header de la tienda).

Para ver el piloto: reiniciar el backend (el esquema nuevo descarta `listado` en un proceso viejo) y el `ng serve` de la tienda; luego Admin › Diseño › "Estándar · Reserva directa".

**Paso 4 · Plantilla (2026-10-13):** `hotel-estandar` prende header por secciones, portada con buscador abajo, servicios en franja, listado en filas y ficha en mosaico. Aplicada en `demobooking` con la función del admin (`aplicarPlantilla`, queda "Deshacer"); la franja de servicios se dejó visible con su texto de ejemplo para la demo. Recorrido real en móvil y desktop sin errores. Para que la demo muestre todo el prototipo faltan datos de la tienda: dirección (mapa, sección y enlace "Ubicación") y cobro con adelanto + "el cliente elige" ("Cómo pagar").

## 7. Encontrado al pasar (no es del prototipo)

- `zapatillas/categorias/mujer` muestra el título y la categoría "Hombre", con "Mujer" marcado en el menú. Por revisar.
- En hotel (`killa-hostal`) a 390 px, el header, el menú inferior y la barra fija se cortan por la derecha: hay scroll horizontal. En tours y eventos no pasa.
