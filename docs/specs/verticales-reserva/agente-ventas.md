# Asesor de ventas IA en las verticales de reserva

> Parte de [spec.md](spec.md). Extiende el asesor existente (`modules/agente`, ver `modules/agente/arquitectura.md` y `docs/specs/agente-ventas`).
> Etapa: **análisis y diseño**.

## Problema

El asesor del storefront hoy está hecho para el ecommerce:

| Pieza | Hoy | Por qué no sirve tal cual en las verticales |
|---|---|---|
| System prompt (`buildSystemPrompt` en `agente.service.js`) | "Ayudas a encontrar productos"; reglas de colores, tallas y envío | Un turista pregunta por fechas, cupos, recojo, qué incluye o la hora de check-in |
| `buscar_productos` | Busca por texto, color, variantes y stock | Un tour no tiene stock: tiene salidas con cupo por fecha. Una habitación tiene disponibilidad por noche |
| `calcular_envio` | Cotiza el courier a un distrito | No aplica. En tours, el equivalente es "¿me recogen en mi hotel?" |
| `estado_pedido` | Estado del pedido (pendiente → entregado) | Debe mostrar la reserva: fecha, hora de recojo o check-in y voucher |
| Respuesta (`serializeTurnoAgente`) | Campos fijos: `productos`, `envio`, `pedidos` | Hacen falta tarjetas de salidas, habitaciones disponibles y entradas |
| Orden "más solicitados" | No existe: la búsqueda ordena por relevancia de texto | La pregunta típica de un turista es "¿cuáles son sus tours más pedidos?" |

**Preguntas que el asesor debe poder responder con datos reales:**

- **Agencia de tours:** "¿cuáles son sus tours más solicitados?", "¿qué tours hay para este sábado para 2 adultos y un niño?", "¿el Full Day Paracas incluye almuerzo?", "¿me recogen en Miraflores?", "¿hay salida en inglés?", "¿cuánto dura el Camino Inca y qué tan difícil es?".
- **Hotel / hostal:** "¿tienen la suite disponible del 15 al 18?", "somos 2 adultos y 2 niños, ¿qué habitación nos sirve?", "¿a qué hora es el check-in?", "¿aceptan mascotas?", "¿tienen camas en dormitorio femenino para el viernes?".
- **Eventos:** "¿qué eventos hay este mes?", "¿quedan entradas VIP para el sábado?", "¿hasta cuándo es la preventa?", "¿hay estacionamiento?", "¿desde qué edad pueden entrar?".

## Principios (se conservan los del asesor actual)

1. **Tool-use, nunca catálogo en el prompt.** El modelo solo menciona tours, habitaciones o eventos que una herramienta devolvió.
2. **`tiendaId` siempre del servidor** (`resolveTienda`), nunca del input del modelo.
3. **El modelo no recibe montos** (regla actual R6 del asesor). Los precios van en **tarjetas** que pinta el frontend, calculadas con **el mismo `cotizar`** del checkout ([patrones.md §3.4](patrones.md)): lo que dice el chat es lo que se cobra. El modelo habla de precio con indicadores (`es_el_mas_economico`, `tiene_oferta`, `dentro_de_presupuesto`). El guard actual `contienePrecio` + `CORRECCION_PRECIO` sigue activo.
4. **Solo lectura.** El asesor **no crea reservas ni retenciones**. Su acción máxima es un botón "Reservar" que lleva a la ficha con la fecha y los pasajeros precargados. Reservar desde el chat queda para la Fase 3 del asesor (agente transaccional, `arquitectura.md` §4).
5. **Datos personales solo con sesión** (JWT), como `estado_pedido`.
6. **Escasez honesta.** "Quedan pocos cupos" solo si es cierto y si la tienda lo permite (`mostrar_restantes_bajo`). Inventar urgencia es publicidad engañosa (Indecopi).

## Arquitectura: un perfil de asesor por vertical

Se aplica el patrón de [patrones.md §3.1 / §3.15](patrones.md): cada vertical aporta su **perfil de asesor**, y `agente.service.js` lo elige por `tienda.tipoNegocio`.

