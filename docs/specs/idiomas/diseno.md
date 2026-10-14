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

## Orden de implementación

1. Schema y SQL (1.1) → módulo `idiomas` (B1) → `textoLocal` (B3).
2. `ctx` en `GenericController` → almacenes y `FUENTES` (B4) → `localizar` y decorator (B5) → middleware y Specification (B2).
3. Catálogo de claves (B8) → `tienda_textos` + `/store/textos` → textos del servidor (B7) y migración del inglés.
4. Store (S1–S4) → admin.
5. Comando de IA (B6) y borrado del disparo automático.
6. Rubro productos (1.13–1.19).
