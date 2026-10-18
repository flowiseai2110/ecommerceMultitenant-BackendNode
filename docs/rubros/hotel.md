# Rubro: hotel

> Dueño: agente `analista-hotel` · Última revisión: 2026-10-18 (primera versión) · Fuente: código + specs (cada regla cita de dónde sale)
> Rutas cortas: `BE` = BackendNode, `ST` = FrontendStore (`src/app/`), `AD` = FrontendAdmin (`src/app/`). Specs en `BE/docs/specs/<nombre>/spec.md`.

## En una frase
Alojamiento que se reserva por **tipo de habitación** (por noche, y por horas en el hostal). Ganancia: reservas directas sin comisión de OTA. **No es un PMS**: es un motor de reservas directas tipo extranet de Booking; el hotel lleva su operación en su PMS o Excel (`motor-reservas-hotel`).

## Dos formas de trabajar (mismo rubro `hotel`)
| | **Hotel** | **Hostal al paso** |
|---|---|---|
| Cómo vende | Por noche, con reserva previa (web, Booking, WhatsApp) | Por horas o noche, al que llega; reventa de la habitación varias veces al día |
| Operación (entrada, salida, caja, limpieza) | Su PMS o Excel: **no la llevamos** | **Recepción**: habitaciones físicas, tablero, caja por turno |
| Inventario | Por tipo y noche (pool), sin habitaciones físicas | Habitaciones físicas (101, 102…) |
| Cómo se activa | Por defecto | Al crear habitaciones físicas (capacidad, no identidad; `recepcion` principio 5) |

Fuente: `motor-reservas-hotel`, `recepcion`. No hay un campo "es hostal": `config_reservas.tipo_alojamiento` (hotel, hostal, casa, apart, lodge, posada) solo cambia **cómo se nombra** el negocio en textos y correos.

## Clientes típicos y tiendas demo
Hostales y hoteles boutique de Lima y destino. Demos: `killa-hostal`, `mirador-miraflores`, `demobooking` (dueña booking@yopmail.com), Hotel Nobility (prototipo del ciclo), "Hostal Las Palmeras" (`scripts/demo/hotel/hostal-al-paso.mjs`). Caso de referencia para paquetes: Hotel Viñas Queirolo (Ica).

## Glosario
| Término | Significa | En el código |
|---|---|---|
| Tipo de habitación | Lo que se vende (Doble, Suite). Un "tipo" = un producto; sin categorías | `productos` + `hotel_tipos_habitacion` |
| Unidades | Cuántas habitaciones hay de ese tipo (el cupo) | `hotel_tipos_habitacion.unidades` |
| Modalidad | Forma de cobrar un tipo: noche, o bloque de N horas | modalidades; `cotizar.js` |
| Temporada | Ajuste % por fechas + mínimo de noches | `hotel_temporadas` |
| Plan de tarifa | Variante de precio (p. ej. no reembolsable −%) | `hotel_planes` |
| Extra | Traslado, early check-in, etc. | `hotel_extras` |
| Apartado | Cupo retenido mientras se paga | `reservas.apartado_hasta` |
| Cupo a la venta / fuera de la web | Lo que el dueño ofrece en la web; lo vendido por otros canales | `hotel_cupo_externo` (origen `manual`/`ical`) |
| Check-in / check-out | Llegada y salida registradas | `hospedada`, `checkin_en`, `checkout_en` |
| Código PMS | Número de la reserva en el PMS del hotel, escrito a mano | `reservas.codigo_pms` |
| Estadía (mostrador) | Entrada al paso del hostal | `hotel_estadias` |

## Ciclo de vida
Estados guardados en `pedidos.estado`; máquina `TRANSICIONES_HOTEL` en `BE/modules/reservas/estados.js` (spec `ciclo-reserva-hotel`).