```js
// modules/reservas/tours/agente.js  (lo mismo en hotel/ y eventos/; el ecommerce actual es el perfil "productos")
export default {
  instrucciones,          // bloque de system prompt propio de la vertical
  tools(facetas),         // definiciones; facetas por tienda (destinos, idiomas...) cacheadas como hoy
  ejecutar(nombre, input, ctx),  // ctx = { tiendaId, authUserId, hoy, zonaHoraria }
  facetas(tiendaId)       // enums para las definiciones de tools
};

// agente.service.js
const perfil = getPerfilAgente(tienda.tipoNegocio);   // productos | hotel | tours | eventos
const tools = [...perfil.tools(facetas), ...toolsComunes];
const system = [promptBase(tienda), perfil.instrucciones, contextoTemporal(tienda)];
```

- **Solo se envían las tools de la vertical de la tienda.** Un hotel no paga en tokens las definiciones de tours. El número de tools por turno queda en 4-6, como hoy.
- **El prompt base** (rol de asesor, tono, no inventar, no escribir montos, no pedir datos de tarjeta, derivación a una persona) es común. Cada vertical agrega solo su bloque.
- El loop, el streaming, la persistencia de conversaciones, el rate limit y el consumo de IA **no cambian**.

### Contexto temporal (nuevo y obligatorio en las verticales)

En las verticales casi todas las preguntas tienen fechas relativas: "este sábado", "el fin de semana largo", "mañana temprano". El modelo no sabe qué día es. Por eso:

- El bloque de contexto agrega: `Hoy es sábado 3 de octubre de 2026, 10:40 (America/Lima)`. Va **fuera** del bloque cacheado del system prompt, porque cambia.
- Las tools reciben **solo fechas ISO** (`2026-10-10`). El modelo resuelve "este sábado" y el servidor valida: nada en el pasado, nada fuera de la ventana de venta y rangos máximos (60 días por consulta).
- Si la fecha es ambigua ("fin de mes"), el modelo pregunta antes de consultar (regla actual: "si la intención no está clara, haz una pregunta corta").

### Idioma

Hotel y tours reciben extranjeros. La regla cambia de "español LATAM" a: **"Responde en el idioma del cliente"**.

- Los datos de las tools llegan en español. Si existe `productos.traducciones` ([spec.md §7](spec.md)), la tool devuelve el idioma pedido.
- **Riesgo:** al traducir al vuelo, el modelo podría alterar datos (horas, requisitos). Mitigación: horas, fechas y montos van en las tarjetas, que no dependen del texto del modelo.

## "Más solicitados": nueva métrica de popularidad

Hoy no existe un orden por ventas. Se agrega un orden `populares` en las tools de búsqueda de las tres verticales (y en `buscar_productos`, de paso):

| Vertical | Popularidad = | Fuente |
|---|---|---|
| Tours | pasajeros confirmados en los últimos 90 días | `tour_reservas` ⨝ `tour_salidas` (`estado` no cancelada, `fecha` ≥ hoy − 90) |
| Hotel | noches vendidas en los últimos 90 días por tipo | `hotel_reserva_habitaciones` ⨝ `hotel_reservas` |
| Eventos | entradas vendidas (`cupo_confirmado`) de funciones futuras | `evento_tipos_entrada` |
| Productos | unidades vendidas en 90 días | `pedido_detalles` ⨝ `pedidos` (confirmados) |

- **Desempate:** `productos.rating_score` (promedio bayesiano que ya existe) y después `destacado`.
- **Cálculo:** consulta agregada por tienda con caché en memoria de 1 h (`MemoryCache`, como las facetas). No necesita cron ni columna nueva. Si el volumen crece, se desnormaliza en `productos.ventas_90d`, actualizada al confirmar o cancelar (evento de dominio, [patrones.md §3.8](patrones.md)).
- **Tienda nueva sin ventas:** el orden cae a `destacado` y luego a `rating_score`. El modelo recibe `criterio: "destacados"` para no decir "los más vendidos" cuando no lo son.
- **Privacidad comercial:** el modelo recibe un **ranking**, nunca cantidades vendidas. "Es nuestro tour más pedido" sí; "vendimos 340 cupos" no.

