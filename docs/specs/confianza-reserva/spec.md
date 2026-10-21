# Spec: confianza en la reserva (la reserva dice la verdad)

> Estado: aprobado (Diego, 2026-10-20; aprobación comunicada por la sesión principal) · Fecha: 2026-10-20 · Rubros: `hotel`, `tours`, `eventos`, `locales`, `canchas` y `trabajadores` (transversal a los rubros de reserva)
> Repos: Backend · Admin · Tienda
> Origen: parte A de [servicios-a-domicilio](../servicios-a-domicilio/spec.md), separada por decisión de Diego (P5). Los IDs R1 a R4 y CA1 a CA28 se conservan tal como estaban para no perder la trazabilidad; la parte B (R5 a R12) sigue en esa spec.

## Por qué

Diego contrató por contrato una animación para el cumpleaños de su hijo el 17/10/2026. El 17/10 quisieron reconfirmar y la animadora no contestaba: le escribieron por WhatsApp, por la página, por TikTok y por Instagram. De 8 am a 12 pm pensaron lo peor y casi contratan a otra. Le habían robado el celular. El show se dio, pero no había en ninguna web un comunicado ni una forma de saber si el evento seguía en pie (caso completo en [servicios-a-domicilio](../servicios-a-domicilio/spec.md)).

El problema no es solo de las fiestas. En cualquier reserva (la agencia de tours que sale mañana, el salón del sábado, el hotel de la llegada) el cliente paga por adelantado y **no puede comprobar nada hasta el día**. Toda la confianza cuelga del celular de una persona. Hoy la página de la reserva (`reserva/:token`) no muestra avisos de la tienda ni un estado del día, y nadie reconfirma de forma ordenada.

**Qué se quiere lograr.** (1) Que la reserva muestre siempre la verdad actualizada: avisos de la empresa, estado del día y contacto. (2) Que la empresa reconfirme a tiempo y el sistema la alerte si no lo hizo. (3) Que el contrato sea visible para las dos partes.

## Lo que existe hoy (para no duplicar)

| Pieza | Qué hace hoy | Límite que importa aquí |
|---|---|---|
| Comunicados ([spec](../comunicados/spec.md)) | Modal, barra, listado de "Avisos" y aviso dentro de carrito y checkout (R4.3). Fase 2: correo único a clientes con reserva en las fechas afectadas (R7). | El modal **no** se abre en el rastreo de pedido (R3.3). No hay comunicado en la página de la reserva. El correo de la fase 2 es solo para `hotel`, `tours` y `eventos` (R7.1): faltan `locales` y `canchas`. |
| Página de la reserva `reserva/:token` | Seguimiento con enlace firmado, compartido por los rubros de reserva (familia `reserva`). | No muestra comunicados ni "reconfirmada hoy" ni "en camino". Por verificar en el código si hereda el comunicado global del layout. |
| Contrato de `locales` (LOC-16, LOC-12) | Plantilla con variables, copia con versión y huella (hash), el cliente lo acepta antes de pagar. | Existe solo en `locales`. |
| Alerta de `tours` | "Salen en menos de 24 h sin confirmar" (dashboard de tours). | Es para solicitudes sin aceptar, no para reservas ya confirmadas que hay que reconfirmar. |
| Estados de la reserva | `solicitada`, `aceptada`, `pago_en_revision`, `confirmada`, `completada`, `no_show`, etc. Los vencimientos se calculan al leer, sin cron. | No existe ningún recordatorio programado en reservas (el de cuotas de `locales`, L2.9, sigue sin construir). Sí hay jobs con temporizador para transmisiones y campañas, así que el patrón existe. |
| Avisos al cliente | Correo (Resend) y enlaces `wa.me`. | **No hay API de WhatsApp.** Un aviso automático por WhatsApp no es posible hoy (decisión P4). |

## Conceptos del negocio

