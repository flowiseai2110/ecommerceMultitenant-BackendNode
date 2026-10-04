# Spec: Mini booking — vitrina y reservas para hostales, agencias de tours y eventos

> Estado: **análisis y diseño aprobado** (2026-10-03). Sin implementar.
> Diseño técnico: [plan.md](plan.md).
> Repos involucrados: BackendNode, FrontendAdmin, FrontendStore.
> Antecedente: [verticales-reserva/](../verticales-reserva/spec.md) tiene un diseño extenso (casi un PMS) que quedó como **referencia futura**. Esta spec lo reemplaza como alcance a construir.

## Problema

Miles de hostales, hoteles pequeños, agencias de tours y organizadores de eventos en Perú **ya venden por WhatsApp**, a mano. Un caso real (hotel de Los Olivos, reservas de septiembre de 2026) muestra el proceso:

1. El hotel pega por chat la lista de habitaciones con precios por noche y por **6 horas**.
2. El cliente pregunta: "¿tiene disponible **hoy** a las 7 pm?". El hotel responde "sí" en minutos.
3. El hotel manda un formulario de 7 campos en texto. El cliente responde todo en una línea.
4. El hotel manda su cuenta BCP. El cliente transfiere.
5. El cliente tiene que **insistir** ("¿podría verificar?"). El pago se verifica **1 h 20 min** después.
6. El hotel manda una "Carta Reserva" en PDF que, además, muestra "Pagado: 0.00".
7. El huésped llega, se aloja y **consume** (bebidas, alimentos). Al hacer el **check-out**, el hotel emite **boleta o factura** por todo (alojamiento + consumos), descontando lo pagado al reservar.

**Lo que falla:** la información se repite a mano en cada chat, los datos llegan como texto libre, el pago no queda asociado a la reserva, la verificación depende de que alguien se acuerde y el cliente no tiene una confirmación confiable. Las agencias de tours y los eventos pequeños tienen el mismo problema con sus propios datos.

**Lo que no falla:** el negocio responde rápido, conoce su disponibilidad y quiere **decidir** a quién acepta. No necesita (ni quiere) un sistema de gestión.

## Objetivo

Que un negocio pequeño tenga, sin cambiar su forma de trabajar, una **vitrina web** donde:
- publica lo que ofrece (habitaciones, tours o eventos) con fotos y precios;
- recibe **solicitudes con datos completos** en vez de chats desordenados;
- acepta o rechaza con un clic;
- ve el comprobante de pago junto a la reserva y lo verifica con un clic;
- el cliente recibe una **confirmación de reserva** clara (código, fecha y hora, total, pagado, instrucciones).

**No** es un PMS ni compite con INFHOTEL u otros sistemas hoteleros: la operación del día (check-in, limpieza, guías, caja) sigue donde ya está.

**Dónde termina el mini booking (hotel):** en la **confirmación**. La estadía, los consumos y el comprobante del check-out los maneja el hotel como hoy. Lo pagado al reservar es un **pago a cuenta** que el hotel descuenta al cobrar.

```
Mini booking                                   │ El hotel (como hoy)
vitrina → solicitud → aceptación → pago a      │ llegada → estadía → consumos → check-out
cuenta → verificación → confirmación ──────────┼──▶ boleta / factura por todo, menos lo pagado
                                               │
                    reseña ◀── reserva "completada" (automático al pasar la hora de salida)
```

## Alcance

**Incluye**
- Tipo de negocio de la tienda: `productos` (actual), `hotel`, `tours`, `eventos`.
- **Hotel / hostal:** tipos de habitación con **modalidades de estadía** (noche y bloques de horas), solicitud de reserva, aceptación, pago, verificación y carta de confirmación.
- **Agencia de tours:** tours con días de salida, precio por tipo de pasajero, solicitud, aceptación, pago (total o adelanto) y confirmación con saldo en destino.
- **Eventos:** eventos con funciones y tipos de entrada con cupo, compra con cupo apartado, verificación del pago y entradas con QR.
- Fechas cerradas por el negocio ("ese día no recibimos", "el lunes no hay salida").
- Captura del comprobante de pago subida por el cliente.
- Bandeja de reservas en el admin ordenada por hora de inicio y con acciones de un clic.
- Mensajes de WhatsApp prellenados en los dos sentidos (sin API de WhatsApp).
- Asesor de ventas IA adaptado a cada vertical.
- Reutiliza: catálogo (`productos`, imágenes, categorías, SEO), métodos de pago, comprobante, cupones, reseñas, Libro de Reclamaciones, tema y diseño.

