# Spec: estilo de componentes por plantilla

> Estado: **borrador**, sin implementar. Decisiones tomadas con el dueño del producto el 2026-10-12.
> Repos: FrontendStore (principal), BackendNode (catálogo y resolución). FrontendAdmin no cambia en la v1.
> Base: [estructura-tienda](../estructura-tienda/spec.md) (plantillas, tema y resolución), [layout-por-rubro](../layout-por-rubro/spec.md) (armazón por rubro) y [diseno-por-rubro](../diseno-por-rubro/spec.md) (plantillas por rubro).

## Problema

La plantilla decide la estructura de la tienda: secciones de la home, layout, radio de los bordes y estilo de los encabezados. La paleta y la tipografía deciden el color y las letras. Pero **los componentes básicos se ven iguales en todas las plantillas**: botones, cajas de texto, combobox, tarjetas y tablas usan las mismas clases (`.btn-*`, `.input`, `.card` en `FrontendStore/src/styles.css`) o clases sueltas de Tailwind. "Moda" y "Tecnología" tienen homes distintas, pero el mismo botón, el mismo campo y la misma tarjeta. Por eso la tienda se ve básica.

Además, una parte de la interfaz ni siquiera usa las clases comunes:

| Componente | Situación en FrontendStore (2026-10-12) |
|---|---|
| Botones | ~72 usos de `.btn-primary/secondary/outline` |
| Tarjetas | ~116 usos de `.card`; el borde es un gris fijo (`#f3f4f6`) |
| `<input>` | 66 en total; `.input` aparece 63 veces, pero ese conteo incluye selects, así que varios inputs no la usan |
| `<select>` | 24 en total, solo 14 con `.input` |
| `<textarea>` | 5 |
| Tablas | 2 (cotización de locales y seguimiento de reserva), sin clase común |
| Colores fijos sueltos | ~173 `bg-white`, `bg-gray-50`, `border-gray-200`… |

## Objetivo

Que **cada plantilla traiga su estilo de componentes**: cómo se ven sus botones, sus campos (input, select, combobox, textarea), sus tarjetas y sus tablas. El dueño **no configura nada nuevo**: elige la plantilla, la paleta y la tipografía como hoy, y el estilo de componentes viene con la plantilla.

## Decisiones

| # | Decisión | Por qué |
|---|---|---|
| D1 | El estilo de componentes es parte de la **plantilla**, no una opción del dueño | El dueño no tiene por qué saber diseñar; el estilo lo cuida quien diseña la plantilla, igual que hoy `radio` y `encabezados` |
| D2 | Se **resuelve en vivo** desde la plantilla de origen (`plantillaId`); **no se copia** a la estructura de la tienda | El dueño no lo edita, así que no hay datos suyos que proteger (a diferencia de las secciones, estructura-tienda R3). Así una mejora del estilo de "Moda" llega a todas las tiendas que la usan |
| D3 | **3 estilos como máximo** por componente | Cada estilo es diseño que hay que mantener y probar con todas las paletas y fondos |
| D4 | Aplica a **todos los rubros**, incluidos los de reserva | Los formularios de reserva son donde más se notan los campos y los combobox |
| D5 | Se traduce a **variables `--store-*`** | El script de arranque de `index.html` y `ThemeService` ya aplican solo `--store-*` desde la caché: sin cambios en ellos y sin parpadeo |
| D6 | El **rol** de un botón (primario, secundario, contorno) lo decide el componente; el **estilo** (forma, peso, mayúsculas), la plantilla | Son ejes distintos: un botón en contorno de "Belleza" sigue siendo contorno, pero con forma de píldora |
| D7 | Los estilos usan **solo tokens de color** (`--color-primary`, `--scheme-*`), nunca colores fijos | Cualquier plantilla combina con cualquier paleta (estructura-tienda: el tema es independiente de la estructura) |

### Patrón

Strategy con datos, como `radio`, sin componentes por plantilla. Builder no aplica: un botón no se construye por pasos, se elige un estilo. Abstract Factory tampoco: la familia de componentes depende del **rubro** (layout-por-rubro), y el estilo depende de la **plantilla**, que es otro eje; mezclarlos multiplicaría las piezas (rubros × plantillas). Solo cuando un estilo cambie la **estructura** de un componente (no su piel) se usa un `@switch` por estilo dentro del componente, como `section-header` con `encabezados`.

## Conceptos