| Término | Qué significa |
|---|---|
| Aviso en la reserva | Un comunicado de la tienda que el dueño marca para que se vea también en la página de las reservas. |
| Contacto de respaldo | Un segundo contacto de la empresa (otra persona u otro número) que no depende del celular de quien presta el servicio. |
| Etapa del día | Estado del servicio ese día: por reconfirmar, reconfirmada, en camino, llegó, terminó. No reemplaza el estado comercial. |
| Reconfirmación | Aviso de que "seguimos en pie" que hace la empresa (y puede hacer el cliente) antes del servicio. |
| Plazo de reconfirmación | Tiempo que tiene la empresa, desde la hora programada, para reconfirmar antes de que salte la alerta. |
| Contrato de la reserva | Condiciones de esa reserva, con versión y huella, aceptadas por el cliente y visibles para las dos partes. |

## Rubros: dónde aplica y cómo

| Rubro | ¿Aplica? | Cómo se comporta | Regla de negocio que lo condiciona (`docs/rubros/<rubro>.md`) |
|---|---|---|---|
| `trabajadores` (nuevo) | Sí, es el primer rubro que lo necesita entero | R1 a R4 completos; R2 y R3 encendidas por defecto. | Ver [servicios-a-domicilio](../servicios-a-domicilio/spec.md). Aún no existe `docs/rubros/trabajadores.md`. |
| `productos` | No aplica | Sin reservas. El rastreo de pedido no cambia (CA9). | `productos.md` (no se consultó: no hay efecto). |
| `hotel` | R1 sí; R3 opcional; R2 no | R1: los avisos se ven en la reserva del huésped. R3: una tienda puede activar una reconfirmación (por defecto apagada). R2 no: la entrada y la salida las lleva Recepción. R4: no se toca. | H-15 (`confirmada` no pasa sola a `completada`), H-13 (check-in), H-02 (apartado). Motor de reservas, no PMS. |
| `tours` | R1 sí; R3 sí; R2 opcional | R1: p. ej. aviso "cambio del punto de encuentro" visible en la reserva. R3: reconfirmación un día antes, con alerta si la agencia no reconfirmó. R2: el guía marca "llegó al punto de encuentro" (capacidad opcional). | T-02 (sin cupo, la agencia confirma), T-10 (aviso de reserva próxima), T-11 (anulación sola de solicitudes), dashboard "salen en menos de 24 h sin confirmar". |
| `eventos` | Solo R1 | R1: un aviso como "evento reprogramado" se ve en la página de la compra de entradas. R2 y R3 no aplican: la compra es de entradas con QR, sin personal. | EV-12 y "Lo que NO es este rubro" de `eventos.md`. |
| `locales` | R1 sí; R3 sí; R2 opcional; R4 es su origen | R1 y R3: el día del evento y la reconfirmación a 7 días (hoy CT-18..21 "Día del evento" no existe). R2: "el personal del local abrió". R4: el contrato de `locales` se vuelve capacidad común. | LOC-16 (contrato), LOC-15 (mora), D-3 y D-4 de `locales.md` (reprogramar y suspender sin código; recordatorios sin job). |
| `canchas` | Solo R1 | R1: aviso de cancha cerrada visible en la reserva. R3 queda apagada por defecto (el turno es de 60 a 120 min y se paga al separar). R2 no aplica. | CAN-06, CAN-18 (cancelación sin flujo de cliente, D-07). |

## Requisitos

### R1. Avisos y contacto en la página de la reserva
- **R1.1** Un comunicado vigente de la tienda, marcado por el dueño como "también en las reservas", se muestra en la página de la reserva (`reserva/:token`) arriba del contenido, sin modal y sin poder cerrarse, aunque el visitante ya lo haya cerrado en otra página. Incluye la hora de publicación o de la última edición ("publicado hoy 10:42").
- **R1.2** Al crear el comunicado, el dueño puede limitarlo a las reservas cuyo servicio cae en un rango de fechas. Sin rango, se ve en todas las reservas vivas.
- **R1.3** El aviso por correo de la fase 2 de comunicados (R7 de esa spec) se amplía a `locales`, `canchas` y `trabajadores`, además de `hotel`, `tours` y `eventos`.
- **R1.4** La página de la reserva muestra siempre el contacto de la empresa (WhatsApp o teléfono y correo) y, si la tienda lo registró, un **contacto de respaldo**. Nunca muestra el celular personal de un miembro del personal.
- **R1.5** La tienda de un rubro con personal (hoy `trabajadores`) no se publica sin al menos dos formas de contacto de la empresa, una de ellas distinta del teléfono principal (otro número, otra persona o el correo). En los demás rubros el contacto de respaldo es opcional.

