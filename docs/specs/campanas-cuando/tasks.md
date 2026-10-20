# Tareas: Campañas, "el cuándo" (Fase 1)

> Spec: [spec.md](spec.md) · Diseño: [diseno.md](diseno.md) · Impacto: [impacto.md](impacto.md).
> Una pieza a la vez: no se empieza la siguiente sin verificar la anterior. Orden de la spec: **P1 → P2 → P3**.
> P1 y P3 se parten en dos entregas (a, b) para que cada una se pruebe sola. Las tareas asumen D-1, D-2 y D-3 del impacto aprobadas.
> Rutas relativas a la raíz de cada repo: **BE** = BackendNode, **AD** = FrontendAdmin, **TI** = FrontendStore.

## Pieza 0 — Antes de empezar (sin código nuevo)

- [x] T0.1 Commit de los cambios pendientes de campanas-widgets en el Admin (`AD src/app/pages/campanas/campanas.component.{ts,html}`, "el cuándo vs el cómo") y de `BE modules/idiomas/claves/claves-tienda.json`, `modules/idiomas/plataforma/en.json`.
- [x] T0.2 Los tres repos sin cambios pendientes en los archivos de este plan (la tienda tiene checkout sin commit: no se cruza, pero va en su propio commit).
- [x] Verificar: `git status` limpio en `AD src/app/pages/campanas/` y en `BE modules/campanas/`.

## Pieza 1a — Horas de inicio y fin (BE + AD + TI, visible)

R3.1–R3.8, R3.10–R3.14, R7.3, R7.5. Sin el cambio en caliente (eso es 1b).

**Backend**
- [x] T1a.1 `BE modules/campanas/calendario.js`: `ventana()` → `ventanas(campana, anio, ediciones = null)` que devuelve una lista; horas en el primer y el último día; `fechaClave` de una propia = día que contiene `fin − 1 ms`; la ventana del efecto pasa a un rango clave recortado a la campaña; descarta ventanas vacías. `vigente()` y `proximaVentana()` recorren la lista.
- [x] T1a.2 `BE modules/campanas/campanas.schema.js`: `horaInicio`/`horaFin` (`^([01]\d|2[0-3]):[0-5]\d$`, nulos); fin posterior al inicio ("La fecha y hora de fin deben ser posteriores al inicio"); 90 días contados como días de calendario que toca `[inicio, fin)`; en el catálogo, sin `00:00` de fin (R7.3) y sin ventana vacía ("Con estos días y horas la campaña quedaría vacía…"); `vistaPreviaQuerySchema` con `hora` opcional.
- [x] T1a.3 `BE modules/campanas/resolver.js`: `efectiva()` con las horas; `campanasAplicables(campanas, contexto)` como función con nombre (punto de extensión para la sede, ver impacto); `calendarioAnual()` con `ventanas[]` y conserva `inicio/fechaClave/fin`.
- [x] T1a.4 `BE modules/campanas/campanas.service.js` y `modules/tenants/tiendas.admin.routes.js`: vista previa con `hora` (sin hora, mediodía como hoy).
- [x] Tests (`BE modules/campanas/__tests__/calendario.test.js`, `resolver.test.js`, `campanas.schema.test.js`): CA-3.1 a CA-3.7, CA-3.9, CA-3.16; los tests de hoy **sin cambios** (prueban R3.5).

**Admin**
- [x] T1a.5 `AD src/app/shared/campo-hora/campo-hora.component.ts` (nuevo): "Todo el día | A las [HH:mm]", 44 px, `aria-label`, `aria-describedby` para la ayuda, etiqueta "hora de Lima"; entrada `sinHora` para el texto de la opción vacía.
- [x] T1a.6 `AD src/app/models/campana.model.ts`: `horaInicio`, `horaFin`, `ventanas` en `EntradaCalendario`.
- [x] T1a.7 `AD src/app/pages/campanas/campanas.component.{ts,html}`: horas en el panel propio y del catálogo (dos columnas: empieza / termina); textos de ayuda por estado (diseño pantalla 2); fin 00:00 explicado (R3.14); rango con hora solo si hay hora; chips "Empieza hoy a las…" y "Terminó"; orden Cuándo → Efecto (Uso llega en 3a).
- [x] T1a.8 `AD src/app/pages/diseno/campana-edicion.ts`: `validarCampana()` con las reglas de T1a.2; vista previa dentro de la ventana (R7.5); `AD src/app/services/tienda-diseno.service.ts` manda `hora`.
- [x] Tests: `campana-edicion` con los mismos casos que el schema del backend; `campo-hora`.

