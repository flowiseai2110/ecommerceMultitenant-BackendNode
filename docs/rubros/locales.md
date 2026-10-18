# Rubro: locales (alquiler de locales para eventos)

> Dueño: agente `analista-locales` · Última revisión: 2026-10-18 · Fuente: código + specs (cada regla cita de dónde sale)
> Spec madre: `docs/specs/alquiler-locales/` (`spec.md`, `casos-de-uso.md`, `plan.md`, `tasks.md`). Estado de la spec: Fase 1 hecha en código; Fase 2 y 3 sin construir.

## En una frase
Alquila **salones por turno** (quinceaños, promociones, cumpleaños, bodas, conferencias). Gana con el alquiler del salón o del paquete; el cliente **separa la fecha** (por defecto 40 %), paga el saldo en cuotas y deja una **garantía** por daños que se devuelve. El valor para el dueño: una fecha nunca se vende dos veces y cada reserva lleva su plan de pagos y contrato.

## Clientes típicos y tiendas demo
- Dueños de locales de eventos, salones de fiestas, auditorios y salas por horas (Perú).
- Tiendas demo: **no encontré ninguna documentada** para `locales` (ver Preguntas abiertas).

## Glosario
| Término del negocio | Qué significa | Nombre en el código |
|---|---|---|
| Salón | Unidad alquilable (un producto) con aforo, turnos y paquetes. No se subdivide | `local_salones` (`modules/reservas/locales/salones.service.js`) |
| Turno | Franja ofrecida ("Día", "Noche 19:00–03:00") | `local_turnos` |
| Paquete | `solo_local`, `paquete` (fijo o por persona) o `por_horas` | `MODALIDADES` (`cotizar.js`) |
| Separación | Pago que bloquea la fecha (% o monto fijo) | `separacionTipo/separacionMonto/adelantoPct` |
| Apartado | Tiempo en que la franja queda retenida sin pago | `apartadoHasta`, `apartadoHoras` |
| Cotización | Precio congelado con vigencia y enlace firmado | `local_cotizaciones`, `cotizacion.token.js` |
| Plan de pagos / cuota | Separación, cuotas, saldo, garantía y cargos | `reserva_cuotas`, `plan-pagos.js` |
| Garantía | Depósito por daños, fuera de `monto_pagado` | concepto `garantia` |
| Mora | Cuota vencida sin pagar (indicador, no estado) | `enMora()` |
| Ocupación | Bloqueo de franja en BD (restricción de exclusión) | `local_ocupaciones`, `ocupaciones.js` |
| Hora tope | Límite municipal de fin de evento (03:00) | `config.horaTope` |

## Ciclo de vida
Máquina: `TRANSICIONES_LOCAL` en `modules/reservas/estados.js` (spec: "Estados de una reserva de local").

| Estado | Lo mueve | Salida |
|---|---|---|
| `solicitada` | Cliente envía solicitud (franja apartada `respuestaHoras`, 24 h) | negocio acepta -> `aceptada`; rechaza -> `rechazada`; sin respuesta -> `vencida`; cliente cancela -> `cancelada` |
| `aceptada` | Negocio (genera contrato + plan, apartado `apartadoHoras`, 48 h) | cliente sube captura -> `pago_en_revision`; pasarela -> `confirmada`; fin del apartado -> `vencida` |
| `pago_en_revision` | Cliente | negocio verifica la 1.ª cuota -> `confirmada`; rechaza -> `aceptada` |
| `confirmada` | Negocio | `reprogramar`, `suspender`, `cancelar_negocio`, `no_show` (transiciones declaradas); pasa sola a `completada` al terminar el evento (`estados.js:132`) |
| `suspendida` | Negocio (fuerza mayor) | `reprogramar` o `cancelar_negocio` |
| `pago_directo` (por horas) | Sin solicitud: acepta contrato y paga; nace `aceptada` | -> `confirmada` al pagar |