### R2. Etapa del día (en camino, llegó)
- **R2.1** La reserva tiene una etapa del día, visible al cliente: `por reconfirmar`, `reconfirmada`, `en camino`, `llegó`, `terminó`. Es información de seguimiento: no reemplaza el estado comercial (solicitada, confirmada, completada…). El arquitecto decide si se guarda aparte o dentro del estado.
- **R2.2** La etapa la cambia el negocio con un toque, desde el panel o desde un enlace seguro para el personal (sin instalar nada). Cada cambio guarda la hora y quién lo hizo. El panel permite hacerlo desde cualquier dispositivo con sesión, de modo que el servicio no dependa del celular de una persona. *Entrega por fases: el panel va en la fase 1; el enlace del personal llega con la fase 4 de servicios-a-domicilio.*
- **R2.3** La página del cliente muestra la etapa vigente y "actualizado hoy a las HH:MM", y refleja un cambio en un minuto como máximo sin que el cliente recargue.
- **R2.4** Es una **capacidad opcional**, apagada por defecto en `hotel`, `eventos` y `canchas`, y activable por tienda en `tours` y `locales`. `trabajadores` la trae encendida.
- **R2.5** Una etapa marcada por error se corrige con una nota; el historial conserva ambas y la página muestra la vigente.

### R3. Reconfirmación
- **R3.1** Cada reserva confirmada tiene reconfirmaciones programadas. Por defecto: 5 días antes, 1 día antes y la mañana del servicio. La tienda puede cambiar los momentos o apagar cada una. Las que ya pasaron al momento de confirmar no se envían.
- **R3.2** A la hora de cada reconfirmación, el sistema (a) envía un correo al cliente con la fecha, la hora y el enlace a su reserva, y (b) crea una tarea "Reconfirmar" en el panel de la empresa. El panel ofrece además un botón "Avisar por WhatsApp" que abre el mensaje ya redactado (`wa.me`) para que la empresa lo envíe con un toque (decisión P4).
- **R3.3** La empresa reconfirma con un toque; la página muestra "Reconfirmada por [empresa] el 17/10 a las 8:05". El cliente también puede pulsar "Confirmo que los espero"; el negocio lo ve en la reserva. Así lo ven las dos partes.
- **R3.4** Si pasa el plazo (por defecto 2 horas desde la reconfirmación programada) y la empresa no reconfirmó: la reserva aparece en las alertas del panel, se avisa por correo al dueño y al contacto de respaldo, y la página del cliente dice "Aún sin reconfirmar" junto con los contactos de la empresa. Ver P7 sobre qué conviene mostrar al cliente.
- **R3.5** Si el cliente no reconfirma, solo se avisa al negocio. **Nunca** se cancela ni se libera nada solo (mismo criterio que LOC-15).
- **R3.6** El envío es único por reconfirmación y reserva: si el proceso corre dos veces, llega un solo correo. Las horas se calculan en `America/Lima`.
- **R3.7** Es una **capacidad opcional**: encendida por defecto en `trabajadores` y en `tours`; apagada en `hotel`, `locales` y `canchas` hasta que la tienda la active.

