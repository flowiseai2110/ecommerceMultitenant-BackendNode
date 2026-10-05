# Tareas: Mini booking — Fase 1 (hotel / hostal + núcleo), Fase 2 (tours) y Fase 3 (eventos)

> Implementa [spec.md](spec.md) según [plan.md](plan.md). Se trabaja directo sobre `main`. Marcar `[x]` al cerrar cada tarea.

## Decisiones tomadas al implementar

- **Código de reserva = `pedidos.numero_pedido`** (`PED-0012`). El generador actual hace `CAST(REPLACE(numero_pedido, 'PED-', ''))`: un prefijo distinto (`R-`) rompería la numeración de toda la tienda. La interfaz lo muestra como "Código de reserva".
- **Zona horaria fija `America/Lima` (-05:00)**, como el Libro de Reclamaciones. Perú tiene una sola zona y no usa horario de verano: no se agrega `tiendas.zona_horaria`.
- **Fase 1 solo con pago manual** (Yape / Plin / transferencia + captura), que es como trabaja el caso real. La pasarela para reservas (monto a cuenta en vez de `pedido.total` y confirmación por webhook) queda en la tarea T1.14.
- Las columnas de eventos de `config_reservas` se agregan en la fase 3.
- **Pestañas de la bandeja:** "Próximas" (clave `confirmadas`) incluye también las **aceptadas esperando pago**, para que el negocio vea todo lo que viene. Las otras: Por responder, Pago por verificar, Historial.
- `hora_checkin` / `hora_checkout` se guardan como texto "HH:mm" (CHECK en SQL), no como TIME: se comparan y muestran como texto.
- Estado del backend: 48 tests propios (`npm test -- modules/reservas`) y la suite completa en verde (600).

## Fase 1 — Backend

- [x] **T1.1** `docs/sql/mini_booking_setup.sql`: `tiendas` (CHECK de `tipo_negocio`), `config_reservas`, columnas nuevas de `pedidos`, `cierres_fecha`, `reservas`, `hotel_tipos_habitacion`, `hotel_modalidades`, bucket privado `pagos-capturas`, RLS sin políticas. Modelos en `schema.prisma` + `npx prisma generate`. Tablas nuevas en `TENANT_SCOPED_MODELS`.
- [x] **T1.2** `modules/reservas/estados.js`: máquina de estados + `estadoEfectivo` (vencida a la hora de inicio, completada al pasar el fin). Tests.
- [x] **T1.3** `modules/reservas/hotel/cotizar.js`: cotización pura (noche / horas, viernes-sábado, por persona) + reglas (cierres, anticipación, capacidad, aviso de reserva próxima). Tests.
- [x] **T1.4** `reservas.config.service.js`: configuración con valores por defecto por vertical.
- [x] **T1.5** `reservas.token.js`: token del link de seguimiento (`RESERVAS_LINK_SECRET`).
- [x] **T1.6** `reservas.service.js` (store): cotizar, crear solicitud (idempotency key, máx. solicitudes abiertas), seguimiento, cancelar, subir captura.
- [x] **T1.7** `reservas.capturas.js`: subida al bucket privado y URL firmada.
- [x] **T1.8** `reservas.service.js` (admin): bandeja, resumen, detalle, aceptar (con ajuste), rechazar, verificar pago, rechazar pago, cancelar, no-show, agenda.
- [x] **T1.9** `reservas.emails.js`: solicitud recibida (cliente), nueva solicitud y pago subido (negocio), aceptada, rechazada, confirmada.
- [x] **T1.10** Habitaciones: admin (tipo de habitación + modalidades sobre `productos`) y store (listado y ficha con modalidades).
- [x] **T1.11** Fechas cerradas: CRUD admin + lectura store.
- [x] **T1.12** Rutas store/admin montadas; `GET/PUT /admin/reservas/config`.
- [x] **T1.13** Tests de rutas (validación, roles, token) y de servicio (transiciones, vencimiento, idempotencia).
- [ ] **T1.14** Pasarela en reservas: cargo por `monto_a_pagar` y confirmación por webhook.

## Fase 1 — Admin (FrontendAdmin)

- [x] **T1.20** Menú según `tipoNegocio` (hotel oculta stock, variantes y envíos; muestra Reservas, Habitaciones, Fechas cerradas, Configuración de reservas).
- [x] **T1.21** Bandeja de reservas (pestañas, badge) + detalle (titular, captura, acciones, "Responder por WhatsApp").
- [x] **T1.22** Habitaciones: formulario del tipo + modalidades.
- [x] **T1.23** Fechas cerradas y configuración de reservas.
- [x] **T1.24** Agenda "hoy y mañana".

