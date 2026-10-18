# Rubro: eventos

> Dueño: agente `analista-eventos` · Última revisión: 2026-10-18 (primera versión) · Fuente: código + specs (cada regla cita de dónde sale)
> Rutas abreviadas: `B:` = BackendNode, `A:` = FrontendAdmin, `T:` = FrontendStore. Specs en `B:docs/specs/`.

## En una frase
El negocio publica **eventos** con una o más **funciones** (fecha y hora), vende **entradas con cupo** (cobro por pasarela o Yape/transferencia verificado a mano) y las entrega con **QR por persona**. Como servicio extra puede vender la **transmisión en vivo** de una función privada (planes Básico, Privado, Premium) que se descuenta de un paquete de horas que la plataforma vende a la tienda.

## Clientes típicos y tiendas demo
- Organizadores de conciertos, teatro, comedia, festivales (cartelera pública). Animadores infantiles, locales de fiestas, wedding planners, videógrafos (eventos privados con transmisión) (`transmision-eventos`, `mini-booking`).
- Demo: `evento-test` (cartelera de conciertos en Lima), datos en `B:scripts/demo/eventos/evento-test.json`. Dueño de prueba: no documentado en código (ver preguntas).

## Glosario
| Término del negocio | Qué significa | Nombre en el código |
|---|---|---|
| Evento | Lo que se anuncia (concierto, cumpleaños). Es un producto con datos de evento | `productos` + `evento` (`privado`) |
| Evento privado | No sale en cartelera ni vende entradas; solo sirve para transmitir | `evento.privado` |
| Función | Una fecha y hora del evento | `evento_funciones` (`inicio`, `fin`, `activa`) |
| Tipo de entrada | General, VIP, etc., con precio y cupo | `evento_tipos_entrada` (`cupo`, `vendidos`, `ventaHasta`) |
| Apartado | Cupo retenido mientras el comprador paga | `apartadoHasta`, `apartadasPorTipo` |
| Entrada con QR | Una por persona, código de 10 caracteres, se usa una sola vez | `evento_entradas` (`codigo`, `usadaEn`, `anulada`) |
| Control de ingreso | Validar entradas en la puerta | `validarEntrada`, `resumenIngreso` |
| Transmisión | Video en vivo de una función | `evento_transmisiones` |
| Plan Básico / Privado / Premium | YouTube incrustado / video propio / video propio + extras | `plan: basico\|privado\|premium` |
| Invitación | Enlace único por invitado (`/t/{token}`) | `evento_invitaciones` |
| Anfitrión | Cliente del negocio que contrata la transmisión | `anfitrionNombre`, `anfitrionEmail` |
| Paquete de horas | Horas de transmisión prepagadas por la tienda | `transmision_paquetes`, `planes.horasTransmisionMes` |
| Excedente | Minutos extra confirmados, cobrados a mano | `transmision_excedentes` |
| Aviso de live | Banner "estamos en vivo" con links a TikTok/YouTube/Facebook (otro módulo) | `avisos_live`, `modules/live/` |

## Ciclo de vida
**Compra de entradas** (`B:modules/reservas/eventos/vertical.js`, spec `mini-booking` R9):

| Estado | Quién lo mueve | Cómo se llega |
|---|---|---|
| `por_pagar` | Sistema | Compra con total > 0: aparta cupo |
| `pago_en_revision` | Cliente | Sube captura de Yape/transferencia |
| `confirmada` | Pasarela o organizador | Pago confirmado/verificado; se emiten las entradas QR. Total 0 = confirmada en el acto |
| `vencida` | Sistema | Pasó `apartadoHasta` o empezó la función sin pago (`reservas.service.js` ~L161-170) |
| `cancelada` | Negocio (admin) | Anula las entradas no usadas |
| `completada` | Sistema/negocio | Estado final; la validación en puerta aún acepta `confirmada` y `completada` |

**Transmisión** (`B:modules/transmisiones/transmisiones.reglas.js`, `etapaTransmision`): `proxima` (más de 1 h antes) -> `espera` (sala abre 1 h antes) -> `en_vivo` -> `terminada` -> `vencida` (pasaron 30 días; 90 en Premium). También `cancelada`. Mueven: el negocio (activa, termina, extiende, cancela), el sistema (corte automático, avisos, borrado) y quien graba (señal).

