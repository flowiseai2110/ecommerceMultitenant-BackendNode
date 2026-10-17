# Tareas: selector de fechas

> Implementa [spec.md](spec.md) con los patrones de [patrones.md](patrones.md). Marcar `[x]` al cerrar cada tarea.

## Cómo retomar

1. Estado: D1 y D2 decididos; D5 (CDK) propuesto, se decide al empezar la fase 3. Fases 1–4 hechas (2026-10-16), sin commit en tienda ni admin; falta prueba en navegador (P1–P4). Fase 5 descartada (D1). T4.11 hecha. Solo queda la prueba.
2. El orden importa: K0 y K1 primero, porque K2–K4 se apoyan en ellos.
3. Cada fase deja las pantallas funcionando; no hay pantallas a medias entre fases.
4. Rutas: Store = `FrontendStore/src/app/features/reservas/`, Admin = `FrontendAdmin/src/app/`.

## Fase 1 — Núcleo y grilla (Store) — hecha 2026-10-16, sin commit

- [x] **T1.1** `compartido/calendario.core.ts` (K0): `semanasMes` (semanas de 7, con hoy y selección), `moverFoco`, `Atajo` + `atajoActivo`, `mesDe`, `sumarMeses`, `finDeMes`. **Sin imports**: tiene sus propios helpers de fecha para copiarse idéntico al admin.
- [x] **T1.2** Reglas de hotel en K0 con la selección como unión (`SeleccionRango`: vacío / entrada / completo), `tocarRango`, `motivoDia` y `parteRango` (incluye la vista previa). `hotel/calendario-estadia.ts` quedó como adaptador a la forma vieja; su test pasa sin cambios.
- [x] **T1.3** `compartido/calendario.core.spec.ts`: 14 casos (meses que empiezan lunes y domingo, bisiesto, flechas, Inicio/Fin, RePág/AvPág con meses cortos, límites, atajos, rango y previa).
- [x] **T1.4** `compartido/grilla-mes.component.ts` (K1): filas `role="row"`, foco itinerante, `aria-disabled`, `aria-current="date"`, `sub`, `tono` y banda continua del rango. Salidas: `elegir`, `hover`, `salirDelMes`.
- [x] **T1.5** Teclado dentro de K1: usa `moverFoco`; si el destino está en otro mes emite `salirDelMes` y lo enfoca cuando el padre pinta ese mes (`afterRenderEffect`). 3 tests en `compartido.spec.ts`.

## Fase 2 — Un día y rango en la vitrina (prioridad alta) — hecha 2026-10-16, sin commit, falta prueba en navegador

- [x] **T2.1** `calendario-mes` (K2) usa K1. Input `leyenda` (`{ pocos, destacado, tachado }`, textos ya traducidos): se muestran solo las marcas presentes en el mes. Reexporta `DiaCalendario` y `EstrategiaCalendario` del núcleo.
- [x] **T2.2** Estrategia del salón: `parcial` → tono `pocos` y `sub` con los turnos libres del paquete ("1 turno", "2 turnos"); por horas, sin `sub`. Leyenda propia; se quitó el punto ámbar y la leyenda fija del HTML.
- [x] **T2.3** Tour: la etiqueta "(sin salida)" ya existía; se sumó la leyenda "Sin salida ese día".
- [x] **T2.4** Salón por horas: botones con las horas de inicio válidas cada 30 min (dentro de `horasDesde`–`horasHasta`, dejando lugar a las horas pedidas, cruza medianoche). Si el salón no tiene horario, queda el `input type="time"`.
- [x] **T2.5** `compartido/calendario-rango.component.ts` (K3): campos opcionales (`conCampos`), 2 meses con container query (`@xl`, ≥ 576 px del contenedor), vista previa solo si el día sirve como salida, total tentativo, atajos, Borrar, modo `dia`. Estado con `linkedSignal` sobre la máquina del núcleo.
- [x] **T2.6** Ficha de habitación con K3 (`conCampos=false`: ya tiene sus campos). `calendario-estadia.component.ts` borrado (`git rm`); `calendario-estadia.ts` queda como adaptador para su test.
- [x] **T2.7** Cambio respecto al spec: el total y el mínimo no salen del perfil. La ficha de hotel (código de un solo rubro) pasa `total` y `minimo` como funciones con las claves existentes `{n} noche(s)` y `mínimo {n} noches`. No se tocó `perfiles.spec.ts`.
- [x] **T2.8** Claves nuevas: "Borrar", "Elegir", "Sin salida ese día". `PANTALLAS` (scripts/claves-tienda.mjs) apunta "Calendario de la estadía" a K3. Catálogo copiado al backend (`npm run claves`).