## Fase 1 — Tienda (FrontendStore)

- [x] **T1.30** Rutas por vertical; home con grilla de habitaciones.
- [x] **T1.31** Ficha de habitación: modalidad, fecha / hora, huéspedes, total, aviso de reserva próxima.
- [x] **T1.32** Formulario de solicitud (titular, Ley 29733, factura opcional con RUC).
- [x] **T1.33** Página de seguimiento: estado, "Avisar por WhatsApp", datos de pago, subir captura, confirmación imprimible.
- [x] **T1.34** Asesor IA: perfil hotel (`ver_habitaciones`, `info_negocio`).

## Pendientes conocidos

- [ ] **T1.15** Reseñas: hoy se habilitan con el pedido `entregado`; falta habilitarlas con la reserva `completada` (spec R8.5).
- [ ] **T1.16** El formulario de producto del admin sigue mostrando stock y variantes en un hotel (se usan solo fotos y descripción). Simplificarlo cuando el tipo sea hotel.
- [ ] **T1.17** Test e2e en navegador del flujo completo (se cubrió con tests de backend y compilación de ambos frontends).

## Verificación

- [ ] **T1.40** Correr el SQL en Supabase y `npx prisma generate`.
- [ ] **T1.41** Recorrer el caso Verona completo: fracción 6 h para hoy, aceptar, subir captura, verificar, confirmación con "Pagado a cuenta".

---

# Fase 2 — Agencia de tours

## Decisiones tomadas al implementar

- **Misma tabla `reservas` y mismo flujo que el hotel** (solicitud → aceptada → pago → confirmada). `pedidos.tipo = 'tour'`, `reservas.pasajeros` guarda el snapshot `[{ tipoId, nombre, cantidad, precio }]` y `reservas.idioma` el idioma elegido. `adultos`/`ninos`/`modalidad_id` quedan en null.
- **Strategy por vertical en `reservas.service.js` (`VERTICALES`)**: cada vertical aporta su cotización y las columnas propias de la reserva; bandeja, estados, pago, correos y seguimiento son comunes. La bandeja, el badge y la agenda listan hotel y tours (`TIPOS_RESERVA`).
- **`tours.duracion_horas`** (nuevo, opcional): sirve para calcular `fin` (reserva completada y agenda). Sin dato, el tour termina a medianoche del día de salida, así no se da por completado al salir.
- **Horas de salida como texto "HH:mm"** (`TEXT[]` con CHECK), igual que `hora_checkin` del hotel.
- **Precio "desde"** = el tipo de pasajero activo más barato con precio > 0 (un "menor de 3 gratis" no anuncia el tour en S/ 0). La ficha exige al menos un tipo activo con precio.
- **Máximo de pasajeros por solicitud**: `tours.max_pasajeros` o 30 por defecto. No es cupo de la salida: la agencia confirma.
- **Asesor IA**: `buscar_tours` (texto, fecha → `sale_ese_dia` / `fecha_cerrada`, orden `populares` por reservas confirmadas en 90 días) e `info_agencia`. `ver_tour` se fusionó en `buscar_tours` (devuelve duración, días, horas, idiomas y edad mínima). Los perfiles del asesor quedaron en un registro (`PERFILES` en `agente.service.js`).
- **Tienda**: `/tours`, `/tours/:slug` (calendario propio que solo habilita días de salida no cerrados y con salidas pendientes) y `/reservar?tour=&fecha=&hora=&idioma=&pax=tipoId:2,tipoId:1`.

## Backend

- [x] **T2.1** `docs/sql/mini_booking_tours.sql`: `tours`, `tour_tipos_pasajero`, `reservas.idioma`, CHECKs y RLS. Modelos en `schema.prisma` + `TENANT_SCOPED_MODELS`.
- [x] **T2.2** `tours/cotizar.js`: días y horas de salida, precio por tipo de pasajero, adelanto y saldo en destino, cierres, anticipación, aviso, idioma, máximo de pasajeros. Tests.
- [x] **T2.3** `tours/tours.service.js`: vitrina (lista y ficha) y ficha del admin (tipos de pasajero reemplazados en transacción).
- [x] **T2.4** Generalizar `reservas.service.js` (Strategy por vertical), serializer (`pasajeros`, `idioma`, `personas`, `tour`) y correos (textos de agencia, punto de encuentro, recojo).
- [x] **T2.5** Rutas: `GET /store/reservas/tours[/:slug]`, `GET/PUT /admin/reservas/tours[/:productoId]`. Schemas (`tourSchema`, `cotizarSchema` con `pasajeros` e `idioma`). Tests.
- [x] **T2.6** Asesor IA: perfil tours (`buscar_tours`, `info_agencia`). Tests.