## Reglas de negocio
| ID | Regla | Dónde vive | Spec |
|---|---|---|---|
| LOC-01 | Fechas y horas en `America/Lima`; un turno que cruza medianoche pertenece al día en que empieza | `locales/franja.js` | R1.3, CE-06 |
| LOC-02 | Franja ocupada = [inicio - preparación, fin + preparación) (preparación por salón, 60 min por defecto) | `franja.js`, `ocupaciones.js` | R2.4, R3.3 |
| LOC-03 | Dos reservas no pueden cruzarse en el mismo salón: lo garantiza la BD; el segundo recibe `409 FECHA_NO_DISPONIBLE` con alternativas | `ocupaciones.js`, `disponibilidad.js`, `docs/sql/locales_fase_1.sql` | R3.4, CE-01 |
| LOC-04 | La disponibilidad se revalida al cotizar, solicitar, aceptar y confirmar pago | `locales.service.js` (`franjaLibre`) | R3.5 |
| LOC-05 | Ningún cálculo supera el aforo máximo del salón (`AFORO_EXCEDIDO`) | `cotizar.js:83` | R2.2, CE-08 |
| LOC-06 | Precio por día: lunes-jueves, viernes, sábado, domingo, feriado (feriado manda). Feriados nacionales + Jueves/Viernes Santo precargados | `franja.js` (`claveDia`, `FERIADOS_FIJOS`) | R2.6, D4 |
| LOC-07 | Cotización guarda precio congelado, vigencia (7 días) y canal de origen; no aparta la fecha | `locales.service.js` (`crearCotizacion`), `cotizacion.token.js` | R4 |
| LOC-08 | Una cotización solo sirve para una solicitud (`COTIZACION_USADA`) | `locales.service.js` (`enTransaccion`) | R4.2 |
| LOC-09 | Solicitud con `idempotencyKey`: reintento devuelve la misma reserva | `reservas.service.js` (vertical `local`) | R14.1, CE-09 |
| LOC-10 | Solicitud aparta la franja solo durante `respuestaHoras`; pago directo, `apartadoManualMin` (120 min); nunca pasa del inicio del evento | `verticalLocal.apartadoInicial` | R6.2, R6.4, R6.6 |
| LOC-11 | Plan por defecto: separación vence con el apartado; resto en hasta `maxCuotas` (3) iguales hasta `saldoDiasAntes` (30) antes del evento; garantía vence con el saldo; evento cercano -> resto en 2 días | `plan-pagos.js` (`generarPlan`) | R7.2 |
| LOC-12 | Plan editable solo antes del primer pago (`PLAN_BLOQUEADO`); editarlo regenera el contrato y se vuelve a aceptar | `cuotas.service.js` (`editarPlan`), `validarPlan` | R7.2 |
| LOC-13 | La **primera cuota verificada confirma** la reserva y bloquea la fecha; antes de confirmar solo se paga la separación | `cuotas.service.js` (`verificarCuota`) | R7.4 |
| LOC-14 | `monto_pagado` suma cuotas pagadas **sin** la garantía | `plan-pagos.js` (`montoPagadoDe`) | R7.8 |
| LOC-15 | Cuota vencida = mora (indicador). El sistema nunca cancela solo una reserva confirmada | `plan-pagos.js` (`enMora`) | R7.7 |
| LOC-16 | Contrato desde plantilla con variables, copia con versión y hash; el cliente lo acepta antes de pagar (nombre, DNI, fecha, hora, IP) | `contrato.js`, `cuotas.service.js` (`aceptarContrato`) | R8, D3 |
| LOC-17 | Captura por cuota o solo número de operación si falla la subida; un solo pago válido por cuota (índice único) | `cuotas.service.js` (`subirCapturaCuota`) | R14.6, CE-11 |
| LOC-18 | Cerrar fecha / bajar aforo / desactivar turno con eventos en curso se bloquea (`CAMBIO_CON_RESERVAS`) | `salones.service.js`, `cierres.service.js` | R2.7, CE-05 |
| LOC-19 | Los turnos no pueden terminar después de la hora tope (`HORA_TOPE_EXCEDIDA`) | `salones.service.js:239` | R1.2, R11.4 |
| LOC-20 | Bloqueo manual de fecha ocupa la franja como una reserva | `locales.service.js` (`crearBloqueo`) | R3.6 |
| LOC-21 | Bandeja suma pestañas `cuotas_vencidas` y `garantias` | `reservas.service.js:549` | R12.1 |
| LOC-22 | Política de cancelación por tramos por defecto: >=60 d 100 % del resto; 30-59 d 50 %; <30 d 0 %; separación 0 % | `reservas.config.service.js` (`TRAMOS_POR_DEFECTO`) | R10.2 |
| LOC-23 | Sin carrito ni envíos: el rubro solo reserva | `negocio/locales/datos.js`; tienda `perfil.ts` (`carrito:false`) | R1.1 |

