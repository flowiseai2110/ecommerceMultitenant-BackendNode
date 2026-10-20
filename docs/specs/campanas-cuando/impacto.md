# Impacto: Campañas, "el cuándo" (Fase 1: horas, fechas por año, ventana de uso)

> Spec: [spec.md](spec.md) (aprobada) · Diseño: [diseno.md](diseno.md) (v1, decisiones A–I y P1–P8 aprobadas, R7) · Estado: **aprobado 2026-10-19** (D-1, D-2 y D-3 aprobadas). Modo ahorro: piezas 0+1a y 3a+3b juntas; QA solo en 1b y 2; desarrollador sonnet
> Alcance: Fase 1 (P1 horas + R3.9 horas frontera exactas, P2 fechas por año, P3 ventana de uso, R7). La Fase 2 (R4, R5) no se planifica; ver "Lo que esta fase deja decidido para la Fase 2".
> Revisado contra el código el 2026-10-19 (los tres repos).

## Resumen en una frase

Las campañas podrán empezar y terminar **a una hora exacta** (y la tienda abierta cambia sola a esa hora), la plataforma podrá cargar cada año las fechas del **Cyber Wow** (y se suma el **Cyber Monday**), y los negocios con reservas podrán decir **para qué fechas de uso** vale su campaña, que el cliente verá en la portada y como un rombo en el calendario, sin que cambie ningún precio.

## Preguntas para Diego antes de construir (cambian la solución)

Tres puntos donde el plan se aparta de una línea de la spec o del diseño. Recomiendo la opción marcada; las tareas ya están escritas con ella.

| # | Punto | Recomendación | Por qué | Si dices que no |
|---|---|---|---|---|
| D-1 | **R3.9.3 "la respuesta trae `ahora`".** La respuesta de `/store/tiendas` se guarda en cachés (navegador, la del backend de 60 s y, si existe, el borde de Railway). Un `ahora` guardado llega **viejo** hasta 5 min, y la tienda creería que su reloj está adelantado: la campaña terminaría hasta 5 min tarde, justo lo que R3.9 quiere evitar. | **La hora del servidor sale de un endpoint aparte, sin caché: `GET /store/hora`** (`Cache-Control: no-store`, sin BD). La tienda lo pide **solo si hay campaña o `proximoCambio`**, una vez por carga y antes de cada cambio programado, y corrige la mitad del viaje de red (como NTP). `/store/tiendas` trae `proximoCambio`, pero no `ahora`. | Es la única forma de que el reloj sea confiable sin quitar la caché que protege a Railway. Cuesta una petición muy pequeña por visita, y solo en tiendas con campaña. | Se pone `ahora` en `/store/tiendas` como dice la spec, y CA-3.15 puede fallar hasta por 5 min cuando la respuesta sale de la caché. |
| D-2 | **Marca del rombo en el calendario.** El diseño dice "cada rubro llena el flag en su estrategia, solo en días ya habilitados". En el calendario del hotel (`calendario-rango`), lo que se puede elegir lo deciden las reglas **después** de la estrategia del rubro (`calendario-rango.component.ts:149-159`): la estrategia no sabe si el día se puede elegir. | La regla "solo sobre fechas que ya se pueden elegir" vive en **un solo lugar**: `semanasMes()` del núcleo (`calendario.core.ts:76`) recibe `marca(fecha)` y pone `campana = habilitado && !tachado && marca(fecha)` al final. Cada pantalla solo pasa la marca de la campaña. | Escrita cuatro veces, la regla se desalinea (y en el hotel ni siquiera se puede cumplir). Es la misma Strategy de hoy, con un paso común al final. | Cada estrategia pone su flag; el hotel necesita duplicar las reglas del rango. |
| D-3 | **Copia del catálogo en la tienda** (`core/theme/campanas.ts`, solo para el simulador de desarrollo, **apagado**: `SIMULADOR_ACTIVO = false` en `state/diseno.state.ts:34`). | El simulador **omite** las campañas "por año" (no puede tener las ediciones de la plataforma): el tipo `ReglaFecha` gana `'porAnio'` y `ventanaCampana()` devuelve null para esa regla (el compilador obliga a tratarla). Se le copia **Cyber Monday**, que sí se calcula. No se copia Cyber Wow. | Que el simulador sepa de ediciones obligaría a pedirlas a la API pública solo para desarrollo. La vista previa del Admin con hora (R3.11) ya cubre "ver la tienda en una fecha". | — (Ver "Deuda que conviene cerrar": borrar el simulador y su copia.) |

## Mapa de cambios

### Backend (`ecommerceMultitenant-BackendNode`)

