# Rubro: canchas

> Dueño: agente `analista-canchas` · Última revisión: 2026-10-18 (primera versión) · Fuente: código + specs (cada regla cita de dónde sale)
>
> Rutas: **BE** = `ecommerceMultitenant-BackendNode/`, **ST** = `ecommerceMultitenant-FrontendStore/src/app/`, **AD** = `ecommerceMultitenant-FrontendAdmin/src/app/`.
> Specs (en `BE/docs/specs/`): **AC** = `alquiler-canchas`, **PC** = `plantillas-canchas`, **GC** = `grabacion-canchas` (descartada), **MB** = `mini-booking`, **PR** = `plantillas-por-rubro`, **MS** = `multi-sede` (borrador).

## En una frase
Un complejo deportivo alquila sus canchas sintéticas **por turnos de 60/90/120 min**, con tarifa de día y de noche; el cliente separa el horario en línea pagando un adelanto (50 % por defecto) y el sistema garantiza que un horario nunca se venda dos veces. (AC "Objetivo")

## Clientes típicos y tiendas demo
- Complejos de fútbol 7 / fulbito y canchas similares en Lima y provincias; hoy llevan reservas en cuaderno o pizarra (AC "Problema").
- Demo: `los-cedros` (`BE/scripts/seed-canchas.mjs`), dueño `canchas@yopmail.com` (AC cabecera).
- Multi-sede (futuro): demo planeada de canchas Surco / La Molina (MS S17.6).

## Glosario
| Término del negocio | Qué significa | Nombre en el código |
|---|---|---|
| Cancha | Recurso alquilable: producto + ficha 1:1 | `productos` + `cancha_canchas` |
| Formato | F5, F6, F7, F8, F9, F11 | `FORMATOS_CANCHA` (`BE/modules/reservas/canchas/tarifa.js`) |
| Turno | Franja que empieza en hora en punto y dura 60/90/120 min | `duracionMin`, `horasDeInicio` |
| Tarifa día / noche | Precio por hora; la noche empieza a una hora configurable | `precioDia`, `precioNoche`, `canchaInicioNoche` |
| Bloque | Unidad de cobro de 30 min (vale la mitad de la tarifa de su hora) | `BLOQUE_MIN`, `bloquesDelDia` |
| Tramo | Bloques seguidos de la misma tarifa dentro de un turno | `tramosDelTurno` |
| Apartado | Horario retenido un rato mientras se paga | `cancha_ocupaciones.tipo = "apartado"`, `apartadoManualMin` |
| Bloqueo | Horario cerrado por el dueño (teléfono, mantenimiento, academia) | `crearBloqueo` (`canchas.service.js`) |
| Agenda | Grilla cancha × hora del admin | `agendaAdmin`; ruta Admin `/canchas/agenda` |
| Pago dividido | El organizador reparte el total entre N jugadores, un link cada uno | `reserva_partes`, `partes.js` |
| Alquiler fijo semanal | Cliente que reserva siempre el mismo día; hoy solo abre WhatsApp | sección `fijo-semanal` |
| Liga | Tabla de posiciones escrita a mano en Diseño | sección `liga` |

## Ciclo de vida
Máquina base de reservas (`BE/modules/reservas/estados.js`, MB); la vertical de canchas sincroniza la ocupación en cada paso (`BE/modules/reservas/canchas/vertical.js`, `alCambiarEstado`).

| Paso | Quién | Estado resultante | Horario |
|---|---|---|---|
| Elige día, cancha, duración, hora y envía datos | Cliente | `aceptada` (pago directo, por defecto) | Apartado `apartadoManualMin` (30 min), nunca más allá del inicio |
| Sube captura del adelanto | Cliente | `pago_en_revision` | Apartado sin vencimiento |
| Verifica el pago | Tienda | `confirmada` | Pasa a "reserva" |
| Rechaza el pago | Tienda | vuelve a `aceptada` | Nuevo apartado de 30 min |
| Paga por pasarela (o las partes cubren el adelanto) | Sistema | `confirmada` | Reserva |
| Cobro en destino | Sistema | nace `confirmada` | Reserva |
| Modo `solicitud` | Cliente, luego Tienda | `solicitada` → `aceptada` | Apartado `respuestaHoras` |
| Rechazar / cancelar / vencer | Tienda / Sistema | `rechazada` / `cancelada` / `vencida` | Se libera |
| Pasó la hora | Sistema (al leer, sin cron) | `completada`; `no_show` lo marca la tienda | — |

