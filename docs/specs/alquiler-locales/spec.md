# Spec: Alquiler de locales para eventos (quinceaños, promociones, cumpleaños, conferencias)

> Estado: **en implementación** (2026-10-09). Fase 1 backend completa (L1.1–L1.15); faltan el admin, la tienda y el recorrido L1.41 (ver [tasks.md](tasks.md)).
> Diseño técnico: [plan.md](plan.md). Tareas: [tasks.md](tasks.md).
> Investigación de mercado: [analisis-mercado.md](analisis-mercado.md). Casos de uso: [casos-de-uso.md](casos-de-uso.md).
> Base: [mini-booking](../mini-booking/spec.md) (vitrina, solicitud, bandeja, pago manual, seguimiento) y [hospedaje-completo](../hospedaje-completo/spec.md) (inventario con bloqueo, temporadas, confirmación inmediata).
> Antecedente: [verticales-reserva/analisis-infhotel.md](../verticales-reserva/analisis-infhotel.md) ya proponía los salones como "recurso por franja horaria".
> Repos: BackendNode, FrontendAdmin, FrontendStore.

## Problema

En Perú hay miles de locales que se alquilan para quinceaños, fiestas de promoción, cumpleaños y conferencias. Casi todos venden igual:

1. El cliente ve un video en TikTok, un anuncio en un portal o una recomendación, y escribe por WhatsApp.
2. Pregunta si la fecha está libre y cuánto cuesta. El dueño responde con precios "por interno", que cambian según el día (el sábado es más caro), la temporada y el número de invitados.
3. El cliente visita el local, negocia el paquete y **separa la fecha** con un adelanto (30–50 %) o un monto fijo (por ejemplo S/ 500).
4. Paga el saldo en cuotas hasta una fecha límite (por ejemplo 30 días antes) y deja una **garantía por daños**.
5. El día del evento recibe el local, trae o no a sus proveedores (catering, DJ, hora loca), puede pasarse de hora y, al final, se revisan daños y se devuelve la garantía.

**Lo que falla:** la disponibilidad vive en la cabeza del dueño o en un cuaderno, y a veces se vende la misma fecha dos veces. Los pagos parciales se pierden entre capturas de Yape. No queda claro qué se devuelve si el cliente cancela o reprograma, y la garantía se liquida "a ojo".

**Lo que no falla:** el dueño responde rápido, negocia y quiere decidir. Se vende por WhatsApp y así va a seguir.

## Objetivo

Que el dueño de un local tenga una **vitrina con calendario real** y una bandeja donde:
- publica sus salones, turnos, paquetes y precios por día;
- el cliente ve qué fechas están libres y cotiza solo, sin "precio por interno";
- **una fecha nunca se vende dos veces**;
- cada reserva lleva su **plan de pagos** (separación, cuotas, saldo, garantía) y su contrato aceptado;
- reprogramar, cancelar y devolver siguen reglas que el cliente aceptó, y el sistema calcula los montos;
- la garantía se liquida con un registro (horas extra, daños, devolución).

**No** es un sistema de producción de eventos: el catering, la decoración y los proveedores se coordinan fuera. La plataforma maneja la fecha, el dinero y las reglas.

## Alcance

**Incluye**
- Tipo de negocio nuevo: `locales`.
- Salones (uno o varios por tienda) con aforo, turnos, tiempo de preparación entre turnos y fechas cerradas.
- Tres modalidades: **solo local**, **paquete** (precio fijo o por persona) y **por horas**.
- Precio por día de la semana, temporadas y promociones (cupones existentes).
- Disponibilidad real por salón y franja horaria, con bloqueo en la base de datos.
- Cotización guardada con vigencia y precio congelado.
- Visitas al local agendadas.
- Plan de pagos: separación o adelanto, cuotas, saldo, garantía. Pago manual con captura (como hoy) y pasarela cuando exista para reservas (T1.14 de mini-booking).
- Contrato generado desde una plantilla y aceptado por el cliente.
- Reprogramación con historial, cancelación con política por tramos y devoluciones registradas.
- Día del evento: entrega del local, proveedores externos, horas extra, daños y liquidación de la garantía.
- Fiesta de promoción: participantes (alumnos) con cuota y enlace de pago propio.
- Recordatorios de cuotas por correo y links `wa.me` (sin API de WhatsApp).
- Reutiliza: catálogo (`productos`), `pedidos`, `pagos`, `reservas`, `cierres_fecha`, `hotel_temporadas`, cupones, bandeja, seguimiento, Libro de Reclamaciones y asesor IA.