## Herramientas por vertical

### Comunes a las verticales

| Tool | Entrada | Devuelve | Notas |
|---|---|---|---|
| `info_negocio` | `tema`: enum `politica_cancelacion \| horarios \| ubicacion \| como_llegar \| metodos_pago \| requisitos \| contacto \| reglas` | Texto estructurado sacado de `config_<vertical>`, `politicas_cancelacion`, `metodos_pago` y `tiendas` | Responde "¿a qué hora es el check-in?" o "¿puedo cancelar?" **sin RAG**: los datos ya están estructurados en tablas |
| `estado_reserva` | `codigo?` | Generaliza `estado_pedido`: código, estado, fecha del servicio, hora de recojo / check-in / función y link al voucher. **Sin montos** | Solo con sesión; una reserva ajena = `NO_ENCONTRADA` |
| `mis_reclamaciones` | `numero?` | Ver Libro de Reclamaciones R9.10 | Igual en todas las verticales |

### Agencia de tours

| Tool | Entrada (la decide el modelo) | Al modelo | Tarjeta (frontend) |
|---|---|---|---|
| `buscar_tours` | `query?`, `destino?` (enum de la tienda), `fecha_desde?`, `fecha_hasta?`, `pasajeros?`, `duracion?` (`medio_dia \| full_day \| multi_dia`), `dificultad?`, `idioma?`, `modalidad?`, `orden` (`relevancia \| populares \| mejor_valorados \| precio`) | hasta 4 tours: nombre, duración, dificultad, idiomas, `ranking_popularidad`, rating, `proxima_salida_disponible`, indicadores de precio | `tour`: imagen, nombre, duración, rating, "desde S/ X", próxima salida, botón "Ver salidas" |
| `ver_salidas` | `tour_id`, `fecha_desde`, `fecha_hasta` (≤ 14 días), `pasajeros?` `{ adultos, ninos, ... }`, `idioma?` | hasta 6 salidas: fecha, hora, idioma, `disponible`, `quedan_pocos`, `garantizada`, `motivo_no_disponible` (`sin_cupo \| fuera_de_corte \| cerrada`) | `salidas`: lista de fechas con precio total para esos pasajeros (`cotizar`) y botón "Reservar" (deep link a la ficha con fecha, hora y pasajeros) |
| `detalle_tour` | `tour_id`, `aspecto?` (`itinerario \| incluye \| requisitos \| recojo \| que_llevar`) | Itinerario resumido, incluye / no incluye, requisitos, edad mínima, altitud, dificultad, punto de encuentro | — (responde el texto) |
| `verificar_recojo` | `tour_id`, `lugar` (hotel o distrito en texto) | `recojo_incluido \| con_costo \| fuera_de_zona` + minutos antes de la salida. Resuelve el lugar con `distritos.js`, igual que `calcular_envio` | `recojo`: zona, hora estimada y costo si aplica |

**Ejemplo:**
```
Cliente: ¿Cuáles son sus tours más solicitados? Vamos 2 el próximo sábado.
  → buscar_tours({ orden: "populares", fecha_desde: "2026-10-10", fecha_hasta: "2026-10-10", pasajeros: 2 })
Asesor: "El más pedido es el Full Day Paracas y Huacachina, y el sábado todavía tiene cupo
         para los dos. Abajo te dejo los otros favoritos con sus salidas."
  [tarjetas: 3 tours · cada uno con su próxima salida y precio para 2]
```

### Hotel / hostal