## Capacidades del rubro
| Capacidad | Valor | Backend (`modules/negocio/locales/datos.js`) | Tienda (`negocio/locales/`) | Admin (`negocio/locales/`) |
|---|---|---|---|---|
| recibeReservas | sí | `true` | `reserva.tipo: 'local'` | `reservas` |
| planDePagos | sí | `true` | `reserva.planDePagos: true` | `secciones.separacionYPagos: true` |
| alquilerPorHoras | no (ver Diferencias) | `false` | sin espejo | sin espejo |
| transmisiones / marcas | no | `false` / `false` | - | `usaMarcas:false` |
| carrito | no | - | `carrito:false` | menú sin stock/envíos |
| Config por defecto | cobro adelanto 40 %, comprobante al pagar | `configReservas` | `envio` = separación | - |
| Diseño | plantilla `locales-salones`, sección `salones` | `diseno` | `UI_LOCALES` (familia reserva) | `diseno.plantillaPorDefecto` |
| Buscador | qué celebra, fecha, invitados | - | `buscador:'locales'` | `buscador:null` |
| Venta de entradas, alojamiento, niños, check-in/out | no | - | `ventaEntradas:false`, `checkInOut:false` | `secciones.*:false` |

## Pantallas propias
- Tienda (`features/reservas/locales/`): `/salones` (lista y filtrada por categoría), `/salones/:slug` (calendario, turnos, paquetes, cotizar), `/cotizacion/:token` (enlace firmado), seguimiento con contrato, plan de pagos por cuota, mora y garantía, solicitud con manejo de 409, `/mantenimiento`.
- Admin (`pages/reservas/`): Salones y ficha con pestañas Turnos y Paquetes, Calendario por salón (`/salones/calendario`, bloqueos), Cotizaciones, detalle de reserva con contrato y plan, configuración de reservas (separación, plazos, garantía, tramos, plantilla).

## Casos de uso de la spec: estado
Implementado = hay código en backend + admin + tienda (según `tasks.md` y lo que encontré en código). Fase 1 cerrada salvo el recorrido en navegador (L1.41, sin marcar).

| Caso | Estado | Nota |
|---|---|---|
| CU-01 Disponibilidad y cotizar | Implementado | Cupón pendiente (nota L1.3) |
| CU-03 Solo local con adelanto y saldo | Implementado | Sin recorrer en navegador (L1.41) |
| CU-04 Paquete con separación y cuotas | Implementado | Idem |
| CU-06 Por horas, pago total | Parcial | Solo pago manual; sin pasarela (Fase 3, L3.3) |
| CT-01..CT-06 (vencidas, rechazo, captura, mora) | Implementado | Vencimientos al leer |
| CE-01..09, CE-12..14, CE-16, CE-17 | Implementado | Según `tasks.md` Fase 1 |
| CU-02 Agendar visita | NO | L2.8 |
| CU-05 Fiesta de promoción | NO | L3.2 |
| CU-07 Evento y liquidación | NO | L2.6; solo existe `no_show` genérico |
| CT-07..CT-11 Reprogramar / suspender | NO | Transiciones declaradas, sin servicio ni UI (L2.2-L2.4) |
| CT-12..CT-17 Cancelar con devolución | NO / parcial | Existe `cancelar_negocio` genérico; no encontré cálculo por tramos (L2.5) |
| CT-18..CT-21 Día del evento / reclamo | NO | L2.6, L2.7 |
| CE-10, CE-11 (pasarela), CE-15 (job) | NO | L3.3, L2.9 |