| Módulo / archivo | Tipo | Pieza | Por qué |
|---|---|---|---|
| `modules/campanas/calendario.js` | cambia | P1, P2 | `ventana()` pasa a **`ventanas(campana, anio, ediciones)`**, que devuelve una **lista** (0 a 3 ventanas: una por edición en "por año"). Horas en el primer y el último día (R3.3). `fechaClave` de una propia = el día que contiene `fin − 1 ms` (con fin 00:00 el último día es el anterior, R3.14; sin hora es idéntico a hoy). Nueva **`proximoCambio(campanas, ahora, ediciones)`**: el menor inicio o fin posterior a `ahora` de las ventanas y de las ventanas de efecto de las campañas activas (años `a−1..a+1`). La ventana del efecto pasa de "días desde la fecha clave" a un **rango clave** (en "por año", todos los días de la edición, R2.5). Una ventana vacía (`inicio >= fin`) se descarta. |
| `modules/campanas/resolver.js` | cambia | P1, P2, P3 | `efectiva()` lleva `horaInicio`/`horaFin`, `uso` y la regla "por año". `resolverCampana()` y `disenoPublico()` reciben `ediciones` (siguen siendo **puras**) y devuelven `uso` resuelto (fechas) solo si el rubro recibe reservas. `calendarioAnual()` devuelve `ventanas[]` y `porAnunciar[]` por fila, y conserva `inicio/fechaClave/fin` (la vigente o la próxima; null si no hay) para el Admin anterior. El filtro de las activas pasa a una función con nombre, `campanasAplicables(campanas, contexto)`: es el punto donde un día entra la sede (ver multi-sede). |
| `modules/campanas/presets.js` | cambia | P2 | Presets **Cyber Monday** (`nEsimoDia`, mes 11, jueves 4.º + **4**, prioridad 2, 0 días antes y después) y **Cyber Wow** (`{ tipo: "porAnio", edicionesEsperadas: [{ clave: "abril", nombre: "Abril", mes: 4 }, { clave: "julio", … mes: 7 }, { clave: "noviembre", … mes: 11 }] }`, prioridad 2, 3 días antes, 0 después, efecto `etiquetas`). R7.1. |
| `modules/campanas/campanas.schema.js` | cambia | P1, P3 | Campos opcionales nuevos de cada campaña: `horaInicio`, `horaFin` (`HH:mm` o null) y `uso`. Propia: `uso: { desde: fecha \| null, hasta: fecha }`; catálogo: `uso: { hastaDiasDespues: 0-365, desdeDiasDespuesInicio: 0-365 \| null }`. Validaciones R3.6 (fin posterior; 90 días contados como **días de calendario que toca la ventana**, así CA-3.6 rechaza con o sin horas; ventana del catálogo no vacía), R7.3 (sin `00:00` de fin en el catálogo), R1.3 (`hasta` obligatorio y ≤ fin + 365 días). `vistaPreviaQuerySchema` acepta `hora` opcional (R3.11). |
| `modules/campanas/campanas.validacion.js` | **nuevo** | P3 | `validarCampanasDeTienda(tiendaId, campanas)`: rechaza `uso` si el rubro no tiene `recibeReservas` (`datosDe(tiendaDe(id).tipoNegocio)`), con 400 "Esta tienda no usa fechas de uso" (CA-1.1). Mismo patrón que `validarEstructuraDeTienda` (el schema no conoce el rubro). |
| `modules/campanas/ediciones.repository.js`, `ediciones.service.js`, `ediciones.admin.routes.js`, `ediciones.schema.js` | **nuevo** | P2 | Ediciones de la plataforma: leer por años (caché en memoria 60 s, se limpia al escribir), crear/cambiar/borrar con historial en la misma transacción, validar (fin posterior, ≤ 30 días, sin cruces en el año, máximo las esperadas del preset, `fuente` solo `https://`), contar tiendas con la campaña activa (R7.7). Rutas `GET/PUT/DELETE /admin/campanas/ediciones…` con `requirePlatformAdmin`. |
| `modules/campanas/campanas.service.js` | cambia | P1, P2 | `getCalendario` pasa las ediciones; `getVistaPrevia(tiendaId, fecha, hora)` usa la hora si viene (R3.11). |
| `modules/plataforma/avisos.js` | **nuevo** (se mueve) | P2 | `avisarPlataforma()` sale de `modules/transmisiones/transmisiones.plataforma.js:29` a un módulo común; transmisiones lo reexporta. El modelo Prisma pasa a llamarse `avisos_plataforma` con `@@map("transmision_avisos_plataforma")` (sin SQL). Una sola forma de "avisar una vez a la plataforma". |
| `jobs/campanas.job.js` + `server.js` | **nuevo** / cambia | P2 | Cada 6 h, sin tienda (`runUnscoped`): por cada edición esperada sin cargar del año en curso y el siguiente, una línea en la bitácora (una vez) y, a 60 días del inicio previsto (día 1 del mes esperado), un correo a `PLATFORM_ADMIN_EMAILS` (una vez, idempotente por la clave única de `avisos_plataforma`). R2.6.4, Q10. |
| `services/email.service.js` | cambia | P2 | `sendTransmisionAlertaPlataformaEmail` se generaliza a `sendAlertaPlataformaEmail` (el nombre viejo queda como alias). |
| `modules/tenants/tiendas.store.routes.js` | cambia | P1, P2 | Pide las ediciones (`ediciones.service`) y las pasa a `disenoPublico`. Agrega `data[0].proximoCambio` (ISO o null). La entrada de la caché en memoria vive `min(60 s, proximoCambio − ahora)`. |
| `modules/tenants/tiendas.cache.js` | cambia | P1 | `setTiendasStore(key, payload, ttlMs)` acepta el TTL. |
| `utils/cache.js` | cambia | P1 | `cache(segundos, { hasta })`: si la respuesta trae un instante de cambio, `max-age = min(segundos, faltan)` y `stale-while-revalidate` solo si `faltan ≥ segundos × 1,5` (450 s), R3.9.1. Se calcula **al responder** (también cuando la respuesta sale de la caché en memoria), no al guardarla. Precedente: `ttlHastaExpirar` de `/live` (`routes/store/index.js:29`). |
| `routes/store/index.js` | cambia | P1 | `/tiendas` usa `cache(300, { hasta: body => body?.data?.[0]?.proximoCambio })`. Nueva ruta `GET /hora` (D-1), `no-store`, sin BD. |
| `modules/tenants/tiendas.admin.routes.js` | cambia | P1, P3 | `PUT /:id/diseno` llama a `validarCampanasDeTienda` si trae `campanas`; `GET /:id/diseno/vista-previa` pasa `hora`. |
| `routes/admin/index.js` | cambia | P2 | Monta `/campanas/ediciones` (solo administrador de la plataforma), junto a `/parametros`. |
| `prisma/schema.prisma` | cambia | P2 | Modelos `campana_ediciones`, `campana_ediciones_historial`; renombre de modelo `avisos_plataforma` (`@@map`). |
| `docs/sql/campanas_ediciones.sql` + `_reversa.sql` | **nuevo** | P2 | Ver "Base de datos". |
| `modules/idiomas/claves/claves-tienda.json`, `modules/idiomas/plataforma/en.json` | cambia | P1, P3 | Claves nuevas de la tienda ("Termina el {dia}…", "Terminando…", frases de uso, leyenda, "Tu estadía entra en {campana}") y su inglés (lo copia `npm run claves` de la tienda; el inglés se escribe a mano en `en.json`). |
| Tests `modules/campanas/__tests__/*` | cambia / nuevos | todas | Los CA de la spec como pruebas unitarias del calendario y el resolver (son puros: sin reloj ni BD). |

### Admin (`ecommerceMultitenant-FrontendAdmin`)

