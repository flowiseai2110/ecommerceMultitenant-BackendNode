# Tareas: Alquiler de locales para eventos

> Implementa [spec.md](spec.md) según [plan.md](plan.md). Se trabaja directo sobre `main`. Marcar `[x]` al cerrar cada tarea.
> Cada tarea indica los casos de uso que cierra ([casos-de-uso.md](casos-de-uso.md)).

## Fase 1 — Núcleo: salón, calendario, solicitud, contrato y plan de pagos

Cierra CU-01, CU-03, CU-04, CU-06 (con pago manual), CT-01 a CT-06, CE-01 a CE-09, CE-12 a CE-14, CE-16 y CE-17.

### Backend
- [ ] **L1.1** `docs/sql/locales_fase_1.sql`: `tipo_negocio = 'locales'`, columnas de `config_reservas`, `local_salones`, `local_turnos`, `local_paquetes`, `btree_gist` + `local_ocupaciones` con la restricción de exclusión, columnas de `reservas`, `reserva_cuotas`, `pagos.cuota_id`, `reserva_cambios`, `local_cotizaciones`. Modelos en `schema.prisma` (`franja` como `Unsupported`), `npx prisma generate`, tablas en `TENANT_SCOPED_MODELS`.
- [ ] **L1.2** `estados.js`: `TRANSICIONES_LOCAL`, `suspendida`, vencimiento de `solicitada` por `apartadoHasta`. Tests (sin romper hotel, tours ni eventos).
- [ ] **L1.3** `locales/franja.js` + `locales/cotizar.js`: precio por día, por persona, temporadas, cupón, aforo (licencia y paquete), turnos que cruzan la medianoche, separación y garantía. Tests (CE-06, CE-08).
- [ ] **L1.4** `locales/ocupaciones.js`: ocupar, liberar, limpiar vencidos, traducir `23P01` a `FECHA_NO_DISPONIBLE` + `locales/alternativas.js`. Test de concurrencia con dos transacciones contra la base de datos de pruebas (CE-01).
- [ ] **L1.5** `locales/plan-pagos.js` (`generarPlan`) y `locales/contrato.js` (render, hash, validación de variables). Tests.
- [ ] **L1.6** Salones, turnos y paquetes: servicio + rutas admin (`/admin/reservas/locales/salones…`) y store (`/store/locales/salones…`). Validación de R2.7 (`CAMBIO_CON_RESERVAS`, CE-05).
- [ ] **L1.7** Calendario store y admin; bloqueos manuales (CE-02, CE-03).
- [ ] **L1.8** Cotizaciones: crear (cliente y negocio), token, vigencia, canal de origen, precio congelado (CE-07, CT-01).
- [ ] **L1.9** Vertical `local` en `reservas.service.js`: crear solicitud desde cotización con `idempotencyKey` y ocupación (CE-09), aceptar (contrato + plan + apartado), rechazar con alternativas (CT-05), vencimientos que liberan la ocupación (CT-02, CT-03), `pago_directo` (CU-06).
- [ ] **L1.10** Cuotas: aceptar contrato, captura por cuota o número de operación (CE-14), verificar / rechazar (la 1.ª confirma, CT-04), editar plan antes del primer pago (`PLAN_BLOQUEADO`), `monto_pagado` sin garantía, indicador de mora (CT-06), índice único de pago por cuota (CE-11).
- [ ] **L1.11** Bandeja: pestañas `cuotas_vencidas` y `garantias`, resumen con mora. Serializer de la vertical (plan, contrato, mora, garantía).
- [ ] **L1.12** Correos de la vertical (aceptada con contrato y plan, cuota verificada, confirmación) y plantillas de WhatsApp. Reenvío desde el admin (CE-13).
- [ ] **L1.13** Limitadores de lectura y escritura para `/store/locales` y `/store/reservas` (CE-16).
- [ ] **L1.14** Seed de configuración para tiendas `locales` (separación 40 %, tramos, plantilla de contrato) y onboarding sin envíos.
- [ ] **L1.15** Tests de rutas (validación, roles, tokens) y de servicio (transiciones, ocupación, idempotencia, acciones del admin repetidas, CE-17).

### Admin
- [ ] **L1.20** Menú `locales`; formulario de salón con pestañas Turnos y Paquetes.
- [ ] **L1.21** Calendario por salón (mes y semana) con bloqueos y "crear cotización".
- [ ] **L1.22** Cotizaciones del negocio (crear con ajuste, compartir por WhatsApp).
- [ ] **L1.23** Detalle de reserva local: contrato, plan de pagos (editar, verificar cuota), aviso de bloqueo manual al aceptar (R12.3).
- [ ] **L1.24** Configuración de locales: separación, plazos, garantía, tramos, plantilla de contrato con vista previa.

