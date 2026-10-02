# Spec: estructura de la tienda configurable desde el admin

> Estado: **implementado y verificado en los tres repos (Fases 1-4 y 6), sin commit**. Pendiente menor: revisar el admin a 375 px con sesión. La Fase 5 es opcional. Ver [tasks.md](tasks.md).
> Diseño técnico: [plan.md](plan.md).
> Repos involucrados: BackendNode, FrontendAdmin, FrontendStore.
> Relacionada: [campanas-widgets](../campanas-widgets/spec.md). Las campañas se montan encima de la estructura, que es el diseño base de la tienda.

## Problema

El storefront ya sabe dibujar la home a partir de una lista de secciones (`SeccionHome`). Tiene 10 tipos de sección y 7 estructuras por rubro, junto con 27 paletas (9 colores × 3 versiones de fondo) y 8 tipografías. Pero todo eso vive en código (`FrontendStore/src/app/core/theme/estructuras.mock.ts`) y solo se elige desde el selector de desarrollo, que lo guarda en `localStorage`. En producción todas las tiendas se ven con la estructura "clásica", la paleta y la tipografía por defecto. Desde el admin el dueño solo puede editar la barra de anuncios y los textos del hero.

Una tienda de moda y una de tecnología necesitan homes distintas: novedades e historia de marca en una, garantía y categorías arriba en la otra. Hoy no hay forma de elegirlo.

## Objetivo

Que el dueño elija desde el admin una **plantilla por rubro**, una **paleta** y una **tipografía**, y que después pueda **personalizar las secciones de la home**: mostrarlas u ocultarlas, cambiar el orden, la variante y los textos, y agregar secciones del catálogo. También puede ajustar unas pocas **opciones del detalle de producto**. Todo con opciones curadas, sin un constructor libre.

## Conceptos

- **Plantilla:** estructura predefinida por la plataforma para un rubro (`clasica`, `moda`, `tecnologia`, `belleza`, `alimentos`, `mascotas`, `hogar`). Incluye el layout (posición del logo, tarjeta de producto), el radio de los bordes, el estilo de los encabezados y la lista de secciones de la home con textos de ejemplo.
- **Estructura de la tienda:** **copia completa** de una plantilla, guardada en la tienda y editada a partir de ahí. Las mejoras posteriores de la plantilla no le llegan; para eso existe "Restaurar plantilla".
- **Sección:** bloque de la home de uno de los 10 tipos (`hero`, `categorias`, `productos`, `beneficios`, `testimonios`, `imagen-texto`, `faq`, `oferta`, `cinta`, `contacto`), con su variante y sus textos.
- **Tema:** la paleta y la tipografía elegidas, independientes de la estructura.

## Alcance

**Incluye**
- Catálogo de plantillas, paletas y tipografías servido por el backend.
- Elegir la plantilla (lo que copia la estructura), la paleta y la tipografía.
- Editor de secciones de la home: mostrar u ocultar, reordenar, variante, fondo, espacio y textos por tipo; agregar, duplicar y quitar secciones; restaurar la plantilla.
- Opciones del detalle de producto: posición de la galería, bloques de envío y devoluciones, relacionados, reseñas y beneficios debajo del botón de compra.
- Resolución en el servidor: el storefront recibe el diseño completo y ya no depende del mock.

**No incluye** (futuro)
- Constructor libre: arrastrar y soltar, coordenadas, HTML o CSS propio.
- Configurar catálogo, carrito, checkout o rastreo (solo reciben los colores del tema).
- Imagen propia en la sección imagen-texto (hoy usa el banner, una categoría o un producto). Queda en la Fase 5 de tasks.
- Borrador con link de vista previa (Fase 5). En la v1, guardar publica, igual que editar el tema publicado en Shopify o "Editar diseño actual" en Tiendanube.
- Vista previa en vivo dentro del admin (iframe + `postMessage`, como el Visual Editor de Storyblok). Solo sirve en desktop; el admin es mobile-first.
- Avisar a la tienda cuando su plantilla de origen recibe mejoras.
- Paleta con colores libres (solo las del catálogo; las campañas ya aceptan hex propio).