| Archivo | Tipo | Pieza | Por qué |
|---|---|---|---|
| `src/app/shared/campo-hora/campo-hora.component.ts` | **nuevo** | P1 | Control "Todo el día \| A las [HH:mm]" (decisión A), 44 px, radios con `aria-label`, etiqueta "hora de Lima". Variante "Según la plataforma" (Cyber Wow). Lo usan Campañas y Fechas por año. |
| `src/app/models/campana.model.ts` | cambia | P1, P2, P3 | `horaInicio`, `horaFin`, `uso`; `ReglaFecha` con `porAnio`; `EntradaCalendario` con `ventanas[]`, `porAnunciar[]`; modelo de edición. |
| `src/app/pages/campanas/campanas.component.{ts,html}` | cambia | P1, P2, P3 | Horas en los dos paneles; rango con hora y chips (Empieza hoy a las…, Terminó, Por anunciar); una barra por edición; panel de Cyber Wow en solo lectura (decisión I) con enlace a plataforma si corresponde; recuadro "Fechas de uso" (decisión B) solo con `tenantService.tieneReservas()`; orden Cuándo → Uso → Efecto (decisión G). **Tiene cambios sin commit hoy** (ver riesgos). |
| `src/app/pages/diseno/campana-edicion.ts` | cambia | P1, P3 | `validarCampana()` replica las reglas nuevas del backend (horas, 90 días por días tocados, uso). `vistaPreviaDe()` manda un momento **dentro** de la ventana (R7.5): día clave a mediodía, o inicio + 1 h si ese mediodía queda fuera. |
| `src/app/services/tienda-diseno.service.ts` | cambia | P1 | Vista previa con `hora`. |
| `src/app/pages/campanas-plataforma/*` + `app.routes.ts` | **nuevo** | P2 | Pantalla "Fechas por año" (`/campanas-plataforma`, sin menú, decisión H): año, edición por fila con formulario en su sitio, historial, diálogo solo al cambiar una cargada (con el número de tiendas, R7.7), banner de faltantes. Permiso: `idiomasService.esAdminPlataforma()` (ya existe). |
| `src/app/services/campanas-plataforma.service.ts` | **nuevo** | P2 | HTTP de las ediciones. |
| `src/app/negocio/perfil-negocio.ts` + `negocio/<rubro>/perfil.ts` (5) + `perfiles.spec.ts` | cambia | P3 | `PerfilReservas.campanas: { campo: string }` ("Estadías", "Salidas", "Funciones", "Eventos", "Partidos"); productos no tiene `reservas`. |
| `src/app/negocio/frase-uso.ts` (+ spec espejo) | **nuevo** | P3 | Arma "Así lo verá tu cliente…" con **las mismas plantillas** que la tienda; un test con los mismos casos que el de la tienda las ata (como `calendario.core.spec.ts`). |
| `src/app/shared/calendario/calendario.core.ts` (+ `.spec.ts`) | cambia | P3 | Es **copia idéntica** del núcleo de la tienda: recibe el campo `campana` y la opción `marca` aunque el Admin no los use. |

### Tienda (`ecommerceMultitenant-FrontendStore`)

| Archivo | Tipo | Pieza | Por qué |
|---|---|---|---|
| `src/app/core/services/reloj-tienda.service.ts` | **nuevo** | P1 | Reloj del servidor (D-1): pide `/store/hora` solo si hay campaña o `proximoCambio`, guarda el desfase y da `ahora()`. Programa **un** temporizador a `proximoCambio + desfase aleatorio 0-10 s` con `NgZone.runOutsideAngular` (como `offer-section.component.ts:71`), se reprograma con cada respuesta; al dispararse pide la tienda con `storeService.getStoreBySlug` (mismo camino que `onRegainFocus`, `store-layout.component.ts:180`), la pone en `StoreState` y en la caché de TanStack (`QueryKeys.store(slug)`). Si falla, reintenta con espera creciente. Un temporizador largo se recorta a 24 h (límite de `setTimeout`) y se recalcula. |
| `src/app/core/theme/campanas.ts` | cambia | P1, P2 | `desdeApi(c, ahora)` recibe la hora del servidor. Simulador: `porAnio` → null; se copia Cyber Monday (D-3). |
| `src/app/state/diseno.state.ts` | cambia | P1, P3 | La campaña se evalúa con el reloj del servidor. **Retención de hasta 15 s** al llegar al fin con la pestaña abierta (R7.4): la campaña se mantiene hasta que llega la respuesta nueva o pasan 15 s; al cargar la página sigue el descarte inmediato. Expone `usoCampana()` (la marca, o null). Se borra el comentario "nunca con un timer" (`diseno.state.ts:70`). |
| `src/app/features/store/store-layout/store-layout.component.ts` | cambia | P1 | Inicia el reloj; fundido de 300 ms en el cambio en caliente (transición de las variables de color; directo con `prefers-reduced-motion`); compensa el scroll si un bloque cambia arriba de lo visible (Safari no ancla solo). |
| `src/app/shared/components/efecto-festivo/efecto-festivo.component.ts` | cambia | P1 | No se dispara en un cambio en caliente (R7.6): solo con la primera campaña de la carga. |
| `src/app/features/home/sections/offer-section.component.ts` | cambia | P1, P3 | Cuenta con la hora del servidor; en cero dice "Terminando…" en vez de desaparecer; pie "Termina el {día} a medianoche / a las HH:mm" (CA-3.17). P3: la línea de uso ("Reserva hasta… · para alojarte hasta…") va dentro del bloque y entonces el fin se escribe **una sola vez** (decisión D); banda delgada de respaldo si la campaña no trae cuenta regresiva. |
| `src/app/models/diseno.model.ts`, `tienda.model.ts` | cambia | P1, P3 | `CampanaResuelta.uso?`, `Tienda.proximoCambio?` (opcionales: backend anterior). |
| `src/app/core/theme/uso-campana.ts` | **nuevo** | P3 | Puro: `marcaDeUso(uso)` → `(fecha) => boolean` o null; `estadiaEntra(uso, entrada, salida)` (todas las noches dentro, R1.8). |
| `src/app/negocio/perfil-negocio.ts` + `negocio/<rubro>/vitrina.ts` (5) + `perfiles.spec.ts` | cambia | P3 | `PerfilReserva.campana: { reservaHasta, usoHasta, usoRango, leyenda, entra: string \| null }` con `clave()`. `entra` solo en hotel (la reserva abarca varias noches); el componente pregunta si existe, no por el rubro. |
| `src/app/features/reservas/compartido/calendario.core.ts` (+ spec) | cambia | P3 | `DiaCalendario.campana?: boolean`; `OpcionesMes.marca?` aplicada al final de `semanasMes` (D-2). |
| `.../compartido/grilla-mes.component.ts` | cambia | P3 | Rombo arriba a la izquierda (`aria-hidden`), blanco sobre el extremo elegido; la etiqueta de la celda suma "fechas de {campaña}". |
| `.../compartido/calendario-mes.component.ts`, `calendario-rango.component.ts` | cambia | P3 | Input `marca`; leyenda "Fechas de {campaña}" solo si el mes visible tiene marcas (`LeyendaCalendario.campana`). |
| `.../hotel/buscador-hotel.component.ts`, `hotel/habitacion-page.component.*` | cambia | P3 | Pasan la marca; pie "Tu estadía entra en {campaña}" con `perfil.reserva.campana.entra` y `estadiaEntra`. |
| `.../tours/tour-page.component.*`, `.../locales/salon-page.component.*` | cambia | P3 | Pasan la marca. |
| `.../canchas/reservador.component.ts` | cambia | P3 | Rombo en la tira de días (`reservador.component.ts:50`) y leyenda bajo la tira. |
| `.../eventos/evento-page.component.html`, `eventos-grid.component.ts` (agenda) | cambia | P3 | Etiqueta "◆ Fechas de {campaña}" en funciones disponibles dentro del uso. |
| `src/app/core/i18n/claves-tienda.json` (generado) | cambia | P1, P3 | `npm run claves` (también copia al backend). |

