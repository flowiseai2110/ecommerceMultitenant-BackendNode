# Análisis: esquema de INFHOTEL (PMS hotelero de referencia)

> Fuente: `FrontendStore/scripts/script.sql` (SQL Server, base `INFHOTEL`, generado el 3/10/2026). **Solo estructura**: 191 tablas, sin datos, sin vistas ni procedimientos.
> Objetivo: usarlo como **referencia funcional** para [hotel.md](hotel.md) y [eventos.md](eventos.md). No es para copiar su esquema.

## 1. Qué es

Es un **PMS** (Property Management System) de escritorio, on-premise, hecho para hoteles en Perú. Cubre el back-office completo de un hotel mediano o grande, y puede manejar varias propiedades (`tHotel` CHAR(2)) y varias empresas (`TEMPRESA`).

| Módulo | Tablas principales | Qué hace |
|---|---|---|
| **Reservas y recepción** | `MRESERVA`, `MTIPOHABITACIONRESERVA`, `MPASAJERO`, `MPASAJEROHISTORICO`, `TESTADORESERVA`, `TFORMARESERVA`, `TRECOJORESERVA`, `MBLOQUEOHABITACION`, `TOCUPABILIDADDIARIA` | Reservas individuales y de grupo, ficha de registro del huésped, check-in/out, bloqueos, ocupación diaria y traslados |
| **Habitaciones y ama de llaves** | `THABITACIONHOTEL`, `TTIPOHABITACIONHOTEL`, `TZONAHABITACION`, `TCUARTELERO`, `TFOTOHABITACION` | Inventario físico, piso, zona (fumador), estado de recepción, estado de limpieza, camarera asignada |
| **Tarifario** | `TTIPOTARIFA`, `TTIPOHABITACIONTARIFA`, `TVIGENCIATARIFA`, `TTARIFACOMPANIA`, `TINCLUIDOTARIFA`, `TIMPUESTOTARIFA`, `TSEGMENTO`, `TSUBSEGMENTO` | Planes tarifarios por segmento, precio por día de semana, precio niño, vigencias, tarifas negociadas por empresa, qué incluye cada tarifa |
| **Cuentas del huésped (folio)** | `TCUENTAHABITACION`, `TCUENTARESERVA`, `TCUENTAASIGNADARESERVA`, `TPREPAGO`, `TDESCUENTOPAX`, `TDESCUENTOCOMPANIA` | Cargos a la habitación desde todos los módulos, cuentas separadas (empresa / huésped), transferencias entre habitaciones, adelantos |
| **Caja y facturación** | `TCAJA`, `MINICIOCAJA`, `MCIERRE`, `MDOCUMENTO`, `DDOCUMENTO`, `DPAGODOCUMENTO`, `MRECIBO`, `MNOTA`, `MNOTACREDITO`, `efactNotaCredito`, `TTIPODOCUMENTO`, `TTIPODOCUMENTOCAJA`, `TTIPOCAMBIO`, `TFORMASPAGO` | Turnos de caja en soles y dólares, comprobantes con serie por caja, notas de crédito/débito, recibos, cierre diario (auditoría nocturna), tipo de cambio diario, facturación electrónica vía un proveedor externo ("efact") |
| **Impuestos y exoneraciones** | `TIMPUESTO*` (9 tablas), `TEXONERACION`, `TEXONERACIONPASAJERO`, `TEXONERACIONTIPO`, `TEXONERACIONPRODUCTOPRECIO`, `TAFECTOIMPUESTO`, `TPAIS.tIdentificadorSunat` | IGV y otros cargos por tarifa, producto y reserva; **exoneración por pasajero y por tipo de producto** (turista extranjero) |
| **Punto de venta (restaurante, bar, room service)** | `TPUNTOVENTA`, `MCOMANDA`, `DCOMANDA`, `MDCOMANDA`, `TPRODUCTOPRECIO`, `TPRECIOPRODUCTOPUNTOVENTA`, `TCOMBO`, `TPRODUCTOMENU`, `TPRODUCTOAREA`, `TAREAIMPRESORA`, `TMOZO`, `MPROPINA`, `TGRUPOPRODUCTO`, `TSUBGRUPOPRODUCTO`, `TTIPOPRODUCTO` | Comandas por mozo, impresión por área (cocina, bar), precio por punto de venta, combos, costo con receta e insumos, propinas, **cargo a la habitación** |
| **Eventos (salones / MICE)** | `MEVENTOSRESERVA`, `DEVENTOSRESERVA*` (8 tablas), `TEVENTOS*` (14 tablas) | Alquiler de salones: montaje (teatro, escuela, banquete) con capacidad por salón × montaje, equipos con inventario, alimentos y bebidas, servicios especiales, órdenes por área, carta de cotización, estado tentativo/confirmado, tiempo de preparación entre eventos |
| **Telefonía** | `TTELEFONIA*` (12 tablas) | Tarificador: lee la trama de la central telefónica (PBX), identifica el anexo de la habitación, calcula el costo por zona y destino y lo carga al folio |
| **Comercial / CRM corporativo** | `TCOMPANIA`, `TCONTACTO`, `TEJECUTIVO`, `TVISITA`, `TANIVERSARIO`, `TCLASIFICACIONCOMPANIA`, `TNIVEL`, `TCLUB`, `TPREMIO` | Empresas y agencias con límite de crédito y comisión, ejecutivos de venta, visitas comerciales, club de fidelidad con puntos y premios |
| **Seguridad y sistema** | `TUSUARIO`, `TGRUPOSEGURIDAD`, `TMATRIZSEGURIDAD`, `TMODULO`, `TPARAMETRO`, `TTABLA`, `W*` (tablas de trabajo), `*REPLICA*` | Usuarios por módulo, catálogo genérico de códigos, replicación entre sedes |

