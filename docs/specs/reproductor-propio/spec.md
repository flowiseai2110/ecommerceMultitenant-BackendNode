# Spec: reproductor propio para la transmisión en vivo

> Estado: **en espera** (2026-10-16). Solo análisis; no hay código. Se retoma cuando las pruebas con la configuración actual den datos (ver "Cuándo hacerlo").
> Origen: la transmisión se traba cuando quien transmite camina o mueve rápido el celular. Investigación general: [investigacion-calidad.md](../transmision-eventos/investigacion-calidad.md) (paso 5 del plan).
> Base: [transmision-eventos](../transmision-eventos/spec.md) (plan Privado, video propio con Cloudflare Stream).
> Repos: FrontendStore (la página del invitado, `features/transmision/`) y BackendNode (entrega el enlace firmado).

## Problema

La página del invitado muestra el en vivo con el **iframe de Cloudflare** (`iframeUrl` de `urlReproduccion`). El iframe no deja elegir:

- cuánto video guardar antes de reproducir ni con cuánto volver a reproducir después de un corte;
- cómo elige la calidad (arranque, cuándo bajar en un pico);
- en iPhone, nada: usa el reproductor nativo de Safari.

Sus parámetros de URL son solo `autoplay`, `muted`, `preload`, `controls`, `loop`, `poster`, `startTime`, `defaultTextTrack`, `letterboxColor`, `primaryColor` y `ad-url`.

## Qué hace hoy el reproductor de Cloudflare

Leído de su código (`/embed/sdk-iframe-integration.fla9.latest.js`, 2026-10-16):

| Tema | Comportamiento |
|---|---|
| Motor | **Shaka Player v4.3.5** (2023) con calidad adaptativa propia de Cloudflare |
| Arranque | Velocidad estimada con `navigator.connection.downlink`, si no la última guardada, si no 3 Mbps. No pide más resolución que el tamaño del video en pantalla (`restrictToElementSize`) |
| En vivo normal | Al reproducir junta hasta **30 s** de reserva (`bufferingGoal: 30`) y vuelve a reproducir tras un corte con **2 s** guardados (`rebufferingGoal: 2`). Configuración sensata |
| Con LL-HLS | Shaka pone `rebufferingGoal = 0.01` si no se le da otro valor: tras un corte retoma con **casi nada guardado**. Con la subida inestable se traba, avanza un poco y se vuelve a trabar. Es la explicación técnica de por qué la baja latencia empeora la fluidez con movimiento |
| Recuperación | Reintenta cada pedido hasta 10 veces. Si un segmento falla con error del servidor (5xx o 408) y queda menos de 1 s guardado, salta al punto en vivo. Si el navegador suspende la carga, vuelve al punto en vivo |
| iPhone | Shaka 4.3.5 no conoce `ManagedMediaSource` (llegó en Shaka 4.10): en iPhone reproduce el HLS nativo de Safari, sin control |

**Lo que mostró el manifiesto de la prueba del 2026-10-16:** la versión 720p tiene un pico de **4,47 Mbps** contra un promedio de **2,34 Mbps**. Las escenas con movimiento casi duplican el bitrate. Un invitado con 3 Mbps reales tiene que bajar a 480p en esos momentos; si la calidad adaptativa no baja a tiempo, se traba.

Calidades que entrega Cloudflare (misma prueba): 240p (1,1 Mbps), 360p (1,3), 480p (2,1), 720p (4,5 de pico).

## Retraso y fluidez

El retraso del en vivo es, en la práctica, la **reserva** del invitado: el video que ya bajó y todavía no vio. Con más retraso, un corte breve de la subida o de la red del invitado se cubre con lo guardado y no se nota.

| Modo | Retraso aproximado | Reserva para cubrir cortes |
|---|---|---|
| HLS normal (iframe actual, LL-HLS apagado) | 15–20 s | Grande; retoma con 2 s guardados |
| LL-HLS (iframe actual, LL-HLS prendido) | 3–10 s | Pequeña; retoma con 0,01 s guardados |
| Reproductor propio, HLS normal | 15–20 s (lo elegimos nosotros) | Lo elegimos nosotros |

**Límites:**

- La reserva cubre cortes **más cortos que ella**. Si la subida se cae más tiempo (sin cobertura, cambio de antena largo), igual se corta. Eso se arregla en la subida (SRT y calidad adaptativa en la App Transmitir), no en el reproductor.
- **No hay una cifra exacta** como "16 s mejora". Es una hipótesis que se confirma o descarta con la medición de cortes (`calidad` del latido y la tarjeta "Fluidez para los invitados" del admin).

## Qué ganaríamos con un reproductor propio

Con **hls.js** (estable `1.7.3`, 2026-09-11; Cloudflare lo documenta como reproductor compatible):

| Mejora | Opción de hls.js | Cuánto pesa |
|---|---|---|
| Elegir con cuánto volver a reproducir tras un corte, también con baja latencia | `liveSyncDuration`, `liveSyncOnStallIncrease`, `maxBufferLength` | **Alto si queremos baja latencia.** Sin LL-HLS el iframe ya usa 2 s |
| Arrancar en baja calidad y subir; bajar antes en los picos | `startLevel`, `abrEwmaDefaultEstimate`, `abrBandWidthFactor`, `capLevelToPlayerSize` | Medio |
| Ponerse al día acelerando apenas el video en vez de saltar | `maxLiveSyncPlaybackRate` (1,05–1,1) | Bajo-medio |
| iPhone con control de reserva (iOS 17.1+) | `preferManagedMediaSource` | Medio, según cuántos invitados usen iPhone |
| Medición exacta: duración de cada corte, cambios de calidad, velocidad estimada del invitado | eventos `ERROR` (`BUFFER_STALLED_ERROR`), `LEVEL_SWITCHED`, `FRAG_BUFFERED` | Medio: hoy el SDK del iframe solo da `waiting`/`playing` |
| Volver solo cuando vuelve la señal, sin recargar el iframe | — | Bajo: ya funciona con la recarga (`saltarRecarga`) |