## Contrato por rubro

- **Capacidad nueva: ninguna.** La ventana de uso usa la capacidad que ya existe: backend `recibeReservas` (`modules/negocio/<rubro>/datos.js`, en `CAPACIDADES` de `contrato.js:40`); Admin `tenantService.tieneReservas()` (`perfil().reservas !== null`); tienda `perfil.reserva !== null`. Confirmo lo que pedía la spec ("el arquitecto confirma si hace falta una propia"): **no hace falta**. Los cinco rubros con reserva la tienen y no hay un rubro con reserva que no deba tener ventana de uso.
- **Textos por rubro en el perfil** (R1.9), en dos repos:
  - Tienda: `PerfilReserva.campana` (cinco rubros). `entra` es `null` salvo en hotel.
  - Admin: `PerfilReservas.campanas.campo`.
  - Backend: **nada**. El backend no escribe frases; solo valida y resuelve fechas.
- **Tests de contrato que cambian, a propósito:** `perfiles.spec.ts` de la tienda (fija `campana` de cada rubro y `entra` solo en hotel) y del Admin (fija `campanas.campo`). `uis.spec.ts` **no cambia**: no hay pieza de slot nueva (`PiezasUi` igual, diseño pantalla 7).
- **Identidad:** ninguna comparación por rubro. `scripts/anti-identidad.mjs` (tienda y Admin) y `modules/negocio/__tests__/anti-identidad.test.js` (backend) lo vigilan; CA-1.12.
- **SSR:** la línea de uso y las marcas dependen del rubro, pero la campaña ya solo existe en el navegador (`storeResolver` devuelve `{}` en el servidor, `store-resolver.guard.ts:32`): las secciones de `conCampana` y los selectores de fecha no se dibujan en el servidor. No hacen falta slots nuevos.
- **Rubros afectados de rebote (regresión posible):** productos (cuenta regresiva y caché de `/store/tiendas` cambian para todos); los cinco de reserva (calendarios compartidos). La copia del núcleo del calendario en el Admin cambia sin uso visible.

## Patrones

| Patrón | Dónde se aplica | Por qué aplica (o por qué no hace falta) |
|---|---|---|
| **Registry + contrato** (existente) | Catálogo de presets (`presets.js`), perfiles de la tienda y del Admin | Cyber Wow y Cyber Monday son dos entradas más del catálogo; los textos de uso son campos del perfil que, si faltan, no compilan. |
| **Strategy de reglas de fecha** (existente, se extiende) | `ventanas()` en `calendario.js`: `fija`, `nEsimoDia`, **`porAnio`** | Ya hay una regla por tipo; "por año" es otra variante real. Devolver una **lista** de ventanas es lo que hace falta para varias ediciones (y es lo que luego usa la repetición semanal, R4). |
| **Strategy del calendario + paso común** (existente, D-2) | `semanasMes()` con `marca` | Cada pantalla dice cómo es su día; la regla "la marca solo va sobre lo elegible" va una vez en el núcleo. |
| **Capacidades, no identidad** | `recibeReservas`, `perfil.reserva.campana`, `campana.entra` | La ventana de uso es de "recibe reservas"; "Tu estadía entra" es de "la reserva abarca varias noches", no del hotel. |
| **Repository → Service → Controller** | Ediciones de la plataforma | Endpoint nuevo con tabla nueva. |
| **Seguro por defecto** | RLS en las dos tablas nuevas, `requirePlatformAdmin` | Tabla nueva = RLS desde el SQL. No van en `ALCANCE`: no tienen `tienda_id` (el test de `kernel/tenant/__tests__/alcance.test.js` solo mira modelos con `tiendaId`), igual que `parametros_plataforma` y `plantillas_diseno`. |
| **Idempotencia** | Aviso de fechas faltantes | Un correo por edición y año, aunque haya réplicas o reinicios (clave única de `avisos_plataforma`). |
| **Fitness function** | Test espejo de las frases (Admin ↔ tienda) y del núcleo del calendario (ya existe) | Dos copias que se romperían en silencio. |
| **Parámetro de plataforma** — **no aplica** | Ediciones del Cyber Wow | Decisión H del diseño: no son un valor suelto; tienen año, tramos, validaciones cruzadas e historial. Va en tabla propia, con el precedente de `plantillas_diseno` (dato de plataforma en BD). |
| **Adapter** — **no aplica** | Fuente de fechas del IAB | R2.8: no se consulta ninguna fuente externa. |
| **Contexto ambiental (sede)** — **no aplica todavía** | Resolución de la campaña | Ver "Multi-sede": se deja el filtro de las campañas aplicables en una función con nombre, sin agregar campos por si acaso. |

**Ningún patrón nuevo para el catálogo.** El único movimiento es generalizar `avisarPlataforma` (hoy dentro de transmisiones) para no crear una segunda forma de lo mismo.

## Modelo de datos (decisión)

| Dato | Dónde | Por qué |
|---|---|---|
| Horas de la campaña (`horaInicio`, `horaFin`) | **En el JSON de la campaña**, en `tienda_configuraciones` (clave `campanas`, categoría `diseno`), como hoy las fechas. Campos opcionales: sin ellos, día completo. | R3.5: no hay que migrar nada; una campaña guardada sin hora se resuelve **idéntica** (los tests de hoy siguen pasando sin cambios). Las fechas siguen siendo `"YYYY-MM-DD"` y la hora va aparte (`"HH:mm"`); así un Admin o un backend anterior que no conoce la hora lee la fecha bien. |
| Ventana de uso (`uso`) | **En el JSON de la campaña**. Propia: fechas absolutas; catálogo: días relativos (R1.4). | Es configuración de la campaña de la tienda; se guarda con un Guardar por campaña (R6.1) en el mismo `PUT /admin/tiendas/:id/diseno`. |
| Ediciones "por año" | **Tabla nueva `campana_ediciones`** + **`campana_ediciones_historial`** (de la plataforma, sin `tienda_id`). Fecha y hora por separado (`DATE` + `TIME` nulo), igual que en la campaña. | Las escribe solo el administrador de la plataforma, sin publicar versión (R2.4). Historial con valor anterior y nuevo (R2.7). Fecha y hora separadas para distinguir "todo el día" de una hora, y para que la hora de la tienda reemplace solo la hora (R7.2). |
| Qué ediciones se esperan | **En el código** (`presets.js`, `edicionesEsperadas`) | R7.1. Cambia solo si el IAB agrega una edición: es un cambio de catálogo, como un preset nuevo. |

