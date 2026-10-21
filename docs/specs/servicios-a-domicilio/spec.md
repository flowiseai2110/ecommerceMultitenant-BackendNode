# Spec: servicios para fiestas a domicilio (rubro nuevo `trabajadores`)

> Estado: aprobado (Diego, 2026-10-20; aprobación comunicada por la sesión principal) · Fecha: 2026-10-20 · Rubros: **rubro nuevo** (clave `trabajadores`, especialidad `fiestas`; ver P1)
> Repos: Backend · Admin · Tienda
> Origen: caso real de Diego (fiesta infantil del 17/10/2026). Ver "Por qué".
> Depende de: [confianza-reserva](../confianza-reserva/spec.md) (aprobada), que contiene la parte transversal R1 a R4 (avisos en la reserva, etapa del día, reconfirmación, contrato). Esta spec tiene solo la parte B, R5 a R12; los IDs se conservan para no perder la trazabilidad.
> **Calendario:** las fases 1 y 2 de confianza-reserva se construyen ya. **La fase 3 de esta spec empieza después de validar con 5 a 8 agencias** (P2).
> Relacionada: [planificador-fiesta](../planificador-fiesta/spec.md) (borrador): herramienta del cliente para organizar toda su fiesta (lista, gastos, invitados). Es una capacidad aparte, no parte de este rubro; la agencia solo arma plantillas y no ve el planificador.

## Por qué

**El caso.** Diego contrató por contrato a una agencia de animación para el cumpleaños de su hijo el 17/10. El contrato decía: llegada a las 6:30 pm (máximo 6:45), carita pintada hasta las 7:15, un muñeco de Bluey y un show de 2 horas. Su esposa confirmó el 12/10 por WhatsApp y por llamada. El 17/10 quisieron reconfirmar y la animadora no contestaba. Le escribieron por WhatsApp, por la página, por TikTok y por Instagram. De 8 am a 12 pm pensaron lo peor y casi contratan otra animación. Al final encontraron otro número en un TikTok: le habían robado el celular. El show se dio, pero fue un gran susto. No había en ninguna web un comunicado ni una forma de saber si el evento seguía en pie.

**El problema de fondo.** En un servicio que llega a tu casa, el cliente paga por adelantado y **no puede comprobar nada hasta que llegan**. Toda la confianza depende del celular de una persona. Si ese celular falla, el cliente no tiene a quién preguntar ni dónde mirar. Hoy el producto no ayuda: la página de la reserva (`reserva/:token`) no muestra avisos de la tienda ni un estado del día, y nadie reconfirma de forma ordenada.

**Por qué es un rubro nuevo.** Ningún rubro actual encaja (decisión de Diego, ver "Decisiones tomadas"):

| Rubro | Por qué no |
|---|---|
| `eventos` | Vende entradas con aforo y QR. Un show infantil no tiene aforo y el lugar es la casa del contratante. Diego no quiere competir en ticketeras. |
| `locales` | El cliente va al salón. Aquí el servicio va a la casa del cliente. |
| `tours` | Sin cupo ni agenda; la agencia confirma a mano. Aquí el recurso escaso es una persona con agenda. |
| `canchas` | Recurso fijo (la cancha) por franjas de 60 a 120 min. Aquí el recurso se mueve de casa en casa. |

**Qué se quiere lograr.** Un rubro nuevo que modele lo propio de estos negocios: personal con agenda, dirección del cliente, ventana de llegada, itinerario y reemplazo. La confianza (avisos en la reserva, estado del día, reconfirmación, contrato) es transversal y vive en [confianza-reserva](../confianza-reserva/spec.md).

## Lo que existe hoy (para no duplicar)

Lo leí en las specs y en el código; no diseño sobre ello. Lo existente que toca a la parte A (comunicados, página de la reserva, contrato de `locales`, alertas de `tours`) está en [confianza-reserva](../confianza-reserva/spec.md).

| Pieza | Qué hace hoy | Límite que importa aquí |
|---|---|---|
| Agenda de canchas | Grilla cancha × hora, bloqueos manuales, la base de datos impide el cruce (CAN-06, CAN-10). | El recurso es una cancha, no una persona que se traslada. |
| Estados de la reserva | `solicitada`, `aceptada`, `pago_en_revision`, `confirmada`, `completada`, `no_show`, etc. Los vencimientos se calculan al leer, sin cron. | No existe ningún recordatorio programado en reservas (el de cuotas de `locales`, L2.9, sigue sin construir). Sí hay jobs con temporizador para transmisiones y campañas, así que existe el patrón. |
| Avisos al cliente | Correo (Resend) y enlaces `wa.me`. | **No hay API de WhatsApp.** Un aviso automático por WhatsApp no es posible hoy (ver P4). |
| Dirección del cliente | El checkout ya pide dirección con mapa y GPS (antipatrones, pieza 4). | Hay que ver si se reutiliza para el servicio a domicilio. |