### Tienda
- [ ] **L1.30** `/salones` y ficha con calendario, turnos, paquetes y resumen.
- [ ] **L1.31** Cotización (`/cotizacion/:token`) con "Solicitar" y "Enviar por WhatsApp".
- [ ] **L1.32** Solicitud de local (tipo de evento, invitados, proveedores externos) con manejo del 409 y sus alternativas.
- [ ] **L1.33** Seguimiento: contrato con aceptación, plan de pagos por cuota, captura o número de operación, mora y garantía.
- [ ] **L1.34** Página de mantenimiento con el WhatsApp de la tienda (CE-12).

### Verificación
- [ ] **L1.40** Correr `locales_fase_1.sql` en Supabase y `npx prisma generate`.
- [ ] **L1.41** Recorrer en el navegador: quinceaños de sábado noche para 150 personas, separación S/ 500, 3 cuotas, verificación; segundo cliente en la misma franja recibe alternativas.

## Fase 2 — Cambios, devoluciones y día del evento

Cierra CU-02, CU-07, CT-07 a CT-21 y CE-15.

### Backend
- [ ] **L2.1** `docs/sql/locales_fase_2.sql`: `reserva_devoluciones`, `reserva_liquidaciones`, `local_visitas`, `local_lista_espera`, `job_corridas`.
- [ ] **L2.2** `locales/plan-pagos.js` (`replanificar`) y reprogramación: pedido del cliente, aprobación, reprogramación directa y por el negocio, en una transacción (CT-07, CT-09, CT-10). Historial en `reserva_cambios`.
- [ ] **L2.3** Lista de espera: alta y aviso al liberarse una franja (CT-08).
- [ ] **L2.4** Suspensión por fuerza mayor con saldo a favor y su vencimiento (CT-11, CT-16).
- [ ] **L2.5** `locales/devolucion.js` + cancelación con motivo, simulación y devolución registrada; constancia (CT-12 a CT-17). Tests por tramo y motivo.
- [ ] **L2.6** `locales/liquidacion.js` + entrega, novedades (horas extra con hora tope, descorche, proveedores, daños, penalidades) y cierre; cobro adicional o devolución de garantía; `no_show` (CU-07, CT-18 a CT-20).
- [ ] **L2.7** Libro de Reclamaciones ligado a la reserva de local (CT-21).
- [ ] **L2.8** Visitas: horario, solicitud, confirmación, realizada / no asistió, cotización desde la visita (CU-02).
- [ ] **L2.9** `jobs/locales.job.js`: recordatorios de cuota (7/3/1), cotización, visita, lista de espera, garantías vencidas, registro en `job_corridas` y aviso de job detenido (CE-15).
- [ ] **L2.10** Correos de reprogramación, cancelación, devolución, liquidación, visita y lista de espera.

### Admin
- [ ] **L2.20** Reprogramar (pedido del cliente y directo), suspender, cancelar con simulación de devolución, devoluciones con constancia.
- [ ] **L2.21** Vista "Eventos de la semana" y liquidación (entrega con fotos, novedades, cierre).
- [ ] **L2.22** Visitas (lista y acciones) y horario de visitas en la configuración.
- [ ] **L2.23** Aviso de job detenido en el resumen.

### Tienda
- [ ] **L2.30** Reprogramar desde el seguimiento con opciones y diferencias; lista de espera.
- [ ] **L2.31** Agendar visita y página de la visita.
- [ ] **L2.32** Seguimiento con historial, devoluciones y liquidación.

### Verificación
- [ ] **L2.40** Recorrer: reprogramación de sábado a viernes con diferencia a favor; cancelación a 45 días; liquidación con 2 horas extra y un daño; no-show.

## Fase 3 — Promoción, canales, pasarela e IA

Cierra CU-05, CU-06 con pasarela, CE-10 y CE-11 (pasarela).

- [ ] **L3.1** `docs/sql/locales_fase_3.sql`: `reserva_participantes`, `reservas.lista_cerrada_en`, `reservas.corte_lista`.
- [ ] **L3.2** Promoción: lista de alumnos, cuota y token por participante, panel del delegado, cierre de lista con recálculo y aviso de mínimo (CU-05, CT-15).
- [ ] **L3.3** Pasarela por cuota (depende de T1.14 de mini-booking) y conciliación de cargos `pendiente` en el job (CE-10); devolución automática de doble cobro (CE-11).
- [ ] **L3.4** Reporte por canal de origen (R12.5).
- [ ] **L3.5** Asesor IA: perfil `locales` con `ver_salones` y `fechas_libres`.
- [ ] **L3.6** Admin y tienda: panel del delegado, página del apoderado, reporte de canales.
- [ ] **L3.7** Recorrer: promoción de 20 alumnos, 15 pagan por enlace, cierre con 18.

## Pendientes de decisión

- [ ] **D1** Varios salones por tienda (propuesta: sí). Spec, pregunta 1.
- [ ] **D2** Garantía como cuota cobrada (propuesta: sí). Spec, pregunta 2.
- [ ] **D3** Aceptación del contrato con casilla (propuesta: sí). Spec, pregunta 3.
- [ ] **D4** Feriados precargados o marcados por el dueño. Spec, pregunta 4.
- [ ] **D5** Hora tope por tienda o por salón. Spec, pregunta 5.
</content>
</invoke>