**Por qué no se pasa ya la lista de campañas a una tabla propia.** Ventaja: consultar entre tiendas (contar quién tiene el Cyber Wow activo) y, en la Fase 2, ligar una campaña a un descuento con integridad referencial. Contra: migrar el JSON de todas las tiendas, cambiar el guardado del Admin y la vista previa del editor, sin que la Fase 1 lo necesite. El conteo de R7.7 se resuelve con una consulta de contención JSONB (abajo). **Queda anotado como decisión de la Fase 2** (R5): las campañas ya tienen `id` UUID, así que el paso a tabla es posible sin perder referencias.

## Base de datos

### SQL nuevo: `docs/sql/campanas_ediciones.sql` (pieza P2)

Correr **una vez**, en el SQL Editor de Supabase, **antes** del deploy del backend de P2. Después: `npx prisma generate`. Idempotente y en transacción.

```sql
-- ============================================================================
-- CAMPAÑAS: FECHAS POR AÑO (docs/specs/campanas-cuando, R2 · pieza P2)
-- ----------------------------------------------------------------------------
-- Ediciones de las campañas del catálogo cuya fecha no se calcula (Cyber Wow):
-- las carga el administrador de la plataforma desde el Admin ("Fechas por año").
-- Sin tienda_id: es un dato de la plataforma, igual para todas las tiendas.
-- Qué ediciones se esperan cada año vive en modules/campanas/presets.js.
-- Sin fila para un año, la campaña no se muestra ese año (R2.6.1).
-- Correr ANTES de desplegar el backend que la usa. Después: npx prisma generate.
-- Se puede correr más de una vez.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS "campana_ediciones" (
  "id"                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "preset_id"             VARCHAR(60)  NOT NULL,             -- "cyber-wow"
  "anio"                  SMALLINT     NOT NULL CHECK ("anio" BETWEEN 2020 AND 2100),
  "clave"                 VARCHAR(30)  NOT NULL,             -- "abril" (edicionesEsperadas del preset)
  "nombre"                VARCHAR(60)  NOT NULL,             -- "Abril"
  "fecha_inicio"          DATE         NOT NULL,
  "hora_inicio"           TIME,                              -- NULL = 00:00
  "fecha_fin"             DATE         NOT NULL,
  "hora_fin"              TIME,                              -- NULL = al terminar el día
  "fuente"                VARCHAR(500),                      -- enlace del anuncio (R7.8), solo https
  "fecha_registro"        TIMESTAMPTZ  DEFAULT NOW(),
  "usuario_registro"      VARCHAR(100),
  "fecha_actualizacion"   TIMESTAMPTZ,
  "usuario_actualizacion" VARCHAR(100),
  CONSTRAINT "uq_campana_ediciones" UNIQUE ("preset_id", "anio", "clave"),
  CONSTRAINT "ck_campana_ediciones_fechas" CHECK ("fecha_fin" >= "fecha_inicio")
);
-- El UNIQUE ya sirve de índice para leer por (preset_id, anio).
-- Las demás reglas (fin posterior al inicio con horas, máximo 30 días, sin cruces
-- en el año) las valida el backend: solo escribe el administrador de la plataforma.

CREATE TABLE IF NOT EXISTS "campana_ediciones_historial" (
  "id"          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "edicion_id"  UUID         REFERENCES "campana_ediciones" ("id") ON DELETE SET NULL,
  "preset_id"   VARCHAR(60)  NOT NULL,
  "anio"        SMALLINT     NOT NULL,
  "clave"       VARCHAR(30)  NOT NULL,
  "accion"      VARCHAR(10)  NOT NULL CHECK ("accion" IN ('crear', 'cambiar', 'borrar')),
  "antes"       JSONB,
  "despues"     JSONB,
  "usuario"     VARCHAR(100) NOT NULL,
  "fecha"       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_campana_ediciones_historial"
  ON "campana_ediciones_historial" ("preset_id", "anio", "clave", "fecha" DESC);

-- Solo el backend (service role): RLS activo sin políticas, como el resto
-- (docs/sql/rls_hardening.sql). La anon key no lee ni escribe.
ALTER TABLE "campana_ediciones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campana_ediciones_historial" ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Verificación: las dos tablas con RLS activo (true, true).
SELECT relname, relrowsecurity FROM pg_class
 WHERE relname IN ('campana_ediciones', 'campana_ediciones_historial');
```

### Reversa: `docs/sql/campanas_ediciones_reversa.sql`

```sql
-- Reversa de campanas_ediciones.sql. Antes de correrla, guardar las ediciones
-- cargadas (se pierden): SELECT * FROM campana_ediciones; y su historial.
-- Correr DESPUÉS de volver al backend anterior (el nuevo las lee).
BEGIN;
DROP TABLE IF EXISTS "campana_ediciones_historial";
DROP TABLE IF EXISTS "campana_ediciones";
COMMIT;
```

### Sin SQL

- **P1 y P3**: todo va en el JSON de la campaña. Las tiendas actuales no cambian (R3.5).
- **Renombre `avisos_plataforma`**: solo el nombre del modelo en Prisma (`@@map("transmision_avisos_plataforma")`); la tabla no cambia.

### Consulta entre tiendas (R7.7)

Contar las tiendas con la campaña activa necesita leer `tienda_configuraciones` de todas las tiendas, a propósito. Va en `ediciones.repository.js` dentro de `runUnscoped` (como el job de transmisiones) y devuelve **solo un número** (nunca ids ni nombres):

```sql
SELECT COUNT(*)::int AS total
  FROM tienda_configuraciones
 WHERE categoria = 'diseno' AND clave = 'campanas'
   AND valor @> jsonb_build_array(jsonb_build_object('presetId', $1::text, 'activa', true));
```

Sin índice nuevo: lo usa solo el administrador de la plataforma, al abrir el diálogo de cambio, y lee una fila por tienda.

### Datos existentes

