# Plan técnico: estructura de la tienda configurable

> Implementa [spec.md](spec.md). Tareas y estado: [tasks.md](tasks.md).

## Flujo

```
Admin · Diseño
  GET  /admin/diseno/catalogo                              → { plantillas, paletas, tipografias }
  GET  /admin/tiendas/:id/diseno                           → + tema, estructura (migrada; null si nunca se eligió), puedeDeshacer, urlTienda
  POST /admin/tiendas/:id/diseno/estructura/aplicar        → { plantillaId } → copia con reglas R3, guarda (la previa en estructura_anterior), devuelve la estructura
  POST /admin/tiendas/:id/diseno/estructura/deshacer       → vuelve a estructura_anterior
  PUT  /admin/tiendas/:id/diseno { tema?, estructura? }    → valida (Zod) y reemplaza cada clave entera

Storefront
  GET /store/tiendas?slug=x → data[0].diseno.tema = { estructura, paleta, tipografia }   (resuelto)
    DisenoState.base = diseno.tema (prod) | selector de desarrollo (dev)
    campaña encima, igual que hoy
```

## Decisiones

| Decisión | Por qué | Alternativa descartada |
|---|---|---|
| La tienda guarda una **copia completa** de la plantilla | Lo que se guarda es lo que se ve; el editor trabaja una lista simple, sin combinar capas al reordenar o agregar | Guardar solo los cambios sobre la plantilla (se complica con reorden y secciones agregadas) |
| La copia se arma **en el backend** (`aplicar`) | Las reglas R3 (sin testimonios, oferta oculta, `ejemplo`, hero heredado) viven en un solo lugar y se testean | Copiar en el admin y mandar el PUT |
| Plantillas, paletas y tipografías como **código** del backend (`modules/diseno/*.js`) | Son de la plataforma y cambian con un deploy, igual que los presets de campañas | Tabla con CRUD de superadmin |
| El backend **resuelve** el tema (ids → valores) | El storefront deja de depender del mock y el admin dibuja miniaturas con el mismo catálogo | Que el storefront busque los ids en sus catálogos (tercera copia que se desincroniza) |
| Claves nuevas en `tienda_configuraciones` (`tema`, `estructura`) | Mismo patrón que `anuncio`, `hero`, `campanas`: sin migración | Tabla `tienda_secciones` |
| `layout.producto` dentro de la estructura | Viaja con la plantilla y se restaura con ella; no suma otra clave | Clave `producto` aparte |
| Sin estructura guardada → `clasica`, no la del rubro | Ninguna tienda cambia de aspecto sin que el dueño lo elija | Asignar por rubro automáticamente |
| Reordenar con ↑↓ | Mobile-first: arrastrar en el celular es impreciso y choca con el scroll | Drag and drop (CDK) |
| Un tipo desconocido se ignora en el storefront | Permite desplegar backend → admin → tienda sin romper una tienda con un tipo nuevo | Fallar el render |
| `formato` + `migrarEstructura()` al leer | Las copias quedan con la forma del día en que se aplicaron; migrar al leer evita scripts sobre la BD y funciona igual para el storefront y el admin (patrón `migrate()` de Puck) | Script SQL de migración por cada cambio de formato |
| Afirmaciones de ejemplo **ocultas** hasta que el dueño las revise | La plataforma no debe publicar garantías ni plazos que la tienda no ofreció (D.L. 1044); Shopify prohíbe usar contenido demo como valor por defecto | Publicarlas visibles con un aviso en el admin (versión anterior de esta spec) |
| `estructura_anterior` para "Deshacer" | Tiendanube guarda el diseño publicado como borrador al publicar otro; aplicar una plantilla es el cambio más destructivo del editor | Historial completo de versiones |
| v1 sin borrador: guardar publica | Es lo que hacen Shopify (al editar el tema publicado) y el "Editar diseño actual" de Tiendanube; el borrador con link de vista previa queda para la Fase 5 | Borrador desde la v1 |
| Vista previa por **link** (Fase 5), no por iframe | Se abre en el celular, que es donde está el dueño; el iframe con `postMessage` (Storyblok) solo sirve con pantalla ancha | Iframe lado a lado en el admin |