## Requisitos

Formato: *Cuando [condición], el sistema debe [comportamiento].*

### R1 — Catálogo
- **R1.1** El backend es la fuente de verdad de las plantillas, las paletas y las tipografías (`modules/diseno/`), portadas desde el storefront.
- **R1.2** `GET /admin/diseno/catalogo` devuelve las plantillas (id, nombre, descripción, rubro, layout y secciones), las paletas y las tipografías, con lo necesario para dibujar miniaturas en el admin.
- **R1.3** Cada plantilla tiene una `version` entera que se incrementa cuando cambia su contenido. La estructura copiada guarda de qué plantilla y de qué versión salió.
- **R1.4** La estructura guardada lleva `formato` (versión del **formato de datos**, distinta de la versión de la plantilla). Cuando se renombra o se quita una propiedad de una sección, se sube `formato` y se agrega un paso a `migrarEstructura()`, que el backend aplica **al leer** (storefront y admin) y al guardar. Agregar una propiedad opcional con valor por defecto no requiere migración.
  - Por qué: con copias completas, cada tienda guarda datos con la forma que tenían el día que aplicó la plantilla. Es el mismo problema que resuelven `migrate()` y `transformProps()` de Puck.

### R2 — Tema y elección de plantilla
- **R2.1** El dueño elige una paleta (primero el color, después la versión de fondos: contraste, clara o tinte) y una tipografía del catálogo. El backend rechaza con 400 los ids que no existen. La paleta `tienda-*` no trae primario: usa el color propio de la tienda, como hoy.
- **R2.2** Cuando el dueño aplica una plantilla, el backend genera la copia (R3) y la guarda, **reemplazando** la estructura anterior. Si ya había una estructura personalizada, el admin pide confirmación antes.
- **R2.3** El admin sugiere la plantilla según `tiendas.rubro` (`general` → `clasica`), sin impedir elegir otra.
- **R2.4** Una tienda sin estructura guardada se ve con la plantilla `clasica`, aunque tenga un rubro. Así no cambia el aspecto de ninguna tienda existente sin que el dueño lo decida.
- **R2.5** Una tienda sin tema guardado usa la primera paleta y la primera tipografía del catálogo, que son las que ve hoy.

### R3 — Reglas de la copia
Al aplicar una plantilla (R2.2) o restaurarla:
- **R3.1** Se copian el layout, el radio, los encabezados y todas las secciones con sus textos de ejemplo.
- **R3.2** Los **testimonios** se copian **sin items**. Nunca se publican reseñas inventadas como si fueran reales.
- **R3.3** La sección **oferta** se copia oculta y sin `terminaEn`. El dueño tiene que poner la fecha para mostrarla.
- **R3.4** Los textos del **hero** se toman de la estructura anterior de la tienda o, si no hay, de la clave `hero` actual. Así el dueño no pierde lo que ya escribió. El título y el subtítulo de ejemplo de la plantilla **no se copian**: también afirman cosas ("con garantía de verdad", "delivery el mismo día") y el hero no se puede ocultar. Sin texto propio quedan vacíos y el storefront muestra el nombre y la descripción de la tienda, como hoy. El admin muestra los de la plantilla como sugerencia (placeholder). El texto del botón sí se copia, porque es genérico.
- **R3.5** Las secciones que afirman cosas concretas del negocio (`beneficios`, `cinta`, `faq`, `imagen-texto`: garantías, plazos de entrega, "100 % originales", registro sanitario) se copian **ocultas** y con `ejemplo: true`. El admin las lista como "Por revisar". El dueño las activa cuando confirma o corrige el texto, y entonces se guardan con `ejemplo: false`. La plataforma nunca publica en nombre de la tienda una afirmación que el dueño no hizo (D.L. 1044, actos de engaño: multas de hasta 700 UIT).
  - Criterio: aplicar `tecnologia` → la cinta "Garantía de 12 meses" queda con `oculto: true, ejemplo: true` y no se ve en la tienda. El dueño la activa → el admin envía `oculto: false, ejemplo: false`.
  - Los títulos genéricos de secciones con datos reales ("Lo que más se llevan", "Explora por categoría") se copian visibles: no afirman nada que dependa del negocio.
