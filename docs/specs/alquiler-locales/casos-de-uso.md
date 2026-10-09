# Casos de uso: Alquiler de locales para eventos

> Origen de [spec.md](spec.md). Basados en [analisis-mercado.md](analisis-mercado.md) y en la máquina de estados de [mini-booking](../mini-booking/spec.md).
> IDs: `CU` = feliz, `CT` = triste, `CE` = error del sistema.

## Actores

| Actor | Rol en el flujo |
|---|---|
| Cliente | Persona o comité de padres que busca, cotiza, separa la fecha, paga y asiste. Llega desde TikTok, Google, un portal o una recomendación |
| Dueño o administrador del local | Tenant (rol `owner` / `admin`). Publica el local y sus paquetes, responde solicitudes, valida pagos y entrega el local |
| Encargado del local | Rol `editor`. Recibe al cliente el día del evento, revisa el inventario y registra daños u horas extra |
| Proveedor externo | Catering, DJ, hora loca o decoración que trae el cliente. Puede pagar tarifa de coordinación o descorche |
| Sistema | Storefront, admin y API. Controla la disponibilidad, calcula montos y vence apartados |
| Pasarela de pago | Culqi (tarjeta, Yape, PagoEfectivo), o captura de Yape o transferencia que valida el dueño |

## Casos felices

| ID | Caso | Modalidad | Pago | Evento típico |
|---|---|---|---|---|
| CU-01 | Consultar disponibilidad y cotizar | Todas | Ninguno | Todos |
| CU-02 | Agendar visita al local | Solo local / paquete | Ninguno | Quinceaños, promoción |
| CU-03 | Reservar solo local con adelanto y saldo | Solo local | 30–50 % + saldo + garantía | Cumpleaños, quinceaños |
| CU-04 | Reservar paquete con separación y cuotas | Paquete | Separación fija + cuotas | Quinceaños |
| CU-05 | Reservar fiesta de promoción por alumno | Paquete por persona | Adelanto del comité + cuotas | Promoción de 5.º de secundaria |
| CU-06 | Reservar por horas con pago total en línea | Por horas | 100 % al reservar | Conferencia, taller |
| CU-07 | Ejecutar el evento y cerrar la reserva | Todas | Horas extra, devolución de garantía | Todos |

### CU-01 · Consultar disponibilidad y cotizar
**Actor:** cliente. **Precondición:** el local publicó paquetes, aforo, turnos y precios por día.
1. El cliente entra desde TikTok, Google o WhatsApp al storefront del local.
2. Elige tipo de evento, fecha, turno (día o noche) y número de invitados.
3. El sistema muestra si la fecha está libre y los paquetes que admiten ese aforo.
4. El sistema calcula el precio con la tarifa del día (sábado, viernes, domingo) y las promociones vigentes.
5. El cliente descarga la cotización o la envía por WhatsApp al local.

**Resultado:** cotización con vigencia (por ejemplo 7 días). No bloquea la fecha.

### CU-02 · Agendar visita al local
**Actor:** cliente, dueño. **Precondición:** el dueño configuró horarios de visita.
1. Desde la cotización, el cliente pide una visita y elige día y hora.
2. El dueño confirma la visita y el sistema envía un recordatorio.
3. En la visita se ajustan paquete, decoración y proveedores.
4. El dueño registra la cotización final desde el admin y la envía al cliente.

**Resultado:** cotización ajustada lista para CU-03, CU-04 o CU-05.

### CU-03 · Reservar solo local con adelanto y saldo
**Actor:** cliente, dueño. **Precondición:** fecha libre y cotización vigente.
1. El cliente envía la solicitud con sus datos (DNI, teléfono), tipo de evento, aforo y horario.
2. El sistema crea la reserva en `solicitada` y aparta la fecha por un tiempo corto.
3. El dueño acepta y el sistema genera el contrato con aforo, horario, adelanto, fecha límite del saldo, garantía y reglas (descorche, limpieza, ruido).
4. El cliente acepta el contrato y paga el adelanto (40 %) en línea o sube la captura de Yape.
5. El dueño valida el pago y la reserva pasa a `confirmada`: la fecha queda bloqueada.
6. El sistema recuerda el saldo antes de la fecha límite. El cliente paga saldo y garantía.

**Resultado:** reserva confirmada y pagada al 100 %, con garantía en custodia.

### CU-04 · Reservar paquete con separación y cuotas
**Actor:** cliente, dueño. **Precondición:** paquete con buffet, DJ, hora loca y decoración configurado.
1. El cliente elige un paquete (por ejemplo "Reina" para 150 invitados) y sus opciones de menú y temática.
2. Separa la fecha con un monto fijo (por ejemplo S/ 500) y la reserva queda `confirmada` con saldo pendiente.
3. El sistema arma un cronograma de cuotas que termina 30 días antes del evento.
4. El cliente paga cada cuota y el sistema actualiza el saldo y envía la constancia.
5. Siete días antes, el cliente confirma el número final de invitados y el menú.
6. El dueño coordina con sus proveedores internos (catering, DJ, foto).