| Lo que ve el hotel | Estado(s) | Quién lo mueve |
|---|---|---|
| Por confirmar | `solicitada` → `aceptada` → `pago_en_revision` | Cliente crea; tienda acepta/rechaza; cliente paga o sube captura; tienda verifica |
| Reservada | `confirmada` | Pasarela o tienda al verificar el pago (o al nacer, si se paga al llegar) |
| Ocupada | `hospedada` | Recepción (`check_in`); en hostal, "Registrar llegada" |
| Finalizada | `completada` | Recepción (`check_out`); **no** pasa sola |
| No llegó | `no_show` | Recepción (retiene la primera noche si estaba garantizada) |
| Anulada | `rechazada`, `vencida`, `cancelada` | Tienda, cliente o el sistema (vence el apartado) |

Camino directo (tipo con `unidades`): nace `confirmada` (pago en destino) o `aceptada` con apartado (pago en línea) y la pasarela la confirma, sin intervención humana (`reserva-directa-hotel` RD2).

## Reglas de negocio
| ID | Regla | Dónde vive | Spec |
|---|---|---|---|
| H-01 | Un tipo con `unidades` se reserva **siempre en modo directo**, aunque la tienda esté en modo solicitud. Sin `unidades` rige la configuración (solicitud por WhatsApp). | `BE/modules/reservas/hotel/vertical.js` (`modoConfirmacion`) | reserva-directa-hotel RD1 |
| H-02 | Pago en destino: nace `confirmada` y descuenta cupo. Pago en línea: nace `aceptada` y aparta `apartadoEnLineaMin` (15 por defecto; 5–60). Pago manual (Yape): aparta `apartadoManualMin` (120). | `reservas.config.service.js` (defaults 15/120) | reserva-directa-hotel RD2, RD3, RD6 |
| H-03 | Ocupan cupo: `aceptada` (mientras no venza el apartado), `pago_en_revision`, `confirmada`, `hospedada`. `solicitada` **no** ocupa. | `reservas/hotel/disponibilidad.service.js` (`ocupaCupo`) | hotel-inventario R1.4 (ver diferencias) |
| H-04 | Cupo = `unidades` − reservas web − estadías del mostrador − ocupadas fuera de la web (manual o iCal). Una sola función de ocupación para todos. | `disponibilidad.service.js` (`ocupacion`) | hotel-inventario R1.2; recepcion principio 4; motor-reservas-hotel M2.1 |
| H-05 | Al crear, el cupo se revalida con el tipo bloqueado (`FOR UPDATE`) y sin contar la reserva que se está creando; si se acabó: `SIN_CUPO` "Se acaba de ocupar el último cupo". | `vertical.js` (`enTransaccion`), `bloquearTipo` | reserva-directa-hotel RD4 |
| H-06 | Apartado vencido: la reserva queda `vencida`, la pasarela rechaza el cobro y el cupo vuelve. | `disponibilidad.service.js` | reserva-directa-hotel RD5 |
| H-07 | Precio por noche: base o de viernes y sábado, con el ajuste de la temporada que la contiene (si se superponen, gana la de mayor ajuste). Mínimo de noches de la temporada se exige si la **llegada** cae en ella. | `reservas/hotel/cotizar.js` (`precioNoche`, `temporadaDe`) | hospedaje-completo B2 |
| H-08 | Límites de cotización: máx. 30 noches, 10 habitaciones por reserva, 365 días de anticipación; capacidad de adultos/niños por habitación × cantidad; fechas cerradas bloquean. | `cotizar.js` (`MAX_NOCHES`, `MAX_HABITACIONES`, `MAX_DIAS_ADELANTE`) | hospedaje-completo C2; hotel-inventario R0.4 |
| H-09 | Modalidad por horas: ventana fija (salida = ingreso + N horas). Reserva por noche para hoy hasta las 23:00; si ya pasó el check-in vence al fin del día, no a la hora de ingreso. | `cotizar.js` (`HORA_CORTE_HOY`, `plazoLlegadaTardia`) | hospedaje-completo; hotel-inventario |
| H-10 | Niños: gratis hasta `ninosGratisHasta`; mayores pagan `cargoNinoNoche` por noche. Se piden las edades. | `cotizar.js` (`lineaNinos`) | hospedaje-completo B4 |
| H-11 | IGV: la tienda elige precios **con** impuestos incluidos (defecto) o **sin** (se suman IGV 18 % y servicio 0–13 %). Turista extranjero (nacionalidad ≠ PE) con exoneración activa: se quita IGV del alojamiento, el servicio se mantiene. La reserva guarda copia del modo. | `cotizar.js` (`aplicarImpuestos`) | reserva-hotel-mejoras H2; hospedaje-completo B5 |
| H-12 | Plan no reembolsable: descuento %, penalidad total al cancelar, no admite que la salida anticipada descuente. | `hotel_planes`; `ciclo.service.js` | hospedaje-completo C5; ciclo C4.3, C5.2 |
| H-13 | Check-in: exige documento del titular y nombre+documento de cada acompañante; guarda `checkin_en`; puede cobrar el saldo. | `reservas/hotel/ciclo.service.js` (`registrarCheckin`) | ciclo-reserva-hotel C1 |
| H-14 | Check-out: muestra la cuenta, cobra saldo con medio y comprobante, guarda `checkout_en`. El comprobante se emite aquí (`comprobanteEn: "en_el_servicio"`). | `ciclo.service.js`; `BE/modules/negocio/hotel/estrategia.js` | ciclo C2 |
| H-15 | `confirmada` **no** pasa sola a `completada` en hotel; una reservada con llegada pasada queda a la vista para check-in o No llegó. | `reservas/estados.js` (`tieneCicloEstadia`) | ciclo C0.1, C0.2 |
| H-16 | Cancelar: si cancela el hotel, sin penalidad; no reembolsable, se retiene lo pagado; antes de `cancelacionGratisHoras` (48 por defecto), gratis; si no, `penalidadNoches` (1). El reembolso se hace fuera y queda registrado en `reservas.cancelacion`. | `ciclo.service.js`; `reservas.config.service.js` | ciclo C5 |
| H-17 | No llegó: retiene la primera noche (hasta lo pagado) solo si estaba garantizada; las noches vuelven a la venta. | `ciclo.service.js` | ciclo C6 |
| H-18 | Modificar (antes de llegar) y Cambiar salida (ya hospedado) recalculan el precio y validan el cupo sin contarse a sí mismas; salida anticipada libera noches. | `ciclo.service.js` | ciclo C3, C4 |
| H-19 | Early check-in / late check-out: extras con `horario`; quedan **pedidos** y no se cobran hasta que el hotel los apruebe. | `ciclo.service.js`, `hotel_extras` | ciclo C7 |
| H-20 | Cupo a la venta: el dueño escribe cuántas quedan; el sistema guarda la diferencia como ocupadas manuales. No se puede ofrecer más que `unidades` − web − iCal (se ajusta y avisa). "0" = no vender esa noche en web. | `reservas/hotel/cupo.service.js` | motor-reservas-hotel M2.2, M2.3 |
| H-21 | El calendario de la tienda muestra el precio mínimo por noche (null si cerrada). Es referencia: sin niños, extras, plan ni IGV de extranjero. | `reservas/hotel/precios-calendario.js` | reserva-hotel-mejoras H1 |
| H-22 | Las categorías no se usan en hotel: el tipo no lleva categoría, precio, stock ni variantes. `prepararProducto` fija precio 0 al crear; el "desde" lo fija "Estadía y precios". Sin modalidades no se muestra en la tienda. | `BE/modules/negocio/hotel/estrategia.js`; `habitaciones.service.js` | hotel-inventario R1.7 |
| H-23 | Hostal (Recepción): una estadía de reserva web no suma cupo dos veces; el mostrador avisa si la web ya vendió la noche pero deja registrar (`forzar`). Caja con un turno abierto por tienda; cierre ciego; anular siempre con motivo. | `reservas/hotel/recepcion*.js`, `caja.service.js` | recepcion R3.4, R5 |
| H-24 | Rol `recepcionista`: solo ve Recepción (tablero, mostrador, su caja). | `recepcion.routes.js` | recepcion Fase 2 |
| H-25 | Los textos usan la voz del alojamiento ("el hostal", "la casa"…), igual en backend y tienda. | `BE/modules/reservas/hotel/alojamiento.js`; `ST/negocio/hotel/alojamiento.ts` | hospedaje-completo B1 |

