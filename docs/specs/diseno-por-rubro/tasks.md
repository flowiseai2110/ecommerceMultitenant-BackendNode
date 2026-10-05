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
- [x] Opciones de la ficha de habitación (`layout.habitacion`: galería carrusel/mosaico, servicios, políticas, mapa, otras habitaciones). Backend (schema, resolver, Casa única en mosaico, 2 tests), store (mosaico, mapa, otras habitaciones, barra fija en el celular) y admin (pestaña Habitación en la ficha).
- [x] Esquema del admin para todos los tipos de negocio: selector Inicio / Ficha; Estilo, Encabezado (anuncio + logo), Página (portada + secciones) y Pie; en el celular el detalle abre a pantalla completa, en escritorio a la derecha. `?tab=anuncio` y `?tab=inicio` siguen abriendo lo mismo para la Guía. 47 tests del admin en verde.
- [ ] Prueba en el navegador (esquema a 375 px y en escritorio, ficha de habitación con mosaico).

## Fase 2 — Tours
- [x] T2.1 Backend: sección `tours`; `TIPOS_POR_NEGOCIO.tours` (comunes + servicios, ubicación, políticas, tours); íconos de servicio `guia`, `grupo`, `seguro`, `calendario`, `idiomas`; `layout.tour`; plantillas `tours-catalogo` y `tours-operador`; tours sin estructura → Catálogo. 7 tests nuevos; suite completa 701/701.
- [x] T2.2 Store: home de tours con secciones; grilla de tours en grilla/carrusel con nota y "Destacado"; buscador de fecha y personas → `/tours?fecha&personas` (filtra por día de salida y cupo máximo); la ficha precarga personas y aplica `layout.tour` (mosaico, itinerario, incluye, otros tours) con barra fija en el celular; políticas sin check-in fuera de hotel.
- [x] T2.3 Admin: plantillas y secciones de tours, ficha «Ficha del tour», formulario de la sección tours, buscador en la portada.
- [ ] T2.4 Prueba en el navegador con `tour-test` (el backend del puerto 3000 no recargó solo; verificado con el código nuevo directo contra la BD).

## Fase 3a — Eventos con entradas
- [x] T3.1 Backend: sección `eventos` (variantes grilla, carrusel y agenda: una fila por función); `TIPOS_POR_NEGOCIO.eventos` (comunes + servicios, ubicación, políticas, eventos); íconos `entrada`, `musica`, `bar`; `layout.evento` (galería, mapa, otros eventos); plantillas `eventos-cartelera` y `eventos-unico`; eventos sin estructura → Cartelera (una clásica guardada antes deja de publicarse). 4 tests nuevos; el test de presets valida uno por uno (ya hay 16 tipos, más que `MAX_SECCIONES`). Suite completa 709/709.
- [x] T3.2 Store: la home de eventos usa las secciones (antes era la grilla fija); cartelera en grilla, carrusel o agenda, con "Destacado"; buscador Hoy / Este sábado / Este domingo / otra fecha → `/eventos?fecha=` (solo eventos con función ese día; la tarjeta lleva a esa función); la ficha aplica `layout.evento` (mosaico, mapa embebido del lugar del evento, otros eventos) con barra fija en el celular; políticas con "Pagas en la puerta" / "Antes de ir".
- [x] T3.3 Admin: plantillas y secciones de eventos, «Ficha del evento», formulario de la sección eventos, buscador en la portada. 47 tests en verde.
- [ ] T3.4 Prueba en el navegador con `evento-test` (verificado con el código nuevo directo contra la BD: resuelve Cartelera; hotel, tours y productos no cambian).

## Fase 3b — Alquiler de locales
Pendiente de especificar. Tipo de negocio nuevo (no es `eventos` de mini booking): espacios con capacidad por disposición, paquetes por invitado, calendario de fechas libres y solicitud de cotización (fecha + invitados + tipo de evento). Referencia: [verticales-reserva/analisis-infhotel.md](../verticales-reserva/analisis-infhotel.md) (salones y banquetes).