## Modelo de datos

Sin cambios de esquema. Claves nuevas en `tienda_configuraciones` (categoría `diseno`), agregadas a `DISENO_CLAVES`: `tema`, `estructura` y `estructura_anterior` (la misma forma que `estructura`; no se publica en el storefront).

```jsonc
// clave "tema"
{ "paleta": "emerald-clara", "tipografia": "moderna" }

// clave "estructura": copia completa de una plantilla
{
  "formato": 1,
  "plantillaId": "moda",
  "plantillaVersion": 1,
  "radio": "recto",
  "encabezados": "editorial",
  "layout": {
    "header": { "logo": "centro" },
    "productCard": { "cta": "boton", "imagen": "vertical" },
    "producto": {
      "galeria": "lado",
      "envio": { "mostrar": true, "texto": null },
      "devoluciones": { "mostrar": true, "texto": null },
      "relacionados": true,
      "resenas": true,
      "beneficios": [{ "icono": "envio", "titulo": "Envíos a todo el Perú" }]
    }
  },
  "home": {
    "secciones": [
      { "id": "hero", "tipo": "hero", "variante": "imagen-completa", "titulo": "Lo nuevo ya llegó", "subtitulo": "...", "textoBoton": "Ver la colección" },
      { "id": "cinta", "tipo": "cinta", "estilo": "oscuro", "items": ["..."], "oculto": true, "ejemplo": true },
      { "id": "testimonios", "tipo": "testimonios", "fondo": "superficie", "titulo": "Ellas ya lo usan", "items": [] },
      { "id": "oferta", "tipo": "oferta", "oculto": true, "titulo": "...", "texto": "...", "textoBoton": "...", "terminaEn": null }
    ]
  }
}
```

Cambios al modelo `SeccionHome` actual (los 3 repos):
- `SeccionBase` += `ejemplo?: boolean`.
- `SeccionOferta.terminaEn`: `string | null`.
- `DisenoLayout` += `producto` (con defaults si falta, para no romper plantillas viejas).

## Límites de validación

| Campo | Límite |
|---|---|
| Secciones | máx. 15; `hero` máx. 1 y primera; `categorias`, `testimonios`, `faq`, `oferta`, `cinta`, `contacto` máx. 1; `imagen-texto` máx. 3; `productos` máx. 4 |
| `id` | `^[a-z0-9-]{1,40}$`, único |
| `titulo` | 80 (hero 100, como la clave `hero` actual) |
| `subtitulo` | 160 (hero 300) |
| `texto` | 400 |
| `kicker` | 40 |
| `textoBoton` | 30 (hero 50) |
| `cinta.items` | 1-6 × 40 (igual que la cinta de campañas) |
| `faq.items` | 1-10; pregunta 120, respuesta 500 |
| `beneficios.items` | 2-4; título 40, texto 80 |
| `testimonios.items` | 0-6; nombre 40, ciudad 40, texto 300, estrellas 1-5 |
| `productos.limite` | 4-12 |
| `oferta.terminaEn` | ISO con offset; obligatorio si la sección no está oculta |
| `producto.envio.texto`, `devoluciones.texto` | 300 |
| `producto.beneficios` | 0-3; título 40 |

Schema Zod: unión discriminada por `tipo` (`z.discriminatedUnion`) más un `superRefine` sobre la lista para las reglas de cantidad y posición. El error apunta a la sección culpable (`home.secciones.3.titulo`).

## Respuesta al storefront

```jsonc
"diseno": {
  "anuncio": { ... }, "hero": { ... },     // hero: solo lo usan tiendas sin estructura guardada
  "widgets": [ ... ], "campana": { ... } | null,
  "tema": {
    "estructura": { /* la de arriba, sin ofertas vencidas */ },
    "paleta": { "id": "emerald-clara", "nombre": "...", "primario": "#059669", "neutro": "zinc", "fondos": { ... } },
    "tipografia": { "id": "moderna", "nombre": "...", "titulos": "poppins", "cuerpo": "inter" }
  }
}
```