| Tool | Entrada | Al modelo | Tarjeta |
|---|---|---|---|
| `consultar_disponibilidad` | `entrada`, `salida`, `adultos`, `ninos?`, `habitaciones?` (default 1), `tipo?` (enum de tipos de la tienda: "Suite", "Dormitorio femenino") | Tipos disponibles con capacidad, camas e indicadores de precio. Si no hay: `motivo` (`sin_cupo \| min_noches:3 \| cerrado_llegada \| capacidad`) y **alternativas**: las mismas noches desplazadas ±1-3 días, u otro tipo con cupo | `habitaciones`: foto, tipo, camas, precio total de la estadía y por noche, plan ("con desayuno"), botón "Reservar" con fechas y huéspedes |
| `ver_habitacion` | `tipo_id` | Camas, m², capacidad, amenities, baño privado o compartido, género del dormitorio | — |

**Ejemplo:**
```
Cliente: ¿Tienen la suite del 15 al 18 de noviembre?
  → consultar_disponibilidad({ entrada: "2026-11-15", salida: "2026-11-18", adultos: 2, tipo: "<id suite>" })
     ← { disponibles: [], motivo: "sin_cupo", alternativas: [{ entrada: "2026-11-16", salida: "2026-11-19" }, { tipo: "Doble superior" }] }
Asesor: "Para esas noches la suite ya está completa. Está libre del 16 al 19, o puedes
         tomar la Doble superior en tus mismas fechas. Te dejo ambas abajo."
```

**Adultos por defecto:** si el cliente no lo dice, el modelo pregunta "¿cuántas personas?" antes de consultar. La capacidad cambia el resultado.

### Eventos

| Tool | Entrada | Al modelo | Tarjeta |
|---|---|---|---|
| `buscar_eventos` | `query?`, `fecha_desde?`, `fecha_hasta?`, `tipo?`, `orden` (`proximos \| populares`) | hasta 4 eventos: nombre, fechas, lugar, `estado` (`a_la_venta \| agotado \| ultimas_entradas`), edad mínima | `evento`: banner, fecha, lugar, "desde S/ X", botón "Ver entradas" |
| `ver_entradas` | `evento_id`, `funcion_id?` | Por zona, la fase vigente: `disponible`, `quedan_pocas`, `venta_hasta` (hasta cuándo dura la preventa), `siguiente_fase_existe` | `entradas`: zonas con precio de la fase vigente y botón "Comprar" a la selección de la función |

El modelo **sí puede decir** "la preventa termina el 30 de octubre" (es un dato de la tool), pero **no** el precio de la siguiente fase (es un monto).

## Contrato de respuesta: tarjetas tipadas

`serializeTurnoAgente` hoy devuelve campos fijos (`productos`, `envio`, `pedidos`). Se generaliza a una lista de tarjetas con unión discriminada, el mismo patrón que `secciones.schema.js`:

```js
{
  mensaje, sugerencias, ofrecerPersona,
  tarjetas: [
    { tipo: "producto", ... },                 // ecommerce actual
    { tipo: "envio", ... },
    { tipo: "tour", id, nombre, slug, imagenUrl, duracion, rating, precioDesde, proximaSalida },
    { tipo: "salidas", tourSlug, pasajeros, salidas: [{ fecha, hora, idioma, garantizada, quedanPocos, precioTotal, urlReservar }] },
    { tipo: "habitaciones", entrada, salida, huespedes, opciones: [{ tipoId, nombre, imagenUrl, camas, precioTotal, precioNoche, plan, urlReservar }] },
    { tipo: "recojo", zona, minutosAntes, costo },
    { tipo: "evento", ... },
    { tipo: "entradas", ... },
    { tipo: "reserva", codigo, estado, fechaServicio, hora, urlVoucher }
  ],
  // compatibilidad: productos/envio/pedidos se siguen enviando para el ecommerce
  // hasta que el chat del storefront consuma solo `tarjetas`
}
```

- **Los montos de las tarjetas los calcula el servidor** con el `cotizar` de la vertical, sin pasar por el modelo.
- **`urlReservar`** es un deep link con la selección precargada (`/:slug/tours/full-day-paracas?fecha=2026-10-10&hora=04:30&adultos=2`). La ficha **revalida todo**: si la salida se llenó entre el chat y el clic, lo muestra ahí.
- **FrontendStore:** el componente del chat renderiza cada `tipo` con su componente de tarjeta, que estará en la carpeta lazy de la vertical para no cargar tarjetas de hotel en una tienda de tours.