- Campañas guardadas: sin horas ni `uso` → idénticas a hoy (CA-3.2). Tests de hoy como prueba de regresión.
- Tiendas de productos con `uso` guardado (no debería existir): el resolver lo ignora si el rubro no recibe reservas. Si una tienda cambia de rubro, igual.
- Cyber Wow y Cyber Monday aparecen **apagados** para todas las tiendas (como cualquier preset): nadie ve un cambio hasta activarlos.

## Caché y horas frontera (R3.9)

Hoy hay **cuatro** capas entre el cambio de campaña y la pantalla. Qué pasa con cada una:

| Capa | Hoy | Cambio |
|---|---|---|
| HTTP (navegador y, si existe, el borde de Railway) | `cache(300)` → `max-age=300, swr=150` (`utils/cache.js:11`, `routes/store/index.js:44`) | `max-age = min(300, segundos al proximoCambio)`; `swr=150` solo si faltan ≥ 450 s. Se calcula al responder. CA-3.13. |
| Memoria del backend: respuesta resuelta de `/store/tiendas` | `tiendas.cache.js`, 60 s **fijos**, con la campaña ya resuelta dentro | TTL `min(60 s, proximoCambio − ahora)`: nunca sirve una campaña pasada su frontera. |
| Memoria del backend: tienda por slug (`resolve-tienda.middleware.js:7`, 60 s) | Guarda solo `id, slug, nombre, activo, whatsappNumero, tipoNegocio` | **Ninguno**: no tiene campañas. **Ojo:** `invalidateTiendaCache(slug)` (`resolve-tienda.middleware.js:154`) no limpia la respuesta con la campaña, y hoy **nadie la llama** (solo se exporta en `kernel/tenant/index.js:41`). Para que un cambio de edición llegue a todas las tiendas hay que llamar a **`invalidateTiendasStoreCache()`** (`tiendas.cache.js:42`, limpia la caché completa). Llamar a `invalidateTiendaCache` no sirve. |
| Tienda: TanStack (`STORE_STALE_TIME_MS` 2 min, `store-resolver.guard.ts:19`) y `StoreState` | El resolver corre una vez por carga; la pestaña abierta solo se refresca al volver el foco | El reloj (`reloj-tienda.service.ts`) refresca a la hora frontera y escribe en `StoreState` **y** en la caché de TanStack, para que una navegación posterior no vuelva a la campaña anterior. |

**Cambios manuales** (el dueño guarda, la plataforma corrige una edición): limpian la caché en memoria del backend al instante (`invalidateTiendasListCache` ya lo hace en el `PUT /diseno`; la ruta de ediciones llama a `invalidateTiendasStoreCache()`), pero la caché HTTP ya entregada tarda hasta 5 min (R3.9.4, aceptado).

**Pico a la hora frontera** (todas las pestañas abiertas a medianoche de Black Friday): desfase aleatorio de 0-10 s + caché en memoria de la primera respuesta posterior al cambio + sin `swr` cerca del cambio. Una tienda grande con 500 pestañas abiertas: ~50 peticiones por segundo durante 10 s, casi todas desde la caché en memoria.

**Zona de Angular:** el temporizador corre con `runOutsideAngular` (precedente: `app.config.ts:53`, `offer-section.component.ts:71`). El cambio de la tienda entra por un signal o `BehaviorSubject`, que agenda la detección de cambios sin dejar la app "inestable". CA-3.14 pide además comprobar que navegar después del cambio sigue haciendo scroll al inicio.

## Resolución de la campaña vigente

- **Prioridad y ventana más corta** (R3.10): `gana()` (`calendario.js:118`) ya compara `fin − inicio` en milisegundos: con horas funciona sin cambios. En "por año" se compara **cada edición** como una ventana más.
- **Hora en las del catálogo** (R3.3): la hora de inicio vale para el primer día de la ventana (fecha clave − anticipación) y la de fin para el último (fecha clave + después). En "por año": hora de la tienda si la puso (una sola pareja para todas las ediciones, R7.2); si no, la que cargó la plataforma; si no, día completo.
- **Ventana vacía** (R3.6): el schema la rechaza al guardar cuando se puede saber (regla calculable, o "por año" con 0 días antes, 0 después y hora de fin ≤ hora de inicio). Además, el resolver descarta cualquier ventana vacía (una edición de un día con horas que la vacían).
- **`proximoCambio`** (R3.9.1): el menor `inicio` o `fin` > `ahora` entre las ventanas y las ventanas de efecto de las campañas **activas** de la tienda. Puede incluir fronteras que no cambian lo que se ve (una campaña de menor prioridad que empieza debajo de otra): cuesta una recarga de más, y a cambio la regla es simple y no se equivoca.
- **Ediciones en la resolución:** se leen las de `[año − 1, año + 1]` (tabla de pocas filas), con caché en memoria de 60 s que se limpia al escribir. Si la tabla no responde, se resuelve sin "por año" y se escribe en la bitácora: nunca se cae la tienda por el Cyber Wow (mismo criterio que `parametro()`).

## Configuración

| Llave | Repo / plataforma | Nueva / cambia / se quita | Valor de ejemplo / cómo generarla |
|---|---|---|---|
| — | — | **Ninguna llave nueva, cambiada ni quitada** | — |
| `PLATFORM_ADMIN_EMAILS` | Backend (Railway) | **Sin cambio**, ahora también la usa el aviso de fechas faltantes (P2) | Ya existe. Si está vacía, el aviso solo queda en la bitácora. |

Ningún parámetro de plataforma nuevo: el tope de 300 s de caché, el desfase de 10 s, la retención de 15 s y los 60 días del aviso son reglas de la spec, no valores que se ajusten sin deploy. Si algún día se quiere ajustar el aviso, ese sería el candidato a parámetro.

## Seguridad

- **Plataforma:** todas las rutas de ediciones con `authMiddleware` + `requirePlatformAdmin` (403 a cualquier otro, CA-2.7). La pantalla del Admin pregunta por el permiso, pero quien decide es el backend.
- **Multi-tenant:** una edición afecta a **todas** las tiendas con la campaña activa (riesgo abajo). La consulta entre tiendas devuelve solo un número. Ninguna ruta pública acepta una edición ni una fecha simulada (CA-3.10: `/store/tiendas` sigue sin parámetros de fecha; `/store/hora` no recibe nada).
- **`fuente`** (R7.8): solo `https://`, máximo 500; el Admin la pinta como enlace con `rel="noopener noreferrer"`; nunca `javascript:`.
- **Validación de entrada:** horas con expresión cerrada `HH:mm`, días 0-365, fechas reales (`parsearFecha`). El rubro sale de la BD (`tiendaDe`), nunca del cliente.
- **Textos:** las frases de uso las arma la tienda desde el perfil; el único dato del dueño que entra en ellas es el nombre de la campaña, que Angular escapa (sin `innerHTML`).
- **Sin lenguaje de descuento** en textos nuevos (R1.5.4, R6.5): lo revisa el QA.
- **`/store/hora`:** sin BD ni datos; queda bajo el limitador global de la API.