Tests: 44/44 en `features/reservas` (4 nuevos de K3, leyenda de K2). Build OK.

## Fase 3 — Campo con panel y fecha memorable (Store) — hecha 2026-10-16, sin commit, falta prueba en navegador

- [x] **T3.1** `compartido/campo-fecha.component.ts` (K4) con `@angular/cdk` ~22.1 (D5): `createOverlayRef` + posición conectada (se da vuelta y se empuja si choca con el borde) desde 768 px; posición global abajo y scroll bloqueado debajo (`BreakpointObserver`, se decide al abrir). `cdkTrapFocus` con autocaptura; cierra con Escape, fondo (`backdropClick`, sin expresión en `(mousedown)`) y Confirmar; el foco vuelve al campo. `overlay-prebuilt.css` agregado en `angular.json` (build y test).
- [x] **T3.2** Hoja inferior: K3 detecta el panel por `PANEL_FECHA` (`compartido/panel-fecha.ts`, inyección desde el contenido proyectado) y pasa a meses apilados (4, "Ver más meses" de a 3; el teclado agrega uno si hace falta) con los días de la semana fijos (`encabezadoFijo` en K1). "Confirmar" fijo, deshabilitado mientras falta la salida. Cambio respecto al spec: botón "Ver más meses" en vez de carga al llegar al final.
- [x] **T3.3** Buscador de hotel (barra y tarjeta): un K4 con K3 (Llegada/Salida, total en noches, hasta 365 días y 30 noches, sin disponibilidad). El calendario va dentro de cada `app-campo-fecha` (un `ng-template` compartido no ve `PANEL_FECHA`). K3 ahora avisa cada mes visible una sola vez (`effect`).
- [x] **T3.4** `compartido/fecha-memorable.component.ts` (K5): `ControlValueAccessor`, solo dígitos, `autocomplete="bday-*"`, error al salir del grupo. `errorFechaMemorable` pura con tests (31/02, 29/02 no bisiesto, mes 13, año de 2 cifras, futura, más de 120 años).
- [x] **T3.5** `solicitud-page`: nacimiento con K5 y `[(ngModel)]` sin cambios; el error "Ingresa tu fecha…" del formulario solo aparece si K5 no muestra el suyo.

Tests: suite completa de la tienda 200/200 (reservas 49, con K4 y K5). Build OK; el bundle inicial subió 5,7 kB (733,7 → 739,5 kB; el aviso de presupuesto ya existía).
- ~~T3.6 Buscadores de tours, eventos y locales con K4~~ y ~~T3.7 "Ver mes" en canchas~~: descartadas por D2 (K4 solo en hotel).

### Ajustes para alinear con el prototipo (2026-10-16)

- [x] Texto bajo los días que no se eligen: salón "ocupado"/"cerrado", tour "cerrado", hotel "agotado" (claves `…|día del calendario`). K1 lo pinta en gris.
- [x] K1 `forma="pildora"` en K3: días y puntas de la banda redondos.
- [x] Buscador de hotel con atajos "Este fin de semana" (viernes–domingo; desde hoy si ya es viernes o sábado) y "1 semana" (7 noches desde hoy).
- [x] Hoja del celular: título propio (`titulo`, "¿Cuándo te quedas?") y resumen junto a Confirmar ("13 – 15 nov · 2 noches") que K3 avisa por `PANEL_FECHA.resumen`.

