# Fase 0: verificación técnica con Cloudflare Stream

> Parte de [plan.md](plan.md). Fecha: 2026-10-06. Script: [scripts/stream-spike.js](../../../scripts/stream-spike.js). No toca la base de datos ni la API.

## Ya confirmado en la documentación de Cloudflare (2026-10-06)

| Tema | Resultado | Qué cambia en el plan |
|---|---|---|
| **WebRTC (WHEP) para el invitado** | ❌ **No sirve.** WHEP solo reproduce lo que entra por WHIP (navegador), no lo que entra por RTMPS o SRT, que es como transmite Larix. Tampoco graba | El plan Privado usa **HLS** (unos 10–20 s de retraso). Se prueba `preferLowLatency` para bajarlo |
| **"Solo en vivo"** | Con `recording.mode: "off"` **no se puede ver por HLS**. Para que el invitado vea, hay que usar `"automatic"`, que siempre graba | "Solo en vivo" = grabar y **borrar el video apenas termina** (lo hace el job). Mientras existe, ocupa almacenamiento |
| **Plazo de la grabación** | `deleteRecordingAfterDays`: de 30 a 1096 días | Los 30 días del Privado y los 90 del Premium los borra **Cloudflare solo**. El job queda para el aviso de 7 días y para "Solo en vivo" |
| **Corte** | `PUT /live_inputs/{uid}` con `enabled: false` rechaza las conexiones RTMPS y SRT | Por probar: si corta una transmisión **en curso** y qué ve el invitado |
| **Reproducción firmada** | Signing key (`POST /stream/keys`, se recibe `id` y `jwk`), JWT RS256 con `sub`, `kid`, `exp` (**máx. 24 h**), `nbf` y `downloadable`. El token va en la ruta: `customer-<CODE>.cloudflarestream.com/<TOKEN>/manifest/video.m3u8` | El token se firma en el backend, sin llamar a la API. Se renueva con el heartbeat |
| **¿Qué uid se reproduce?** | El del **live input** (siempre muestra la transmisión activa) o el del **video** (una transmisión puntual) | En vivo: el uid del live input. Grabación: el uid del video |
| **Estado en vivo** | `GET /live_inputs/{uid}/videos` (`state: "live-inprogress"`) y `GET customer-<CODE>…/{uid}/lifecycle` (`live`, `videoUID`) | La reconciliación del job usa `lifecycle` |
| **Webhook de videos** | `PUT /stream/webhook` devuelve un `secret`. Cabecera `Webhook-Signature: time=…,sig1=…` = HMAC-SHA256 de `time + "." + cuerpo` | Igual que lo hace el script: cuerpo crudo y comparación en tiempo constante |
| **Avisos del live** | Por **Cloudflare Notifications**: `live_input.connected`, `.disconnected` y `.errored`. El secret del destino llega en la cabecera `cf-webhook-auth`. Se configura en el dashboard | Son dos webhooks distintos, cada uno con su verificación. `errored` trae códigos útiles para el admin (`ERR_GOP_OUT_OF_RANGE` = keyframe mal configurado) |
| **Retransmisión** | `POST /live_inputs/{uid}/outputs` con `url`, `streamKey` y `enabled`. Hasta 50 destinos y se activa o desactiva cada uno sin cortar | **Sí cuesta:** la retransmisión cuenta como minutos entregados ($0.001/min por destino). Es casi nada, pero no es gratis |
| **MP4 descargable** | `POST /stream/{uid}/downloads` (`status`, `url`, `percentComplete`). En videos privados el token necesita `downloadable: true` | **Cada descarga se cobra** como minutos entregados (180 min = $0.18). Conviene copiarlo una sola vez a R2 privado y servirlo desde ahí, como dice el plan |
| **Precios** | Almacenamiento: **$5 por cada 1,000 min al mes, prepagado** (se compra capacidad). Entrega: **$1 por cada 1,000 min**, al final del mes. El ingreso y el encoding son gratis | Hay un costo fijo por la capacidad de almacenamiento contratada. Va a la simulación |

## Cómo correr la prueba

### 1. Preparar la cuenta (una vez)

1. En el dashboard de Cloudflare, activar **Stream** en la cuenta donde ya está R2.
2. Crear un API token con el permiso **Stream: Edit**.
3. Agregar al `.env`:
   ```env
   CF_STREAM_ACCOUNT_ID=
   CF_STREAM_API_TOKEN=
   CF_STREAM_CUSTOMER_CODE=     # el <CODE> de customer-<CODE>.cloudflarestream.com (aparece en el dashboard de Stream)
   ```
4. `node scripts/stream-spike.js llave` → copiar `CF_STREAM_SIGNING_KEY_ID` y `CF_STREAM_SIGNING_KEY_JWK` al `.env`.

### 2. Webhooks (para ver los avisos)

1. Terminal A: `node scripts/stream-spike.js escuchar`
2. Terminal B: `cloudflared tunnel --url http://localhost:4040` (te da una URL `https://….trycloudflare.com`).
3. `node scripts/stream-spike.js webhook https://….trycloudflare.com/stream` → copiar `CF_STREAM_WEBHOOK_SECRET` al `.env` y reiniciar la terminal A.
4. En el dashboard: **Notifications → Destinations → Webhooks → Create**, con la URL `https://….trycloudflare.com/notificaciones` y un secret inventado (va como `CF_NOTIFICATIONS_SECRET`). Después, **Add notification → Stream → Live input**, con los tres eventos.