**No incluye**
- Disponibilidad exacta en tiempo real para hotel y tours: **el negocio confirma**.
- Gestión hotelera: check-in/out, asignación de habitación, limpieza, cuentas del huésped, caja.
- Operación de tours: guías, vehículos, manifiestos, zonas de recojo con costo.
- Sincronización con Booking/Airbnb, channel manager o PMS.
- Salones y banquetes, asientos numerados, transferencia de entradas, escáner sin conexión.
- API de WhatsApp Business (los avisos van por correo, admin y links `wa.me`).
- Otras monedas: todos los precios y pagos son en **soles (PEN)**, también para turistas extranjeros.

## Actores

| Actor | Qué hace |
|---|---|
| Cliente (con o sin cuenta) | Mira la vitrina, envía la solicitud, paga, sube su comprobante, recibe la confirmación |
| Negocio: owner / admin / editor | Publica su oferta, acepta o rechaza solicitudes, verifica pagos, cierra fechas |
| Negocio: viewer | Ve la bandeja sin actuar |
| Plataforma | Calcula precios, anula lo no atendido a la hora de inicio, envía correos, genera la confirmación |

## Flujos

### Hotel / hostal y agencia de tours: solicitud que el negocio confirma

```
Cliente                                Plataforma                         Negocio
  elige habitación+modalidad+          calcula salida y total
  fecha/hora  (o tour+fecha+pax)
  llena sus datos → Enviar solicitud → reserva "solicitada"            ← aviso (correo + badge en admin)
  [botón "Avisar por WhatsApp"] ─────────────────────────────────────→  chat con código y resumen
                                                                        Aceptar / Rechazar (1 clic)
  ← correo + página: "Aceptada, paga S/ 100 antes de las 11:30"       ← [botón "Responder por WhatsApp"]
  paga (Yape/transferencia) y sube captura → "pago en revisión"        ← aviso
                                                                        Verificar pago (1 clic)
  ← Confirmación de reserva (página + correo + link para WhatsApp)
```

Variante por negocio (`modo_confirmacion = pago_directo`): el cliente paga al enviar, sin esperar la aceptación, y el negocio confirma al verificar. Si no hay disponibilidad, rechaza y devuelve el dinero.

### Eventos: compra con cupo apartado

```
Cliente elige función y entradas → cupo apartado N minutos
  ├─ paga con pasarela → confirmada al instante → entradas con QR
  └─ paga por Yape/transferencia y sube captura → "pago en revisión"
        → el organizador verifica → entradas con QR
     (si no sube el pago a tiempo, el cupo se libera solo)
```

## Requisitos

Formato: *Cuando [condición], el sistema debe [comportamiento].*

### R1 — Tipo de negocio y configuración
- **R1.1** Al crear la tienda se elige el tipo de negocio: `productos`, `hotel`, `tours` o `eventos`. Solo se puede cambiar mientras la tienda no tenga pedidos ni reservas.
- **R1.2** Según el tipo, el admin muestra solo sus secciones. En hotel, tours y eventos no aparecen stock, variantes ni métodos de envío.
- **R1.3** Cada tienda de reservas tiene una configuración con valores por defecto:
  - modo de confirmación (`solicitud` o `pago_directo`);
  - **sin plazos que configurar**: una solicitud sin responder, o aceptada y sin pagar, **se anula sola al llegar la hora de inicio** del servicio (R5.6);
  - cobro (`total`, `adelanto` con %, `en_destino`);
  - **anticipación mínima** (límite duro: no se puede enviar si falta menos que esto). Por defecto 0 h en hotel y tours (se aceptan reservas para hoy); en eventos se usa la fecha límite de venta de cada tipo de entrada;
  - **aviso de reserva próxima** (límite blando, R5.3.1 y R9.6): con cuántas horas de anticipación se muestra la advertencia (vacío = nunca) y, opcionalmente, el texto propio del negocio. Por defecto: hotel 2 h, tours 24 h, eventos 6 h (solo con pago manual);
  - en eventos: **cierre del pago manual** N horas antes de la función (R4.4);
  - instrucciones para el cliente (por ejemplo, "presentar DNI de todos los huéspedes");
  - política de cancelación en texto;
  - en hotel: hora estándar de check-in y check-out;
  - **momento del comprobante** (R14.3): `en_el_servicio` (por defecto en hotel: se emite en el check-out) o `al_pagar` (por defecto en tours y eventos).
