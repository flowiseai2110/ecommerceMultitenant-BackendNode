# Spec: Transmisión en vivo de eventos privados

> Estado: **plan por fases aprobado** (2026-10-06). Cobro, paquetes, excedente, grabación y proveedor (**Cloudflare Stream**) ya decididos. Rentabilidad simulada en [simulacion.md](simulacion.md), con costos de Mux: hay que recalcularla con Cloudflare en la Fase 0. Sin implementar.
> Diseño técnico y fases: [plan.md](plan.md). Las [preguntas abiertas](#preguntas-abiertas) se deciden en la fase que las necesita.
> Repos involucrados: BackendNode, FrontendAdmin, FrontendStore y **App Transmitir** (proyecto aparte, Android; ver [App Transmitir](#app-transmitir-proyecto-aparte)).
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
| **Grabación** | La de YouTube (en el canal del negocio) | Opcional: **30 días** en línea + descarga | Incluida: **90 días** en línea + descarga por **1 año** |
| **Retransmisión a Facebook y YouTube** | — | — | ✅ se cobra **por hora y por destino** (ver [simulación](simulacion.md)) |
| **Resumen con IA** (resumen, momentos clave, capítulos) | — | — | ✅ |
| **Costo para la plataforma** (3 h, 40 invitados) | **$0** | **≈ $6** | **≈ $13 + IA** |
| **Consume horas del paquete** | No | Sí | Sí |

**Referencia de precio:** EventLive cobra entre $30 y $59 por evento con espectadores ilimitados. El plan Privado puede ir algo por debajo y aún dejar un buen margen. El precio final lo fija la plataforma (paquetes a la tienda) y la tienda (precio a su cliente).

## Grabación: cuánto tiempo se guarda

### Qué hacen los demás

| Servicio | En línea | Descarga |
|---|---|---|
| OneRoom (funerales) | 30 días incluidos; se puede pagar 1 año más | Pagada, hasta los 90 días |
| BoxCast (iglesias, colegios) | 90 días en todos sus planes | — |
| EventLive (bodas, cumpleaños) | 1 año | Incluida durante el año |
| Videógrafos de bodas | 90 días incluidos; acceso permanente como adicional ($15–30) | Variable |

### Cuánto cuesta guardarla (evento de 3 h a 1080p)

| Dónde | Costo |
|---|---|
| Mux (para verla en línea) | $0.54 al mes → 30 días: $0.54 · 90 días: $1.62 · 1 año: $6.48 |
| **Cloudflare R2** (archivo MP4 para descargar, ≈ 6.75 GB) | **$0.10 al mes** → 1 año: $1.22. La plataforma **ya usa R2** para imágenes |

La mayoría de las vistas de una grabación familiar ocurren en la primera semana. Guardar un año en Mux cuesta 5 veces más que en R2 y casi nadie la ve tan tarde. Lo que la familia sí quiere es **tener el archivo**.

### Decisión

| Plan | En línea (Mux) | Descarga (MP4 en R2) | Costo para la plataforma |
|---|---|---|---|
| **Básico** | La que guarde YouTube en el canal del negocio | — | $0 |
| **Privado** | **30 días** | Durante los mismos 30 días | ≈ $0.54 + $0.10 |
| **Premium** | **90 días** | **1 año** | ≈ $1.62 + $1.22 |
| **Adicional: "Guardar 1 año"** | Se mantiene el plazo del plan (no se alarga en Mux) | 1 año en R2 | ≈ $1.22 → precio sugerido S/ 50. Guardarla 1 año en Mux costaría ≈ $6.50 y deja el margen en 47 % (ver [simulación](simulacion.md)) |

Reglas:
- **"Solo en vivo":** el anfitrión puede pedir que no se grabe (como EventLive). Es la opción más privada.
- **7 días antes de borrar**, el anfitrión recibe un correo: *"La grabación del cumpleaños de Mateo se borrará el 25 de noviembre. Descárgala o extiéndela aquí."*
- Al vencer el plazo en línea, se borra de Mux. Al vencer la descarga, se borra de R2. No queda copia.

### Por qué tres planes

- **Básico** le quita a YouTube el argumento de "es gratis". Ya existe casi todo en el módulo `avisos_live` (enlace persistente a YouTube), así que su costo de desarrollo es bajo.
- **Privado** es el producto que nos diferencia y el que se vende contra EventLive.
- **Premium** junta los extras que más se venden en bodas: retransmisión a redes, grabación y un resumen.

## Proveedor de video

> **Actualización (2026-10-06): se elige Cloudflare Stream** como proveedor inicial, porque deja más margen en los eventos chicos, que son los más comunes (ver [casos.py](casos.py)). Qué cambia en cada punto: [plan.md](plan.md#qué-cambia-en-la-spec-al-usar-cloudflare-en-vez-de-mux). El análisis de abajo se mantiene como referencia.

**Propuesta original: Mux** para los planes Privado y Premium, detrás de una **interfaz de proveedor** (como `services/storage.service.js` con supabase/r2 y `modules/pagos/pasarela/payment-provider.js`). Así se puede cambiar a Cloudflare Stream u otro si el volumen o el precio lo justifican.

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

## Modelo de cobro

### Decisión: horas de transmisión con un tope de invitados

Se descartan las otras dos formas de cobrar:

| Forma de cobrar | Problema |
|---|---|
| **Minutos vistos** (como cobra Mux) | Nadie entiende "7,200 minutos-espectador". La tienda no sabe cuánto va a pagar hasta que termina el evento. Va contra el "español claro" |
| **Espectadores ilimitados** (como EventLive) | Un enlace que se filtra multiplica el costo, y lo absorbe la plataforma |
| ✅ **Horas con tope de invitados** | Se entiende ("3 horas para 50 invitados"), el costo máximo se conoce antes de empezar y el tope sale solo, porque **cada invitación es una sesión** (R3.3 y R4.3) |

**La unidad es "1 hora para hasta 50 invitados".** Con más invitados, cada hora descuenta más del paquete, en proporción a lo que cuesta:

| Invitados | Costo por hora para la plataforma (peor caso\*) | Costo típico\*\* | Cada hora de evento descuenta |
|---|---|---|---|
| Hasta 25 | $3.42 | $2.82 | 0.7 h |
| **Hasta 50** | **$4.92** | **$3.72** | **1 h** |
| Hasta 100 | $7.92 | $5.52 | 1.6 h |
| Hasta 200 | $13.92 | $9.12 | 2.8 h |

\* Peor caso: todos los invitados conectados todo el tiempo a 1080p y sin minutos gratis de Mux ($0.032/min de encoding + $0.001/min por espectador).
\*\* Típico: el 60 % de los invitados conectados en promedio. Mientras la plataforma no pase de 100k minutos vistos al mes (≈ 1,667 horas-espectador), la entrega cuesta $0 y solo se paga el encoding ($1.92/h).

Antes de activar, la UI dice en claro cuánto va a descontar. Por ejemplo: *"Este evento de 3 horas para 100 invitados usará 4 h 48 min de tu paquete. Te quedan 10 h."*

### Precio sugerido a la tienda

Regla: **cada hora vendida cuesta al menos 1.3 veces el peor caso.** Así nunca se pierde dinero, aunque el evento se llene y Mux cobre todo.

| Forma de compra | Precio por hora (hasta 50 invitados) | Margen en el peor caso | Margen típico |
|---|---|---|---|
| **Incluida en el plan mensual** | $8 (va dentro del precio del plan) | 38 % | 53 % (y 76 % mientras dure la capa gratis) |
| **Paquete prepagado de 10 h** | $7.20 ($72 el paquete) | 32 % | 48 % |
| **Paquete prepagado de 25 h** | $6.60 ($165 el paquete) | 25 % | 44 % |
| **Excedente** (durante el evento) | $10, en bloques de 30 min | 51 % | 63 % |

> El paquete de 25 h es el piso: $6.60 apenas supera la regla (1.3 × $4.92 = $6.40). No se debe bajar más.

Como referencia, un evento de 3 h para 50 invitados le cuesta a la tienda **$24** con las horas de su plan. La tienda lo puede revender a su cliente por $40–60, que es el rango de EventLive.

### ¿Plan mensual, prepago o ambos? Ambos, y los dos son rentables

| | Horas en el plan mensual | Paquetes prepagados |
|---|---|---|
| **Por qué es rentable** | El ingreso es fijo cada mes y el costo solo aparece si se transmite. Las horas que no se usan son ganancia | El dinero entra antes de que exista el costo. No hay riesgo de cobro |
| **El riesgo** | Una tienda que usa todas sus horas todos los meses | Que Mux suba sus precios mientras el paquete sigue vigente |
| **Cómo se controla** | Pocas horas incluidas (propuesta: 3 h al mes, un evento) y **no se acumulan** de un mes a otro | Vencen a los **12 meses** |

**Orden de consumo:** primero las horas del plan del mes (porque vencen antes), luego las del paquete prepagado (la más antigua primero) y al final el excedente.

> Mux tiene costos fijos que no dependen de las ventas (cuota del plan, si la hay). Ver [Por verificar](#por-verificar).

### Excedente: se confirma con la tienda, nunca se cobra solo

La regla es **avisar con tiempo y no cobrar nada sin confirmación**.

1. **Al activar**, la tienda puede marcar *"Si hace falta, extender automáticamente hasta 1 hora"*. Es útil porque quien graba está ocupado durante el evento.
2. **Cuando quedan 15 minutos**, el sistema avisa en la pantalla del admin y por WhatsApp, push o correo al dueño de la cuenta y al contacto de la transmisión. El aviso dice: *"Te quedan 15 minutos de transmisión. ¿Quieres extender?"*, con los botones **Extender 30 min ($5)**, **Extender 1 hora ($10)** y **Terminar a la hora**.
3. **Al confirmar**, si hay horas en el paquete se descuentan de ahí (sin cobro). Si no hay, se registra como excedente.
4. **Si nadie responde**, a los 5 minutos de acabarse el tiempo la transmisión se corta y los invitados ven: *"La transmisión terminó. ¡Gracias por acompañarnos!"*.

**Cómo se cobra el excedente:** no da tiempo de verificar un Yape en medio del evento. Por eso el excedente se suma como **cargo a la cuenta de la tienda** y se cobra con su siguiente pago, con un tope por tienda (propuesta: 2 h).

> **Ojo con el "No molestar":** la guía recomienda activarlo en el celular que transmite, así que ese celular **no** recibe el aviso. Por eso el aviso va al dueño de la cuenta y a un **contacto de la transmisión** (otro celular). Los dos se configuran al activar.

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
4. **Cuando quedan 15 minutos**, el dueño de la cuenta y el contacto de la transmisión reciben un aviso para **extender** (con el precio a la vista) o terminar a la hora. Si nadie confirma, la transmisión se corta 5 minutos después de acabarse el tiempo. Nunca se cobra un excedente sin confirmación.

### Después

1. Si hay grabación, los invitados la ven con el mismo enlace (30 días en Privado, 90 en Premium) y el anfitrión puede descargar el MP4. Antes de borrarla, se le avisa.
2. En el plan Premium, la IA genera un resumen, los momentos clave y los capítulos. El anfitrión recibe un correo con el enlace a la grabación.

## Alcance

**Incluye**
- Activar la transmisión en una función de un evento privado, con uno de los tres planes.
- Invitaciones con un enlace único por invitado, para copiar o enviar por WhatsApp.
- Página del invitado en el storefront: sala de espera, reproductor y grabación.
- Datos de conexión para RTMPS y SRT, con un QR para la app de transmisión (si se confirma que funciona).
- Transmisión de prueba.
- Paquete de horas (plan mensual y prepagado): consumo, aviso a los 15 minutos del final, extensión confirmada y corte.
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
- **R1.3** En los planes Privado y Premium, si las horas que descuenta el evento (duración × factor de invitados) superan las que le quedan a la tienda, el sistema no deja activar y muestra cuántas horas faltan y cómo comprar un paquete.
- **R1.4** El evento de una transmisión Privada o Premium debe ser **privado**: no aparece en la cartelera ni en la búsqueda, y su página lleva `noindex`.
- **R1.5** Al activar Privado o Premium, el backend crea la transmisión en el proveedor con: reproducción **firmada**, modo de **baja latencia**, grabación según el plan y `max_continuous_duration` como respaldo del corte (ver R7.8).

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
- **R5.2** El admin muestra un **QR para vincular la App Transmitir** (ver R11.1). Reemplaza al QR de Larix que se había propuesto.
- **R5.3** El admin incluye una **guía de equipo y configuración** (ver [Guía de equipo](#guía-de-equipo-para-el-admin)).
- **R5.4** **Transmisión de prueba:** un botón crea una transmisión temporal de 10 minutos, sin grabación y sin consumir horas, para comprobar la señal y la calidad en el local.
- **R5.5** El admin regenera la clave de transmisión si se filtró.

### R6 — Durante la transmisión (admin)

- **R6.1** El admin ve el estado (**Esperando señal / En vivo / Reconectando / Terminada**), el tiempo transcurrido, el tiempo restante y cuántos invitados están conectados.
- **R6.2** El estado se actualiza solo (webhooks del proveedor → backend → Supabase Realtime, como en `avisos_live`).
- **R6.3** El admin puede **terminar** la transmisión antes de tiempo. Lo no usado vuelve al paquete (redondeado al minuto).

### R7 — Paquete de horas y excedente

Ver [Modelo de cobro](#modelo-de-cobro).

- **R7.1** El consumo se mide desde que el proveedor avisa que la transmisión está activa hasta que avisa que terminó, multiplicado por el factor del tope de invitados (0.7 / 1 / 1.6 / 2.8). Se registra en `tienda_uso_recursos` con `recurso = 'transmision_minutos'`.
- **R7.2** Antes de activar, la UI muestra cuántas horas va a descontar el evento y cuántas le quedan a la tienda.
- **R7.3** Las horas se consumen en este orden: plan del mes → paquete prepagado (el más antiguo primero) → excedente.
- **R7.4** Las horas del plan mensual no se acumulan de un mes a otro. Los paquetes prepagados vencen a los 12 meses.
- **R7.5** **Cuando quedan 15 minutos**, el sistema avisa en el admin y por WhatsApp, push o correo al dueño de la cuenta y al contacto de la transmisión, con las opciones **Extender 30 min**, **Extender 1 hora** y **Terminar a la hora**, mostrando el precio de cada una.
- **R7.6** **Nunca se cobra un excedente sin confirmación**: o la tienda marcó la extensión automática al activar (con su tope), o la confirmó en el aviso.
- **R7.7** Si la tienda tiene horas en un paquete, la extensión se descuenta de ahí. Si no, se registra como excedente en la cuenta de la tienda, hasta un tope por tienda.
- **R7.8** Si nadie confirma, la transmisión se corta 5 minutos después de acabarse el tiempo. El corte lo hace el backend desactivando la transmisión en el proveedor; `max_continuous_duration` queda como respaldo con el tiempo máximo posible (contratado + extensión automática + 5 min).
- **R7.9** Las transmisiones de prueba no consumen horas.

### R8 — Grabación y extras (Premium)

- **R8.1** La grabación queda disponible para los invitados con el mismo enlace: **30 días** en Privado y **90 días** en Premium (ver [Grabación](#grabación-cuánto-tiempo-se-guarda)). Al vencer, se borra del proveedor.
- **R8.1.1** Al quedar lista la grabación, se copia el MP4 a un bucket **privado** de R2. El anfitrión lo descarga con un enlace firmado durante 30 días (Privado) o 1 año (Premium). Al vencer, se borra.
- **R8.1.2** 7 días antes de cada borrado, el anfitrión recibe un correo con el enlace de descarga y la opción de comprar "Guardar 1 año".
- **R8.1.3** Al activar, se puede elegir **"Solo en vivo"** (sin grabación) en cualquier plan.
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
  factorInvitados, extensionAutoMaxMin, contactoTelefono   -- aviso de los 15 minutos
  grabar, grabacionAssetId, grabacionVenceEn, descargaKeyR2, descargaVenceEn
  retransmisiones (JSON cifrado: destinos de Facebook y YouTube)
  consentimientoEn, consentimientoPor
  + auditoría

evento_invitaciones
  id, tiendaId, transmisionId, nombre, telefono?
  token (único), estado (activa | anulada), ultimaConexionEn, sesionActivaId
  + auditoría

planes (+ campos nuevos)
  horasTransmisionMes          -- no se acumulan

transmision_paquetes           -- prepago
  id, tiendaId, horas, horasUsadas, precio, compradoEn, venceEn (+12 meses)

transmision_excedentes         -- cargos confirmados a la cuenta de la tienda
  id, tiendaId, transmisionId, minutos, monto, confirmadoPor, confirmadoEn, cobradoEn

tienda_uso_recursos
  recurso = 'transmision_minutos'
```

Variables de entorno nuevas: `STREAMING_DRIVER=cloudflare`, `CF_STREAM_ACCOUNT_ID`, `CF_STREAM_API_TOKEN`, `CF_STREAM_SIGNING_KEY_ID`, `CF_STREAM_SIGNING_KEY_JWK`, `CF_STREAM_WEBHOOK_SECRET`, `CF_NOTIFICATIONS_SECRET` (ver [plan.md](plan.md)). Con `STREAMING_DRIVER=mux` se usarían las variables `MUX_*`.

## Guía de equipo (para el admin)

Va dentro del admin, en español claro. Mux recibe video por **RTMPS** y **SRT**.

### Con celular (lo más común)

- **App:** **Larix Broadcaster** (iOS y Android, RTMPS y SRT) **no es gratis para eventos reales**. La versión gratis transmite 30 min limpios, luego 30 min con un aviso encima, y después se corta. Larix Premium cuesta $9.99 al mes o $119 al año, y lo paga la tienda (verificado el 2026-10-06). Alternativas gratis por probar en la Fase 0: **PRISM Live Studio** y **IRL Pro** (Android). En una laptop, **OBS Studio** es gratis y sin límite. Ver [fase0.md](fase0.md).
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

## App Transmitir (proyecto aparte)

> Decidido el 2026-10-06. Se desarrolla **en otro repositorio**, en **3 semanas**, empezando ahora. Mientras tanto, las pruebas funcionales y el circuito completo del ecommerce se hacen con **Larix Broadcaster** (versión gratis, 30 min por transmisión).

### Por qué

- Larix no es gratis para eventos reales: corta a los 60 min (los últimos 30 con un aviso encima) y Premium cuesta $9.99 al mes.
- Copiar la URL y la clave a mano es justo el paso donde se equivoca alguien que no es técnico.
- Una app propia tiene la marca de la plataforma, pone el logo de la tienda encima del video y muestra el tiempo del paquete y los invitados conectados.

### Tecnología

- **Android primero**, en **Kotlin nativo** con [RootEncoder](https://github.com/pedroSG94/RootEncoder) (Apache 2.0): RTMPS, SRT, cambio de bitrate en vivo y logos encima del video.
- **iOS después**, con [HaishinKit](https://github.com/HaishinKit/HaishinKit.swift) (BSD-3). Mientras tanto, en iPhone se usa Larix Premium o Moblin.
- Distribución: APK directo para el piloto; luego Google Play ($25 una sola vez).

### Requisitos (R11)

- **R11.1 Vincular por QR:** en el admin, el botón **"Transmitir con este celular"** muestra un QR con un **código de vinculación** de un solo uso, que vence a los 10 minutos. La app lo escanea y el backend le entrega los datos de conexión de **esa** transmisión. La clave nunca se muestra ni se copia.
- **R11.2 Una sola pantalla:** la cámara, un botón grande **Empezar / Terminar**, el estado (Conectando / En vivo / Reconectando), el tiempo transcurrido, el tiempo restante del paquete y los invitados conectados.
- **R11.3 Configuración automática:** 1080p a 30 fps y 4.5 Mbps, keyframe cada 2 s, AAC a 128 kbps. Baja sola a 720p si la señal es débil. No hay pantalla de ajustes técnicos.
- **R11.4 No cortarse:**
  - sigue transmitiendo con la pantalla bloqueada (servicio en primer plano);
  - mantiene la pantalla encendida;
  - se reconecta sola si cambia la red (de wifi a datos) o se cae la señal.
- **R11.5 Avisos en español claro antes de empezar:** "Activa No molestar", "Conecta el cargador", "Tu señal está débil". Durante la transmisión avisa si el celular se calienta o si queda poca batería.
- **R11.6 Logo de la tienda** encima del video (opcional, lo activa la tienda).
- **R11.7 Transmisión de prueba** (R5.4) desde la misma app.
- **R11.8 Aviso de los 15 minutos:** la app muestra el aviso, pero la decisión de extender sigue en el admin y en el contacto de la transmisión (R7.5), porque el celular que transmite puede estar en No molestar.
- **R11.9** La app **no guarda** la clave al terminar. Para volver a transmitir se vincula otra vez.

### Contrato con el backend

Lo construye el backend en la Fase 2 ([plan.md](plan.md)). Las rutas son una propuesta y se ajustan al implementar:

| Endpoint | Quién lo llama | Qué hace |
|---|---|---|
| `POST /admin/transmisiones/:id/vinculaciones` | Admin (rol `editor` o superior) | Crea el código de vinculación (un solo uso, 10 min) y devuelve el contenido del QR |
| `POST /app-transmitir/vincular` | App, con el código del QR | Canjea el código. Devuelve `transmisionId`, el nombre del evento, la URL RTMPS, la clave, los datos SRT, el logo de la tienda y un **token de sesión de la app** que vale hasta el fin de la ventana de la función |
| `GET /app-transmitir/estado` | App (token de sesión) | Estado, tiempo restante e invitados conectados, consultado cada 15–30 s |
| `POST /app-transmitir/terminar` | App (token de sesión) | Termina la transmisión (igual que R6.3) |

- El código de vinculación se guarda **hasheado**.
- Si se regenera la clave (R5.5), las sesiones de app de esa transmisión quedan anuladas.

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

Estos datos salen de búsquedas en la web; las páginas oficiales de Mux y Cloudflare no se pudieron abrir desde el entorno de análisis. Los que tienen que ver con Mux quedan en segundo plano; los de Cloudflare están en la Fase 0 de [plan.md](plan.md#fase-0-verificación-técnica-sin-código-de-producción).

- [ ] Si el plan Pay as you go de Mux tiene cuota mensual fija, y si el crédito de $20 al mes sigue vigente.
- [ ] Precio del encoding en vivo de Mux ($0.032/min) y de la retransmisión ($0.02/min por destino).
- [ ] Que la retransmisión de Cloudflare no tenga cobro adicional (solo importa si se cambia de proveedor).
- [ ] Nombres exactos en la API de Mux: `max_continuous_duration`, `latency_mode`, `reconnect_window`, webhooks de transmisión activa, inactiva y grabación lista.
- [ ] Que el QR de configuración de Larix ("Grove") funcione con los datos de Mux.
- [ ] Que YouTube permita incrustar un live "no listado" marcado "para niños", y qué requisitos pone hoy para transmitir desde una app (verificación del canal, mínimo de suscriptores).
- [ ] Calidad y retraso reales desde Perú: prueba de 30 minutos con Mux antes de construir.
- [ ] Que el backend pueda **desactivar** una transmisión de Mux en curso (para el corte de R7.8) y si `max_continuous_duration` se puede cambiar durante la transmisión.
- [ ] Cómo y a qué costo genera Mux el MP4 descargable de la grabación (para copiarlo a R2).
- [ ] Cómo se cobra hoy a las tiendas: si existe un cobro recurrente donde sumar el excedente, o si hay que construirlo.

## Decisiones tomadas (2026-10-06)

1. **Cobro:** horas de transmisión con tope de invitados. La unidad es "1 hora para hasta 50 invitados", con factores de 0.7 / 1 / 1.6 / 2.8 según el tope (ver [Modelo de cobro](#modelo-de-cobro)).
2. **Paquete:** **ambos**, horas en el plan mensual (no se acumulan) y paquetes prepagados (vencen a los 12 meses). Los dos son rentables con la regla de 1.3× el peor caso.
3. **Al agotarse:** aviso **cuando quedan 15 minutos**. El excedente **siempre se confirma** con la tienda (o lo autorizó al activar con un tope). Sin confirmación, se corta 5 minutos después.
4. **Grabación:** Privado 30 días en línea + descarga; Premium 90 días en línea + descarga por 1 año; adicional "Guardar 1 año"; opción "Solo en vivo". Los plazos en línea se revisan en la Fase 0, porque guardar en Cloudflare cuesta más que en Mux.
5. **Proveedor inicial: Cloudflare Stream** (no Mux). No cobra encoding y deja entre 71 y 79 % de margen en los eventos chicos. Los factores de invitados (0.7 / 1 / 1.6 / 2.8) y los precios se recalculan con sus costos ([plan.md](plan.md#factores-de-invitados-hay-que-recalcularlos)).
6. **Cobro de paquetes y excedente: manual** al inicio (Yape o transferencia a la plataforma, alta por script). El cobro automático a las tiendas queda para después.
7. **Preguntas abiertas:** se deciden al llegar a la fase que las necesita ([plan.md](plan.md#decisiones-pendientes-por-fase)).
8. **App propia para transmitir:** [App Transmitir](#app-transmitir-proyecto-aparte), Android en Kotlin con RootEncoder, en otro repositorio y en 3 semanas desde ahora. Larix (versión gratis) solo para las pruebas mientras tanto.
9. **Invitaciones solo nominativas** (pregunta abierta 1, decidida el 2026-10-06 al empezar la Fase 1): un enlace por invitado con nombre obligatorio. No hay enlace comodín.
10. **Horas incluidas y factores** (pregunta abierta 3, decidida el 2026-10-06 al empezar la Fase 2): Free 0 h, Starter 0 h, Pro 3 h y Business 6 h al mes. Factores 0.5 / 1 / 2 / 4 para 25 / 50 / 100 / 200 invitados (proporcionales al costo de Cloudflare).
11. **Paquetes y excedente** (preguntas abiertas 2 y 4, decididas el 2026-10-06 al empezar la Fase 3): paquetes prepagados de 10 h por S/ 250 y de 25 h por S/ 550, que vencen a los 12 meses. Excedente a S/ 20 por cada 30 min de paquete (minutos × factor), con tope de 2 h por tienda al mes; se cobra a mano con el siguiente pago.
12. **Grabación** (decidida el 2026-10-07 al empezar la Fase 4): en Privado está incluida y activada por defecto (30 días para ver y descargar). "Guardar 1 año" cuesta S/ 50, como cargo manual a la tienda. El MP4 se copia a R2 privado solo en ese caso.

## Preguntas abiertas

> Se deciden en la fase que las necesita: la 1 al inicio de la Fase 1, la 3 al inicio de la Fase 2, y la 2 y la 4 al inicio de la Fase 3 ([plan.md](plan.md#decisiones-pendientes-por-fase)).

1. ~~**Invitaciones:** ¿siempre nominativas o también un enlace "comodín"?~~ **Decidido: solo nominativas** (decisión 9).
2. ~~**Precios finales en soles**~~ **Decidido: paquetes de 10 h por S/ 250 y de 25 h por S/ 550** (decisión 11). Los planes mensuales no cambian de precio.
3. ~~**Horas incluidas** en cada plan mensual~~ **Decidido: Free 0, Starter 0, Pro 3 h, Business 6 h** (decisión 10).
4. ~~**Tope de excedente**~~ **Decidido: S/ 20 por 30 min, tope de 2 h por tienda al mes, cobro manual con el siguiente pago** (decisión 11).

## Fuentes

- Mux: [precios (VSLBench)](https://vslbench.com/reviews/mux/pricing), [plan gratis](https://www.mux.com/docs/changelog/video-free-plan), [Pay as you go](https://www.mux.com/docs/changelog/payg-plan-improvements-may-2025), [max_continuous_duration](https://www.mux.com/docs/changelog/set-duration-live-stream-event), [FAQ de live](https://www.mux.com/docs/guides/live-streaming-faqs), [retransmisión](https://www.mux.com/docs/guides/stream-live-to-3rd-party-platforms.md), [Mux Robots](https://www.mux.com/docs/guides/robots).
- Cloudflare Stream: [precios](https://developers.cloudflare.com/stream/pricing/index.md), [retransmisión](https://developers.cloudflare.com/stream/stream-live/simulcasting).
- Grabación: [EventLive, 1 año](https://help.eventlive.pro/en/articles/11592072-how-long-does-an-event-video-stay-online), [OneRoom, 30 días + extensión](https://support.oneroomstreaming.com/knowledge/how-does-revenue-sharing-work-for-extended-access-of-the-recording), [BoxCast, 90 días](https://subger.com/en/service/boxcast), [almacenamiento de Mux](https://www.budgetforge.dev/tools/mux-pricing-2026).
- Competencia: [EventLive](https://www.eventlive.pro/pricing), [OneRoom](https://www.oneroomstreaming.com/pricing), [Vimeo](https://subger.com/pt/service/vimeo-livestream), [costos de wedding livestream 2026](https://www.weddinglivestreaming.com/guides/wedding-live-streaming-cost-by-state), [Joinnus](https://www.cbinsights.com/company/joinnus).
- Herramientas gratis: [límite de Google Meet](https://www.avnation.tv/2025/11/04/understanding-the-google-meet-time-limit/), [precios de Zoom](https://tldv.io/blog/zoom-pricing/), [YouTube: chat y "para niños"](https://support.google.com/youtube/answer/2524549).
- Equipo: [Moblin vs IRL Pro vs Larix](https://stream-relay.de/en/guides/mobile-streaming-apps/), [apps de live para iPhone 2026](https://www.dacast.com/blog/live-streaming-apps-for-iphone/), [YoloBox Mini](https://www.productiongear.co.uk/yololiv-yolobox-mini.html).
