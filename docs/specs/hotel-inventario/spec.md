# Spec: inventario, anulación y reprogramación de hotel

> Estado: **fase 0 implementada** (2026-10-10); fases 1–5 propuestas. Tareas: [tasks.md](tasks.md).
> Base: [hospedaje-completo](../hospedaje-completo/spec.md) (C1 inventario, C2 varias habitaciones, C5 planes) y [alquiler-locales](../alquiler-locales/spec.md) (apartado durante la respuesta, tramos, `reserva_cambios`, saldo a favor).
> Repos: BackendNode, FrontendAdmin, FrontendStore.

## Problema

El hotel nació como "solicitud que el negocio acepta o rechaza, sin inventario". El inventario (C1) se agregó después como opcional, se cuenta solo por tipo de habitación y deja fuera las estadías por horas. De ahí salen cinco fallas:

1. **Dos clientes, la misma habitación.** En modo `solicitud` la solicitud no aparta cupo; aceptar valida el cupo fuera de la transacción y sin bloqueo (dos recepcionistas pueden aceptar la última a la vez); una aceptada en modo solicitud no tiene `apartado_hasta` y retiene la habitación hasta la llegada aunque nunca pague; `forzar` sobrevende sin dejar rastro.
2. **Se reserva sin validar disponibilidad.** `unidades = null` es "sin control" (9 de 19 tipos en la base; entre ellos la "Habitación Matrimonial" con la que se detectó: dejó pedir 5 habitaciones teniendo 2). La modalidad por horas no consume inventario. El calendario de la ficha ofrece noches llenas.
3. **La recepción no ve su ocupación.** La pestaña Disponibilidad muestra números por tipo × 14 días, sin quién ocupa, sin solicitudes pendientes y sin los tipos sin unidades. No hay habitaciones físicas (101, 102…), así que no hay tape chart ni bloqueo por mantenimiento de una habitación.
4. **Anulación.** El cliente no puede cancelar una reserva pagada; el negocio no puede cancelar una aceptada ni una con pago en revisión; la política es texto libre (no calcula penalidad), `hotel_planes.reembolsable` no se aplica y la devolución "se gestiona fuera" sin registro.
5. **Reprogramación.** No existe para hotel (solo locales). Cambiar fechas de una reserva pagada obliga a cancelar y crear otra, y se pierde el rastro del pago.

Además, el formulario de reserva de la ficha (fase 0) se ve como un formulario de datos y no como un motor de reservas: modalidad en tarjetas grandes, "Llegada" + número de noches, contadores sueltos y sin política de cancelación antes de enviar.

## Referencias de la industria

- Inventario por tipo y noche, con bloqueo pesimista (`SELECT … FOR UPDATE`) al escribir; apartados con vencimiento mientras se paga (≈15 min con tarjeta; horas con pago manual).
- Se vende por tipo (pool) y la habitación física se asigna después; el **tape chart** (habitaciones × días, una barra por reserva) solo sirve con reservas asignadas, por eso se acompaña de una grilla de disponibilidad por tipo.
- Modificar es cambiar la misma reserva, no cancelar y crear otra. Las fechas nuevas se cotizan con la tarifa vigente; la diferencia se cobra, o se devuelve / queda como crédito. La tarifa no reembolsable suele no admitir cambios.
- Política de cancelación por plazos (gratis hasta X horas antes, luego penalidad). En Perú (Ley 29571, Indecopi): la no devolución vale solo si se informó con claridad y es razonable; si cancela el hotel, se devuelve todo.

## Decisiones

