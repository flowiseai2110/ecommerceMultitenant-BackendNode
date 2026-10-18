# Spec: plantillas estándar por rubro (prototipo → pantallas → plantillas)

> Estado (2026-10-13): pasos 1 y 2 terminados. **Hotel: pasos 3 y 4 terminados** (sin commit): las 5 partes del flujo se ven como el prototipo y `hotel-estandar` prende todas sus opciones; aplicada en la demo `demobooking`. Los otros 5 rubros: paso 3 pendiente (sus plantillas "Estándar" solo cambian home, paleta y tipografía).
> Diseños: lienzo "Plantillas estándar por rubro" (claude.ai/artifact/VUn82KP1ALcqC2HLzv7Gpk), páginas Móvil y Desktop, 6 flujos de 6 pantallas. Copia en el repo: [docs/disenos/plantillas-por-rubro/v1-2026-10-13/](../../disenos/plantillas-por-rubro/v1-2026-10-13/).
> Repos: FrontendStore (pantallas), BackendNode (datos y plantillas), FrontendAdmin (solo donde haga falta cargar un dato o elegir una opción de layout).
> Base: [perfil-negocio](../perfil-negocio/spec.md), [layout-por-rubro](../layout-por-rubro/spec.md), [diseno-por-rubro](../diseno-por-rubro/spec.md), [editor-diseno-en-vivo](../editor-diseno-en-vivo/spec.md).

## Objetivo

Que cada uno de los 6 rubros (productos, hotel, tours, eventos, locales y canchas) se vea **igual que el prototipo** en el FrontStore, en móvil y en desktop, desde la home hasta la confirmación. Con esas pantallas se arma **una plantilla por rubro** en Admin › Diseño. Esas plantillas son el nuevo estándar de las tiendas demo.

## Proceso

Cada paso empieza cuando el anterior está terminado.

| Paso | Qué | Resultado | Estado |
|---|---|---|---|
| 1 | Diseño de los 6 rubros en móvil y desktop | Lienzo de 12 tableros | ✅ Terminado |
| 2 | Análisis de datos y de componentes | [analisis.md](analisis.md): datos que hay y que faltan. [mapeo-pantallas.md](mapeo-pantallas.md): por cada pantalla, qué componente se **reusa**, cuál se **ajusta** y cuál es **nuevo** | ✅ Terminado (el mapeo por pantalla, 2026-10-13) |
| 3 | Construir las pantallas según el mapeo | Componentes compartidos (C1–C10) y propios de cada rubro. Cada rubro queda igual al prototipo en móvil y desktop | 🟡 En curso: piloto hotel |
| 4 | Armar las plantillas | Una plantilla "Estándar · …" por rubro que prende las pantallas del paso 3. Aplicada en las tiendas demo | 🟡 Adelantada: solo home, paleta y tipografía |

### Por qué en este orden

El prototipo tiene pantallas muy distintas a las actuales. Sin el mapeo del paso 2 no se sabe qué hay que construir. Cada rubro necesita algo distinto: locales, 3 componentes nuevos; productos, 1; hotel, ninguno porque usa solo los compartidos. Si la plantilla se arma antes de tener las pantallas, solo cambia la portada y los colores.

> Lo que pasó: E1–E9 ([tasks.md](tasks.md)) agregaron **datos y funciones** (pago automático, QR, pago dividido, check-in, filtros), no las pantallas del prototipo. La etapa visual (E4) solo agregó la calificación, el `.ics` y los textos en inglés. Por eso el paso 3 empieza de nuevo con el mapeo.

## Alcance del paso 3

Lo que hay que construir está en [mapeo-pantallas.md](mapeo-pantallas.md):

| | Nuevos | Ajustes |
|---|---|---|
| Compartidos (C1–C10) | 8 | 2 |
| Productos | 1 (`app-combina-con`) | 5 |
| Hotel | 0 | 4 |
| Tours | 0 | 3 |
| Eventos | 2 (`app-evento-destacado`, `app-ventana-entradas`) | 4 |
| Locales | 3 (`app-tipos-evento`, `app-opcion-paquete`, `app-plan-pagos`) | 3 |
| Canchas | 2 (`app-selector-deporte-dia`, `app-grilla-canchas`) | 4 |
| **Total** | **16** | **25** |

