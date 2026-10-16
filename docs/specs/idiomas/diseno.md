# Idiomas — análisis de tareas y patrones

Complemento de [spec.md](spec.md) y [tasks.md](tasks.md). Regla que guía todo: **ningún código pregunta por la identidad de un idioma** (`idioma === "en"`, `enIngles`, `lang === "es"`). Pregunta por sus datos (`locale`, `ia`, `esBase`) o recorre la cadena de respaldo, que funciona igual para cualquier idioma, incluido el español.

## Punto de partida (medido 2026-10-14)

Comparaciones contra un idioma concreto que hay que eliminar:

| Repo | Dónde | Qué hace hoy |
|---|---|---|
| Backend | `tiendas.store.routes.js` (2) | `lang === "en"` para el diseño y la descripción |
| Backend | `categorias.store.routes.js` (2) | un controlador por idioma (`categoriasControllerEn`) |
| Backend | `traducciones.service.js` | `IDIOMA = "en"`; `if (fuente === "diseno")` en guardar |
| Backend | `reservas.store.routes.js`, `reservas.service.js`, `reservas.serializer.js` (5) | `lang`/`idiomaHuesped === "en"` |
| Backend | `reservas.config.service.js`, `reservas.emails.js` (3) | traducciones `en`, `enIngles(r)` |
| Backend | `hotel/textos-cotizar.js`, `tours/textos-tour.js`, `tours/cotizar.js` | diccionarios `{ es, en }` elegidos por `idioma === "en"` |
| Backend | `tiendas.schema.js`, `reservas.schema.js` | `z.enum(["es", "en"])` |
| Store | 10 componentes (`policies-section`, `calendario-mes`, hotel ×4, tours ×2, solicitud, seguimiento) | `enIngles` para fechas, plurales y textos |
| Store | `store-header` | botones fijos `cambiar('es')` / `cambiar('en')` |

Como `textos.en.ts` pasa a la BD, todas cambian en el **núcleo de la fase 1**; el contrato 3 corre sin lista de excepciones desde el inicio.

---

## Backend

### B1. Idiomas: Repository + caché + objeto de valor (tareas 1.1, 1.2)

```
modules/idiomas/
  idiomas.repository.js   // prisma.idiomas
  idiomas.service.js      // activos(), porCodigo(), invalidar() — caché como rubros.cache.js
  idioma.js               // IDIOMA_BASE y crearIdioma(fila)
  idiomas.admin.routes.js // CRUD con requirePlatformAdmin
```

- `crearIdioma(fila)` devuelve un objeto inmutable `{ codigo, nombre, locale, ia, avisoIa, esBase }`. `esBase = fila.codigo === IDIOMA_BASE` es **la única comparación de código** de todo el sistema.
- Por la app circula ese objeto, no un string: quien lo recibe solo puede preguntar por sus datos.

### B2. Idioma de la petición: Middleware + objeto de contexto + Specification (1.3)

```js
// req.idioma: siempre un Idioma (nunca null)
export async function resolverIdioma(req, _res, next) {
  const tienda = await idiomasDeTienda(req.tiendaId);              // cacheado
  req.idioma = tienda.visibles.find(i => i.codigo === req.query.lang) ?? tienda.base;
  next();
}
```

- **Specification `idiomaVisible(tienda, idioma)`** = activo en la plataforma ∧ elegido por la tienda ∧ textos fijos completos (P5 = b). Se usa en tres lugares: el middleware, el `tienda.idiomas` que recibe la tienda (solo los visibles) y el admin (que muestra todos con su avance). Una regla, un solo lugar.
- La completitud (`traducidos / total` por grupo del rubro) se recalcula al guardar textos fijos y se cachea con `idiomasDeTienda`; se invalida igual que hoy `invalidarAlEscribir`.
- `?lang=` desconocido u oculto → base, sin error: un enlace viejo nunca rompe.

### B3. Cadena de respaldo: función pura (1.4)

