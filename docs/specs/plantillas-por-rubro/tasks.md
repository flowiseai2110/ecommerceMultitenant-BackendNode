# Tareas: plantillas por rubro (E1–E9)

> Implementa la hoja de ruta de [analisis.md](analisis.md) §5. El pago automático tiene su detalle en [../pago-automatico/tasks.md](../pago-automatico/tasks.md).
> Estado al 2026-10-13: **todo implementado, sin commit** en BackendNode, FrontendStore y FrontendAdmin (rama `main`). Falta la ronda de pruebas manuales.

## 1. Base de datos (antes de levantar el backend)

Correr en el SQL Editor de Supabase, en este orden. Después, en local, `npx prisma generate` (ya está regenerado).

| # | Archivo | Para | Ya corrido |
|---|---|---|---|
| 1 | `docs/sql/pago_automatico.sql` | `tiendas.modo_pago` | ✅ |
| 2 | `docs/sql/plantillas_datos.sql` | `tours.mapa_url`, `tours.dificultad`, `local_salones.aforo_sentados` | |
| 3 | `docs/sql/entradas_qr.sql` | tabla `evento_entradas` (y emite las de compras ya confirmadas) | |
| 4 | `docs/sql/pago_dividido.sql` | tabla `reserva_partes` y `pagos.parte_id` | |
| 5 | `docs/sql/hotel_antes_de_llegar.sql` | `reservas.checkin_online`, `reservas.cambio_solicitado` | |

Sin 2, 4 y 5 fallan las fichas de tours y salones, los pagos y las reservas (Prisma selecciona todas las columnas).

`.env` del backend local: `PAGOS_SIMULADOR=true` y `PAGOS_PROVEEDOR=simulado` (ya agregados).
Storefront: se agregó la dependencia `qrcode` (`npm install` en otras máquinas).

## 2. Qué se hizo por etapa

- [x] **E1** Pago automático en el backend: `modo_pago`, simulador, destinos de pago (pedido, reserva, cuota), webhook.
- [x] **E2** Refactor sin cambio visual. Piezas en `features/reservas/compartido/`:
  - `app-ficha-reserva` en tour, habitación, evento y salón. Canchas conserva su diseño "Noche": el reservador va a todo el ancho.
  - `app-calendario-mes` + estrategia, en tour y salón. El hotel conserva su calendario de rango.
  - `app-selector-cantidades` en pasajeros, entradas y extras de cancha.
  - `app-resumen-cotizacion` en tour, evento, hotel y salón.
- [x] **E3** Pago en pantallas:
  - `features/pagos/`: `app-pago-en-linea` y tokenizadores (Strategy + Factory: simulador y Culqi Checkout).
  - Se usa en el seguimiento de reservas (incluidas las cuotas de locales) y en la confirmación del checkout.
  - Admin › Pagos: tarjeta "Cómo cobras", manual o automático, con las llaves.
- [x] **E4** Calificación en las fichas, "Agregar al calendario" (.ics) en la confirmación y textos en inglés.
- [x] **E5** Datos chicos:
  - **Tours:** link del mapa del punto de encuentro, dificultad y filtros de duración y dificultad en /tours.
  - **Salones:** sentados (banquete) y de pie (cóctel).
  - **Canchas:** extras como pelota y chalecos. Se cargan en Admin › Extras; usan el catálogo de extras de la tienda, cobrados por reserva.
- [x] **E6** Entradas con QR por persona:
  - Se emiten al confirmar y se anulan al cancelar.
  - En la tienda se ven en el seguimiento.
  - En el admin, "Escanear entradas" (cámara con BarcodeDetector o código manual); una entrada no entra dos veces.
- [x] **E7** Pago dividido de canchas:
  - Desde el seguimiento se divide entre N jugadores y cada uno paga en `/pago-parte/:token`.
  - La reserva se confirma cuando lo pagado cubre el adelanto.
- [x] **E8** Hotel:
  - Pagar el saldo antes de llegar (el mismo endpoint de pago, con la reserva confirmada).
  - Check-in en línea.
  - Solicitud de cambio de fechas: se cotiza y se avisa al hotel. El cambio lo aplica el hotel a mano.
- [x] **E9** Filtro por talla y color en /productos y en categorías (`?opcion=Talla:M,Color:Negro`). Disponibilidad por fecha en el listado de salones.

## 2b. Los diseños: plantillas "Estándar" en Admin › Diseño