**No incluye**
- Gestión de proveedores internos (compras, personal, órdenes de cocina).
- Montajes con inventario de mobiliario o equipos (proyectores con stock).
- Emisión de comprobantes electrónicos (igual que el resto de la plataforma).
- Firma electrónica certificada del contrato.
- API de WhatsApp Business.
- Otras monedas: todo en soles (PEN).

## Actores

| Actor | Qué hace |
|---|---|
| Cliente (con o sin cuenta) | Cotiza, agenda visita, solicita, acepta el contrato, paga, reprograma o cancela |
| Delegado de promoción | Cliente que reserva para un comité de padres y administra la lista de alumnos |
| Apoderado | Paga la cuota de un alumno desde su propio enlace |
| Negocio: owner / admin | Configura salones, paquetes, precios, política y contrato. Hace todo lo de editor |
| Negocio: editor (encargado) | Responde solicitudes, verifica pagos, entrega el local, registra horas extra y daños |
| Negocio: viewer | Ve la bandeja y el calendario sin actuar |
| Plataforma | Calcula precios y disponibilidad, bloquea fechas, vence apartados, envía recordatorios, calcula devoluciones |

## Casos de uso

Los casos completos, con su flujo paso a paso, están en [casos-de-uso.md](casos-de-uso.md). Aquí cada caso apunta a los requisitos que lo cubren.

### Felices

| ID | Caso | Requisitos |
|---|---|---|
| CU-01 | Consultar disponibilidad y cotizar | R2, R3, R4 |
| CU-02 | Agendar visita al local | R5 |
| CU-03 | Reservar solo local con adelanto y saldo | R6, R7, R8 |
| CU-04 | Reservar paquete con separación y cuotas | R6, R7, R8 |
| CU-05 | Reservar fiesta de promoción por alumno | R13 |
| CU-06 | Reservar por horas con pago total en línea | R6.6, R7 |
| CU-07 | Ejecutar el evento y cerrar la reserva | R11 |

### Tristes

| ID | Caso | Requisitos |
|---|---|---|
| CT-01 | La cotización vence sin solicitud | R4.3 |
| CT-02 | El dueño no responde dentro del plazo | R6.4 |
| CT-03 | El cliente no paga el adelanto | R6.4 |
| CT-04 | La captura de pago no corresponde | R7.4 |
| CT-05 | El dueño rechaza la solicitud | R6.3 |
| CT-06 | El cliente no paga el saldo o una cuota | R7.6, R7.7 |
| CT-07 | El cliente reprograma con anticipación | R9.1–R9.4 |
| CT-08 | No hay fechas que le sirvan | R9.5 |
| CT-09 | Reprograma dentro del plazo mínimo | R9.6 |
| CT-10 | El local pide reprogramar | R9.7 |
| CT-11 | Fuerza mayor externa | R9.8 |
| CT-12 a CT-17 | Cancelaciones por motivo y anticipación | R10 |
| CT-18 | El cliente no se presenta | R11.6 |
| CT-19 | Exceso de aforo u horario; interviene la municipalidad | R11.4, R11.5 |
| CT-20 | Los daños superan la garantía | R11.5 |
| CT-21 | Reclamo por servicio incompleto | R11.7 |

### Errores del sistema