## Cómo se divide (decisión P5)

El requerimiento era grande y mezclaba dos cosas, así que Diego aprobó partirlo en dos funcionalidades:

- **Parte A, transversal** (todos los rubros de reserva): R1 avisos en la página de la reserva, R2 estado del día, R3 reconfirmación, R4 contrato visible. Vive en **[confianza-reserva](../confianza-reserva/spec.md)**, con sus criterios CA1 a CA28 y CA56 y sus fases 1 y 2.
- **Parte B, propia del rubro nuevo**: R5 a R12, en este documento. Se apoya en la parte A.

La parte A sola ya habría reducido el susto del caso y beneficia a `tours`, `locales`, `hotel` y `canchas` desde la primera fase. Por eso va primero (ver "Fases").

## Conceptos del negocio

| Término | Qué significa |
|---|---|
| Servicio | Lo que se vende: show con muñeco, carita pintada, animación, DJ, fotografía, catering, decoración, inflables. |
| Paquete | Varios servicios juntos con su itinerario (p. ej. "Fiesta Bluey"). |
| Bloque | Una parte del itinerario con nombre y duración (carita pintada, show). |
| Itinerario | Los bloques con su hora: "6:30 llegada, carita pintada hasta 7:15, show de 2 horas". |
| Ventana de llegada | La hora a la que deben llegar y la hora máxima tolerada (6:30 y 6:45). |
| Personal | Las personas que prestan el servicio (animadora, DJ, fotógrafo). Cada una tiene agenda propia. |
| Personal asignado | Quién irá a esa reserva en concreto. |
| Reemplazo / plan B | Cambiar a la persona asignada por otra, con aviso al cliente. |
| Zona de cobertura | Distritos o zonas donde la empresa presta el servicio, con su recargo y tiempo de traslado. |
| Traslado | Tiempo que el personal necesita para ir de un servicio a otro. |
| Reconfirmación | Aviso de que "seguimos en pie" que hace la empresa (y puede hacer el cliente) antes del servicio. |
| Etapa del día | Estado del servicio ese día: por reconfirmar, reconfirmada, en camino, llegó, terminó. |
| Contacto de respaldo | Un segundo contacto de la empresa (otra persona u otro número) que no depende del celular del personal. |

## Rubros: dónde aplica y cómo

La parte A (R1 a R4, en [confianza-reserva](../confianza-reserva/spec.md)) toca a los rubros de reserva; el detalle por rubro de la parte A está en esa spec. Esta tabla resume el efecto de la parte B, que es solo del rubro nuevo.

| Rubro | ¿Aplica? | Cómo se comporta | Regla de negocio que lo condiciona (`docs/rubros/<rubro>.md`) |
|---|---|---|---|
| `trabajadores` (nuevo) | Sí, es el rubro | Trae la parte A completa y toda la parte B. Familia visual `reserva`. Sin carrito. | No existe aún `docs/rubros/trabajadores.md`; se crea al terminar la primera pieza (ver "Para Diego"). |
| `productos` | No aplica | Sin reservas. El rastreo de pedido no cambia. | `productos.md` (no se consultó: no hay efecto). |
| `hotel`, `tours`, `eventos`, `locales`, `canchas` | Parte B: no aplica | El rubro nuevo no cambia su comportamiento. Lo que reciben de la parte A (avisos en la reserva, reconfirmación, etapa del día, contrato) está en [confianza-reserva](../confianza-reserva/spec.md), con su tabla por rubro. | `hotel.md`, `tours.md`, `eventos.md`, `locales.md`, `canchas.md`. Ojo con `eventos.md`: lista a "animadores infantiles" como cliente típico solo para transmitir eventos privados; ver P8. |

## Requisitos

### Parte A. Transversal: vive en otra spec

Los requisitos R1 (avisos y contacto en la página de la reserva), R2 (etapa del día), R3 (reconfirmación) y R4 (contrato visible) están en **[confianza-reserva](../confianza-reserva/spec.md)** (aprobada). Aquí no se repiten. Este rubro depende de ellos: `trabajadores` los trae encendidos (R2.4, R3.7) y exige el contacto de respaldo para publicarse (R1.5).

### Parte B. Propia del rubro nuevo