```js
// manual → al día → texto base. Sirve para cualquier idioma, también el base:
// el español no tiene traducciones, así que cae solo al texto base.
export function textoLocal(base, tr) { … }
```

El idioma base **no necesita un caso especial (ni un Null Object)**: la cadena lo resuelve sola. Esto elimina las ramas del tipo `lang === "en" ? traducir : original`.

### B4. Fuentes traducibles: Strategy de almacenamiento (Adapter) (1.4, 1.7)

Hoy hay tres formas de guardar traducciones y se distinguen con `if (fuente === "diseno")`. Cada fuente pasa a declarar su **almacén**, con la misma interfaz:

```js
/** @typedef {{
 *   leer(tiendaId): Promise<{ id, nombre, textos: Record<campo, texto>, traducciones }[]>,
 *   guardar(tiendaId, id, codigo, trDelIdioma): Promise<void>,
 * }} Almacen */

const FUENTES = {
  productos:  { etiqueta: "Nombre y descripción", almacen: almacenColumna({ tabla: "productos", campos: [...] }) },
  categorias: { …, almacen: almacenColumna({ tabla: "categorias", … }) },
  tours:      { …, almacen: almacenFicha() },      // claves compuestas en productos.traducciones
  diseno:     { …, almacen: almacenDiseno() },     // clave "traducciones" de la configuración
  textos:     { …, almacen: almacenTextosFijos() } // tienda_textos (D7), por grupos del rubro
};
```

- `listarTextos(tiendaId, idioma)`, `guardarManual(...)` y `traducirConIa(...)` recorren `FUENTES` sin saber cómo guarda cada una.
- **Los textos fijos son una fuente más**: la pantalla Traducciones, sus estados y "Traducir con IA" funcionan igual para "Agregar al carrito" que para el nombre de un producto. No hay una segunda pantalla ni un segundo flujo.
- Fuente nueva (eventos, canchas en la fase 2): una entrada con su almacén. El contrato 2 verifica que se localice en la tienda.

### B5. Localizar en la tienda: Decorator del serializer (1.4, 1.13)

```js
// GenericController pasa un contexto al serializer: serialize(row, { idioma }).
const localizado = (serializar, fuente) => (fila, ctx) => serializar(localizar(fuente, fila, ctx.idioma));

new GenericController(categoriasService, "Categoria", {
  serialize: localizado(serializeCategoriaStore, FUENTES.categorias)
});
```

- Un controlador por recurso: desaparecen `categoriasControllerEn` y `porIdioma`.
- `GenericController` agrega el segundo argumento `ctx` (compatible: los serializers actuales lo ignoran).
- Las rutas que serializan a mano (detalle de producto, home, tienda por slug) usan el mismo `localizar`.
- Claves de caché: `claveCache(query, req.idioma)` siempre incluye el código, para cualquier idioma.

### B6. "Traducir con IA": Command + Port/Adapter (1.5)

```js
// Comando explícito: solo lo dispara una ruta del admin (decisión 7).
traducirConIa({ tiendaId, idioma, alcance })  // alcance: { texto } | { fuente } | "pendientes"
```

- Guarda: `idioma.ia` (capacidad del idioma, no su código).
- **Puerto `Traductor`** (`traducir(textos, { origen, destino, contexto })`) con el adaptador `traductorClaude` (hoy `traducir-ia.js`). En los tests se usa un traductor falso: no se llama a la API.
- Cada uso se registra en `consumo-ia` (el costo se ve por tienda).
- Se borran `traducirTrasGuardar`, `programarTraduccion` y su montaje. El contrato 6 impide volver a montarlo.

### B7. Textos del servidor: catálogo de mensajes (1.16; hotel y tours en el núcleo)

`hotel/textos-cotizar.js`, `tours/textos-tour.js` y los textos de `reservas.emails.js` dejan los objetos `{ es, en }`:

```js
const t = await textosPara(tiendaId, idioma);   // tienda → plataforma → español (mismo B3)
t("Noches") ; t("Quedan {n}", { n })
```

