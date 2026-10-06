# Spec: Grabación de partidos para canchas sintéticas

> Estado: **exploración y propuesta** (2026-10-06). Sin implementar.
> Diseño técnico: pendiente (`plan.md`, después del piloto).
> Repos involucrados: BackendNode, FrontendAdmin, FrontendStore.
> Relacionado: [transmision-eventos](../transmision-eventos/spec.md) (usa la misma infraestructura de video) y [mini-booking](../mini-booking/spec.md) (reservas por horas).
> Números: [simulacion.py](simulacion.py) (`python3 simulacion.py`).

## Oportunidad

En Lima hay cientos de canchas sintéticas. La hora cuesta **S/ 70–100** en el norte y el sur de Lima, **S/ 100–150** en el centro y hasta **S/ 160** en Surco y San Borja. Casi todas compiten solo por precio y ubicación.

Algunas ya ofrecen grabar los partidos como diferencial (por ejemplo, Canchas Matamula en Lince lo incluye en el alquiler), y existen empresas dedicadas a esto (FútbolREC en Perú; Beelup y Signal Play en Argentina). Pero **la mayoría de canchas no lo tiene**.

Lo que buscan los jugadores no es el partido entero: es **"el golazo"**. Quieren el clip de 30 segundos para mandarlo al grupo de WhatsApp o subirlo a TikTok.

**Prueba de que funciona:** Beelup empezó con ocho amigos que querían grabar sus partidos. Hoy tiene unas **5,000 cámaras en 2,500 canchas** de 17 países y factura alrededor de **US$ 1 millón al año**.

## Objetivo

Ofrecer a las canchas sintéticas un **servicio adicional llave en mano**:
- Instalamos una cámara.
- Cada partido se graba solo.
- Los jugadores marcan sus jugadas desde el celular.
- El video y los clips llegan por WhatsApp.
- La cancha gana dinero sin hacer nada.

Todo en español claro, cobrado con Yape y **conectado con las reservas** de la cancha.

## Cómo lo hace la competencia

| | Beelup (Argentina, 17 países) | FútbolREC (Perú) | Cancha con grabación propia |
|---|---|---|---|
| Equipo | Kit con 1 cámara WiFi, instalado | Cámaras en la cancha | Lo que compró la cancha |
| Cobro a la cancha | Pago inicial + cuota mensual sin contrato. En Argentina: ARS 179,000 + ARS 85,000 al mes | Por verificar | — |
| Cobro al jugador | La cancha decide: gratis o cobrado. En Argentina, ARS 3,000 por video, con Mercado Pago | Por verificar | Incluido en el alquiler |
| Jugadas | IA que **reconoce los aplausos** y arma un compilado | Por verificar | No |
| Otros modelos | Equipos en **comodato** con alquiler mensual | — | — |

## Nuestra propuesta: qué lo hace mejor

1. **Botón de jugada sin hardware.** En la cancha hay un **QR** pegado. El jugador lo escanea y aparece un botón grande: **"¡JUGADA!"**. Al tocarlo se guarda el clip de los últimos 30 segundos. No hay que instalar nada. Cloudflare lo permite sin volver a procesar el video (*live instant clipping*), y los clips **no pagan almacenamiento**.
2. **Unido a la reserva.** Si la cancha reserva con nosotros, el video queda ligado a la reserva de "Martes 8–9 p. m.". Al terminar, quien reservó recibe el enlace por **WhatsApp**. Si la cancha no usa nuestras reservas, alguien toca **"Iniciar partido"** en el admin.
3. **Clips verticales con la marca de la cancha.** Están listos para TikTok, Reels y estados de WhatsApp, y llevan el logo y el nombre de la cancha. **Cada clip compartido es publicidad gratis** para ella.
4. **Pagos locales:** Yape con Culqi en un toque, en soles y en español.
5. **Paquete para empresas y ligas:** el partido completo + las jugadas, guardado 1 mes, por **S/ 50**. Es el caso real que nos llevó a esta propuesta.
6. **La misma infraestructura sirve para transmitir.** En torneos y finales, la cancha puede **transmitir en vivo** con la tecnología de [transmision-eventos](../transmision-eventos/spec.md).

## Experiencia

### El jugador