| ID | Caso | Requisitos |
|---|---|---|
| CE-01 | Dos clientes reservan la misma fecha a la vez | R3.4 |
| CE-02 | El dueño vendió la fecha por fuera | R3.6, R12.3 |
| CE-03 | Calendario desactualizado | R3.5 |
| CE-04 | Turnos sin tiempo de preparación | R2.4 |
| CE-05 | Cierre o baja de aforo con reservas existentes | R2.6, R3.7 |
| CE-06 | Fecha corrida por la zona horaria | R1.3 |
| CE-07 | Cambio de precio entre cotización y pago | R4.2 |
| CE-08 | Aforo mayor al de la licencia | R2.2 |
| CE-09 | Caída al enviar la solicitud | R14.1 |
| CE-10 | Pasarela cobra y no llega el webhook | R14.2 |
| CE-11 | Doble cobro | R14.3 |
| CE-12 | Base de datos caída | R14.4 |
| CE-13 | Falla el correo | R14.5 |
| CE-14 | Falla la subida de la captura | R14.6 |
| CE-15 | No corre el job de recordatorios | R14.7 |
| CE-16 | Rate limit en un pico de tráfico | R14.8 |
| CE-17 | Sesión del admin expira al verificar | R14.9 |

## Flujo principal

```
Cliente                                   Plataforma                              Negocio
 elige salón, fecha, turno, paquete  →    disponibilidad + precio del día
 y aforo                                  cotización con vigencia (precio congelado)
 [Agendar visita] ─────────────────────────────────────────────────────────────→ confirma visita
 envía solicitud (DNI, tipo de evento) →  reserva "solicitada", fecha apartada N h ← aviso + badge
                                                                                   Aceptar (contrato + plan de pagos)
 acepta contrato, paga separación      →  "pago en revisión"                    ← aviso
                                                                                   Verificar pago
 ← confirmación: fecha BLOQUEADA, plan de pagos, saldo
 paga cuotas / saldo / garantía        →  recordatorios −7, −3, −1 días
 día del evento                           entrega, proveedores, horas extra       ← encargado registra
                                          liquidación: garantía − horas extra − daños → devolución
                                          "completada" + pedido de reseña
```

Variante `pago_directo` (CU-06): sin solicitud. El cliente acepta el contrato y paga; la fecha queda apartada mientras paga y se bloquea al confirmarse el pago.

## Requisitos

Formato: *Cuando [condición], el sistema debe [comportamiento].*

### R1 — Tipo de negocio y configuración
- **R1.1** Al crear la tienda se puede elegir `locales`. El admin muestra Salones, Paquetes, Calendario, Reservas, Visitas, Fechas cerradas y Configuración; oculta stock, variantes y envíos.
- **R1.2** La configuración de reservas suma, para locales:
  - forma de separar la fecha: `porcentaje` (adelanto %) o `monto_fijo`;
  - horas que dura el apartado de una solicitud aceptada sin pagar (por defecto 48 h);
  - horas que tiene el negocio para responder una solicitud (por defecto 24 h);
  - días antes del evento para el saldo (por defecto 30) y número máximo de cuotas (por defecto 3);
  - garantía por daños (monto fijo; 0 = sin garantía) y días para devolverla (por defecto 3);
  - días antes del evento para confirmar el número de invitados (por defecto 7);
  - reprogramaciones permitidas (por defecto 1) y anticipación mínima para reprogramar (por defecto 30 días); cargo por reprogramar (monto, por defecto 0);
  - **política de cancelación por tramos** (R10.2);
  - días de gracia antes de cancelar por falta de pago (por defecto 3);
  - vigencia de la cotización (por defecto 7 días);
  - plantilla del contrato (R8);
  - proveedores externos: permitidos sí/no, tarifa de coordinación, descorche por botella;
  - hora tope de fin de evento (ordenanza municipal, por defecto 03:00).
- **R1.3** Todas las fechas y horas se interpretan en `America/Lima`. La fecha del evento se guarda como fecha local más horas de inicio y fin; una franja que pasa la medianoche pertenece a la fecha en que empieza.