- Mismas claves en español, el mismo catálogo y la misma cadena que la tienda (D7). Las claves del servidor entran a `textos_claves` con su grupo (`correos`, `hotel`, `tours`). El inglés actual se migra a `textos_plataforma`.
- El correo usa el idioma guardado en el pedido o la reserva (`pedidos.idioma`, `reservas.idiomaHuesped`), no el de la petición.

### B8. Catálogo de claves: generado en build + seeder (1.6)

- Script de la tienda: recorre `src/` y extrae las claves de `'…' | t`, `traducir('…')` y `t('…')` → `claves-tienda.json` (`{ clave, grupo }`; el grupo sale de la carpeta).
- Script del backend: junta esas claves con las del servidor (B7) y hace upsert en `textos_claves`; marca como obsoletas las que ya no existen (no las borra: la tienda podría tener su traducción).
- Grupos por rubro: `gruposTextos` en `negocio/<rubro>/datos.js` (dato del rubro, como `recibeReservas`). El total de P5 = claves de `comun` + grupos del rubro.

---

## Store

### S1. `IdiomaService` sin identidad (1.8)

- `idioma()` es el objeto `{ codigo, nombre, locale, esBase }` recibido de la API; `disponibles()` = `tienda.idiomas` (ya filtrados por P5).
- Se borran `enIngles` y `type Idioma = 'es' | 'en'`. Los 10 componentes que usan `enIngles` pasan a `t` para las palabras y a `idioma().locale` para los números.

### S2. Diccionario: Repository + carga antes de pintar + TransferState (1.8)

- `TextosService.cargar(codigo)` → `GET /store/textos?lang=`; se ejecuta en `provideAppInitializer` en el servidor y en el navegador. `TransferState` evita pedirlo dos veces al hidratar.
- Como el diccionario está listo antes de pintar y cambiar de idioma recarga la página, el pipe `t` puede ser **puro** (hoy es impuro): menos trabajo por cada ciclo de detección de cambios.

### S3. Fechas: los nombres salen del diccionario, no de `Intl` (1.8)

`Intl` no tiene meses en quechua ni en aimara: con locale `es-PE` saldrían en español. Una sola función `formatearFecha(fecha, formato)` arma día y mes con claves del catálogo (`'enero'`, `'lunes'`) e `Intl` solo da los números. Sirve igual para todos los idiomas.

### S4. Selector e interceptor (1.8, 1.9)

- El selector recorre `disponibles()`; si hay uno solo, no se muestra. Sin códigos en la plantilla.
- El interceptor envía siempre `lang=<idioma().codigo>`, sin preguntar si es el base. La caché queda separada por idioma igual que hoy.

---

## Admin (1.10, 1.11)

- Mi Tienda: lista de idiomas activos agrupados por `pais`, con el avance de cada uno ("Quechua: 120 de 310 · no visible hasta completar").
- Traducciones: selector de idioma; las fuentes de B4, incluida "Textos de la tienda", con los mismos estados. "Traducir con IA" solo si `idioma.ia`, con el aviso si `avisoIa`.
- Idiomas de la plataforma: CRUD solo para el administrador de la plataforma (B1).

---

## Traducciones organizada por pantalla (1.21–1.26)

**Problema (2026-10-15).** Un hotel tiene ~680 textos fijos y la pantalla los muestra en una sección por grupo técnico: "Reservas" sola son ~250 frases seguidas ("Ver todas", "{n} noches") sin decir en qué parte de la tienda salen. Los grupos son nuestros (deciden qué textos le tocan a cada rubro y cuándo se publica el idioma), no del dueño.

**Investigación.** Shopify y Wix organizan por tipo de contenido y por página, con filtros; WPML por "dominio" técnico (lo que hacemos hoy, y su punto débil); Weglot, Transifex Live, Phrase y Crowdin agregan un editor sobre la propia página. Los maduros combinan lista organizada + editor en contexto; ninguno resuelve todo con un solo árbol. Nuestro `"texto|contexto"` es el `msgctxt` de gettext, y el prefijo `[qu]` de las pruebas es pseudo-localización, la base técnica del editor en contexto.

