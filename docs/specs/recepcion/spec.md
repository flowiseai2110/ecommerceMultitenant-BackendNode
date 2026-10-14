# Spec: Recepción (hostal al paso)

> **Solo para el hostal al paso** (2026-10-14): hospedaje pequeño que vende por horas o por noche al que llega y vuelve a vender la habitación varias veces al día. El hotel que vende con reserva previa no usa Recepción: lleva su operación en su PMS o Excel y usa el motor de reservas ([motor-reservas-hotel](../motor-reservas-hotel/spec.md)).

> Estado: **fases 1 a 4 implementadas** (2026-10-11); 1 a 3 probadas por el usuario. SQL: `docs/sql/recepcion_fase_1.sql` a `_4.sql`. Demo: `scripts/demo/hotel/hostal-al-paso.mjs`.
> Base: [hotel-inventario](../hotel-inventario/spec.md) (adelanta su fase 5: habitaciones físicas, check-in/out), [análisis Infhotel](../verticales-reserva/analisis-infhotel.md) (caja con turnos, pasajero libre).
> Repos: BackendNode, FrontendAdmin. FrontendStore solo en la fase 4 (opcional).

## Problema

Construimos el hotel desde el lado de la **reserva en línea** (vitrina, solicitud, pago, cupo), con Booking como modelo. Eso le sirve al hostal "de noche": el cliente compara precios, fotos y reseñas y reserva antes de llegar.

Pero el hostal peruano más común atiende **al paso**:

- Llega una pareja y pide "la de 15". El recepcionista dice "no hay, la de 30 sí". Le pide el DNI (o no), cobra, entrega la llave. Salen a las 3 horas, devuelven la llave y se van.
- El mochilero o el viajero de provincia también llega sin reservar: pregunta, paga la noche y sube.
- El cliente quiere **rapidez y discreción**. Nunca va a llenar un formulario de reserva.

Para ese negocio, lo que tiene valor no es la vitrina, sino **el mostrador**. Y su dolor real es el control: **que el recepcionista no se quede con la plata** y saber qué habitación está libre en este momento.

Hoy el admin no tiene nada de eso: no hay habitaciones físicas (101, 102), no hay entrada ni salida, no hay caja.

## Principios

1. **Back office primero.** La web es opcional (fase 4). Una tienda puede usar Recepción sin publicar nada.
2. **Celular del recepcionista, una mano, 3 toques.** Mobile-first, botones grandes, sin teclado salvo para el DNI.
3. **El cliente no tiene que dar datos.** El registro sin datos ("pasajero libre", como en Infhotel) es válido. Pedir DNI es una regla **de cada tienda**.
4. **Un solo cupo.** La entrada al paso vive en su propia tabla (`hotel_estadias`), pero la misma función de ocupación (`ocupacion()`) cuenta las reservas web y las estadías por noche del mostrador: el cupo de la web y el del mostrador nunca se pisan.
5. **Capacidad, no identidad.** El menú "Recepción" es del rubro hotel; una tienda la usa cuando **crea sus habitaciones físicas** (no hay switch aparte). Nada de `esHostalPorHoras()`.

## Requisitos

### R1. Habitaciones físicas (adelanta hotel-inventario R5.1)

- **R1.1 `hotel_habitaciones`:** `numero` (texto: "101", "Jacuzzi 2"), tipo (`producto_id`), piso opcional, `orden`, `estado` (`activa | mantenimiento`), `limpieza` (`limpia | por_limpiar`).
- **R1.2** `unidades` del tipo pasa a ser la cantidad de habitaciones activas. Al activar Recepción se crean N habitaciones por tipo a partir de las `unidades` actuales ("Matrimonial 1…6"), que el dueño renombra.
- **R1.3** Pantalla simple para numerar: lista por tipo, editar número y piso, ordenar.

### R2. Tablero (pantalla principal de Recepción)