## 2. Qué confirma de nuestro diseño

| Concepto en INFHOTEL | Nuestro diseño ([hotel.md](hotel.md)) | Conclusión |
|---|---|---|
| `MRESERVA` (cabecera) + `MTIPOHABITACIONRESERVA` (una fila **por noche** con `fPernocte` y precio) | `hotel_reservas` + `hotel_reserva_habitaciones.desglose` por noche | ✔ Mismo concepto: el precio se congela noche por noche |
| `TOCUPABILIDADDIARIA` (confirmadas, disponibles, bloqueadas por día) | `hotel_disponibilidad` (una fila por tipo y día) | ✔ Mismo concepto. Ellos lo resuelven con **20 columnas por tipo** (`nConfirmada1…20`); nuestra versión normalizada no tiene ese tope |
| `TVIGENCIATARIFA` | `hotel_temporadas` | ✔ |
| `TTIPOTARIFA` (planes, `lIncluido`, `lPaquete`) | `hotel_planes_tarifa` | ✔ con brechas (ver §3) |
| `MBLOQUEOHABITACION`, `lBloqueado` | `hotel_bloqueos` | ✔ |
| `tEstadoAmaLlaves` en `THABITACIONHOTEL` | `hotel_habitaciones.limpieza` | ✔ |
| `TEXONERACION*` (turista extranjero) | `config_hotel.exportacion_servicios` | ✔ La necesidad es real; el detalle es más fino (ver §3) |
| `TPREPAGO` (adelantos con flags de impuesto) | Brecha B2 de [spec.md](spec.md) (comprobantes con adelanto) | ✔ Confirma que el anticipo con su tratamiento tributario es un tema real |
| `TTIPOCAMBIO` diario, montos en MN y ME en caja | "Una moneda por tienda" (fuera de alcance en [spec.md](spec.md)) | ⚠ Confirma que **hotel y turismo trabajan en soles y dólares** a la vez. Hay que reconsiderarlo |

## 3. Brechas que revela (propuestas para hotel.md)

