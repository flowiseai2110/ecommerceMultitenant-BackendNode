# Tareas: Libro de Reclamaciones virtual

> Implementa [spec.md](spec.md) según [plan.md](plan.md). Marcar `[x]` al cerrar cada tarea.

## Cómo retomar

1. Las **preguntas abiertas** de [spec.md](spec.md#preguntas-abiertas) se cerraron con sus propuestas: correlativo por año, se conservan las hojas, FK a tiendas `RESTRICT` (una tienda con hojas ya no se puede borrar físicamente).
2. Todo está escrito y **sin commit** en BackendNode, FrontendAdmin y FrontendStore (rama `main`). Tests: `npm test -- modules/libro-reclamaciones` (54) y la suite completa del backend pasa. `ng build` sin errores en admin y tienda.
3. Falta: correr `docs/sql/libro_reclamaciones_setup.sql` en Supabase (T1.3), la verificación en navegador (Fase 6) y las variables en Railway: `LIBRO_LINK_SECRET` y `LIBRO_IP_SALT` (obligatorias), `LIBRO_LINK_TTL_DIAS` y `LIBRO_RATE_LIMIT_MAX` (opcionales). En el `.env` local ya hay valores de desarrollo.

Orden de despliegue: SQL → backend → admin → tienda. La tienda es lo último porque el enlace del footer hace pública la obligación: no debe aparecer antes de que la tienda pueda responder desde el admin.

## Fase 0 — Validación legal

- [ ] **T0.1** Contrastar los campos del formulario y los textos legales con el Anexo I vigente (DS 011-2011-PCM, modificado por DS 101-2022-PCM) publicado en El Peruano.
- [x] **T0.2** Verificar la lista de feriados nacionales de 2026 y 2027 (16 por año; 2027 con Semana Santa 25–26 de marzo).
- [ ] **T0.3** Obtener el ícono oficial del libro abierto (Anexo II) en SVG. Hoy `claims-book-link` usa un libro abierto dibujado a mano.

## Fase 1 — Datos

- [x] **T1.1** Modelos `libro_reclamaciones` y `libro_reclamaciones_eventos` en `schema.prisma` + relaciones en `tiendas` y `pedidos`.
- [x] **T1.2** `docs/sql/libro_reclamaciones_setup.sql`: DDL de `prisma migrate diff`, CHECKs, trigger de inmutabilidad (hojas y eventos), RLS sin políticas.
- [ ] **T1.3** Correr el SQL en Supabase + `prisma generate`. Probar a mano: un `UPDATE` de `detalle` y un `DELETE` deben fallar.

## Fase 2 — Backend: núcleo

- [x] **T2.1** `plazos.js`: `hoyLima`, `esDiaHabil`, `sumarDiasHabiles`, `diasHabilesRestantes`, `semaforo`, `FERIADOS`.
- [x] **T2.2** Tests de plazos: casos de R5.1, registro a las 23:30 de Lima, año sin feriados (warn), test "en diciembre debe existir el año siguiente".
- [x] **T2.3** `textos-legales.js` y `libro.schema.js` (Zod: documento por tipo, menor ⇒ apoderado, longitudes, honeypot).
- [x] **T2.4** `libro.token.js` + tests (firma, expiración, `aud`, `tid`), copiando `resenas.token.js`.
- [x] **T2.5** `libro.service.registrarHoja`: advisory lock + correlativo, snapshot del proveedor, `fechaLimite`, evento `registrada`, enlace silencioso del pedido.
- [ ] **T2.6** Test de concurrencia contra una BD real: 10 registros en paralelo de la misma tienda → correlativos 1..10 sin huecos (los tests unitarios solo cubren el cálculo; el lock lo da Postgres).
- [x] **T2.7** `libro.serializer.js`: DTO store (sin `ipHash`, `authUserId` ni eventos), DTO admin (con semáforo y días restantes), fila CSV.

## Fase 3 — Backend: rutas y correos

- [x] **T3.1** `libro.store.routes.js`: `GET /proveedor`, `POST /` (limiter, honeypot, `optionalAuth`), `GET /hoja/:token`. Montar en `routes/store/index.js`.
- [x] **T3.2** `deliverEmail` con `replyTo`; `renderHojaHTML`; los 3 correos (constancia, aviso a tienda, respuesta).
- [x] **T3.3** Envío de constancia y aviso después del commit, con eventos `constancia_enviada` / `constancia_fallo` / `aviso_tienda_enviado`.
- [x] **T3.4** `libro.admin.routes.js`: `resumen`, lista con filtros, detalle, `PATCH estado`, `vista-previa`, `respuesta`, `exportar.csv`, con los roles de la tabla "Admin" de [plan.md](plan.md). Montar en `routes/admin/index.js`.
- [x] **T3.5** `responderHoja`: UPDATE condicional + envío dentro de la transacción; 409 si ya está respondida; 502 y rollback si falla Resend; rama `domicilio` sin correo.
- [x] **T3.6** `config.libro` + `.env.example` + Swagger.
- [x] **T3.7** Tests de rutas: 201, 400 (Zod), 429, honeypot (201 sin guardar), token de otra tienda → 404, viewer no responde (403), doble respuesta → 409, fallo de Resend → la hoja sigue pendiente.

## Fase 4 — Admin (FrontendAdmin)

- [x] **T4.1** Modelo + `libro-reclamaciones.service.ts` + `libro-alertas.service.ts`.
- [x] **T4.2** `libro-list`: filtros, chips de semáforo, búsqueda, paginación, exportar CSV.
- [x] **T4.3** `libro-detail`: hoja en formato Anexo I, timeline de eventos, pedido enlazado.
- [x] **T4.4** Panel "Responder": vista previa (iframe `srcdoc`) → confirmación → envío. Variante "carta entregada".
- [x] **T4.5** Menú con badge + ruta en `app.routes.ts`; acciones ocultas para editor/viewer.
- [x] **T4.6** Aviso si faltan RUC, razón social o dirección (R7.1): va arriba de la bandeja del libro, no en el dashboard.

## Fase 5 — Tienda (FrontendStore)

- [x] **T5.1** Modelo `libro-reclamaciones.model.ts` (tipos + validadores de DNI/CE/pasaporte) + `claims-book.service.ts`.
- [x] **T5.2** `claims-book-link` (SVG libro abierto, variantes `footer` e `inline`).
- [x] **T5.3** `store-footer`: enlace fijo en la barra inferior y en "Ayuda"; enlace en `account-page` y `order-tracking-page`.
- [x] **T5.4** `claims-book-page`: cabecera del proveedor, 3 bloques, menor de edad, tarjetas Reclamo/Queja, medio de respuesta, declaración, textos legales, honeypot oculto.
- [x] **T5.5** Precarga con sesión: datos de la cuenta + selector de pedidos.
- [x] **T5.6** Envío: estado "Registrando…", aviso tras 4 s, errores 400/429 en el campo o arriba del formulario, navegación a la constancia con `replaceUrl`.
- [x] **T5.7** `claim-receipt-page`: hoja + respuesta + "Imprimir / Guardar PDF"; estilos `print:`; `noindex`.
- [x] **T5.8** Rutas lazy en `store.routes.ts`; `ng build` sin errores; SSR de ambas páginas.

## Fase 6 — Verificación

- [ ] **T6.1** En el móvil (375 px), registrar un reclamo sin sesión en < 3 min; llega la constancia por correo y el link abre la hoja.
- [ ] **T6.2** Con sesión: datos precargados y pedido seleccionable; en el admin aparece enlazado al pedido.
- [ ] **T6.3** Menor de edad sin datos del apoderado → no deja enviar.
- [ ] **T6.4** Dos hojas seguidas → `00001-2026` y `00002-2026`; la tienda recibe el aviso por correo.
- [ ] **T6.5** Admin: semáforo correcto (forzar `fecha_limite` en una copia de prueba), badge del menú, respuesta por correo recibida, la hoja no se puede responder dos veces.
- [ ] **T6.6** Constancia: el link de la tienda A en el subdominio de la tienda B → 404.
- [ ] **T6.7** Imprimir la constancia: sin header, footer, chat ni bottom-nav.
- [ ] **T6.8** El enlace del footer se ve en todas las plantillas de diseño y en el modo oscuro.
- [ ] **T6.9** CSV abre bien en Excel (tildes, ñ, separador).

## Fase 7 — Cierre

- [ ] **T7.1** Commits en BackendNode, FrontendAdmin y FrontendStore.
- [ ] **T7.2** Avisar a las tiendas activas que completen RUC, razón social y dirección.

## Fase 8 — Asistencia con IA (R9)

> Diseño en [plan.md](plan.md#asistencia-con-ia-r9-fase-2). Empezar después de cerrar la Fase 6: la IA se apoya en la bandeja ya verificada.

**Backend**
- [ ] **T8.1** `libro.ia.js`: `paraModelo()` con lista blanca de campos (R9.11) + test que verifique que documento, domicilio, correo, teléfono, apoderado e `ipHash` no salen.
- [ ] **T8.2** `libro.ia.js`: `redactarBorrador()` con prompt fijo, hoja delimitada, tool forzada `entregar_borrador`, validación Zod 20–5 000 / ≤ 2 000, evento `borrador_ia` y uso de tokens. Config `LIBRO_IA_MODELO`.
- [ ] **T8.3** Guía: tools `consultar_reclamaciones`, `ver_reclamacion`, `redactar_respuesta_reclamo`. Pasar `rol` desde la ruta; ocultar la de redacción a editor/viewer; `claveAccion` con `hojaId`; `TOOLS_DE_UI`.
- [ ] **T8.4** `asistente.catalogo.js`: pantalla `/libro-reclamaciones`. `asistente.conocimiento.js`: sección del libro.
- [ ] **T8.5** `responderSchema` + `responderHoja`: `asistidaPorIa` en el evento `respondida`.
- [ ] **T8.6** Asesor: reglas R9.8/R9.9 en el system prompt; tool `mis_reclamaciones` (patrón `estado-pedido`).
- [ ] **T8.7** Tests: hoja de otra tienda → `NO_ENCONTRADA`; viewer no recibe la tool de redacción; detalle con instrucciones embebidas no cambia la acción adoptada; `mis_reclamaciones` sin sesión → `NO_AUTENTICADO`, con hoja ajena → `NO_ENCONTRADA`.

**FrontendAdmin**
- [ ] **T8.8** Chat de la Guía: renderizar la acción `borrador_reclamo` como botón y navegar con `state`.
- [ ] **T8.9** Detalle de la hoja: precargar el panel desde `history.state`, etiqueta "Borrador sugerido por la IA — revísalo antes de enviar", enviar `asistidaPorIa`.

**Verificación y cierre**
- [ ] **T8.10** Probar con 5 hojas reales o realistas (producto roto, no llegó, demora, mala atención, queja sin pedido): el borrador responde cada punto y no promete nada que no estuviera en `solucion`.
- [ ] **T8.11** Asesor: "quiero reclamar" → da el enlace en la primera respuesta, sin condicionarlo a escribir por WhatsApp.
- [ ] **T8.12** Actualizar la política de privacidad (R9.14).

## Pendientes (fuera de alcance)

- [ ] Adjuntos (fotos) en la hoja, en un bucket privado de Supabase Storage.
- [ ] Recordatorio por correo a la tienda a 3 y 1 días hábiles del vencimiento (Supabase `pg_cron` + endpoint protegido, o un cron externo).
- [ ] Reporte al SIREC para tiendas que superen 3 000 UIT.
- [ ] Turnstile si aparece spam real.