## Reglas de negocio
| ID | Regla | Dónde vive (archivo) | Spec |
|---|---|---|---|
| CAN-01 | Una cancha = producto + ficha 1:1 con formato, medidas, jugadores máx., techada, superficie y precio por hora de día y de noche. Sin ficha no se publica. | `BE/modules/reservas/canchas/canchas.service.js` | AC R1 |
| CAN-02 | La cancha se crea sin precio en el formulario de producto (queda en 0); la ficha fija el precio "desde" = la más baja de sus dos tarifas. Al editar, el precio enviado se ignora. | `BE/modules/negocio/canchas/estrategia.js`, `canchas.service.js` (`guardarFichaCancha`); `AD/negocio/canchas/perfil.ts` (`usaPrecio: false`) | AC "Decisiones" |
| CAN-03 | Horario del complejo: apertura, cierre (`00:00` = medianoche), inicio de tarifa noche, "fin de semana/feriado todo noche" y duraciones ofrecidas (por defecto 60/90/120). Turnos en hora en punto y deben terminar antes del cierre. | `BE/modules/reservas/canchas/tarifa.js`, `cotizar.js`; `BE/modules/reservas/reservas.config.service.js` | AC R2 |
| CAN-04 | Precio por bloques de 30 min; cada bloque vale la mitad de la tarifa de su hora (17:00–19:00 con noche desde 18:00 = 1 h día + 1 h noche). Lo calcula el backend; la tienda solo suma. | `tarifa.js` (`tramosDelTurno`), `cotizar.js` | AC R3 |
| CAN-05 | Sábados, domingos y feriados nacionales cobran tarifa noche todo el día si `canchaFindeNoche`. | `tarifa.js` (`todoElDiaNoche`; feriados de `BE/modules/libro-reclamaciones/plazos.js`) | AC R2, R8 |
| CAN-06 | Un horario nunca se vende dos veces: lo decide la BD con la restricción de exclusión `ex_cancha_ocupacion`; un apartado vencido no ocupa (sin cron). Choque = 409 `HORARIO_OCUPADO`. | `BE/modules/reservas/canchas/ocupaciones.js`; `BE/docs/sql/canchas_fase_1.sql` | AC R4 |
| CAN-07 | Separación por defecto: pago directo, adelanto 50 %, comprobante al pagar, apartado 30 min; aviso si el turno es en menos de 2 h. | `BE/modules/negocio/canchas/datos.js` (`configReservas`) | AC R5 |
| CAN-08 | Cancelar, rechazar o vencer libera el horario; rechazar el pago devuelve la reserva a `aceptada` con apartado nuevo; la ocupación cambia en la misma transacción que el estado. | `vertical.js` (`alCambiarEstado`) | AC R5 |
| CAN-09 | Validaciones al cotizar: hora requerida, duración permitida, dentro del horario, hora no pasada, anticipación mínima, máximo de días adelante, fecha cerrada, horario ocupado. | `cotizar.js` | AC R2, R7 |
| CAN-10 | Bloqueos manuales desde la agenda ocupan igual que una reserva. | `canchas.service.js` (`crearBloqueo`, `eliminarBloqueo`) | AC R6 |
| CAN-11 | Fechas cerradas (`cierres_fecha`, de todo el complejo o de una cancha) no se ofrecen. | `vertical.js` (`cierresDeProducto`), `cotizar.js` | AC R7 |
| CAN-12 | La reserva guarda una foto de la cancha, la duración y los tramos con precio; cambiar precios después no la toca. | `vertical.js` (`detalle.cancha`) | AC "Modelo de datos" |
| CAN-13 | Extras del complejo (pelota, chalecos) se suman al total, cobrados por reserva. | `vertical.js` (`sumarExtras`); menú Admin "Extras" | PR E5 |
| CAN-14 | Pago dividido: el organizador reparte el total entre 2 y 22 jugadores, cada uno paga con su link firmado; solo con pasarela; no se rehace si alguien ya pagó; la reserva se confirma cuando lo pagado cubre el adelanto. | `BE/modules/reservas/canchas/partes.js`; `ST/features/reservas/canchas/pago-parte-page.component.ts` | PR E7 |
| CAN-15 | Las secciones con afirmaciones (`servicios`, `faq`, `fijo-semanal`) se copian ocultas y la `liga` llega vacía y oculta: no se publican equipos ni textos inventados. | `BE/modules/diseno/plantillas.js` | AC "Decisiones", PC PC3 |
| CAN-16 | Tabla de liga: hasta 20 equipos; puntos (3 ganado, 1 empate) y orden (puntos, diferencia, goles a favor) los calcula la tienda. Sin equipos no se dibuja. | `ST/features/reservas/canchas/liga-canchas.component.ts` | PC PC3 |
| CAN-17 | "Cómo funciona" se arma con la configuración real (adelanto, plazo) para no prometer algo distinto. | `ST/features/reservas/canchas/pasos-canchas.component.ts` | AC "Decisiones" |
| CAN-18 | Política de cancelación por defecto: hasta 24 h antes cambia de día o devuelve el adelanto; con menos, no se devuelve pero se pasa a otra fecha del mismo mes. | `BE/modules/negocio/canchas/datos.js` | sin spec (ver preguntas) |

