# Tareas: efectos festivos y rediseño de Campañas

> Implementa [spec.md](spec.md) según [plan.md](plan.md). Marcar `[x]` al cerrar cada tarea.
> Orden de despliegue: backend → tienda → admin. Sin SQL: todo vive en `tienda_configuraciones`.

## Fase 1 — Backend (hecha)
- [x] **T1.1** `campanas/efectos.js`: catálogo `EFECTOS`, `MODOS_EFECTO`, `MAX_SALUDO`.
- [x] **T1.2** Presets: `efecto`, `diasEfecto`, `saludo` en los 10; preset nuevo `anio-nuevo` (31 dic, 5 días antes, 1 después, fuegos).
- [x] **T1.3** Schema: `efecto`, `efectoModo`, `saludo` en `campanaTiendaSchema`.
- [x] **T1.4** `calendario.js#ventanaEfecto`; `resolver.js`: campos nuevos en `efectiva`, `efectoVigente` → `campana.efecto`, `efecto/efectoModo/saludo/efectoInicio/efectoFin` en `calendarioAnual`; `efectos` en `GET /campanas/calendario`.
- [x] **T1.5** `__tests__/efectos.test.js` (14 tests). Suite completa: 1366 tests.

## Fase 2 — Tienda (hecha)
- [x] **T2.1** `EfectoCampana` y `CampanaResuelta.efecto`; copia de presets con efectos y Año Nuevo (`core/theme/campanas.ts`).
- [x] **T2.2** `core/efectos/`: `motor.ts`, `caida.ts`, `fuegos.ts`, `subida.ts`, registro tipado con `import()` en `efectos.ts`.
- [x] **T2.3** `shared/components/efecto-festivo` en `store-layout`: una vez por visita (`sessionStorage`), fuera de las rutas `sinComunicadoModal` (carrito, checkout, rastreo, trámites, cuenta), reduced motion → solo saludo.
- [x] **T2.4** Vista previa: `diseno.campana` y `diseno.widgets` en el borrador; mensaje `vp-efecto`.
- [x] **T2.5** `core/efectos/efectos.spec.ts`; `ng build` OK; 148 tests.

## Fase 3 — Admin (hecha)
- [x] **T3.1** Modelo (`efecto`, `efectoModo`, `saludo`, `NOMBRE_EFECTO`, `COLOR_EFECTO`) y servicio (sin `getVistaPrevia`: la vista previa ahora es la tienda real).
- [x] **T3.2** Campañas: calendario con barras por campaña, rombos en los días del efecto, línea de hoy, resumen del día, detalle con efecto, modo, días, saludo, vista previa del efecto en un iframe de la tienda y "Editar cómo se ve →". Se quitó el editor de textos/colores (`campana-editor`), que pasó a Diseño.
- [x] **T3.3** Diseño: selector "Editando" (`?campana=`), aviso bajo la barra, esquema de campaña (`?parte=`), `campana-panel.component`, `campana-edicion.ts` (tabla de partes, cambiado/restablecer, adaptador `campanaParaVista`, validación), campañas y adornos en el borrador, Deshacer y Publicar; adornos de todo el año en Encabezado.
- [x] **T3.4** `campana-edicion.spec.ts`; `ng build` OK; 106 tests.

## Fase 4 — Verificación
- [x] **T4.1** `npm test` backend (1366), `ng test` tienda (148) y admin (106).
- [ ] **T4.2** Con sesión de admin: activar Navidad, "Editar cómo se ve", cambiar la portada y ver el efecto en la vista previa; publicar.
- [ ] **T4.3** En la tienda: con una campaña cuyo efecto esté vigente, el efecto sale una vez por visita y no sale en checkout.