- **Estilo de componentes** (`componentes`): un estilo por cada tipo de componente, fijado por la plantilla:
  ```ts
  interface EstiloComponentes {
    botones: 'estandar' | 'pildora' | 'marcado';
    campos: 'bordeado' | 'relleno' | 'subrayado';
    tarjetas: 'borde' | 'sombra' | 'plana';
    tablas: 'limpia' | 'rayada' | 'bordes';
  }
  ```
- **Campo:** todo control de texto o de elección: `<input>`, `<select>`, `<textarea>` y los combobox propios (`ubigeo-combobox`, `ubicacion-selector`, el buscador). Checkbox y radio no entran (ver Alcance).

## Alcance

**Incluye**
- `componentes` en cada plantilla del catálogo del backend (las 15) y en el tema resuelto.
- Tokens `--store-*` y reglas CSS para los 4 componentes en sus 3 estilos.
- Consolidar en FrontendStore todo botón, campo, tarjeta y tabla en las clases comunes, y quitar los colores fijos que impiden que el tema llegue.
- Mejorar el estilo base (el que hoy ve toda tienda): estados hover, foco y deshabilitado.
- Banco de pruebas: galería de desarrollo, capturas automáticas y test de contrato.

**No incluye** (futuro)
- Que el dueño cambie el estilo de componentes (D1).
- Checkbox, radio, badges, chips, tabs, modales, toasts, paginación y selector de cantidad. Mantienen el estilo base, que sí se mejora. Se suman en una fase siguiente con el mismo mecanismo.
- Cambios de estructura de la tarjeta de producto: siguen en `layout.productCard` (`cta`, `imagen`). `tarjetas` solo cambia la piel (fondo, borde, sombra) de todas las tarjetas, incluida la de producto.
- El admin. No muestra ni edita `componentes` en la v1. Las miniaturas de plantillas pueden mostrarlo después (R9).

## Requisitos

Formato: *Cuando [condición], el sistema debe [comportamiento].*

### R1 — Catálogo (BackendNode)
- **R1.1** Cada plantilla de `modules/diseno/plantillas.js` declara `componentes` con los 4 estilos. Un test falla si una plantilla no lo declara o usa un valor fuera de la lista.
- **R1.2** Cambiar `componentes` de una plantilla **no** sube su `version`: la versión cuenta cambios del contenido que se copia (estructura-tienda R1.3), y `componentes` no se copia (D2).
- **R1.3** `GET /admin/diseno/catalogo` incluye `componentes` en cada plantilla.

### R2 — Resolución (BackendNode)
- **R2.1** `resolverTema()` devuelve `componentes` junto a `estructura`, `paleta` y `tipografia`, tomado de la plantilla de la estructura vigente (`buscarPlantilla(base.plantillaId).componentes`).
- **R2.2** Si la plantilla ya no existe en el catálogo, se usa `COMPONENTES_DEFAULT` (el de `clasica`).
- **R2.3** `estructuraSchema` **no** acepta `componentes`: el PUT de la estructura no puede fijarlo y `copiarPlantilla()` no lo copia.
- **R2.4** Una campaña vigente nunca cambia `componentes` (como con la estructura, estructura-tienda R6.4).

### R3 — Aplicación en FrontendStore
- **R3.1** `TemaTienda` y `DisenoConfig` suman `componentes: EstiloComponentes`. Si el backend no lo manda (versión anterior), se usa `COMPONENTES_DEFAULT`.
- **R3.2** `buildThemeVars()` traduce `componentes` a variables `--store-*` (R4) y las agrega a `THEME_VAR_NAMES`, para que se limpien al cambiar de tienda.
- **R3.3** Las reglas de `styles.css` leen esas variables con un valor por defecto igual al estilo `clasica`: `var(--store-btn-radio, var(--radius-lg))`.
- **R3.4** `COMPONENTES_DEFAULT` (`estandar`, `bordeado`, `borde`, `limpia`) reproduce el aspecto actual. Una tienda sin estructura guardada (plantilla `clasica`) no cambia de aspecto (estructura-tienda R2.4), salvo por la mejora del estilo base.
- **R3.5** El catálogo local de desarrollo (`estructuras.mock.ts`) declara `componentes` en cada plantilla, con los mismos valores que el backend.

### R4 — Estilos y tokens
Valores de referencia. Los definitivos se ajustan en la galería (R8) antes de cerrar la fase 2.

**Botones** (`.btn-primary`, `.btn-secondary`, `.btn-outline`):