**Resultado:** paquete pagado y número de invitados cerrado.

### CU-05 · Reservar fiesta de promoción por alumno
**Actor:** delegado del comité de padres, dueño. **Precondición:** paquete con precio por alumno y mínimo de alumnos (por ejemplo 15).
1. El delegado cotiza con el número estimado de alumnos e invitados por alumno.
2. Paga el adelanto en nombre del comité y la reserva se confirma.
3. El sistema genera un enlace de pago por familia con su cuota.
4. Cada familia paga su parte y el delegado ve el avance en un panel.
5. En la fecha de corte, el delegado cierra la lista final de alumnos y el total se recalcula.

**Resultado:** promoción pagada, con lista de alumnos y su estado de pago.

### CU-06 · Reservar por horas con pago total en línea
**Actor:** cliente (empresa o expositor). **Precondición:** el local usa `modoConfirmacion = pago_directo` y tarifa por hora.
1. El cliente elige fecha, hora de inicio, horas, montaje (auditorio o escuela) y equipos (proyector, sonido).
2. El sistema calcula el total y pide factura o boleta.
3. El cliente paga el 100 % con tarjeta o Yape vía Culqi.
4. El webhook confirma el pago y la reserva queda `confirmada` sin intervención del dueño.

**Resultado:** reserva confirmada y comprobante solicitado.

### CU-07 · Ejecutar el evento y cerrar la reserva
**Actor:** encargado, cliente. **Precondición:** reserva `confirmada` y saldo pagado.
1. El encargado entrega el local y registra el inventario con fotos (mesas, sillas, menaje).
2. Registra el ingreso de proveedores externos y cobra descorche si corresponde.
3. Si el evento se alarga, registra las horas extra con la tarifa pactada, dentro del horario municipal.
4. Al terminar, revisa el local y registra daños o "sin novedad".
5. El sistema calcula: garantía − daños − horas extra = monto a devolver.
6. El dueño devuelve la garantía y la reserva pasa a `completada`. El sistema pide una reseña.

**Resultado:** reserva cerrada con liquidación final.

## Casos tristes

### A. El flujo no termina

| ID | Disparador | Qué hace el sistema | Estado final | Dinero |
|---|---|---|---|---|
| CT-01 | La cotización vence sin que el cliente envíe la solicitud | Marca la cotización vencida; recordatorio antes de vencer | Sin reserva | Ninguno |
| CT-02 | El dueño no responde la solicitud dentro del plazo | Libera la fecha y avisa a ambos | `vencida` | Ninguno |
| CT-03 | El dueño acepta pero el cliente no paga el adelanto | Al vencer el apartado libera la fecha | `vencida` | Ninguno |
| CT-04 | La captura de Yape no corresponde (monto distinto, operación repetida, imagen falsa) | El dueño la rechaza con motivo; vuelve a `aceptada` con un apartado nuevo | `aceptada` o `vencida` | Ninguno |
| CT-05 | El dueño rechaza (aforo excedido, evento no permitido, fecha vendida por fuera) | Registra el motivo y sugiere fechas libres | `rechazada` | 100 % si hubo pago directo |
| CT-06 | El cliente no paga el saldo ni una cuota en la fecha límite | Recordatorios (−7, −3, −1 días), mora, plazo de gracia; si no paga, el dueño cancela | `cancelada` | Se retiene el adelanto según contrato |

### B. Se pide reprogramar la fecha

**CT-07 · El cliente reprograma con anticipación** (viaje, enfermedad, cambio de fecha del colegio).
1. El cliente pide el cambio desde su seguimiento o por WhatsApp.
2. El sistema valida que falte más del mínimo pactado (por ejemplo 30 días) y que no se haya excedido el número de cambios (por ejemplo 1).
3. Muestra las fechas libres y la diferencia de tarifa (sábado frente a viernes, temporada alta frente a baja).
4. El cliente elige; el sistema traslada lo pagado, cobra la diferencia y el cargo de reprogramación si existe.
5. La fecha original se libera y la nueva queda bloqueada en la misma transacción.

**Resultado:** la misma reserva sigue `confirmada` con la fecha nueva y un historial del cambio.

| ID | Variante | Respuesta del sistema |
|---|---|---|
| CT-08 | No hay fechas libres que le sirvan | Mantiene la reserva y ofrece lista de espera; si insiste, aplica la política de cancelación |
| CT-09 | Pide reprogramar dentro del plazo mínimo | Se trata como cancelación + reserva nueva, salvo que el dueño lo apruebe a mano |
| CT-10 | El local pide reprogramar (corte de luz, obra, clausura temporal, doble reserva) | Sin cargo; fechas con prioridad o devolución del 100 % |
| CT-11 | Fuerza mayor externa (estado de emergencia, restricción de aforo, paro) | Reprograma sin cargo dentro de una ventana (por ejemplo 6 meses); el adelanto queda como saldo a favor |