| Tema | Decisión | Descartado | Estado |
|---|---|---|---|
| Venta | **Por tipo (pool)**; la habitación física se asigna después (fase 5) | Elegir número de habitación al reservar | Tomada |
| Modelo de inventario | **El de Booking.com** (2026-10-10, ver "Modelo de inventario" abajo): el total de habitaciones vive en el **tipo** y lo comparten todos sus planes de tarifa; **un hotel no tiene categorías** (2026-10-11) | Tope por categoría que se reparte entre sus tipos (lo hace un PMS como Infor, no Booking); grupo compartido entre tipos físicamente distintos | Tomada |
| Modelo de ocupación | **Intervalos** (`inicio`–`fin`): una reserva ocupa desde su ingreso hasta su salida; cupo = máximo de reservas simultáneas ≤ unidades. Noches y horas usan la misma regla | Contar noches (deja fuera las horas) | Tomada |
| Concurrencia | **Bloqueo del tipo + cálculo al leer**, en una sola función que usan todos los que consumen cupo | Tabla de cupo por noche con CHECK (más robusta, más migración; se reconsidera si hay canal OTA) | Tomada |
| `unidades` | **Obligatorio** (≥ 1). Se migran los null | Mantener "sin control" | Tomada |
| Solicitud sin responder | **Aparta el cupo durante el plazo de respuesta** (`respuesta_horas`, como locales; sugerido 3 h para hotel). Al vencer, la solicitud sigue viva pero deja de apartar y el negocio la acepta solo si hay cupo | No aparta (hoy) | **Por confirmar** |
| Precio al reprogramar | **Tarifa vigente** de las fechas nuevas; la recepcionista puede ajustar el total con motivo | Respetar la tarifa original | **Por confirmar** |
| Habitaciones físicas | **Fase 5** (después de anulación y reprogramación, que funcionan igual sobre el pool) | En este ciclo, antes que todo | **Por confirmar** |

## Modelo de inventario (enfoque Booking.com)

Decidido 2026-10-10 tras revisar la documentación de Booking.com Connectivity y la teoría de front office / revenue management.

| Nivel | En Booking.com | En el sistema | Inventario |
|---|---|---|---|
| Categoría | No existe | **No se usa en hoteles** (2026-10-11): ni en el admin ni en la tienda. Un PMS (Infhotel, Opera) tampoco la tiene: el administrador piensa en tipo + habitación | — |
| **Tipo de habitación** | Room type ("número de habitaciones de este tipo"; `roomstosell` por tipo) | `productos` (código = `sku`, sin `categoria_id`) + `hotel_tipos_habitacion.unidades` | **Aquí**: total obligatorio (R1.1) |
| Plan de tarifa | Rate plan; precio por tipo + plan + fecha | `hotel_planes` (+ tarifa flexible implícita), modalidades, temporadas | Comparte el del tipo: "el número de habitaciones aplica a todas las tarifas" |
| Habitación física | No existe (lo hace el PMS) | Fase 5: `hotel_habitaciones` (101, 102…) | Cuenta para el total del tipo; exigida por el registro de huéspedes (DS 005-2021-MINCETUR) |

Reglas:
- Dos configuraciones físicamente distintas (p. ej. "Simple 2 camas" y "Simple Junior") son **dos tipos**, cada uno con su total. No se comparte cupo entre tipos.
- Un plan de tarifa nunca agrega habitaciones: vender por cualquier plan descuenta del tipo.
- Equivalencia para un futuro channel manager: tipo ↔ room type, plan ↔ rate plan, cierre del tipo ↔ room type cerrado.
- La capacidad física real se valida en la fase 5 (no se pueden declarar más habitaciones que las 101, 102… cargadas), no con un tope en la categoría.
- Nombres del admin alineados con el modelo (R1.7).