- **R3.6** Antes de reemplazar una estructura (aplicar o restaurar), el backend guarda la anterior en `estructura_anterior`. El admin ofrece "Deshacer" mientras exista. Solo se guarda una.

### R4 — Edición de secciones
- **R4.1** El dueño puede mostrar u ocultar, reordenar (↑↓), cambiar la variante, el fondo y el espacio, y editar los textos de cada sección.
- **R4.2** El dueño puede agregar secciones del catálogo de tipos y duplicar o quitar cualquier sección. Cada tipo trae un **preset** (valores iniciales, como los `presets` de las secciones de Shopify). Los textos iniciales explican qué poner ("Cuenta por qué te eligen") y no inventan datos del negocio.
- **R4.3** El backend valida la lista completa y rechaza con 400 si:
  - hay más de 15 secciones;
  - hay más de un `hero`, o el `hero` no es la primera sección;
  - hay más de una sección de tipo `categorias`, `testimonios`, `faq`, `oferta`, `cinta` o `contacto`;
  - hay más de 3 de `imagen-texto` o más de 4 de `productos`;
  - se repite un `id` de sección (formato `^[a-z0-9-]{1,40}$`);
  - un texto supera su límite (ver plan) o una variante no existe;
  - una `oferta` visible no tiene `terminaEn`.
- **R4.4** Guardar reemplaza la estructura completa, como en el resto de las claves de diseño.
- **R4.5** "Restaurar plantilla" vuelve a aplicar la plantilla de origen en su versión actual (R3), con confirmación.

### R5 — Detalle de producto
- **R5.1** La estructura incluye `layout.producto` con estas opciones:
  - `galeria`: `lado` (por defecto; dos columnas en desktop) o `arriba` (galería a todo el ancho y la info debajo). En móvil la galería siempre va arriba.
  - `envio` y `devoluciones`: `{ mostrar, texto }`. Si `texto` es null, se usa el texto actual del storefront.
  - `relacionados` y `resenas`: booleanos, true por defecto.
  - `beneficios`: de 0 a 3 items (`icono`, `titulo`) debajo del botón de compra.
- **R5.2** La proporción de la foto en el detalle sigue a `layout.productCard.imagen` (cuadrada o vertical).
- **R5.3** El orden de los bloques del detalle no se configura.

### R6 — Entrega al storefront
- **R6.1** `GET /store/tiendas?slug=` incluye `diseno.tema` ya resuelto: la estructura completa (guardada o la clásica por defecto), la paleta con sus valores y la tipografía con sus fuentes. El storefront no busca nada en sus catálogos locales.
- **R6.2** El backend quita de la respuesta las secciones `oferta` cuyo `terminaEn` ya pasó, en hora del servidor. El storefront también la oculta cuando la cuenta regresiva llega a 0.
- **R6.3** Los testimonios muestran reseñas reales (`GET /store/resenas/destacadas`) cuando hay 3 o más. Si no, muestran los items del dueño, y si tampoco hay, la sección no se dibuja.
- **R6.4** Una campaña vigente sigue pisando la paleta, los textos del hero, la cinta y la oferta (spec de campañas). Nunca cambia la estructura.
- **R6.5** Los cambios se ven en la tienda como máximo un minuto después (TTL actual de la caché pública).
- **R6.6** En producción, el storefront ignora `localStorage` para el diseño. El selector de plantillas queda solo en desarrollo.

### R7 — Admin
- **R7.1** La página Diseño se organiza en pestañas: **Apariencia** (plantilla, paleta y tipografía), **Inicio** (portada + secciones), **Producto** y **Anuncio**. La pestaña va en `?tab=`, para que el tour de la Guía pueda abrirla. Campañas sigue en su propia página.
- **R7.2** Mobile-first: reordenar con botones ↑↓ (sin arrastrar), cada sección es una tarjeta que se despliega con su formulario y los selectores de plantilla y paleta muestran miniaturas en una grilla de 2 columnas en móvil.
- **R7.3** Los cambios sin guardar activan `unsavedChangesGuard`.
- **R7.4** Hay un botón "Ver en mi tienda" que abre la home en otra pestaña. La URL la arma el backend (`urlTienda` en el GET del diseño, con el mismo helper que el link de reseñas: subdominio o `<storefrontUrl>/<slug>`).
- **R7.5** Solo el rol `admin` de la tienda (permiso `configurarTienda`) puede guardar, aplicar o deshacer, igual que el PUT de diseño existente. Los demás ven la configuración en solo lectura.