### C. El cliente cancela el evento

| ID | Motivo | Anticipación | Qué se devuelve (ejemplo de política) |
|---|---|---|---|
| CT-12 | Personal: duelo, enfermedad, separación, viaje | Más de 60 días | Saldo y garantía; el adelanto se retiene o se devuelve un % |
| CT-13 | Falta de dinero: no completa las cuotas | Cualquiera | Lo pagado menos el adelanto; garantía íntegra |
| CT-14 | Encontró un local más barato o cambió de idea | Menos de 30 días | Solo la garantía |
| CT-15 | Comité de promoción: familias que no pagan, conflicto con el colegio, menos alumnos que el mínimo | Antes del corte | Se recalcula; si queda bajo el mínimo, regla general |
| CT-16 | Fuerza mayor comprobada | Cualquiera | Saldo a favor o devolución según contrato |
| CT-17 | El local cancela (clausura, doble venta, daño grave) | Cualquiera | 100 % de lo pagado, más compensación si el contrato la fija |

Toda devolución crea un movimiento de reembolso (Culqi o transferencia manual con constancia) y la reserva pasa a `cancelada` con motivo, actor y monto devuelto.

### D. El evento ocurre, pero con problemas

| ID | Disparador | Qué hace el sistema | Dinero |
|---|---|---|---|
| CT-18 | El cliente no se presenta | El encargado registra la inasistencia (`no_show`) | Se retiene lo pagado; la garantía se devuelve |
| CT-19 | Exceso de aforo u horario, quejas por ruido; interviene la municipalidad | Registra el incidente y la hora de corte | Multa o penalidad pactada descontada de la garantía |
| CT-20 | Los daños superan la garantía | Registra los daños con fotos y genera un cobro adicional | Cobro del excedente; si hay disputa, reclamo |
| CT-21 | Reclamo por servicio incompleto (buffet insuficiente, DJ tarde, decoración distinta) | Hoja del Libro de Reclamaciones ligada a la reserva | Compensación o devolución parcial |

## Errores del sistema

### A. Disponibilidad

| ID | Falla | Qué ve el usuario | Respuesta del sistema |
|---|---|---|---|
| CE-01 | Dos clientes reservan la misma fecha y turno al mismo tiempo | El segundo ve "Esta fecha se acaba de ocupar" | Restricción de exclusión en la base de datos; `409 FECHA_NO_DISPONIBLE` con alternativas |
| CE-02 | El dueño vendió la fecha por WhatsApp sin registrarla | El cliente paga y luego el dueño cancela | Bloqueo manual rápido y advertencia al aceptar; si ocurre, CT-17 |
| CE-03 | Calendario desactualizado (caché) | Ve libre, al enviar sale ocupada | Revalidar al enviar y al pagar |
| CE-04 | Turnos que se pisan sin tiempo de limpieza | Dos eventos chocan en la entrega | Tiempo de preparación entre turnos en la franja |
| CE-05 | El dueño cierra una fecha o baja el aforo con reservas existentes | Reservas confirmadas quedan inválidas | Se bloquea el cambio y se listan las afectadas (CT-10) |
| CE-06 | Fecha corrida un día por la zona horaria | La reserva del sábado aparece el viernes | Fecha local + hora de Lima; comparaciones en America/Lima |
| CE-07 | Cambia el precio entre la cotización y el pago | Le cobran otro monto | Snapshot de precio; la cotización vigente se respeta |
| CE-08 | El aforo pedido supera el de la licencia | La municipalidad interviene | Validación dura contra el aforo de la licencia |

### B. Caídas e integraciones

| ID | Falla | Qué ve el usuario | Respuesta del sistema |
|---|---|---|---|
| CE-09 | La API se cae al enviar la solicitud | Error o pantalla colgada; reintenta | `idempotencyKey`: el reintento devuelve la misma reserva |
| CE-10 | Culqi cobra pero el webhook no llega | Pagó y la reserva no se confirma | Pago `pendiente` + conciliación contra Culqi; "pago en verificación" |
| CE-11 | Doble cobro por doble clic o reintento | Dos cargos | Un solo pago válido por cuota; devolución automática del segundo |
| CE-12 | Base de datos o Supabase caídos | No carga el calendario | Página de mantenimiento con el WhatsApp del local; no se cobra |
| CE-13 | Falla el correo o el WhatsApp | No llega la confirmación | Reintentos; el seguimiento es la fuente de verdad; reenvío desde el admin |
| CE-14 | Falla la subida de la captura | No puede adjuntar su Yape | Reintento con límite; alternativa: número de operación |
| CE-15 | No corre el job de recordatorios | Cae en mora sin aviso | Job idempotente, alerta si no corrió; mora solo si el aviso salió |
| CE-16 | Rate limit en un pico de tráfico (video viral) | Errores 429 | Límites separados para lectura y escritura |
| CE-17 | La sesión del admin expira al validar un pago | El dueño pierde la acción | Token renovado y acción idempotente |
</content>
</invoke>
