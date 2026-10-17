# Investigación: transmisión fluida desde el celular en movimiento (2026-10-16)

> Parte de [spec.md](spec.md). Sale de una prueba real: con el celular fijo la transmisión fluye; al caminar o moverlo rápido, se detiene.
> Estado: **investigación y propuesta**, sin implementar. El orden propuesto está en [Plan](#plan-propuesto).

## Qué pasó en la prueba (datos, 2026-10-16)

- Las dos transmisiones de prueba (Streamlabs, RTMPS, 720p) dejaron **una sola grabación continua** cada una (12 y 6 min). La conexión del celular con Cloudflare **no se cortó**: si se hubiera cortado, Cloudflare habría abierto otra parte.
- Conclusión: la parada no es una desconexión. Es una de estas dos, o las dos:
  1. **Subida:** con movimiento, toda la imagen cambia en cada cuadro y el encoder pide mucho más bitrate. Si pasa lo que da la red, RTMP (sobre TCP) **se traba** en vez de bajar la calidad.
  2. **Reproductor:** con LL-HLS el reproductor guarda muy poco video de reserva y cualquier hueco en la subida se ve como una parada.
- **Cómo distinguirlas:** ver la grabación en esos momentos. Si la grabación también se traba, es la subida. Si se ve fluida, es el reproductor.

## Dónde se puede mejorar

Node.js no está en el camino del video (celular → Cloudflare → invitado). El backend no lo acelera, pero **sí gobierna** las cuatro capas: entrega la configuración, mide y avisa.

| Capa | Qué la mejora | Impacto | Costo |
|---|---|---|---|
| 1. Encoder del celular | Bitrate fijo (CBR), bitrate adaptativo, GOP | **Alto** | App Transmitir |
| 2. Protocolo de subida | SRT con latencia de 1–2 s en vez de RTMP(S) | **Alto** en 4G | Casi cero (Cloudflare ya da la URL SRT) |
| 3. Reproductor del invitado | Más reserva en vivo, sin LL-HLS si la red es mala; reproductor propio (hls.js) | Medio | De bajo a medio |
| 4. Medición | Cortes por invitado y por evento, señal débil en la app | Indispensable para vender | Bajo (Node + store) |

### 1. Encoder del celular

- **CBR, no VBR.** Cloudflare lo recomienda para entrada en vivo. Con VBR, una escena con movimiento dispara el bitrate por encima de lo que da la red. Con CBR la imagen se pixela unos segundos, pero no se detiene. En Android 12+ existe `BITRATE_MODE_CBR_FD` (CBR que descarta cuadros antes que pasarse).
- **Bitrate adaptativo en el celular.** Es lo que hacen las apps de "IRL streaming" (gente que transmite caminando): bajan el bitrate cuando la red se congestiona, a partir de las estadísticas de SRT (RTT, paquetes reenviados, buffer de envío). Referencias:
  - **Moblin** (iOS, licencia MIT): tiene bitrate adaptativo para SRT y RTMP(S). Su motor se publicó aparte como **IRLStreamKit**. Es el algoritmo a estudiar para la App Transmitir.
  - **Viola et al., 2021**, *Adaptive Rate Control for Live streaming using SRT protocol*: un algoritmo de bitrate adaptativo sobre SRT.
  - **RootEncoder** (la librería de la App Transmitir) permite cambiar el bitrate en vivo (API 19+). En su README no aparece un ajuste automático: hay que implementarlo o confirmarlo en su código.
- **Piso de bitrate:** Cloudflare exige entre **2 y 14 Mbps de entrada**. Un algoritmo que baje de 2 Mbps podría ser rechazado: **hay que probarlo** antes de fijar el piso. Si se rechaza, el piso es 2 Mbps y lo que se baja es la resolución (720p → 540p).
- **GOP:** Cloudflare recomienda **4 a 8 s para HLS normal**, y 2 a 4 s sin B-frames para LL-HLS. La guía actual dice 2 s. Un GOP más largo comprime mejor el movimiento (menos picos de bitrate). Si LL-HLS se apaga, conviene 4 s.
- **Estabilización:** un gimbal o la estabilización óptica reducen el movimiento que el encoder tiene que codificar. Ya está en la guía de equipo; con movimiento, pasa de "recomendado" a "lo que más ayuda".
- **HEVC no sirve:** Cloudflare Stream Live solo acepta H.264 + AAC.

### 2. Protocolo de subida

- **RTMP(S) va sobre TCP:** un paquete perdido hace esperar a todos los que vienen detrás (bloqueo en cabeza de línea), y eso se ve como una parada. **SRT va sobre UDP** y reenvía solo lo que se perdió, dentro de una ventana de latencia.
- **La latencia de SRT es la clave en 4G.** Pruebas reales sobre 4G (Sharabayko, 2022): RTT promedio de 150 ms con picos de 300 ms; a 8 Mbps, una ventana de 750 ms perdió paquetes en un pico de RTT, y **una de 1200 ms los recuperó todos**. La recomendación es 5× RTT o más en celular (el clásico 3–4× no alcanza). Con el celular en movimiento hay cambios de antena: **1500–2000 ms** es un punto de partida razonable. Para nosotros eso no importa, porque la transmisión ya tiene unos 20 s de retraso.
- **Margen de bitrate:** `maxbw` ≈ bitrate + 25 % para los reenvíos. Más que eso puede congestionar la propia red.
- **LL-HLS y SRT:** Cloudflare recomienda **RTMP** si se usa LL-HLS, y SRT si no. Para un evento familiar de una vía, **la fluidez vale más que bajar de 20 s a 3 s**.
- **Bonding (SRTLA, sumar wifi + 4G):** Cloudflare no lo recibe directo; necesita un servidor intermedio. Solo vale para locales con señal muy mala. No ahora.

### 3. Reproductor del invitado

- Hoy usamos el **iframe de Cloudflare**: no deja ajustar la reserva ni la calidad adaptativa. Se recupera solo de errores de red (ver [reproductor-propio](../reproductor-propio/spec.md)); lo que se recarga es el cambio de video cuando vuelve la señal (`senal-envivo.ts`).
- **Opción barata:** dejar el iframe y usar el **SDK del reproductor** (`Stream(iframe)`) solo para **medir**: eventos `waiting`, `stalled` y `playing`.
- **Opción completa:** reproductor propio con **hls.js** sobre el manifiesto firmado de Cloudflare (soportado oficialmente). Permite:
  - más reserva en vivo (`liveSyncDurationCount` o `liveSyncDuration`) a cambio de unos segundos más de retraso;
  - arrancar en baja calidad y subir (`startLevel`, `capLevelToPlayerSize`);
  - recuperarse de errores de red **sin recargar la página**;
  - renovar el token sin cortar.

  Cuesta más: el iframe trae controles, subtítulos y compatibilidad con iOS ya resueltos.
- **Análisis completo del reproductor propio (2026-10-16):** [reproductor-propio/spec.md](../reproductor-propio/spec.md). Resumen: el iframe es Shaka 4.3.5; con LL-HLS retoma tras un corte con 0,01 s guardados, sin LL-HLS con 2 s. Primero se prueba con LL-HLS apagado; reproductor propio (hls.js) solo si la medición sigue sobre 1 %.
- **Algoritmos de calidad adaptativa de investigación** (LoL+, L2A-LL; ya integrados en dash.js): buscan equilibrar latencia baja contra cortes. Para nosotros, con 20 s aceptados, la ganancia frente a una buena configuración de hls.js es marginal. **No vale la pena implementarlos.**

### 4. Medición (lo que un producto comercial necesita)

- **El corte es lo que más espanta a quien mira en vivo.** Estudio de Conviva sobre millones de sesiones (SIGCOMM 2011): la proporción de tiempo en buffering es la métrica de calidad que más reduce el tiempo de visualización, y en vivo es peor: **un 1 % más de buffering resta más de 3 minutos de visualización en un evento de 90 minutos**. Mux recomienda mantenerla bajo 1 % y considera grave pasar del 3 %.
- La spec ya pide "cortes por evento" como métrica de éxito, pero hoy no se mide.
- **Propuesta (Node + store, barato):** el latido del invitado (cada 30 s) agrega los segundos en espera desde el latido anterior (eventos del SDK). El backend acumula por invitación y por transmisión:
  - **porcentaje de corte por evento** (meta < 1 %);
  - aviso en el panel en vivo: *"Varios invitados ven cortes: revisa la señal"*.
- **En la App Transmitir:** el endpoint `estado` recibe bitrate real, RTT y cuadros perdidos. El backend los guarda y la app muestra *"Tu señal está débil"* (R11.5).

### El backend como control (configuración desde el servidor)

- El backend le entrega a la App Transmitir su **perfil de encoder** al vincular (`/app-transmitir/vincular`): protocolo, latencia SRT, bitrate mínimo y máximo, GOP y resolución. Los valores salen de **Parámetros de la plataforma**.
- Así se ajusta la calidad de todas las transmisiones **sin publicar una versión nueva de la app**, y con los datos de la medición se ve si el cambio mejoró.

### Lo que no conviene (para este producto)

| Opción | Por qué no |
|---|---|
| WebRTC (Cloudflare WHIP/WHEP o LiveKit) | Cloudflare WebRTC no graba, no retransmite ni cuenta espectadores. LiveKit sí graba, pero es otra infraestructura que operar. Solo tiene sentido si el producto pasa a ser interactivo |
| HEVC / AV1 | Cloudflare Stream Live acepta solo H.264 |
| Super-resolución, ABR con aprendizaje por refuerzo | Investigación académica: mucho costo y poca ganancia frente a CBR + SRT + bitrate adaptativo |
| Bonding SRTLA | Necesita un servidor intermedio; solo para locales con señal muy mala |

## Plan propuesto

1. **Prueba A/B, sin código.** El mismo recorrido caminando, mirando después la grabación y la página del invitado:
   - A: Streamlabs, RTMPS, LL-HLS activado (lo de hoy);
   - B: Streamlabs, RTMPS, **LL-HLS apagado**;
   - C: **IRL Pro** (Android) o **Moblin** (iPhone), **SRT con latencia de 2000 ms**, bitrate adaptativo, 720p entre 2 y 3 Mbps, LL-HLS apagado.

   El resultado define el protocolo y el valor por defecto de LL-HLS.
2. ✅ **Medición de cortes (backend + store), implementada el 2026-10-16:**
   - el SDK del reproductor (`sdk-reproductor.ts`) alimenta un contador puro (`contador-cortes.ts`, con tests). No cuenta la carga inicial, las pausas del invitado ni lo que pasa sin señal del local, que ya se mide aparte;
   - el latido lleva `calidad: { pausaSeg, vistoSeg, cortes }`, y el backend lo suma por invitación solo en vivo ([transmisiones_calidad.sql](../../sql/transmisiones_calidad.sql));
   - el admin muestra la fluidez del evento (meta < 1 % del tiempo en pausa; grave > 3 %) y avisa si 2 o más invitados ven cortes en los últimos 2 minutos. La App Transmitir recibe `invitadosConCortes` en su estado.
3. **Perfil de encoder desde el servidor:** parámetros de la plataforma (`transmision.encoder.*`) entregados en `/app-transmitir/vincular` y `estado`.
4. **App Transmitir:** SRT por defecto con la latencia del perfil, CBR (o CBR_FD), bitrate adaptativo (algoritmo de Moblin o de Viola et al.) con el piso que salga de la prueba, telemetría de señal y aviso "señal débil".
5. **Solo si la medición muestra cortes del lado del invitado con LL-HLS apagado:** reproductor propio con hls.js (ver [reproductor-propio](../reproductor-propio/spec.md)).

## Por verificar

- [ ] ¿Cloudflare acepta entrada por debajo de 2 Mbps o la rechaza? (Define el piso del bitrate adaptativo.)
- [ ] ¿Respeta la latencia SRT que pide quien transmite? (SRT suele negociar la mayor de las dos.)
- [ ] ¿RootEncoder ya trae un ajuste automático de bitrate? (Revisar su código, no solo el README.)
- [ ] Con LL-HLS: ¿funcionan la reproducción firmada y la grabación?

## Fuentes

- Cloudflare: [entrada en vivo (CBR, GOP, 2–14 Mbps, LL-HLS: RTMP antes que SRT)](https://developers.cloudflare.com/stream/stream-live/start-stream-live/), [reproductor propio](https://developers.cloudflare.com/stream/viewing-videos/using-own-player/), [SDK del reproductor](https://developers.cloudflare.com/stream/viewing-videos/using-the-stream-player/using-the-player-api/), [LL-HLS beta](https://blog.cloudflare.com/cloudflare-stream-low-latency-hls-open-beta/), [WebRTC](https://developers.cloudflare.com/stream/webrtc-beta/).
- SRT en celular: [Sharabayko, *Examining SRT Streaming over 4G Networks*](https://maxsharabayko.github.io/blog/posts/srt-4g-streaming-2022/), [mejoras a los reenvíos de SRT](https://medium.com/innovation-labs-blog/improving-srt-retransmissions-experiments-with-simulated-live-streaming-part-1-7d192483bba4), [latencia y puertos de SRT](https://www.forasoft.com/learn/video-streaming/articles-streaming/srt-deep-dive), [SRT en Cloudflare (formato de URL)](https://dev.classmethod.jp/articles/cloudflare-stream-srt-protocol-live-streaming/), [WebRTC vs SRT vs RTMP](https://articles.medialooks.com/webrtc-vs-srt-vs-rtmp-which-protocol-fits-your-streaming-architecture/).
- Bitrate adaptativo: [Viola et al., 2021](https://www.researchgate.net/publication/350189743_Adaptive_Rate_Control_for_Live_streaming_using_SRT_protocol), [Moblin](https://alternativeto.net/software/moblin/about), [RootEncoder](https://github.com/pedroSG94/RootEncoder), [modos de bitrate de MediaCodec (CBR_FD)](https://developer.android.com/reference/kotlin/android/media/MediaCodecInfo.EncoderCapabilities), [guía de IRL streaming](https://thepostflow.com/production/irl-streaming-setup/).
- Reproductor propio: [Cloudflare, usar otro reproductor (`?protocol=llhls` solo para pruebas)](https://developers.cloudflare.com/stream/viewing-videos/using-own-player/), [Cloudflare, ejemplo con hls.js](https://developers.cloudflare.com/stream/examples/hls-js/), [parámetros del iframe](https://developers.cloudflare.com/stream/viewing-videos/using-the-stream-player/), [API de hls.js](https://github.com/video-dev/hls.js/blob/master/docs/API.md), [Managed Media Source en iPhone (Safari 17.1)](https://webkit.org/blog/14735/), [hls.js con MMS en iPhone](https://dev.to/masonwritescode/playing-hls-through-managed-media-source-on-iphone-with-hlsjs-3cn8), [aviso MAL-2026-3019](https://osv.dev/vulnerability/MAL-2026-3019), [GHSA-pq9g-f2rr-m4hw](https://github.com/advisories/GHSA-pq9g-f2rr-m4hw).
- Reproductor: [hls.js, control de latencia](https://hlsjs.video-dev.org/api-docs/hls.js.hls.maxlatency), [LoL+ en dash.js](https://dashif.org/dash.js/pages/usage/abr/lol_plus.html), [L2A-LL](https://dashif.org/dash.js/pages/usage/abr/l2a.html), [comparación de ABR de baja latencia (MMSys 2024)](https://pan.uvic.ca/~clarkzjw/static/mmsys24.pdf).
- Impacto del corte: [Dobrian et al., *Understanding the Impact of Video Quality on User Engagement*, SIGCOMM 2011](https://cs.uwaterloo.ca/~brecht/courses/854-http-video-2012/readings/Understanding-the-Impact-of-Video-Quality-on-User-Engagement-SIGCOMM-2011.pdf), [Mux, rebuffering](https://data.mux.com/blog/video-analytics-series-part-1-rebuffering), [Conviva, rebuffering ratio](https://docs.conviva.ai/vsi-video/metric-dictionary/rebuffering-ratio/).