#### R5. Servicios y paquetes
- **R5.1** Un servicio tiene nombre, descripción, qué incluye, duración, personal que necesita (rol y cantidad), precio y condiciones del lugar (espacio, electricidad, acceso). Un servicio puede tener personajes o temas elegibles (p. ej. Bluey).
- **R5.2** Un paquete combina servicios con un itinerario de bloques. Cada bloque tiene un nombre, cuándo empieza (respecto de la llegada) y cuánto dura. Los bloques pueden solaparse (carita pintada mientras empieza el show). El sistema calcula las horas del itinerario a partir de la hora de llegada.
- **R5.3** El precio del paquete es fijo, más extras (hora adicional, personaje adicional) y el recargo de zona. No se cobra por persona ni por invitado.
- **R5.4** Un servicio o paquete sin al menos un bloque y sin personal asignable no se publica en la tienda (misma idea que T-12 en tours).
- **R5.5** Los servicios "por solicitud" (en la primera versión: catering, decoración, inflables; ver P3) no tienen agenda automática: el cliente los pide, el negocio cotiza. Se muestran con precio "desde" o "a cotizar".

#### R6. Personal y agenda
- **R6.1** El negocio registra a su personal: nombre visible, rol (qué servicios presta), foto opcional, contacto interno, horario habitual y días libres.
- **R6.2** Una persona no puede estar en dos servicios a la vez. Entre dos servicios de la misma persona debe haber al menos el **traslado** entre sus zonas más el tiempo de **preparación** del siguiente. Lo garantiza la base de datos, no solo la pantalla (como CAN-06 y LOC-03).
- **R6.3** La tienda ofrece una fecha y hora solo si hay al menos una persona libre que preste todos los servicios del paquete.
- **R6.4** El negocio puede bloquear la agenda de una persona (vacaciones, otro contrato, enfermedad). Un bloqueo ocupa igual que una reserva (como CAN-10).
- **R6.5** Dos clientes que piden el mismo horario a la vez: el primero lo retiene; el segundo recibe "ya no está disponible" con hasta 3 alternativas. Mientras la empresa responde una solicitud, la agenda queda retenida por un plazo (mismo patrón que LOC-10).
- **R6.6** Al aceptar la solicitud, el negocio asigna a quién irá (el sistema sugiere a quien esté libre). Una reserva confirmada sin personal asignado aparece como alerta en el panel.
- **R6.7** Cerrar una fecha, desactivar a una persona o quitar un servicio con reservas vivas se bloquea y dice cuáles (mismo criterio que LOC-18).

#### R7. Servicio en la dirección del cliente
- **R7.1** El cliente indica dirección, distrito, referencias, acceso (piso, portería) y el nombre y teléfono de quien recibirá al personal. El mapa o el GPS son opcionales.
- **R7.2** La tienda define sus zonas de cobertura, cada una con un recargo (puede ser 0) y un tiempo de traslado. Fuera de las zonas no se puede enviar la solicitud en línea: se muestra "Aún no llegamos a [distrito]" con el contacto de la empresa.
- **R7.3** La dirección exacta la ve siempre el negocio. El personal asignado la ve solo desde 24 horas antes del servicio.
- **R7.4** Si el servicio exige condiciones del lugar (espacio para un inflable, toma de corriente), se muestran antes de reservar.

#### R8. Ventana de llegada e itinerario
- **R8.1** La reserva guarda la hora de llegada, la hora máxima y el itinerario con sus horas calculadas. El cliente los ve en su página y están en el contrato.
- **R8.2** Si a la hora de llegada la etapa no es `en camino` o `llegó`, se alerta al negocio. Si a la hora máxima la etapa no es `llegó`, se alerta de nuevo, y la página del cliente muestra "La llegada tiene retraso" con los contactos de la empresa.
- **R8.3** La hora de llegada y la tolerancia vienen del paquete y el negocio puede ajustarlas al aceptar la solicitud.

#### R9. Personal asignado y reemplazo
- **R9.1** El cliente ve quién irá: nombre de pila, rol y foto si existe. No ve su celular (R1.4 de confianza-reserva).
- **R9.2** El negocio puede cambiar a la persona asignada en cualquier momento. El sistema valida que el reemplazo esté libre (R6.2), guarda el motivo, la hora y quién lo hizo, y avisa al cliente por correo y en su página. Las condiciones del contrato no cambian.
- **R9.3** El negocio puede dejar una persona **suplente** marcada para una reserva. Cuando una reserva queda sin reconfirmar (R3.4 de confianza-reserva), el panel muestra a quién del personal está libre para reemplazar.
- **R9.4** Si no hay reemplazo posible, el negocio cancela por su parte con un motivo. El cliente ve el motivo y la política de devolución, recibe el correo y la agenda se libera. La devolución del dinero se hace fuera de la plataforma, como hoy.