**Decisión: dos etapas.** A) lista por tipo de contenido y por pantalla, con filtros; B) "modo traducir" en la tienda. Elegido por el usuario (2026-10-15):
- Un texto usado en varias pantallas (22 % de los de un hotel) **se muestra en cada una**, con "también en: …"; se traduce una vez y los contadores cuentan claves únicas.
- El contenido del dueño (habitaciones, extras, diseño…) va en **su propia sección**, no repartido por pantallas.
- Sin enlace "Ver en la tienda" en la etapa A: lo reemplaza el modo traducir.

### Idea central: la unidad de guardado no es la unidad de lectura

Hoy la pantalla muestra los textos fijos como se guardan: una "fila" por grupo (`almacenTextosFijos`), que es también lo que decide la publicación (P5). Ese es el error de fondo: se muestra el modelo de escritura. La solución separa los dos:

- **Escritura (no cambia):** almacenes por grupo, `guardarManual`, `publicarCompletos`, el 100 % por grupo.
- **Lectura (nueva):** cada campo dice en qué **lugares** aparece; la pantalla navega por lugares.

Es una **proyección de lectura** (CQRS liviano, sin bases separadas): se arma al leer y no se guarda. Así nada de A1–A5 puede romper cómo se guarda ni cuándo se publica un idioma.

### A1. `Lugar`: una forma única para los dos tipos de texto (Strategy, extiende B4) (1.22)

Hoy el admin pregunta `if (g.fuente === 'textos')` para nombrar el campo. En lugar de un segundo `if` para agrupar, cada fuente de `FUENTES` declara dónde aparecen sus campos, con la misma forma:

```js
// Lugar: { zona, id, nombre, orden, seccion?: { id, nombre } }
// zona: "contenido" | "pantallas" | "mensajes"
lugares(fila, campo) → Lugar[]
```

- Fuentes de contenido (`fuenteCampos`, diseño, tours): un lugar en `contenido`, con su `etiqueta` ("Habitaciones") y la fila como sección ("Estándar Queen"). Default en `fuenteCampos`: ninguna fuente lo escribe a mano.
- `textos`: los lugares salen de las ubicaciones de la clave (A2), filtrados por rubro (A3).
- El admin solo agrupa por `lugar`: no conoce fuentes, ni rubros, ni grupos; se borra el `if` de `nombreCampo`.
- Contrato: toda fuente de `FUENTES` tiene `lugares` (se agrega al test del contrato 2).

Descartado: que el admin agrupe distinto según la fuente (otro `if` por cada fuente nueva).

### A2. De dónde sale la ubicación: registro declarativo + resolutor por prefijo (1.21)

`scripts/claves-tienda.mjs` ya resuelve el grupo con `GRUPO_POR_CARPETA` (gana el prefijo más largo). La pantalla usa el mismo mecanismo:

- **Un resolutor compartido** `porPrefijo(mapa, ruta)` para grupo y pantalla: una sola regla, no dos copias.
- **Registro** `PANTALLAS = { habitacion: { nombre: "Ficha de la habitación", orden, carpetas: [...] } }` y `SECCIONES = { "features/reservas/hotel/calendario-estadia.component": "Calendario y tarifas", … }`. Lo que no es una pantalla pero el dueño reconoce va como tema: *Fechas y horarios*, *Estados de la reserva*, *Menú y pie de página*.
- El grupo de cada pantalla no se declara: sale de `GRUPO_POR_CARPETA` (una sola verdad).
- Salida: `ubicaciones: ["habitacion/calendario", …]` en cada clave, más `pantallas-tienda.json` (id, nombre, orden, grupo, secciones).
- **Contrato 10** (función de aptitud, como el 9): un archivo con textos sin pantalla o sin nombre de sección hace fallar `npm run claves`.

