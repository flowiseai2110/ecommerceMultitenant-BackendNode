# Spec: idiomas de la tienda

> Estado: **diseño** (2026-10-14). Tareas: [tasks.md](tasks.md). Patrones por tarea: [diseno.md](diseno.md).
> Origen: requerimiento "tienda en lenguas originarias" (quechua, awajún) para comprar desde Cusco, Ayacucho, Amazonas y Loreto. Evoluciona el inglés de [hospedaje-completo](../hospedaje-completo/spec.md) C3 a N idiomas.
> Repos: BackendNode, FrontendStore, FrontendAdmin (elección de idiomas, pantalla Traducciones y pantalla de idiomas de la plataforma; el admin sigue en español).

## Problema

El dueño escribe su tienda en español. Quiere ofrecerla también en otras lenguas (quechua, awajún, inglés…) para que sea amigable con quien compra. Hoy el sistema solo sabe de `es` y `en`, y el inglés está fijo en el código:

| Dónde | Hoy |
|---|---|
| `tiendas.schema.js` | `idiomas: z.enum(["es", "en"]).max(2)` |
| `tiendas.store.routes.js`, `categorias.store.routes.js` | `req.query.lang === "en"`; categorías cambia de controlador entero según el idioma |
| `traducciones.service.js` | `const IDIOMA = "en"`, `textoEn()` |
| `traducir-ia.js` | prompt fijo español → inglés para turistas |
| `reservas.idiomaHuesped` | `VarChar(2)`: no entran códigos de 3 letras (p. ej. `agr`, awajún) ni con región |
| Store `idioma.service.ts` | `type Idioma = 'es' \| 'en'`; `TEXTOS_EN` importado siempre |
| Store, cobertura de `\| t` (2026-10-14) | reservas 21/64 archivos, home 4/21; **cart, catalog, category, checkout, product, order-tracking, account: 0** |

El rubro productos (el que usaría la gente de esas zonas) no está traducido en ninguna parte.

## Investigación (resumen)

- Quechua: ~3,8 M de hablantes maternos (censo 2017). Variantes escritas distintas (chanka/Ayacucho `quy`, collao/Cusco `quz`). Google Translate y NLLB lo soportan con calidad discutida.
- Awajún: ~56 600 hablantes, sobre todo Amazonas (Condorcanqui, Bagua) y norte de Loreto. Sin traductor automático comercial; corpus académico Awajun-OP (2024) con calidad aún baja. Requiere traductor humano (registro ReNITLI del Ministerio de Cultura).
- Muchos hablantes leen mejor castellano que su lengua: el audio y WhatsApp ayudan más que solo el texto (fuera de alcance; ver "Después").
- Ley 29735 reconoce derechos lingüísticos; no se halló obligación para tiendas privadas.

## Decisiones

1. **Idioma base fijo: español.** El alcance es Perú y los países que vienen (Bolivia, Chile, Argentina, Colombia) también escriben en español. Constante `IDIOMA_BASE = "es"` en `modules/idiomas/`; ningún código escribe `"es"` suelto. Sin columna `idiomaBase`.
2. **El dueño agrega idiomas** desde la lista de idiomas activos de la plataforma (D1). Si no agrega ninguno, la tienda no muestra selector ni nada nuevo.
3. **El visitante no traduce con IA.** Elige en un selector arriba entre los idiomas que la tienda ofrece. El asesor de IA de la tienda, si le hablan en otra lengua, responde y menciona los idiomas disponibles del sitio.
4. **Admin en español**: el admin en otros idiomas es otra spec.
5. **Alcance: todos los rubros**, en fases: primero productos, luego los demás. El inglés de hotel y tours sigue funcionando igual en todas las fases (salvo que ya no se traduce al guardar).
6. **País fuera de alcance** (moneda, impuestos, libro de reclamaciones, pagos por país): esta spec es solo idioma.
7. **La IA nunca traduce sola** (regla general del producto, 2026-10-14). El dueño elige por cada texto: escribir su traducción o pulsar "Traducir con IA" (uno, una fuente o "todo lo que falta"). Cada edición cuesta si la IA se dispara al guardar. Se elimina `traducirTrasGuardar`/`programarTraduccion` (hoy montado en `/tiendas`, `/categorias`, `/productos` y `/reservas` del admin), también para el inglés.
8. **Idiomas agrupados por país**: Perú (español por defecto, quechua, aimara), Estados Unidos (inglés); después Brasil (portugués) y los que la plataforma agregue. El dueño elige de esa lista.
9. **Los idiomas viven en la BD** y los agrega el administrador de la plataforma desde el admin (`requirePlatformAdmin`), sin deploy.
10. **El dueño traduce su tienda, incluidos los textos fijos** ("Agregar al carrito", checkout, correos). Caso real: un hotelero alemán bilingüe en Miraflores que vendía solo a alemanes y traducía él mismo su web; igual un dueño de Cusco hablante de quechua. La plataforma no está obligada a traducir nada; la IA es una ayuda opcional que el dueño activa (decisión 7).