#### R10. Cobro, cancelación y cierre
- **R10.1** Se separa la fecha con un adelanto (porcentaje configurable por tienda) y el saldo se cobra el día del servicio o antes, según la tienda. El comprobante se pide al pagar. Se reutiliza la configuración de cobro que ya existe en tours y canchas.
- **R10.2** La política de cancelación es configurable por tienda, con tramos por días de anticipación (como LOC-22). La plataforma no hace devoluciones: las registra.
- **R10.3** Estados comerciales: los de siempre (solicitada, aceptada, pago en revisión, confirmada, rechazada, vencida, cancelada, no se presentó el cliente, completada). La reserva pasa a `completada` cuando el personal marca `terminó` o, si nadie lo marca, pasada la hora de fin más un margen (se calcula al leer).
- **R10.4** Al completarse, el cliente puede dejar una reseña con el flujo que ya existe.
- **R10.5** Fuera de v1: reprogramar una reserva confirmada (ver "Fuera de alcance").

#### R11. Panel de la empresa
- **R11.1** El panel muestra "Hoy" y "Mañana": cada servicio con hora de llegada, personal, etapa del día y alertas (sin reconfirmar, sin personal, retraso).
- **R11.2** Una agenda por persona, con reservas y bloqueos (semejante a la agenda de canchas), para ver conflictos y huecos.
- **R11.3** Tareas pendientes de reconfirmación visibles en un solo lugar.

#### R12. Cumplir el contrato de rubro en los tres repos
- **R12.1** El rubro se agrega al tipo y al registro de los tres repos con su carpeta `negocio/trabajadores/` (nombre final según P1): perfil, vitrina y UI de la familia `reserva` en la tienda; perfil en el admin; datos y estrategia en el backend. Si falta algo del contrato, no compila (front) o falla el test de contrato (backend).
- **R12.2** Nada fuera del rubro pregunta por su identidad. El código compartido consulta capacidades (agenda de personal, cobertura a domicilio, itinerario, etapa del día, reconfirmación). `scripts/anti-identidad.mjs` pasa.
- **R12.3** Las capacidades nuevas se declaran como capacidades, no como banderas de un solo rubro, para que otro rubro las active después (p. ej. un futuro servicio a domicilio de otro tipo).

## Criterios de aceptación

Formato: **Dado** … **cuando** … **entonces** … (uno por regla; el QA los prueba tal cual).

**R1 a R4 (avisos, etapa del día, reconfirmación y contrato)**
- Sus criterios CA1 a CA28 y CA56 están en [confianza-reserva](../confianza-reserva/spec.md). No se repiten aquí. El QA de este rubro los prueba con el rubro `trabajadores`.

**R5. Servicios y paquetes**
- CA29 (R5.2, trabajadores): Dado un paquete "Fiesta Bluey" con carita pintada de 45 min desde la llegada y show de 2 horas, cuando el cliente elige llegada a las 6:30 pm, entonces el itinerario muestra la carita pintada hasta las 7:15 pm y las horas del show calculadas desde la llegada.
- CA30 (R5.3, trabajadores): Dado un paquete de S/ 400 con una zona de recargo S/ 20 y una hora adicional de S/ 80, cuando el cliente la elige, entonces el total muestra S/ 500 desglosado.
- CA31 (R5.4, trabajadores): Dado un paquete sin bloques o sin personal capaz de prestarlo, cuando se visita la tienda, entonces no aparece.
- CA32 (R5.5, trabajadores): Dado un servicio de catering "por solicitud", cuando el cliente lo pide, entonces se crea una solicitud sin consultar la agenda y sin precio final, y el negocio responde con su cotización.

**R6. Personal y agenda**
- CA33 (R6.2/R6.3, trabajadores): Dado una única animadora con un servicio el sábado hasta las 8:30 pm en Miraflores, y que San Borja está a 40 min de traslado con 30 min de preparación, cuando otro cliente pide San Borja ese sábado, entonces la tienda no ofrece antes de las 9:40 pm y sí ofrece las 9:45 pm.
- CA34 (R6.5, trabajadores): Dado que dos clientes piden el mismo horario de la única animadora al mismo tiempo, cuando ambos envían, entonces el segundo recibe "ya no está disponible" con alternativas y no se crea su reserva.
- CA35 (R6.4, trabajadores): Dado un bloqueo de agenda del sábado, cuando un cliente busca ese sábado, entonces no se ofrece.
- CA36 (R6.6, trabajadores): Dado una reserva confirmada sin personal asignado, cuando el dueño abre el panel, entonces ve la alerta "sin personal asignado".
- CA37 (R6.7, trabajadores): Dado un servicio con reservas vivas, cuando el dueño intenta desactivarlo, entonces el sistema lo impide y dice qué reservas lo usan.

**R7. Dirección del cliente**
- CA38 (R7.1, trabajadores): Dado el formulario de la reserva, cuando el cliente no indica dirección, distrito o la persona que recibirá, entonces no puede enviar la solicitud.
- CA39 (R7.2, trabajadores): Dado un distrito fuera de las zonas, cuando el cliente intenta reservar allí, entonces ve "Aún no llegamos a [distrito]" con el contacto de la empresa y no puede enviar la solicitud.
- CA40 (R7.3, trabajadores): Dado el enlace del personal asignado, cuando lo abre 2 días antes, entonces no ve la dirección exacta; 24 horas antes sí.