- **R1.4** Todas las fechas y horas se interpretan en la zona horaria de la tienda (`America/Lima` por defecto).

### R2 — Vitrina del hotel / hostal
- **R2.1** Cada tipo de habitación muestra fotos, descripción, camas, capacidad (adultos y niños) y servicios.
- **R2.2** Cada tipo tiene **una o más modalidades de estadía** con su precio:
  - `noche`: precio por noche (opcionalmente distinto el viernes y el sábado);
  - `horas`: bloque de N horas (por ejemplo, 3, 6 o 12 h) con precio fijo.
  La tarjeta muestra el precio más bajo ("desde S/ 100 · 6 horas").
  Cada tipo indica además la **unidad del precio**: *por habitación* (por defecto) o *por persona*. "Por persona" sirve para las camas en dormitorio compartido de los hostales: se publican como un tipo más ("Cama en dormitorio mixto de 6") y el total se multiplica por las personas. La plataforma **no gestiona camas ni dormitorios**: como en cualquier tipo, el hostal confirma si hay lugar.
- **R2.3** Al elegir la modalidad:
  - noche: el cliente indica fecha de llegada, número de noches y hora estimada de llegada;
  - horas: fecha y **hora de ingreso**. La salida se calcula sola (ingreso + N horas) y se muestra antes de enviar.
- **R2.3.1** La estadía por horas es una **ventana fija**: de la hora de ingreso a la hora de salida reservadas. Si el cliente llega tarde, la salida no se corre; si no llega, pierde la reserva y lo pagado (salvo que la política del negocio diga otra cosa). La vitrina lo muestra antes de enviar: "Tu estadía es de 18:30 a 00:30. Si llegas más tarde, la hora de salida no cambia".
- **R2.4** El total se calcula en el servidor (noches × precio de cada noche, o el precio del bloque) y se muestra desglosado.
- **R2.5** Si el negocio cerró esa fecha para ese tipo (o para todo el hotel), la vitrina no permite elegirla.
- **R2.6** El texto junto al botón debe dejar claro el modelo: "**Solicitud de reserva** — el hotel confirma la disponibilidad". Nunca "reservado" antes de la confirmación.

### R3 — Vitrina de la agencia de tours
- **R3.1** Cada tour muestra fotos, duración, itinerario simple, incluye / no incluye, qué llevar, requisitos, punto de encuentro o recojo, idiomas y política.
- **R3.2** El tour define sus **días de salida** (días de la semana) y una o más horas de salida. El calendario solo permite esos días, que no estén cerrados y que respeten la anticipación mínima.
- **R3.3** Precio por **tipo de pasajero** (adulto, niño, estudiante, nacional / extranjero). El cliente indica cuántos de cada tipo.
- **R3.4** El resumen muestra el total, lo que se paga ahora (100% o el adelanto) y el **saldo en destino**.

### R4 — Vitrina de eventos
- **R4.1** Cada evento muestra banner, descripción, lugar con mapa, edad mínima y sus funciones (fecha y hora).
- **R4.2** Cada función tiene tipos de entrada con precio, **cupo** y fecha límite de venta. La vitrina muestra "Agotado" cuando no queda cupo y "Últimas entradas" solo si quedan menos que un umbral configurable.
- **R4.3** El cliente elige cantidades por tipo, con un máximo por compra configurable.
- **R4.4** El organizador puede **cerrar el pago manual** (Yape / transferencia) N horas antes de la función; después solo se vende con pasarela. Vacío = el pago manual queda abierto hasta la fecha límite de venta.