### 3. Transmisión de 30 minutos desde Lima

1. `node scripts/stream-spike.js crear --nombre "Prueba Lima"` → muestra los datos de RTMPS y SRT para Larix.
2. En Larix, configurar 1080p, 30 fps, 4–5 Mbps y keyframe cada 2 s. Empezar a transmitir **apuntando a un cronómetro en pantalla**.
3. `node scripts/stream-spike.js token <inputUid> 60` → abrir la URL del iframe en otro celular con datos móviles y en una computadora.
4. **Retraso:** foto donde se vean juntos el cronómetro real y el del reproductor; la diferencia es el retraso.
5. Repetir con un live input creado con `--baja-latencia`, y después con SRT en vez de RTMPS.
6. Durante la prueba:
   - `node scripts/stream-spike.js probar-token <inputUid>`: sin token y con token vencido debe dar 401 o 403.
   - Apagar el wifi del celular de Larix 20 s y volver a prenderlo: ¿qué ve el invitado y cuánto tarda en volver? ¿Llegan los avisos de desconectado y conectado?
   - `node scripts/stream-spike.js estado <inputUid>`: ver `live-inprogress` y `lifecycle`.
   - **Corte:** `node scripts/stream-spike.js cortar <inputUid>`: ¿cuánto tarda en caerse? ¿qué ve el invitado? ¿qué aviso llega? ¿Larix puede reconectarse? (no debería). Luego `reactivar`.
7. Opcional: retransmisión a un live de YouTube de prueba con `salida <inputUid> rtmp://a.rtmp.youtube.com/live2 <clave>`.

### 4. Grabación y descarga

1. Al terminar, `estado <inputUid>` → tomar el `videoUid` de la grabación. ¿Cuánto tarda en estar `ready`? ¿Llegó el webhook de video listo con firma válida?
2. `token <videoUid> 60` → ver la grabación con el token.
3. `descarga <videoUid>` → esperar `ready` y luego `token <videoUid> 60 --descargable` → descargar el MP4. Anotar el tamaño.
4. Probar "Solo en vivo": `borrar-video <videoUid>` y confirmar que la grabación deja de verse.

### 5. Limpiar

`borrar <inputUid>` en cada live input de prueba, y borrar el destino de Notifications si ya no se usa.

## Resultados (llenar durante la prueba)

| Prueba | Resultado | Notas |
|---|---|---|
| Retraso HLS normal (RTMPS) | | |
| Retraso con `preferLowLatency` | | |
| Retraso con SRT | | |
| Calidad 1080p con datos móviles (Lima) | | |
| Conexión de Larix Broadcaster por RTMPS | ✅ 2026-10-06 | `status.current.state = connected`, video `live-inprogress`. Ojo: la app es **Larix Broadcaster**; Larix Player no transmite |
| Sin token / token vencido → 401/403 | ✅ 401 / 401; con token 200 | La reproducción firmada funciona en vivo |
| `lifecycle` con reproducción firmada | ⚠️ 401 sin token | El backend consulta el estado con `GET /live_inputs/{uid}/videos` (API con token), no con `lifecycle` |
| Token vencido en el iframe | ✅ "401 unauthorized signature expired" | El invitado vio el mensaje en inglés: el storefront debe renovar el token antes de que venza (heartbeat) y nunca mostrar ese error |
| Grabación por conexión | ✅ Hay 2 grabaciones `ready` (4 min y 3 min) | **Cada reconexión de más de `timeoutSeconds` (60 s) crea un video nuevo.** Una transmisión con cortes deja varios videos: el backend debe guardar una lista de grabaciones, no una sola (`grabacionAssetId` pasa a ser una lista) |
| `deleteRecordingAfterDays` al crear | ⚠️ no aparece en `recording` | Revisar el nombre o el lugar del campo. Si no se puede, el borrado de 30/90 días lo hace el job |
| Corte de wifi de 20 s: qué ve el invitado y cuánto tarda en volver | | |
| Avisos connected / disconnected: llegan y cuánto tardan | | |
| `cortar` en curso: tarda / qué ve el invitado / Larix reconecta | | |
| `PUT` conserva `recording` y `meta` | | |
| Grabación lista: cuánto tarda / llega el webhook con firma válida | | |
| MP4: tarda / tamaño de 30 min | | |
| `borrar-video` deja de verse | | |
| QR de Larix (Grove) con los datos de Stream | | |
| **Costo de Larix** | ⚠️ No es gratis | La versión gratis transmite 30 min limpios, luego 30 min con un aviso encima, y se corta. Premium: $9.99 al mes o $119 al año. No sirve gratis para un evento de 2–3 h |
| PRISM Live Studio (Android, gratis): ¿acepta `rtmps://`? ¿tiene límite de tiempo o marca de agua? | | Candidata a app recomendada |
| IRL Pro (Android, gratis): RTMPS y SRT, límite, marca de agua | | Candidata, sobre todo por SRT |
| ¿Hay contador de espectadores en vivo en la API? | | |
| YouTube "no listado" + "para niños" se puede incrustar | | |

## Pendiente después de la prueba

- [ ] Actualizar `simulacion.py` y `casos.py` con los costos de Cloudflare (entrega, almacenamiento prepagado, retransmisión y descargas) y fijar los factores de invitados y los plazos de grabación.
- [ ] Llevar los resultados a [plan.md](plan.md) y marcar la Fase 0 como cerrada.