## Casos borde que siempre hay que probar
- Dos clientes envían la misma franja a la vez (409 + hasta 3 alternativas).
- Turno "Noche 19:00-03:00" del sábado: debe ocupar sábado y madrugada del domingo; turnos contiguos con preparación.
- Feriado que cae en viernes o sábado (precio `f`); Jueves/Viernes Santo.
- Cotización vencida, reutilizada o con tarifa cambiada después (precio congelado).
- Evento a menos de 30 días: el resto vence en 2 días, no en cuotas.
- Editar plan después del primer pago (debe dar `PLAN_BLOQUEADO`).
- Rechazo de captura: vuelve a `aceptada` con apartado nuevo.
- Cierre de fecha o baja de aforo con reservas vivas.
- Garantía en 0: no debe crear cuota de garantía.
- Reintento de solicitud con la misma `idempotencyKey`.

## Lo que NO es este rubro (fuera de alcance deliberado)
- No gestiona catering, decoración, compras ni personal (spec "No incluye").
- Sin inventario de mobiliario/equipos, sin comprobantes electrónicos, sin firma certificada, sin API de WhatsApp (solo enlaces `wa.me`), solo soles.
- Un salón no se subdivide ("medio salón"): unidad mínima = salón completo (spec, pregunta 1).
- La garantía no es pre-autorización de tarjeta: se cobra como cuota y se devuelve (spec, pregunta 2).

## Diferencias entre repos detectadas
| # | Diferencia | Dónde |
|---|---|---|
| D-1 | **Hora tope**: la spec dice por **salón** (D5 cerrada en `tasks.md`), el código la guarda en la **config de la tienda** (`config.horaTope`, `hora_tope` en `config_reservas`). | `salones.service.js:258`, `locales_fase_1.sql:89` vs `spec.md` pregunta 5 |
| D-2 | **Por horas**: la spec y el flujo CU-06 lo contemplan, pero la capacidad `alquilerPorHoras` está en `false` para `locales` (solo `canchas` la tiene `true`). El código sí cotiza `por_horas` (`cotizar.js`). | `negocio/locales/datos.js` vs `cotizar.js:218` |
| D-3 | **Fase 2 en BD sin código**: `docs/sql/locales_fase_2.sql` existe (devoluciones, liquidaciones, visitas, lista de espera, `job_corridas`) pero `tasks.md` marca L2.1 sin cerrar y no hay servicios. Riesgo: tablas sin uso o SQL sin correr; no sé si está en Supabase. | `docs/sql/locales_fase_2.sql` |
| D-4 | **Estados sin implementación**: `reprogramar`, `suspender`, `no_show` están en la máquina `TRANSICIONES_LOCAL` pero la spec los describe con reglas (R9, R10, R11) que no están en código. | `estados.js:66-73` |
| D-5 | **Textos**: la voz de la tienda es solo español (nota en `perfil.ts`); la spec no define idiomas. Admin dice "Cotización"/"Salón" sin espejo traducido verificado. | `FrontendStore/.../locales/perfil.ts` |
| D-6 | Tienda y admin: no hay `uis.spec.ts` ni `perfiles.spec.ts` propios de locales más allá de los casos genéricos (ej. `buscador:'locales'`, `tipo:'local'`); las reglas propias del rubro no están fijadas por test de front. | `FrontendStore/.../perfiles.spec.ts` |

## Preguntas abiertas para Diego
- [ ] ¿Hay tienda demo de `locales` (slug y dueño de prueba)? No la encontré en specs ni código.
- [ ] Hora tope: ¿se mueve a nivel salón (como decidiste en D5) o se queda por tienda?
- [ ] ¿Se activa `alquilerPorHoras` para `locales` o ese modo se queda como paquete `por_horas` sin la capacidad?
- [ ] ¿`locales_fase_2.sql` ya se corrió en Supabase? ¿Se prioriza Fase 2 (reprogramar/devoluciones/liquidación) antes de abrir a clientes reales?
- [ ] Mientras no exista cancelación con devolución por tramos, ¿cómo se devuelve dinero hoy (manual fuera del sistema)?
- [ ] ¿El recorrido L1.41 en navegador (quinceaños 150 personas) ya se hizo?
- [ ] ¿Cupones en reservas de locales: se incluyen antes de salir? (R2.6/R4.1 los piden; hoy pendientes.)
- [ ] ¿El recordatorio de cuota (7/3/1 días) y el vencimiento de cotización requieren el job (L2.9)? Hoy no corre; la mora queda sin aviso.