## Capacidades del rubro
| Capacidad | Valor | Backend (`modules/negocio/canchas/datos.js`) | Tienda (`negocio/canchas/`) | Admin (`negocio/canchas/`) |
|---|---|---|---|---|
| `recibeReservas` | sí | `true` | `reserva.tipo = 'cancha'` | bloque `reservas` del perfil |
| `alquilerPorHoras` | sí | `true` | `vitrina.ruta = 'canchas'` | `secciones.horarioCanchas: true` |
| `planDePagos` | no | `false` | `planDePagos: false` | `separacionYPagos: false` |
| `transmisiones` | no | `false` | sin espejo | sin espejo |
| `marcas` | no | `false` | — | `usaMarcas: false` |
| Carrito / categorías / buscador | no | — | `carrito: false`, `usaCategorias: false`, `buscador: null` | `usaCategorias: false` |
| Cobro con adelanto | sí | `cobro: "adelanto"`, 50 % | `exoneraIgv: false`, `ventaEntradas: false` | `cobro: true` |
| Anticipación y aviso | sí | `avisoProximoHoras: 2` | — | `anticipacion: true` |
| Check-in/out, recepción, niños, dólares | no | — | `checkInOut: false` | todos `false` |
| Plantilla / tema por defecto | `canchas-complejo`; paleta `cancha-tinte` + tipografía `deportiva` | `diseno.plantillaPorDefecto`, `temaPorDefecto` | — | `plantillaPorDefecto` |
| Plantillas extra | `canchas-noche`, `canchas-liga` ("Al toque" se arma en el editor) | `BE/modules/diseno/plantillas.js` | — | — |
| Secciones propias | `canchas-portada`, `canchas`, `reservador`, `pasos`, `fijo-semanal`, `liga` | `diseno.secciones` | `ST/features/reservas/canchas/` | editor de Diseño |
| Dashboard | agenda de hoy, ocupación, ingresos, horas libres de noche, mapa de calor | `BE/modules/negocio/canchas/dashboard.js` | — | — |

## Pantallas propias
- Tienda: `/canchas` (tarjetas y reservador), `/canchas/:slug` (ficha), `/pago-parte/:token` (cada jugador paga su parte); botón "Reservar" en el header y barra inferior del celular "Noche desde S/ X · Reservar" (`ST/negocio/canchas/ui.ts`, `reservar-header.component.ts`, `nav-movil-canchas.component.ts`). "Separar" lleva a `/reservar?cancha=&fecha=&hora=&min=` y luego al seguimiento. Portada con variante `dibujo` o `foto`.
- Admin: Reservas, Agenda (grilla cancha × hora con bloqueos), Canchas (fichas), Extras, Config. de reservas (sección "Horario de las canchas"), detalle de reserva de cancha, editor de Diseño con las secciones del rubro (`AD/negocio/canchas/perfil.ts`).

## Casos borde que siempre hay que probar
- Turno que cruza el cambio día→noche (17:00–19:00): dos tramos con su precio.
- Cierre `00:00`: el último turno termina a medianoche; una hora de inicio que no deja terminar antes del cierre no se ofrece.
- Sábado, domingo y feriado con `canchaFindeNoche`: todo a tarifa noche.
- Dos clientes reservan el mismo horario a la vez: el segundo recibe 409 `HORARIO_OCUPADO`.
- Apartado vencido sin pagar: el horario vuelve a estar libre sin job; subir captura después del vencimiento re-ocupa si sigue libre (`reocupar`).
- Rechazo del pago: nuevo apartado de 30 min, nunca más allá del inicio del turno.
- Reserva con menos de 2 h: muestra aviso; con menos de la anticipación mínima: se rechaza.
- Fecha cerrada (complejo o cancha), cancha sin ficha (no se publica), bloqueo manual sobre un horario con apartado.
- Pago dividido: sin pasarela no está disponible; rehacer la división tras un pago da 409 `YA_HAY_PAGOS`; pago de una parte con la reserva ya cancelada deja aviso "revisar devolución".
- Cambiar precios de la ficha no altera reservas hechas.