## Capacidades del rubro
| Capacidad | Valor | Backend (`modules/negocio/hotel/`) | Tienda (`negocio/hotel/`) | Admin (`negocio/hotel/`) |
|---|---|---|---|---|
| Recibe reservas | sí | `estrategia.js` `recibeReservas` | `perfil.reserva.tipo: 'hotel'` (`vitrina.ts`) | `perfil.ts` `reservas` |
| Carrito | no | — | `carrito: false` | `menuOperacion: 'Reservas'` |
| Categorías | no | — | `usaCategorias: false` | `catalogo.usaCategorias: false` (ver diferencias) |
| Precio/stock/variantes/video/marcas en ficha | no | `prepararProducto`, `marcas:false` | — | `catalogo.usa*: false` |
| Plan de pagos / entradas | no | `planDePagos:false` | `planDePagos:false`, `ventaEntradas:false` | `separacionYPagos:false` |
| Alquiler por horas (a nivel rubro) | no (la modalidad por horas es del tipo) | `alquilerPorHoras:false` | — | — |
| Ciclo de estadía | sí | `estados.js` (`tieneCicloEstadia`) | — | `reservas.cicloEstadia: true` |
| Disponibilidad / cupo | sí | `cupo.service.js`, `disponibilidad.service.js` | calendario por mes | `reservas.disponibilidad: true` |
| Check-in/out, niños, anticipación, alojamiento, dólares | sí | `configReservas` | `politicas.checkInOut: true` | `secciones.*: true` |
| Exonera IGV a extranjeros | sí | `config.exoneraIgvExtranjeros` | `exoneraIgv: true` | — |
| Consumos y factura en el servicio | sí | `comprobanteEn: "en_el_servicio"` | `consumosEnServicio: true`, `facturaEnServicio` | `comprobanteEnServicio` |
| Formulario de reserva | documento y nacionalidad obligatorios; nacimiento oculto; hora de llegada y comentarios opcionales | `formularioReserva` | `pasos: Habitación › Tus datos › Confirmación` | — |
| Aviso de reserva próxima | 2 h | `avisoProximoHoras: 2` | — | `reservas.textos.aviso` |
| Buscador | `'hotel'` (llegada, noches, huéspedes) | — | `buscador: 'hotel'` | `diseno.buscador` |
| Diseño | plantilla `hotel-boutique`; secciones comunes + reservas + `habitaciones` | `diseno` | `ui.ts` (familia reserva) | `diseno.plantillaPorDefecto` |
| Dashboard | atención, hoy (ocupación, llegadas, salidas, en casa), mapa de habitaciones, 30 días | `dashboard.js` | — | — |
| Idiomas | ES + EN (traducción IA editable) | `gruposTextos` | selector ES/EN | pantalla Traducciones |