### R5 — Solicitud (hotel y tours)
- **R5.1** La solicitud pide: nombres y apellidos, tipo y número de documento (DNI, CE, pasaporte), nacionalidad, fecha de nacimiento, teléfono (WhatsApp), correo y comentarios. Es el mismo formulario que hoy se manda por chat, ahora con validación.
- **R5.2** En hotel pide además el número de adultos y niños (validado contra la capacidad del tipo). En tours, los pasajeros por tipo; los datos de cada acompañante son opcionales (el negocio decide si los exige).
- **R5.3** Al enviar, la reserva queda `solicitada` con un **código corto** (`R-4F7K`). El cliente ve una página de seguimiento con el estado.
- **R5.3.1** Si el servicio empieza dentro de las horas del **aviso de reserva próxima** (R1.3), antes de enviar se muestra una advertencia. El cliente puede enviar igual. El negocio puede desactivarla, cambiar las horas o escribir su propio texto (con la variable `{hora}`, la hora de inicio). Textos por defecto:
  - **Hotel:** "Tu reserva es para dentro de poco. Si el hotel no la confirma antes de las {hora}, se anula. Te recomendamos llamar o escribir al hotel por WhatsApp".
  - **Tours:** "Tu tour sale pronto ({hora}). La agencia necesita confirmar el cupo y organizar la salida; si no la confirma antes, la solicitud se anula. Te recomendamos escribir a la agencia por WhatsApp".
  - **Eventos:** ver R9.6.

  **Aviso (blando) vs anticipación mínima (duro):** el aviso informa y deja continuar; la anticipación mínima impide enviar. Un hotel que no quiere solicitudes con menos de 1 h pone anticipación mínima 1; uno que sí las acepta pero quiere advertir, usa solo el aviso.
- **R5.4** La página de seguimiento ofrece **"Avisar al negocio por WhatsApp"**, un link `wa.me` con el código y el resumen ya escritos. Así el aviso llega al canal donde el negocio ya trabaja, sin costo de API.
- **R5.5** El negocio recibe además un correo y un badge en el admin con las solicitudes pendientes.
- **R5.6** Si al llegar la hora de inicio la solicitud sigue sin respuesta, o fue aceptada pero no se pagó, **se anula** (`vencida`). No se envían recordatorios ni se escala: si nadie la atendió, el cliente llamará o escribirá al negocio. No depende de un proceso programado: el estado se calcula con la hora de inicio.
- **R5.7** Un mismo cliente no puede tener más de 3 solicitudes abiertas en la misma tienda (anti-abuso). Hay rate limit por IP.

### R6 — Respuesta del negocio
- **R6.1** Desde la bandeja, el negocio puede **Aceptar** o **Rechazar** (con motivo opcional: "sin disponibilidad", "fecha cerrada", otro).
- **R6.2** Al aceptar, la reserva pasa a `aceptada` (debe pagarse antes de la hora de inicio, R5.6). El cliente recibe un correo y su página muestra los datos de pago con el monto exacto y el botón Copiar (componente de pago del checkout actual).
- **R6.3** Cada acción ofrece **"Responder por WhatsApp"**: abre el chat del cliente con una plantilla editable (aceptada + link de pago, rechazada + motivo, confirmada + link a la confirmación). Usa las plantillas de WhatsApp que ya existen.
- **R6.4** El negocio puede ajustar el total antes de aceptar (descuento, recargo) con un motivo visible para el cliente.

### R7 — Pago y verificación
- **R7.1** El cliente paga con los métodos de la tienda: pasarela (Culqi), Yape/Plin o transferencia.
- **R7.2** Con pago manual, el cliente **sube la captura** (imagen o PDF, máx. 5 MB) y, opcionalmente, el número de operación. La reserva pasa a `pago_en_revision`.
- **R7.3** El negocio ve la captura junto a la reserva y pulsa **"Pago verificado"** (o "No corresponde", con motivo). Al verificar, la reserva pasa a `confirmada` y se registra el monto pagado.
- **R7.4** Con pasarela, el pago confirmado por webhook confirma la reserva sin intervención.
- **R7.5** Si el cobro es por adelanto, la confirmación muestra **pagado** y **saldo a pagar en destino**.
- **R7.6** Si llega la hora de inicio sin captura ni pago, la reserva pasa a `vencida` (R5.6).
- **R7.7** Las capturas se guardan en almacenamiento **privado**. Solo las ven el negocio (admin) y el cliente dueño de la reserva.