`disenoPublico(diseno, ahora)` (en `modules/campanas/resolver.js`) pasa a llamar a `resolverTema(diseno, ahora)` del módulo nuevo. Sin estructura guardada → `copiarPlantilla('clasica', { hero: diseno.hero })`, con las mismas reglas R3.

## Módulo backend `modules/diseno/`

| Archivo | Contenido |
|---|---|
| `plantillas.js` | Las 7 plantillas portadas de `estructuras.mock.ts`, congeladas, con `version` y `rubro`; `buscarPlantilla(id)`, `plantillaPara(rubro)` |
| `paletas.js`, `tipografias.js` | Portados de `paletas.ts` y `tipografias.ts` del storefront |
| `secciones.schema.js` | Zod de cada tipo de sección, de `layout` y de la estructura completa; `temaSchema` |
| `copia.js` | `copiarPlantilla(plantilla, { estructuraAnterior, hero })` puro, con las reglas R3 |
| `migrar.js` | `FORMATO_ACTUAL` y `migrarEstructura(estructura)` pura: aplica los pasos `formato n → n+1` en orden; sin pasos al inicio (formato 1) |
| `presets.js` | Valores iniciales de cada tipo al agregar una sección (R4.2), con texto instructivo |
| `resolver.js` | `resolverTema(diseno, ahora)` puro: ids → valores, defaults, filtro de ofertas vencidas |
| `diseno.admin.routes.js` | `GET /admin/diseno/catalogo` (rol `viewer`) y `POST /admin/tiendas/:id/diseno/estructura/aplicar` (rol `editor`) |

## Storefront

- `DisenoState.base`: en producción sale de `store.diseno.tema`; en desarrollo, del selector (como hoy). Si `tema` no llega (backend viejo), usa `ESTRUCTURAS[0]` y los catálogos locales.
- `estructuras.mock.ts` se queda solo para el selector de desarrollo, con un comentario que dice que el original está en el backend.
- `app-home-sections`: `@default` no dibuja nada para tipos desconocidos.
- `testimonials-section`: sin items y con menos de 3 reseñas reales, no dibuja la sección.
- `offer-section`: con `terminaEn` null o vencido, no dibuja nada.
- `hero-banner`: prioridad campaña > sección hero > clave `hero` > nombre de la tienda (la clave `hero` solo pesa si la sección no trae texto).
- `product-page`: lee `layout().producto` para la galería, los acordeones, los relacionados, las reseñas y los beneficios.

## Admin

- `pages/diseno` pasa a tener pestañas (R7.1). "Portada de inicio" se convierte en el editor de la sección hero cuando hay estructura guardada.
- Componentes nuevos: `plantilla-picker`, `paleta-picker`, `tipografia-picker` (miniaturas), `secciones-editor` (lista con ↑↓, toggle y menú de duplicar o quitar), un formulario por tipo (`seccion-hero-form`, `seccion-productos-form`, …), `seccion-agregar` (hoja inferior con el catálogo de tipos) y `producto-opciones`.
- Servicio: `tienda-diseno.service.ts` += `getCatalogo()`, `aplicarPlantilla(id)`. Tipos en `models/diseno.model.ts` (copia de los del storefront).
- Las secciones con `ejemplo: true` aparecen en un bloque "Por revisar" arriba de la lista. Activarlas envía `oculto: false, ejemplo: false`.
- Después de aplicar o restaurar una plantilla, un toast con "Deshacer" (y un botón en la pestaña mientras exista `estructura_anterior`).

## Despliegue

Backend → admin → tienda. Un storefront viejo ignora `diseno.tema` y sigue viendo la clásica. Un admin viejo no envía `tema` ni `estructura`.