## Pantallas propias
- **Tienda:** home propia (`home-hotel.component.ts`: con "atiendo al paso" pone "Disponibilidad ahora" primero); `/habitaciones` (listado con buscador de fechas); `/habitaciones/:slug` (ficha con panel de reserva: modalidad, fechas en calendario con precio por noche, huéspedes/niños con edad/habitaciones, plan, extras, política de cancelación, total); `/ahora` (precios y libres ahora + WhatsApp, hostal). Confirmación y seguimiento de la reserva con contador del apartado.
- **Admin:** menú (`perfil.ts`): Recepción, Reservas, Tipos de habitación (`/habitaciones`), Tarifas y extras (`/tarifas`), Configuración de reservas. Dentro de Reservas: bandeja del ciclo (resumen de hoy, filtros por ciclo, ficha lateral con check-in/out, modificar, cambiar salida, cancelar, No llegó, notas, código PMS), pestaña Disponibilidad (grilla tipos × noches, editar "libres"), y en Recepción el tablero, mostrador y caja.

## Casos borde que siempre hay que probar
- Última habitación con dos clientes pagando a la vez (RD4) y reserva de varias habitaciones (`c.habitaciones > libres`).
- Apartado que vence mientras el cliente está en la pasarela (hoy: el pago queda registrado y anotado para devolver).
- Reserva a las 23:00+ del mismo día, o ya pasado el check-in (llegada tardía, plazo hasta fin del día).
- Estadía que cruza medianoche (bloque por horas que toca dos fechas, ambas abiertas).
- Temporadas superpuestas; mínimo de noches según la **llegada**; viernes/sábado dentro de una temporada.
- Extranjero con precios con y sin impuestos; sin nacionalidad (la ficha solo informa).
- Tipo con `unidades` nulo (sin control de cupo, se comporta como solicitud).
- "Libres" editado más alto que lo que dejan web + mostrador + iCal (se ajusta y avisa).
- Cancelar justo en el límite de `cancelacionGratisHoras`; plan no reembolsable con salida anticipada.
- Hostal: reserva web con N habitaciones al registrar la llegada (primera estadía lleva el total, las demás en S/ 0); caja cerrada al cobrar.
- Tienda en SSR: el slot de rubro no se hidrata; la home depende de la tienda (CLAUDE.md del front).