- **R2.1** Una tarjeta por habitación, agrupadas por tipo y con el precio a la vista ("Matrimonial · 3 h S/ 30 · noche S/ 50"). Estados:
  - **Libre** (verde).
  - **Ocupada**, con la hora de salida y lo que falta ("sale 18:40 · quedan 25 min"). Se pone ámbar a los 15 min del final y roja si se pasó.
  - **Por limpiar** (gris), con el botón "Lista".
  - **Mantenimiento** (tachada).
- **R2.2 Arriba:** cuántas están libres por tipo ("Libres: Económica 2 · Matrimonial 0 · Jacuzzi 1"), que es la pregunta que contesta el recepcionista en el mostrador. Debajo, las reservas web que **llegan hoy**, con un botón para asignarles habitación.
- **R2.3** El tablero se refresca solo (polling, como pedidos) y funciona en una tablet o en la PC de la recepción.

### R3. Entrada

- **R3.1** Se toca una habitación libre, se elige la tarifa de su tipo (sus modalidades: "3 horas S/ 30", "Noche S/ 50", con el precio de vie/sáb cuando corresponde) y la forma de pago (efectivo, Yape, Plin, tarjeta). Con **Registrar** queda ocupada. Son 3 toques.
- **R3.2 Datos del huésped, opcionales según la tienda:** DNI o carné de extranjería, nombre y cantidad de personas. Configuración de la tienda: **DNI siempre / solo por noche / nunca**. Si no se ingresa nada, queda como **pasajero libre**.
- **R3.3** Se puede cobrar al salir: queda "por cobrar" y la caja lo muestra hasta que se cobra.
- **R3.4** La entrada crea una `hotel_estadias` (`en_curso`) con la habitación, inicio = ahora y fin = ahora + bloque, o el check-out del día siguiente a su última noche si es por noche (antes de las 06:00 la noche es la de ayer). Las de noche cuentan en el cupo de la web; si la web ya vendió esa noche, el mostrador avisa y deja registrar igual (`forzar`).
- **R3.5** Una reserva web que llega: con "Registrar llegada" se le asigna habitación y se cobra el saldo, si lo hay.

### R4. Durante y al salir

- **R4.1 Extender:** "+3 h S/ 30" o "pasa a noche (+S/ 20)". Lo cobrado se suma a la misma estadía y va a la caja.
- **R4.2 Cambiar de habitación** (sin cobrar de nuevo; si cambia el tipo, se cobra la diferencia).
- **R4.3 Salida:** un toque libera la habitación y la deja **por limpiar**. Si quedó algo por cobrar, se pide antes de liberar.
- **R4.4** Venta de extras en el mostrador (gaseosa, preservativos, toalla adicional) como cargo a la estadía, con un catálogo corto de la tienda. Reusa `hotel_extras` si alcanza; si no, queda para la fase 3.

### R5. Caja por turno

- **R5.1 Abrir turno:** el recepcionista indica con cuánto efectivo empieza.
- **R5.2** Cada cobro (entrada, extensión, extra) es un movimiento del turno, con forma de pago, habitación y hora. También se registran egresos con motivo ("compra de detergente S/ 12").
- **R5.3 Cerrar turno:** cuenta el efectivo y lo ingresa. El sistema muestra lo esperado (inicial + efectivo cobrado − egresos), lo contado y la diferencia. Yape, Plin y tarjeta van aparte, porque no pasan por el cajón.
- **R5.4 El dueño ve** los turnos cerrados con su diferencia, las entradas de cada turno y la ocupación del día. Lo puede revisar desde el celular, sin estar en el hostal.
- **R5.5 Controles contra la fuga de plata** (el motivo por el que el dueño paga):
  - Una entrada no se puede borrar, solo **anular con motivo**, y el dueño ve las anulaciones.
  - Toda habitación que pasa a "por limpiar" tiene que venir de una salida registrada. Si limpieza marca usada una habitación que figuraba **libre**, aparece la alerta **"uso sin registrar"**. Es el control clásico: la limpieza delata la entrada que no se registró.
  - Resumen por turno: entradas, horas vendidas e ingreso por habitación.