## Lo que NO es este rubro (fuera de alcance deliberado)
- Alquiler fijo semanal automático: hoy el botón abre WhatsApp (AC "Fuera de alcance").
- Gestión del campeonato (fixture, resultados, inscripciones): la tabla de liga se escribe a mano (PC "Fuera de alcance").
- Grabación de partidos con kit de cámaras: **descartada el 2026-10-15**; solo se ofrecería transmisión en vivo desde el celular del cliente (GC cabecera, `analisis-2026-10-15.md`).
- Asesor IA propio del rubro: usa el genérico (`agente: null` en `BE/modules/negocio/registro.js`).
- Modo oscuro automático según el dispositivo (PC).
- Inventario de pelotas o indumentaria como productos: son extras de la reserva, sin stock.

## Diferencias entre repos detectadas
| # | Diferencia | Dónde |
|---|---|---|
| D-01 | AC dice en cabecera "implementado y verificado", pero la tarea C1 aún dice "El SQL no se ha corrido en Supabase" (texto desactualizado). | AC |
| D-02 | AC dice "falta commit y deploy"; el historial ya tiene commits posteriores sobre las carpetas del rubro (p. ej. `064e03d`, `dbbfb59`). El despliegue no es verificable desde el código. | AC vs `git log` |
| D-03 | GC (descartada) propone solo transmisión desde el celular, pero la capacidad `transmisiones` está en `false` para canchas y el front/admin no la reflejan. | `datos.js`, GC |
| D-04 | `DURACIONES_CANCHA` acepta 60/90/120/**180**; AC solo menciona 60/90/120 (el valor por defecto sí es 60/90/120). | `tarifa.js`, `reservas.schema.js`, AC R2 |
| D-05 | Pago dividido (E7) y extras (E5) existen en el código de canchas pero AC no los describe; solo los cubre `plantillas-por-rubro`, cuyo paso 3 (pantallas) está pendiente. | `partes.js`, `vertical.js`, PR |
| D-06 | MS define canchas `al-buscar` con grilla de todas las sedes, pero el código de canchas aún no tiene `sede` (spec en borrador). | MS S7.8 vs `BE/modules/reservas/canchas/` |
| D-07 | La política de cancelación por defecto promete cambiar de día o devolver el adelanto, pero la máquina de estados solo permite `cancelar_cliente` desde `solicitada`/`aceptada`; desde `confirmada` solo `cancelar_negocio`. No hay flujo para que el cliente cancele o reprograme una cancha confirmada. | `datos.js`, `estados.js` |
| D-08 | La voz del perfil de tienda para canchas es solo español ("Solo en español por ahora") aunque el backend declara el grupo de textos traducibles `canchas`. | `ST/negocio/canchas/vitrina.ts`, `datos.js` |

## Preguntas abiertas para Diego
- [ ] ¿Quién ejecuta la política de 24 h (cambio de día o devolución)? Hoy el cliente no puede cancelar ni reprogramar una reserva confirmada: ¿lo hace el dueño a mano o hay que construirlo? (D-07)
- [ ] ¿La duración de 180 min debe ofrecerse a los dueños o se quita de los valores permitidos? (D-04)
- [ ] ¿Se construirá la transmisión desde el celular para canchas (activaría `transmisiones`) o queda fuera por ahora? (D-03)
- [ ] ¿El pago dividido y los extras pasan a la spec de canchas o siguen en `plantillas-por-rubro`? (D-05)
- [ ] ¿Qué pasa con complejos que cierran de madrugada (02:00)? El código solo trata `00:00` como medianoche; no hay regla para otros cierres después de medianoche.
- [ ] ¿Hay tope de horas por reserva o forma de reservar un día completo (torneos)? No aparece en código ni spec.
- [ ] ¿Se aprueban como estándar el texto de aviso "Tu partido es pronto" y la política de cancelación por defecto? No tienen spec. (CAN-18)
- [ ] ¿Cuál es el estado real de despliegue del rubro (SQL en producción, commit, deploy)? (D-01, D-02)