## Fase 4 — Admin

Hecha 2026-10-16, sin commit, falta prueba en navegador. Admin 156/156 tests, tienda 201/201; builds OK (el aviso de presupuesto del admin ya existía: el calendario va en chunks diferidos).

- [x] **T4.1** `shared/calendario/`: `calendario.core.ts` y su spec **idénticos** a la tienda (verificado con `cmp`); `grilla-mes` copiada con colores del panel (`blue-600`/`blue-50`, que tienen modo oscuro) y nombres de fecha con `Intl` (`fechas.ts`, el panel no tiene i18n). El núcleo suma el modo **`periodo`** (desde y hasta incluidos, admite un día, no puede terminar en un día bloqueado) en los dos repos, con test.
- [x] **T4.2** Cambio respecto al spec: sin `ControlValueAccessor`. Cada formulario guarda dos campos separados, así que `app-campo-periodo` (K3 del panel: campo desplegable + calendario de 1 o 2 meses por container query) recibe `desde`/`hasta` y emite `cambio`. K2 del panel = el mismo componente con `modo="dia"`. Extras: `finOpcional` ("Sin fecha de fin"), `opcional` (Borrar emite vacío), `mesVisible`, `leyendaMarcados`, y `estrategia` con `habilitado: false` deja un día sin elegir.
- [x] **T4.3** Tarifas: período de la temporada con las otras temporadas activas en ámbar y aviso neutral de solape ("Revisa que el precio de esas noches…"; no se afirma cómo se combinan).
- [x] **T4.4** Disponibilidad ("Cambiar varias noches"): noches con habitaciones ocupadas en ámbar y conteo de noches ocupadas en el rango (solo de los 14 días cargados en la grilla).
- [x] **T4.5** Cierres (`reservas-config`): período desde hoy, días que ya tienen cierre en ámbar.
- [x] **T4.6** Cupones (form reactivo: `patchValue` + `markAsDirty`, fin opcional = sin vencimiento) y campañas propias (`poner`), con atajos "1 semana · 2 semanas · Hasta fin de mes" (`ATAJOS_VIGENCIA`).
- [x] **T4.7** Cotizaciones: fecha con `modo="dia"`; estado del salón por mes con `calendarioLocal` (vendidas y cerradas tachadas y sin elegir, parciales en ámbar). Al cambiar de salón recarga los meses ya vistos.
- [x] **T4.8** `atajos-rango` (K6, `ATAJOS_FILTRO`): reservas (Hoy, Mañana, Próximos 7 días, Este mes), libro de reclamaciones (Últimos 7/30 días, Este mes, Mes pasado) y comunicados (Hoy, Mañana, Próximos 7 días). Los nativos quedan; "Quitar fechas".
- [x] **T4.9** Ya existía en la agenda de canchas ("‹", fecha, "›" y "Hoy"); sin cambios.
- [x] **T4.10** Cupones: `markAsDirty`; campañas: `poner()` ya marca `dirty`; tarifas, disponibilidad, cierres y cotizaciones no usan el guard.
- [x] **T4.11** Botón "Hoy" junto a la fecha de entrega de carta (libro de reclamaciones). Vencimiento de cuota sin botón: el vencimiento suele ser futuro, la cuota nueva ya hereda la fecha de la anterior y la fila no tiene espacio.

## ~~Fase 5 — Precio y cupos por día~~ (descartada: D1 no aplica, 2026-10-16)

## Prueba

- [ ] **P1** 390 px y 1440 px en ficha de habitación, ficha de tour, ficha de salón, buscador de hotel y solicitud.
- [ ] **P2** Solo teclado en ficha de habitación (vitrina) y tarifas (admin).
- [ ] **P3** Lector de pantalla en K1: fecha y motivo.
- [ ] **P4** Tienda demo por rubro: `killa-hostal`, `tour-test`, `casa-alborada`.
- [ ] **P5** `npm run build` y `npm test` en los dos repos.

## Mejoras detectadas (backlog)

- (vacío)