## Lo que NO es este rubro (fuera de alcance deliberado)
- Habitaciones físicas, tape chart, limpieza, caja y facturación **en el hotel** (son de su PMS/Excel; en el hostal sí, vía Recepción) — `motor-reservas-hotel`.
- Channel manager y conexión con OTAs por API; precios por canal — `motor-reservas-hotel`, `hospedaje-completo`.
- Mezclar tipos de habitación en una reserva ("carrito de habitaciones"), cobro en dólares (solo referencia "≈ US$"), guardar tarjeta como garantía — `reserva-hotel-mejoras`.
- Sincronización automática con el PMS (el código PMS se escribe a mano); cuentas corrientes y corporativas — `ciclo-reserva-hotel`.
- Boleta/factura electrónica en Recepción (solo recibo interno), app offline — `recepcion`.
- Eventos y otros rubros no tienen inglés; hotel sí.

## Estado de lo propuesto (no implementado según el código)
| Pieza | Spec | Estado en código |
|---|---|---|
| iCal exportar/importar | motor-reservas-hotel M3 | Propuesta: existe la columna `origen: ical` pero no el job ni el enlace |
| Código promocional | reserva-hotel-mejoras H3 | Pospuesto por Diego (2026-10-16) |
| Paquetes del hotel | paquetes-hotel | Borrador sin aprobar; sin código |
| Anulación con tramos, devoluciones, reprogramación estructurada | hotel-inventario fases 3 y 4 | Parcialmente cubiertas por `ciclo-reserva-hotel` C3–C6; los tramos (`cancelacion_tramos`) no existen |
| `unidades` obligatorio, `reservarCupo` único, solicitud que aparta | hotel-inventario fase 1 | Propuesta: el código aún acepta `unidades` nulo |