1. Reserva la cancha (o llega).
2. En la cancha ve el cartel: *"Este partido se graba. Escanea para marcar tus jugadas"*.
3. Hace un golazo y alguien toca **¡JUGADA!** en su celular.
4. Al terminar el partido recibe por WhatsApp:
   > *"⚽ Tu partido en Cancha Los Olivos (martes 8–9 p. m.) ya está listo. Marcaron 5 jugadas. Mira los clips gratis y descarga el partido completo por S/ 15 con Yape: {enlace}"*
5. Mira los clips gratis (con la marca de la cancha) y paga si quiere el partido completo o los clips sin marca.

### La cancha

- Ve en el admin los partidos grabados del día, cuántos se vendieron y cuánto ganó.
- Elige cómo cobra: gratis para sus clientes, cobrado al jugador o incluido en el precio de la hora.
- Recibe su parte de las ventas.

## Equipo e instalación

**Una cámara panorámica (180°) por cancha, fija y alta, que ve toda la cancha.** No se necesita un camarógrafo.

### Qué debe tener la cámara para un partido (no es lo mismo que vigilar)

| Requisito | Por qué | Mínimo |
|---|---|---|
| **Ver toda la cancha** | Un gol en una esquina no puede quedar fuera | Panorámica de **180°** en el medio de la banda, o gran angular de 100°+ detrás de un arco |
| **Fluidez** | Las cámaras de seguridad graban a 15–20 cuadros por segundo y la pelota se ve "a saltos" | **25 fps o más** |
| **Color de noche** | La mayoría de partidos son de noche. El infrarrojo da imagen en blanco y negro | Lente luminoso (F1.0–F1.6) y **infrarrojo apagado**: se usan los reflectores |
| **Contraluz** | Reflectores de frente | WDR de 120 dB o más |
| **Exterior** | Lluvia, polvo, sol | IP66/IP67, alimentación PoE |
| **Micrófono** | Para la fase 3: detectar jugadas por los gritos y aplausos | Micrófono integrado |
| **Envío directo a la nube (RTMP)** | Sin RTMP hace falta un mini PC en la cancha | Deseable |

### Opciones

| Nivel | Cámara | Precio aprox. (fuera de Perú) | Cuadros por segundo | Lo bueno | Lo malo |
|---|---|---|---|---|---|
| **Piloto / económico** | **Reolink Duo 3 PoE** (2 lentes, 16 MP, 180°) | US$ 120–220 | 20 fps | La más barata con 180°; mucha resolución para hacer zoom en los clips | 20 fps; infrarrojo (de noche hay que usar los reflectores); marca con poca presencia en Perú; necesita mini PC |
| ⭐ **Recomendada** | **Dahua IPC-PFW5849-A180-E2-ASTE** (WizMind, 2 lentes, 180°) | US$ 210–330 | **25 fps** a 8 MP | Color de noche hasta 40 m, micrófono, Dahua tiene distribuidores y técnicos en Perú. Muchas Dahua de la serie 3 o superior envían RTMP directo (sin mini PC) | Hay que confirmar el RTMP en este modelo |
| Alternativa | **Hikvision DS-2CD2387G2P-LSU/SL** (ColorVu, 180°) | ≈ €275 | 20 fps | Lentes F1.0 (la mejor de noche), micrófono, IP67, Hikvision está muy presente en Perú | 20 fps; necesita mini PC |
| Deportiva con IA (no para revender) | **Veo Cam 3** | US$ 1,199–1,998 + US$ 799 al año | 60 fps en 4K | Sigue la pelota sola; la usan más de 40,000 clubes | Cara, portátil (no fija) y con **su propia plataforma**: compite con nosotros |
| Deportiva con IA (no para revender) | **Pixellot Air NXT** | ≈ US$ 949 + US$ 69–167 al mes | 30 fps | Muy buena para transmisiones | Igual que Veo: plataforma propia y suscripción |