Descartado:
- **Anotación en cada componente** (`// @pantalla …`): ~60 archivos que tocar, un comentario que nadie ve al mover el archivo, y no queda un lugar donde leer el orden del recorrido.
- **Nombres sacados del nombre del archivo**: "calendario-estadia.component" no es lenguaje del dueño.

### A3. Qué lugares ve cada tienda: Specification por capacidad (1.22)

- `ubicacionVisible(ubicacion, gruposTextos)`: la pantalla pertenece a un grupo del rubro. Pregunta por la capacidad (`gruposTextos`), nunca por el rubro: un hotel no ve "Ficha del evento" aunque "Ver todas" también se use ahí.
- Respaldo: una clave sin ubicación visible cae en el lugar de su grupo ("Textos generales"), así ningún texto requerido para el 100 % queda fuera de la navegación. Test: la suma de los lugares cubre todas las claves de la tienda.

### A4. Texto compartido: identidad por clave, no copias (1.23, 1.24)

- Un campo es uno solo (`fuente|id|campo`); varios lugares lo referencian. El borrador, el guardado y el estado se llevan por esa identidad: si lo editas en "Reservar", en "Seguimiento" se ve igual.
- "También en: …" se deriva de sus lugares.
- Los contadores cuentan campos únicos: el resumen y el aviso de publicación no cambian. Por lugar se cuenta lo que falta en ese lugar (un texto compartido pendiente suma en cada uno, a propósito: el dueño lo ve donde está).

### A5. Admin: modelo de presentación como función pura (1.23)

- `navegacion(datos, filtro, busqueda)` → `zona → lugar → sección → campos`, con lo que falta en cada nivel. Función pura en un archivo propio, con tests sin TestBed; el componente solo la pinta con un `computed`.
- Profundidad fija (3 niveles): estructuras anidadas simples, sin Composite genérico.
- Panel izquierdo con las zonas (**Tu contenido**, **Pantallas de la tienda**, **Mensajes**); a la derecha el lugar elegido con sus secciones en acordeón (abierta la que tiene pendientes). Búsqueda en el español y en la traducción. En celular, el panel pasa a un selector.
- La URL guarda el lugar (`?lugar=pantallas/habitacion`): se puede volver y, en la etapa B, abrir directo.

### A6. Servidor: misma regla, misma salida (1.22)

- `claves-servidor.js` emite `ubicaciones` con la misma forma.
- **Correos:** sección = la función exportada que arma el correo (`confirmadaEmail` → "Reserva confirmada"), registradas en `CORREOS`. Lo de las funciones auxiliares (`layout`, `resumen`, `voz`) va a "Partes comunes de los correos". Los correos al negocio no tienen claves (van en el idioma base) y no aparecen.
- **Avisos y errores:** sección por módulo (pedidos, pagos, reservas).
- Contrato 10 también aquí: una función de correo nueva sin nombre en `CORREOS` hace fallar el test de claves.

### A7. La ubicación vive en el JSON, no en la BD

`ubicaciones` y `pantallas` se leen del JSON desplegado y quedan en memoria, **sin columna nueva**:
- Solo sirven para mostrar; vienen con el mismo deploy que el código que las usa, y el JSON ya es la verdad.
- El grupo sí está en `textos_claves`, porque filtra consultas y decide la publicación.

Costo: no se consultan con SQL desde Supabase. *Pendiente de confirmar por el usuario.*

### Grupos exactos: una clave es de todos los grupos donde se usa (1.22b)

**Hallado en la 1.22.** Cada clave tenía un solo grupo; si se usaba en varios rubros se subía a uno general (`{productos, tours}` → `comun`, `{hotel, tours}` → `reservas`). Un hotel tenía que traducir "Antes de salir" y "Filtros" para publicar un idioma aunque su tienda nunca los muestra (eventos, locales y canchas: ~9 cada uno). Elegido por el usuario (2026-10-15): corregirlo.