### R8 — Confirmación de reserva
- **R8.1** Al confirmarse, el cliente recibe por correo y ve en un link permanente firmado la **confirmación de reserva**: logo y datos del negocio, código, titular, nacionalidad, fecha y hora de ingreso y salida (o salida del tour / función), noches u horas, personas, detalle con precios, total, **pagado**, saldo e instrucciones.
- **R8.2** La confirmación se puede imprimir o guardar como PDF desde el navegador (mismo enfoque que la constancia del Libro de Reclamaciones).
- **R8.3** El negocio puede copiar el código para registrarlo en su propio sistema (por ejemplo, en el campo "código de reserva externo" de su PMS).
- **R8.4** En hotel, la confirmación muestra lo pagado como **"Pagado a cuenta"** y la nota: "Los consumos durante tu estadía se pagan en el hotel. Tu boleta o factura se entrega al finalizar tu estadía".
- **R8.5** Una reserva confirmada pasa sola a `completada` cuando pasa su hora de salida (hotel), la hora de inicio más la duración (tour) o el fin de la función (evento). Se calcula al leer, como los vencimientos, y habilita la invitación a reseñar. El negocio puede marcar `no_show` si el cliente no llegó.

### R9 — Eventos: cupo y entradas
- **R9.1** Al continuar al pago, el cupo queda **apartado** por un tiempo configurable: 10 min con pasarela, 2 h con pago manual. El cupo disponible descuenta lo vendido y lo apartado vigente.
- **R9.2** Dos personas no pueden quedarse con la última entrada: la verificación de cupo y el apartado son atómicos.
- **R9.3** Si la pasarela confirma, o el organizador verifica la captura, se emiten las entradas: una por persona, cada una con su QR firmado.
- **R9.4** Las entradas se envían por correo y quedan en un link permanente, con un botón para compartirlas por WhatsApp.
- **R9.5** El organizador valida entradas desde el admin en el celular (cámara o código). Cada entrada se usa una sola vez.
- **R9.6** Aviso de compra próxima en eventos: aplica **solo al pago manual**, porque con pasarela la entrada sale al instante. Si la función empieza dentro de las horas del aviso (R1.3), al elegir Yape o transferencia se muestra: "El organizador verifica los pagos por Yape o transferencia a mano. Si tu pago no se verifica antes de la función ({hora}), lleva tu captura: la validarán en la puerta". Si hay pasarela activa, sugiere pagar con tarjeta para recibir la entrada al instante.
- **R9.7** En la puerta, el organizador puede buscar una compra en `pago_en_revision` por código o nombre, ver la captura y **verificar y emitir** las entradas en el momento.

### R10 — Fechas cerradas
- **R10.1** El negocio puede cerrar un rango de fechas para todo el negocio o para un tipo de habitación, un tour o una función ("lleno", "mantenimiento", "no hay salida").
- **R10.2** Las fechas cerradas no se pueden elegir en la vitrina y el asesor IA no las ofrece.

### R11 — Bandeja del admin
- **R11.1** Bandeja única de reservas con pestañas: **Por responder**, **Pago por verificar**, **Confirmadas** (próximas) e **Historial**. Las dos primeras se ordenan por hora de inicio (lo más próximo arriba) y muestran cuánto falta para que empiece el servicio.
- **R11.2** El menú muestra un badge con la suma de "por responder" y "pago por verificar".
- **R11.3** Vista **"Hoy y mañana"**: llegadas, salidas de tour o funciones con sus reservas confirmadas, para imprimir o compartir. No es un PMS: es una lista.
- **R11.4** Filtro por fecha de servicio, estado y producto. Búsqueda por código, nombre o documento.

### R12 — Cancelación
- **R12.1** El cliente puede cancelar una reserva `solicitada` o `aceptada` sin costo desde su página de seguimiento.
- **R12.2** Una reserva `confirmada` la cancela el negocio desde el admin. El reembolso, si corresponde según la política en texto, se gestiona fuera del sistema (o desde la pasarela) y se registra como nota.
- **R12.3** Si el cliente no llega o llega tarde, es responsabilidad del cliente (R2.3.1): el negocio marca `no_show` y lo pagado no se devuelve, salvo que su política diga otra cosa. La plataforma no interviene.