### R2 — Salones, turnos y paquetes
- **R2.1** Un salón es un producto con fotos, descripción, metraje, servicios incluidos (mesas, sillas, cocina, barra, sonido para DJ, estacionamiento) y ubicación.
- **R2.2** Cada salón tiene un **aforo máximo**, que es el de su licencia o ITSE. Ninguna cotización ni reserva puede superarlo.
- **R2.3** Cada salón tiene uno o más **turnos** con nombre, hora de inicio y fin y días en que se ofrece (por ejemplo "Día 10:00–17:00", "Noche 19:00–03:00", "Día completo"). Si el salón admite **alquiler por horas**, define precio por hora, mínimo de horas y franja en la que se puede reservar.
- **R2.4** Cada salón define un **tiempo de preparación** (por defecto 60 min) que se suma antes y después de cada reserva al calcular la disponibilidad.
- **R2.5** Cada salón tiene uno o más **paquetes**:
  - `solo_local`: precio por turno;
  - `paquete`: precio fijo o por persona, con mínimo y máximo de personas, lista de lo que incluye (buffet, DJ, hora loca, decoración, foto) y horas incluidas;
  - `por_horas`: usa el precio por hora del salón.
  Cada paquete define el precio de la hora extra y en qué tipos de evento se ofrece (quinceaños, promoción, cumpleaños, boda, corporativo, conferencia, otro).
- **R2.6** El precio de un turno o paquete puede variar por día de la semana (lunes a jueves, viernes, sábado, domingo y feriado). Las temporadas (`hotel_temporadas`) se aplican como ajuste porcentual.
- **R2.7** Si el dueño cierra una fecha, baja el aforo o desactiva un turno con reservas en curso, el sistema lo impide y lista las reservas afectadas. Las puede reprogramar por R9.7 o cancelar por R10.4.

### R3 — Disponibilidad
- **R3.1** La vitrina muestra un calendario por salón con cada fecha en uno de cuatro estados: libre, parcialmente ocupada (queda algún turno), ocupada y cerrada.
- **R3.2** Ocupan una franja las reservas `aceptada` con apartado vigente, `pago_en_revision`, `confirmada` y `suspendida` (mientras dure el saldo a favor, R9.8). Una solicitud sin responder **aparta** la fecha solo durante el plazo de respuesta (R6.4).
- **R3.3** Una franja ocupada es [inicio − preparación, fin + preparación).
- **R3.4** Dos reservas no pueden ocupar franjas que se crucen en el mismo salón. La base de datos lo garantiza; si dos clientes envían a la vez, el segundo recibe `409 FECHA_NO_DISPONIBLE` con hasta 3 fechas o turnos libres cercanos.
- **R3.5** La disponibilidad se revalida al cotizar, al enviar la solicitud, al aceptar y al confirmar un pago. Nunca se confía en lo que mostró el calendario.
- **R3.6** El dueño puede **bloquear una fecha a mano** ("vendida por WhatsApp", "evento propio") en dos clics desde el calendario. Ese bloqueo ocupa la franja igual que una reserva.
- **R3.7** Al aceptar una solicitud, el admin advierte si la franja choca con un bloqueo manual o con otra reserva; no deja aceptar si choca con una `confirmada`.

### R4 — Cotización
- **R4.1** El cliente elige salón, tipo de evento, fecha, turno o horas, paquete e invitados. El servidor calcula el total desglosado (precio del día, temporada, cupón, extras, tarifa de proveedores externos) y la separación que tendría que pagar.
- **R4.2** La cotización se guarda con su detalle y **precio congelado** hasta su vencimiento. Una solicitud creada desde una cotización vigente respeta ese precio aunque la tarifa cambie después.
- **R4.3** Una cotización vencida no se puede usar. Un día antes de vencer, si el cliente dejó correo, se le envía un recordatorio con el enlace.
- **R4.4** El dueño puede crear una cotización desde el admin (después de una visita o un chat) con ajustes de precio y motivo, y compartirla por enlace o WhatsApp.
- **R4.5** La cotización guarda el **canal de origen** (TikTok, Instagram, Facebook, Google, portal, recomendación, cartel, otro) para que el dueño sepa de dónde vienen sus clientes.
- **R4.6** Una cotización no aparta la fecha.