## Diseño

### D1. Idiomas de la plataforma (tabla `idiomas`)

| Columna | Ejemplo | Uso |
|---|---|---|
| `codigo` (PK) | `qu` | BCP 47; hasta 10 caracteres (`agr`, `es-PE`) |
| `nombre` | `Runasimi` | en la propia lengua: así lo reconoce quien la habla |
| `pais` | `PE` | solo agrupa la lista en el admin; no activa moneda ni nada del país (decisión 6) |
| `locale` | `es-PE` | formato de fechas y números (D10) |
| `ia` | `true` | si se ofrece "Traducir con IA" para ese idioma |
| `aviso_ia` | `true` | el admin advierte "revisa con un hablante" (calidad discutida) |
| `activo`, `orden` | | |

- Datos iniciales: `es` (base), `qu`, `ay` (PE), `en` (US).
- `IDIOMA_BASE = "es"` sigue siendo constante en código (decisión 1): el base no es un dato editable.
- El código compartido pregunta por **capacidades** del idioma (`ia`, `locale`), nunca por su código: no `if (idioma === "qu")`.
- Desactivar un idioma lo saca del selector de todas las tiendas; no borra traducciones.
- Lectura cacheada (cambia muy poco); se invalida al editar.

### D2. El idioma de la petición se resuelve una vez

Middleware de las rutas `/store`: `req.idioma` = `?lang=` si es un idioma activo **y** está en `tienda.idiomas` (de la BD, cacheado); si no, `IDIOMA_BASE`. Reemplaza los `lang === "en"` y el cambio de controlador de categorías. Va en la URL (no en un header) por lo mismo que hoy: la caché pública separa los idiomas.

### D3. Traducción a pedido

- Guardar contenido **no** llama a la IA: solo deja el texto como "sin traducir" o "cambió el español" en Traducciones (los estados ya existen).
- En Traducciones, por idioma: escribir a mano, o "Traducir con IA" sobre un texto, una fuente o lo que falta (solo si el idioma tiene `ia`). Lo que traduce la IA se muestra al público al momento, marcado "automático"; lo que el dueño edita queda "manual".
- El prompt pasa a "de {base} a {destino}" con el nombre y `locale` del idioma.

### D4. Cadena de respaldo del texto (generaliza `textoEn`)

`textoEn(es, tr)` → `textoLocal(base, tr)`: manual → al día → texto base. Función pura, la usan los serializadores de la tienda y la pantalla Traducciones.

### D5. `FUENTES` es la única fuente de verdad + localizador en la tienda

`FUENTES` (traducciones.service.js) ya declara tabla y campos traducibles. Los serializadores de la tienda llaman `localizar(fuente, fila, req.idioma)` con esos campos, sin repetir listas. La traducción vive solo en la capa de la tienda; repositorios y admin no la ven. Formato en BD sin cambios: `traducciones` JSONB `{ <codigo>: { campo: { t, o, m } } }` (`o` = texto base del que salió).

### D6. Errores en la tienda por `code`

La respuesta ya trae `code`. La tienda traduce `code` + parámetros con sus textos; el backend sigue en español para logs y admin. Se evita traducir los ~148 `message` del backend. Los errores que la tienda hoy muestra tal cual llegan pasan a `code` (inventario por fase).

### D7. Textos fijos: en la BD, por tienda

- Tabla `tienda_textos` (`tienda_id`, `idioma`, `clave`, `texto`, `origen` manual | ia, auditoría). La clave es el texto en español, como hoy (`'Agregar al carrito'`, `'Salida|tour'`).
- Tabla `textos_plataforma` (`idioma`, `clave`, `texto`): traducciones que la plataforma ofrece de base, opcionales. El inglés de `textos.en.ts` se migra aquí para que hotel y tours no pierdan nada.
- Texto que ve el visitante: el de la tienda → el de la plataforma → el español.
- La tienda pide `GET /store/textos?lang=qu` (diccionario ya combinado, cacheado por tienda + idioma, invalidado al guardar) antes de pintar, también en SSR: la página llega en ese idioma con `<html lang>` y `hreflang`. Desaparece `textos.en.ts`.
- Admin, pantalla Traducciones: pestaña "Textos de la tienda" junto al contenido, con avance por idioma ("Quechua: 120 de 310").