Ordenadas por impacto en un hotel o hostal pequeño o mediano, nuestro cliente objetivo.

| # | Qué tiene INFHOTEL | Qué nos falta | Propuesta | Prioridad |
|---|---|---|---|---|
| H1 | **Ficha de registro** completa en `MPASAJERO`: nacionalidad, país del pasaporte, **fecha de ingreso al país**, motivo de viaje, procedencia, ocupación, transporte | `participantes` no tiene ingreso al país ni motivo de viaje | Agregar a `participantes.datos` en el hotel: `fecha_ingreso_pais`, `motivo_viaje`, `procedencia`. Es el registro de huéspedes que exige el reglamento y el sustento de la exoneración | **MVP** |
| H2 | **Exoneración por pasajero y por tipo de concepto** (`TEXONERACIONPASAJERO`, `TEXONERACIONTIPO`): el alojamiento del extranjero va exonerado, otros consumos no | Un solo flag por tienda | La exoneración se decide **por reserva y por línea**: aplica a hospedaje (y alimentación incluida) cuando el titular es no domiciliado con sustento. El pipeline de precio ([patrones.md §3.4](patrones.md)) calcula el impuesto **por línea** | **MVP** (si se cobra a extranjeros) |
| H3 | **Precio por día de semana** (`nLunes…nDomingo`) y **precio niño** en `TTIPOHABITACIONTARIFA` | Solo `precio_fin_semana` y persona extra | Reemplazar `precio_fin_semana` por `precios_dia_semana JSONB` (7 valores opcionales) y agregar `precio_nino` | MVP |
| H4 | **Lo incluido en la tarifa con su valor** (`TINCLUIDOTARIFA`: desayuno S/ 15 dentro de la tarifa, monto deducible) | `hotel_planes_tarifa.incluye` es solo texto | `incluye JSONB [{concepto, monto}]`. Sirve para separar hospedaje de alimentos en el comprobante (tributan distinto) y para el reporte de alimentos del día | Fase 2 |
| H5 | **Reservas de grupo** (`tCodigoReservaMadre`, `tGrupo`, `nPasajeroLiberado`: 1 liberado cada N pagantes) | Una reserva = una estadía | `hotel_reservas.reserva_madre_id` + `grupo_nombre`. Liberados como una línea a S/ 0 | Fase 2 (las agencias mandan grupos) |
| H6 | **Tarifas negociadas por empresa o agencia** (`TTARIFACOMPANIA`), con crédito y comisión (`TCOMPANIA.tLimiteCredito`, `nPorcentajeComision`) | No existe B2B | Módulo **"Empresas y agencias"**, común a hotel y tours: tarifa negociada, crédito, comisión y reserva con código de convenio. Se cruza con "afiliados" de [tours.md](tours.md) | Fase 2 |
| H7 | **Folio con cuentas separadas** (`TCUENTAASIGNADARESERVA`: la empresa paga el alojamiento y el huésped sus consumos) y transferencias entre habitaciones | `hotel_cargos` plano | `hotel_cargos.cuenta` (`principal \| huesped \| empresa`) + regla de asignación por tipo de concepto. Al check-out, un comprobante por cuenta | Fase 2 |
| H8 | **Plan de comidas por día** (`MTIPOALIMENTORESERVA`, `TALIMENTORESERVA`) | Solo "con desayuno" como plan | Reporte diario de desayunos esperados (huéspedes en casa con plan que lo incluye). No hace falta tabla | MVP (reporte) |
| H9 | **Lista de espera y complementarias** (`nListaEspera*`, `nComplementaria*`) | No existe | Complementaria (cortesía / uso de la casa) = reserva a S/ 0 con `origen = cortesia`. La lista de espera se deja para después | Fase 2 |
| H10 | **Traslado aeropuerto** (`TRECOJORESERVA`) | No existe en hotel | Extra de la reserva con fecha, hora y lugar. Encaja con `tour_extras` y es un **puente natural hotel ↔ agencia de tours** | Fase 2 |
| H11 | **Segmento y canal de la reserva** (`TSEGMENTO`, `TSUBSEGMENTO`, `TFORMARESERVA`) | Solo `origen` | `hotel_reservas.segmento` (corporativo, turismo, grupo, OTA) para los reportes de ADR por segmento | Fase 2 |
| H12 | **Camarera asignada** (`TCUARTELERO`) | Solo el estado de limpieza | `hotel_habitaciones.responsable_limpieza` | Fase 2 |
| H13 | **Auditoría nocturna** (`MCIERRE`): cierra el día y carga la noche al folio | El precio se cobra al reservar | Para un hotel pequeño no hace falta mientras la estadía se cobre por adelantado o al check-out. Se necesita recién con folio abierto y crédito (H6, H7) | Fuera del MVP |