**Tienda**
- [x] T1a.9 `TI src/app/features/home/sections/offer-section.component.ts`: pie "Termina el {día} a medianoche / a las HH:mm / (día)" (CA-3.17) y "Terminando…" en cero en vez de desaparecer. Claves con `clave()`/`| t`.
- [x] T1a.10 `npm run claves` (TI, copia al backend) y el inglés en `BE modules/idiomas/plataforma/en.json`.
- [ ] Verificar (lo prueba Diego en el navegador): en el Admin pongo a una campaña propia "empieza hoy a las {hora + 5 min}"; la vista previa con esa hora la muestra y sin hora no; al recargar la tienda después de esa hora la veo, y la cuenta regresiva dice "Termina el … a las …". Una campaña guardada antes, sin hora, se ve igual que ayer.

## Pieza 1b — Horas frontera exactas (BE + TI, visible)

R3.9 completo, R7.4, R7.6, D-1.

**Backend**
- [ ] T1b.1 `BE modules/campanas/calendario.js`: `proximoCambio(campanas, ahora, ediciones)`.
- [ ] T1b.2 `BE utils/cache.js`: `cache(segundos, { hasta })` calculado al responder (`max-age = min(segundos, faltan)`, `swr` solo si faltan ≥ 1,5 × segundos).
- [ ] T1b.3 `BE modules/tenants/tiendas.store.routes.js` + `tiendas.cache.js`: `data[0].proximoCambio`; TTL en memoria `min(60 s, proximoCambio − ahora)`.
- [ ] T1b.4 `BE routes/store/index.js`: `/tiendas` con `cache(300, { hasta })`; `GET /store/hora` → `{ ahora }`, `Cache-Control: no-store`, sin BD.
- [ ] Tests: CA-3.13 (cabecera `max-age ≤ 120`, sin `swr`, a las 23:58 del 29 nov con BF y CM activas — CM llega en P2: aquí con dos campañas propias equivalentes); la caché en memoria no sirve una campaña pasada su frontera; `/store/hora` sin caché.

**Tienda**
- [ ] T1b.5 `TI src/app/core/services/reloj-tienda.service.ts` (nuevo): desfase con `/store/hora` (solo si hay campaña o `proximoCambio`; mitad del viaje de red); `ahora()`; temporizador a `proximoCambio + 0-10 s` con `runOutsideAngular`, recortado a 24 h; refresco con `storeService.getStoreBySlug` → `StoreState.setStore` + `queryClient.setQueryData(QueryKeys.store(slug))`; reintentos con espera creciente.
- [ ] T1b.6 `TI src/app/core/theme/campanas.ts` (`desdeApi` con la hora del servidor) y `src/app/state/diseno.state.ts` (retención de hasta 15 s al fin con la pestaña abierta; borrar el comentario "nunca con un timer").
- [ ] T1b.7 `TI src/app/features/store/store-layout/store-layout.component.ts`: arranca el reloj; fundido de 300 ms de los colores (directo con `prefers-reduced-motion`); compensación del scroll si un bloque cambia arriba de lo visible.
- [ ] T1b.8 `TI src/app/shared/components/efecto-festivo/efecto-festivo.component.ts`: no se reproduce en un cambio en caliente (R7.6).
- [ ] T1b.9 `TI offer-section.component.ts`: la cuenta usa `reloj.ahora()`.
- [ ] T1b.10 `TI src/app/models/tienda.model.ts`: `proximoCambio?` opcional.
- [ ] Tests: reloj (desfase, reprogramación, recorte de 24 h, reintento) con relojes falsos; `diseno.state` (retención de 15 s; al cargar, descarte inmediato).
- [ ] Verificar: con la tienda abierta y una campaña que termina en 3 minutos, sin tocar nada, la tienda cambia sola en menos de 15 s, con un fundido y sin saltar el scroll; después navego a otra página y sube al inicio. Con el reloj del computador adelantado 10 min, la campaña sigue hasta la hora real (CA-3.14, CA-3.15).

## Pieza 2 — Fechas por año: Cyber Wow y Cyber Monday (SQL + BE + AD, visible)

R2, R7.1, R7.2, R7.7, R7.8.

**Base de datos**
- [ ] T2.1 `BE docs/sql/campanas_ediciones.sql` y `campanas_ediciones_reversa.sql` (texto exacto en el impacto). Probar ida y vuelta en una copia.
- [ ] T2.2 `BE prisma/schema.prisma`: `campana_ediciones`, `campana_ediciones_historial`; renombrar el modelo a `avisos_plataforma` con `@@map("transmision_avisos_plataforma")` y actualizar `modules/transmisiones/transmisiones.plataforma.js` y su test.