| Estilo | Radio | Peso | Texto | Uso típico |
|---|---|---|---|---|
| `estandar` | `--radius-lg` (sigue al radio de la plantilla) | 500 | normal | General, tecnología |
| `pildora` | `9999px` | 600 | normal, más padding horizontal | Belleza, mascotas, hospedaje |
| `marcado` | `--radius-md` | 700 | mayúsculas, `letter-spacing: 0.06em` | Alimentos, eventos, canchas |

Tokens: `--store-btn-radio`, `--store-btn-peso`, `--store-btn-texto` (`none` / `uppercase`), `--store-btn-espaciado`, `--store-btn-px`.

**Campos** (`.input` en input, select, textarea y combobox):

| Estilo | Borde | Fondo | Radio | En foco |
|---|---|---|---|---|
| `bordeado` | 1px en los 4 lados, `--scheme-line-strong` | `--scheme-surface` | `--radius-lg` | borde primario + halo |
| `relleno` | 1px transparente | `--scheme-raised` | `--radius-lg` | borde primario + fondo `--scheme-surface` |
| `subrayado` | solo inferior, 1px | transparente | 0 | inferior de 2px en primario |

Tokens: `--store-campo-borde` (`border-width`), `--store-campo-color-borde`, `--store-campo-fondo`, `--store-campo-radio`, `--store-campo-px`.

**Tarjetas** (`.card`, `.card-hover` y la tarjeta de producto):

| Estilo | Borde | Sombra | Hover (`.card-hover`) |
|---|---|---|---|
| `borde` | 1px `--scheme-line` | sutil | sombra media |
| `sombra` | ninguno | media | sombra alta y sube 2px |
| `plana` | ninguno | ninguna | fondo `--scheme-raised` |

Tokens: `--store-card-borde`, `--store-card-sombra`, `--store-card-sombra-hover`.

**Tablas** (clase nueva `.tabla`):

| Estilo | Filas | Celdas | Encabezado |
|---|---|---|---|
| `limpia` | línea inferior `--scheme-line` | sin bordes verticales | texto `--scheme-fg-muted`, sin fondo |
| `rayada` | filas pares con `--scheme-raised` | sin bordes | fondo `--scheme-raised` |
| `bordes` | línea en todas | bordes verticales | fondo `--scheme-raised`, texto en negrita |

Tokens: `--store-tabla-fila-par`, `--store-tabla-borde-celda`, `--store-tabla-fondo-encabezado`.

### R5 — Reglas de diseño (todas las variantes)
- **R5.1** Solo tokens de color (D7). Ninguna regla de `R4` usa hex ni `rgba` de un color fijo, salvo la opacidad de las sombras.
- **R5.2** Cada estilo se ve bien sobre los tres fondos donde aparecen los componentes: claro (`superficie`/`pagina`), primario y oscuro (cinta, hero sobre imagen, footer oscuro). Se resuelve con los tokens `--scheme-*`, no con reglas por sección.
- **R5.3** Altura mínima táctil de 44px en botones y campos, en todos los estilos.
- **R5.4** Foco visible en todos los estilos (`:focus-visible`), con contraste de al menos 3:1 contra el fondo (WCAG 2.2, SC 1.4.11). En `subrayado`, el foco no puede ser solo un cambio de color: también cambia el grosor.
- **R5.5** Texto de botones y campos con contraste de al menos 4.5:1 (SC 1.4.3) con cada paleta del catálogo. El botón primario ya usa `--store-on-primary`.
- **R5.6** Estado deshabilitado distinguible en todos los estilos (opacidad y `cursor: not-allowed`).

### R6 — Consolidación previa (FrontendStore)
- **R6.1** Todo `<input>` de texto, `<select>` y `<textarea>` usa `.input`. Los combobox propios (`ubigeo-combobox`, `ubicacion-selector`, `search-overlay`) usan `.input` en su campo.
- **R6.2** Las 2 tablas usan `.tabla`.
- **R6.3** Botones y tarjetas hechos con clases sueltas de Tailwind pasan a `.btn-*` y `.card`.
- **R6.4** Se reemplazan los colores fijos (`bg-white`, `bg-gray-50`, `border-gray-200`, `#f3f4f6`…) por tokens (`bg-surface`, `bg-raised`, `border-line`…) en los componentes del alcance.
- **R6.5** Un test o lint simple marca un `<select>` o `<textarea>` sin `.input` en `src/app`, para que no vuelva a pasar.

