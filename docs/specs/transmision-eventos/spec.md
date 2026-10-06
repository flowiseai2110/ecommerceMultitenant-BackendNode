# Spec: Transmisión en vivo de eventos privados

> Estado: **análisis y diseño en revisión** (2026-10-06). Sin implementar.
> Diseño técnico: pendiente (`plan.md`, cuando se cierren las [preguntas abiertas](#preguntas-abiertas)).
> Repos involucrados: BackendNode, FrontendAdmin, FrontendStore.
> Relacionado: [mini-booking](../mini-booking/spec.md) (eventos, funciones y entradas), [aviso-live](../aviso-live/spec.md) (aviso con enlaces a TikTok/YouTube/Facebook) y [verticales-reserva/eventos.md](../verticales-reserva/eventos.md) (entradas con QR, modalidad virtual).

## Problema

Un negocio de eventos (animación infantil, local de fiestas, wedding planner, videógrafo) organiza el cumpleaños de 2 años del hijo de un cliente. Hay familiares lejos que no pueden llegar. Hoy la familia resuelve así:

- **Videollamada de WhatsApp, Meet o Zoom:** se corta (Meet a los 60 min, Zoom a los 40 min en sus planes gratis), la calidad es baja y el celular de quien graba se satura.
- **YouTube o Facebook Live:** es gratis, pero cualquiera con el enlace entra, aparecen sugerencias de otros videos, los mayores se pierden entre cuentas y grupos, y si el video se marca "para niños" se apaga el chat.
- **Contratar un servicio aparte** (por ejemplo EventLive, $30–59 por evento): está en inglés, se paga en dólares con tarjeta y no tiene nada que ver con el sistema con el que el negocio vende su evento.

**Lo que falla:** el negocio no puede ofrecer la transmisión como un servicio propio, con su marca, cobrado junto con el evento, y la familia no tiene una forma simple y privada de compartirla.

## Objetivo

Que un negocio con tipo de negocio **eventos** active **"Transmitir"** en una función de un evento y entregue a su cliente:

- una **página privada** del evento, en español claro, con la marca de la tienda;
- **un enlace por invitado**, que se comparte por WhatsApp, sin crear cuenta ni instalar nada;
- video de buena calidad (hasta 1080p), con unos **5 segundos de retraso**;
- la **grabación** al terminar, si la contrató;
- opcionalmente, **retransmisión a Facebook y YouTube** y un **resumen con IA** de la grabación.

El tiempo de transmisión sale del **paquete de horas** que la plataforma vende a la tienda.

## Posicionamiento

No competimos en precio contra YouTube ($0) ni pretendemos reemplazar a los servicios grandes. **Somos una opción más, y la única integral con eventos.** Para todos hay clientes.

Lo que nos diferencia:

1. **Todo en español claro y legible.** La pantalla del admin, la página del invitado, los correos y los mensajes de error están escritos para alguien que no es técnico. Esto incluye a la abuela que abre el enlace desde su celular.
2. **Integrada con el evento.** El negocio ya crea el evento, sus funciones y sus entradas en la plataforma. Transmitir es un botón más, no otra herramienta ni otra cuenta.
3. **Reventa con su marca (B2B2C).** La tienda revende la transmisión a su cliente como un servicio propio. Los competidores le venden al anfitrión.
4. **Pagos locales:** soles, Yape y transferencia, con los métodos de pago que la tienda ya tiene configurados.
5. **Enlaces por invitado** con control de acceso, en vez de un enlace único que se reenvía sin control.
6. **Grabación con extras** (resumen, momentos clave, capítulos) como producto adicional.

## Conceptos

- **Transmisión:** una por función de evento (`evento_funciones`). Tiene un plan, un estado y los datos del proveedor de video.
- **Plan de transmisión:** Básico, Privado o Premium (ver [Planes](#planes)). Define la infraestructura, el tope de espectadores y los extras.
- **Invitación:** un enlace único por invitado (`/t/{token}`). El token va firmado (HMAC, como el `qr_token` diseñado en `verticales-reserva/eventos.md`) y solo vale dentro de la ventana de la función.
- **Datos de conexión:** URL del servidor, clave de transmisión (RTMPS) y enlace SRT que usa la app de quien graba. Son **secretos**: solo los ve el rol `editor` o superior.
- **Paquete de horas:** horas de transmisión incluidas en el plan de la tienda (o compradas aparte) que se descuentan al transmitir. Se registra en `tienda_uso_recursos` con el recurso `transmision_minutos`.
- **Evento privado:** un evento que **no aparece** en la cartelera de la tienda, no se indexa (`noindex`) y solo se ve con una invitación.

## Planes

| | **Básico** | **Privado** ⭐ | **Premium** |
|---|---|---|---|
| **Para quién** | El cliente que solo quiere que la familia vea, al menor precio | El producto principal: privacidad real y buena calidad | Bodas, 15 años, corporativos |
| **Cómo funciona** | La página del evento **incrusta un YouTube "no listado"** que el negocio transmite desde su canal | Video propio con Mux, **enlace por invitado** y tope de espectadores | Todo lo de Privado, más retransmisión y extras |
| **Privacidad** | Baja: quien tiene el enlace de YouTube entra | Alta: enlace por invitado, video firmado y con vencimiento | Alta en la página propia; en Facebook y YouTube depende de esas plataformas |
| **Calidad** | La de YouTube | Hasta 1080p, unos 5 s de retraso, se adapta a la conexión de cada invitado | Igual que Privado |
| **Grabación** | La de YouTube (en el canal del negocio) | Opcional, disponible N días | Incluida |
| **Retransmisión a Facebook y YouTube** | — | — | ✅ |
| **Resumen con IA** (resumen, momentos clave, capítulos) | — | — | ✅ |
| **Costo para la plataforma** (3 h, 40 invitados) | **$0** | **≈ $6** | **≈ $13 + IA** |
| **Consume horas del paquete** | No | Sí | Sí |

**Referencia de precio:** EventLive cobra entre $30 y $59 por evento con espectadores ilimitados. El plan Privado puede ir algo por debajo y aún dejar un buen margen. El precio final lo fija la plataforma (paquetes a la tienda) y la tienda (precio a su cliente).

### Por qué tres planes

- **Básico** le quita a YouTube el argumento de "es gratis". Ya existe casi todo en el módulo `avisos_live` (enlace persistente a YouTube), así que su costo de desarrollo es bajo.
- **Privado** es el producto que nos diferencia y el que se vende contra EventLive.
- **Premium** junta los extras que más se venden en bodas: retransmisión a redes, grabación y un resumen.

## Proveedor de video

**Decisión: Mux** para los planes Privado y Premium, detrás de una **interfaz de proveedor** (como `services/storage.service.js` con supabase/r2 y `modules/pagos/pasarela/payment-provider.js`). Así se puede cambiar a Cloudflare Stream u otro si el volumen o el precio lo justifican.

| Criterio | Mux | Cloudflare Stream |
|---|---|---|
| Calidad | Hasta 1080p/1440p, codificación según el contenido. Referencia de la industria | Hasta 1080p |
| Retraso (latencia) | **≈ 5 s** en modo de baja latencia | ≈ 10–20 s con HLS normal |
| Capa gratis | Plan **Pay as you go**: 100k minutos de entrega al mes + $20 de crédito de uso al mes. El plan gratis **no** incluye transmisión en vivo | **No tiene.** Se paga desde el primer minuto |
| Encoding en vivo | $0.032/min | Gratis |
| Entrega | $0.0008/min (720p), $0.001/min (1080p) después de los 100k gratis | $1 por cada 1,000 minutos |
| Corte automático por duración | ✅ `max_continuous_duration` | ❌ hay que programarlo |
| Grabación | Automática, lista al terminar | Sí |
| Retransmisión a Facebook y YouTube | ✅ $0.02/min por destino, hasta 6 | ✅ hasta 50 destinos, sin cobro adicional según la documentación |
| Transmitir desde el navegador (WHIP) | ❌ solo RTMP/RTMPS y SRT | ✅ |
| IA sobre la grabación | ✅ Mux Robots, 100k unidades gratis al mes | ❌ |

**Costo de referencia** (3 h, 40 invitados = 7,200 minutos vistos):

| Concepto | Mux |
|---|---|
| Encoding: 180 min × $0.032 | $5.76 (cubierto por el crédito mensual de $20 en los primeros ~3 eventos del mes) |
| Entrega: 7,200 min | $0 mientras no pasen de 100k minutos en el mes (≈ 13 eventos así) |
| Retransmisión: 2 destinos × 180 min × $0.02 | $7.20 (solo Premium) |

> Lo que más mueve el costo es el **número de espectadores**, no el proveedor. Por eso el plan Privado lleva **tope de espectadores**.

## Actores

- **Plataforma:** vende paquetes de horas a las tiendas.
- **Tienda (negocio de eventos):** rol `editor` o superior. Activa la transmisión, invita y transmite (o contrata a un videógrafo).
- **Cliente del negocio (anfitrión):** los padres del cumpleañero. Entrega la lista de invitados y autoriza la transmisión.
- **Invitado:** un familiar que abre el enlace desde su celular o su computadora.
- **Quien graba:** personal de la tienda o un videógrafo, con un celular o una cámara profesional.

## Flujos

### Preparar (días antes)

1. El admin crea el evento (o usa uno existente) y lo marca como **privado**.
2. En la función, pulsa **"Transmitir"** y elige el plan. Si no le quedan horas en el paquete, el sistema se lo dice y le ofrece comprar más.
3. Registra el **consentimiento del anfitrión** (casilla obligatoria; ver [R9](#r9--privacidad-y-legal)).
4. Agrega a los invitados (nombre y, opcionalmente, teléfono). Cada uno recibe su enlace. El admin puede **copiarlo** o **enviarlo por WhatsApp** con un mensaje ya escrito.
5. Hace una **transmisión de prueba** de 10 minutos desde el local, para comprobar la señal.

### El día del evento

1. Quien graba abre la app de transmisión (por ejemplo Larix Broadcaster) con los datos de conexión. Si es posible, los carga escaneando un **QR** desde el admin.
2. Inicia la transmisión. El admin ve **"En vivo"**, el tiempo restante y cuántos invitados están conectados.
3. Los invitados abren su enlace: antes de la hora ven una **sala de espera** con cuenta regresiva y, a la hora, el video.
4. Al 80 % del tiempo contratado, el admin recibe un aviso. Al agotarse (más un margen de 15 min), la transmisión se **corta sola**.

### Después

1. Si hay grabación, los invitados la ven con el mismo enlace durante N días. Luego se borra.
2. En el plan Premium, la IA genera un resumen, los momentos clave y los capítulos. El anfitrión recibe un correo con el enlace a la grabación.

## Alcance

**Incluye**
- Activar la transmisión en una función de un evento privado, con uno de los tres planes.
- Invitaciones con un enlace único por invitado, para copiar o enviar por WhatsApp.
- Página del invitado en el storefront: sala de espera, reproductor y grabación.
- Datos de conexión para RTMPS y SRT, con un QR para la app de transmisión (si se confirma que funciona).
- Transmisión de prueba.
- Paquete de horas: consumo, aviso al 80 % y corte automático.
- Grabación con vencimiento.
- Retransmisión a Facebook y YouTube y resumen con IA (Premium).
- Guía de equipo y configuración dentro del admin, en español claro.

**No incluye (futuro)**
- Chat, reacciones o saludos en video de los invitados (sería otro producto, del tipo videollamada, por ejemplo LiveKit).
- Transmitir desde el navegador del admin (Mux no lo permite; se reevalúa si se cambia de proveedor).
- Varias cámaras mezcladas en la nube (lo resuelve el videógrafo con OBS o un mezclador).
- Suma de varias conexiones 4G con servidor propio (Moblin/IRL Pro con SRTLA).
- Venta de entradas pagadas a la transmisión (eventos virtuales públicos tipo Joinnus Live).

## Requisitos

Formato: *Cuando [condición], el sistema debe [comportamiento].*

### R1 — Activar la transmisión

- **R1.1** Solo las tiendas con `tipoNegocio = 'eventos'` ven la opción **"Transmitir"**, y solo el rol `editor` o superior puede activarla.
- **R1.2** La transmisión se activa sobre una función (`evento_funciones`) con `inicio` y `fin`. Si `fin` es nulo, el admin debe indicar la duración en horas antes de activar.
- **R1.3** En los planes Privado y Premium, si la duración supera las horas que le quedan a la tienda en su paquete, el sistema no deja activar y muestra cuántas horas faltan y cómo comprarlas.
- **R1.4** El evento de una transmisión Privada o Premium debe ser **privado**: no aparece en la cartelera ni en la búsqueda, y su página lleva `noindex`.
- **R1.5** Al activar Privado o Premium, el backend crea la transmisión en el proveedor con: reproducción **firmada**, modo de **baja latencia**, grabación según el plan y `max_continuous_duration` igual a la duración contratada más el margen.

### R2 — Plan Básico (YouTube)

- **R2.1** El admin pega el enlace del live de YouTube. El backend lo normaliza y lo valida con las mismas reglas del módulo `avisos_live`.
- **R2.2** La página del evento incrusta el reproductor de YouTube. Antes de pegarlo, la UI advierte en claro: "Cualquier persona con este enlace de YouTube podrá ver la transmisión".
- **R2.3** El plan Básico no consume horas del paquete.

### R3 — Invitaciones

- **R3.1** El admin agrega invitados uno por uno o pegando una lista (un nombre por línea, con teléfono opcional).
- **R3.2** Cada invitación genera un token firmado. El enlace (`/t/{token}`) solo funciona desde que se abre la sala de espera (por ejemplo 1 h antes del `inicio`) hasta que vence la grabación.
- **R3.3** El número de invitaciones no puede superar el tope de espectadores del plan.
- **R3.4** El admin puede **anular** una invitación (el enlace deja de funcionar) y **reenviarla**.
- **R3.5** "Enviar por WhatsApp" abre `wa.me` con un mensaje ya escrito, por ejemplo: *"Hola tía Rosa, te invitamos a ver en vivo el cumpleaños de Mateo el sábado 18 a las 4:00 p. m. Entra aquí: {enlace}"*.

### R4 — Página del invitado (storefront)

- **R4.1** Antes de la hora: muestra el nombre del evento, la fecha y la hora **en la zona horaria del invitado**, una cuenta regresiva y el mensaje "La transmisión empieza pronto".
- **R4.2** A la hora: el backend entrega una **URL de reproducción firmada de corta duración** y la página muestra el reproductor. No se pide cuenta ni instalar nada.
- **R4.3** Una sola sesión activa por invitación. Si el mismo enlace se abre en otro dispositivo, la sesión anterior se cierra con el mensaje: "Este enlace se abrió en otro dispositivo".
- **R4.4** Si la transmisión se corta (señal del local), la página muestra "Estamos reconectando…" y vuelve sola, sin recargar.
- **R4.5** Al terminar: si hay grabación, muestra el reproductor con la grabación y hasta qué fecha estará disponible. Si no, muestra "La transmisión terminó. ¡Gracias por acompañarnos!".
- **R4.6** Todos los textos están en **español claro**, con letra grande y botones grandes, pensados para el celular.

### R5 — Transmitir (quien graba)

- **R5.1** El admin muestra los datos de conexión (URL RTMPS, clave de transmisión y enlace SRT) **solo** al rol `editor` o superior. La clave está oculta por defecto y se puede copiar.
- **R5.2** Si se confirma que funciona con Mux, el admin muestra un **QR** que configura Larix Broadcaster de un escaneo.
- **R5.3** El admin incluye una **guía de equipo y configuración** (ver [Guía de equipo](#guía-de-equipo-para-el-admin)).
- **R5.4** **Transmisión de prueba:** un botón crea una transmisión temporal de 10 minutos, sin grabación y sin consumir horas, para comprobar la señal y la calidad en el local.
- **R5.5** El admin regenera la clave de transmisión si se filtró.

### R6 — Durante la transmisión (admin)

- **R6.1** El admin ve el estado (**Esperando señal / En vivo / Reconectando / Terminada**), el tiempo transcurrido, el tiempo restante y cuántos invitados están conectados.
- **R6.2** El estado se actualiza solo (webhooks del proveedor → backend → Supabase Realtime, como en `avisos_live`).
- **R6.3** El admin puede **terminar** la transmisión antes de tiempo. Lo no usado vuelve al paquete (redondeado al minuto).

### R7 — Paquete de horas

- **R7.1** El consumo se mide desde que el proveedor avisa que la transmisión está activa hasta que avisa que terminó, y se suma a `tienda_uso_recursos` con `recurso = 'transmision_minutos'`.
- **R7.2** Al 80 % del tiempo contratado, el admin recibe un aviso en pantalla y por correo.
- **R7.3** Al agotarse el tiempo contratado más un margen de 15 minutos, la transmisión se corta sola (`max_continuous_duration` del proveedor, con respaldo del backend).
- **R7.4** Las transmisiones de prueba no consumen horas.

### R8 — Grabación y extras (Premium)

- **R8.1** La grabación queda disponible para los invitados con el mismo enlace durante N días (configurable por plan). Al vencer, se borra del proveedor.
- **R8.2** Premium: la tienda configura hasta 2 destinos de retransmisión (Facebook y YouTube) con su URL y clave. La UI avisa que en esas plataformas no hay control de acceso.
- **R8.3** Premium: al quedar lista la grabación, se generan el resumen, los capítulos y los momentos clave (Mux Robots). El anfitrión recibe un correo con el resumen y el enlace.

### R9 — Privacidad y legal

- **R9.1** No se puede activar una transmisión sin registrar el **consentimiento del anfitrión** (Ley 29733, protección de datos personales). Esto es más importante aún cuando aparecen menores de edad.
- **R9.2** La página del invitado, la grabación y los enlaces nunca son públicos ni indexables (salvo el plan Básico, donde la UI lo advierte; ver R2.2).
- **R9.3** La grabación se borra al vencer su plazo, y el anfitrión puede pedir que se borre antes.
- **R9.4** Las claves de transmisión y de retransmisión se guardan **cifradas** (como la llave secreta de la pasarela de pagos).

### R10 — Multi-tenant y seguridad

- **R10.1** Una sola cuenta de Mux de la plataforma. Cada transmisión guarda el `tiendaId` en sus metadatos, y todas las consultas filtran por `tiendaId`.
- **R10.2** Los webhooks del proveedor se verifican con su firma y se procesan de forma idempotente (como `pago_eventos`).
- **R10.3** El costo real por tienda (encoding, entrega, retransmisión) se registra para compararlo con lo cobrado, como ya se hace con los tokens de IA.

## Modelo de datos (borrador)

Se detalla en `plan.md`. Lo mínimo:

```
evento_transmisiones          -- una por función
  id, tiendaId, funcionId (único), plan (basico | privado | premium)
  estado (programada | esperando_senal | en_vivo | reconectando | terminada | cancelada)
  proveedor (youtube | mux), proveedorStreamId, playbackId, claveCifrada
  youtubeUrl                  -- solo Básico
  duracionContratadaMin, minutosUsados, maxEspectadores
  grabar, grabacionAssetId, grabacionVenceEn
  retransmisiones (JSON cifrado: destinos de Facebook y YouTube)
  consentimientoEn, consentimientoPor
  + auditoría

evento_invitaciones
  id, tiendaId, transmisionId, nombre, telefono?
  token (único), estado (activa | anulada), ultimaConexionEn, sesionActivaId
  + auditoría

planes (+ campos nuevos)
  horasTransmisionMes, maxEspectadoresTransmision, diasGrabacion

tienda_uso_recursos
  recurso = 'transmision_minutos'
```

Variables de entorno nuevas: `STREAMING_DRIVER=mux`, `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_SIGNING_KEY_ID`, `MUX_SIGNING_PRIVATE_KEY`, `MUX_WEBHOOK_SECRET`.

## Guía de equipo (para el admin)

Va dentro del admin, en español claro. Mux recibe video por **RTMPS** y **SRT**.

### Con celular (lo más común)

- **App recomendada:** **Larix Broadcaster** (iOS y Android, gratis, RTMPS y SRT). Una alternativa más fácil es **PRISM Live Studio**.
- **Celulares:** cualquier gama media-alta de los últimos 3 años con estabilización óptica. Por ejemplo: iPhone 13 o más nuevo, Samsung Galaxy S23 o más nuevo, Galaxy A55/A56, Google Pixel 7 o más nuevo.
- **Lo que más mejora la transmisión (más que el celular):**
  1. **Micrófono inalámbrico** (DJI Mic, Rode Wireless GO, Hollyland Lark M2). El audio es la queja número uno.
  2. **Trípode o estabilizador** (DJI Osmo Mobile).
  3. **Batería externa PD de 20 W o más**, conectada todo el tiempo.
  4. Modo **"No molestar"**: una llamada entrante corta la transmisión.
- **Configuración:** 1080p a 30 fps con 4–5 Mbps, o 720p a 30 fps con 2.5–3 Mbps si la señal es débil. Keyframe cada 2 s, audio AAC a 128 kbps. Usar SRT si la red es inestable.
- **Internet:** una subida estable del doble del bitrate (unos 8 Mbps para 1080p). Siempre hacer la transmisión de prueba.

### Con videógrafo y cámara profesional

- **Laptop con OBS Studio** (gratis) y una capturadora HDMI (Elgato Cam Link 4K o similar). Permite poner el nombre del cumpleañero y el **logo de la tienda**.
- **Sin laptop:** YoloBox Mini (pantalla, gráficos, 4G o WiFi).
- **Varias cámaras:** Blackmagic ATEM Mini Pro.
- **Mala señal en el local:** cable de red si el local lo tiene, un router 4G/5G propio de respaldo o, para profesionales, LiveU Solo.

## Competencia

| Producto | Precio | Qué tiene | Qué no tiene y nosotros sí |
|---|---|---|---|
| YouTube Live "no listado" | $0 | Gratis y sin límite | Privacidad, marca propia, integración con el evento. Lo usamos en el plan Básico |
| Facebook Live (grupo privado) | $0 | Gratis | Simplicidad: cada familiar necesita cuenta |
| Google Meet / Zoom gratis | $0 | Videollamada | Se cortan a los 60 / 40 min |
| **EventLive** (competidor directo) | $30–59 por evento | Transmitir desde el celular, un enlace privado, espectadores ilimitados | Español, soles y Yape, integración con el evento, enlace por invitado, reventa con la marca de la tienda |
| OneRoom (funerales) | $50–125 por servicio (B2B) | Contraseña, grabación | Solo funerales; el invitado necesita su app |
| Vimeo | Desde ≈ $70 al mes | 1080p, contraseña | Suscripción fija; no conviene para pocos eventos al mes |
| Joinnus Live (Perú) | Comisión por entrada | Eventos virtuales con entrada pagada | Apunta a eventos públicos, no a eventos familiares privados |

## Métricas de éxito

- % de tiendas de eventos que activan al menos una transmisión al mes.
- % de invitados que abren su enlace y ven al menos 5 minutos.
- Cortes por evento (meta: 0 cortes de más de 30 s en el 90 % de los eventos).
- Margen por evento: lo cobrado a la tienda menos el costo real del proveedor.
- Ventas de los planes Premium sobre el total.

## Riesgos y notas

- **Conexión del local:** es el riesgo más grande y no depende de nosotros. Se mitiga con la transmisión de prueba, la guía de equipo y el plan B de un router 4G/5G.
- **Enlace filtrado:** sin tope ni sesión única, un enlace reenviado multiplica el costo. R3.3 y R4.3 lo controlan.
- **Menores de edad:** consentimiento obligatorio (R9.1) y grabación con vencimiento (R9.3).
- **Webhooks y cortes:** el corte automático depende del proveedor (`max_continuous_duration`). El backend debe tener un respaldo por si se pierde un webhook. El módulo `avisos_live` se diseñó sin jobs en segundo plano; esta funcionalidad **sí necesita uno**.
- **Entradas emitidas:** la tabla `entradas` (con `qr_token`) de `verticales-reserva/eventos.md` no está construida. Las invitaciones reutilizan su idea de token firmado, pero no dependen de ella.
- **El esquema se aplica a mano** (`db push` o SQL en `docs/sql/`), como en las demás specs. Hay que sincronizar `schema.prisma` con la base real.

## Por verificar

Estos datos salen de búsquedas en la web; las páginas oficiales de Mux y Cloudflare no se pudieron abrir desde el entorno de análisis. Hay que confirmarlos antes de `plan.md`.

- [ ] Si el plan Pay as you go de Mux tiene cuota mensual fija, y si el crédito de $20 al mes sigue vigente.
- [ ] Precio del encoding en vivo de Mux ($0.032/min) y de la retransmisión ($0.02/min por destino).
- [ ] Que la retransmisión de Cloudflare no tenga cobro adicional (solo importa si se cambia de proveedor).
- [ ] Nombres exactos en la API de Mux: `max_continuous_duration`, `latency_mode`, `reconnect_window`, webhooks de transmisión activa, inactiva y grabación lista.
- [ ] Que el QR de configuración de Larix ("Grove") funcione con los datos de Mux.
- [ ] Que YouTube permita incrustar un live "no listado" marcado "para niños", y qué requisitos pone hoy para transmitir desde una app (verificación del canal, mínimo de suscriptores).
- [ ] Calidad y retraso reales desde Perú: prueba de 30 minutos con Mux antes de construir.

## Preguntas abiertas

1. **Cobro:** ¿horas de transmisión con tope de espectadores (propuesta) o minutos vistos?
2. **Paquete:** ¿las horas vienen en el plan mensual de la tienda, en paquetes prepagados o en ambos?
3. **Al agotarse:** ¿se corta (propuesta, con 15 min de margen) o se cobra un excedente?
4. **Tope de espectadores** por plan: ¿cuántos en Privado y cuántos en Premium?
5. **Grabación:** ¿cuántos días se guarda por plan? ¿El anfitrión puede descargarla?
6. **Invitaciones:** ¿siempre nominativas (propuesta: nombre obligatorio, para ver quién se conectó) o también un enlace "comodín" para grupos familiares?
7. **Precio de referencia** de cada plan para la tienda y precio sugerido para su cliente.

## Fuentes

- Mux: [precios (VSLBench)](https://vslbench.com/reviews/mux/pricing), [plan gratis](https://www.mux.com/docs/changelog/video-free-plan), [Pay as you go](https://www.mux.com/docs/changelog/payg-plan-improvements-may-2025), [max_continuous_duration](https://www.mux.com/docs/changelog/set-duration-live-stream-event), [FAQ de live](https://www.mux.com/docs/guides/live-streaming-faqs), [retransmisión](https://www.mux.com/docs/guides/stream-live-to-3rd-party-platforms.md), [Mux Robots](https://www.mux.com/docs/guides/robots).
- Cloudflare Stream: [precios](https://developers.cloudflare.com/stream/pricing/index.md), [retransmisión](https://developers.cloudflare.com/stream/stream-live/simulcasting).
- Competencia: [EventLive](https://www.eventlive.pro/pricing), [OneRoom](https://www.oneroomstreaming.com/pricing), [Vimeo](https://subger.com/pt/service/vimeo-livestream), [costos de wedding livestream 2026](https://www.weddinglivestreaming.com/guides/wedding-live-streaming-cost-by-state), [Joinnus](https://www.cbinsights.com/company/joinnus).
- Herramientas gratis: [límite de Google Meet](https://www.avnation.tv/2025/11/04/understanding-the-google-meet-time-limit/), [precios de Zoom](https://tldv.io/blog/zoom-pricing/), [YouTube: chat y "para niños"](https://support.google.com/youtube/answer/2524549).
- Equipo: [Moblin vs IRL Pro vs Larix](https://stream-relay.de/en/guides/mobile-streaming-apps/), [apps de live para iPhone 2026](https://www.dacast.com/blog/live-streaming-apps-for-iphone/), [YoloBox Mini](https://www.productiongear.co.uk/yololiv-yolobox-mini.html).