Orden:

1. Compartidos que usan casi todos: C1 (checkout de reserva), C2 (confirmación) y C3 (tarjeta en fila).
2. Un rubro piloto completo en móvil y desktop: **hotel**.
3. Los demás rubros, uno por uno: tours, canchas, eventos, locales y productos.

## Reglas

1. **Una pantalla nueva del prototipo es una opción del layout del rubro, no un reemplazo.** Ejemplo: `habitacion.listado = 'grilla' | 'filas'`. La plantilla "Estándar" prende la opción y las demás plantillas siguen como están. Se lee con `opcionesHabitacion()`, `opcionesTour()`…, nunca con `layout().habitacion` directo.
2. **Si un cambio es una mejora para todas las tiendas, va sin opción.** Por ejemplo, el buscador de hotel con Llegada / Salida, el resumen fijo en `solicitud-page` o la confirmación nueva.
3. **Los textos por rubro van al perfil** (`PerfilNegocio` / `PerfilReserva`), no en ramas de la plantilla. Los componentes compartidos usan slots (`app-slot-rubro`) y no preguntan por el rubro. Ver `CLAUDE.md` del FrontendStore.
4. **Los componentes de un solo rubro van en su carpeta** (`features/reservas/<rubro>/` o `negocio/<rubro>/`). Los compartidos van en `features/reservas/compartido/`.
5. **Un dato que falta no frena la pantalla.** La pantalla se dibuja sin esa parte, y el dato queda como decisión en la lista de [mapeo-pantallas.md §4](mapeo-pantallas.md).

## Cuándo un rubro está terminado

- Las 6 pantallas del flujo se compararon una por una con el prototipo, a **390 px y 1440 px**, en la tienda demo del rubro con la plantilla "Estándar" aplicada.
- Las diferencias que quedan están anotadas y tienen una razón: dato pendiente (D3) o decisión del usuario.
- Sin scroll horizontal en móvil.
- `npm run build` y `npm test` pasan, incluidos `perfiles.spec.ts` y `uis.spec.ts` si cambiaron.

Tiendas demo: `zapatillas` (productos), `killa-hostal` (hotel), `tour-test` (tours), `evento-test` (eventos), `casa-alborada` (locales) y `los-cedros` (canchas).

## Paso 4: plantillas

Al cerrar el paso 3 de un rubro se rehace su plantilla en `modules/diseno/plantillas.js`:

- tema (paleta "Clara" del rubro y tipografía "estandar": Bricolage Grotesque + Figtree);
- secciones de la home del prototipo;
- opciones de layout que prenden las pantallas nuevas.

Después se aplica en la tienda demo del rubro. Las 6 plantillas actuales están en [tasks.md §2b](tasks.md).

## Decisiones

Vienen de [mapeo-pantallas.md §5](mapeo-pantallas.md):

| # | Decisión | Estado |
|---|---|---|
| D1 | Pago en la pantalla de datos con pago directo; con solicitud, "Enviar solicitud" | Tomada por defecto |
| D2 | Checkout de productos en una página (rehacer `checkout-page`) o mantener 3 pasos | **Pendiente** |
| D3 | Datos faltantes: cuáles entran (cupos por horario, adelanto o total, deporte, PDF…) | Por defecto ninguno. **Revisar** |
| D4 | Formularios más cortos en eventos y canchas | Por defecto sin cambios en hotel. **Revisar** |
| D5 | Rubro piloto | Hotel |

## Documentos

- [analisis.md](analisis.md): análisis de datos y de componentes (paso 2) y hoja de ruta E1–E9.
- [mapeo-pantallas.md](mapeo-pantallas.md): mapeo pantalla por pantalla (paso 2) y avance del paso 3.
- [tasks.md](tasks.md): tareas de E1–E9, SQL, plantillas actuales y pruebas manuales.