## Rendimiento

- Resolución pura en memoria; las ediciones salen de una caché de 60 s (una consulta por minuto como máximo).
- `proximoCambio`: recorre las campañas activas (máximo 30, `MAX_CAMPANAS`) por 3 años: insignificante.
- La tienda agrega `GET /store/hora` (sin BD) solo en tiendas con campaña, y un temporizador por pestaña.
- Calendarios: la marca es una comparación de texto por celda. Sin consultas nuevas.

## Compatibilidad hacia atrás (R6.4)

| Combinación | Qué pasa |
|---|---|
| Backend nuevo + tienda anterior (pestaña abierta o caché del navegador) | Los campos nuevos (`proximoCambio`, `uso`) son opcionales y se ignoran. `inicio`/`fin` siguen siendo ISO con `-05:00`; con hora, la tienda anterior los lee bien (`desdeApi` usa `new Date(iso)`). Lo que no tiene: el cambio en caliente y el reloj del servidor. |
| Backend nuevo + Admin anterior | El Admin guarda la lista **entera**; `limpiarCampana` hace `{ ...c }` (`campana-edicion.ts:126`), así que conserva las horas y el `uso` que ya traía. Una fila "por año" sin fechas trae `inicio: null`: la barra no se dibuja (detalle visual, por minutos, hasta desplegar el Admin). |
| Backend anterior + Admin nuevo | No pasa: el backend se despliega primero. Si pasara, Zod **descartaría** las horas en silencio; por eso el orden es estricto. |
| Datos guardados | Sin migración (R3.5). |

## Multi-sede: ¿antes, después o no afecta? (pregunta de Diego)

**Recomendación: terminar primero la Fase 1 de campañas (P1 → P2 → P3) y empezar multi-sede después.** No conviene hacerlas en paralelo. Y en esta fase no se agrega nada "por sede", salvo un punto de extensión que no cuesta nada.

### Dónde se tocan las dos specs

| Tema | Campañas, Fase 1 | Multi-sede | ¿Choca? |
|---|---|---|---|
| Datos | Campañas en el JSON de diseño (`tienda_configuraciones`, `ALCANCE: tienda`); ediciones en una tabla de la plataforma, sin `tienda_id` | Pieza 1: `sedes`, `razones_sociales`, `config_sede`, `sede_id`, `ALCANCE` con `sede`/`presencia` | **No.** Las campañas son de la marca (S3: el diseño es de la tienda) y las ediciones no son de ninguna tienda. |
| `/store/tiendas` y su caché | P1 cambia la caché (`max-age` dinámico, TTL en memoria) y agrega `proximoCambio` | Pieza 4: la lista de sedes "llega con la tienda" (S15.9) y `?sede=` va en la URL de los endpoints de reserva (S15.5) | **Mismo archivo** (`tiendas.store.routes.js`), sin conflicto de fondo: la caché nueva depende de la respuesta y de la URL, así que una `?sede=` futura queda separada sola. Hacer P1 primero deja la caché resuelta antes de que multi-sede la toque. |
| Selectores de fecha y disponibilidad | P3 solo **marca** fechas que ya se pueden elegir; no toca disponibilidad, cupo ni precio (R1.5.3) | Piezas 4-6: la disponibilidad se pide por sede; canchas estrena una grilla de todas las sedes (S7.8) | **No en la lógica.** Sí en los mismos componentes (calendario del hotel, tira de canchas). La marca vive en el núcleo (D-2), así que una grilla nueva la reutiliza con una línea. |
| Perfiles | `perfil.reserva.campana` (tienda), `perfil.reservas.campanas` (Admin) | Capacidad `sedes` en los perfiles (S6.1) | Mismos archivos y `perfiles.spec.ts`; campos distintos. Choque solo si se trabaja en paralelo. |
| Ventana de uso y la sede | El uso es por campaña de la marca | El hotel elige sede al entrar | No: una sede no cambia lo que la marca anuncia. |

### Por qué este orden

1. **Fechas comerciales.** Hoy es 19 de octubre. Black Friday 2026 es el 27 de noviembre y Cyber Monday el 30. Las horas exactas (P1) y Cyber Monday (P2) tienen valor este año solo si llegan a producción antes de mediados de noviembre. Multi-sede no tiene una fecha así.
2. **Multi-sede no puede empezar mañana.** Su pieza 1 exige cerrar antes el trabajo abierto de reservas, con sus SQL y pruebas, y los tres repos limpios (S17.1, `multi-sede/tasks.md` "Antes de la pieza 1"). Eso toma tiempo igual.
3. **Riesgo de despliegue.** La pieza 1 de multi-sede es una migración grande (sede principal, `sede_id NOT NULL`, auto-scope por sede). Mezclarla con los despliegues de campañas, que tocan la portada de **todas** las tiendas, junta dos cambios de riesgo en la misma ventana. Uno a la vez (regla 3 del proceso).
4. **Poco retrabajo en cualquier orden, pero menos así.** Campañas no depende de nada de multi-sede. Multi-sede pieza 4 se apoya en una `/store/tiendas` cuya caché ya quedó resuelta, y en un núcleo de calendario con la marca ya puesta.

### Qué se deja preparado para la "campaña por sede" (futuro)

- **Sí, gratis:** el filtro de las campañas que aplican pasa a una función con nombre, `campanasAplicables(campanas, contexto)` (`resolver.js`). Hoy el contexto solo lleva el rubro (para ignorar `uso`). Cuando exista la campaña por sede, la campaña tendrá **presencia** (`todas | solo | excepto` + sedes, el mismo patrón I5 de multi-sede, con `todas` por defecto = compatible) y ese filtro usará `enSede()`. Es el único lugar que cambia.
- **No:** ningún campo `sedes` en la campaña ni `?sede=` en `/store/tiendas` ahora. No hay variación real todavía, y con `presencia` el formato futuro es compatible con lo guardado (sin campo = todas).
- **Decisión que queda para esa spec:** dónde se resuelve una campaña por sede. El hotel elige la sede **después** de cargar la tienda, así que hará falta `?sede=` en `/store/tiendas` (otra entrada de caché por sede) o un endpoint aparte de campaña. La caché por URL de P1 sirve para las dos opciones.

## Lo que esta fase deja decidido para la Fase 2