## Admin

- [x] **T2.10** Menú para `tours` (Reservas, Tours, Config. de reservas; sin productos, stock, envíos ni cupones). "Agencia de tours" en el formulario de la tienda.
- [x] **T2.11** Lista de tours + ficha "Salidas y precios" (días, horas, duración, idiomas, tipos de pasajero, encuentro, recojo, incluye / no incluye, qué llevar, requisitos, itinerario).
- [x] **T2.12** Bandeja, detalle, agenda y WhatsApp con pasajeros y textos de agencia; configuración sin check-in/check-out y cierres por tour.

## Tienda

- [x] **T2.20** Home de la agencia con grilla de tours; `/tours`; header y barra inferior sin carrito.
- [x] **T2.21** Ficha del tour: itinerario, incluye, encuentro, calendario de salidas, hora, idioma, pasajeros por tipo, total, adelanto y saldo, aviso de salida próxima.
- [x] **T2.22** Solicitud y seguimiento / confirmación con datos del tour (salida, idioma, pasajeros, punto de encuentro, recojo).

## Pendientes

- [ ] **T2.30** Correr `docs/sql/mini_booking_tours.sql` en Supabase (después del de la fase 1) y `npx prisma generate`.
- [ ] **T2.31** Recorrer en el navegador: crear tienda tipo tours, crear tour, solicitar con adelanto, aceptar, subir captura, verificar, confirmación con saldo en destino.
- [ ] **T2.32** Datos de cada acompañante (`pedir_acompanantes`, R5.2): hoy la solicitud solo pide al titular.

---

# Fase 3 — Eventos (por implementar)

Diseño en [plan.md](plan.md) ("Eventos", "Eventos: apartado de cupo"). Flujo distinto a hotel y tours: compra con **cupo real** apartado, sin solicitud.

## Backend
- [ ] **T3.1** SQL + Prisma: `eventos`, `evento_funciones`, `evento_tipos_entrada`, `evento_apartados`, `entradas`; columnas de eventos en `config_reservas` (`cierre_pago_manual_horas`, `apartado_pasarela_min`, `apartado_manual_min`, `max_entradas_por_compra`, `umbral_ultimas_entradas`).
- [ ] **T3.2** Estados de evento (`por_pagar` → `pago_en_revision` → `confirmada` / `vencida`), con vencimiento del apartado calculado al leer.
- [ ] **T3.3** `GET /store/eventos/:slug/funciones` con disponibilidad (`cupo − vendidos − apartados vigentes`), "Agotado" / "Últimas entradas" y métodos de pago por función (cierre del pago manual).
- [ ] **T3.4** `POST /store/eventos/compras`: `FOR UPDATE` de los tipos, validar cupo, crear pedido `por_pagar` + apartados (idempotency key). Tests de concurrencia (dos compras por la última entrada).
- [ ] **T3.5** Captura del pago manual, verificación del organizador y emisión de entradas (`vendidos += n`, borrar apartados, `qr_token` HMAC, código legible).
- [ ] **T3.6** `GET /store/entradas/:token` y correo con las entradas.
- [ ] **T3.7** Admin: CRUD de evento + funciones + tipos de entrada; bandeja de compras; `POST /admin/entradas/validar` (QR o código, uso único); búsqueda en la puerta y "verificar y emitir" (R9.7).
- [ ] **T3.8** Asesor IA: `ver_eventos`, `ver_entradas`.

## Admin / Tienda
- [ ] **T3.10** Admin: eventos, funciones y entradas; pantalla móvil "Validar entradas" (cámara con `BarcodeDetector` + código manual).
- [ ] **T3.20** Tienda: grilla de eventos, ficha con funciones y entradas, compra con contador del apartado (fuera de la zona de Angular, tras `afterNextRender`), pago manual con aviso R9.6, página de entradas con QR.