### R4. Contrato visible para las dos partes
- **R4.1** Al aceptar la solicitud, el sistema genera el contrato desde una plantilla con las condiciones de **esa** reserva (p. ej. para `trabajadores`: llegada, hora máxima, bloques del itinerario, personajes, duración, precio, adelanto, política de cancelación). Queda con versión y huella, igual que en `locales` (LOC-16).
- **R4.2** El cliente lo acepta antes de pagar. Si las condiciones cambian después (otra hora, otro personaje), se genera una versión nueva y se vuelve a aceptar. Cambiar el precio del paquete después no altera contratos ya aceptados.
- **R4.3** El contrato se ve idéntico (misma versión y huella) en la página de la reserva y en el panel de la empresa.
- **R4.4** Es una **capacidad común**: el contrato de `locales` se reutiliza sin romper `locales`. Cómo se comparte lo decide el arquitecto.

## Criterios de aceptación

Formato: **Dado** … **cuando** … **entonces** … (uno por regla; el QA los prueba tal cual).

**R1. Avisos y contacto**
- CA1 (R1.1, trabajadores): Dado un comunicado vigente marcado "también en las reservas" y una reserva confirmada, cuando el cliente abre el enlace de su reserva, entonces ve el comunicado arriba, sin modal, con título, mensaje y la hora de publicación.
- CA2 (R1.1, tours): Dado un comunicado "Cambio del punto de encuentro" marcado para reservas, cuando el cliente abre su reserva de tour, entonces lo ve; y un minuto después de que el comunicado vence, ya no aparece.
- CA3 (R1.1, eventos): Dado un comunicado "Evento reprogramado" marcado para reservas, cuando el comprador abre la página de su compra de entradas, entonces lo ve.
- CA4 (R1.1, hotel): Dado un comunicado marcado para reservas, cuando el huésped abre su reserva, entonces lo ve; y si el comunicado no está marcado, no aparece.
- CA5 (R1.2, locales): Dado un comunicado limitado al servicio del 17 al 18/10 y dos reservas (una el 17/10, otra el 25/10), cuando cada cliente abre su reserva, entonces solo el del 17/10 lo ve.
- CA6 (R1.3, canchas): Dado un comunicado con reservas de canchas en el rango, cuando el dueño (rol `admin` u `owner`) abre el envío por correo, entonces puede enviarlo (hoy está bloqueado para canchas y locales). Igual en `locales` y en `trabajadores`.
- CA7 (R1.4, trabajadores): Dado una tienda con teléfono principal y un contacto de respaldo, cuando se abre cualquier reserva, entonces se ven ambos contactos y no se ve el celular personal del personal asignado.
- CA8 (R1.5, trabajadores): Dado una tienda con un solo medio de contacto, cuando el dueño intenta publicarla, entonces se le pide agregar un segundo contacto.
- CA9 (R1, productos): Dado una tienda de productos, cuando un cliente abre el rastreo de pedido, entonces la página es igual que antes (no se agrega ningún aviso de reservas).

**R2. Etapa del día**
- CA10 (R2.2, trabajadores): Dado una reserva confirmada del día, cuando el personal asignado toca "Voy en camino" desde su enlace, entonces la página del cliente muestra "En camino" con la hora, en un minuto como máximo y sin recargar. *(Se prueba cuando exista el enlace del personal, fase 4 de servicios-a-domicilio; antes, se prueba con el panel.)*
- CA11 (R2.2, trabajadores): Dado que el dueño perdió su celular, cuando entra al panel desde otro dispositivo y marca "Llegó" en nombre del personal, entonces la etapa cambia y queda registrado quién y a qué hora.
- CA12 (R2.4, tours): Dado una tienda de tours con la capacidad activada, cuando el guía marca "Llegó al punto de encuentro", entonces el pasajero lo ve en su reserva.
- CA13 (R2.4, hotel): Dado una tienda de hotel sin la capacidad, cuando el huésped abre su reserva, entonces no aparece ninguna etapa del día ni botones de seguimiento. Igual en `eventos` y `canchas`.
- CA14 (R2.5, trabajadores): Dado una etapa marcada por error, cuando el negocio la corrige con una nota, entonces el historial guarda las dos y la página del cliente muestra la vigente.