**Recomendación:**
- **Estandarizar en un solo modelo**, la **Dahua panorámica**: 25 fps, color de noche, micrófono, posible envío directo y soporte local. Un solo modelo simplifica la instalación, la configuración remota y la garantía.
- La **Hikvision ColorVu** queda como alternativa donde el distribuidor la tenga a mejor precio.
- La **Reolink Duo 3** queda solo para el piloto o una cancha muy económica.
- Veo y Pixellot son excelentes, pero traen su propia plataforma y su suscripción, así que no sirven para nuestro modelo. Solo tienen sentido para academias que necesitan análisis táctico.

**Ubicación:** en el medio de la banda, a **5–8 m de altura** (en el poste de un reflector o un poste propio), apuntando a la cancha. En fútbol 5 basta una cámara. En fútbol 7 u 8, si la cancha es larga, se pueden poner dos gran angulares, una detrás de cada arco.

### Kit por cancha

| Pieza | Precio aproximado |
|---|---|
| Cámara panorámica Dahua o Hikvision | S/ 900–1,300 (por confirmar con distribuidores en Perú) |
| Mini PC (solo si la cámara no envía RTMP; uno sirve para varias canchas) | S/ 300–500 |
| Switch PoE + cable exterior | S/ 150–250 |
| Poste o soporte + instalación | S/ 300–600 |
| Carteles con QR | S/ 20 |
| **Total** | **≈ S/ 1,700–2,600** |

**Venderlo o prestarlo:**
- **Venta instalada:** a unos **S/ 2,500–3,200** (≈ 25–30 % de margen) y la cancha paga una cuota menor.
- **Comodato:** la plataforma lo pone y lo recupera con la cuota y su parte de las ventas en unos 4–8 meses.

En el piloto conviene probar **la Dahua y la Reolink lado a lado, de noche, en una cancha real**, antes de comprar en cantidad.

**Internet:** se necesita una **subida estable de 4–6 Mbps por cámara**. Muchas canchas no la tienen. Opciones:
- Contratar fibra con buena subida.
- **Modo local:** el mini PC graba todo y **solo sube a la nube los partidos vendidos y los clips**. Así se necesita mucho menos internet y se gasta menos en almacenamiento.

**Quién paga el equipo:** proponemos **comodato**. La plataforma presta el equipo con un contrato mínimo de 12 meses y lo recupera con las cuotas; es lo que hace Beelup fuera de Argentina. Otra opción es que la cancha lo compre y pague una cuota menor.

## Proveedor de video: Cloudflare Stream

Para las canchas, **Cloudflare** es mejor que Mux:
- **No cobra encoding.** Aquí se graban muchas horas que casi nadie ve, y con Mux cada hora costaría $1.92 aunque nadie la viera.
- **Clips instantáneos** gratis, sin costo de almacenamiento.
- La entrega se paga por minuto visto ($1 por cada 1,000) y el almacenamiento por minuto guardado ($5 por cada 1,000 al mes).
- El retraso de 10–20 s no importa: los videos se ven después del partido.

**Regla de costo:** grabar **solo en los horarios de partido**, nunca las 24 h. Los partidos que nadie compra se borran a los **3 días**; los vendidos se guardan **30 días**.

## Modelos de cobro

Simulación de una cancha con **6 partidos al día (180 al mes)**:

| % de partidos que alguien compra | Costo de nube al mes | **A) Suscripción** S/ 299 al mes | **B) Cuota S/ 99 + 50 % de ventas** (partido S/ 15, clip S/ 3) |
|---|---|---|---|
| 10 % (18 videos) | S/ 68 | Margen 77 % | Plataforma S/ 340 (margen 80 %) · cancha S/ 241 |
| 25 % (45 videos) | S/ 104 | Margen 65 % | Plataforma S/ 531 (margen 80 %) · cancha S/ 432 |
| 40 % (72 videos) | S/ 140 | Margen 53 % | Plataforma S/ 722 (margen 81 %) · cancha S/ 623 |

Supuestos: un video vendido lo ven 8 personas 15 minutos; hay 4 jugadas por partido y cada clip tiene 20 vistas en la página. Lo que se comparte descargado por WhatsApp o TikTok no le cuesta a la plataforma. Las comisiones de Yape con Culqi (2.99 % + S/ 0.30 + IGV) ya están descontadas. No incluye el equipo, el internet de la cancha ni el IGV de las cuotas.

**Paquete empresa (S/ 50 por partido, 1 mes):** costo de nube ≈ S/ 2.40 y comisión de Yape ≈ S/ 2.10. Margen de más del 90 %.

