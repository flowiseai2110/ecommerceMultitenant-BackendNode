# Spec: ciclo de la reserva del hotel

> Estado (2026-10-16): aprobada con el prototipo https://claude.ai/artifact/XEDKSa6GfScKGMtJVyGbut. Tareas: [tasks.md](tasks.md). Copia en el repo: [docs/disenos/reservas-hotel-nobility/](../../disenos/reservas-hotel-nobility/).
> Base: [motor-reservas-hotel](../motor-reservas-hotel/spec.md) (bandeja M1, cupo M2), [reserva-directa-hotel](../reserva-directa-hotel/spec.md), [recepcion](../recepcion/spec.md).
> Repos: BackendNode, FrontendAdmin (y FrontendStore en la pieza 4).

## Por qué

La bandeja de reservas del hotel no sigue el ciclo que conoce un recepcionista. Muestra "ya empezó" en vez de decir si el huésped llegó, no deja registrar la entrada ni la salida, y la reserva pasa sola a "completada" al llegar la fecha aunque el huésped nunca haya venido.

Fuentes revisadas (2026-10-16):
- PMS: Cloudbeds, Prostay, RoomKey, Kwentra.
- Ciclo del huésped (front office): antes de la llegada, llegada, estadía, salida, después de la salida.
- Antonio, de Almeida y Nunes (2019), *Hotel booking demand datasets*: estados finales Check-Out, Canceled y No-Show; depósito sin depósito, parcial o no reembolsable.
- Riasi et al. (2019) y Toh (1986): overbooking, no-shows y cancelaciones tardías.
- Early check-in y late check-out: se conceden según disponibilidad y se cobran solo si se conceden.

Decisiones del usuario:
- La sincronización con el PMS es **manual**: recepción registra la reserva en su PMS y escribe aquí el código.
- Cuentas corrientes y corporativas **no aplican**: la web atiende pasajeros libres.

## Estados

Lo que ve el hotel y cómo se guarda (`pedidos.estado`, texto: no hace falta SQL para el estado):

| Estado del hotel | Guardado | Ciclo |
|---|---|---|
| Por confirmar | `solicitada`, `aceptada`, `pago_en_revision` | Espera respuesta, pago o verificación |
| Reservada | `confirmada` | Garantizada o confirmada; espera la llegada |
| **Ocupada** | **`hospedada`** (nuevo) | El huésped hizo el check-in |
| Finalizada | `completada` | El huésped hizo el check-out: el cupo queda libre |
| No llegó | `no_show` | Se libera el cupo; se retiene la primera noche si estaba garantizada |
| Anulada | `rechazada`, `vencida`, `cancelada` | Con quién la anuló, motivo y reembolso |

- **C0.1** En el hotel, `confirmada` ya **no** pasa sola a `completada` al llegar la fecha de salida: la cierra el check-out. Una reservada con la llegada pasada queda a la vista para registrar el check-in o marcar No llegó. Los demás rubros siguen igual.
- **C0.2** Es una capacidad de la vertical (`cicloEstadia`), no una pregunta por el rubro.
- **C0.3** Recepción (hostal con habitaciones físicas): registrar la llegada de una reserva web hace el check-in, y cerrar su última estadía hace el check-out.

## Requisitos

### C1. Check-in con registro de huéspedes
- **C1.1** Desde una reservada cuya llegada es hoy o ya pasó.
- **C1.2** Exige confirmar el documento del titular, y nombre y documento de cada acompañante (registro de huéspedes).
- **C1.3** Guarda la hora real de entrada (`checkin_en`). Opcionalmente cobra el saldo en ese momento (medio de pago).

### C2. Check-out
- **C2.1** Desde una ocupada. Muestra la cuenta: estadía, extras y cargos, pagado y por cobrar.
- **C2.2** Con saldo, pide el medio de pago y el comprobante (boleta o factura), y marca el pedido como pagado.
- **C2.3** Guarda la hora de salida (`checkout_en`). Si la salida reservada es otro día, avisa y sugiere "Cambiar salida".

### C3. Modificar la reserva
- **C3.1** Desde Por confirmar o Reservada: fecha de llegada, noches, tipo de habitación, adultos y niños.
- **C3.2** Recalcula el precio con las mismas reglas de la tienda y valida el cupo sin contarse a sí misma. Sin cupo, no deja guardar.
- **C3.3** Queda en el historial ("Modificada: antes …").

### C4. Cambiar la salida (extender o salida anticipada)
- **C4.1** Desde una ocupada.
- **C4.2** Extender suma noches, valida el cupo y las cobra.
- **C4.3** Salida anticipada libera las noches que no usa: vuelven a la venta. Con tarifa no reembolsable se cobran igual.