### R5 — Visitas al local
- **R5.1** El dueño configura los días y horas en que recibe visitas.
- **R5.2** El cliente pide una visita desde la ficha o desde su cotización. Queda `solicitada` hasta que el negocio la confirma o propone otra hora.
- **R5.3** Se envía un recordatorio por correo el día anterior y la página de la visita ofrece "Avisar por WhatsApp".
- **R5.4** Después de la visita, el negocio la marca `realizada` o `no_asistio` y puede crear una cotización desde ella.

### R6 — Solicitud y respuesta
- **R6.1** La solicitud pide los datos del titular (como mini-booking R5.1), el tipo de evento, el nombre del agasajado o de la promoción (opcional), el número de invitados y, si los habrá, los proveedores externos.
- **R6.2** Al enviarla, la reserva queda `solicitada` con código y página de seguimiento, y la franja queda apartada durante el plazo de respuesta.
- **R6.3** El negocio puede **aceptar** (con ajuste de monto y motivo) o **rechazar** con motivo. Al rechazar, el cliente ve fechas libres cercanas.
- **R6.4** Si el negocio no responde dentro del plazo, la solicitud pasa a `vencida` y la franja se libera. Una solicitud aceptada sin pago vence al terminar su apartado. Ambas cosas se calculan al leer (mini-booking R5.6) y el bloqueo vencido se limpia en la siguiente transacción que toque ese salón.
- **R6.5** Al aceptar, el sistema genera el **contrato** (R8) y el **plan de pagos** (R7.1).
- **R6.6** Con `pago_directo` no hay solicitud: el cliente acepta el contrato y paga la separación (o el 100 % en alquiler por horas); la franja queda apartada mientras paga (por defecto 30 min con pasarela y 2 h con pago manual).

### R7 — Plan de pagos
- **R7.1** Cada reserva tiene un plan con cuotas. Cada cuota tiene concepto (`separacion`, `cuota`, `saldo`, `garantia`, `hora_extra`, `danos`, `diferencia`, `cargo_reprogramacion`), monto, fecha de vencimiento y estado (`pendiente`, `en_revision`, `pagada`, `anulada`).
- **R7.2** El plan por defecto: separación al aceptar; el resto del total repartido en hasta N cuotas iguales que vencen antes de la fecha límite del saldo; la garantía vence junto con el saldo. El negocio puede editar montos y fechas antes de que el cliente pague la primera cuota.
- **R7.3** El cliente paga cuota por cuota desde su seguimiento, con los métodos de la tienda. Con pago manual sube la captura de **esa** cuota.
- **R7.4** El negocio verifica o rechaza cada captura (mini-booking R7.3). La **primera cuota verificada confirma la reserva** y bloquea la fecha de forma definitiva.
- **R7.5** El seguimiento y la confirmación muestran total, pagado, saldo, próxima cuota y garantía en custodia.
- **R7.6** Recordatorios de cuota por correo 7, 3 y 1 días antes de su vencimiento, más un botón "Recordar por WhatsApp" en el admin.
- **R7.7** Una cuota vencida sin pagar marca la reserva **en mora** (indicador, no estado). Pasados los días de gracia, el admin propone cancelar por falta de pago (CT-06) con la devolución que calcula R10. El sistema nunca cancela solo una reserva confirmada.
- **R7.8** `pedidos.monto_pagado` suma las cuotas pagadas **sin** la garantía. La garantía se lleva aparte porque se devuelve.

### R8 — Contrato
- **R8.1** El negocio define una plantilla con variables: datos del local y del titular, salón, fecha, turno, horario, aforo, tipo de evento, total, plan de pagos, garantía, política de cancelación y de reprogramación, reglas de proveedores, ruido y horario.
- **R8.2** Al aceptar la solicitud, el sistema genera el contrato y guarda una copia con versión y hash.
- **R8.3** El cliente debe aceptar el contrato antes de pagar: casilla de aceptación, con su nombre y DNI ya registrados, fecha, hora e IP.
- **R8.4** El contrato aceptado se puede ver, imprimir y guardar como PDF desde el navegador (como la confirmación de mini-booking).
- **R8.5** Una reprogramación o un ajuste de monto genera una adenda que el cliente acepta igual.