**Backend**
- [ ] T2.3 `BE modules/campanas/presets.js`: Cyber Monday (jueves 4.º de noviembre + 4, prioridad 2) y Cyber Wow (`porAnio`, `edicionesEsperadas` abril/julio/noviembre, prioridad 2, 3 días antes, 0 después, efecto `etiquetas`).
- [ ] T2.4 `BE modules/campanas/calendario.js`: regla `porAnio` en `ventanas()` (una ventana por edición; hora de la tienda si la hay, si no la de la plataforma; rango clave = días de la edición).
- [ ] T2.5 `BE modules/campanas/ediciones.{repository,service,schema}.js` + `ediciones.admin.routes.js` (nuevos): leer por años (caché 60 s, se limpia al escribir); crear/cambiar/borrar con historial en la misma transacción; validaciones (fin posterior, ≤ 30 días, sin cruces, clave entre las esperadas, `fuente` https); contar tiendas activas (`runUnscoped`, solo el número); al escribir, `invalidateTiendasStoreCache()` (no `invalidateTiendaCache`). Montar en `BE routes/admin/index.js` con `requirePlatformAdmin`.
- [ ] T2.6 `BE modules/tenants/tiendas.store.routes.js` y `modules/campanas/campanas.service.js`: pasar las ediciones a `disenoPublico`, a `proximoCambio` y a `calendarioAnual` (`porAnunciar[]` por fila). Si la tabla falla: se resuelve sin "por año" y queda en la bitácora.
- [ ] T2.7 `BE modules/plataforma/avisos.js` (se mueve `avisarPlataforma`; transmisiones lo reexporta), `services/email.service.js` (`sendAlertaPlataformaEmail`, con alias), `jobs/campanas.job.js` + `server.js` (cada 6 h: bitácora una vez por edición faltante; correo a 60 días del día 1 del mes esperado, una vez).
- [ ] Tests: CA-2.1 a CA-2.10 (CA-2.7 con 403 para quien no es de la plataforma); CA-3.13 con Black Friday y Cyber Monday; historial; idempotencia del aviso; conteo de tiendas.

**Admin**
- [ ] T2.8 `AD src/app/models/campana.model.ts`: `porAnio`, ediciones, `porAnunciar`.
- [ ] T2.9 `AD src/app/pages/campanas/campanas.component.{ts,html}`: una barra por edición (pasadas atenuadas); "Próxima: …" y "3 ediciones en 2026"; año sin fechas: "Fechas de {año} por anunciar" con recuadros punteados; panel de Cyber Wow en solo lectura + "Según la plataforma" en las horas + enlace a plataforma si `esAdminPlataforma()`.
- [ ] T2.10 `AD src/app/pages/campanas-plataforma/*` (nuevo), `src/app/services/campanas-plataforma.service.ts` (nuevo), ruta `/campanas-plataforma` en `src/app/app.routes.ts` (sin menú; enlace desde Parámetros de la plataforma): diseño pantalla 5 completo, con "Fuente" (R7.8) y diálogo con el número de tiendas (R7.7).
- [ ] Tests: validaciones inline de la edición; la pantalla sin permiso.

**Tienda**
- [ ] T2.11 `TI src/app/models/diseno.model.ts` (`ReglaFecha` con `porAnio`) y `src/app/core/theme/campanas.ts` (simulador: `porAnio` → null; copia de Cyber Monday). D-3.
- [ ] Verificar: como plataforma cargo una edición del Cyber Wow que empieza mañana; una tienda demo que ya tenía el Cyber Wow activo lo muestra en su calendario del Admin sin hacer nada, y otra sin activarlo no. Con un año sin fechas veo "por anunciar". Al cambiar una edición cargada, el diálogo dice cuántas tiendas la tienen. En la tienda, el 30 nov gana Cyber Monday sobre Black Friday.

## Pieza 3a — Ventana de uso: guardar y resolver (BE + AD, visible solo en el Admin)

R1.1–R1.4, R1.10, R6.1.

**Backend**
- [ ] T3a.1 `BE modules/campanas/campanas.schema.js`: `uso` (propia: `{ desde, hasta }`, `hasta` obligatorio y ≤ fin + 365 días; catálogo: `{ hastaDiasDespues 0-365, desdeDiasDespuesInicio 0-365 | null }`).
- [ ] T3a.2 `BE modules/campanas/campanas.validacion.js` (nuevo): `validarCampanasDeTienda(tiendaId, campanas)` → 400 "Esta tienda no usa fechas de uso" sin `recibeReservas` (`datosDe(tiendaDe(id).tipoNegocio)`); se llama en el `PUT /:id/diseno` (`BE modules/tenants/tiendas.admin.routes.js`).
- [ ] T3a.3 `BE modules/campanas/resolver.js`: `uso` resuelto (fechas `YYYY-MM-DD`) en la campaña vigente y en el calendario, solo si el rubro recibe reservas.
- [ ] Tests: CA-1.1, CA-1.9, CA-1.10; `uso` ignorado en una tienda de productos guardada a mano.