- La relación clave ↔ grupo es de muchos a muchos: `textos_claves.grupos TEXT[]` (`docs/sql/idiomas_fase_1d.sql`). Los extractores emiten todos los grupos de los archivos donde se usa la clave, sin subirla; se borra `grupoComun`.
- Una tienda traduce las claves que tienen **alguno** de sus `gruposTextos` (`hasSome`): la misma Specification por capacidad que la visibilidad de un lugar (A3), que ahora también mira los `grupos` de la sección.
- El modelo de escritura no cambia: el almacén sigue con una fila por grupo y cada clave va a su **grupo principal** en esa tienda (`grupoPrincipal`: el primero de los suyos en el orden de `gruposTextos`), así una clave de dos grupos no se repite.
- Solo quita textos pedidos, nunca agrega (medido: productos −1, hotel −2, tours −1, eventos −9, locales −8, canchas −9): ningún idioma publicado queda incompleto.

### B. Modo traducir en la tienda (1.26)

**Qué ya existe (editor de Diseño en vivo, `docs/specs/editor-diseno-en-vivo`).** El admin abre la tienda en un iframe con `?vista-previa=1`; se hablan por `postMessage` con origen verificado (`environment.adminOrigins` en la tienda, `e.source`/`e.origin` en el admin); la tienda captura los clics (ninguno navega) y avisa qué parte tocó el dueño (`VistaPreviaService`). El modo traducir reusa ese canal: no es un mecanismo nuevo.

#### B1. Cómo saber qué texto se tocó — evaluado

| Opción | Cómo | Problema |
|---|---|---|
| Marcas invisibles en el texto (pseudo-localización, como Phrase o Lokalise) | En modo traducir, `traducir()` agrega caracteres invisibles con el id de la clave | Rompe la lógica que trabaja con el texto ya traducido: `split` por oraciones (la política de cancelación), `replace` en fechas, comparaciones, `maxlength`. Y no cubre el contenido, que llega traducido del backend: habría que marcarlo también ahí (B5). |
| Atributo `data-clave` en cada texto | Directiva o cambio en cada plantilla | Cientos de plantillas que tocar; lo que se arma en TypeScript (`traducir()`) no tiene elemento. |
| **Búsqueda inversa en el admin (elegida para proponer)** | La tienda solo manda **el texto que se tocó** (y el de sus 2 ancestros). El admin ya tiene todos los textos de la tienda con su traducción (`listarTextos`): los busca ahí | Un mismo texto puede salir en varios campos ("Habitaciones" categoría y botón): se muestran todos los candidatos, cada uno con su lugar. |

La búsqueda inversa no toca el traductor de la tienda ni el backend, y cubre por igual textos fijos y contenido, porque la verdad está en un solo lado (el admin). Patrones:
- **Mediator** (`postMessage`): la tienda no sabe de claves ni de fuentes; solo informa "tocaron este texto".
- **Índice invertido** en el admin: `textoVisible → campos`, armado de los datos de Traducciones. Los textos con marcadores (`"{n} noches"`) se buscan como plantilla (`{n}` → cualquier valor). Función pura con tests, junto a `navegacion()`.
- **Cadena de intentos:** el elemento tocado; si no coincide, su padre; después el abuelo (un texto armado con varias claves en un mismo nodo).
- Se compara el `textContent`, no el `innerText`: este último trae las mayúsculas del CSS (`uppercase`).

#### B2. Elegir o navegar

En el editor de Diseño ningún clic navega. Para traducir hay que recorrer pantallas, así que la barra del admin tiene dos modos: **Navegar** (la tienda funciona normal) y **Elegir texto** (el clic elige y no navega; al pasar el mouse se resalta el elemento). El admin manda el modo a la tienda (`tr-modo`).

#### B3. Idioma que todavía no se publica

Lo más útil del modo es traducir un idioma **antes** de publicarlo, pero la tienda solo acepta idiomas publicados (P5). Opciones: (a) un **permiso firmado de vista previa**: el admin pide al backend un token corto (tienda + idioma, 1 hora; como los tokens de reserva), la tienda lo manda en cada pedido y `resolverIdioma` acepta ese idioma aunque no esté publicado; (b) solo idiomas publicados.