**Recomendación: empezar con el modelo B.**
- La cuota baja (S/ 99) es fácil de aceptar para una cancha que no sabe si sus clientes van a pagar.
- La cancha gana con cada venta, así que le conviene promoverlo.
- La plataforma gana más cuanto más se use.

Con el comodato, el equipo (S/ 1,700–2,600) se recupera en unos **4–8 meses** de margen.

**El modelo A** (suscripción) sirve para la cancha que quiere regalar el video a sus clientes como diferencial, o subir S/ 10 el precio de la hora "con video".

### Precios sugeridos al jugador

| Producto | Precio | Por qué |
|---|---|---|
| Clips con la marca de la cancha | **Gratis** | Son publicidad para la cancha y gancho para comprar |
| Clip sin marca, en HD | S/ 3 | Compra por impulso |
| Partido completo + todos los clips (7 días) | S/ 15 por equipo | ≈ 10–20 % de lo que cuesta la hora de cancha, dividido entre 5–7 jugadores |
| Paquete empresa o liga (1 mes) | S/ 50 por partido | Caso real |

## Requisitos (borrador)

- **R1** Una cancha (`tipoNegocio = 'canchas'`, nuevo) registra sus campos y la cámara de cada uno.
- **R2** La grabación empieza y termina sola según las **reservas** (o con "Iniciar partido" / "Terminar partido" en el admin). Fuera de esos horarios no se graba.
- **R3** Cada cancha tiene un **QR fijo**. La página del QR identifica el partido en curso y muestra el botón **¡JUGADA!**, que crea un clip de los últimos 30 s (configurable de 15 a 60 s). Se limita a un toque cada 10 s por persona para evitar clips repetidos.
- **R4** Al terminar el partido, quien reservó recibe por WhatsApp el enlace a la página del partido, con los clips y el botón de compra.
- **R5** Los clips con la marca de la cancha son gratis. El partido completo y los clips sin marca se pagan con Yape o tarjeta (Culqi).
- **R6** Los partidos no vendidos se borran a los 3 días. Los vendidos, a los 7 días (jugador) o 30 días (paquete empresa). Antes del borrado se avisa.
- **R7** El admin de la cancha ve los partidos, los clips, las ventas y su parte de las ganancias.
- **R8** Formato vertical (9:16) con la marca de la cancha para los clips compartidos (fase 2).
- **R9** Aviso visible en la cancha de que **se graba** y aceptación al reservar (Ley 29733). **Escuelitas con menores:** la grabación solo con autorización de los padres y sin venta pública.

## Fases

| Fase | Qué incluye | Para qué |
|---|---|---|
| **0. Piloto** (4–6 semanas) | 2–3 canchas, 1 cámara cada una, grabación manual ("Iniciar partido"), botón ¡JUGADA! por QR, venta con Yape | Medir cuántos marcan jugadas, cuántos compran y a qué precio |
| **1. MVP** | Integración con reservas, envío por WhatsApp, panel de la cancha, reparto de ventas, borrado automático | Vender a más canchas |
| **2. Crecimiento** | Clips verticales con marca, modo local (subir solo lo vendido), paquete de ligas y torneos con tabla y goleadores, transmisión en vivo de finales | Diferenciarse de la competencia |
| **3. IA** | Detección automática de jugadas por el sonido (gritos, aplausos), como Beelup | Jugadas sin que nadie toque el botón |

## Riesgos

- **Internet de la cancha:** es el riesgo principal. Se mitiga con el modo local y midiendo la subida antes de instalar.
- **Iluminación nocturna:** la mayoría de partidos son de noche. Hay que probar la cámara con los reflectores reales.
- **Robo o daño del equipo:** instalarlo alto y con soporte seguro, y dejarlo cubierto en el contrato de comodato.
- **Competencia:** si Beelup entra con fuerza en Perú, nuestra ventaja es la integración con reservas, Yape y WhatsApp, y el servicio local.
- **Privacidad:** cartel visible, aceptación al reservar y nada de venta pública de videos con menores.

## Por verificar