**R3. Reconfirmación**
- CA15 (R3.1/R3.2, trabajadores): Dado un servicio el 17/10 a las 6:30 pm confirmado el 10/10 con los valores por defecto, cuando llegan el 12/10, el 16/10 y la mañana del 17/10, entonces el sistema envía un correo al cliente en cada fecha y crea una tarea "Reconfirmar" en el panel.
- CA16 (R3.1, trabajadores): Dado una reserva confirmada con 20 horas de anticipación, cuando se confirma, entonces no se envía la de 5 días ni la de 1 día (ya pasaron) y sí la de la mañana.
- CA17 (R3.3, trabajadores): Dado una tarea de reconfirmación, cuando la empresa pulsa "Reconfirmar", entonces la página muestra "Reconfirmada por [empresa], hoy 8:05 am". Cuando el cliente pulsa "Confirmo que los espero", entonces el negocio lo ve en la reserva.
- CA18 (R3.4, trabajadores): Dado que pasaron 2 horas de la reconfirmación de la mañana y la empresa no reconfirmó, cuando se evalúa la reserva, entonces aparece en las alertas del panel, se envía correo al dueño y al contacto de respaldo, y la página del cliente dice "Aún sin reconfirmar" con los contactos de la empresa.
- CA19 (R3.5, trabajadores): Dado que el cliente nunca reconfirma, cuando pasa la hora del servicio, entonces el estado y la agenda no cambian solos.
- CA20 (R3.6, trabajadores): Dado que el proceso programado corre dos veces para el mismo momento, cuando se envían las reconfirmaciones, entonces el cliente recibe un solo correo.
- CA21 (R3.7, tours): Dado una tienda de tours con reconfirmación a 1 día, cuando una reserva confirmada sale mañana, entonces la agencia ve la tarea y, si no reconfirma, la alerta; la alerta existente "salen en menos de 24 h sin confirmar" sigue funcionando igual para las solicitudes y una misma reserva no aparece dos veces en el tablero.
- CA22 (R3.7, canchas): Dado una tienda de canchas que no activó la capacidad, cuando hay reservas confirmadas, entonces no se envía ninguna reconfirmación.
- CA23 (R3.7, locales): Dado una tienda de locales con reconfirmación a 7 días activada, cuando falta una semana para el evento, entonces el cliente recibe el correo y el local ve la tarea.
- CA24 (R3.7, hotel): Dado una tienda de hotel con la reconfirmación apagada (por defecto), cuando hay reservas próximas, entonces no se envía nada.
- CA56 (R3.2, tours): Dado una tarea de reconfirmación en el panel de una agencia, cuando pulsa "Avisar por WhatsApp", entonces se abre WhatsApp con el mensaje ya redactado (fecha, hora y enlace de la reserva) y la agencia solo lo envía; el sistema no envía nada por WhatsApp por su cuenta.

**R4. Contrato**
- CA25 (R4.1/R4.3, trabajadores): Dado una solicitud aceptada con llegada 6:30 pm, máximo 6:45 pm, carita pintada hasta 7:15 pm, un muñeco de Bluey y show de 2 horas, cuando el negocio la acepta, entonces se genera un contrato con esas condiciones y el cliente y la empresa ven el mismo documento (misma versión y huella).
- CA26 (R4.2, trabajadores): Dado un contrato aceptado, cuando el negocio cambia el personaje o la hora, entonces se genera una versión nueva que el cliente debe aceptar antes de seguir; y si solo cambia el precio del paquete en el catálogo, el contrato aceptado no cambia.
- CA27 (R4.2, trabajadores): Dado un contrato sin aceptar, cuando el cliente intenta pagar, entonces el sistema se lo impide hasta que lo acepte.
- CA28 (R4.4, locales): Dado el contrato de `locales` ya en uso, cuando se comparte la capacidad, entonces las reservas de locales siguen generando, aceptando y mostrando su contrato igual que antes.

(CA56 es nuevo: sale de la decisión P4. Los demás conservan su número original.)

## Variación por cliente

