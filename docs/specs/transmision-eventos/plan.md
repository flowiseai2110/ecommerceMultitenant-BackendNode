# Plan: Transmisión en vivo de eventos privados

> Parte de [spec.md](spec.md). Fecha: 2026-10-06. Estado: **plan por fases aprobado**. Las [preguntas abiertas](spec.md#preguntas-abiertas) se deciden al llegar a la fase que las necesita (ver [Decisiones pendientes](#decisiones-pendientes-por-fase)).
> Repos: BackendNode, FrontendAdmin, FrontendStore y App Transmitir (Android, repositorio aparte; ver [spec](spec.md#app-transmitir-proyecto-aparte)).

## Decisiones (2026-10-06)

1. **Proveedor inicial: Cloudflare Stream**, detrás de la interfaz `StreamingProvider`. Mux queda como alternativa.
   - **Motivo:** los eventos chicos (15–25 invitados) son los más comunes. Ahí Cloudflare deja entre 71 y 79 % de margen y Mux entre 28 y 39 %, porque Cloudflare no cobra el encoding ([casos.py](casos.py)).
   - La plataforma ya usa Cloudflare (R2), así que es una sola cuenta y una sola factura.
2. **Preguntas abiertas:** se deciden cuando la fase las necesite.
3. **Cobro de paquetes y excedente:** **manual** al inicio. La tienda paga a la plataforma por Yape o transferencia, y la plataforma da de alta el paquete con un script. Los excedentes se anotan y se cobran a mano.

## Qué cambia en la spec al usar Cloudflare en vez de Mux

| Tema | Con Mux (spec original) | Con Cloudflare | Dónde se resuelve |
|---|---|---|---|
| Retraso | ≈ 5 s (baja latencia) | ≈ 10–20 s con HLS. **WebRTC (WHEP) descartado:** no reproduce lo que entra por RTMPS o SRT y no graba ([fase0.md](fase0.md)) | Fase 0: medir HLS con y sin `preferLowLatency`. La spec debe decir "unos segundos de retraso", no "5 s" |
| "Solo en vivo" | Sin grabar | Con `recording.mode: "off"` no hay HLS. Se graba y el job **borra el video al terminar** | Fase 2 |
| Corte automático | `max_continuous_duration` como respaldo | **No existe.** El corte depende 100 % del backend | El programador de tareas pasa a la **Fase 2** (antes estaba en la 3) |
| Avisos de estado del live | Webhooks del live stream | Live inputs: **Cloudflare Notifications** (conectado / desconectado / error) hacia un webhook. Videos: webhook de Stream firmado (`Webhook-Signature`) | Fase 0: confirmar formato y firma de los dos |
| Reproducción firmada | JWT con signing key de Mux | Token firmado con signing key de Stream (`requireSignedURLs`) | Fase 2 |
| Retransmisión a Facebook y YouTube | $0.02/min por destino | **Live outputs**, hasta 50. Se cobran como minutos entregados ($0.001/min por destino, 20 veces menos que Mux) | Fase 5. Cambia el precio (ver abajo) |
| Resumen con IA | Mux Robots | No existe. Se usan los **subtítulos automáticos** de Stream (o Whisper) y el texto se resume con el LLM que ya usa la plataforma | Fase 5 |
| MP4 descargable | Static renditions | API de **downloads** de Stream → se copia a R2 privado | Fase 4 |
| Guardar la grabación en línea | $0.003/min al mes | $5 por cada 1,000 min guardados al mes (≈ $0.90 al mes por 3 h). **Más caro que Mux** | Fase 0: recalcular. Puede convenir que el plazo en línea sea más corto y la descarga en R2 más larga |
| Transmitir desde el navegador (WHIP) | ❌ | ✅ | Ya no es un "no se puede". Queda como posible fase futura |
| Capa gratis | 100k min + $20 de crédito | No hay | Se paga desde el primer minuto, pero no hay costo de encoding |

### Factores de invitados: hay que recalcularlos

Los factores 0.7 / 1 / 1.6 / 2.8 salen del costo de Mux, donde el encoding era un costo fijo por hora. Con Cloudflare **solo se paga la entrega** ($1 por cada 1,000 min vistos), así que el costo crece casi en proporción a los invitados:

| Invitados | Peor caso por hora (todos conectados) | Factor proporcional |
|---|---|---|
| Hasta 25 | $1.50 | 0.5 |
| **Hasta 50** | **$3.00** | **1** |
| Hasta 100 | $6.00 | 2 |
| Hasta 200 | $12.00 | 4 |

Además, Stream se compra en **bloques prepagados** de minutos guardados y entregados, y eso cambia el costo fijo mensual. Antes de fijar precios hay que **actualizar [simulacion.py](simulacion.py) y [casos.py](casos.py)** con los costos de Cloudflare (Fase 0). La regla de 1.3 veces el peor caso se mantiene.

## Hallazgos del código que el plan resuelve

1. **No existe "evento privado".** `eventos` y `productos` solo tienen `activo`. Hay que agregar `eventos.privado` y filtrarlo en la cartelera, la búsqueda del storefront y el contexto del agente IA.
2. **Nombre repetido:** ya existe el modelo `invitaciones` (usuarios de una tienda). Aquí siempre se usa `evento_invitaciones`.
3. **Realtime sin fuga de datos:** `avisos_live` publica cambios por RLS con `SELECT` para anon. Aquí **no**: se usa **Realtime Broadcast** desde el backend, con un canal por transmisión cuyo nombre no se puede adivinar. Sin RLS anon sobre las tablas.
4. **Webhooks con cuerpo crudo:** `express.json()` es global ([server.js:85](../../../server.js#L85)). Las rutas `/webhooks/stream/*` llevan `express.raw()` montado antes, para poder verificar la firma.
5. **No hay jobs en segundo plano.** Se agrega un programador de tareas dentro del proceso (ver Fase 2).
6. **No existe el cobro de la plataforma a las tiendas** → cobro manual (decisión 3).
7. **`tienda_uso_recursos` es un contador mensual** y no soporta el orden de consumo ni las devoluciones. Se agrega el libro de movimientos `transmision_movimientos`, y `tienda_uso_recursos` queda como resumen del mes.
8. **El token del invitado no lleva vencimiento.** Lleva solo `invitacionId` y `tiendaId`, firmado con `jose` y `aud: "transmision-invitado"`. Las fechas en que vale el enlace se leen de la BD, así que anular o "Guardar 1 año" no obliga a reenviar enlaces.
9. **El enlace del invitado es `/:slug/t/:token`**, porque el storefront resuelve la tienda por slug.

**Se reutiliza:**
- `encryptSecret` de [utils/crypto.js](../../../utils/crypto.js) para las claves;
- el patrón de [reservas.token.js](../../../modules/reservas/reservas.token.js) para el token;
- `normalizarLinks` de [live.url.js](../../../modules/live/live.url.js) para el plan Básico;
- la idempotencia de `pago_eventos`;
- el patrón de proveedores de `storage.service.js` y `payment-provider.js`;
- `@aws-sdk/client-s3` para R2.

## Fases

### Fase 0: verificación técnica (sin código de producción)

> **Cerrada en lo esencial (2026-10-06).** Confirmado con una transmisión real: conexión de Larix por RTMPS, reproducción firmada (401 sin token o con token vencido), una grabación por cada reconexión y estado por API. **Quedan pendientes, para la Fase 2:** medir el retraso y la calidad, probar el corte en curso, la descarga del MP4 y actualizar la simulación con costos de Cloudflare. Detalle en [fase0.md](fase0.md). Script: `scripts/stream-spike.js`.

- [ ] Activar Stream en la cuenta de Cloudflare y hacer una prueba de 30 min desde Lima con Larix (RTMPS y SRT). Medir el retraso real con HLS y con WebRTC.
- [ ] Hacer un script en `scripts/` que pruebe:
  - crear un live input con `requireSignedURLs`;
  - reproducir con token firmado;
  - **cortar un live en curso** (deshabilitar o borrar el live input) y ver qué ve el invitado;
  - recibir las notificaciones de conectado y desconectado, y su verificación;
  - el webhook de video listo (`Webhook-Signature`);
  - la API de downloads (MP4);
  - los live outputs.
- [ ] Ver si WebRTC (WHEP) admite reproducción firmada. Si no, el plan Privado usa HLS.
- [ ] Probar si el QR de Larix funciona con los datos de Stream.
- [ ] Ver si se puede saber cuántos están viendo un live (`hideLiveViewerCount`) o si se cuenta solo con nuestro heartbeat.
- [ ] Actualizar `simulacion.py` y `casos.py` con los costos de Cloudflare y fijar los factores de invitados y los plazos de grabación.
- [ ] Confirmar los precios vigentes de Stream y cómo se compran los bloques.
- [ ] Confirmar que YouTube permite incrustar un live "no listado" marcado "para niños" (plan Básico).

**Sale de aquí:** este plan corregido con la API confirmada y los precios.

### Fase 1: base y plan Básico (YouTube)

**BD** (`db push` + `docs/sql/transmisiones_setup.sql`):
- `eventos.privado Boolean @default(false)`;
- `evento_transmisiones`: los campos del Básico, el consentimiento y el estado;
- `evento_invitaciones`.

**Backend:** módulo `modules/transmisiones/` con `admin.routes`, `store.routes`, `schema`, `service`, `serializer` y `token`.
- Filtrar los eventos privados en la cartelera, la búsqueda y el agente, con tests.
- Activar el plan Básico sobre una función (R1.1, R1.2, R2): solo para `tipoNegocio = 'eventos'` y rol `editor` o superior.
- Consentimiento del anfitrión obligatorio (R9.1).
- Invitados (R3.1, R3.4, R3.5): alta individual o pegando una lista, anular, reenviar y enlace `wa.me` con el mensaje ya escrito.
- `GET /store/:slug/transmisiones/:token`: datos del evento y en qué etapa está (`espera`, `en_vivo`, `terminada`).

**FrontendAdmin:** botón "Transmitir" en la función, pantalla de invitados y la advertencia de R2.2.

**FrontendStore:** página `/:slug/t/:token` con:
- sala de espera y cuenta regresiva en la zona horaria del invitado;
- el reproductor de YouTube incrustado;
- `noindex`;
- letra grande y textos en español claro (R4.1, R4.6).

> ✅ **Pregunta abierta 1 decidida:** invitaciones **solo nominativas**.

**Implementado (2026-10-06):**
- **BD:** [docs/sql/transmisiones_setup.sql](../../sql/transmisiones_setup.sql) agrega `eventos.privado` y las tablas `evento_transmisiones` y `evento_invitaciones`, con sus reglas (CHECK) y RLS sin políticas.
- **Backend** (`modules/transmisiones/`):
  - la etapa (`proxima`, `espera`, `en_vivo`, `terminada`, `vencida`, `cancelada`) se calcula al leer, sin jobs;
  - el enlace no tiene vencimiento propio: lleva una versión, y "Nuevo enlace" la sube para invalidar el anterior;
  - el plan Básico muestra la grabación de YouTube 30 días;
  - tope de 300 invitados por transmisión;
  - la conexión se registra al abrir la página;
  - los eventos privados no salen en la cartelera, el listado, el home, el detalle, la compra ni el asesor;
  - un evento privado no exige tipos de entrada;
  - una función con transmisión no se puede borrar.
- **Admin:** interruptor "Evento privado" en la ficha, botón "Transmitir" en cada función guardada, y la pantalla "Transmisión e invitados" (activar con consentimiento, invitados uno por uno o pegando una lista, copiar enlace, WhatsApp, nuevo enlace, anular).
- **Storefront:** `/:slug/t/:token`, sin el chrome de la tienda, con cuenta regresiva, la hora del invitado (y la de Perú si está fuera) y el reproductor de YouTube. Lleva `noindex`.
- **Nueva variable:** `TRANSMISIONES_LINK_SECRET` (backend).

### Fase 2: plan Privado en vivo (Cloudflare), sin grabación ni excedente

- **Proveedor:** `services/streaming/streaming-provider.js` (la interfaz), `cloudflare.provider.js` y `provider-factory.js`.
  - Variables nuevas: `STREAMING_DRIVER=cloudflare`, `CF_STREAM_ACCOUNT_ID`, `CF_STREAM_API_TOKEN`, `CF_STREAM_SIGNING_KEY_ID`, `CF_STREAM_SIGNING_KEY_JWK`, `CF_STREAM_WEBHOOK_SECRET`, `CF_NOTIFICATIONS_SECRET`.
- **Activar:** se crea un live input con reproducción firmada, sin grabación ("Solo en vivo") y con `tiendaId` en `meta` (R1.5, R10.1). La clave de transmisión se guarda cifrada (R9.4).
- **Datos de conexión** solo para `editor` o superior: la clave oculta por defecto y se puede copiar; también se puede regenerar (R5.1, R5.5).
- **Webhooks:**
  - rutas `/webhooks/stream/*` con cuerpo crudo y verificación de firma;
  - tabla `transmision_eventos_proveedor` con id de evento único, para la idempotencia;
  - estados `esperando_senal → en_vivo → reconectando → terminada` (R6.1, R6.2, R10.2).
- **Reproducción firmada:** token de corta duración (unos 15 min) que se renueva con el heartbeat (R4.2).
- **Una sola sesión por enlace (R4.3) y contador de conectados:**
  - `POST .../heartbeat` cada 30 s con un `sesionId`;
  - si llega otro `sesionId`, la sesión anterior se cierra por Broadcast.
- **Admin en vivo:** estado, tiempo transcurrido, tiempo restante, conectados y "Terminar" (R6.1, R6.3), todo con Broadcast.
- **Programador de tareas.** Con Cloudflare no hay corte automático, así que **sin esto no se puede lanzar el plan Privado**.
  - `jobs/scheduler.js`: un `setInterval` de 1 min, protegido con `pg_try_advisory_lock` para que no se duplique con varias réplicas en Railway.
  - Cada lectura revisa también el estado (como en `avisos_live`), como respaldo.
  - **Corte** a los 5 min de acabarse el tiempo contratado (R7.8).
  - **Reconciliación:** si se pierde un webhook, se consulta el estado real en Cloudflare.
- **Horas, versión simple:**
  - el factor de invitados que salga de la Fase 0;
  - bloqueo al activar si no alcanzan las horas (R1.3, R7.2);
  - solo se descuentan las horas del plan mensual (`planes.horasTransmisionMes`);
  - el consumo se mide entre "conectado" y "terminado" (R7.1).
- **Transmisión de prueba:** live input temporal de 10 min que el job corta, sin consumir horas (R5.4, R7.9).
- **Guía de equipo** en el admin (R5.3). La configuración recomendada se revisa según la Fase 0.
- **Contrato con la [App Transmitir](spec.md#app-transmitir-proyecto-aparte)** (R11, proyecto aparte que se construye en paralelo en 3 semanas):
  - vinculación por QR con código de un solo uso, guardado hasheado;
  - `POST /app-transmitir/vincular`, `GET /app-transmitir/estado` y `POST /app-transmitir/terminar`, con un token de sesión de la app.
  - Hasta que la app esté lista, las pruebas funcionales se hacen con **Larix Broadcaster** (versión gratis, 30 min) copiando la URL RTMPS.
- **Storefront:** reproductor de Stream, mensaje "Estamos reconectando…" que vuelve solo, y página de cierre (R4.4, R4.5).

> ✅ **Pregunta abierta 3 decidida (2026-10-06):** horas incluidas por mes: Free 0, Starter 0, **Pro 3**, **Business 6**. **Factores:** 0.5 / 1 / 2 / 4 para 25 / 50 / 100 / 200 invitados.

**Implementado (2026-10-06):**
- **BD:** [docs/sql/transmisiones_fase2.sql](../../sql/transmisiones_fase2.sql):
  - `planes.horas_transmision_mes`, con los valores de arriba;
  - en `evento_transmisiones`: columnas del Privado (entrada del proveedor, clave cifrada, tope y factor, habilitación, prueba, señal, inicio real, terminada, minutos usados y descontados, limpieza);
  - sesión del invitado en `evento_invitaciones`;
  - tablas nuevas `transmision_eventos_proveedor` (idempotencia de webhooks) y `transmision_vinculaciones` (QR de la app);
  - reglas (CHECK) y RLS.
- **Proveedor:** `services/streaming/` (interfaz + Cloudflare). La clave se guarda cifrada con `PAGOS_ENCRYPTION_KEY`.
- **Job** `jobs/transmisiones.job.js`, cada 60 s:
  - corte a fin + 5 min;
  - la entrada acepta señal **solo** en la prueba (10 min) y desde que abre la sala hasta el corte;
  - reconciliación de la señal por API;
  - limpieza de videos y entrada ("Solo en vivo").
- **Consumo** (R7.1): desde la primera señal, sin contar antes del inicio, hasta el fin real o la caída de la señal; tope en lo contratado + 5 min; × factor. Se registra una sola vez en `tienda_uso_recursos` (`transmision_minutos`, mes del inicio, hora de Lima).
- **Horas** (R1.3, R7.2): disponibles = incluidas − usadas − **reservadas** (Privados programados del mes). Si no alcanzan, no deja activar y dice cuánto falta.
- **Webhooks:**
  - `POST /api/v1/webhooks/stream/videos` (firma `Webhook-Signature`);
  - `POST /api/v1/webhooks/stream/notificaciones` (`cf-webhook-auth`);
  - verificados sobre el cuerpo crudo (`req.rawBody` en server.js) e idempotentes.
- **Invitado:** iframe firmado de Cloudflare, válido hasta 30 min después del corte (máx. 24 h). Latido cada 30 s: sesión única (409 "Este enlace se abrió en otro dispositivo" con el botón "Ver aquí") y "Estamos reconectando…".
- **Admin:**
  - plan Privado (solo con evento privado), tope de invitados con el consumo y el saldo del mes;
  - panel en vivo: señal, viendo ahora, corte, descuento y vista previa;
  - datos de conexión ocultos con Copiar, y cambio de clave;
  - prueba de 10 min, Terminar y guía de equipo;
  - se actualiza cada 15 s.
- **App Transmitir** (backend listo):
  - `POST /admin/transmisiones/:id/vinculaciones` (QR);
  - `POST /api/v1/app-transmitir/vincular`;
  - `GET /api/v1/app-transmitir/estado`;
  - `POST /api/v1/app-transmitir/prueba`;
  - `POST /api/v1/app-transmitir/terminar`.
  - La pantalla del QR en el admin se agrega cuando la app esté lista para probar (hace falta una librería de QR).

**Desviaciones del plan:**
1. **La prueba usa la misma conexión** que el evento real (no una entrada temporal): quien graba configura la app una sola vez. Fuera de la prueba y de la ventana del evento, la entrada está deshabilitada.
2. **Sin `pg_try_advisory_lock`:** con pgbouncer en modo transacción no es confiable. En su lugar, el job es idempotente (el corte descuenta una sola vez aunque corran dos réplicas).
3. **Sin Realtime Broadcast:** el admin consulta cada 15 s y el invitado tiene su latido de 30 s. Es más simple y alcanza para estos volúmenes. Se puede pasar a Broadcast si hace falta inmediatez.
4. **Sesión única a nivel de página:** el dispositivo desplazado deja de ver el reproductor, pero el iframe firmado sigue siendo válido hasta su vencimiento. Controla el reenvío honesto del enlace; no es una protección criptográfica.
5. **Regenerar la clave** crea otra entrada en Cloudflare (no permite rotarla) y borra la anterior. No se permite con la señal llegando.

**Variables nuevas:** `CF_STREAM_*` (ya en `.env`), `CF_STREAM_WEBHOOK_SECRET`, `CF_NOTIFICATIONS_SECRET`, `PAGOS_ENCRYPTION_KEY` (en el `.env` local se generó una), y opcionales `TRANSMISIONES_APP_SECRET` y `TRANSMISIONES_JOBS=false`.

### Fase 3: paquetes y excedente (cobro manual)

- **Aviso a los 15 min** (R7.5): Broadcast al admin y correo con Resend al dueño y al contacto de la transmisión, con los botones Extender 30 min, Extender 1 h y Terminar a la hora, y el precio de cada uno.
- **Extensión** confirmada o automática con su tope (R7.6). El job mueve la hora de corte.
- **BD:**
  - `transmision_paquetes`: vencen a los 12 meses (R7.4);
  - `transmision_movimientos`: libro de movimientos con el orden plan del mes → paquete más antiguo → excedente, y la devolución de lo no usado (R6.3, R7.3);
  - `transmision_excedentes`: con tope por tienda (R7.7).
- **Cobro manual:**
  - `scripts/transmision-alta-paquete.js` da de alta un paquete con su precio y la referencia del pago;
  - un reporte (script o endpoint protegido con clave de servicio) lista los excedentes por cobrar;
  - `cobradoEn` se marca a mano.
- **Costo real por tienda** (minutos entregados × precio de Stream), para compararlo con lo cobrado (R10.3).

> ✅ **Preguntas abiertas 2 y 4 decididas (2026-10-06):** paquetes de **10 h por S/ 250** y **25 h por S/ 550** (vencen a los 12 meses). Excedente a **S/ 20 por 30 min** de paquete, con tope de **2 h por tienda al mes**, cobrado a mano con el siguiente pago.

**Implementado (2026-10-06):**
- **BD:** [docs/sql/transmisiones_fase3.sql](../../sql/transmisiones_fase3.sql):
  - en `evento_transmisiones`: extensión, extensión automática, "Terminar a la hora", aviso de fin, contacto y minutos vistos;
  - tablas nuevas `transmision_paquetes`, `transmision_movimientos` y `transmision_excedentes`;
  - reglas (CHECK) y RLS.
- **Saldo** (`transmisiones.horas.js`):
  - plan del mes + paquetes vigentes, menos lo **reservado** por transmisiones pendientes;
  - cada reserva usa primero el plan de su mes y luego la bolsa común de paquetes;
  - el excedente lleva su propio tope mensual.
- **Reparto al terminar** (R7.3), dentro de la transacción del corte: plan del mes → paquetes (el que vence primero, bloqueados con `FOR UPDATE`) → excedente confirmado → "absorbido".
  - Lo absorbido no se cobra (R7.6): lo asume la plataforma y queda registrado.
  - Un excedente que no se usó queda **anulado**; si se usó, pasa a `por_cobrar` con el monto real.
- **Extensión** (R7.5-R7.7): 30 min o 1 h (máximo 3 h por transmisión), desde el admin o desde el enlace del correo.
  - Usa horas si quedan; si no, autoriza excedente (registra quién lo confirmó) hasta el tope del mes.
  - Corre el fin, el corte y el aviso.
- **Extensión automática** (R7.6): se autoriza al activar (0, 30 o 60 min). El job la aplica al llegar al fin, solo si la señal sigue llegando y nadie eligió "Terminar a la hora".
- **Aviso de 15 min** (R7.5): correo con Resend al negocio y al contacto de la transmisión, una sola vez por cada fin.
  - Lleva un enlace firmado (`transmision-accion`, vence 30 min después del corte) a la página pública `/transmision/accion/:token` del admin, con los botones Extender y Terminar a la hora.
  - El GET solo informa, así que un lector de correo que precarga el enlace no extiende nada.
- **Admin:**
  - al activar: contacto y "si hace falta, extender sola";
  - en vivo: opciones de extensión con su precio (paquete o S/), aviso en rojo a los 15 min y "Terminar a la hora";
  - tarjeta "Tus horas" (plan, paquetes, excedentes) y excedente por cobrar al terminar.
- **Cobro manual:**
  - `scripts/transmision-paquete.js` (alta, listar, anular; simula sin `--aplicar`);
  - `scripts/transmision-excedentes.js` (listar, cobrar, reporte del mes).
- **Costo real** (R10.3): `minutos_vistos` se estima con el latido de los invitados (≈ 30 s por latido) × $1 / 1,000 min. Va en el reporte de `transmision-excedentes.js`.
- **No incluido:** el aviso por WhatsApp o push (WhatsApp Business tiene costo por mensaje). Por ahora solo correo y el panel del admin.

### Fase 4: grabación

- Grabación automática del live input. Se ve en línea con el mismo enlace, durante el plazo que salga de la Fase 0 (R8.1).
- Webhook de video listo → se pide el MP4 por la API de downloads y se copia a un **bucket privado de R2**, distinto del de imágenes. La descarga va con URL prefirmada (R8.1.1). Hay que agregar `@aws-sdk/s3-request-presigner`.
- Jobs: aviso 7 días antes de cada borrado, borrado en Stream y borrado en R2 (R8.1.2, R9.3).
- "Solo en vivo" (R8.1.3), borrado anticipado si lo pide el anfitrión, y "Guardar 1 año" (solo alarga la descarga en R2).

> ✅ **Decidido (2026-10-07):** en Privado la grabación está **incluida y activada por defecto** (30 días para ver y descargar). "Guardar 1 año" cuesta **S/ 50**, como cargo manual a la tienda.

**Implementado (2026-10-07):**
- **BD:** [docs/sql/transmisiones_fase4.sql](../../sql/transmisiones_fase4.sql):
  - en `evento_transmisiones`: `grabar`, `guardar_anio`, avisos (lista, por borrar, descarga por vencer) y fecha de borrado;
  - tablas nuevas `transmision_grabaciones` (una fila por parte) y `transmision_cargos` ("Guardar 1 año");
  - CHECK y RLS. Las Privadas ya terminadas quedan con `grabar = false`, porque se limpiaron como "Solo en vivo".
- **Al terminar** (`limpiarEntrada`): con grabación, registra las partes desde que abrió la sala (las de la prueba ya se borraron) y borra **solo la entrada**. Cloudflare confirma que borrar la entrada conserva los videos. "Solo en vivo" o cancelada: borra todo.
- **Ciclo de grabaciones** (`transmisiones.grabaciones.js`, en el mismo job):
  - cada parte pasa de procesando a lista; las de menos de 10 s se descartan, porque son parpadeos de la señal;
  - se pide el MP4 descargable y se espera a que esté listo;
  - correo "tu grabación está lista" al anfitrión y al negocio, con el enlace del anfitrión;
  - avisos 7 días antes del borrado en línea y del vencimiento de la descarga de 1 año (R8.1.2);
  - borrado al vencer.
- **Página del anfitrión** `/:slug/grabacion/:token` (storefront): ver cada parte y descargarla. El token no vence: los plazos salen de la BD.
- **Invitados:** al terminar ven la grabación con su mismo enlace, todas las partes. Descargarla es solo del anfitrión (R8.1.1).
- **Admin:**
  - casilla "Grabar" al activar, y cambiar a "Solo en vivo" mientras está en curso;
  - sección Grabación: estado de cada parte, enlace del anfitrión (copiar o WhatsApp), "Guardar 1 año (S/ 50)" y "Borrar grabación ahora" (R9.3, solo admin+);
  - se actualiza sola mientras se procesa.
- **Cobro manual:** `scripts/transmision-excedentes.js` lista y cobra también los cargos.
- **Dependencias nuevas:** `@aws-sdk/lib-storage` (subida por partes) y `@aws-sdk/s3-request-presigner` (URL firmada).
- **Variable nueva:** `R2_BUCKET_GRABACIONES`, un bucket **privado** de R2 sin dominio público, con las mismas credenciales `R2_*`.

**Desviaciones del plan:**
1. **El MP4 se copia a R2 solo con "Guardar 1 año".** Mientras la grabación está en línea, la descarga sale directo de Cloudflare con un MP4 firmado (cada descarga cuesta lo mismo que verla, ≈ $0.18 por 3 h). Copiar siempre duplicaría ~7 GB por evento sin necesidad.
2. **La copia a R2 corre en segundo plano**, una a la vez y fuera del ciclo, para que mover ~7 GB no retrase el corte de otras transmisiones. Con "Guardar 1 año", una parte no se borra de Cloudflare hasta que su copia a R2 termina.
3. **El webhook de "video listo" no hace falta:** el ciclo consulta el estado de las partes cada minuto.

### Fase 5: Premium

- **Live outputs** a Facebook y YouTube: hasta 2 destinos, con su clave cifrada y la advertencia de que ahí no hay control de acceso (R8.2).
  - Con Cloudflare no hay costo por destino. El precio por hora y por destino de la simulación se revisa: puede bajar o pasar a ser un extra del Premium.
- **Resumen con IA:** subtítulos automáticos de Stream → texto → resumen, capítulos y momentos clave con el LLM de la plataforma → correo al anfitrión (R8.3).
  - El costo de IA se registra igual que en `consumo-ia`.

> ✅ **Decidido (2026-10-09):** Premium cuesta **S/ 40 por evento**, como cargo manual a la tienda, además de las horas (que descuenta igual que el Privado). La **retransmisión va incluida**.

**Implementado (2026-10-09):**
- **BD:** [docs/sql/transmisiones_fase5.sql](../../sql/transmisiones_fase5.sql):
  - en `evento_transmisiones`: estado del resumen, el resumen (JSON), intentos, tokens y aviso;
  - en `transmision_grabaciones`: estado de los subtítulos;
  - tabla nueva `transmision_destinos`, con la clave cifrada;
  - el CHECK de `transmision_cargos` ahora admite `premium`.
- **Al activar Premium:**
  - mismo camino que el Privado (evento privado, horas y factor);
  - se anota el cargo de S/ 40;
  - `guardarAnio = true`: descarga de 1 año incluida, que reutiliza la copia a R2 de la Fase 4;
  - la grabación se ve **90 días** en línea.
- **Retransmisión** (R8.2):
  - hasta 2 destinos (Facebook, YouTube u otro RTMP), con la clave cifrada;
  - cada destino es una "live output" de Cloudflare que el job **habilita solo desde que abre la sala hasta el corte**: una prueba previa no sale en el Facebook del anfitrión;
  - al regenerar la clave se recrean las salidas; al terminar desaparecen con la entrada.
- **Resumen con IA** (R8.3):
  - el job pide los subtítulos automáticos **en español** de cada parte (Cloudflare los soporta);
  - con todas las partes listas, encadena los WebVTT (cada parte desfasada por la duración de las anteriores);
  - llama a Claude una sola vez con **salida estructurada** (Zod: resumen, capítulos y momentos con su segundo) y `fallbacks: "default"`;
  - guarda el resultado y los tokens, y envía el correo "El resumen está listo" con los momentos clave;
  - corre en segundo plano y se reintenta hasta 3 veces. Si casi no hay texto (solo música), queda `sin_audio` sin gastar una llamada.
- **Modelo:** `TRANSMISIONES_IA_MODELO`, por defecto `claude-opus-5-5`, con effort `medium`. La clave es `TRANSMISIONES_IA_API_KEY` o, si falta, la del asesor (`AGENTE_IA_API_KEY`). Costo estimado: un evento de 3 h son ≈ 40-50 mil tokens de entrada, unos $0.20 por resumen.
- **Admin:**
  - plan Premium elegible solo con evento privado;
  - sección "Retransmitir a Facebook o YouTube": destinos con su estado y ayuda para obtener la clave en cada plataforma;
  - resumen con IA dentro de la sección Grabación;
  - cargo del Premium.
- **Anfitrión** (`/:slug/grabacion/:token`): resumen, momentos clave y capítulos.

**Desviación:** el costo de IA del resumen queda en las columnas de la transmisión (`resumen_tokens_*`), no en `consumo-ia`. Es un costo de la plataforma incluido en el precio del Premium, no una cuota de la tienda.

### Fase 6: pulido y métricas

- App Transmitir para iOS (HaishinKit), cuando haya tiendas usando la de Android.
- Panel con las métricas de éxito de la spec: activación, porcentaje de invitados que ven al menos 5 min, cortes y margen por evento.
- Avisos por WhatsApp Business o push.
- Opcional: transmitir desde el navegador del admin por WHIP, porque Cloudflare lo permite.

## Decisiones pendientes por fase

| Pregunta abierta ([spec](spec.md#preguntas-abiertas)) | Se decide en |
|---|---|
| 1. Invitaciones nominativas o también un enlace comodín | ✅ Decidida: solo nominativas |
| 3. Horas incluidas en cada plan mensual | ✅ Decidida: 0 / 0 / 3 / 6 h (Free / Starter / Pro / Business) |
| 2. Precios finales en soles | ✅ Decidida: 10 h S/ 250 · 25 h S/ 550 |
| 4. Tope de excedente y cuándo se cobra | ✅ Decidida: S/ 20 por 30 min, tope 2 h/mes, cobro manual |

## Por qué este orden

- **La Fase 1 sola ya se puede vender** (plan Básico) y prueba con usuarios reales el flujo de invitados y la página privada, sin gastar en video.
- **La Fase 2 incluye el programador de tareas** porque Cloudflare no corta solo. Así el costo queda controlado por el tope de invitados, la sesión única y el corte del backend.
- **El riesgo de dinero queda aislado en la Fase 3** y, como el cobro es manual, no depende de construir un sistema de facturación.
- **La grabación y el Premium van al final:** suman ingreso, pero dependen de lo anterior.