### C5. Cancelar con política
- **C5.1** Quién cancela (el huésped o el hotel) y motivo de una lista.
- **C5.2** Penalidad según la política de la tienda:
  - Si cancela el hotel: sin penalidad.
  - Tarifa no reembolsable: se retiene todo lo pagado.
  - Más de `cancelacion_gratis_horas` antes de la llegada: gratis.
  - Si no: `penalidad_noches` noches.
- **C5.3** Muestra lo pagado, la penalidad y el monto a reembolsar. El reembolso se hace fuera; aquí queda registrado.
- **C5.4** Se guarda en `reservas.cancelacion` (quién, motivo, penalidad, reembolso, cuándo y quién la registró).

### C6. No llegó con cargo
- **C6.1** Desde una reservada cuya llegada ya pasó.
- **C6.2** Si estaba garantizada, retiene la primera noche (hasta lo pagado). Sin garantía no hay cargo.
- **C6.3** Las noches vuelven a la venta.

### C7. Early check-in y late check-out
- **C7.1** Los extras de la tienda con `horario` (early | late) se piden con hora y quedan **pedidos**: no se cobran hasta que el hotel los apruebe.
- **C7.2** El hotel aprueba o rechaza desde la ficha. Aprobado, se suma al total; rechazado, no se cobra (y si ya se pagó, se registra la devolución).
- **C7.3** La hora aprobada se ve en las columnas Llegada y Salida y en el resumen del día.
- **C7.4** Salida tardía desde el mostrador: hasta 14:00 S/ 50, hasta 16:00 media noche, hasta 18:00 la noche completa (tarifa del ejemplo; configurable más adelante). Se suma al saldo.

### C8. Código de reserva y código PMS
- **C8.1** El código de reserva (PED-0013) es la primera columna y encabeza la ficha, con botón Copiar.
- **C8.2** `reservas.codigo_pms`: lo escribe recepción a mano para asociar la reserva con su PMS.
- **C8.3** Se busca por cualquiera de los dos códigos. El filtro "Sin código PMS" muestra lo que falta pasar.

### C9. Notas para el siguiente turno
- **C9.1** Cada reserva lleva notas de recepción: texto, quién y cuándo. No se editan ni se borran.
- **C9.2** La tabla avisa cuántas notas tiene una reserva. Hay un filtro "Con notas" y la búsqueda encuentra texto dentro de las notas.

### C10. Bandeja del hotel
- **C10.1** Resumen de hoy, que también funciona como filtro:
  - Llegadas: cuántas faltan de check-in y los early.
  - Ocupadas.
  - Salidas: cuántas faltan de check-out y los late.
  - Por atender: pagos por verificar y early/late por responder.
- **C10.2** Ciclo como filtro con contador: Activas | Por confirmar → Reservada → Ocupada → Finalizada | No llegó · Anulada.
- **C10.3** Tabla: código y código PMS, huésped con notas, habitación, llegada, salida, noches, huéspedes, estado, pago (garantía y saldo) y la acción del momento (Check-in o Check-out).
- **C10.4** Ficha lateral con los pasos del ciclo, acciones, notas, código PMS, estadía, antes de la llegada, huéspedes registrados, pago e historial.
- **C10.5** Celular: tarjetas con el código arriba y la acción abajo, filtros que se deslizan, ficha a pantalla completa y acciones como hoja inferior.
- **C10.6** Es la pantalla de Reservas de las tiendas con `cicloEstadia`. Las demás siguen con la bandeja M1.

## Fuera de alcance
- Sincronización automática con el PMS.
- Número de habitación, limpieza (housekeeping), cuenta de consumos y auditoría nocturna.
- Cuentas corrientes y corporativas.
- Lista de espera, reserva manual desde el mostrador y tarifa corporativa con código (deseables, más adelante).

## Para el manual
- **Reservas del hotel:**
  - Arriba ves lo de hoy: quién llega, quién está, quién sale y qué falta atender. Toca una tarjeta para filtrar.
  - El ciclo (Por confirmar → Reservada → Ocupada → Finalizada) filtra por estado.
- **Check-in:** confirma el documento del titular, anota a cada acompañante y, si quieres, cobra el saldo.
- **Check-out:** revisa la cuenta, cobra lo que falte y elige boleta o factura. La habitación vuelve a la venta.
- **Cambios:** "Modificar" (antes de llegar) y "Cambiar salida" (ya hospedado) recalculan el precio y revisan el cupo.
- **Cancelar o No llegó:** el sistema calcula la penalidad con tu política y te dice cuánto devolver.
- **Early y late:** los pedidos del huésped esperan tu aprobación y solo se cobran si los apruebas. La salida tardía también se puede dar desde el mostrador.
- **Código PMS:** cuando registres la reserva en tu sistema, pega su número en la ficha. El filtro "Sin código PMS" te dice qué falta pasar.
- **Notas:** deja en la ficha lo que el próximo turno debe saber; quedan con tu nombre y la hora.
