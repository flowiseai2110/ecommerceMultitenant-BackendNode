# Tareas: campañas de temporada y widgets del storefront

> Implementa [spec.md](spec.md) según [plan.md](plan.md). Marcar `[x]` al cerrar cada tarea.

## Cómo retomar

1. SQL: solo `docs/sql/tienda_rubro.sql` (T1.4), **ya aplicado** en Supabase (verificado el 2026-10-01). Las campañas y los widgets viven en `tienda_configuraciones` (JSONB): basta con agregar las claves a `DISENO_CLAVES`.
2. Orden de despliegue: backend → admin → tienda. Una tienda con backend viejo recibe `diseno.campana` sin definir y se ve con su diseño base.
3. FrontendStore ya consume la campaña del backend (Fase 6) y conserva la simulación en el selector de desarrollo, **sin commit**.

## Fase 0 — Simulación en FrontendStore (hecha)

- [x] **T0.1** Presets del calendario peruano con regla de fecha, ventana, prioridad y rubros — `core/theme/campanas.ts` + `campanas.spec.ts` (10 tests).
- [x] **T0.2** `DisenoState`: modo de campaña (automática / ninguna / forzar), fecha simulada, paleta de campaña sobre la base, cinta y cuenta regresiva tras el hero, textos de hero y top bar.
- [x] **T0.3** Caché de tema con `hasta` (`theme.service.ts` + script de `index.html`).
- [x] **T0.4** Catálogo de 14 figuras SVG y animaciones solo CSS con reduced motion.
- [x] **T0.5** Widgets con el modelo de la spec: `ContenidoWidget` (figura/imagen/sello), anclas, `app-widget-slot` + `app-widget`, máximo uno por ancla, flotante cerrable.

## Fase 1 — Calendario (backend, R1) (hecha)

- [x] **T1.1** `modules/campanas/presets.js`: los 10 presets portados de `FrontendStore/src/app/core/theme/campanas.ts`, congelados (el resolver no puede mutarlos) y con `buscarPreset(id)`.
- [x] **T1.2** `calendario.js`: `fechaClave`, `ventana` (presets y campañas propias con `inicio`/`fin`), `vigente`, `proximaVentana`, `aIsoLima` y `parsearFecha`, en hora de Lima (UTC−5 fijo).
- [x] **T1.3** `__tests__/calendario.test.js` (33 tests): fechas de R1.1, límites de ventana en hora de Lima (incluido 03:00 UTC = 22:00 Lima del día anterior), cruces de R1.3 con desempate por ventana más corta, cambio de año, fechas imposibles e integridad de los presets (R4.3/R4.4).
- [x] **T1.4** Columna `tiendas.rubro` (nullable, con CHECK), separada de `tipo_negocio` (productos/servicios/ambos, otro concepto): `docs/sql/tienda_rubro.sql`, `schema.prisma`, `modules/tenants/rubros.js`, `rubro` en `tiendas.schema.js` (enum), `sugeridoPara(preset, rubro)` en `presets.js` con 2 tests, y selector "Rubro" en el formulario de tienda del admin. En los presets, la estructura `clasica` pasó a llamarse rubro `general`.
  - **Bloqueante:** correr `docs/sql/tienda_rubro.sql` en Supabase antes de arrancar o desplegar el backend: el cliente Prisma ya está regenerado y selecciona `rubro`.

## Fase 2 — Configuración por tienda (backend, R2, R4) (hecha)