### R13 — Asesor de ventas IA
- **R13.1** El asesor usa herramientas según la vertical de la tienda. Responde con datos reales:
  - hotel: tipos de habitación, modalidades y precios ("¿tiene por horas?");
  - tours: tours más solicitados (por reservas confirmadas de los últimos 90 días) y días de salida;
  - eventos: próximos eventos y entradas disponibles.
- **R13.2** En hotel y tours **nunca afirma disponibilidad**: "el hotel lo confirma al recibir tu solicitud". Ofrece el link a la solicitud con los datos precargados (tipo, modalidad, fecha y hora).
- **R13.3** Sigue la regla actual: no escribe montos en el texto; los precios van en tarjetas calculadas por el servidor.
- **R13.4** Recibe la fecha y hora actuales de la tienda para entender "hoy a las 7".

### R14 — Privacidad y legal
- **R14.1** Los datos del huésped o pasajero (documento, fecha de nacimiento, nacionalidad) se usan solo para la reserva y se muestran solo al negocio y al titular.
- **R14.2** El formulario muestra una casilla de aceptación de tratamiento de datos (Ley 29733) con el nombre del negocio como responsable.
- **R14.3** Comprobante. La plataforma **no emite** comprobantes electrónicos (tampoco en el ecommerce): registra qué pide el cliente y el negocio lo emite con su sistema.
  - `en_el_servicio` (hotel): la solicitud pregunta **opcionalmente** "¿Necesitas factura?" y, si sí, pide RUC con autocompletado (la consulta de RUC ya existe) para que el hotel la tenga lista en el check-out. No pide boleta ni DNI aparte: el titular ya dio su documento.
  - `al_pagar` (tours, eventos): igual que el checkout actual (boleta o factura al confirmar el pago).
- **R14.4** El Libro de Reclamaciones funciona igual que en el ecommerce (bien contratado: servicio; pedido: la reserva).

## Estados de una reserva (hotel y tours)

```
solicitada ──aceptar──▶ aceptada ──sube captura──▶ pago_en_revision ──verificar──▶ confirmada ──▶ completada
     │                     │  └──pasarela OK──────────────────────────────────────▶ │
     ├─rechazar─▶ rechazada├─inicio▶ vencida              └─no corresponde─▶ aceptada (nuevo intento)
     ├─inicio───▶ vencida  └─cliente cancela─▶ cancelada
     └─cliente cancela─▶ cancelada                                       confirmada ──negocio cancela──▶ cancelada
                                                                         confirmada ──no llegó──▶ no_show
```

`completada` no la marca nadie: se alcanza sola al pasar la hora de salida o de fin del servicio (R8.5).

`pago_directo` empieza en `aceptada` (sin paso de solicitud). Eventos: `por_pagar` (cupo apartado) → `pago_en_revision` → `confirmada`, o `vencida`.

## Métricas de éxito

- Tiempo mediano desde la solicitud hasta la respuesta del negocio (meta: < 30 min en horario de atención).
- Tiempo desde la captura hasta la verificación (meta: < 30 min; el caso real tardó 1 h 20 min).
- % de solicitudes que terminan confirmadas.
- % de reservas que llegan por la vitrina en vez de solo por chat, a los 3 meses.

## Preguntas abiertas

1. ~~**Adelanto y SUNAT.**~~ **Resuelta:** en hotel, el comprobante lo emite el hotel en el check-out por el total de la estadía y los consumos, descontando lo pagado a cuenta (así trabaja el caso real). La plataforma no emite comprobantes, así que el momento de emisión es decisión del negocio y su contador. En tours y eventos se mantiene "al pagar".
2. ~~**Plazos en reservas del mismo día.**~~ **Resuelta:** no hay plazos configurables. Lo que no se respondió o no se pagó antes de la hora de inicio se anula solo; el negocio configura si mostrar una advertencia de reserva próxima y con cuántas horas (R1.3, R5.3.1, R9.6). La estadía por horas es una ventana fija y la llegada tarde o la no presentación son responsabilidad del cliente (R2.3.1, R12.3).
3. ~~**Camas en dormitorio.**~~ **Resuelta:** sin gestión de camas. Un tipo más con precio "por persona" (R2.2); el hostal confirma como en cualquier solicitud.
4. ~~**Moneda.**~~ **Resuelta:** solo soles (PEN).