### R7 — Excepciones
No siguen el estilo de componentes, y la galería lo indica:
- El botón de Google (`google-signin-button`): su diseño lo fija Google.
- Lo que va en iframes de terceros: mapas, transmisiones y pasarelas de pago.
- Los controles del navegador sin estilo propio: calendario nativo de `<input type="date">` y la lista desplegada de un `<select>`.

### R8 — Banco de pruebas (FrontendStore)
- **R8.1 Galería.** Ruta `/dev/estilos`, registrada **solo** cuando `environment.production` es `false` (no basta con ocultarla). Muestra:
  - cada componente del alcance (botones en sus 3 roles; input, select, combobox, textarea; tarjeta y tarjeta de producto; tabla) en sus estados normal, hover, foco, deshabilitado y error;
  - **una columna por estilo** (los 3 estilos de un componente lado a lado), aplicando las variables a un contenedor con `buildThemeVars()`, no a `<html>`;
  - cada columna sobre los tres fondos de R5.2;
  - selectores de paleta y tipografía arriba, sin `localStorage`;
  - una vista "por plantilla" que pinta la combinación de cada plantilla del catálogo local.
  No depende del backend ni de una tienda.
- **R8.2 Capturas.** Un test de Playwright en `e2e/` abre la galería y compara capturas (`toHaveScreenshot`) **por estilo** con 3 paletas, una de cada versión de fondo (Contraste, Clara y Tinte): 4 componentes × 3 estilos × 3 paletas. Se prueba por estilo y no por plantilla porque las plantillas solo combinan estilos ya probados, y así el número de capturas no crece con cada plantilla nueva.
- **R8.3 Contrato.** Un test unitario en FrontendStore fija qué variables produce cada estilo, y otro en BackendNode fija los `componentes` de cada plantilla (como `negocio/uis.spec.ts`: un cambio ahí debe ser intencional).
- **R8.4** `PlantillaSwitcherComponent` sigue apagado. Solo sirve para revisar páginas reales al final.

### R9 — Admin (fase posterior, opcional)
- **R9.1** Las miniaturas de plantillas en la pestaña Apariencia pueden mostrar un botón y un campo con el estilo de la plantilla, leyendo `componentes` del catálogo (R1.3).

## Asignación inicial por plantilla

Propuesta. Se confirma en la galería (R8.1) antes de cerrar la fase 2.

| Plantilla | Rubro | Radio | Encabezados | Botones | Campos | Tarjetas | Tablas |
|---|---|---|---|---|---|---|---|
| `clasica` | productos | suave | comercial | estandar | bordeado | borde | limpia |
| `moda` | productos | recto | editorial | estandar | subrayado | plana | limpia |
| `tecnologia` | productos | suave | impacto | estandar | bordeado | borde | bordes |
| `belleza` | productos | redondeado | editorial | pildora | relleno | sombra | limpia |
| `alimentos` | productos | suave | impacto | marcado | relleno | borde | rayada |
| `mascotas` | productos | redondeado | impacto | pildora | relleno | sombra | rayada |
| `hogar` | productos | suave | editorial | estandar | subrayado | plana | limpia |
| `hotel-boutique` | hotel | suave | editorial | estandar | subrayado | plana | limpia |
| `hotel-casa` | hotel | redondeado | editorial | pildora | relleno | sombra | limpia |
| `tours-catalogo` | tours | suave | impacto | marcado | bordeado | sombra | rayada |
| `tours-operador` | tours | redondeado | editorial | pildora | relleno | sombra | limpia |
| `eventos-cartelera` | eventos | suave | impacto | marcado | bordeado | borde | rayada |
| `eventos-unico` | eventos | redondeado | impacto | pildora | relleno | sombra | limpia |
| `locales-salones` | locales | redondeado | editorial | estandar | bordeado | sombra | bordes |
| `canchas-complejo` | canchas | suave | deportivo | marcado | relleno | borde | rayada |

Criterio: las plantillas `editorial` y de marca (moda, hogar, boutique) van con campos subrayados y tarjetas planas; las `impacto`/`deportivo`, con botones marcados; las `redondeado`, con píldora y relleno; las de muchos datos (tecnología, cotización de salones), con tablas con bordes.

## Riesgos y notas