Las maquetas del lienzo son ahora **una plantilla por rubro** en `modules/diseno/plantillas.js`. Están al final de cada rubro, así que la plantilla por defecto de las tiendas nuevas no cambia.

| Rubro | Plantilla | Tema |
|---|---|---|
| Productos | `productos-estandar` · Estándar · Tienda | Terracota · Clara |
| Hotel | `hotel-estandar` · Estándar · Reserva directa | Azul marino · Clara |
| Tours | `tours-estandar` · Estándar · Experiencias | Verde petróleo · Clara |
| Eventos | `eventos-estandar` · Estándar · Agenda | Uva · Clara |
| Locales | `locales-estandar` · Estándar · Salones | Magenta · Clara |
| Canchas | `canchas-estandar` · Estándar · Reserva por turno | Verde cancha · Clara |

Todas usan la tipografía nueva **"estandar"**: Bricolage Grotesque para títulos y Figtree para el cuerpo. Es la del lienzo.

Para la plantilla de locales se agregó un buscador en la portada (qué celebras, fecha e invitados). Lleva a /salones con la fecha puesta y filtra por aforo.

Para verlas: reiniciar el backend → Admin › **Diseño** → elegir "Estándar · …" → probar en la vista previa → aplicar.

## 3. Pruebas manuales (pendientes)

- [ ] **Plantillas estándar:** en cada rubro, Admin › Diseño → aplicar "Estándar · …" → revisar la home (móvil y desktop), el listado, la ficha y el seguimiento.


Requisito previo: una tienda demo de cada rubro con **Admin › Pagos › Cómo cobras = Automático**. Con el simulador no pide llaves.

Tarjetas de prueba: 4111 1111 1111 1111 (aprobada), 4000 0000 0000 0002 (rechazada), 4000 0000 0000 0119 (pendiente: se aprueba sola a los 5 s). Yape: código 123456.

- [ ] **Pago, hotel o tour (solicitud):** solicitar, aceptar en el admin y pagar en el seguimiento → confirmada al instante, con correo.
- [ ] **Pago rechazado:** muestra "Tu tarjeta no tiene fondos suficientes" y la reserva sigue esperando el pago.
- [ ] **Pago pendiente (0119):** aviso "en proceso"; a los ~5 s el seguimiento pasa a confirmada (webhook).
- [ ] **Eventos:** comprar → pagar → aparecen las entradas con QR. En el admin, Eventos › Asistentes › Escanear entradas: la primera vez "Puede pasar", la segunda "Ya se usó".
- [ ] **Locales:** pagar la separación en línea (confirma y bloquea la fecha) y luego una cuota.
- [ ] **Canchas:**
  - elegir extras en el reservador → aparecen en el total y en la solicitud;
  - dividir entre 3 → los links abren `/pago-parte/…` → al cubrir el adelanto se confirma.
- [ ] **Hotel confirmado con saldo:** "Paga el saldo ahora", check-in en línea (se ve en el detalle del admin) y pedir otras fechas (llega el correo al hotel y aparece en el detalle del admin).
- [ ] **Comercio:** checkout → confirmación → "Paga tu pedido" → el pedido queda pagado.
- [ ] **Modo manual:** volver a manual → todo como antes (capturas, verificación).
- [ ] **Vista sin cambio** (E2): ficha de tour, evento, hotel y salón en móvil y desktop. Mismo aspecto que antes, calendario y contadores funcionando.
- [ ] **Tours:** filtros de duración y dificultad en /tours y link "Ver en el mapa".
- [ ] **Salones:** "Banquete X · Cóctel Y" en la ficha y "¿Para qué fecha?" en /salones.
- [ ] **Productos:** filtro de talla y color en /productos y en una categoría.

## 4. Antes de producción

- Culqi real: `PAGOS_PROVEEDOR=culqi`, sin `PAGOS_SIMULADOR`, y la tienda carga sus llaves en Admin › Pagos.
  - Probar `TokenizadorCulqi` con llaves de prueba de Culqi: Yape se detecta por el prefijo del token, por confirmar.
- Pendientes que quedan fuera:
  - apartado corto de 10 min con pasarela en eventos;
  - reembolsos automáticos;
  - firma HMAC del webhook de Culqi;
  - aplicar el cambio de fechas del hotel sin intervención;
  - el budget inicial de la tienda (715 kB antes de este trabajo, 718 kB ahora).