#### B4. Después de guardar

El admin recarga el iframe en la misma URL (el backend ya invalida sus cachés al guardar). Mandar el texto nuevo por mensaje para no recargar queda para después.

#### B5. Protocolo

| Mensaje | De → a | Datos |
|---|---|---|
| `tr-lista` | tienda → admin | al arrancar (propio: el modo traducir no comparte servicio con el editor de Diseño) |
| `tr-modo` | admin → tienda | `{ elegir: boolean }` |
| `tr-texto` | tienda → admin | `{ textos: string[] }` (el tocado y sus 2 ancestros) |

#### Decisiones del usuario (2026-10-15)

- Mecanismo: **búsqueda inversa en el admin** (B1).
- Idioma sin publicar: **permiso firmado de vista previa** (B3, opción a). `GET /admin/idiomas/vista-previa?tiendaId=&idioma=` (roles que traducen; el idioma tiene que estar elegido por la tienda) devuelve un token de 1 hora firmado como los de reserva. La tienda lo recibe en la URL del iframe y lo manda en cada pedido; `resolverIdioma` amplía la Specification: visible = elegido ∧ (base ∨ publicado **∨ permiso de vista previa válido para esa tienda e idioma**). Sin token, nada cambia. Las cachés por idioma no filtran: sin permiso el pedido se resuelve al base y usa otra llave.
- Pantalla: **dividida, solo escritorio** (tienda a la izquierda, texto elegido a la derecha, arriba Navegar / Elegir texto). En celular no se ofrece.

#### Límites

- Lo que no se ve en pantalla (correos, mensajes de error, estados vacíos) sigue en la lista de Traducciones: el modo la complementa, no la reemplaza.
- Pantallas que necesitan datos (el seguimiento de una reserva) solo se ven si se entra con un enlace real.

### Antipatrones evitados

- Sin `if (fuente === …)` en el admin ni `if (rubro === …)` en ningún lado: lugares por Strategy y visibilidad por capacidad.
- Sin copiar claves por pantalla en la BD: una clave, varias ubicaciones.
- Sin tocar el modelo de escritura: guardado y publicación siguen por grupo.

---

## Contratos

| # | Test | Repo |
|---|---|---|
| 1 | `claves-tienda.json` al día con el código | Store |
| 2 | Cada fuente de `FUENTES` se localiza en su ruta `/store` | Backend |
| 3 | Sin literales de idioma (`"en"`, `'es'`, `enIngles`…) fuera de `modules/idiomas/` y `core/i18n/` | Ambos |
| 4 | Cadena de respaldo (manual, al día, desactualizada, vacío; tienda → plataforma → español) | Backend |
| 5 | Cada rubro declara `gruposTextos` y cada grupo existe | Backend |
| 6 | Ninguna ruta ni job llama a la IA de traducción salvo las de "Traducir con IA" | Backend |
| 7 | `idiomaVisible`: oculto si le falta un texto fijo de sus grupos; visible al 100 % | Backend |
| 8 | Todo campo de texto de las secciones de diseño (leído del schema) se traduce o está marcado como no traducible | Backend |
| 9 | Toda carpeta de rubro de la tienda tiene grupo de textos (`npm run claves` falla si no) | Store |
| 10 | Todo archivo con textos fijos tiene pantalla y sección con nombre (tienda: `npm run claves`; servidor: test de claves) | Ambos |

## Orden de implementación

1. Schema y SQL (1.1) → módulo `idiomas` (B1) → `textoLocal` (B3).
2. `ctx` en `GenericController` → almacenes y `FUENTES` (B4) → `localizar` y decorator (B5) → middleware y Specification (B2).
3. Catálogo de claves (B8) → `tienda_textos` + `/store/textos` → textos del servidor (B7) y migración del inglés.
4. Store (S1–S4) → admin.
5. Comando de IA (B6) y borrado del disparo automático.
6. Rubro productos (1.13–1.19).