**R8. Ventana de llegada**
- CA41 (R8.1, trabajadores): Dado una reserva confirmada, cuando el cliente abre su página, entonces ve la hora de llegada, la hora máxima y el itinerario con sus horas.
- CA42 (R8.2, trabajadores): Dado llegada a las 6:30 pm y máximo 6:45 pm, cuando son las 6:30 sin etapa `en camino`, entonces el panel muestra alerta; y cuando son las 6:45 sin `llegó`, entonces hay otra alerta y la página del cliente muestra "La llegada tiene retraso" con los contactos.

**R9. Personal asignado y reemplazo**
- CA43 (R9.1, trabajadores): Dado una reserva con personal asignado, cuando el cliente abre su página, entonces ve nombre de pila, rol y foto, y no ve el celular.
- CA44 (R9.2, trabajadores): Dado una reserva con Ana asignada, cuando el negocio la cambia por Lucía (libre), entonces el cliente recibe un correo y la página muestra el cambio con la hora; el contrato no cambia. Y si Lucía está ocupada, el sistema no permite el cambio.
- CA45 (R9.3, trabajadores): Dado una reserva sin reconfirmar con suplente marcado, cuando el dueño abre la alerta, entonces ve al suplente y a quien más esté libre en ese horario.
- CA46 (R9.4, trabajadores): Dado que no hay reemplazo, cuando el negocio cancela con motivo, entonces el cliente ve el motivo y la política de devolución, recibe el correo y la agenda de esa persona queda libre.

**R10. Cobro y cierre**
- CA47 (R10.1, trabajadores): Dado una tienda con adelanto de 50 %, cuando el cliente separa la fecha, entonces se le pide el 50 % y el saldo queda como pendiente del día del servicio.
- CA48 (R10.2, trabajadores): Dado una política de cancelación por tramos, cuando el cliente cancela, entonces la reserva muestra qué parte corresponde devolver, sin que la plataforma mueva dinero.
- CA49 (R10.3, trabajadores): Dado un servicio terminado, cuando el personal marca `terminó`, entonces la reserva pasa a `completada`; y si nadie lo marca, pasa sola pasada la hora de fin más el margen.
- CA50 (R10.3, trabajadores): Dado un cliente que no estaba en la dirección, cuando el negocio lo marca "no se presentó", entonces queda registrado y el adelanto no se devuelve automáticamente.

**R11. Panel**
- CA51 (R11.1, trabajadores): Dado tres servicios hoy, cuando el dueño abre el panel, entonces los ve ordenados por hora de llegada con personal, etapa y alertas.
- CA52 (R11.2, trabajadores): Dado una persona con dos reservas y un bloqueo, cuando el dueño abre su agenda, entonces los ve en la grilla y los huecos libres.

**R12. Contrato de rubro**
- CA53 (R12.1, trabajadores): Dado el rubro en el registro del front sin su perfil o sin su UI, cuando se compila, entonces falla; y dado el backend sin sus datos, cuando se corre el test de contrato, entonces falla.
- CA54 (R12.2, todos): Dado el repo con el rubro nuevo, cuando se corre `npm test`, entonces `scripts/anti-identidad.mjs` pasa: no hay `esFiestas()` ni comparaciones de rubro fuera de su carpeta.
- CA55 (R12.2, hotel y productos): Dado una tienda de hotel y una de productos, cuando se prueba con el rubro nuevo ya registrado, entonces sus pantallas y rutas son las mismas que antes (`uis.spec.ts` y `perfiles.spec.ts` solo cambian por la fila del rubro nuevo).

## Variación por cliente

- **Rubro nuevo**, no una excepción por tienda ni una copia: ningún rubro existente cubre el recurso (personal con agenda), el lugar (casa del cliente) ni el itinerario (decisión de Diego).
- **Configuración por tienda** (lo más común): zonas y recargos (R7.2), tiempo de preparación, adelanto y saldo (R10.1), política de cancelación (R10.2), tolerancia de llegada (R8.3). Lo de la parte A (reconfirmación, contacto de respaldo, avisos) se configura según [confianza-reserva](../confianza-reserva/spec.md).
- **Capacidad opcional**: lo que `trabajadores` trae encendido de la parte A (etapa del día, reconfirmación) lo pueden activar `tours` y `locales`; el contrato pasa a capacidad común (ver [confianza-reserva](../confianza-reserva/spec.md)). Equipamiento con inventario (inflables, decoración) sería otra capacidad en una fase posterior.
- **Excepción por tienda**: ninguna prevista. Se vería solo con un cliente grande con reglas únicas.

## Fases