## Reglas de negocio
### Entradas y cupo
| ID | Regla | Dónde vive | Spec |
|---|---|---|---|
| EV-01 | Cupo disponible = `cupo` - `vendidos` - apartadas vigentes | `reservas/eventos/cotizar.js` `disponibles` | mini-booking R9.1 |
| EV-02 | Dos personas no pueden llevarse la última entrada: se bloquean los tipos y se revalida dentro de la transacción (409 `AGOTADO`) | `reservas/eventos/eventos.service.js` `apartarEntradas` | mini-booking R9.2 |
| EV-03 | Apartado: 120 min con pago manual, 15 min con pago en línea; nunca pasa del inicio de la función | `reservas.config.service.js` (`apartadoManualMin`, `apartadoEnLineaMin`); `cotizar.js` | mini-booking R9.1 |
| EV-04 | Una función sin fin se da por terminada 6 h después de empezar | `cotizar.js` `HORAS_FUNCION_POR_DEFECTO` | - |
| EV-05 | Estado de venta por tipo: `disponible`, `ultimas` (quedan <= umbral, defecto 20), `agotado`, `cerrado` | `cotizar.js` `estadoVenta`; `umbralUltimasEntradas` | mini-booking R4.2 |
| EV-06 | La venta de un tipo cierra en su `ventaHasta` o al inicio de la función | `cotizar.js` `ventaHasta` | mini-booking R4.2 |
| EV-07 | Cierre del pago manual N horas antes (`cierrePagoManualHoras`, vacío = abierto hasta la fecha límite). Mensaje: consultar por entradas en puerta | `cotizar.js` `ventaEnLineaCerrada` | mini-booking R4.4 |
| EV-08 | Máximo de entradas por compra (defecto 10); mínimo 1 | `cotizar.js`, `reservas.config.service.js` | mini-booking R4.3 |
| EV-09 | Las entradas se pagan completas: no hay adelanto ni saldo (`montoAPagar = total`) | `cotizar.js` | - |
| EV-10 | Aviso de compra próxima (defecto 6 h) solo con pago manual: "lleva tu captura, la validarán en la puerta" | `cotizar.js` `aviso`; `negocio/eventos/datos.js` `textoAviso` | mini-booking R9.6 |
| EV-11 | No se puede reducir el cupo por debajo de lo vendido o apartado; no se borra un tipo con compras (se desactiva); una función nueva no puede empezar en el pasado | `eventos.service.js` `guardarFichaEvento` (CUPO_MENOR_A_VENDIDO, TIPO_CON_VENTAS) | mini-booking R4 |
| EV-12 | Evento privado: no aparece en la cartelera ni se compra (`privado: false` en listado, ficha y compra) | `eventos.service.js` `listarEventosStore`, `cargarFuncionParaCompra` | transmision-eventos R1.4 |

### Entradas con QR e ingreso
| ID | Regla | Dónde vive | Spec |
|---|---|---|---|
| EV-20 | Al confirmar se emite una entrada por persona (código de 10 caracteres sin 0/O/1/I/L); idempotente | `reservas/eventos/entradas.js` `emitirEntradas` | mini-booking R9.3; plantillas-por-rubro E6 |
| EV-21 | Al cancelar la compra, las entradas no usadas se anulan | `entradas.js` `anularEntradas`; `vertical.js` `alCambiarEstado` | - |
| EV-22 | Validación en puerta: código inexistente 404; compra no pagada/cancelada 409 `ANULADA`; otra función 409 `OTRA_FUNCION`; ya usada 409 `YA_USADA`. Marcar es atómico (dos puertas, una sola entra) | `entradas.js` `validarEntrada` | mini-booking R9.5 |
| EV-23 | El código se normaliza (mayúsculas, sin espacios ni guiones) | `entradas.js` `normalizarCodigo` | - |
| EV-24 | Resumen de ingreso: total e ingresaron por función (excluye anuladas) | `entradas.js` `resumenIngreso` | - |