## Diferencias entre repos detectadas
| # | Qué | Dónde | Riesgo |
|---|---|---|---|
| D-1 | **Solicitud y cupo.** `hotel-inventario` R1.4 dice que `solicitada` aparta cupo durante el plazo de respuesta (marcado "por confirmar"); el código no la cuenta (`ESTADOS_QUE_OCUPAN` sin `solicitada`). Solo afecta tipos sin `unidades` en modo solicitud. | `disponibilidad.service.js` vs hotel-inventario R1.4 | Medio: dos solicitudes sobre la misma noche |
| D-2 | **`unidades` obligatorio** (R1.1) es "propuesta", pero `motor-reservas-hotel` M2.6 y `vertical.js` tratan `null` como "sin control". Spec inconsistente sobre si esa opción sigue existiendo. | hotel-inventario R1.1 vs vertical.js | Medio: tipos sin cupo vendibles sin límite |
| D-3 | **Cancelación:** `hotel-inventario` R3.1 define tramos por plazo; el código implementa la política simple de `ciclo-reserva-hotel` C5 (horas gratis + noches de penalidad). Las dos specs siguen vigentes. | ciclo.service.js | Bajo: marcar R3.1 como reemplazada |
| D-4 | **Máx. habitaciones:** hotel-inventario R0.4 dice `min(5, quedan)`; hospedaje-completo dice 1–5; el código y la tienda usan 10 (`MAX_HABITACIONES`). | `cotizar.js`, `habitacion-page.component.ts` | Bajo: spec desactualizada |
| D-5 | **Estados que ocupan:** hospedaje-completo C1 lista aceptada/revisión/confirmada; el código añade `hospedada`. | `disponibilidad.service.js` | Bajo |
| D-6 | **Admin con categorías residuales:** `perfil.ts` define `usaCategorias: false` pero conserva un bloque `categorias` con textos ("Simple, Doble, Suites"); R1.7 dice que no se muestran. | `AD/negocio/hotel/perfil.ts` | Bajo: código muerto |
| D-7 | **Recepción en el menú:** el comentario del admin dice "se activa al crear las habitaciones", pero el ítem `/recepcion` está en el menú de todo hotel (solo lo filtra el permiso `recepcion`). La spec dice que se activa al crear habitaciones físicas. | `AD/negocio/hotel/perfil.ts`, `perfiles.spec.ts` | Medio: hotel sin Recepción ve un menú inútil |
| D-8 | **Ruta `/ahora`** siempre registrada en la tienda de todo hotel; solo tiene datos si la tienda activó "atiendo al paso". | `ST/negocio/hotel/ui.ts` | Bajo |
| D-9 | **Módulo del hotel repartido:** `BE/modules/negocio/hotel/` solo tiene 3 archivos; la lógica vive en `modules/reservas/hotel/` (como pide el contrato) pero `recepcion` y dashboard del hotel dependen de ella: un hotel sin Recepción hereda `porLimpiar` y `mapaHabitaciones` en su dashboard. | `negocio/hotel/dashboard.js` | Bajo/medio |
| D-10 | Estado de los specs: `ciclo-reserva-hotel`, `reserva-hotel-mejoras` y `motor-reservas-hotel` tienen piezas "sin probar en navegador" (tareas 3.5, 2.5, 4.4); memoria del proyecto indica varias sin commit. | tasks.md de cada spec | Medio: verificar antes de dar por válidas las reglas H-11, H-13…H-20 |

## Preguntas abiertas para Diego
- [ ] ¿Una solicitud sin responder debe apartar cupo (hotel-inventario R1.4, "por confirmar")? Hoy no lo hace.
- [ ] ¿Se mantiene la opción de tipo "sin control de cupo" (`unidades` vacío) o se vuelve obligatorio? (D-2)
- [ ] ¿Se da por reemplazada la anulación por tramos (hotel-inventario R3.1) por la política simple de horas + noches? ¿Y la reprogramación con tarifa vigente, R4.3 "por confirmar"?
- [ ] ¿Debe verse "Recepción" en el menú de un hotel que no tiene habitaciones físicas? (D-7)
- [ ] ¿Qué hace el sistema si el cliente ya está en la pasarela cuando vence el apartado? Hoy se devuelve a mano (reserva-directa-hotel, fuera de etapa).
- [ ] Registro de huéspedes (DS 005-2021-MINCETUR): ¿quién es responsable si el hostal no pide DNI? Spec `recepcion` lo deja "por confirmar".
- [ ] ¿Se confirma el valor por defecto de política de cancelación (48 h gratis, 1 noche) o es de ejemplo? Y la tarifa de salida tardía (S/ 50 / media noche / noche completa) de ciclo C7.4, ¿será configurable?
- [ ] ¿Se aprueba `paquetes-hotel` o sigue en borrador? ¿Y cuándo corresponde iCal (M3)?
- [ ] El IGV de los paquetes: spec propone precio final, pero Viñas Queirolo publica sin IGV; decidir con H2.
- [ ] ¿Quién es el dueño de producto de "estados finales" para reportes: `completada` en hotel significa check-out, distinto de otros rubros (completada al llegar la fecha)?
