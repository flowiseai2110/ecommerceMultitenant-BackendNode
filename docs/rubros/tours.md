# Rubro: tours

> Dueño: agente `analista-tours` · Última revisión: 2026-10-18 (primera versión) · Fuente: código + specs (cada regla cita de dónde sale)

Abreviaturas: `BE` = BackendNode, `FS` = FrontendStore, `FA` = FrontendAdmin. Specs en `BE/docs/specs/`: `MB` = mini-booking, `VR` = verticales-reserva (`tours.md`), `ID` = idiomas, `SF` = selector-fechas, `DR` = dashboard-por-rubro.

## En una frase
Una agencia de tours vende **plazas en salidas por día y hora** (full day, excursiones), con precio por persona según tipo de pasajero. El cliente envía una **solicitud**, la agencia la acepta, el cliente paga (total o adelanto) y el saldo se cobra en destino. La plataforma no vende stock ni envía nada. (`MB` §Alcance, R3)

## Clientes típicos y tiendas demo
- Agencias pequeñas de tours y experiencias en Perú que hoy venden por WhatsApp (foco comercial del producto). (`MB` §Problema)
- Tiendas demo del rubro: **no encontradas en código ni specs** (ver Preguntas abiertas).

## Glosario
| Término del negocio | Qué significa | Nombre en el código |
|---|---|---|
| Tour | Producto con ficha de salida y precios | `productos` + `tours` (1:1) |
| Día de salida | Día de la semana en que sale (1=lunes … 7=domingo) | `tours.diasSalida`, `diaTour()` |
| Hora de salida | Una o más horas fijas del tour | `tours.horasSalida` |
| Tipo de pasajero | Adulto, niño, estudiante… cada uno con precio | `tour_tipos_pasajero` |
| Precio "desde" | Tipo activo más barato con precio > 0 | `precioDesde()` |
| Idioma del guía | Idiomas en que se ofrece la salida | `tours.idiomas`, `reserva.idioma` |
| Punto de encuentro / recojo | Dónde se junta o recoge a los pasajeros | `puntoEncuentro`, `recojo`, `mapaUrl` |
| Saldo en destino | Lo no pagado por adelantado, se paga el día del tour | `saldoDestino` |
| Cierre de fecha | Día sin salida ("no hay salida") | `cierresDeProducto`, `cierresDe: 'tours'` |

## Ciclo de vida
Reserva con `tipo = tour` (pedido). Estados comunes a hotel y tours (`MB` §Estados):

| Estado | Quién lo mueve | Salida |
|---|---|---|
| `solicitada` | Cliente envía solicitud | → `aceptada` / `rechazada` (agencia), `vencida` (sola, a la hora de inicio), `cancelada` (cliente) |
| `aceptada` | Agencia | → `pago_en_revision` (cliente sube captura) o `confirmada` (pasarela OK); `vencida`; `cancelada` |
| `pago_en_revision` | Cliente | → `confirmada` (agencia verifica) o vuelve a `aceptada` ("no corresponde") |
| `confirmada` | Agencia / pasarela | → `completada` (sola: hora de inicio + duración), `no_show` (agencia), `cancelada` (agencia) |
| `pago_directo` | Cliente (sin paso de solicitud) | empieza en `aceptada` |

Sin duración en horas, el tour se da por terminado a medianoche del mismo día. (`BE modules/reservas/tours/cotizar.js` `ventanaTour`; `MB` R8.5)