### Transmisión en vivo
| ID | Regla | Dónde vive | Spec |
|---|---|---|---|
| TR-01 | Solo tiendas con la capacidad `transmisiones` pueden transmitir | `transmisiones.service.js` `tiendaDeEventos`; `negocio/eventos/datos.js` | transmision-eventos R1.1 |
| TR-02 | Una transmisión por función; la función debe estar activa y no haber terminado; duración 15-720 min (si no hay `fin`, el negocio indica la duración) | `transmisiones.service.js` `activar` | R1.2 |
| TR-03 | Activar exige consentimiento del anfitrión (se registra `consentimientoEn/Por`) | `activar` | R9.1 |
| TR-04 | Privado y Premium exigen evento privado y horas suficientes en el mes (minutos x factor); si faltan, dice cuánto y cómo comprar | `activar` (EVENTO_PUBLICO, HORAS_INSUFICIENTES) | R1.3, R1.4 |
| TR-05 | Factor por tope de invitados: 25=0.5, 50=1, 100=2, 200=4 | `transmisiones.reglas.js` `FACTORES` | decisión 10 |
| TR-06 | Básico: YouTube no listado, no consume horas, hasta 300 invitaciones; enlace y grabación de YouTube 30 días | `reglas.js` `TOPE_BASICO`, `DIAS_GRABACION_BASICO` | R2 |
| TR-07 | Sala de espera abre 1 h antes; el invitado ve video desde ahí | `reglas.js` `SALA_ABRE_MIN` | R4.1 |
| TR-08 | Corte automático = fin + extensiones + 5 min; la entrada del proveedor solo acepta señal desde la sala hasta el corte (o en la prueba de 10 min) | `reglas.js` `corteEn`, `debeEstarHabilitada` | R7.8, R5.4 |
| TR-09 | Consumo: desde la primera señal (no antes del inicio) hasta el fin, tope = contratado + 5 min, x factor, redondeo hacia arriba; la prueba no consume | `reglas.js` `minutosConsumidos` | R7.1, R7.9 |
| TR-10 | Orden de consumo: plan del mes -> paquetes (el que vence primero) -> excedente confirmado; lo no cubierto ni confirmado se "absorbe", nunca se cobra | `reglas.js` `asignarConsumo` | R7.3, R7.6 |
| TR-11 | Paquetes: 10 h = S/ 250, 25 h = S/ 550, vencen a los 12 meses. Excedente S/ 20 por 30 min, tope 2 h/mes por tienda, cobro manual | `reglas.js` `PAQUETES`, `PRECIO_BLOQUE_EXCEDENTE`, `TOPE_EXCEDENTE_MES_MIN` | decisión 11 |
| TR-12 | Aviso a los 15 min del fin con opciones extender 30/60 min o terminar a la hora; extensión automática previa 0/30/60 (tope 180) | `reglas.js` `tocaAvisoFin`, `tocaExtensionAuto` | R7.5, R7.6 |
| TR-13 | Una sola sesión por invitación (otro dispositivo cierra la anterior, 409 `OTRO_DISPOSITIVO`); sesión viva = latido menor a 75 s | `service.js` `latidoInvitado`; `reglas.js` `SESION_VIVA_MS` | R4.3 |
| TR-14 | Grabación: activada por defecto, "Solo en vivo" la desactiva; en línea 30 días (Premium 90); descarga = mismo plazo, o 1 año con "Guardar 1 año" (S/ 50) o Premium; aviso 7 días antes de borrar | `reglas.js` `grabacionHasta`, `descargaHasta`, `PRECIO_GUARDAR_ANIO` | R8.1 |
| TR-15 | Premium: S/ 40 por evento (cargo manual), hasta 2 destinos de retransmisión (Facebook/YouTube) solo entre sala y corte | `reglas.js` `PRECIO_PREMIUM`, `MAX_DESTINOS`, `debeRetransmitir`; `activar` | R8.2, decisión 13 |
| TR-16 | Resumen con IA solo a pedido, con grabación lista; máximo 3 intentos | `reglas.js` `motivoSinResumen` | R8.3, decisión 14 |
| TR-17 | Claves de transmisión guardadas cifradas; solo editor o superior las ve; se pueden regenerar | `service.js` `conexionDe`, `datosConexion`, `regenerarClave` | R5.1, R5.5, R9.4 |
| TR-18 | No se borra una función con transmisión con invitados (409 `FUNCION_CON_TRANSMISION`) | `eventos.service.js` `guardarFichaEvento` | - |
| TR-19 | App Transmitir: código de vinculación de un solo uso (10 min) y sesión de app hasta el fin de la ventana | `service.js` `crearVinculacion`, `vincularApp` | R11.1 |
| TR-20 | Calidad medida por invitados: meta menos de 1 % de pausa, grave más de 3 % | `reglas.js` `calidadTransmision` | investigacion-calidad |