- **Configuración por tienda** (lo más común): momentos de reconfirmación y plazo (R3), contacto de respaldo (R1.4), qué comunicados se ven en las reservas y con qué rango de fechas (R1.1, R1.2).
- **Capacidad opcional**: etapa del día (R2) y reconfirmación (R3), activables por tienda en `tours` y `locales`, apagadas en `hotel`, `eventos` y `canchas`; `trabajadores` las trae encendidas. El contrato (R4) pasa a capacidad común.
- **Excepción por tienda**: ninguna prevista.

## Fases

Cada fase se prueba y se despliega antes de empezar la siguiente (divide y vencerás). Se empieza por lo mínimo que habría evitado el susto. No depende de que el rubro `trabajadores` exista ni de la validación con agencias (decisión P2): sirve hoy a tours y locales.

| Fase | Qué entrega | Rubros que se benefician | ¿Habría evitado el susto del 17/10? |
|---|---|---|---|
| 1. Lo mínimo: "la reserva dice la verdad" (R1 y la versión del panel de R2) | Comunicados visibles en la página de la reserva (R1.1, R1.2); contacto de la empresa y de respaldo (R1.4); correo de comunicados ampliado a locales y canchas (R1.3); etapa del día cambiada a mano desde el panel, con la hora de la última actualización (R2.1, R2.3, R2.4, R2.5 y R2.2 solo en el panel). | `tours`, `locales`, `hotel`, `eventos`, `canchas` (y la base de `trabajadores`) | **Sí, en gran parte.** Cuando le robaron el celular, la dueña pudo entrar al panel desde otro aparato, publicar "me robaron el celular, escribe al X" y marcar la reserva. El cliente lo habría visto en el enlace de su reserva en lugar de buscar en TikTok. Lo que no evita: que alguien tenga que acordarse de publicar. |
| 2. Reconfirmación automática (R3) | Correos a 5 días, 1 día y la mañana; tarea en el panel; botón "Avisar por WhatsApp" (`wa.me`); alerta por falta de reconfirmación al dueño y al contacto de respaldo. Necesita un proceso programado nuevo en reservas (el mismo que necesita L2.9 de `locales`). | `tours`, `locales`, `hotel` (opcional) y `trabajadores` | **Sí, antes.** A 5 días y a 1 día, la empresa y el cliente se reconfirman con tiempo para el plan B. En la mañana del evento, la ausencia de reconfirmación se vería a las 10 am y no al mediodía. |

**Lo que no está en estas dos fases, a propósito:**
- **R4 (contrato común)** y **R2.2 con el enlace del personal** se construyen dentro de las fases 3 y 4 de [servicios-a-domicilio](../servicios-a-domicilio/spec.md), porque es cuando existe un rubro que los necesita (el contrato de `locales` ya funciona). Los requisitos y criterios siguen siendo de esta spec; el QA los prueba allí.
- Nada de esto empieza antes de que se apruebe el diseño.

Nota para el arquitecto (no es diseño): la fase 2 y L2.9 de `locales` comparten la necesidad de un proceso programado en reservas; conviene resolverlo una sola vez. Hoy los estados vencidos se calculan al leer, sin cron, y eso no sirve para enviar un correo a una hora.

## Fuera de alcance

- Aviso automático por WhatsApp (API de WhatsApp Business): hoy solo hay correo y enlaces `wa.me`. Se evalúa después de validar con agencias (decisión P4).
- Seguimiento por GPS del personal en vivo: la etapa se marca con un toque.
- App móvil nativa para el personal: es un enlace web.
- Cancelar, liberar o reprogramar reservas automáticamente por falta de reconfirmación (R3.5).
- Avisar por correo a clientes con pedidos de productos (la fase 2 de comunicados cubre solo reservas).
- Firma electrónica certificada. El contrato registra aceptación con nombre, documento, fecha y hora, como en `locales`.
- Que la plataforma devuelva dinero o medie en reclamos.
- Idiomas distintos del español en la primera versión de los textos nuevos.
- Rubro `productos`: el rastreo de pedido no cambia.

## Preguntas abiertas

