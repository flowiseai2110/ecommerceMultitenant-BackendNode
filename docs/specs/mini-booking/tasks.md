# Tareas: Mini booking — Fase 1 (hotel / hostal + núcleo)

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