Cada fase se prueba y se despliega antes de empezar la siguiente (divide y vencerás). Las **fases 1 y 2** (avisos en la reserva, etapa del día en el panel, reconfirmación automática) son de [confianza-reserva](../confianza-reserva/spec.md) y se construyen ya, sin esperar este rubro. Las fases 3 en adelante son de este rubro y **empiezan después de validar con agencias** (P2).

| Fase | Qué entrega | Rubros que se benefician | ¿Habría evitado el susto del 17/10? |
|---|---|---|---|
| 0. Validar con agencias | 5 a 8 conversaciones con agencias de animación, catering, decoración (ver P2). Corre en paralelo a la fase 1; decide el alcance de las fases 3 y 4. | — | — |
| 1 y 2. Lo transversal | Ver [confianza-reserva](../confianza-reserva/spec.md), fases 1 y 2. Es lo mínimo que habría evitado el susto del 17/10. | `tours`, `locales`, `hotel`, `eventos`, `canchas` y la base de `trabajadores` | Sí, en gran parte (detalle en esa spec). |
| 3. El rubro nuevo, esqueleto (R5, R7, R10, R12, R9.1 y R4 de confianza-reserva) | Servicios y paquetes, solicitud con dirección y zona, aceptar, contrato, cobro con adelanto, página con itinerario y personal. Sin agenda automática: la empresa acepta a mano, como en tours. | `trabajadores` | Parcial: el contrato y el itinerario visibles. |
| 3b. Personal y agenda (R6) | Personal con agenda, traslado y preparación, asignación, bloqueos, anti-doble reserva. | `trabajadores` | No por sí sola; evita las fiestas "vendidas dos veces". |
| 4. Día del servicio completo (R8, R9.2 a R9.4, R11 y el enlace del personal, R2.2 de confianza-reserva) | Enlace del personal (en camino, llegó, terminó), alertas de retraso, reemplazo y suplente, panel "Hoy". | `trabajadores` y, como capacidad, `tours` y `locales` | Sí: el plan B en práctica. |
| 5. Después (según validación) | Reprogramar, equipamiento con inventario (inflables, decoración), aviso por WhatsApp API, GPS en vivo, cuotas, multi-sede. | — | — |

Nota para el arquitecto (no es diseño): el proceso programado en reservas que necesita la reconfirmación (confianza-reserva, fase 2) también lo necesitarán las alertas de retraso de la fase 4. Conviene resolverlo una sola vez.

## Fuera de alcance

- El planificador de la fiesta del cliente (lista de tareas, gastos e invitados): spec propia, [planificador-fiesta](../planificador-fiesta/spec.md).
- Un directorio o marketplace de agencias, o recomendar proveedores. Cada agencia es una tienda.
- Vender entradas, aforo, QR o transmisión en vivo (es el rubro `eventos`). Una agencia que ya usa `eventos` para transmitir sigue ahí (ver P8).
- Inventario de disfraces, inflables, mobiliario o decoración, y su logística de montaje y recojo (queda para la fase 5 según P3).
- Catering con menú, platos, stock o proveedores: en la primera versión solo existe como servicio "por solicitud" con cotización.
- Pago con cuotas, garantía por daños y liquidación (eso es de `locales`). Aquí hay adelanto y saldo.
- Que la plataforma devuelva dinero o medie en reclamos: registra, pero no mueve dinero (como en `eventos` y `locales`).
- Aviso automático por WhatsApp (API): hoy solo hay correo y enlaces `wa.me`; ver decisión P4 en [confianza-reserva](../confianza-reserva/spec.md).
- Seguimiento por GPS del personal en vivo: la etapa se marca con un toque (ver P7 en [confianza-reserva](../confianza-reserva/spec.md)).
- App móvil nativa para el personal: es un enlace web.
- Verificar antecedentes, identidad o seguros del personal.
- Reprogramar una reserva confirmada (fase 5). En la primera versión se cancela y se reserva de nuevo.
- Firma electrónica certificada. El contrato registra aceptación con nombre, documento, fecha y hora, como en `locales`.
- Idiomas distintos del español en la primera versión.
- Multi-sede (varias bases del mismo negocio): ver [multi-sede](../multi-sede/spec.md). La cobertura por zona de esta spec no la anticipa; si se necesita, se trata allí.

## Preguntas abiertas

P1 a P5 las respondió Diego el 2026-10-20 (ver "Decisiones tomadas"). P7, P9 y P11 pasaron a [confianza-reserva](../confianza-reserva/spec.md) porque son de la parte transversal. Las demás pueden resolverse durante el diseño o con la validación con agencias.