## 4. Eventos: INFHOTEL maneja **otro tipo de evento**

El módulo de eventos de INFHOTEL **no es venta de entradas**: es **alquiler de salones** (MICE / banquetes), un modelo distinto al de [eventos.md](eventos.md).

| | Nuestro [eventos.md](eventos.md) (ticketing) | INFHOTEL (salones / banquetes) |
|---|---|---|
| Cliente | Público general, compra online | Empresa o persona que organiza (boda, congreso, capacitación) |
| Se vende | Entradas con QR | Uso de un salón por horas + montaje + alimentos y bebidas + equipos |
| Inventario | Cupo por tipo de entrada y aforo | Salón × franja horaria, con **tiempo de preparación** entre eventos (`nHoraMuerta`), capacidad según montaje (`TEVENTOSCAPACIDAD`), equipos con stock (`TEVENTOSEQUIPO`) |
| Flujo | Compra directa | **Cotización → tentativo → confirmado**, con carta de cotización (`TEVENTOSCARTAMAESTRA`), prioridad y coordinador |
| Operación | Escáner en la puerta | **Orden de servicio por área** (`DEVENTOSRESERVAAREA`: cocina, mantenimiento, audiovisuales) |
| Pago | Al comprar | Adelanto + facturación a la empresa (`DEVENTOSRESERVAFACTURACION`) |

**Conclusión:** son dos productos.

- **Eventos con entradas** (conciertos, talleres, conferencias abiertas) → la vertical `eventos` tal como está diseñada.
- **Salones y banquetes** → un **módulo del hotel**, en fase 2. También sirve a negocios que solo alquilan locales (centros de convenciones, restaurantes con salón). Encaja como un cuarto tipo de reserva: "recurso por franja horaria", con la misma mecánica de retención, pero por horas en vez de noches o cupos.

Para el mercado de tours esto no aplica; se registra como hallazgo para la vertical hotel.

## 5. Lo que **no** conviene replicar

| Módulo / práctica | Por qué no |
|---|---|
| **Telefonía (tarificador de PBX)** | Tecnología en desuso: los huéspedes usan celular y WhatsApp, y un SaaS en la nube no puede leer la trama serial de una central. Si un hotel cobra llamadas, se registran como cargo manual (`hotel_cargos`) |
| **POS de restaurante completo** (comandas, mozos, impresión por área, recetas e insumos) | Es otro producto (Infhotel tiene uno aparte, `lInforest`). Para el MVP basta con **cargo a la habitación manual**. Más adelante conviene **integrar** con un POS existente antes que construir uno |
| **Club de fidelidad con puntos** | Bajo valor para hoteles pequeños; la recompra se logra con cupones y reseñas, que ya existen |
| **CRM de visitas comerciales** (`TVISITA`, `TEJECUTIVO`) | Es fuerza de ventas de hoteles corporativos grandes, no de nuestro cliente objetivo |
| **Caja con turnos y arqueo en efectivo** (`MINICIOCAJA` con 30 columnas por medio de pago y moneda) | El cobro va por pasarela y por Yape/transferencia. Un arqueo simple por día puede venir después |

## 6. Problemas de diseño del esquema (lo que hay que evitar)