### Aviso de live (otro módulo, mismo rubro)
| ID | Regla | Dónde vive | Spec |
|---|---|---|---|
| LV-01 | Links persistentes a TikTok/YouTube/Facebook; el live se prende a mano 1-12 h (defecto 4), se extiende de 1 h en 1 h con tope 12 h; sin cron, expira al leer | `modules/live/live.service.js`, `live.url.js` | aviso-live R1-R4 |
| LV-02 | Público: solo plataformas marcadas y solo si está activo | `live.serializer.js`, `live.store.routes.js` | aviso-live R5.1 |

## Capacidades del rubro
| Capacidad | Valor | Backend (`modules/negocio/eventos/datos.js`) | Tienda (`negocio/eventos/`) | Admin (`negocio/eventos/`) |
|---|---|---|---|---|
| Recibe reservas / compra | si | `recibeReservas: true`, `tipoPedido: "evento"` | `reserva.tipo: 'evento'` | `reservas` |
| Carrito | no | - | `carrito: false` | - |
| Venta de entradas | si | `reservas/eventos/vertical.js` | `reserva.ventaEntradas: true` | `secciones.ventaEntradas: true` |
| Plan de pagos | no | `planDePagos: false` | `planDePagos: false` | `separacionYPagos: false` |
| Transmisión en vivo | si | `transmisiones: true` | página `/t/:token` (`features/transmision/`) | `pages/reservas/evento-transmision/` |
| Alquiler por horas / marcas | no | `alquilerPorHoras: false`, `marcas: false` | - | `usaMarcas: false` |
| Categorías y buscador | si, buscador por fecha | - | `usaCategorias: true`, `buscador: 'eventos'` | `categorias` de productos |
| Disponibilidad / check-in-out | no | - | `checkInOut: false` | `disponibilidad: false`, `checkInOut: false` |
| Plantilla de diseño | `eventos-cartelera` | `diseno.plantillaPorDefecto`, secciones comunes + reservas + `eventos` | rutas en `ui.ts` (familia `reserva`) | `plantillaPorDefecto` |
| Comprobante | `al_pagar` | `configReservas.comprobanteEn` | `facturaEnServicio` (no se muestra) | `comprobanteEnServicio` |
| Aviso de compra próxima | 6 h | `avisoProximoHoras: 6` | - | `aviso` |
| Dashboard | entradas vendidas, ingresos, vendidas hoy, ingreso por entrada, próximas funciones, entradas por día | `negocio/eventos/dashboard.js` | - | - |
| Asesor IA | si, solo estado de entradas (nunca precios ni cantidad exacta) | `modules/agente/perfiles/eventos.js` | - | - |
| Idioma | textos del rubro solo en español | `gruposTextos` incluye `eventos` | `clave(...)` | - |

## Pantallas propias
- Tienda: cartelera `/eventos` (`eventos-page`), ficha `/eventos/:slug` (`evento-page`), `categorias/:categorySlug`, `reservar`, `reserva/:token` (seguimiento, compartido con otros rubros de reserva), página del invitado `/t/:token` (sala de espera, reproductor, grabación), banner de live (`shared/components/live-banner`).
- Admin: lista de eventos, ficha del evento (funciones y tipos de entrada), asistentes de la función, control de ingreso (QR/código), transmisión de la función (invitados, datos de conexión, QR de la app, extensiones, grabación, resumen), tarjeta "Tus horas", bandeja de reservas, pantalla `/live`.

## Casos borde que siempre hay que probar
- Dos compradores simultáneos por la última entrada (409 `AGOTADO`, la compra no se crea).
- Compra gratis: se confirma al instante con entradas QR, sin apartado.
- Función que empieza antes de que se verifique el pago manual (aviso EV-10, validación en puerta).
- Escanear la misma entrada en dos puertas; entrada de otra función; entrada de compra cancelada.
- Bajar el cupo de un tipo por debajo de lo vendido; borrar un tipo con ventas; borrar función con transmisión.
- Activar transmisión sin horas suficientes; función sin hora de fin; función de menos de 15 min o más de 12 h.
- Evento público con plan Privado/Premium (debe rechazar).
- Mismo enlace de invitado abierto en dos dispositivos.
- Conexión en la sala de espera (no consume horas); señal que nunca llega; extensión automática sin autorización.
- Vencimiento de grabación y aviso de 7 días; "Solo en vivo".
- Zona horaria: todo se muestra en hora de Lima.