La numeración P7, P9 y P11 viene de [servicios-a-domicilio](../servicios-a-domicilio/spec.md) para no perder el rastro. P16 y P17 son nuevas. Ninguna bloquea el diseño; las resuelve Diego o se validan con agencias.

- [ ] **P7. Qué ve el cliente cuando la empresa no reconfirmó** (R3.4). Opciones: (a) mensaje honesto "Aún sin reconfirmar" con los contactos; (b) nada, solo alerta interna a la empresa. Recomiendo (a): es lo que el cliente del caso necesitaba, pero puede incomodar a la empresa. **Validar con agencias** (fase 0 de servicios-a-domicilio). Y para "en camino" (R2): botón manual, sin GPS (privacidad, batería y complejidad).
- [ ] **P9. Momento de la reconfirmación de la mañana** (R3.1). Por defecto "8:00 am del día del servicio", pero un servicio a las 10 am queda corto. Opciones: hora fija (8:00), o "3 horas antes de la llegada pero no antes de las 7:00". Recomiendo la segunda; la tienda puede cambiarla.
- [ ] **P11. Comunicados en la reserva** (R1.1 y R1.2). ¿Se ven en toda reserva viva o solo en las afectadas por rango de fechas? Recomiendo lo segundo como opción, con "todas" por defecto.
- [ ] **P16. Plazo de reconfirmación** (R3.4). ¿2 horas por defecto es adecuado para la mañana del servicio, o conviene más corto (1 hora) cerca de la hora de llegada? Recomiendo 2 horas y que lo ajuste la tienda; medir con agencias reales.
- [ ] **P17. Contacto de respaldo en tiendas ya existentes** (R1.4 y R1.5). R1.5 lo exige solo en `trabajadores`. En `tours`, `locales`, `hotel` y `canchas` queda opcional. ¿Se sugiere con un aviso en el panel a las tiendas que no lo tienen? Recomiendo sí, sin bloquear.
- [ ] **Verificación pendiente del código (no es decisión de Diego):** si `reserva/:token` hereda hoy el comunicado global del layout de la tienda y cómo convive con R1.1. Lo revisa el arquitecto en `impacto.md`.

## Decisiones tomadas

| Fecha | Decisión | Por qué | Alternativa descartada |
|---|---|---|---|
| 2026-10-20 | La parte transversal se separa en su propia spec (P5, opción a) | Es útil sin el rubro nuevo, entra antes y el QA la prueba en `tours` y `locales`, que ya existen. | Todo junto en servicios-a-domicilio. |
| 2026-10-20 | Se construyen las fases 1 y 2 sin esperar la validación con agencias (P2, opción b) | Sirven a `tours` y `locales` aunque `trabajadores` no exista, así que no hay riesgo de construir algo que nadie use. La validación decide la fase 3 de servicios-a-domicilio. | Validar todo antes de empezar; construir todo sin validar. |
| 2026-10-20 | Canal de avisos: correo, página de la reserva y botón `wa.me` en el panel (P4, opción b) | No hay API de WhatsApp en el producto; la API es un cambio de infraestructura y de costo. La página con "actualizado a las HH:MM" es el canal principal y el correo es el empujón. | Solo correo; WhatsApp Business API (se evalúa después). |
| 2026-10-20 | Mantener los IDs R1 a R4 y CA1 a CA28 de la spec de origen | Trazabilidad con el QA y con servicios-a-domicilio, que los cita. | Renumerar. |

## Para el manual

Borrador para el dueño: "Tus clientes pagan por adelantado un servicio que se presta después. Con esta función, cada reserva tiene su propia página: ahí ven el contrato, si todo sigue en pie y los avisos de tu tienda. Si algo cambia, publicas un aviso desde cualquier dispositivo y lo ven ahí mismo. El sistema te recuerda reconfirmar con el cliente 5 días antes, 1 día antes y la mañana del servicio, y te avisa si se te pasó. Puedes marcar 'en camino' y 'llegó' con un toque, y tu cliente lo ve."
