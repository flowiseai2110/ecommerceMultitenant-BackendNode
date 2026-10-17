# Mejoras de la transmisión con Cloudflare (2026-10-15)

> Parte de [spec.md](spec.md) y [plan.md](plan.md). Sale de revisar el código ya implementado (Fases 0–5) contra la documentación vigente de Cloudflare Stream y de Mux.
> Estado: **Fase A implementada (2026-10-15)**, junto con `timeoutSeconds: 0`, `allowedOrigins` (B5) y el resumen con IA a pedido. Falta: B1–B4, C y las pruebas de D. Ver [Implementado](#implementado-2026-10-15) y [Decisiones](#decisiones-2026-10-15).
> Repos: BackendNode, FrontendAdmin, FrontendStore y App Transmitir.

## Resumen

La arquitectura se mantiene: proveedor detrás de `StreamingProvider`, job que reconcilia el estado deseado con el real, webhooks idempotentes y reglas puras en `transmisiones.reglas.js`. HLS sigue siendo lo correcto: WebRTC de Cloudflare pasa a GA hoy, pero sigue sin reproducir lo que entra por RTMPS/SRT, no graba, no retransmite y no cuenta espectadores.

Lo que falta cubrir, ordenado por riesgo:

| # | Hallazgo | Riesgo | Fase |
|---|---|---|---|
| 1 | Nada vigila la **cuota de almacenamiento** prepagada. Si se llena, Cloudflare rechaza **todos** los lives nuevos (`ERR_STORAGE_QUOTA_EXHAUSTED`), de todas las tiendas | Un evento no puede empezar | A |
| 2 | `live_input.errored` se reduce a "desconectada" ([cloudflare.provider.js:240](../../../services/streaming/cloudflare.provider.js#L240)) y se pierde el código (`ERR_GOP_OUT_OF_RANGE`, códec) | Quien graba ve "Esperando señal" sin saber qué corregir | A |
| 3 | La API de Cloudflare permite 1,200 llamadas cada 5 min. Al pasarse, **bloquea 5 min todo**, incluido el corte. `api()` no maneja el 429 y el ciclo es secuencial | Corte atrasado y costo de más con muchos eventos a la vez | A |
| 4 | `deleteRecordingAfterDays` no se usa (va en el primer nivel de la entrada, no en `recording`; por eso falló en la Fase 0) | Si el job falla, la grabación nunca se borra (Ley 29733 y cuota) | B |
| 5 | El costo real (R10.3) se estima con el latido (0.5 min por latido). Cloudflare da los minutos reales (GraphQL) y los espectadores reales (`/views`) | Margen mal medido; un iframe filtrado no se detecta | B |
| 6 | `allowedOrigins` no se usa: el iframe firmado se puede incrustar fuera de la tienda | Bajo (eventos familiares) | B |
| 7 | Todo el código usa el proveedor global (`STREAMING_DRIVER`, 37 llamadas), no el de cada transmisión (`t.proveedor`) | Cambiar de proveedor rompe las transmisiones y grabaciones ya creadas | C |
| 8 | La interfaz tiene 17 métodos sin test de contrato | Un proveedor nuevo falla en producción, no en un test | C |
| 9 | La copia a R2 no reserva la fila en la BD (el resumen sí) ([transmisiones.grabaciones.js:65](../../../modules/transmisiones/transmisiones.grabaciones.js#L65)) | Con dos réplicas con jobs, se copian dos veces ~7 GB | C |
| 10 | LL-HLS se probó con Larix, probablemente con B-frames (LL-HLS exige GOP de 2–4 s y sin B-frames); SRT sin probar; la entrada exige 2–14 Mbps | Latencia y cortes en 4G | D |

## Fase A: lo que puede cortar un evento

### A1. Cuota de almacenamiento

- **Proveedor:** `usoAlmacenamiento()` → `{ usadoMin, limiteMin }` (`GET /stream/storage-usage`).
- **Job:** cada 10 min lo consulta. Si el uso pasa el **80 %**, avisa a la plataforma por correo, una vez por día.
- **Solo se avisa, no se bloquea** la activación (decisión 2026-10-15).
- **Webhook:** `ERR_STORAGE_QUOTA_EXHAUSTED` (y `ERR_MISSING_SUBSCRIPTION`) disparan un aviso inmediato, uno por hora.
- Cada aviso sale una sola vez aunque corran varias réplicas: tabla `transmision_avisos_plataforma` con clave única.

### A2. Errores del live, visibles en español

- **Proveedor:** `verificarWebhook` devuelve también `error: { codigo, mensaje } | null` cuando el evento es `errored`.
- **BD** ([docs/sql/transmisiones_mejoras.sql](../../sql/transmisiones_mejoras.sql)): `evento_transmisiones.senal_error` (`VarChar(40)`) y `senal_error_en`. No se borran al conectar: el error deja de mostrarse cuando la señal se conecta **después** del error (`errorSenalVigente`). Así, una app mal configurada que se conecta y falla en cada intento no genera un correo por intento.
- **Reglas:** `MENSAJES_ERROR_SENAL`, de código a texto claro. Por ejemplo, `ERR_GOP_OUT_OF_RANGE` → *"La app de transmisión tiene mal el intervalo de fotogramas clave (keyframe). Ponlo en 2 segundos…"*, y códec → *"…elige H.264"*. Un código desconocido usa un texto genérico.
- **Correo** al negocio y al **contacto de la transmisión** que ya existe (decisión 2026-10-15). El mismo código se vuelve a avisar solo tras 30 min sin repetirse.
- **Admin** (panel en vivo) y **App Transmitir** (`vincular`, `estado`, `prueba`, `terminar`): campo `senalError: { codigo, mensaje, en }`.

### A3. Límite de la API

- **`api()`:** ante un 429, lee el encabezado `Ratelimit` y deja una **pausa global** hasta que se reinicie la ventana. Durante la pausa, las llamadas que no son de corte se saltan en ese ciclo.
- **Orden del ciclo:** primero los cortes (`ahora >= corteEn`), luego las extensiones automáticas y los avisos, y al final la habilitación y la reconciliación.
- **Menos sondeo:** la señal se consulta por API solo si no llegó un webhook de esa entrada en los últimos 3 min. El webhook sigue siendo el aviso y la API la verdad.
- **Concurrencia:** hasta 4 transmisiones a la vez, en lugar de una tras otra (para que un timeout de 10 s no retrase a las demás).
- **Log:** las llamadas por ciclo, para ver qué tan cerca se está del límite.

## Fase B: red de seguridad y costos

### B1. Borrado de respaldo en Cloudflare

- `crearEntrada` envía `deleteRecordingAfterDays` en el **primer nivel**: plazo en línea + 7 días (Privado 37, Premium 97). El job sigue borrando a tiempo; esto solo cubre el caso de que el job falle.
- Con "Guardar 1 año", la copia a R2 se hace apenas el MP4 está listo, mucho antes de ese plazo.
- **Verificar** en una transmisión de prueba que el campo queda guardado y que el video recibe su `scheduledDeletion`.

### B2. Datos por tienda en Cloudflare

- `crearEntrada` envía `defaultCreator = tiendaId`. Así el almacenamiento (`storage-usage?creator=`) y los minutos entregados (GraphQL, dimensión `creator`) salen por tienda.

### B3. Costo real

- **Proveedor:** `minutosEntregados({ desde, hasta })` → `[{ videoId, creador, minutos }]` (GraphQL `streamMinutesViewedAdaptiveGroups`). El token necesita además el permiso **Account Analytics**.
- **Job diario:** guarda los minutos reales por transmisión (`minutos_entregados`) y el reporte de `scripts/transmision-excedentes.js` los usa en lugar de la estimación. `minutos_vistos` (latido) queda para comparar.

### B4. Espectadores reales

- **Proveedor:** `espectadoresEnVivo(entradaId)` (`/<INPUT_ID>/views`).
- **Admin:** "Viendo ahora" muestra el número de Cloudflare.
- **Aviso de enlace filtrado:** si Cloudflare cuenta más espectadores que sesiones de invitados vivas (con margen), se avisa en el panel.
- **Verificar** si `/views` exige token con `requireSignedURLs`.

### B5. `allowedOrigins`

- Lista de orígenes: el dominio del storefront, los dominios propios de la tienda y el del admin (la vista previa del panel en vivo usa el mismo iframe).
- **Verificar** que `lifecycle`, `/views` y el MP4 firmado siguen funcionando, y si abrir la URL del iframe directo queda bloqueado.

## Fase C: calidad del diseño

### C1. Proveedor por transmisión

Requisito para poder usar dos proveedores (ver [Mux](#y-si-mañana-quiero-mux-para-bajar-la-latencia)).
- `proveedorDe(t)` = `getStreamingProvider(t.proveedor)`. Se usa en envivo, grabaciones y service. `STREAMING_DRIVER` solo decide el proveedor de las transmisiones **nuevas**.
- `transmision_grabaciones` hereda el proveedor de su transmisión.
- Webhooks con el proveedor en la ruta: `/webhooks/stream/:proveedor/:tipo`. Las rutas actuales de Cloudflare se mantienen como alias.
- Test: una transmisión `cloudflare` sigue usando Cloudflare aunque `STREAMING_DRIVER=mux`.

### C2. Contrato por capacidades y test de contrato

- Se divide la interfaz en `envivo` (obligatoria), `grabaciones`, `retransmision`, `subtitulos` y `metricas`. Cada proveedor declara las que tiene, y el código compartido pregunta por la capacidad, no por el nombre del proveedor (como en `negocio/`).
- `services/streaming/__tests__/contrato.test.js` corre la misma batería contra cada proveedor registrado (con `fetch` simulado): formas de retorno, normalización de estados, verificación de webhooks válidos e inválidos, y token con `exp` ≤ 24 h. Un proveedor nuevo que no cumple no pasa CI.
- `FakeStreamingProvider` para los tests de `transmisiones` (hoy cada test simula el proveedor a mano).

### C3. Copia a R2 con reserva en la BD

- `transmision_grabaciones.r2_copiando_desde`: la copia se reserva con `updateMany` (`r2Key: null` y sin reserva, o una reserva de hace más de 2 h), igual que el resumen. La bandera en memoria queda solo para no saturar la réplica.

## Fase D: calidad del video (pruebas, sin código)

Se hacen con la App Transmitir, porque permite controlar el encoder.

| Prueba | Configuración | Qué se mide |
|---|---|---|
| LL-HLS de nuevo | `preferLowLatency: true`, GOP 2 s, **B-frames apagados**, CBR | Retraso (cronómetro contra reproductor). Si baja de forma clara, se activa |
| SRT contra RTMPS | 1080p a 4.5 Mbps, 4G con movimiento | Cortes y partes de grabación por hora |
| Bitrate mínimo | Bajar a 720p a 1.5 Mbps | ¿Cloudflare la rechaza o la acepta? Define el piso de R11.3 |
| `timeoutSeconds` | 60 contra 300 | Partes por evento contra cuánto tarda la grabación en estar lista |

Los resultados van a [fase0.md](fase0.md) (sus filas siguen vacías) y la configuración recomendada a la guía del admin y a la App Transmitir.

## Orden y por qué

1. **A** primero: son los tres casos en que un evento pagado no se ve o se corta tarde.
2. **C1** antes de B, si se quiere dejar abierta la puerta a Mux: B agrega métodos al proveedor y conviene que ya se resuelvan por transmisión.
3. **B** cuida la privacidad y el margen.
4. **C2 y C3** se pueden hacer junto con A o B, en el mismo trabajo.
5. **D** cuando la App Transmitir esté lista.

## Decisiones (2026-10-15)

1. **Cuota (A1): solo avisar, nunca bloquear.** Al 80 %, una vez por día, a la plataforma (`TRANSMISIONES_ALERTAS_EMAIL`; si falta, `PLATFORM_ADMIN_EMAILS`).
2. **Avisos técnicos de la señal (A2):** van al **contacto de la transmisión** que ya se guarda (y al negocio). No se agrega otro campo de correo.
3. **`timeoutSeconds`:** se prueba con **0** (el valor de Cloudflare) y después con 60. Es configurable con `CF_STREAM_TIMEOUT_SEG`, sin tocar código. Solo aplica a las entradas nuevas.
4. **`allowedOrigins` (B5): sí.** Las tiendas viven en subdominios (`*.ecompyme.com`) y no hay dominios propios, así que la lista se arma sola desde la configuración y no hay que mantenerla.
5. **IA solo a pedido:** el resumen del Premium se genera con un botón **"Generar resumen" en el admin** (rol editor o superior). Los **subtítulos automáticos de Cloudflare también son IA**, así que tampoco se piden solos: los dispara el mismo botón. Los resúmenes ya generados antes del cambio quedan como pedidos ("automático (antes del botón)").

## Implementado (2026-10-15)

- **BD:** [docs/sql/transmisiones_mejoras.sql](../../sql/transmisiones_mejoras.sql). Correr en Supabase y luego `npx prisma generate`.
- **Proveedor** ([cloudflare.provider.js](../../../services/streaming/cloudflare.provider.js)):
  - toda llamada pasa por `pedir()`: cuenta, respeta la pausa y la activa ante un 429 (lee `Ratelimit` o `Retry-After`, máx. 5 min). Durante la pausa lanza `LimiteApiError`, salvo las llamadas urgentes (el corte);
  - `usoAlmacenamiento()`, `consumoApi()` y el `error` de `live_input.errored` en `verificarWebhook`;
  - `recording.timeoutSeconds` desde `CF_STREAM_TIMEOUT_SEG` (0 por defecto) y `allowedOrigins` desde `origenesPermitidos()`.
- **Job:** primero cortes y extensiones automáticas; después el resto, hasta 4 a la vez. Con el proveedor en pausa no llama (salvo el corte) y las grabaciones esperan. La señal se consulta por API solo si ningún aviso la confirmó en 3 min (`senal_verificada_en`). Cada 10 min revisa el almacenamiento, y en el log avisa si un ciclo hizo 120 llamadas o más.
- **Avisos a la plataforma:** [transmisiones.plataforma.js](../../../modules/transmisiones/transmisiones.plataforma.js).
- **Resumen a pedido:** `POST /admin/transmisiones/:id/resumen` (editor+), regla `motivoSinResumen`. Un error se reintenta solo hasta 3 veces (es el mismo pedido); agotados los intentos, el botón vuelve como "Intentar de nuevo".
- **Admin:** aviso rojo con qué corregir en la app, botón "Generar resumen" con su estado, y el refresco ya no espera un resumen que nadie pidió.
- **Variables:** `CF_STREAM_TIMEOUT_SEG`, `CF_STREAM_ALLOWED_ORIGINS`, `TRANSMISIONES_ALERTAS_EMAIL` (en `.env.example`).

### LL-HLS y parámetros de la plataforma (2026-10-16)

- **LL-HLS (`preferLowLatency`) activado** por defecto, para probarlo con Streamlabs. Decisión: un parámetro **de la plataforma** (no por tienda ni por transmisión) que cambia solo su administrador.
- **Parámetros de la plataforma** (módulo nuevo `modules/parametros/`): tabla [parametros_plataforma](../../sql/parametros_plataforma.sql) + pantalla **"Parámetros de la plataforma"** en el admin (`/parametros-plataforma`, con enlace en la pantalla de transmisión y en Idiomas de la plataforma, solo para `PLATFORM_ADMIN_EMAILS`).
  - El registro `parametros.registro.js` es la única lista de parámetros: cada uno trae su validación (Zod) y su valor por defecto, y un test exige que estén completos. La tabla solo guarda lo que se cambió, con quién y cuándo.
  - Caché de 30 s: el job no consulta la BD cada minuto, y un cambio llega a todas las réplicas en menos de un minuto. Si la BD no responde, rige el valor por defecto (un parámetro nunca frena el corte).
- **Parámetros de transmisión:**
  - `transmision.baja_latencia` (por defecto: activado);
  - `transmision.timeout_segundos` (por defecto: `CF_STREAM_TIMEOUT_SEG`, o sea 0). Así la prueba de 0 contra 60 se hace desde la pantalla, sin reiniciar.
- **Cuándo se aplican:** al crear la entrada (activar o "Cambiar clave") y **cada vez que el job la habilita**, al abrir la sala o en la prueba. Por eso una transmisión ya programada toma el valor vigente sin recrearla. Nunca se cambian con la señal llegando.
- **Corrección importante:** el `PUT` que habilita o corta la entrada reemplaza la entrada completa en Cloudflare. Ahora reenvía `preferLowLatency` (y el `timeoutSeconds` de la entrada). Sin eso, la baja latencia se habría apagado sola en el primer corte o habilitación.
- **Encoder para LL-HLS:** keyframe de 1 a 2 s y B-frames apagados (según la [guía de Cloudflare](https://blog.cloudflare.com/cloudflare-stream-low-latency-hls-open-beta/)). Hay que ver si Streamlabs móvil permite configurarlos.

**Por verificar en la próxima transmisión real:**
- [ ] Con LL-HLS: retraso medido (cronómetro contra reproductor), si el reproductor muestra "Low Latency" y si la reproducción firmada sigue funcionando.
- [ ] Que la grabación siga funcionando con LL-HLS activado.
- [ ] Con `allowedOrigins`: la página del invitado (iframe y `lifecycle`), la vista previa del admin y la descarga del MP4 del anfitrión funcionan.
- [ ] El código real de un `live_input.errored` (por ejemplo, poniendo el keyframe en 20 s en Larix) llega con `live_input_errored.error.code`.
- [ ] `GET /stream/storage-usage` devuelve `totalStorageMinutesLimit` con la capacidad comprada.

## Y si mañana quiero Mux para bajar la latencia

### Respuesta corta: no es cambiar un switch, pero tampoco es empezar de cero

La interfaz `StreamingProvider` hace que el módulo de transmisiones casi no cambie. Pero hoy **cambiar `STREAMING_DRIVER=mux` rompería todo lo que ya existe en Cloudflare**: las transmisiones programadas, las grabaciones de 30/90 días y los webhooks, porque el código usa el proveedor global y no el de cada transmisión (hallazgo 7). Además, el contrato tiene supuestos de Cloudflare.

| Qué | Trabajo |
|---|---|
| `mux.provider.js` (en vivo, grabaciones, MP4, retransmisión, subtítulos, webhooks) | **Nuevo**, del tamaño de `cloudflare.provider.js` |
| Proveedor por transmisión (C1) | Ajuste, necesario antes de cualquier cambio |
| **Id de reproducción ≠ id de la entrada.** En Cloudflare el mismo `uid` sirve para transmitir y reproducir; en Mux, el live stream tiene un `playback_id` aparte, y cada grabación (asset) también | Columnas nuevas `reproduccion_id` en `evento_transmisiones` y `transmision_grabaciones`, y `crearEntrada`/`listarVideos` las devuelven |
| `estadoUrl` (`lifecycle` desde el navegador) y la recarga del iframe | Mux no tiene equivalente. Mux Player vuelve solo tras un corte; el front usa la señal del latido. Variante `proveedor: 'mux'` en el storefront y la vista previa del admin |
| Retransmisión: Cloudflare pausa y reanuda cada salida; Mux solo crea y borra destinos | `habilitarSalida` en Mux = crear o borrar, y `salidaId` cambia en cada ventana |
| Webhooks: Mux usa una sola ruta con `mux-signature` | Entra en la ruta `/:proveedor` de C1 |
| Corte | **Mejora:** Mux tiene `disable` y `max_continuous_duration` como respaldo (R7.8 lo pedía) |
| Partes de grabación | **Mejora:** `reconnect_window` hasta 1,800 s, menos partes en 4G |
| Regenerar la clave | Funciona igual (crea otra entrada). Mux permite `reset-stream-key` como optimización |
| **Precios y factores** | Mux cobra el encoding en vivo por minuto (unos $0.025–0.031 a 1080p). `FACTORES` (0.5/1/2/4) y los precios salen de los costos de Cloudflare: hay que volver a correr [casos.py](casos.py) y que los factores dependan del proveedor |

**Tamaño estimado:** el proveedor de Mux más los ajustes son de un tamaño parecido a la parte de proveedor de la Fase 2, más la simulación de precios. Si C1 y C2 ya están hechos, después cambiar de proveedor sí es configuración para las transmisiones nuevas, y las viejas terminan su ciclo en Cloudflare.

### Antes de pagarlo: ¿Mux de verdad baja la latencia en nuestro caso?

Según la [guía de latencia de Mux](https://www.mux.com/docs/guides/reduce-live-stream-latency):

| Modo de Mux | Retraso |
|---|---|
| Estándar | 25–30 s |
| Reducido | 12–20 s |
| Bajo (LL-HLS) | desde 5 s |

Pero Mux advierte que los modos reducido y bajo solo convienen si se controla el encoder y **su red**, y que *"las conexiones móviles normalmente no son lo bastante estables"*. Nuestro caso es justo un celular con 4G o con el wifi del local. Lo realista con Mux es el modo reducido (12–20 s), contra los ≈ 20 s medidos hoy con Cloudflare. La spec ya aceptó los 20 s porque la transmisión es de una sola vía.

**Recomendación:** primero la prueba de LL-HLS de la Fase D (Cloudflare, sin B-frames, GOP 2 s), que no cuesta desarrollo. Hacer C1 y C2 de todos modos, porque dejan el cambio de proveedor como configuración. Solo construir `mux.provider.js` si la prueba falla **y** hay tiendas que pidan menos retraso.

## Fuentes

- Cloudflare: [live inputs](https://developers.cloudflare.com/stream/stream-live/start-stream-live/), [ver un live](https://developers.cloudflare.com/stream/stream-live/watch-live-stream/), [seguridad](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/), [webhooks del live](https://developers.cloudflare.com/stream/stream-live/webhooks/), [precios](https://developers.cloudflare.com/stream/pricing/), [WebRTC](https://developers.cloudflare.com/stream/webrtc-beta/), [espectadores](https://developers.cloudflare.com/stream/getting-analytics/live-viewer-count/), [GraphQL](https://developers.cloudflare.com/stream/getting-analytics/fetching-bulk-analytics), [storage-usage](https://developers.cloudflare.com/api/resources/stream/subresources/videos/methods/storage_usage), [límites de la API](https://developers.cloudflare.com/fundamentals/api/reference/limits/).
- Mux: [latencia](https://www.mux.com/docs/guides/reduce-live-stream-latency), [live streaming](https://www.mux.com/docs/guides/start-live-streaming), [precios](https://www.mux.com/docs/pricing/video).