## Instrucciones por vertical (bloques de prompt)

**Tours:**
- Para "más pedidos / recomendados / populares", usa `buscar_tours` con `orden: populares`. Si devuelve `criterio: destacados`, di "nuestros recomendados", no "los más vendidos".
- Antes de `ver_salidas`, asegúrate de saber la fecha (o rango) y cuántas personas son. Si falta, pregunta una sola cosa a la vez.
- Para preguntas sobre qué incluye, el itinerario, la dificultad o qué llevar, usa `detalle_tour`; no supongas.
- Para "¿me recogen en…?", usa `verificar_recojo`.
- Si un tour no tiene salida en la fecha pedida, ofrece la fecha disponible más cercana o un tour similar con cupo.

**Hotel:**
- Siempre usa `consultar_disponibilidad` antes de decir que hay o no hay habitación. Nunca supongas disponibilidad.
- Necesitas llegada, salida y número de personas. Si el cliente dice "3 noches desde el viernes", calcula la salida.
- Si no hay disponibilidad, ofrece las alternativas que devuelve la herramienta.
- Horarios, mascotas, estacionamiento y desayuno: `info_negocio`.

**Eventos:**
- La disponibilidad y la fase de venta salen de `ver_entradas`. No digas "se agotan pronto" si la herramienta no devolvió `quedan_pocas`.
- Si el evento está agotado, dilo claro. Si hay otra función con entradas, ofrécela.

**Común a las tres:**
- Fechas siempre en ISO en las herramientas; en el texto, como las diría una persona ("el sábado 10").
- Responde en el idioma del cliente.
- No prometas cupo: "hay disponibilidad ahora; se asegura al completar la reserva".
- Reclamos: derivar al Libro de Reclamaciones (R9.8 / R9.9 del libro).

## Qué no hace el asesor (decisiones)

| No hace | Por qué |
|---|---|
| Crear la reserva o la retención desde el chat | Escritura de estado con dinero: queda para la Fase 3 del asesor, con confirmación explícita del cliente |
| Negociar precios o dar descuentos | La IA no compromete dinero de la tienda; los cupones los publica la tienda |
| Decir cantidades vendidas o la ocupación exacta | Es información comercial de la tienda; se usan rankings e indicadores |
| Responder políticas o requisitos sin herramienta | Todo sale de `info_negocio` o `detalle_tour`, que leen la configuración real |
| Usar RAG para la base de conocimiento | La información de las verticales ya está estructurada en tablas. RAG queda para textos libres de la tienda (FAQ largas) en otra fase |

## Guía del admin por vertical

La Guía (`modules/asistente`) también tiene catálogo de pantallas y tours fijos del ecommerce (`asistente.catalogo.js`). Cada vertical declara sus `PANTALLAS` (calendario de salidas, manifiesto, grilla de tarifas, escáner) y sus pasos de progreso (`asistente.progreso.js`: "crea tu primer tour", "programa salidas", "configura zonas de recojo").

Además, la Guía puede responder con datos de operación: "¿cuántos pasajeros tengo mañana?" o "¿qué salidas no llegan al mínimo?". Son herramientas de lectura, con el mismo patrón que `consultar_progreso_tienda`.

## Evaluación antes de lanzar

- **Set de preguntas por vertical** (30-50, en español e inglés), cada una con la herramienta esperada y la respuesta correcta según datos de prueba. Por ejemplo, "más solicitados" → `buscar_tours(orden: populares)`.
- **Verificaciones automáticas:**
  - ningún monto en el texto (`contienePrecio`);
  - ninguna fecha en el pasado;
  - ningún tour, habitación o evento que no haya devuelto una herramienta;
  - "quedan pocos" solo si la herramienta lo dijo.
- **Costo por turno:** medirlo con las tools de la vertical. La meta es seguir cerca del costo actual (~$0.003 por turno con Haiku).