## Costos y riesgos

- **Trabajo:** unos **2–3 días**.
  - BackendNode: entregar `hlsUrl` en la página del invitado. Ya se firma en `urlReproduccion` (`cloudflare.provider.js`). El manifiesto responde con `Access-Control-Allow-Origin: *`, así que se puede cargar desde la tienda.
  - FrontendStore: componente con `<video>` y hls.js cargado solo en esa página (unos 150 KB comprimido), botón de sonido, pantalla completa nativa, renovación del enlace antes de que venza el token, y conexión con `ContadorCortes`.
  - El **iframe queda como respaldo** si hls.js no carga o el navegador no lo soporta.
- **LL-HLS con reproductor propio no es oficial:** Cloudflare dice que `?protocol=llhls` es para probar y que puede cambiar; su propio reproductor usa `protocol=llhlsbeta`. Con reproductor propio lo seguro es **HLS normal**.
- **Grabaciones:** siguen en el iframe (no son en vivo y no se traban).
- **Seguridad de la dependencia:** en abril de 2026 se publicaron dos versiones *canary* de hls.js con malware (MAL-2026-3019 / GHSA-pq9g-f2rr-m4hw: `1.7.0-alpha.1.0.canary.11764` y `.11765`). Las estables no están afectadas. Reglas: versión exacta fijada (`1.7.3` o la estable vigente con al menos dos semanas), nunca `@latest`, `canary` ni rangos `^`, y lockfile revisado.
- **El manifiesto no se cachea ni se pasa por proxy:** se lee directo de Cloudflare, como piden.

## Cuándo hacerlo

1. **Antes de escribir código:** probar con **LL-HLS apagado** (Parámetros de la plataforma, `transmision.baja_latencia`; aplica a las transmisiones que se activan después del cambio). Con LL-HLS apagado, el iframe retoma con 2 s guardados y no con 0,01 s: es la mayor parte de lo que daría un reproductor propio, a costo cero.
2. **Hacerlo solo si**:
   - con LL-HLS apagado, la fluidez del admin sigue **sobre 1 %** del tiempo en pausa y la **grabación se ve fluida** (el problema está en la entrega al invitado, no en la subida); o
   - el producto necesita **baja latencia y fluidez a la vez** (hoy no: un evento familiar acepta 20 s).
3. Si la grabación también se ve trabada, el problema está en la subida: corresponde la App Transmitir (pasos 3 y 4 de la investigación), no el reproductor.

## Diseño (si se aprueba)

- **Comparación A/B:** la mitad de los invitados con el reproductor nuevo y la otra mitad con el iframe, elegido por invitación (estable entre recargas). El latido manda qué reproductor usó y la medición de cortes compara. Se decide con datos de varios eventos, no de una prueba.
- **Configuración desde el servidor:** los valores de hls.js (reserva, velocidad de arranque, aceleración) salen de Parámetros de la plataforma (`transmision.reproductor.*`), para ajustarlos sin deploy del store.
- **Strategy:** el componente elige reproductor según lo que entrega el backend (`video.hlsUrl` presente o no). El store no pregunta por el proveedor.

## Pruebas pendientes

- [ ] Prueba caminando con LL-HLS **prendido** (configuración actual) y la página de un invitado abierta: anotar el % de fluidez del admin.
- [ ] La misma prueba con LL-HLS **apagado**.
- [ ] Comparar: si la diferencia es grande, la causa principal es la reserva del reproductor y alcanza con dejar LL-HLS apagado.

## Fuentes

- Cloudflare: [usar otro reproductor (`?protocol=llhls` solo para pruebas)](https://developers.cloudflare.com/stream/viewing-videos/using-own-player/), [ejemplo con hls.js](https://developers.cloudflare.com/stream/examples/hls-js/), [parámetros del iframe](https://developers.cloudflare.com/stream/viewing-videos/using-the-stream-player/), [LL-HLS beta](https://blog.cloudflare.com/cloudflare-stream-low-latency-hls-open-beta/).
- hls.js: [API y configuración](https://github.com/video-dev/hls.js/blob/master/docs/API.md), [control de latencia](https://hlsjs.video-dev.org/api-docs/hls.js.hls.maxlatency).
- iPhone: [Managed Media Source en Safari 17.1](https://webkit.org/blog/14735/), [hls.js con MMS en iPhone](https://dev.to/masonwritescode/playing-hls-through-managed-media-source-on-iphone-with-hlsjs-3cn8).
- Baja latencia y reserva: [opciones recomendadas para reproductores LL-HLS (Naver Cloud)](https://guide.ncloud-docs.com/docs/livestation-option).
- Seguridad: [MAL-2026-3019](https://osv.dev/vulnerability/MAL-2026-3019), [GHSA-pq9g-f2rr-m4hw](https://github.com/advisories/GHSA-pq9g-f2rr-m4hw).