## Lo que NO es este rubro (fuera de alcance deliberado)
- No es ticketera masiva: sin preventas escalonadas, entradas especiales (cortesía, abono), mesas ni aforo total de la función (descritos en `verticales-reserva/eventos.md`, no implementados).
- La transmisión no tiene chat, reacciones ni cámaras mezcladas, ni entradas pagadas para ver la transmisión (`transmision-eventos`, "No incluye").
- No hay cobro automático de paquetes ni excedente: es manual (Yape/transferencia; scripts `B:scripts/transmision-paquete.js` y `transmision-excedentes.js`).
- La plataforma no emite comprobantes ni gestiona devoluciones (`mini-booking` R12.2).
- El aviso de live solo enlaza a plataformas externas; no reproduce video (`aviso-live`).

## Diferencias entre repos detectadas
| # | Qué | Dónde | Riesgo |
|---|---|---|---|
| D-01 | La spec `transmision-eventos` dice "Sin implementar", cita Mux y factores 0.7/1/1.6/2.8 en el texto; el código usa **Cloudflare** y factores **0.5/1/2/4** (las decisiones 5 y 10 lo corrigen, pero R7.1, la tabla de planes y el modelo de datos siguen con Mux) | `spec.md` vs `transmisiones.reglas.js` | Spec engañosa; leer las "Decisiones" como verdad |
| D-02 | `aviso-live/tasks.md` marca el storefront "pendiente", pero la tienda ya tiene `live-banner`, `live.service` y `live.state` | spec vs `T:` | Estado desactualizado en la spec |
| D-03 | Apartado en línea: la spec dice 10 min con pasarela; el código usa 15 (`apartadoEnLineaMin`) | `reservas.config.service.js` vs mini-booking R9.1 | Menor |
| D-04 | `verticales-reserva/eventos.md` describe aforo de la función, preventas, entradas nominativas, transferencia y tipos especiales; el código solo tiene cupo por tipo | spec vs `cotizar.js` | Expectativa comercial vs producto real |
| D-05 | El umbral "Últimas entradas" es configurable en la spec; el defecto del código es 20 y el cierre del pago manual no tiene defecto (abierto) | `reservas.config.service.js` | Confirmar defectos |
| D-06 | `negocio/eventos/dashboard.js` aún no tiene el widget de saldo de minutos de transmisión (la spec lo marca como pendiente al terminar) | código vs transmision-eventos "Pendiente al terminar" | El negocio no ve sus horas en el dashboard |
| D-07 | `plan.md` de transmisión no marca como hechas las fases 1-5 aunque hay código y tests de fases 3-5; la Fase 0 (verificación técnica) sigue sin marcar | `plan.md` | No se sabe qué fases se consideran cerradas |
| D-08 | El perfil admin tiene `cierresDe: null` (comentario: "cada función se pone o se quita de la venta") y `disponibilidad: false` | `A:negocio/eventos/perfil.ts` | Revisar que sea intencional |
| D-09 | `reproductor-propio` está "en espera": el invitado ve el iframe de Cloudflare; en iPhone sin control de reserva | spec | Posibles cortes con movimiento |

## Preguntas abiertas para Diego
- [ ] ¿Cuál es el dueño/usuario de prueba de la demo `evento-test`? No lo encuentro en código ni specs.
- [ ] ¿Se confirma que Privado/Premium solo funcionan con evento privado (no se puede vender entradas Y transmitir el mismo evento público)? Hoy Básico sí admite evento público.
- [ ] ¿Qué horas incluye cada plan mensual hoy? La spec dice Pro 3 h y Business 6 h; el código lee `planes.horas_transmision_mes` y no puedo confirmar los valores reales en la BD.
- [ ] Defecto de `cierrePagoManualHoras`: ¿vacío (abierto hasta la función) está bien para todas las tiendas?
- [ ] ¿Cómo valida entradas la puerta cuando no hay señal? La spec lo menciona como necesidad; no veo modo sin conexión.
- [ ] ¿La política de devolución/postergación de eventos (INDECOPI) se hará dentro del sistema o seguirá fuera? Hoy solo hay cancelar y anular entradas.
- [ ] ¿Qué fases de la transmisión se consideran cerradas y listas para producción?
- [ ] ¿Se retoma el reproductor propio (hls.js) o se queda el iframe de Cloudflare hasta tener datos de cortes?
- [ ] ¿Los textos de eventos seguirán solo en español o se traducirán como en tours/hotel?
- [ ] ¿Multi-sede (`multi-sede`) aplica a eventos (varios recintos)? La spec la define para hotel y canchas.