### D8. Catálogo de claves (de dónde sale la lista que el dueño traduce)

Los textos fijos están en el código de la tienda, pero el admin y la BD necesitan conocerlos.

- Un script del FrontendStore extrae las claves (`'…' | t`, `traducir('…')`) y genera `claves-tienda.json`: `{ clave, grupo }`. El backend lo recibe (copia en el repo) y lo carga a la tabla `textos_claves`.
- **Grupo** de cada clave: `comun`, `productos`, `hotel`, `tours`, `eventos`, `locales`, `canchas`, `correos`, `errores`. Sale de la carpeta del componente (`features/reservas/hotel/…` → `hotel`; marco y home → `comun`).
- Cada rubro declara sus grupos en su `datos.js` (`gruposTextos`). El dueño de una tienda de productos ve solo `comun` + `productos` + `correos` + `errores`: no traduce textos de hotel que nunca se muestran.
- Las claves de correos (backend) y de errores (`code`, D6) entran al mismo catálogo.

### D9. Pantalla "Idiomas" de la plataforma

En el admin, solo para el administrador de la plataforma: alta, edición y desactivación de idiomas (D1) y, opcionalmente, sus textos de plataforma (D7).

### D10. Formato ≠ idioma

`locale` del registro decide fechas y números (`Intl`). Quechua y aimara no tienen nombres de meses en CLDR: van como claves del catálogo (grupo `comun`) y los traduce el dueño.

### D11. El idioma queda en el pedido

`pedidos.idioma` (nuevo) y `reservas.idiomaHuesped` ampliado a `VarChar(5)`. Los correos al cliente salen en ese idioma (textos de correo por idioma en el backend; respaldo: español).

## Contratos (tests)

1. `claves-tienda.json` está al día con el código de la tienda (test en el front: toda clave usada existe en el catálogo y con grupo).
2. Cada campo de `FUENTES` pasa por `localizar` en la ruta `/store` que lo entrega.
3. Ningún archivo fuera de `modules/idiomas/` y `core/i18n/` compara contra un código de idioma literal (`"en"`, `"es"`, `"qu"`…).
4. Cadena de respaldo del contenido (manual, al día, desactualizada, vacío) y de los textos fijos (tienda, plataforma, español).
5. Cada rubro declara `gruposTextos` y cada grupo existe en el catálogo.
6. Ningún router ni job llama a la IA de traducción: solo las rutas "Traducir con IA" del admin.
7. Un idioma no es visible en la tienda si le falta un texto fijo de sus grupos (P5).

## Decisiones tomadas durante el diseño

- **P5 (b).** Un idioma aparece en el selector de la tienda solo cuando el dueño completó el 100 % de los textos fijos de sus grupos (`comun` + los de su rubro). El contenido (productos, categorías) puede quedar a medias: lo que falta se ve en español. El admin muestra el avance.
- **P5, refinada (2026-10-14): el 100 % se exige para publicar, no para seguir publicado.** Un idioma aparece la primera vez que llega al 100 % y queda publicado (`tiendas.idiomas_publicados`). Si después un deploy agrega textos fijos, el idioma sigue visible y lo nuevo se ve en español mientras tanto; el admin avisa "Hay N textos nuevos por traducir" con acceso directo. Motivo: con la regla estricta, cada deploy con un texto nuevo ocultaría el idioma de todas las tiendas sin que el dueño hiciera nada. Quitar el idioma de la tienda lo despublica (volver a agregarlo exige el 100 % otra vez). Las tiendas que hoy tienen inglés nacen publicadas (SQL de la fase).
- **Sin comparaciones de idioma en ninguna fase.** Las ~30 comparaciones con `"en"`/`"es"` de hotel, tours y correos se migran en el núcleo de la fase 1 (ver [diseno.md](diseno.md)), no en la fase 2.

## Fuera de alcance / después

- Admin en otros idiomas (otra spec).
- País: moneda, impuestos, legal y pagos por país.
- Buscar productos por texto traducido (hoy busca en las columnas en español).
- Audio de pantallas clave y voz (la voz awajún de Meta MMS no permite uso comercial).
- Traducir lo que escribe el cliente (reseñas, notas).
