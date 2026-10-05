# Tareas: diseño por tipo de negocio

Spec: [spec.md](spec.md).

## Fase 1 — Hospedaje

### BackendNode
- [x] T1.1 `secciones.schema.js`: tipos `habitaciones`, `servicios`, `ubicacion`, `politicas`; `hero.buscador`; `TIPOS_POR_NEGOCIO`, topes y `ICONOS_SERVICIO`.
- [x] T1.2 `plantillas.js`: `tipoNegocio` en cada plantilla (`productos` por defecto); `hotel-boutique` y `hotel-casa`; `plantillaPorDefecto(tipoNegocio)`.
- [x] T1.3 `presets.js`: presets de las cuatro secciones nuevas.
- [x] T1.4 `copia.js`: `servicios` entra en `TIPOS_CON_AFIRMACIONES` (H5).
- [x] T1.5 `resolver.js` + `disenoPublico`: estructura por defecto según el tipo de negocio (H4). `tiendas.store.routes.js` y la vista previa de campañas pasan el tipo.
- [x] T1.6 Validación por tipo de negocio: aplicar plantilla (H2) y PUT de estructura (H3).
- [x] T1.7 Catálogo: `tiposPorNegocio` en `GET /admin/diseno/catalogo`.
- [x] T1.8 Tests: copia de las plantillas de hotel, resolver por tipo, validación de secciones por tipo.

### FrontendStore
- [x] T1.9 `diseno.model.ts`: secciones nuevas y `hero.buscador`.
- [x] T1.10 Home del hotel con `app-home-sections` (H6); la grilla fija queda solo en `/habitaciones`.
- [x] T1.11 Componentes: `habitaciones` (reusa la grilla), `servicios`, `ubicacion`, `politicas`.
- [x] T1.12 Portada: buscador de hotel y botón a `/habitaciones` (H7, H8).
- [x] T1.13 `/habitaciones` y la ficha: filtrar por huéspedes, conservar y precargar fecha, noches y adultos (H8).

### FrontendAdmin
- [x] T1.14 `diseno.model.ts`: tipos, nombres y descripciones nuevos; `tipoNegocio` en la plantilla; `tiposPorNegocio` en el catálogo.
- [x] T1.15 Apariencia: solo plantillas del tipo de la tienda. Editor: solo tipos de sección del tipo de la tienda.
- [x] T1.16 `seccion-form`: formularios de `habitaciones`, `servicios`, `ubicacion` y `politicas`; interruptor del buscador en la portada (solo hotel).

### Verificación
- [x] T1.17 Tests de diseño y campañas en verde (145); build de admin y store sin errores. Falla 1 test de reservas de tours que no toca esta fase.
- [ ] T1.18 Prueba de punta a punta con una tienda hotel: aplicar Boutique, editar, guardar, ver la home y usar el buscador. Verificado contra la API con `demobooking` (resuelve Boutique; las tiendas de productos no cambian). Falta la prueba en el navegador.

## Fase 1b — Ficha de habitación y esquema del admin
- [ ] Opciones de la ficha de habitación (`layout.habitacion`).
- [ ] Esquema del admin (Encabezado / Página / Pie) para todos los tipos de negocio.

## Fase 2 — Tours
Pendiente de detallar.

## Fase 3 — Eventos
Pendiente de detallar. Requiere el tipo de negocio `eventos` en mini booking.