Útil si alguna vez hay que **migrar datos** desde INFHOTEL o integrarse con él:

- **Dinero en `float`** (`nPrecio`, `nTotal`, `nMonto`): produce errores de redondeo en totales e impuestos. Nosotros usamos `DECIMAL(10,2)`.
- **Integridad referencial casi inexistente:** 13 FKs para 191 tablas, y varias con `NOCHECK` (desactivadas). Al migrar habrá huérfanos y códigos sin catálogo.
- **Columnas por dimensión:** `TOCUPABILIDADDIARIA` tiene 20 bloques de columnas (un máximo de 20 tipos de habitación), y `TSEMESTRE1200901` tiene **una columna por día** y una tabla por semestre.
- **Fecha y hora en columnas separadas** (`fLlegada` + `hLlegada`) y sin zona horaria.
- **Claves de negocio cortas como PK** (`tCodigoReserva` NVARCHAR(6), `tHotel` CHAR(2)): límites de numeración y colisiones entre sedes, por eso las tablas de réplica.
- **Seguridad:**
  - contraseñas en texto plano (`TUSUARIO.tPassword VARCHAR(10)`, `TTELEFONIACLAVE.tclave`);
  - **datos de tarjeta en claro** en la ficha del huésped (`MPASAJERO.tTarjeta`, `tVenceTarjeta`), lo que incumple PCI-DSS;
  - imágenes guardadas como `image` dentro de la base.
- **Tablas de trabajo por sesión** (`W*`) dentro del esquema productivo.

**Si se migra:** no se importan tarjetas ni contraseñas, los montos se convierten a `DECIMAL` y los códigos se mapean a UUID guardando el código original en `metadata` para trazabilidad.

## 7. Implicancias estratégicas

INFHOTEL (y PMS parecidos) ya está instalado en muchos hoteles medianos de Perú. Hay tres caminos:

| Opción | Qué significa | Pros | Contras |
|---|---|---|---|
| **A. Reemplazarlo** | Nuestro hotel vertical como PMS completo | Un solo sistema para el hotel | Años de funcionalidad (caja, POS, auditoría, SUNAT) por construir; el hotel no cambia de PMS fácilmente |
| **B. Complementarlo** | Ser **motor de reservas web + asesor IA + pagos online**, y pasar las reservas confirmadas al PMS (integración o exportación) | Entra rápido en hoteles que ya tienen PMS: vende lo que el PMS de escritorio no tiene (web, chat IA, pago online) | Requiere integrar con cada PMS (base on-premise, a menudo sin API) |
| **C. Segmentar** | PMS ligero para **hostales y hoteles pequeños sin PMS** (reemplazan Excel y cuaderno) + motor de reservas para los que ya tienen uno | Cubre los dos mercados con el mismo producto | Hay que decidir hasta dónde llega el "PMS ligero" |

**Recomendación:** opción **C**, que es lo que ya describe [hotel.md](hotel.md): motor de reservas + PMS ligero (calendario, check-in/out, limpieza, cargos simples). La integración con PMS existentes (B) queda como fase posterior, empezando por una **exportación** de reservas (CSV o correo con formato), antes que una sincronización directa con su SQL Server.

## 8. Cambios propuestos a la spec (pendientes de aprobar)

1. **hotel.md:** incorporar H1, H2, H3 y H8 al MVP; H4-H7 y H9-H12 como fase 2.
2. **spec.md:** reabrir "una moneda por tienda". Hoteles y agencias de turismo cobran en soles y en dólares; INFHOTEL lo maneja con tipo de cambio diario.
3. **Nuevo módulo transversal "Empresas y agencias"** (B2B: tarifa negociada, crédito, comisión), compartido por hotel y tours.
4. **Salones y banquetes** como módulo de fase 2 del hotel, separado de la vertical de eventos con entradas.
5. **Registrar** que telefonía, POS completo y club de fidelidad quedan fuera de alcance.
