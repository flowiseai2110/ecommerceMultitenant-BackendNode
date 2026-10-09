# Tareas: comunicados de la tienda

> Implementa [spec.md](spec.md) según [plan.md](plan.md). Marcar `[x]` al cerrar cada tarea.

## Estado (2026-10-08)

Fases 1 y 2 implementadas en los tres repos, **sin commit**:
- **Backend:** 2 suites nuevas (28 tests). La suite completa pasa (66 suites, 914 tests). Lectura real contra la BD con la tienda `myg`: `[]` en admin y público, sin DDL.
- **Admin:** compila y pasan sus 50 tests.
- **Storefront:** compila; 66 de 67 tests pasan. El que falla es `AppComponent should render title`, que falla desde el commit inicial.

Falta la Fase 3 (verificación en navegador con sesión). El backend local corre con `node server.js` sin nodemon: hay que reiniciarlo para que tome las rutas nuevas.

## Fase 1 — Comunicados en la tienda (R1-R6)

- [x] **T1.1** `comunicados.logic.js` con estados, versión (R1.5), inicio por defecto (R1.6), límites (R1.3) e historial (R1.7).
- [x] **T1.2** `comunicados.schema.js` con `linkSeguro` (R1.4) e ids únicos.
- [x] **T1.3** Servicio y rutas `GET`/`PUT /admin/comunicados`; invalida la caché pública.
- [x] **T1.4** `data[0].comunicados` en `GET /store/tiendas?slug=` (R2.1).
- [x] **T1.5** Tests: estados, versión, inicio, envío preservado, fechas, límites, historial, orden público, schema.
- [x] **T1.6** Admin: modelo, servicio, plantillas, vista previa, página con listado y formulario, ruta y menú (R6).
- [x] **T1.7** Storefront: estado, diálogo accesible, barra, aviso en compra, botón "Avisos" y banderas de ruta (R3-R5).
- [x] **T1.8** Storefront: test del estado (vencimiento en el cliente, `una_vez`, `cada_visita`, listado, almacenamiento bloqueado).

## Fase 2 — Email a clientes con reserva (R7)

- [x] **T2.1** `comunicados.email.js`: destinatarios, agrupación por email, HTML escapado, envío en segundo plano y registro.
- [x] **T2.2** Rutas `GET /:id/destinatarios` y `POST /:id/enviar-email` (rol admin).
- [x] **T2.3** Tests con Prisma y Resend simulados: rango, agrupación, escape, envío con un fallo, no reenviar, sin destinatarios, 404.
- [x] **T2.4** Admin: panel "Avisar por email" en la tarjeta, conteo, confirmación y estado del envío.

## Fase 3 — Verificación en navegador

- [ ] **T3.1** Reiniciar el backend. Con sesión en `myg`, crear un comunicado de cada nivel desde una plantilla y revisar la vista previa a 375 px.
- [ ] **T3.2** En la tienda: el modal aparece a los 1,5 s, Esc y la X lo cierran, no vuelve al recargar (`una_vez`) y vuelve al cambiar el mensaje.
- [ ] **T3.3** El urgente no se cierra con un clic en el fondo; el foco queda dentro con Tab.
- [ ] **T3.4** La barra aparece bajo el header; "Ver más" abre el detalle.
- [ ] **T3.5** "Avisos (n)" lista todos; en carrito y checkout no hay modal y sí el aviso fijo de `afectaCompras`.
- [ ] **T3.6** Pausar y vencer: desaparece en un minuto como máximo.
- [ ] **T3.7** Fase 2 en una tienda de reservas de prueba, con `RESEND_DEV_TO_EMAIL` configurado para que nada llegue a clientes reales.