### R6. Usuarios

- **R6.1** Rol **recepcionista** en Equipo: solo ve Recepción (tablero, entrada, salida, su caja). No ve reportes del dueño, no edita precios ni anula sin motivo.
- **R6.2** Cada movimiento guarda quién lo hizo.

### R7. Comprobante

- **R7.1** Fase 1: recibo interno imprimible o compartible por WhatsApp (no es comprobante SUNAT).
- **R7.2 Boleta electrónica:** fuera de este ciclo. Nota: la boleta solo exige identificar al comprador cuando pasa de S/ 700 (Reglamento de Comprobantes de Pago, SUNAT), así que la boleta "sin datos" del pasajero libre es válida para estos montos. **Verificar con un contador** antes de implementar.

### R8. Web (opcional, fase 4)

- **R8.1** Página "Precios y disponibilidad ahora": tipos con sus tarifas y "libres ahora: sí/no", con un botón de WhatsApp. Sin formulario de reserva.
- **R8.2** Si la tienda también vende por noche en línea, la vitrina actual sigue igual y comparte el cupo (R3.4).

## Decisiones

| Tema | Decisión | Descartado | Estado |
|---|---|---|---|
| Activación | Menú del rubro hotel; la tienda la activa al crear sus habitaciones físicas | Rubro nuevo "hostal por horas"; switch en la configuración | Tomada |
| Entrada al paso | Tabla propia `hotel_estadias` (+ `hotel_cobros`), contada por la misma `ocupacion()` que las reservas | Reserva con `origen = 'recepcion'`: exige titular, pedido, correos y estados que el mostrador no usa | Tomada (2026-10-11, al implementar) |
| Datos del huésped | Opcionales; regla de cada tienda (`config_reservas.recepcion_documento`: siempre / **solo noche, por defecto** / nunca) | DNI obligatorio | Tomada |
| Registro de huéspedes | El reglamento de hospedajes (DS 005-2021-MINCETUR) pide registrar a los huéspedes. El sistema lo facilita, pero la decisión y la responsabilidad son del dueño | Bloquear la entrada sin DNI | **Por confirmar** con el usuario |
| Habitaciones físicas | Se adelantan (R1) solo para las tiendas con Recepción. El resto sigue por tipo (pool) | Obligatorias para todos | Tomada |
| Caja | Turnos con arqueo de efectivo; formas de pago digitales aparte | Caja multimoneda de Infhotel | Tomada |
| Comprobante SUNAT | Fuera de este ciclo | — | Tomada |
| Sin conexión | No en este ciclo. Si se cae internet, el recepcionista anota en papel y registra después con la hora real | App offline | **Por confirmar** |

## Fases

| Fase | Qué | Repos |
|---|---|---|
| 1 ✔ | R1 habitaciones físicas, R2 tablero, R3 entrada, R4.1–R4.3 extender, cambiar y salida, anular (admin). El recepcionista opera con el rol **editor** | Backend, Admin |
| 2 ✔ | R5 caja por turno y controles (R5.5), R6 rol recepcionista | Backend, Admin |
| 3 ✔ | R4.4 extras en el mostrador, R3.5 llegada de reservas web con asignación, R7.1 recibo | Backend, Admin |
| 4 ✔ | R8 web "precios y libres ahora" | Backend, Admin, Store |

## Fase 2: cómo quedó (2026-10-11)