### R9 — Reprogramación
- **R9.1** El cliente puede pedir reprogramar una reserva `confirmada` desde su seguimiento si falta más que la anticipación mínima y no agotó las reprogramaciones permitidas.
- **R9.2** El sistema muestra las fechas y turnos libres con la diferencia de precio de cada una.
- **R9.3** Al elegir, la fecha nueva se aparta y el negocio aprueba el cambio. Al aprobar, en **una transacción**: se libera la franja original, se bloquea la nueva, se recalcula el plan (lo pagado se traslada, la diferencia y el cargo de reprogramación se agregan como cuotas; si la fecha nueva es más barata, la diferencia queda a favor del cliente y se descuenta del saldo).
- **R9.4** La reserva sigue `confirmada`. Se guarda un historial con fecha anterior, fecha nueva, actor, motivo y diferencia.
- **R9.5** Si no hay fechas que le sirvan, el cliente puede anotarse en lista de espera para un rango de fechas. Cuando una franja de ese rango se libera, se le avisa por correo; no se aparta nada.
- **R9.6** Si falta menos que la anticipación mínima, el botón no aparece. El negocio puede reprogramar igual desde el admin, como excepción registrada.
- **R9.7** Si el **negocio** reprograma (corte de luz, obra, clausura, doble venta), no hay cargo ni diferencia para el cliente, la reprogramación no cuenta contra su límite y el cliente puede elegir la devolución del 100 % en lugar de la fecha nueva.
- **R9.8** Fuerza mayor externa (estado de emergencia, restricción de aforo, paro): el negocio pasa la reserva a `suspendida`. Lo pagado queda como **saldo a favor** con vencimiento (por defecto 6 meses). El cliente elige fecha nueva dentro de ese plazo sin cargo; si vence sin elegir, se aplica lo que diga el contrato.

### R10 — Cancelación y devoluciones
- **R10.1** El cliente puede cancelar sin costo una reserva `solicitada` o `aceptada` sin pagos (mini-booking R12.1).
- **R10.2** La **política por tramos** dice, según los días que faltan para el evento, qué porcentaje se devuelve de la separación y del resto de lo pagado. Ejemplo por defecto:

  | Días antes del evento | Separación | Resto de lo pagado |
  |---|---|---|
  | 60 o más | 0 % | 100 % |
  | 30 a 59 | 0 % | 50 % |
  | menos de 30 | 0 % | 0 % |

  La garantía se devuelve siempre completa si el evento no ocurrió.
- **R10.3** Una reserva `confirmada` la cancela el negocio desde el admin (a pedido del cliente o por falta de pago), eligiendo el motivo: `personal`, `falta_de_pago`, `cambio_de_opinion`, `comite`, `fuerza_mayor`, `negocio`. El sistema calcula la devolución según el motivo y el tramo; el negocio puede cambiarla con un motivo registrado.
- **R10.4** Si el motivo es `negocio` o `fuerza_mayor` (sin saldo a favor), la devolución propuesta es el 100 % de lo pagado.
- **R10.5** Cada devolución se registra con monto, medio (pasarela o manual), constancia y fecha. Con pasarela se pide el reembolso al proveedor; con pago manual, el negocio sube la constancia de la transferencia.
- **R10.6** Al cancelar, la franja se libera en la misma transacción y se avisa a la lista de espera (R9.5).
- **R10.7** El cliente ve en su seguimiento el motivo, lo devuelto y las constancias.