- [x] **T2.1** `modules/campanas/campanas.schema.js`:
  - `widgetSchema` (figura/imagen/sello; por defecto: tamaño `mediano`, animación `ninguna`, `enMovil: false`) y `listaWidgetsSchema` (máximo 5, uno por ancla, el error apunta al widget repetido).
  - `campanaTiendaSchema`: un preset debe existir y no lleva fechas fijas. Una campaña propia exige nombre, inicio y fin, dura como máximo 90 días y no usa anticipación. También valida la paleta (#rrggbb + catálogo), los textos con límites y `oferta: false`.
  - `listaCampanasSchema`: máximo 30, ids únicos, cada preset activado una sola vez.
  - `urlsDeWidgetsAjenas(data, prefijo)` + `prefijoWidgets(supabaseUrl, tiendaId)`: función pura para R4.5 (rechaza otra tienda, otra carpeta, URLs externas y `..`).
- [x] **T2.2** `validators/tienda-diseno.validator.js` acepta `campanas` y `widgets` (cada clave reemplaza la lista completa). `DISENO_CLAVES` += `campanas`, `widgets`. `saveDiseno` rechaza con 400 las imágenes que no son de la carpeta `widgets/` de la tienda. `GET /store/tiendas?slug=` quita `campanas` de la respuesta pública (adelanto de T3.2: nunca se publican campañas futuras).
- [x] **T2.3** `__tests__/campanas.schema.test.js` (22 tests): ancla repetida, máximo de widgets, sello de 12 caracteres, imagen solo https, preset inexistente o con fechas, campaña propia sin fechas/nombre, fin antes del inicio, más de 90 días, fecha imposible, preset duplicado, URLs ajenas (otra tienda, otra carpeta, externa, `..`) y body vacío. Suite completa: 219 tests.

## Fase 3 — Resolución y entrega (backend, R3, R6) (hecha)

- [x] **T3.1** `modules/campanas/resolver.js` (puro):
  - `efectiva(campana)`: preset + personalización campo por campo (también dentro del hero). `oferta: false` quita la cuenta regresiva, `widgets: []` quita los widgets, una campaña propia sin paleta conserva los colores de la tienda y un preset retirado del catálogo se ignora.
  - `mezclarWidgets(permanentes, deCampana)` (R4.6) y `resolverCampana(campanas, widgets, ahora)` con fechas ISO `-05:00`; solo cuentan las activadas (opt-in).
  - `disenoPublico(diseno, ahora)`: quita `campanas` y agrega `campana`. Lo usan la ruta pública y la vista previa.
  - `calendarioAnual(campanas, rubro, anio)`: los 10 presets con su ventana (la personalizada si la hay), `activa`, `personalizada` y `sugerida`, más las campañas propias que tocan el año, ordenados por inicio.
  - `__tests__/resolver.test.js` (18 tests).
- [x] **T3.2** `GET /store/tiendas?slug=` devuelve `diseno = disenoPublico(diseno, new Date())`. Probado contra la BD con la tienda `zapatillas`: 200, `campana: null` (sin campañas activadas).
- [x] **T3.3** `GET /admin/tiendas/:id/campanas/calendario?anio=` (rol `viewer`; `anio` opcional, por defecto el actual en Lima, rango 2020-2100) → `{ anio, rubro, campanas: [...] }`. `campanas.service.js#getCalendario`. Sin token → 401; el servicio, probado contra la BD, devuelve los 10 presets de 2027.
- [x] **T3.4** `GET /admin/tiendas/:id/diseno/vista-previa?fecha=YYYY-MM-DD` (rol `editor`) → `{ fecha, ...disenoPublico }` evaluado al mediodía de Lima de esa fecha, lejos de los límites de ventana. Sin token → 401; el servicio, probado contra la BD, responde sin la lista de campañas.
- [ ] **T3.5** Prueba end-to-end con una campaña activada (PUT `/diseno` con `campanas` → storefront y vista previa). Necesita un token de admin y escribe en la BD: hacerla en la Fase 7 (T7.2).

## Fase 4 — Subida de imágenes (backend, R5) (hecha)

- [x] **T4.1** Carpeta `widgets` en `uploads.validator.js`; `validateFile(file, folder)` aplica para ella solo PNG/WebP y 1 MB (las demás carpetas siguen igual).
- [x] **T4.2** `modules/campanas/widget-imagen.js#normalizarImagenWidget`: verifica el formato por el **contenido** con sharp (no por el mimetype, que el navegador puede falsear), rechaza JPEG/SVG/no-imágenes con 400 y guarda WebP de máx. 512 px por lado con transparencia, sin agrandar las chicas. `__tests__/widget-imagen.test.js` (6 tests con imágenes reales generadas con sharp).
- [x] **T4.3** `POST /uploads/image` exige `authMiddleware` + `requireTiendaAccess("editor")` sobre el `tiendaId` del body (después de multer, que lo parsea). El admin ya manda el token (authInterceptor); el storefront no usa este endpoint. Probado: sin token → 401; `GET /uploads/defaults` sigue público. Los errores de validación ahora responden 400 en vez de 500.
  - SVG en las **otras** carpetas: se mantiene. Los archivos se sirven desde el dominio de Supabase (no desde el de la tienda) y el storefront los muestra con `<img>`, donde los scripts no se ejecutan. El riesgo que quedaba era que cualquiera subiera archivos, y eso lo cierra la autenticación.
  - Nota: el admin llama a `DELETE /uploads/image` (`image-upload.service.ts#deleteImage`), pero esa ruta no existe (404 desde antes). Fuera del alcance de esta spec.

## Fase 5 — Admin (FrontendAdmin) (hecha, falta probarla con sesión)

Página nueva **Campañas** (`/campanas`, en el menú bajo "Diseño"; rol que configura la tienda). Todo se guarda junto con "Guardar cambios" (`PUT /diseno` con `campanas` y `widgets`; cada lista se reemplaza entera).

- [x] **T5.0** `'widgets'` en `ImageFolder` (`image-upload.service.ts`); `CampanaTienda`/`Widget`/`PresetCampana`... en `models/campana.model.ts`; `TiendaDiseno.campanas/widgets`; `CampanasService` (calendario y vista previa).
- [x] **T5.1** Calendario del año (`campanas.component`): fechas en hora de Lima, etiquetas "En curso", "Sugerida para tu rubro", "Personalizada"/"Campaña propia", interruptor activar/desactivar, cambio de año, aviso si la tienda no tiene rubro, "+ Nueva campaña propia", "Restablecer" (preset) / "Eliminar" (propia).
  - Backend: `GET /campanas/calendario` ahora también devuelve `presets` (el catálogo), que el editor muestra como valores sugeridos.
- [x] **T5.2** Editor de campaña (`campana-editor.component`): fechas (propia) o anticipación/días después (preset), barra de anuncios, portada, cinta (una línea por mensaje), cuenta regresiva (sugerida / personalizada / ninguna), colores (sugeridos o de la tienda / personalizados: primario, grises, fondos) y widgets (sugeridos / personalizados / ninguno). Los campos vacíos muestran en gris el texto del preset y se guardan como null. Valida con las mismas reglas del backend antes de aplicar.
- [x] **T5.3** Editor de widgets (`widgets-editor.component`): maqueta de la tienda con los 5 lugares; al elegir uno se agrega o edita su widget: figura (grilla de las 14 SVG, copia de las del storefront en `shared/widgets/figura.component.ts`), imagen (sube a `widgets/`, PNG/WebP ≤ 1 MB) o sello (texto ≤ 12 + forma), tamaño, animación, "también en celular", quitar. Se usa también para los **widgets de siempre** (permanentes).
- [x] **T5.4** Vista previa por fecha: muestra la campaña de ese día (anuncio con su color, título, subtítulo, cinta, cuenta regresiva, widgets) o "diseño normal". Usa lo guardado; avisa si hay cambios sin guardar.
- Backend: `saveDiseno` manda el mensaje del error de URLs ajenas en `details` (el error middleware responde `data = details`; sin esto el admin no recibía el texto).
- Verificado: `ng build` del admin OK; backend 279 tests. **No probado en el navegador:** el admin exige iniciar sesión (Supabase). Probar con `npm start` en el admin + backend local (`apiUrl` = `localhost:3000`).

## Fase 6 — Storefront conectado (FrontendStore) (hecha)

- [x] **T6.1** `CampanaResuelta` (forma de la API) y `CampanaVigente` (la que usa la app, fechas como `Date`) en `diseno.model.ts`; `TiendaDiseno.campana` y `TiendaDiseno.widgets` en `tienda.model.ts`.
- [x] **T6.2** `DisenoState` lee la tienda (`StoreState.store$`) y tiene un modo nuevo `tienda`: la campaña sale de `Tienda.diseno.campana` vía `desdeApi()`, que descarta las ya terminadas (caché o pestaña abierta). En producción es el único modo; en desarrollo es el valor por defecto y el selector conserva "Simular por fecha", "Ninguna" y "Forzar" (convertidos con `desdePreset()` a la misma forma). Hero, top bar, widgets, tema y cuenta regresiva leen `CampanaVigente` sin saber de dónde viene.
  - Campaña sin paleta → colores de la tienda. Sin cinta u oferta → quedan las de la estructura.
  - La cuenta regresiva del backend cuenta hasta su `fin` real; la desplazada en el tiempo es solo para la simulación.
- [x] **T6.3** `widgetsTienda` = `Tienda.diseno.widgets`; los de la campaña reemplazan al de su ancla (`widgetsPorAncla`; volver a combinar la lista ya combinada del backend no cambia nada).
- Verificado: `ng build` OK y 16 tests de `campanas.spec.ts` (5 nuevos de `desdeApi`/`desdePreset`). Suite completa: 59/60; la única falla (`AppComponent should render title`) viene del commit inicial y no tiene que ver con esto.
- Ojo en desarrollo: el proxy apunta por defecto al backend de producción, que aún no tiene las Fases 1-3; ahí `campana` llega vacía y la tienda se ve con su diseño base. Para ver campañas reales: `PROXY_TARGET=http://localhost:3000` con el backend local, o "Simular por fecha" en el selector.

## Fase 7 — Verificación

- [ ] **T7.1** `npm test` (backend) y `ng test` (tienda).
- [ ] **T7.2** Activar Día de la Madre en el admin; vista previa con fecha 1 may → tienda rosa, corazón en el hero, cuenta regresiva hasta el 10 may 00:00.
- [ ] **T7.3** Subir un PNG como widget → se ve en el hero. Un SVG en la carpeta `widgets` → 400.
- [ ] **T7.4** Desactivar la campaña → en menos de 1 min la tienda vuelve a su diseño base.