- [ ] Que el *live instant clipping* de Cloudflare permita crear un clip de los últimos N segundos desde nuestro backend, y cuánto tarda.
- [ ] Si la Dahua IPC-PFW5849-A180 envía RTMP directo, y los precios reales de Dahua y Hikvision con distribuidores en Perú.
- [ ] Prueba nocturna de 25 fps frente a 20 fps con una pelota en movimiento.
- [ ] Precios de FútbolREC, y si Beelup ya opera en Perú.
- [ ] Velocidad de subida típica del internet en canchas de Lima norte y sur.
- [ ] Número de canchas sintéticas en Lima y en provincias (no hay una cifra pública).
- [ ] Si conviene un tipo de negocio nuevo, `canchas`, o reutilizar la reserva por horas de `hotel` (mini-booking).

## Preguntas abiertas

1. ¿Comodato (la plataforma pone el equipo) o la cancha compra el kit?
2. ¿Modelo B (cuota baja + 50 % de ventas) como predeterminado, con A como alternativa?
3. ¿Quién hace la instalación: un técnico propio o un socio local por zona?
4. ¿Con qué 2–3 canchas se hace el piloto?

## Fuentes

- Beelup: [Forbes Argentina](https://www.forbesargentina.com/negocios/beelup-empresa-argentina-revoluciona-deporte-amateur-expandio-17-paises-factura-us-1-millon-n59312), [iProUP](https://www.iproup.com/innovacion/48971-beelup-la-idea-que-revoluciono-el-futbol-5-y-hoy-genera-un-millon-de-dolares-al-ano), [La Nación](https://www.lanacion.com.ar/economia/negocios/la-idea-que-modernizo-el-futbol-5-y-genera-us900000-al-ano-nid17072024/), [planes para clubes](https://revivitupartido.com/ar/club), [Infonegocios](https://infonegocios.info/default/te-gustaria-revivir-esa-jugada-epica-del-futbol-5-con-amigos-beelup-argentina-lo-hace-posible-asi-podes-festejar-dos-veces).
- Competencia en Perú: [FútbolREC](https://futbolrec.com/), [Canchas Matamula](https://canchasfutbol.com/peru/lima/lince/canchas-matamula/), [Signal Play](https://signal-play.com.ar/clubes).
- Precios de canchas en Lima: [Líbero](https://libero.pe/ocio/curiosidades/2022/08/19/cuanto-cuesta-alquilar-cancha-sintetica-jugar-mis-amigos-en-lima-centro-civico-74939), [Municipalidad de Pueblo Libre](https://www.gob.pe/58127-alquilar-las-canchas-de-los-complejos-deportivos-de-pueblo-libre).
- Cloudflare: [live instant clipping](https://developers.cloudflare.com/stream/stream-live/live-instant-clipping), [precios](https://developers.cloudflare.com/stream/pricing/index.md).
- Cámaras deportivas: [Veo – comparativa 2026](https://www.veo.com/en-us/article/soccer-camera-systems-compared), [Pixellot vs Veo vs XbotGo](https://sportssteps.com/pixellot-vs-veo-vs-xbotgo-best-ai-cameras-youth-sports/), [Zone14 – cámaras para fútbol 2026](https://zone14.ai/en/blog/the-5-best-cameras-for-football-video-analysis-2026/).
- Cámaras panorámicas: [Reolink Duo 3 PoE (review)](https://mariushosting.com/reolink-duo-3-poe-review/), [Dahua IPC-PFW5849-A180](https://www.kaina24.lt/p/dahua-ipc-pfw5849-a180-e2-aste/), [Hikvision DS-2CD2387G2P-LSU/SL](https://shop.ascend.de/en/products/hikvision-ds-2cd2387g2p-lsu-sl-311323800), [RTMP en Dahua](https://securitycamcenter.com/how-to-stream-ip-camera-to-youtube-live/).
- Cámaras: [Reolink P330](https://www.domadoo.fr/es/productos-de-domotica/8179-reolink-camara-exterior-4k-onvif-poe-p330-b-8mp-6976930224356.html), [Reolink P430](https://www.ldlc.com/es-es/ficha/PB00734910.html).
- Comisiones de Culqi: [kom.pe](https://kom.pe/pasarelas-pago-tienda-virtual-peru-2026/).
