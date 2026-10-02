# Tareas: estructura de la tienda configurable

> Implementa [spec.md](spec.md) según [plan.md](plan.md). Marcar `[x]` al cerrar cada tarea.

## Estado (2026-10-01)

Fases 1-4 implementadas en los tres repos, **sin commit**:
- **Backend:** módulo `modules/diseno/` + 3 suites de tests (`copia`, `secciones.schema`, `resolver`). La suite completa pasa (342 tests). Probado de solo lectura contra la BD: la tienda `zapatillas` resuelve la clásica con su propio texto de hero, igual que antes.
- **Storefront:** compila. 59 de 60 tests pasan; el que falla es el test de ejemplo de Angular (`AppComponent should render title`), que existe desde el commit inicial.
- **Admin:** compila y pasan sus 47 tests.

Fase 6 verificada el 2026-10-02 (ver abajo); solo falta revisar el admin a 375 px con sesión. La Fase 5 es opcional.

## Cómo retomar

1. Sin SQL: `tema` y `estructura` son claves JSONB en `tienda_configuraciones`. Basta con agregarlas a `DISENO_CLAVES`.
2. Orden de despliegue: backend → admin → tienda. Un storefront viejo ignora `diseno.tema` y sigue viendo la clásica.
3. La simulación del storefront (`estructuras.mock.ts`, `paletas.ts`, `tipografias.ts`, `PlantillaSwitcherComponent`) es el origen de lo que se porta al backend en la Fase 1.

## Fase 1 — Catálogo, tema y aplicar plantilla (backend, R1-R3, R6)

- [x] **T1.1** `modules/diseno/plantillas.js`, `paletas.js`, `tipografias.js`: portados del storefront, congelados, con `version` y `rubro` en cada plantilla (`clasica` ↔ rubro `general`). Las fechas de ejemplo (`enDias`) se reemplazan por `terminaEn: null`. Agregar `layout.producto` con sus defaults a las 7 plantillas.
- [x] **T1.2** `secciones.schema.js`: Zod por tipo (unión discriminada), `layoutSchema` con `producto`, `estructuraSchema` con las reglas de cantidad y posición de R4.3 y los límites del plan, y `temaSchema` (ids del catálogo).
- [x] **T1.3** `copia.js#copiarPlantilla` puro con las reglas R3.1-R3.5 (afirmaciones ocultas con `ejemplo: true`). `presets.js` con los valores iniciales instructivos de cada tipo.
- [x] **T1.3b** `migrar.js` (`FORMATO_ACTUAL = 1`, `migrarEstructura`). `resolverTema` y el GET del admin migran al leer; el PUT migra antes de validar.
- [x] **T1.3c** `aplicar` (y restaurar) guarda la estructura previa en `estructura_anterior`; `POST .../diseno/estructura/deshacer` la vuelve a poner y la borra.
- [x] **T1.4** `resolver.js#resolverTema(diseno, ahora)`: ids → valores; sin estructura → copia de `clasica` con la clave `hero`; sin tema → primeros del catálogo; quita ofertas vencidas u ocultas sin fecha. `disenoPublico` lo incluye en `diseno.tema`.
- [x] **T1.5** `DISENO_CLAVES` += `tema`, `estructura`; `tienda-diseno.validator.js` acepta las dos y cada una se reemplaza entera.
- [x] **T1.6** Rutas: `GET /admin/diseno/catalogo` (rol `viewer`) y `POST /admin/tiendas/:id/diseno/estructura/aplicar` (rol `editor`; 400 si la plantilla no existe). Invalidar la caché pública de la tienda al guardar o aplicar.
- [x] **T1.7** Tests (Jest):
  - `secciones.schema.test.js`: dos heroes, hero no primero, 16 secciones, ids repetidos, oferta visible sin fecha, variante inexistente, textos largos, error con ruta a la sección.
  - `copia.test.js`: testimonios sin items, oferta oculta, tipos de R3.5 ocultos con `ejemplo`, la clásica sin secciones ocultas (ninguna tienda existente cambia), hero heredado de la estructura anterior y de la clave `hero`.
  - `migrar.test.js`: formato actual sin cambios; formato desconocido (mayor al actual) → error controlado.
  - `resolver.test.js`: tienda sin nada → clásica + defaults; oferta vencida quitada; ids de catálogo → valores; las 7 plantillas pasan su propio schema.

## Fase 2 — Storefront consume el tema (R6)

- [x] **T2.1** Modelos: `ejemplo?`, `terminaEn: string | null`, `DisenoLayout.producto`; `Tienda.diseno.tema`.
- [x] **T2.2** `DisenoState.base`: en producción desde `store.diseno.tema` (fallback a los catálogos locales si no llega); en desarrollo, el selector como hoy.
- [x] **T2.3** `home-sections`: `@default` vacío. `testimonials-section`: sin items y con menos de 3 reseñas reales, no se dibuja. `offer-section`: sin fecha o vencida, no se dibuja.
- [x] **T2.4** `hero-banner`: prioridad campaña > sección > clave `hero` > nombre de la tienda.
- [x] **T2.5** Verificar que el script de tema de `index.html` y `ThemeService` sigan aplicando la paleta desde `tema` sin parpadeo.