## Reglas de negocio
| ID | Regla | Dónde vive (archivo) | Spec |
|---|---|---|---|
| T-01 | Solo se puede reservar en los **días de salida** del tour (1–7) y en una de sus **horas de salida**; hora obligatoria. | `BE modules/reservas/tours/cotizar.js` (`validarSolicitudTour`) | `MB` R3.2 |
| T-02 | **Sin cupo por salida**: la agencia confirma cada solicitud; nunca se afirma disponibilidad. | `cotizar.js` (cabecera) | `MB` §Fuera de alcance, R13.2 |
| T-03 | Máximo de pasajeros por solicitud: el del tour, o **30** por defecto. Mínimo 1. | `cotizar.js` `MAX_PASAJEROS_DEFECTO` | no explícita en `MB` |
| T-04 | El idioma elegido debe estar en los idiomas del tour; si no se elige, se usa el primero. | `cotizar.js` | `MB` R3.1 |
| T-05 | Anticipación mínima (horas): error duro si falta menos. Por defecto 0 h. | `cotizar.js`; config `anticipacionMinHoras` | `MB` R1.3 |
| T-06 | Fecha pasada rechazada; reserva con más de `MAX_DIAS_ADELANTE` (≈ un año) rechazada. | `cotizar.js`, `reservas/hotel/cotizar.js` | `MB` R5 |
| T-07 | Fecha dentro de un **cierre** (rango por tour o toda la agencia) rechazada. | `cotizar.js`, `reservas/cierres.service.js` | `MB` R10.1 |
| T-08 | Precio = suma de (precio del tipo × cantidad) por tipo de pasajero activo; tipo inactivo o desconocido da error. Se guarda **snapshot** de pasajeros y precios. | `cotizar.js` `lineasPasajeros`; `tours.service.js` | `MB` R3 |
| T-09 | Adelanto/pago a cuenta según config de la tienda; el resto es `saldoDestino`. | `cotizar.js` (usa `montoACuenta` de hotel) | `MB` R1.3 |
| T-10 | **Aviso de reserva próxima** (límite blando): si sale en menos de N h (24 h por defecto) se advierte; no bloquea. | `cotizar.js`; `negocio/tours/datos.js` `avisoProximoHoras: 24` | `MB` R1.3, R5.3.1 |
| T-11 | Si no se responde o no se paga antes de la hora de inicio, la solicitud se anula sola. | `datos.js` `textoAviso`; motor común de reservas | `MB` pregunta 2 resuelta |
| T-12 | Un tour es **publicable** solo con al menos un tipo de pasajero y una hora de salida; si no, no aparece en la tienda. | `tours.service.js` `publicable` | sin spec |
| T-13 | Al guardar la ficha, el producto pasa a servicio y `precioBase` = precio "desde". Borrar un tipo de pasajero no afecta reservas ya hechas. | `tours.service.js` `guardarFichaTour` | `VR` tours.md (precioBase "desde") |
| T-14 | El "desde" ignora tipos gratis (niño menor de 3 gratis no anuncia "desde S/ 0"). | `tours.service.js` `precioDesde` | sin spec |
| T-15 | Comprobante `al_pagar` (boleta o factura al confirmar el pago); la plataforma no lo emite. | `datos.js` `configReservas.comprobanteEn` | `MB` R14.3 |
| T-16 | Formulario de reserva: documento y nacionalidad **obligatorios**; nacimiento y comentarios opcionales. | `datos.js` `formularioReserva` | `MB` R5.2 |
| T-17 | Textos de errores y "días de salida" salen en el idioma de quien reserva (es/en y los que el dueño traduzca). | `textos-tour.js`, `vertical.js` | `ID` B7, D8 |
| T-18 | Sin carrito ni stock/variantes/envíos. | `FS negocio/tours/vitrina.ts` (`carrito:false`) | `MB` R1.2 |

## Capacidades del rubro
| Capacidad | Valor | Backend (`modules/negocio/tours/datos.js`) | Tienda (`negocio/tours/`) | Admin (`negocio/tours/`) |
|---|---|---|---|---|
| Recibe reservas | Sí | `recibeReservas: true` | `reserva.tipo: 'tour'` | `reservas.*` |
| Plan de pagos / transmisiones / alquiler por horas / marcas | No | `false` ×4 | `planDePagos:false` | `usaMarcas:false` |
| Carrito | No | — | `carrito:false` | — |
| Categorías | Sí | — | `usaCategorias:true` | `categorias` (de productos) |
| Buscador | Fecha + personas | — | `buscador:'tours'` | `buscador` (texto de diseño) |
| Plantilla por defecto | `tours-catalogo` | `diseno.plantillaPorDefecto` | — | `diseno.plantillaPorDefecto` |
| Venta de entradas, alojamiento, niños, recepción, horario canchas | No | — | `ventaEntradas:false` | `secciones.*:false` |
| Moneda extra (dólares) / cobro / anticipación | Sí | — | — | `dolares, cobro, anticipacion: true` |
| Check-in/out | No | — | `checkInOut:false` | `checkInOut:false` |
| Pago en destino | Sí ("Pagas el día del tour") | — | `politicas.pagoEnDestino` | `comprobanteEnServicio` |
| Disponibilidad / ciclo estadía / bandejas de pagos | No | — | — | `disponibilidad:false`, `cicloEstadia:false`, `bandejasDePagos:false` |
| Video del producto | Sí | — | — | `usaVideo:true` |
| Opciones por modalidad (Compartido/Privado) | Sí, como variantes | — | — | `presetsOpciones` |
| Textos traducibles | grupos comun, reservas, tours, correos, errores | `gruposTextos` | `clave()` | — |
| Dashboard | atención, KPIs, próximas salidas, más vendidos, pasajeros 14 días | `negocio/tours/dashboard.js` | — | — |

## Pantallas propias
- Tienda: `tours` (lista con filtros duración/dificultad), `tours/:slug` (ficha: fotos, itinerario, incluye, qué llevar, recojo), `categorias/:categorySlug` (misma vitrina filtrada), buscador por fecha y personas, `reservar`, `reserva/:token` (de la familia reserva). (`FS negocio/tours/ui.ts`, `uis.spec.ts`)
- Admin: lista de tours (`/tours`), ficha del tour (`/tours/:id`: salidas, tipos de pasajero, itinerario), reservas (bandeja común), cierres de fecha, opciones de diseño del tour. (`FA pages/reservas/tours`, `tour-ficha`, `pages/diseno/tour-opciones.component.ts`)
- Dashboard del tablero: "Salen en menos de 24 h sin confirmar", pasajeros, tasa de aceptación, tiempo de respuesta, próximas salidas, tours más vendidos. (`BE modules/reservas/tours/dashboard.js`; `DR`)