- **R4 (repetición semanal):** depende de que `ventanas()` devuelva una **lista** (P1/P2). Cada franja del día es una ventana más: la "ventana más corta medida por la franja de hoy" (R4.5) y las fronteras de la franja en `proximoCambio` (R4.8) salen solas. Con una sola ventana por año no se podría.
- **R5 (descuento):** depende de que la resolución sea **pura y con las ediciones inyectadas** (`vigente(campanas, ahora, ediciones)`): el cotizador del servidor podrá preguntar "¿esta campaña está vigente ahora?" con la misma función que la portada, sin la caché. El `uso` guardado como fechas es el que usará R5.3. **Queda abierto para R5:** pasar las campañas del JSON a una tabla (ver "Modelo de datos").
- **D-1 no condiciona R5:** el descuento lo decide el servidor con su reloj, nunca la tienda.

## Alternativas consideradas

| Opción | A favor | En contra | Elegida |
|---|---|---|---|
| Horas dentro de `inicio`/`fin` como ISO con hora | Un solo campo | Rompe R3.5 (formato guardado), y el Admin y backend anteriores leerían mal la fecha | No |
| Horas en campos aparte (`horaInicio`, `horaFin`) | Compatible; "sin hora = día completo" es literal | Dos campos más por campaña | **Sí** |
| Ediciones como parámetro de plataforma | Sin tabla nueva | Sin año ni tramos ni validaciones cruzadas ni historial (decisión H) | No |
| Ediciones como una fila por (preset, año) con un JSON | Una fila | Historial por edición difícil; sin `UNIQUE` por edición | No |
| Ediciones como una fila por edición + historial | Integridad en la BD, historial por edición | Dos tablas | **Sí** |
| `ahora` en `/store/tiendas` (literal de R3.9.3) | Sin petición extra | Viene viejo de la caché: hasta 5 min de error (D-1) | No, si Diego aprueba D-1 |
| Quitar la caché HTTP de `/store/tiendas` (`no-cache`) | Hora y campaña siempre frescas | Una petición a Railway en cada carga; contradice el propósito de la caché | No |
| Temporizador por segundo que reevalúa todo | Simple | Trabajo constante en todas las pestañas; no evita la caché | No |
| Un temporizador al `proximoCambio` | Una sola tarea por pestaña; exacto | Hay que reprogramarlo con cada respuesta | **Sí** |
| Marca en cada estrategia de rubro (texto del diseño) | Cada rubro decide | Regla repetida; en el hotel no se puede cumplir | No (D-2) |
| Enseñar "por año" al simulador de la tienda | Simulador completo | Pedir ediciones a la API pública solo para desarrollo | No (D-3) |
| Tabla nueva `avisos_plataforma` | Nombre correcto | Segunda forma de lo mismo | No |
| Generalizar el modelo existente con `@@map` | Una sola forma, sin SQL | La tabla física conserva el nombre viejo | **Sí** |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| **Una edición mal cargada afecta a todas las tiendas** que activaron el Cyber Wow (multi-tenant) | Media | Solo el administrador de la plataforma; validaciones (30 días, sin cruces); diálogo con el número de tiendas al cambiar una cargada (R7.7); historial con antes y después; `fuente` para revisar de dónde salió. Se corrige y llega en ≤ 5 min. |
| **Trabajo sin commit en los mismos archivos**: Admin `pages/campanas/campanas.component.{ts,html}` (cambios de campanas-widgets, "el cuándo vs el cómo"); backend `modules/idiomas/…` y la tienda con checkout sin commit | Alta | **Antes de P1:** commit de lo pendiente de campanas-widgets en el Admin y de lo que toque `idiomas` en el backend. Tarea 0 de `tasks.md`. |
| **Cambio en caliente rompe el scroll del router o deja la app inestable** (problema conocido) | Media | Temporizador fuera de la zona; un solo temporizador; CA-3.14 incluye navegar después del cambio; prueba en el navegador con hora simulada. |
| **El pico de medianoche** encuentra a Railway dormido | Baja | Desfase de 0-10 s; reintento; la tienda mantiene la vista hasta 15 s y luego pasa al diseño normal (R7.4). La hora de la campaña no cambia, solo cuánto tarda en verse. |
| **El borde de Railway cachea o no** (`multi-sede` S15.5 dice que sí; no se pudo verificar desde el código) | — | El `max-age` dinámico es correcto en los dos casos. El deployer lo verifica mirando las cabeceras `Age`/`cf-cache-status` en producción. |
| **Dos copias que se desalinean** (núcleo del calendario, frases de uso, catálogo del simulador) | Media | Tests espejo en los dos fronts; el simulador omite "por año" (D-3). |
| **Prometer una oferta que no existe** | Media | Ningún texto nuevo dice "oferta" ni "descuento"; nota fija en el panel. Revisión en QA. |
| **Validaciones distintas en Admin y backend** (90 días por días tocados, horas) | Baja | Mismos casos de prueba en `campana-edicion` y en `campanas.schema.test.js`. |

## Orden de despliegue y reversa

Cada pieza se despliega sola: **backend → Admin → tienda**.

| Pieza | SQL | Orden | Reversa |
|---|---|---|---|
| P1 | Ninguno | Backend → Admin → tienda | Volver al commit anterior de cada repo. Campañas guardadas **con** hora quedan como días completos con el backend anterior: Zod no rechaza las claves extra, las descarta al próximo guardado. |
| P2 | `campanas_ediciones.sql` **antes** del backend | SQL → backend → Admin (la tienda solo cambia el simulador) | Volver al backend anterior; después, `campanas_ediciones_reversa.sql` (guardar antes las ediciones cargadas). Las tiendas con Cyber Wow activo lo pierden (el preset no existe → `efectiva()` devuelve null, `resolver.js:165`): sin errores. |
| P3 | Ninguno | Backend → Admin → tienda | Volver a los commits anteriores. El `uso` guardado se ignora. |

## Deuda que conviene cerrar (fuera de esta fase)

- **Borrar el simulador de diseño de la tienda** (`plantilla-switcher`, `core/theme/campanas.ts`, los modos de `DisenoState`): está apagado y su copia del catálogo es un riesgo permanente. La vista previa del Admin con hora lo reemplaza. Decisión de Diego; una pieza chica aparte.
- `invalidateTiendaCache(slug)` no tiene quien la llame: un cambio de slug tarda 60 s. No es de esta spec.
- Los comunicados también tienen ventana horaria y hoy pueden llegar hasta 7,5 min tarde. Con `proximoCambio` ya armado, sumarlos es una línea; queda para cuando se pida.