- **Un cajón por tienda:** a lo más un turno abierto (`hotel_turnos`, índice parcial). Entrada, extender, cobrar y la salida con cobro exigen la caja abierta (`CAJA_CERRADA`); cada cobro guarda su `turno_id`. Los cobros de la fase 1 quedan sin turno.
- **Cierre ciego:** el recepcionista cuenta el efectivo sin ver el esperado y al cerrar no recibe cifras. Admin y dueño ven esperado, contado y diferencia (`efectivo_esperado = inicial + efectivo cobrado + ingresos − egresos`). Al cerrar se guarda una foto del turno (`resumen`).
- **Gastos e ingresos** del cajón (`hotel_caja_movimientos`), siempre con motivo.
- **Reporte del dueño** (`/recepcion/caja`): turnos con "Cuadra / Falta / Sobra", y en el detalle cobros, gastos, entradas por horas y por noche, cobros por debajo de la lista, anulaciones (con lo que tenían cobrado) e ingreso por habitación.
- **Uso sin registrar:** desde una habitación libre, "¿La encontraste usada sin registro?" la deja por limpiar y crea una incidencia (`hotel_incidencias`) que el dueño ve y marca como revisada. Límite: depende de que alguien honesto (quien limpia o el dueño) lo avise; un rol de limpieza queda para después.
- **Rol recepcionista:** fuera de la jerarquía viewer < editor < admin < owner, así no pasa ningún mínimo: solo entra donde la ruta lo nombra (`requireTiendaAccess(min, { tambien: ["recepcionista"] })`), que hoy es solo Recepción (tablero, mostrador, su caja). En el admin ve solo "Recepción", sin buscador, Guía ni alertas, y cualquier otra ruta lo devuelve al tablero. Lo invita un admin desde Equipo (la opción aparece en tiendas de hotel).

## Fase 3: cómo quedó (2026-10-11)

- **Llegadas web (R3.5):** el tablero lista las reservas web vigentes que empiezan hoy (o ya empezaron) y no tienen estadía. "Registrar llegada" pide tantas habitaciones como tiene la reserva (sugiere las del tipo reservado; se puede dar otro tipo) y crea una estadía por habitación con `pedido_id`: la primera lleva el total del pedido y lo pagado en línea, las demás van en S/ 0. Esas estadías **no** suman cupo en `ocupacion()` (ya lo cuenta la reserva). Lo que se cobra en el mostrador a una estadía de reserva también sube `pedidos.monto_pagado` (hasta el saldo del pedido; los consumos del mostrador no).
- **Consumos (R4.4):** desde la estadía, un extra de la tienda (`hotel_extras` activos, precio × cantidad) u "Otro" con concepto y precio a mano. Queda como cargo con quién lo cargó; se cobra ahora o al salir.
- **Recibo (R7.1):** texto para WhatsApp (`wa.me/?text=`) o copiar, desde la estadía y automáticamente al registrar la salida. Dice "Recibo interno, no es comprobante de pago".

## Fase 4: cómo quedó (2026-10-11)

- **Interruptor por tienda** `config_reservas.vitrina_al_paso` (Config. de reservas › Recepción: "Atiendo al paso").
- **`GET /store/reservas/ahora`:** cada tipo con sus tarifas y `disponible` (hay una habitación activa, limpia y sin estadía): solo sí o no, sin cantidades. Sin Recepción, `disponible = null`. Caché de 20 s.
- **Tienda:** página `/ahora`; con el interruptor, la portada del hotel pone "Disponibilidad ahora" antes de las secciones del diseño y la ficha de la habitación cambia el formulario de reserva por sus precios, "Libre ahora / Ocupadas ahora" y WhatsApp ("¿tienen libre una … ahora?" o "avísame cuando se libere"). Se refresca sola cada minuto.
- **Demo:** `node scripts/demo/hotel/hostal-al-paso.mjs --owner <correo> [--whatsapp 9…]` crea "Hostal Las Palmeras" (S/ 15 a 50 por 3 horas, S/ 30 a 80 la noche) para un usuario existente, con vitrina al paso y habitaciones de Recepción.

## Fuera de alcance

Boleta/factura electrónica, POS de restaurante, app offline, channel manager, tape chart de varios días (no se construye: el hostal rota por horas y usa el tablero) y tarifas por placa o cochera.