- **Las tiendas existentes cambian de aspecto.** Por D2, al publicar esto, toda tienda con una plantilla distinta de `clasica` ve sus botones, campos y tarjetas con el estilo nuevo, sin haberlo elegido. Es intencional: es una mejora de la plataforma, como la actualización de un tema en Shopify, y no toca contenido del dueño. Conviene avisarlo (novedades del admin) y publicar después de revisar la galería.
- **La consolidación es lo más costoso.** Son cambios en muchos archivos (R6), sin cambio de comportamiento. Conviene hacerla en una fase propia y verificarla con las capturas antes de agregar estilos.
- **Tipos repetidos en 2 repos.** `EstiloComponentes` existe en TypeScript (storefront) y en el catálogo JS con test (backend). El backend manda; el storefront usa `COMPONENTES_DEFAULT` ante un valor desconocido.
- **SSR.** Sin cambios: el prerender no conoce la tienda y el tema llega por el script de arranque (variables en caché) y por `ThemeService`. Como todo son variables `--store-*` (D5), no hay parpadeo de estilo.
- **`/test-map` está expuesta en producción** (`app.routes.ts`). Se aplica el mismo registro solo en desarrollo de R8.1.

## Fases y tareas

### Fase 1 — Consolidación y estilo base (FrontendStore)
- [ ] 1.1 Pasar input, select, textarea y combobox a `.input` (R6.1).
- [ ] 1.2 Crear `.tabla` y usarla en las 2 tablas (R6.2).
- [ ] 1.3 Pasar botones y tarjetas sueltos a `.btn-*` y `.card` (R6.3).
- [ ] 1.4 Reemplazar colores fijos por tokens en los componentes del alcance (R6.4).
- [ ] 1.5 Mejorar el estilo base: hover, `:focus-visible`, deshabilitado y error (R5).
- [ ] 1.6 Test que marca `<select>`/`<textarea>` sin `.input` (R6.5).
- [ ] 1.7 Galería `/dev/estilos`, solo en desarrollo, todavía con el estilo base (R8.1); registrar `/test-map` solo en desarrollo.

### Fase 2 — Estilos por plantilla (FrontendStore)
- [ ] 2.1 `EstiloComponentes`, `COMPONENTES_DEFAULT` y `componentes` en `TemaTienda`/`DisenoConfig` (R3.1).
- [ ] 2.2 Tokens en `buildThemeVars()` y `THEME_VAR_NAMES` (R3.2, R4).
- [ ] 2.3 Reglas CSS que leen los tokens con defaults (R3.3).
- [ ] 2.4 `componentes` en `estructuras.mock.ts` (R3.5).
- [ ] 2.5 Columnas por estilo y vista por plantilla en la galería; ajustar los valores de R4 y la asignación (R8.1).
- [ ] 2.6 Capturas de Playwright y test de contrato (R8.2, R8.3).

### Fase 3 — Catálogo y resolución (BackendNode)
- [ ] 3.1 `componentes` en las 15 plantillas y `COMPONENTES_DEFAULT` (R1.1, R2.2).
- [ ] 3.2 `resolverTema()` devuelve `componentes` (R2.1); `estructuraSchema` y `copiarPlantilla()` no lo tocan (R2.3).
- [ ] 3.3 `componentes` en `GET /admin/diseno/catalogo` (R1.3).
- [ ] 3.4 Tests: contrato por plantilla y resolución, incluida una plantilla inexistente.

### Fase 4 — Verificación
- [ ] 4.1 Revisar en el navegador una tienda por rubro (productos, hotel, tours, eventos, locales, canchas), en desktop y a 375px, incluidos checkout y formularios de reserva.
- [ ] 4.2 Aviso de novedades en el admin antes de publicar (Riesgos).

### Fase 5 — Admin (opcional)
- [ ] 5.1 Miniaturas de plantilla con el estilo de componentes (R9.1).

## Referencias

| Decisión | Referencia | Qué se tomó |
|---|---|---|
| Estilo en la plantilla, no en el dueño | Temas de Shopify y Tiendanube: el tema define botones e inputs; el dueño elige colores y fuentes | D1 |
| Tokens por componente | [Material 3: tokens de componente](https://m3.material.io/foundations/design-tokens/overview) y las variables CSS de shadcn/ui | D5, R4 |
| Contraste y foco | [WCAG 2.2](https://www.w3.org/TR/WCAG22/): SC 1.4.3, 1.4.11 y 2.4.7 | R5 |
| Capturas por estado | Galería tipo Storybook y `toHaveScreenshot` de Playwright | R8 |