Referencias: [Create or update inventory, rates and restrictions](https://developers.booking.com/connectivity/docs/b_xml-availability), [Managing room types](https://developers.booking.com/connectivity/docs/room-type-and-rate-plan-management/managing-room-types), [Understanding room types and rate plans](https://developers.booking.com/connectivity/docs/room-type-and-rate-plan-management/understanding-room-types-and-rate-plans).

## Fase 0 — Formulario de reserva de la ficha (FrontendStore)

Rediseño del panel de `habitacion-page` según las capturas acordadas (2026-10-10). Sin cambios de base de datos; usa endpoints existentes.

- **R0.1 Encabezado de precio.** "S/ 160 / noche" (o "/ 6 horas", "/ cama") grande con "Impuestos incluidos" a la derecha, y "≈ US$" si hay tipo de cambio. Cambia con la modalidad elegida.
- **R0.2 Modalidad como control segmentado.** "Por noche · S/ 160 | 6 horas · S/ 100". Con una sola modalidad no se muestra.
- **R0.3 Fechas.**
  - Por noche: bloque **Entrada | Salida** que abre un calendario de rango (un mes visible: el panel es angosto también en escritorio). Reemplaza "Llegada" + número de noches.
  - El calendario deshabilita: días pasados, fechas cerradas, **noches sin cupo** para lo que se pide (`/habitaciones-disponibilidad`, por mes visible) y salidas que no cumplen el mínimo de noches de la temporada o superan 30 noches. El día de salida puede ser una noche llena (ese día la habitación se libera). Si una noche intermedia está llena, no se puede elegir una salida que la cruce.
  - Por horas: bloque **Fecha | Hora de ingreso** (lista en pasos de 30 min; las horas ya pasadas de hoy no aparecen).
- **R0.4 Huéspedes y habitaciones.** Resumen colapsable "2 adultos · 0 niños · 1 habitación" que abre el panel con contadores y ayudas ("18 años o más", "0 a 17 años", "Máx. 3 adultos por habitación · mín. N"). Botones "Listo" y "Cerrar". Las edades de los niños se piden dentro del panel.
  - Habitaciones: mínimo = las necesarias para los huéspedes (`ceil(adultos / capacidadAdultos)` y total); sube sola al agregar huéspedes, y el tope es `min(5, quedan)`.
  - Por defecto, 2 adultos si la capacidad lo permite.
  - Dormitorio (`porPersona`): "Camas" en vez de adultos + habitaciones.
- **R0.5 Resumen.** Ingreso y Salida en filas con día y hora (ya en curso en la copia de trabajo), línea "12 noches × S/ 160 × 1 hab.", "Impuestos y cargos: Incluidos" (o la exoneración de IGV) y Total.
- **R0.6 Política de cancelación antes de enviar.** Recuadro con la política del hotel (traducida). Sin texto configurado no se muestra (nunca un texto de ejemplo). Con plan no reembolsable dice "No reembolsable". En la fase 3 pasa a ser calculada: "Cancelación gratuita hasta el jue 8 oct., 14:00".
- **R0.7 Disponibilidad en vivo.** "Quedan 2 habitaciones" con poco cupo; sin cupo, el mensaje reemplaza al total y el botón queda deshabilitado.
- **R0.8 Botón según el modo.** "Solicitar reserva" + "Aún no pagas nada. El hotel confirma la disponibilidad y luego te pide el pago." en modo solicitud; "Reservar" + plazo de pago en modo inmediato; "Pagas todo al llegar" con cobro en destino.
- **R0.9 Móvil.** Barra fija inferior con el total y el botón, que lleva al panel. Tarifa y extras siguen debajo del panel, sin cambios.
- **R0.10 Idioma y accesibilidad.** Todos los textos en el diccionario EN. El calendario se maneja con teclado y los contadores tienen `aria-label`.

## Fase 1 — Cupo real (casos 1 y 2)

- **R1.1 `unidades` obligatorio.** SQL: los null pasan a 1 y se marcan para revisar; NOT NULL + CHECK ≥ 1. El admin avisa "Revisa cuántas habitaciones tienes de este tipo" en los tipos migrados. La ficha de habitación exige el dato al crear.
- **R1.2 Ocupación por intervalos.** `ocupacion()` calcula el máximo de reservas simultáneas por día a partir de `inicio`–`fin`, incluidas las de horas. Una reserva por horas ocupa una unidad durante su bloque. La grilla por noche sigue mostrando "libres" (unidades − pico del día).
- **R1.3 Una sola puerta para consumir cupo.** `reservarCupo(tx, …)`: bloquea el o los tipos (`FOR UPDATE`, en orden de id para no generar deadlocks), recalcula con `excluirPedidoId` y lanza `SIN_CUPO`. La usan crear, aceptar, verificar pago de una reserva vencida, modificar (fase 4) y asignar (fase 5). `validarCupoAlAceptar` pasa adentro de la transacción.
- **R1.4 Estados que ocupan.**
  - `solicitada` durante el plazo de respuesta (`apartado_hasta = creación + respuesta_horas`, nunca después del ingreso). *Por confirmar.*
  - `aceptada` hasta su plazo de pago: `apartado_hasta = aceptación + apartado_manual_min`. Así se elimina el apartado que nunca vence en modo solicitud.
  - `pago_en_revision` y `confirmada`, siempre.
- **R1.5 Sobreventa consciente.** `forzar` exige un motivo, queda en el historial ("Aceptada sin cupo: …") y la grilla del admin muestra la noche en rojo con −1.
- **R1.7 Un solo concepto: tipo de habitación (modelo PMS + Booking).** Revisado 2026-10-11: dos pantallas (categoría + tipo) confunden a un administrador de hotel, que en su PMS (Infhotel) solo maneja tipo de habitación y habitación física. En hoteles:
  - El admin no muestra "Categorías"; el menú dice "Tipos de habitación" (`/habitaciones`) y "Habitaciones" queda para las físicas de la fase 5.
  - El formulario del tipo no pide categoría; el SKU se llama "Código" (MAT, DBL, SUITE) y el nombre admite 100 caracteres.
  - La tienda no carga categorías (menú y pie no las listan; sus enlaces iban a la página de categoría de productos).
  - Las categorías ya creadas en tiendas de hotel quedan en la base sin uso (no se borran).
- **R1.6 Mensajes.** El cliente ve "Se acaba de ocupar la última habitación para esas fechas" con un enlace a elegir otras fechas. La recepcionista ve "Te quedan 0 de 2 (la tomó la reserva #123)".

## Fase 2 — Vista rápida para recepción (caso 3, parte 1)

- **R2.1 Grilla enriquecida** (pestaña Disponibilidad): tipos × días con libres/total, color por ocupación (verde / ámbar / rojo / sobrevendido) y "+N por responder" en las celdas con solicitudes que apartan.
- **R2.2 Detalle de la celda.** Al tocar una celda se ven las reservas de esa noche (cliente, estado, noches, saldo) con acceso al detalle y a aceptar o rechazar.
- **R2.3 Rango** de 14 / 30 días; hoy resaltado; fila resumen con ocupación % del día.
- **R2.4 Totales del día:** llegadas, salidas y alojados hoy (de la agenda existente).

## Fase 3 — Anulación (caso 4)

- **R3.1 Política estructurada.** `config_reservas.cancelacion_tramos` = `[{ desdeHoras, penalidad: "ninguna" | "primera_noche" | "pct", pct? }]`, ordenada de mayor a menor plazo, relativa a la hora de ingreso. Plantillas: flexible (gratis hasta 24 h), moderada (gratis hasta 72 h, luego la primera noche) y estricta (50 % hasta 7 días). El texto libre queda como nota adicional.
- **R3.2 Copia en la reserva** al crearla (`reservas.politica`): se aplica la que el cliente vio, no la vigente al cancelar. La ficha y el seguimiento la muestran calculada ("Gratis hasta …").
- **R3.3 Plan no reembolsable:** penalidad 100 % desde la reserva.
- **R3.4 Cancelación del cliente** desde el seguimiento, también si ya pagó (`confirmada`, `pago_en_revision`). Antes de confirmar ve la penalidad y lo que recupera, y elige devolución o saldo a favor (si el hotel lo ofrece).
- **R3.5 Cancelación del negocio** en `aceptada`, `pago_en_revision` y `confirmada`, con motivo. Lo pagado se devuelve completo (Indecopi). La recepcionista puede reducir la penalidad de una cancelación del cliente (cortesía), nunca aumentarla.
- **R3.6 Devoluciones registradas.** `reserva_devoluciones` (monto, medio, estado `pendiente | hecha`, comprobante opcional, usuario). En el admin aparecen como "Devoluciones por hacer"; marcar "hecha" cierra el ciclo. El saldo a favor reutiliza `saldo_favor_hasta` y se aplica en una reserva nueva del mismo cliente.
- **R3.7 Cupo:** se libera en la misma transacción que cancela.
- **R3.8 No show:** retiene la penalidad de la política (por defecto, la primera noche) y libera las noches restantes.
- **R3.9 Correos** de cancelación al cliente y al negocio con el desglose.

## Fase 4 — Modificar y reprogramar (caso 5)

- **R4.1 Acción `modificar`** sobre `aceptada`, `pago_en_revision` y `confirmada`, iniciada por la recepcionista: cambiar fechas, noches, modalidad, tipo de habitación, cantidad de habitaciones o huéspedes. La reserva y su número se mantienen.
- **R4.2 Validación:** dentro de una transacción con `reservarCupo` sobre el tipo nuevo, excluyendo la propia reserva. Si el cliente acorta la estadía no hace falta cupo.
- **R4.3 Precio:** se vuelve a cotizar con la función pura actual (tarifa vigente, temporadas, extras, IGV); la recepcionista puede fijar otro total con motivo. *Por confirmar.*
- **R4.4 Diferencia:** si es positiva, queda como cobro pendiente (sube `total`; el cliente paga la diferencia desde el seguimiento). Si es negativa, se convierte en devolución o saldo a favor (R3.6).
- **R4.5 Límites:** `reprogramaciones_max` y `cargo_reprogramacion` (ya en `config_reservas`), plazo mínimo antes del ingreso (configurable en horas para hotel). El plan no reembolsable no admite cambios de fecha salvo que el negocio lo fuerce.
- **R4.6 Historial:** `reserva_cambios` con antes y después (fechas, tipo, total) y correo al cliente con la reserva actualizada.
- **R4.7 (Opcional, después)** el cliente pide el cambio desde el seguimiento y la recepcionista lo aprueba.

## Fase 5 — Habitaciones físicas y tape chart (caso 3, parte 2)

- **R5.1 `hotel_habitaciones`:** número o nombre, tipo, piso, estado (`activa | mantenimiento | fuera_servicio`) y orden. `unidades` pasa a calcularse como las habitaciones activas del tipo (se crean N habitaciones a partir de las unidades actuales).
- **R5.2 `reserva_habitaciones`:** asignación (una reserva de N habitaciones tiene N filas), opcional hasta el check-in. Sugerencia automática al aceptar: la misma habitación todas las noches, la de menor número libre.
- **R5.3 Tape chart:** filas por habitación agrupadas por tipo, con fila "Sin asignar" por tipo y cabecera de libres. Barras coloreadas por estado (solicitada rayada, aceptada ámbar, en revisión azul, confirmada verde, bloqueo gris). Al tocar una barra se abre el detalle; arrastrarla cambia la habitación (y, con confirmación, las fechas, vía R4).
- **R5.4 Bloqueo de una habitación** por rango (mantenimiento): resta cupo de su tipo. `cierres_fecha` sigue cerrando la venta del tipo o de todo el hotel.
- **R5.5 Check-in / check-out** marcados desde el tape chart (estado de la estadía, separado del estado de la reserva).

## Fuera de alcance

Channel manager / OTAs, overbooking automático, pago con tarjeta en la reprogramación (se usa el flujo de pago actual), mezclar tipos de habitación en una sola reserva.
