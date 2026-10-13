# Prueba de concepto: calidad de la transmisión

La vista previa del plan Privado se ve mal. En la prueba del 2026-10-12 (entrada
`d74d2486…`) Cloudflare guardó **4 videos en ~10 min**: la señal se cortó 3 veces,
de 1 a 2 minutos cada vez, y llegó por RTMP a 720p. El backend no corta en medio
de una prueba, así que la causa está en el emisor (red, app o configuración).

Aquí se prueba cada variable por separado, fuera del producto, antes de cambiar
el código de `modules/transmisiones/` o `services/streaming/`.

Hallazgo inicial: `status.current.state` sigue en `connected` minutos después de que
la señal muere; hay que mirar también `statusLastSeen`. El backend
(`estadoEntrada` en `services/streaming/cloudflare.provider.js`) solo mira `state`.

Herramientas:
- `scripts/stream-spike.js` (Fase 0): crear entradas, firmar tokens, cortar, webhooks.
- `poc/transmision/monitor.js`: mide conexiones, cortes y videos nuevos de una entrada.

## Pasos

| # | Pregunta | Estado |
|---|----------|--------|
| 1 | ¿Qué emisor y red dan una señal **estable**? (RTMPS vs SRT, wifi vs datos, bitrate, keyframe) | pendiente (medir con la configuración corregida) |
| 2 | ¿El reproductor se recupera solo de un corte? | ✅ no; se llevó al producto la recarga al volver la señal |
| 3 | ¿Cuánto retraso quita LL-HLS (`preferLowLatency`) y aguanta la red de un evento? | pendiente |
| 4 | ¿Por qué no llegan los webhooks y qué avisos útiles darían al admin? | pendiente |
| 5 | Llevar lo que funcionó al producto (entrada, admin, App Transmitir) | pendiente |

## Paso 1 — Estabilidad de la señal

1. Crear una entrada de prueba (sin baja latencia):
   ```bash
   node scripts/stream-spike.js crear --nombre "POC señal"
   ```
   Imprime los datos para Larix por RTMPS y por SRT. Anotar el `uid`.
2. En otra terminal, dejar corriendo el monitor con la etiqueta del escenario:
   ```bash
   node poc/transmision/monitor.js <uid> --etiqueta "rtmps-datos-720p-3mbps-kf4"
   ```
3. Transmitir con Larix **10 minutos** apuntando a un cronómetro. Ctrl+C en el
   monitor al terminar: imprime el resumen y lo guarda en `resultados/`.
4. Repetir cambiando **una sola variable** por corrida.

Configuración base de Larix (recomendación de Cloudflare para HLS normal):
720p, 30 fps, **CBR 3 Mbps**, **keyframe fijo de 4 s**, B-frames 0, H.264.

| Corrida | Protocolo | Red | Video | Keyframe | Cortes | Tiempo cortado | Notas |
|---------|-----------|-----|-------|----------|--------|----------------|-------|
| A | RTMPS | datos | 720p 3 Mbps | 4 s | | | |
| B | SRT | datos | 720p 3 Mbps | 4 s | | | |
| C | SRT | wifi | 720p 3 Mbps | 4 s | | | |
| D | el mejor de A–C | | 1080p 5 Mbps | 4 s | | | ¿aguanta más calidad? |

Al terminar: borrar la entrada con `node scripts/stream-spike.js borrar <uid>`.

## Paso 2 — ¿El reproductor oficial se recupera solo?

Se probaron reproductores propios (iframe + SDK recargado, y hls.js) y los dos
fallaron por errores de implementación, mientras el iframe oficial de Cloudflare
sí mostraba imagen. Cloudflare documenta que su reproductor ya consulta
`/lifecycle` por su cuenta. Decisión (2026-10-12): usar solo el reproductor
oficial y medir si se recupera sin ayuda.

```bash
node poc/transmision/servidor.js <uid>
```
Abrir http://localhost:4050: un solo iframe oficial (igual que el admin) y un
registro que solo anota la señal según `/lifecycle`; no toca el reproductor.

Prueba: transmitir, pausar Larix 30 s y retomar; luego pausar 90 s (crea video nuevo)
y retomar. Sin recargar la página.

| Corte | ¿Volvió solo? | Tiempo hasta ver imagen | Qué mostró mientras tanto |
|-------|---------------|-------------------------|---------------------------|
| 30 s | | | |
| 90 s | | | |

### Resultado (2026-10-12)

- El iframe oficial con `?autoplay=true&muted=true` se ve fluido. Sin esos parámetros
  queda en pausa con la primera imagen (así estaban el admin y la tienda).
- Tras un corte **no vuelve solo**. Con F5 vuelve en ≤ 20 s, también cuando el corte
  creó otro video. Retraso medido: ~20 s (HLS normal).
- Los reproductores propios (SDK recargado, hls.js) fallaron por errores de
  implementación: descartados.
- Larix estaba en 720x720 y "System default" de bitrate (llegaban ~130–280 kbps).
  Corregir a 1280x720, CBR 3000 kbps, keyframe 2 s.

Llevado al producto: el backend entrega el iframe en vivo con autoplay silenciado y un
`estadoUrl` firmado (`/lifecycle`); admin y tienda lo consultan cada 5 s
(`senal-envivo.ts`), muestran el aviso de corte y recargan el iframe cuando vuelve
la señal o cambia el video.