- [x] **P1. Nombre del rubro.** Respondida por Diego el 2026-10-20 (ver "Decisiones tomadas"):
  - **Clave del rubro (`tipoNegocio`): `trabajadores`.** Nombra el recurso escaso (la persona y su agenda) y abarca fiestas, belleza, bienestar y técnicos a domicilio. Lo eligió Diego. No choca con nada en los tres repos. Se descartaron `profesionales` (no le gustó a Diego),
    - `fiestas`, por estrecho;
    - `servicios`, que aparece en 70 archivos;
    - `domicilio`, que ya es la dirección de envío del checkout (`DomicilioPickerComponent`, `consumidorDomicilio`);
    - `visitas`, que ya es el conteo de visitas.
  - **Segundo nivel: la especialidad.** Es el campo `tiendas.rubro` que hoy existe solo para productos (`modules/tenants/rubros.js`). Primera especialidad: `fiestas` (animación, shows, hora loca, DJ, fotografía). Después vendrían `belleza`, `bienestar` y `tecnicos`. La especialidad da:
    - el nombre visible por defecto ("Servicios para fiestas"), que la tienda puede cambiar;
    - las campañas sugeridas (Día del Niño, Halloween, Navidad);
    - la plantilla de diseño recomendada.
  - Se sale al mercado solo con `fiestas`; el modelo se diseña general para no copiar el rubro después.
- [x] **P2. ¿Se valida con agencias reales antes de construir?** Respondida: **(b)**. Se valida con 5 a 8 agencias antes de la fase 3 y se construyen ya las fases 1 y 2 de confianza-reserva. Qué hay que validar: cómo llevan hoy su agenda, si trabajan solos o con equipo, si aceptarían mostrar "en camino" y "sin reconfirmar" a sus clientes, si cobran adelanto y cuánto, si una animadora y un DJ son recursos separados, si los bloques del itinerario se solapan (P14) y si les importa más la agenda o el contrato.
- [x] **P3. Alcance de los servicios.** Respondida: **(b)**. Agenda automática para los servicios de **personal** (animación, show con muñeco, carita pintada, DJ, fotografía); catering, decoración e inflables entran "por solicitud" con cotización manual. Equipamiento e inventario quedan para la fase 5.
- [x] **P4. Canal de los avisos y reconfirmaciones.** Respondida: **(b)**. Correo, página de la reserva y botón "Avisar por WhatsApp" (`wa.me`) en el panel. WhatsApp Business API se evalúa después. Vive en [confianza-reserva](../confianza-reserva/spec.md) (R3.2, CA56).
- [x] **P5. ¿Parto lo transversal en su propia spec?** Respondida: **(a)**. Creada [confianza-reserva](../confianza-reserva/spec.md) con R1 a R4.
- [ ] **P6. ¿Reserva directa o solicitud?** En la primera versión recomiendo **solicitud con aceptación** de la empresa (la empresa revisa dirección, zona y agenda), igual que `tours`. La reserva directa (la agenda libre confirma sola, como el hotel con unidades) se activa después, cuando la agenda de personal sea confiable.
- [x] **P7. Qué ve el cliente cuando la empresa no reconfirmó.** Pasó a [confianza-reserva](../confianza-reserva/spec.md) (sigue abierta allí).
- [ ] **P8. Tiendas que hoy usan `eventos` siendo animadoras.** `eventos.md` las menciona como clientes típicos para transmitir eventos privados. ¿Existen tiendas reales en esa situación? ¿Se les ofrece migrar o conviven? La transmisión no entra en el rubro nuevo (fuera de alcance).
- [x] **P9. Momento de la reconfirmación de la mañana.** Pasó a [confianza-reserva](../confianza-reserva/spec.md) (sigue abierta allí).
- [ ] **P10. Reemplazo.** ¿El cliente puede rechazar un reemplazo? Recomiendo que se le informe y que, si no acepta, pueda cancelar con devolución completa mientras falten más de 48 horas (la devolución se hace fuera de la plataforma).
- [x] **P11. Comunicados en la reserva.** Pasó a [confianza-reserva](../confianza-reserva/spec.md) (sigue abierta allí).
- [ ] **P12. Datos de menores.** El formulario pedirá nombre y edad del cumpleañero. ¿Se pide solo nombre de pila y edad (mínimo necesario) o más? Hay que revisar la Ley 29733 de protección de datos personales. Recomiendo solo nombre de pila y edad, y que el personal los vea desde 24 horas antes.
- [ ] **P13. Cobertura.** ¿Por distritos de una lista o por radio desde una base? Recomiendo distritos (más simple de explicar y de configurar); el radio llegaría con multi-sede.
- [ ] **P14. Itinerario.** ¿Los bloques se solapan (carita pintada mientras empieza el show) o son siempre en secuencia? El contrato del caso sugiere que se solapan. Validar con agencias.
- [ ] **P15. Analista del rubro.** Para cumplir el proceso hace falta `docs/rubros/<rubro>.md` y, si quieres mantenerlo, un `analista-<rubro>`. Hoy el plugin tiene seis analistas, ninguno de este rubro.