## Fase 3 — Admin: Apariencia e Inicio (R2, R4, R7)

- [x] **T3.1** `models/diseno.model.ts` (tipos copiados del storefront) y `tienda-diseno.service.ts` += `getCatalogo()`, `aplicarPlantilla()`.
- [x] **T3.2** `pages/diseno` con pestañas Apariencia, Inicio, Producto, Anuncio y Campañas (mobile-first).
- [x] **T3.3** Apariencia: `plantilla-picker` con miniaturas y la sugerida por rubro; confirmación al reemplazar una estructura personalizada; `paleta-picker` (color + versión de fondos); `tipografia-picker`.
- [x] **T3.4** Inicio: `secciones-editor` con toggle de visibilidad, ↑↓ (WCAG 2.5.7), duplicar y quitar; bloque "Por revisar" con las secciones `ejemplo`; "Restaurar plantilla" con confirmación; "Deshacer" tras aplicar o restaurar.
- [x] **T3.5** Un formulario por tipo de sección (10). El de hero reemplaza a "Portada de inicio" cuando hay estructura guardada. El de oferta lleva fecha y hora de fin.
- [x] **T3.6** `seccion-agregar`: hoja inferior con los tipos permitidos según los máximos de R4.3 (los que ya llegaron a su tope aparecen deshabilitados).
- [x] **T3.7** `unsavedChangesGuard`, botón "Ver en mi tienda", solo lectura para `viewer`, errores 400 del backend mostrados en la sección culpable.

## Fase 4 — Detalle de producto (R5)

- [x] **T4.1** Storefront `product-page`: galería `lado`/`arriba` (solo desktop), proporción de la foto según `productCard.imagen`, acordeones de envío y devoluciones con `mostrar` y `texto`, relacionados y reseñas condicionales, y beneficios debajo del botón de compra.
- [x] **T4.2** Admin: pestaña Producto (`producto-opciones`).
- [x] **T4.3** Revisar en móvil que la barra fija de compra no se vea afectada. Verificado con Playwright a 375 px: queda justo encima del menú inferior (713-778 px; el menú empieza en 778).

## Fase 5 — Opcional

- [ ] **T5.1** Imagen propia en `imagen-texto` (`POST /uploads/image`, carpeta `secciones`, validada como los widgets).
- [ ] **T5.2** Borrador + link de vista previa (como Tiendanube): clave `estructura_borrador`, "Publicar" la pasa a `estructura` (y la publicada a `estructura_anterior`). El link lleva un token firmado que vence a los 14 días (como los de Shopify). El storefront, con `?vista-previa=<token>`, pide el borrador a un endpoint que valida el token y no lo cachea.
- [ ] **T5.4** (Solo si el uso en desktop lo justifica) vista previa en vivo con iframe + `postMessage`, verificando el origen.
- [ ] **T5.3** Aviso "Tu plantilla tiene mejoras" comparando `plantillaVersion` con la versión actual.

## Fase 6 — Verificación end-to-end

- [x] **T6.1** Tienda existente sin configuración → se ve igual que antes del deploy. `myg` sin filas de diseño → la API pública devuelve la clásica (hero, categorías, destacados, recientes, contacto) con `tienda-contraste`.
- [x] **T6.2** Aplicar `moda`, editar el hero, reordenar, ocultar los testimonios, guardar → la tienda lo refleja en ≤ 1 min.
  - Desde el admin real (sesión `demo@yopmail.com`, 2026-10-02): `zapatillas` aplicó `moda`, movió "recientes" arriba, eligió `orange-contraste` + `moderna`. La estructura pasa el schema, la portada conservó "Las mejores zapatillas." y las 3 secciones de ejemplo quedaron ocultas.
  - Storefront (Playwright, 375 y 1280 px): orden respetado, ejemplos y testimonios vacíos no se dibujan, h1 en Poppins, primario `#f97316`, fotos 3:4, galería al lado en desktop, sin scroll horizontal ni errores JS.
  - Ciclo de escritura en `myg` (servicio + schema del PUT, 18 verificaciones): aplicar `tecnologia`, activar la cinta revisada, oferta con fecha, reordenar, tema, galería arriba; PUT inválidos rechazados (dos portadas → ruta `estructura.home.secciones.8.tipo`, oferta sin fecha, paleta inexistente); restaurar conserva la portada; deshacer vuelve a la estructura editada; deshacer dos veces → 400. Después se borraron las filas de prueba.
  - Sin token válido: aplicar, deshacer, PUT y catálogo → 401.
- [x] **T6.3** Campaña activa sobre una estructura personalizada → cambian la paleta, el hero, la cinta y la oferta, pero no el orden de las secciones. Día de la Madre forzado (modo de desarrollo) sobre `zapatillas`: hero "Para la que siempre está", cuenta regresiva rosa después del hero, el orden del dueño se mantiene.
- [~] **T6.4** Admin y tienda en móvil (375 px). Tienda: verificada. Admin: no verificada a 375 px (hace falta iniciar sesión); el flujo sí se usó desde el admin real (ver T6.2).