## Casos borde que siempre hay que probar
- Día sin salida, hora que no existe, fecha cerrada, fecha pasada, fecha a más de un año.
- Salida de madrugada (5:00) sin duración: no debe pasar a `completada` a esa hora.
- Tour de varios días o duración con `duracionHoras` vacía.
- Tipo de pasajero gratis (precio 0) y tour con todos los tipos gratis; tipo desactivado entre cotizar y reservar.
- Idioma inglés: tipos de pasajero traducidos se guardan así en la reserva.
- Reserva para dentro de menos de 24 h: aviso blando, y anulación sola si nadie responde.
- Más de 30 pasajeros (o el máximo del tour); 1 pasajero (singular en el mensaje).
- Tour sin hora o sin tipos de pasajero: no debe verse en la tienda.
- Buscador por fecha y personas: oculta los que no salen ese día (el texto habla de "cupo", ver diferencias).
- Reserva `pago_directo` (empieza en `aceptada`).

## Lo que NO es este rubro (fuera de alcance deliberado)
- No hay disponibilidad ni cupo en tiempo real: la agencia confirma. (`MB` §Fuera de alcance)
- No hay operación: guías, vehículos, manifiestos, zonas de recojo con costo. (`MB`)
- No emite comprobantes electrónicos; solo registra lo que el cliente pide. (`MB` R14.3)
- Solo soles (PEN) como moneda de cobro. (`MB` pregunta 4)
- No se muestra precio ni cupo por día en el calendario (decisión 2026-10-16). (`SF` D1)

## Diferencias entre repos detectadas
| # | Qué | Dónde |
|---|---|---|
| D-1 | **`VR` tours.md diseña cupo por salida, mínimo de pasajeros, tour privado con precio por tamaño de grupo, extras, `config_tours`, corte de venta, QR y manifiesto; el código no lo tiene** (`cotizar.js`: "Sin cupo por salida"). `MB` (vigente) lo descarta explícitamente. La spec `VR` está desactualizada para tours. | `BE docs/specs/verticales-reserva/tours.md` vs `modules/reservas/tours/` |
| D-2 | El buscador de la tienda dice "no salen ese día **o no tienen cupo** para N", pero no existe cupo en el backend. | `FS features/reservas/tours/tours-grid.component.ts:61` |
| D-3 | El Admin dice "salidas y **precios por fecha**" en la ficha; el modelo solo tiene precio por tipo de pasajero, sin precio por fecha. | `FA negocio/tours/perfil.ts` (comentario) |
| D-4 | El "privado" se resuelve como variante/opción (`presetsOpciones` Compartido/Privado) en el producto, no como modalidad del tour. No queda claro cómo entra en la cotización de tours (que solo suma tipos de pasajero). | `FA negocio/tours/perfil.ts` vs `cotizar.js` |
| D-5 | El máximo de 30 pasajeros por solicitud está en código pero no en `MB`. | `cotizar.js` |
| D-6 | `VR` define `tour_tipos_pasajero` con edad, nacionalidad (nacional/extranjero/CAN) y `ocupa_cupo`; el código solo usa nombre, precio, activo y orden. | `tours.service.js` |
| D-7 | `MB` R3.1 pide política en la ficha y `VR` el número de registro MINCETUR; no se encontró ningún campo MINCETUR en el módulo. | `tours.service.js` |
| D-8 | `MB` R13.2 dice que el asesor IA ofrece tours más solicitados y días de salida; el perfil del agente está en `modules/agente/perfiles/tours.js` (no revisado a fondo en esta versión). | `BE modules/agente/` |

## Preguntas abiertas para Diego
- [ ] ¿Qué tienda(s) demo de tours existen (slug y dueño de prueba)? No las encontré documentadas.
- [ ] ¿Se mantiene "sin cupo" definitivamente? Si una agencia pide cupo por salida, es un cambio grande (hoy `VR` tours.md lo describe pero no se construyó). ¿Marco `VR` tours.md como histórico?
- [ ] ¿El tour privado (precio por tamaño de grupo) se cotiza hoy solo con opciones/variantes? ¿Basta así?
- [ ] ¿El tope de 30 pasajeros por solicitud es decisión de negocio o un valor provisional?
- [ ] ¿La anticipación mínima por defecto de 0 h es lo que quieren las agencias (reservar para hoy), o debería ser mayor (el VR proponía corte de venta de 12 h)?
- [ ] ¿El saldo en destino siempre se cobra "el día del tour", o la agencia debe poder pedir pago completo antes?
- [ ] ¿Se requiere mostrar el registro MINCETUR/DIRCETUR en la tienda (confianza y requisito legal)?
- [ ] ¿Dónde se pide la lista de pasajeros acompañantes (opcional según `MB` R5.2) y quién decide si se exige?
- [ ] ¿Los precios para extranjeros vs nacionales se manejan hoy como tipos de pasajero distintos (ej. "Adulto extranjero")?
- [ ] Tours de varios días: ¿se soportan (hay `duracion` texto e itinerario, pero la ventana se calcula en horas)?