### R11 — Día del evento y liquidación
- **R11.1** Vista **"Eventos de la semana"** con cada reserva confirmada: horario, aforo, saldo pendiente y alertas (saldo sin pagar, invitados sin confirmar).
- **R11.2** El encargado registra la **entrega del local**: inventario con fotos (mesas, sillas, menaje) y hora de ingreso.
- **R11.3** Registra los proveedores externos que ingresan y el descorche (cantidad × tarifa), que se agregan como cargos.
- **R11.4** Registra las **horas extra** (cantidad × tarifa del paquete). No puede pasar de la hora tope municipal (R1.2); si se intenta, el admin lo advierte.
- **R11.5** Al cerrar, registra el estado del local: "sin novedad" o daños con fotos, descripción y monto; e incidentes (exceso de aforo, intervención municipal, multa) con su monto. El sistema calcula la **liquidación**: garantía − horas extra − descorche − daños − penalidades. Si sale negativa, crea una cuota de cobro adicional; si sale positiva, una devolución pendiente que vence según R1.2.
- **R11.6** Si el cliente no se presenta, el encargado marca `no_show`: se retiene lo pagado según el contrato y la garantía se devuelve.
- **R11.7** El cliente puede abrir una hoja del Libro de Reclamaciones ligada a la reserva (como hoy con un pedido).
- **R11.8** La reserva pasa a `completada` sola al pasar la hora de fin (mini-booking R8.5). La garantía tiene su propio estado (`en_custodia`, `por_devolver`, `devuelta`, `aplicada`) y la bandeja muestra las garantías pendientes de devolver. Al completarse se pide la reseña.

### R12 — Bandeja, calendario y avisos
- **R12.1** La bandeja de reservas suma pestañas para locales: **Por responder**, **Pagos por verificar**, **Próximos eventos**, **Cuotas vencidas**, **Garantías por devolver** e **Historial**.
- **R12.2** Vista **Calendario** por salón (mes y semana) con reservas, apartados, bloqueos manuales y cierres. Desde una franja libre se crea un bloqueo o una cotización.
- **R12.3** Al aceptar una solicitud, si la tienda tiene bloqueos manuales en esa fecha, el admin pregunta "¿Vendiste esta fecha por otro medio?" antes de seguir.
- **R12.4** Cada acción ofrece "Responder por WhatsApp" con una plantilla editable (aceptada con enlace de pago y contrato, rechazada con fechas libres, cuota por vencer, confirmada, reprogramada, cancelada con devolución).
- **R12.5** Reporte simple por canal de origen (R4.5): cotizaciones, solicitudes y reservas confirmadas por canal en el mes.

### R13 — Fiesta de promoción
- **R13.1** Un paquete por persona puede marcarse "promoción": pide nombre del colegio y de la promoción, número estimado de alumnos e invitados por alumno, y una fecha de corte de la lista.
- **R13.2** El delegado paga la separación y, ya confirmada la reserva, carga la lista de alumnos (nombre, apoderado y WhatsApp, a mano o pegando una lista).
- **R13.3** Cada alumno tiene una cuota y un **enlace de pago propio** para su apoderado, que paga como cualquier cuota (captura o pasarela).
- **R13.4** El delegado ve un panel con el avance: alumnos que pagaron, que deben y total recaudado. Puede compartir por WhatsApp el enlace de cada familia.
- **R13.5** En la fecha de corte, el delegado cierra la lista. El total se recalcula con los alumnos finales; si queda bajo el mínimo del paquete, el admin lo avisa y el negocio decide entre mantener el precio mínimo o cancelar (CT-15).
- **R13.6** Los datos de los alumnos y apoderados los ven solo el delegado y el negocio.