## Riesgos y notas

- **Tipos repetidos en 3 repos.** `SeccionHome` existe en TypeScript (storefront y admin) y en Zod (backend). Agregar un tipo de sección toca los 3, igual que pasa con los TOURS del asistente. El backend manda: el storefront ignora (no dibuja) un tipo que no conoce.
- **El hero tiene dos orígenes durante la transición.** La clave `hero` sigue leyéndose para tiendas sin estructura guardada (R3.4). Cuando la tienda guarda una estructura, el formulario "Portada de inicio" se reemplaza por el editor de la sección hero.
- **SSR.** El prerender de la home no conoce la tienda, así que la estructura se dibuja en el navegador (`app-home-sections` sigue con `ngSkipHydration`). Mover la configuración al backend no cambia esto. El script de tema de `index.html` evita el parpadeo de colores, pero no el de la estructura.
- **Copia sin mejoras.** Las tiendas personalizadas no reciben las mejoras de su plantilla (decisión tomada; ver plan). `plantillaVersion` deja la puerta abierta para avisarles después.

## Referencias

Cómo lo resolvieron otros y qué se tomó de cada uno:

| Decisión | Referencia | Qué se tomó |
|---|---|---|
| Copia completa | [Shopify: JSON templates](https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates); las actualizaciones de tema no tocan `templates/*.json` ni `settings_data.json` | La plataforma actualiza los componentes; los datos de la tienda no se pisan |
| Límites por tipo y total | Shopify: máx. 25 secciones por template, `limit` de 1 o 2 por tipo ([section schema](https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema)) | Máx. 15 y topes por tipo (R4.3) |
| Ocultar sin borrar | Shopify `disabled`, el ojo de Tiendanube | `oculto` conserva los textos |
| Presets al agregar | Shopify `presets` | R4.2 |
| Textos por defecto | [Shopify Theme Store requirements](https://shopify.dev/docs/storefronts/themes/store/requirements): "los valores por defecto deben indicar cómo usar el ajuste", nada de contenido de una tienda demo | Presets instructivos (R4.2); afirmaciones de ejemplo ocultas (R3.5) |
| Testimonios | [FTC, regla de 2024 contra reseñas falsas](https://www.ftc.gov/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials); en Perú, D.L. 1044 ([Indecopi: hasta 700 UIT](https://elperuano.pe/noticia/134899-indecopi-publicidad-enganosa-puede-ser-multada-hasta-con-mas-de-3-millones-de-soles)) | Nunca testimonios de ejemplo (R3.2, R6.3) |
| Reordenar con ↑↓ | [WCAG 2.2, SC 2.5.7 (AA)](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html): toda acción de arrastre debe tener alternativa sin arrastrar; el ejemplo es justamente una lista con botones subir/bajar | R7.2 |
| Detalle de producto con opciones, no bloques | [Tiendanube: "Detalle del producto"](https://ayuda.tiendanube.com/es_ES/diseno/guia-personalizar-el-diseno-de-tu-tiendanube) solo ofrece activar elementos; Shopify exige bloques reordenables, pero apunta a diseñadores | R5, pensado para el emprendedor |
| Borrador y link de vista previa | [Tiendanube: borradores](https://ayuda.tiendanube.com/es_ES/informacion-general-design/como-personalizar-el-diseno-de-mi-tienda-en-un-borrador) con URL para abrir en el celular; el diseño anterior queda como borrador al publicar | Fase 5 y "Deshacer" (R3.6) |
| Migración del formato | [Puck: data migration](https://puckeditor.com/docs/integrating-puck/data-migration) | R1.4 |