**Admin**
- [ ] T3a.4 `AD src/app/negocio/perfil-negocio.ts`, `negocio/{hotel,tours,eventos,locales,canchas}/perfil.ts`, `negocio/perfiles.spec.ts`: `reservas.campanas.campo`.
- [ ] T3a.5 `AD src/app/negocio/frase-uso.ts` (+ spec con los casos que comparte la tienda): "Reserva hasta el {fin} · {usoHasta | usoRango}".
- [ ] T3a.6 `AD src/app/pages/campanas/campanas.component.{ts,html}` y `campana-edicion.ts`: recuadro "Fechas de uso" (decisión B) solo con `tenantService.tieneReservas()`; absolutas en la propia, relativas en el catálogo con "Este año: hasta el …"; "Así lo verá tu cliente…"; nota fija sin "oferta" ni "descuento"; orden Cuándo → Uso → Efecto (decisión G); validaciones como el backend.
- [ ] Verificar: en el hotel demo agrego a Black Friday "Estadías hasta 90 días después" y guardo; el panel dice "Así lo verá tu cliente: «Reserva hasta el 30 nov · para alojarte hasta el 28 feb»". En la tienda de productos el recuadro no existe.

## Pieza 3b — Ventana de uso en la tienda (TI, visible)

R1.5–R1.9, R6.2, D-2.

- [ ] T3b.1 `TI src/app/negocio/perfil-negocio.ts`, `negocio/{hotel,tours,eventos,locales,canchas}/vitrina.ts`, `negocio/perfiles.spec.ts`: `reserva.campana` (`reservaHasta`, `usoHasta`, `usoRango`, `leyenda`, `entra` solo hotel) con `clave()`; mismos casos que el test del Admin.
- [ ] T3b.2 `TI src/app/models/diseno.model.ts` (`CampanaResuelta.uso?`), `src/app/core/theme/uso-campana.ts` (nuevo, puro: `marcaDeUso`, `estadiaEntra`), `src/app/state/diseno.state.ts` (`usoCampana()`).
- [ ] T3b.3 `TI src/app/features/home/sections/offer-section.component.ts`: línea de uso dentro del bloque (el fin se escribe una sola vez) y banda de respaldo bajo el hero si no hay cuenta regresiva.
- [ ] T3b.4 `TI src/app/features/reservas/compartido/calendario.core.ts` (+ spec) y su copia idéntica `AD src/app/shared/calendario/calendario.core.ts` (+ spec): `DiaCalendario.campana?`, `OpcionesMes.marca?` aplicada al final de `semanasMes`.
- [ ] T3b.5 `TI .../compartido/grilla-mes.component.ts` (rombo, etiqueta de la celda), `calendario-mes.component.ts` y `calendario-rango.component.ts` (input `marca`, leyenda solo con marcas en el mes).
- [ ] T3b.6 Hotel: `TI .../hotel/buscador-hotel.component.ts`, `hotel/habitacion-page.component.{ts,html}` (marca + "Tu estadía entra en {campaña}" con `entra` y `estadiaEntra`).
- [ ] T3b.7 Tours y locales: `TI .../tours/tour-page.component.{ts,html}`, `.../locales/salon-page.component.{ts,html}`.
- [ ] T3b.8 Canchas: `TI .../canchas/reservador.component.ts` (rombo en la tira de días y leyenda).
- [ ] T3b.9 Eventos: `TI .../eventos/evento-page.component.html`, `eventos-grid.component.ts` (etiqueta en funciones disponibles dentro del uso).
- [ ] T3b.10 `npm run claves` (TI → BE) y el inglés de hotel en `BE modules/idiomas/plataforma/en.json`.
- [ ] Tests: núcleo (la marca nunca sobre un día no elegible ni tachado); `uso-campana`; `npm test` con `anti-identidad` (CA-1.12).
- [ ] Verificar: en el hotel demo, el 25 nov la portada dice una vez "Reserva hasta el 30 nov · para alojarte hasta el 28 feb" (en inglés si cambio el idioma); el calendario tiene rombos hasta el 28 feb y no en noches cerradas; si elijo 3 noches dentro, el pie dice "Tu estadía entra en Black Friday"; los precios son los de siempre. En tours, eventos, locales y canchas veo la marca donde corresponde y puedo reservar fuera del uso sin aviso.

## Después de la Fase 1

- [ ] QA: matriz criterio × rubro de la spec (Resumen por rubro).
- [ ] Deployer: SQL de P2 antes del backend de P2; sin llaves nuevas; verificar las cabeceras de `/store/tiendas` en producción (`max-age` dinámico y si el borde de Railway cachea).