### R14 — Robustez
- **R14.1** Crear una solicitud, una cuota o una devolución lleva `idempotency_key`: un reintento devuelve lo mismo sin duplicar.
- **R14.2** Un pago de pasarela sin webhook queda `pendiente`. Un proceso de conciliación consulta el cargo en el proveedor y confirma; el seguimiento muestra "Pago en verificación" mientras tanto.
- **R14.3** Un mismo intento no genera dos cargos. Si llega un segundo cargo para una cuota ya pagada, se registra y se propone su devolución automática.
- **R14.4** Si la base de datos no responde, la vitrina muestra una página de mantenimiento con el WhatsApp del local y no intenta cobrar.
- **R14.5** Cada correo que falla se reintenta y queda registrado. La página de seguimiento es la fuente de verdad y el negocio puede reenviar el correo desde el admin.
- **R14.6** La captura acepta imagen o PDF de hasta 5 MB. Si la subida falla, el cliente puede enviar solo el número de operación y la cuota queda `en_revision` igual.
- **R14.7** El job de recordatorios es idempotente (cada recordatorio se envía una vez) y registra su última corrida; si no corrió en 24 h, el admin muestra un aviso. La mora (R7.7) solo se marca si el recordatorio de 1 día salió o si la cuota venció hace más de los días de gracia.
- **R14.8** El storefront tiene límites separados para lectura (calendario, fichas) y escritura (cotizar, solicitar, subir captura), para que un pico de visitas no bloquee las reservas.
- **R14.9** Las acciones del admin son idempotentes: si la sesión se renueva a mitad de una acción, repetirla no duplica nada.

### R15 — Asesor IA y legal
- **R15.1** El asesor de ventas responde con datos reales: salones, aforo, paquetes, qué incluye cada uno y fechas libres. Ofrece el enlace a la cotización con los datos precargados. Nunca escribe montos en el texto (regla actual).
- **R15.2** Los datos del titular, de los alumnos y de los apoderados se usan solo para la reserva (Ley 29733), con la casilla de aceptación de mini-booking.
- **R15.3** Comprobante: la plataforma registra qué pide el cliente (boleta o factura) y el negocio lo emite con su sistema, al pagar cada cuota o al final, según su configuración.

## Estados de una reserva de local

```
solicitada ──aceptar──▶ aceptada ──1.ª cuota (captura)──▶ pago_en_revision ──verificar──▶ confirmada ──▶ completada
     │                     │  └──1.ª cuota (pasarela)──────────────────────────────────▶ │  ▲   │
     ├─rechazar─▶ rechazada├─fin del apartado▶ vencida      └─no corresponde─▶ aceptada  │  │   ├─reprogramar─▶ confirmada (fecha nueva)
     ├─sin respuesta▶ vencida └─cliente cancela─▶ cancelada                              │  │   ├─cancelar─▶ cancelada (+ devolución)
     └─cliente cancela─▶ cancelada                                                         │  │   ├─no llegó─▶ no_show
                                                                                           │  │   └─fuerza mayor─▶ suspendida
                                                                         suspendida ──fecha nueva──┘  └─vence saldo a favor─▶ cancelada
```

Lo nuevo frente a mini-booking: `suspendida`, la transición `reprogramar` (no cambia el estado), la cancelación con devolución calculada y la confirmación con la **primera** cuota. La mora y la garantía son indicadores aparte, no estados.

## Métricas de éxito

- Cero fechas vendidas dos veces dentro del sistema.
- % de reservas confirmadas con todas sus cuotas pagadas antes de la fecha límite.
- Tiempo desde la captura hasta la verificación (meta: < 30 min en horario de atención).
- % de cotizaciones que terminan en reserva confirmada, por canal de origen.
- Días promedio para devolver la garantía (meta: ≤ 3).

## Preguntas abiertas

1. **Varios salones por tienda.** Propuesta: sí, cada salón es un producto con su propio calendario (R2.1). Confirmar.
2. **Garantía por pasarela.** Propuesta: se cobra como una cuota más (pasarela o manual) y se devuelve como devolución registrada. Una "preautorización" sin cobro no se ofrece porque Yape y transferencia no la permiten. Confirmar.
3. **Firma del contrato.** Propuesta: casilla de aceptación con nombre, DNI, fecha, hora e IP (R8.3); sin firma manuscrita ni certificada. Confirmar.
4. **Feriados.** ¿Se precargan los feriados nacionales para la tarifa de feriado (R2.6) o los marca el dueño?
5. **Turnos que pasan la medianoche y la hora tope.** ¿La hora tope (por defecto 03:00) es por tienda o por salón? Varía por distrito.
</content>
</invoke>