## Decisiones tomadas

| Fecha | Decisión | Por qué | Alternativa descartada |
|---|---|---|---|
| 2026-10-20 | No es el rubro `eventos` | Diego no quiere vender entradas: mercado saturado y el nicho es poco poblado. Un show infantil no es un evento con aforo y el lugar es la casa del cliente. | Extender `eventos` con una capacidad "a domicilio". |
| 2026-10-20 | Ningún rubro existente encaja: es un rubro nuevo, no una excepción ni una capacidad de otro | El recurso escaso es el personal y su agenda; hay zona de cobertura, traslado, ventana de llegada, itinerario y reemplazo. | Excepción por tienda sobre `locales` o `tours`. |
| 2026-10-20 | Se prefiere la decisión correcta y mantenible a la más sencilla | Criterio de Diego para arquitectura. | Un MVP que mezcle el rubro con `tours` para salir antes. |
| 2026-10-20 | Alcance amplio sugerido (animación, show, carita pintada, catering, decoración, inflables, fotografía, DJ) | Punto de partida de Diego; se acota en P3. | — |
| 2026-10-20 | Clave del rubro `trabajadores`; `fiestas` es su primera especialidad (P1) | El modelo (personal con agenda que va a la dirección del cliente) sirve también a belleza, bienestar y técnicos a domicilio. Si naciera atado a "fiesta", habría que copiar el rubro por cada negocio. | `profesionales` (no le gustó a Diego); `fiestas` como clave del rubro; `servicios`, `domicilio` y `visitas`, que chocan con nombres existentes. |
| 2026-10-20 | **Para el arquitecto:** cada tipo de negocio declara en su perfil su propia lista de especialidades; si no tiene lista, el campo no se muestra en el Admin | Hoy el Admin muestra la lista de productos (moda, tecnología, mascotas…) aunque la tienda sea un hotel, y el hotel ya tiene su propio segundo nivel aparte (`tipoAlojamiento`: hotel, hostal). Ver `FrontendAdmin tienda-form.component.ts` y `BackendNode modules/tenants/rubros.js`, cuya lista cerrada coincide con el CHECK de `docs/sql/tienda_rubro.sql`. | Una sola lista global de especialidades para todos los tipos. |
| 2026-10-20 | **Para el arquitecto:** en el Admin, el campo "Rubro" pasa a llamarse "Especialidad" | En el código y en el proceso, "rubro" es el tipo de negocio; en el Admin, el mismo nombre significa "qué vende". Los dos sentidos se cruzan. | Mantener "Rubro" en la pantalla. |
| 2026-10-20 | El planificador de la fiesta del cliente se escribe como spec propia, [planificador-fiesta](../planificador-fiesta/spec.md) | Nace de este caso pero es una capacidad que también podría servir a `locales`; no depende de la agenda del personal. | Meterlo como requisito de este rubro. |
| 2026-10-20 | Se valida con 5 a 8 agencias antes de la fase 3; las fases 1 y 2 (confianza-reserva) se construyen ya (P2, opción b) | Esas fases sirven a `tours` y `locales` aunque el rubro nuevo no exista, así que no hay riesgo de construir algo que nadie use. | Construir todo sin validar; validar todo antes de empezar. |
| 2026-10-20 | Alcance de servicios: agenda automática para los de personal (animación, show, carita pintada, DJ, fotografía); catering, decoración e inflables "por solicitud" con cotización manual (P3, opción b) | Catering, decoración e inflables dependen de equipamiento, menú o montaje, no del personal; hacerlos bien exige otra capacidad (inventario) que conviene diseñar con lo aprendido. | Todos con agenda desde el inicio; solo animación infantil. |
| 2026-10-20 | Canal de avisos: correo, página de la reserva y botón `wa.me` en el panel (P4, opción b) | No hay API de WhatsApp en el producto; la API es un cambio de infraestructura y de costo. | Solo correo; WhatsApp Business API (se evalúa después). |
| 2026-10-20 | La parte transversal (R1 a R4) pasa a su propia spec, [confianza-reserva](../confianza-reserva/spec.md) (P5, opción a) | Es útil sin el rubro nuevo, entra antes y el QA la prueba en `tours` y `locales`, que ya existen. | Todo junto en esta spec. |

## Para el manual

(Se completará cuando se construya el rubro. La parte transversal tiene su borrador en [confianza-reserva](../confianza-reserva/spec.md).) Borrador para el dueño: "Tu negocio presta servicios en la casa de tus clientes. Registras a tu personal y su agenda, defines los distritos que cubres y armas paquetes con su itinerario (llegada, carita pintada, show). El cliente reserva con su dirección, ve quién irá y cuándo llega, y acepta un contrato claro. Si alguien no puede ir, cambias a la persona y el cliente se entera al instante."
