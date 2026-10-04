# Plan técnico: Mini booking

> Implementa [spec.md](spec.md). Etapa: **diseño** (sin `tasks.md` todavía).
> Reutiliza lo que aplica de [verticales-reserva/patrones.md](../verticales-reserva/patrones.md) y [verticales-reserva/agente-ventas.md](../verticales-reserva/agente-ventas.md), en versión reducida (ver "Patrones").

## Idea central

| Pieza | Se resuelve con |
|---|---|
| Ficha de habitación / tour / evento | `productos` (imágenes, categoría, SEO, reseñas) + una tabla 1:1 pequeña por vertical |
| Reserva (dinero, cliente, comprobante, cupón) | `pedidos` con `tipo` + tabla `reservas` (hotel y tours) o `entradas` (eventos) |
| Pago manual con captura | `pagos` con `proveedor = 'manual'` (la tabla ya existe para Culqi) |
| Disponibilidad de hotel y tours | **No se calcula**: el negocio acepta o rechaza. Solo existen las **fechas cerradas** |
| Cupo de eventos | Contador `vendidos` + apartados con vencimiento (`FOR UPDATE`, como el stock actual) |
| Plazos (responder, pagar, apartado) | Se **calculan al leer** con la hora límite guardada: no dependen de un cron (Railway duerme) |
| Avisos | Correo (Resend) + badge del admin + links `wa.me` prellenados |

## Modelo de datos

Scripts para el SQL Editor de Supabase, como en las otras specs (`docs/sql/mini_booking_setup.sql`). Todas las tablas con `tienda_id` se agregan a `TENANT_SCOPED_MODELS` (`config/prisma.js`) y tienen RLS sin políticas (solo backend).

### Núcleo

```sql
ALTER TABLE tiendas
  ADD CONSTRAINT chk_tiendas_tipo_negocio CHECK (tipo_negocio IN ('productos','hotel','tours','eventos')),
  ADD COLUMN zona_horaria VARCHAR(40) NOT NULL DEFAULT 'America/Lima';

CREATE TABLE config_reservas (
  tienda_id                UUID PRIMARY KEY REFERENCES tiendas(id) ON DELETE CASCADE,
  modo_confirmacion        VARCHAR(12) NOT NULL DEFAULT 'solicitud',  -- solicitud | pago_directo
  cobro                    VARCHAR(10) NOT NULL DEFAULT 'total',      -- total | adelanto | en_destino
  adelanto_pct             INT CHECK (adelanto_pct BETWEEN 1 AND 99),
  anticipacion_min_horas   INT NOT NULL DEFAULT 0,         -- límite duro (hotel y tours)
  aviso_proximo_horas      INT,                            -- límite blando; null = sin aviso. Seed: hotel 2, tours 24, eventos 6
  aviso_proximo_texto      VARCHAR(300),                   -- null = texto por defecto de la vertical; admite {hora}
  cierre_pago_manual_horas INT,                            -- solo eventos: sin Yape/transferencia N h antes de la función
  max_solicitudes_abiertas INT NOT NULL DEFAULT 3,
  pedir_acompanantes       BOOLEAN NOT NULL DEFAULT false,
  instrucciones            TEXT,          -- "Presentar DNI de todos los huéspedes al ingresar"
  politica_cancelacion     TEXT,
  hora_checkin             TIME DEFAULT '14:00',   -- solo hotel
  hora_checkout            TIME DEFAULT '12:00',   -- solo hotel
  comprobante_en           VARCHAR(12) NOT NULL DEFAULT 'al_pagar', -- al_pagar | en_el_servicio (el seed pone en_el_servicio en hotel)
  -- solo eventos
  apartado_pasarela_min    INT NOT NULL DEFAULT 10,
  apartado_manual_min      INT NOT NULL DEFAULT 120,
  max_entradas_por_compra  INT NOT NULL DEFAULT 10,
  umbral_ultimas_entradas  INT DEFAULT 20
  -- + auditoría
);

ALTER TABLE pedidos
  ADD COLUMN tipo            VARCHAR(10) NOT NULL DEFAULT 'compra',  -- compra | hotel | tour | evento
  ADD COLUMN fecha_servicio  TIMESTAMPTZ,      -- ingreso / salida del tour / inicio de la función
  ADD COLUMN monto_pagado    DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN idempotency_key UUID,
  ADD CONSTRAINT uq_pedidos_idempotency UNIQUE (tienda_id, idempotency_key);
CREATE INDEX idx_pedidos_tienda_tipo_servicio ON pedidos (tienda_id, tipo, fecha_servicio);

-- Fechas cerradas (hotel y tours). producto_id null = todo el negocio.
CREATE TABLE cierres_fecha (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id    UUID NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  producto_id  UUID REFERENCES productos(id) ON DELETE CASCADE,
  fecha_desde  DATE NOT NULL,
  fecha_hasta  DATE NOT NULL,          -- inclusiva
  motivo       VARCHAR(100),           -- visible solo en el admin
  CHECK (fecha_desde <= fecha_hasta)
);
CREATE INDEX idx_cierres_tienda_rango ON cierres_fecha (tienda_id, fecha_desde, fecha_hasta);
```

- `pedidos.estado` suma los valores de reserva: `solicitada`, `aceptada`, `pago_en_revision`, `confirmada`, `completada`, `rechazada`, `vencida`, `cancelada` y `por_pagar` (eventos). Los pedidos del ecommerce siguen con sus estados.
- `pedidos.numero_pedido` es el **código de la reserva** (prefijo `R-` en hotel/tours, `E-` en eventos), con el mismo correlativo por tienda.
- Comprobante, cupón, cliente (`clientes` por WhatsApp) y `pedido_historial_estados` funcionan sin cambios.

### Reserva (hotel y tours)

```sql
CREATE TABLE reservas (
  pedido_id          UUID PRIMARY KEY REFERENCES pedidos(id) ON DELETE CASCADE,
  tienda_id          UUID NOT NULL,
  tipo               VARCHAR(5) NOT NULL,           -- hotel | tour
  producto_id        UUID NOT NULL REFERENCES productos(id),
  modalidad_id       UUID REFERENCES hotel_modalidades(id),  -- solo hotel
  inicio             TIMESTAMPTZ NOT NULL,          -- ingreso / salida del tour
  fin                TIMESTAMPTZ,                   -- salida del hotel (calculada)
  noches             INT,
  horas              INT,
  adultos            INT,
  ninos              INT,
  pasajeros          JSONB,     -- tours: [{"tipoId","nombre","cantidad","precio"}] (snapshot)
  -- Titular (registro de huésped / pasajero)
  titular_nombres    VARCHAR(100) NOT NULL,
  titular_apellidos  VARCHAR(100) NOT NULL,
  titular_doc_tipo   VARCHAR(10) NOT NULL,          -- DNI | CE | PASAPORTE
  titular_doc_numero VARCHAR(20) NOT NULL,
  titular_nacionalidad CHAR(2) NOT NULL,            -- ISO 3166
  titular_nacimiento DATE,
  acompanantes       JSONB,                         -- opcional según config
  comentarios        TEXT,
  acepta_datos       BOOLEAN NOT NULL,              -- Ley 29733
  -- Respuesta (el vencimiento es `inicio`: no hay columnas de plazo)
  respondida_en      TIMESTAMPTZ,
  motivo_rechazo     VARCHAR(200),
  ajuste_monto       DECIMAL(10,2),
  ajuste_motivo      VARCHAR(200),
  monto_a_pagar      DECIMAL(10,2) NOT NULL,        -- total o adelanto
  saldo_destino      DECIMAL(10,2) NOT NULL DEFAULT 0
);
CREATE INDEX idx_reservas_tienda_inicio ON reservas (tienda_id, inicio);
```

### Hotel / hostal

```sql
CREATE TABLE hotel_tipos_habitacion (
  producto_id        UUID PRIMARY KEY REFERENCES productos(id) ON DELETE CASCADE,
  tienda_id          UUID NOT NULL,
  capacidad_adultos  INT NOT NULL DEFAULT 2,
  capacidad_ninos    INT NOT NULL DEFAULT 0,
  capacidad_max      INT NOT NULL DEFAULT 2,
  por_persona        BOOLEAN NOT NULL DEFAULT false,  -- cama en dormitorio: precio × persona
  camas              VARCHAR(100),                    -- "1 queen" / "6 camarotes"
  amenities          TEXT[] NOT NULL DEFAULT '{}'     -- jacuzzi, frigobar, aire acondicionado...
);

CREATE TABLE hotel_modalidades (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id      UUID NOT NULL,
  producto_id    UUID NOT NULL REFERENCES hotel_tipos_habitacion(producto_id) ON DELETE CASCADE,
  tipo           VARCHAR(6) NOT NULL,           -- noche | horas
  horas          INT,                           -- 3, 6, 12 (solo tipo = horas)
  precio         DECIMAL(10,2) NOT NULL,
  precio_vie_sab DECIMAL(10,2),                 -- solo noche; null = igual
  activo         BOOLEAN NOT NULL DEFAULT true,
  orden          INT NOT NULL DEFAULT 0,
  CHECK ((tipo = 'noche' AND horas IS NULL) OR (tipo = 'horas' AND horas BETWEEN 1 AND 23)),
  UNIQUE (producto_id, tipo, horas)
);
```

Caso real: "Matrimonial (MT)" = 1 tipo con 2 modalidades: `noche` S/ 160 y `horas 6` S/ 100.

### Agencia de tours

```sql
CREATE TABLE tours (
  producto_id     UUID PRIMARY KEY REFERENCES productos(id) ON DELETE CASCADE,
  tienda_id       UUID NOT NULL,
  duracion        VARCHAR(50),               -- "Full day (12 h)", "2 días / 1 noche"
  dias_salida     INT[] NOT NULL DEFAULT '{1,2,3,4,5,6,7}',  -- 1 = lunes
  horas_salida    TIME[] NOT NULL,
  idiomas         VARCHAR(5)[] NOT NULL DEFAULT '{es}',
  itinerario      JSONB,                     -- [{"dia":1,"hora":"05:00","titulo":"Recojo","descripcion":"..."}]
  incluye         TEXT[] NOT NULL DEFAULT '{}',
  no_incluye      TEXT[] NOT NULL DEFAULT '{}',
  que_llevar      TEXT[] NOT NULL DEFAULT '{}',
  requisitos      TEXT,
  punto_encuentro TEXT,
  recojo          TEXT,                      -- "Recojo en hoteles de Miraflores y Barranco" (texto)
  edad_minima     INT,
  max_pasajeros   INT                        -- por solicitud (no es cupo de la salida)
);

CREATE TABLE tour_tipos_pasajero (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id    UUID NOT NULL,
  producto_id  UUID NOT NULL REFERENCES tours(producto_id) ON DELETE CASCADE,
  nombre       VARCHAR(60) NOT NULL,         -- "Adulto", "Niño (3-11)", "Adulto extranjero"
  precio       DECIMAL(10,2) NOT NULL,
  orden        INT NOT NULL DEFAULT 0
);
```

### Eventos

```sql
CREATE TABLE eventos (
  producto_id  UUID PRIMARY KEY REFERENCES productos(id) ON DELETE CASCADE,
  tienda_id    UUID NOT NULL,
  lugar        VARCHAR(150),
  direccion    TEXT,
  lat FLOAT, lng FLOAT,
  edad_minima  INT
);

CREATE TABLE evento_funciones (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id  UUID NOT NULL,
  evento_id  UUID NOT NULL REFERENCES eventos(producto_id) ON DELETE CASCADE,
  inicio     TIMESTAMPTZ NOT NULL,
  fin        TIMESTAMPTZ,
  activa     BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE evento_tipos_entrada (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id      UUID NOT NULL,
  funcion_id     UUID NOT NULL REFERENCES evento_funciones(id) ON DELETE CASCADE,
  nombre         VARCHAR(80) NOT NULL,       -- "General", "VIP", "Preventa"
  precio         DECIMAL(10,2) NOT NULL,
  cupo           INT NOT NULL,
  vendidos       INT NOT NULL DEFAULT 0,
  venta_hasta    TIMESTAMPTZ,
  orden          INT NOT NULL DEFAULT 0,
  CHECK (vendidos <= cupo)
);

-- Cupo apartado mientras se paga. Vencido = no cuenta (no se borra con cron).
CREATE TABLE evento_apartados (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id        UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  tipo_entrada_id  UUID NOT NULL REFERENCES evento_tipos_entrada(id) ON DELETE CASCADE,
  cantidad         INT NOT NULL CHECK (cantidad > 0),
  expira_en        TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_apartados_tipo ON evento_apartados (tipo_entrada_id, expira_en);

CREATE TABLE entradas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id        UUID NOT NULL,
  pedido_id        UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  tipo_entrada_id  UUID NOT NULL REFERENCES evento_tipos_entrada(id),
  codigo           VARCHAR(12) NOT NULL,       -- legible, para búsqueda manual en la puerta
  qr_token         VARCHAR(80) NOT NULL UNIQUE, -- id + firma HMAC
  estado           VARCHAR(8) NOT NULL DEFAULT 'valida',  -- valida | usada | anulada
  usada_en         TIMESTAMPTZ,
  usada_por        VARCHAR(100),
  UNIQUE (tienda_id, codigo)
);
```

### Pago manual (reutiliza `pagos`)

| Campo de `pagos` | Valor en un pago manual |
|---|---|
| `proveedor` | `manual` |
| `metodo` | `yape` \| `plin` \| `transferencia` |
| `monto` | `reservas.monto_a_pagar` (o el total de las entradas) |
| `estado` | `pendiente` (captura subida) → `pagado` (verificado) \| `fallido` ("no corresponde") |
| `metadata` | `{ capturaPath, numeroOperacion, verificadoPor, motivo }` |

Las capturas van a un **bucket privado** de Supabase Storage (`pagos-capturas/<tiendaId>/<pedidoId>/<uuid>.jpg`), con lectura por URL firmada de corta duración desde el backend. Se valida el tipo (JPG, PNG, WEBP, PDF) y el tamaño (5 MB).

## Lógica de estados

**Máquina declarativa** ([patrones.md §3.10](../verticales-reserva/patrones.md)), una por tipo:

```js
// modules/reservas/estados.js
export const transicionesReserva = {
  solicitada:       { aceptar: "aceptada", rechazar: "rechazada", cancelar_cliente: "cancelada", vencer: "vencida" },
  aceptada:         { subir_captura: "pago_en_revision", pago_pasarela: "confirmada", cancelar_cliente: "cancelada", vencer: "vencida" },
  pago_en_revision: { verificar: "confirmada", rechazar_pago: "aceptada" },
  confirmada:       { completar: "completada", no_show: "no_show", cancelar_negocio: "cancelada" }
};
export const transicionesEvento = {
  por_pagar:        { subir_captura: "pago_en_revision", pago_pasarela: "confirmada", vencer: "vencida" },
  pago_en_revision: { verificar: "confirmada", rechazar_pago: "por_pagar" },
  confirmada:       { cancelar_negocio: "cancelada" }
};
```

Cada transición se hace con `UPDATE ... WHERE id = $1 AND estado = $actual` (si cambia 0 filas, otro usuario ya actuó → 409) y escribe en `pedido_historial_estados`.

**Vencimientos sin cron:**
- `estadoEfectivo(reserva, ahora)`: una `solicitada` o `aceptada` con `inicio <= ahora` **se muestra y se trata** como `vencida`. (`pago_en_revision` no vence: el cliente ya pagó y el negocio debe resolverla.)
- Al leer la bandeja o el seguimiento se persiste con `UPDATE ... SET estado = 'vencida' WHERE estado IN ('solicitada','aceptada') AND inicio <= now()` (idempotente).
- Aceptar o verificar una reserva vencida devuelve 409 `RESERVA_VENCIDA`.
- Con el mismo mecanismo, una `confirmada` cuyo `fin` (hotel), `inicio + duración` (tour) o fin de la función (evento) ya pasó, se trata como `completada`. Eso habilita la invitación a reseñar. `no_show` lo marca el negocio a mano y bloquea la reseña.

**Comprobante:** con `comprobante_en = en_el_servicio`, la solicitud guarda en `pedidos.comprobante` solo la intención ("factura" + RUC + razón social, si el cliente la pidió). El pago a cuenta se registra en `pagos` como cualquier otro, y la confirmación lo muestra como "Pagado a cuenta". La plataforma no emite comprobantes en ningún caso.

**Sin plazos configurables:** el único límite es `inicio`. Lo que sí configura el negocio:
- `anticipacion_min_horas` → regla dura en la cotización y en la creación (error `ANTICIPACION_INSUFICIENTE`).
- `aviso_proximo_horas` → `POST /store/reservas/cotizar` devuelve `aviso: { texto, hora }` cuando `inicio − ahora < aviso_proximo_horas`. El frontend lo muestra antes de enviar; no bloquea. En eventos solo se devuelve si el método elegido es manual.
- `cierre_pago_manual_horas` (eventos) → `GET /store/eventos/:slug/funciones` marca qué métodos están disponibles por función, y la compra rechaza el pago manual fuera de ventana. La estadía por horas es la ventana fija `inicio → fin`, y llegar tarde no la corre.

**Pago que llega tarde** (webhook de la pasarela sobre una reserva vencida): en hotel y tours, la reserva pasa a `pago_en_revision` con una nota para el negocio ("pagó después de la hora de inicio: confirma o devuelve"). En eventos se revalida el cupo: si alcanza, se confirma; si no, queda en revisión para devolver.

## Cotización y reglas

Funciones puras por vertical, el mismo patrón que `envios/cotizacion.js`:

```js
// modules/reservas/hotel/cotizar.js
cotizarHotel({ modalidad, tipo, inicio, noches, adultos, ninos, config, zona })
  → { inicio, fin, noches | horas, lineas: [{ descripcion, cantidad, precio }], total }
// noche: una línea por noche (precio_vie_sab si aplica) · horas: una línea "Fracción 6 h"
// por_persona (dormitorio): × personas

// modules/reservas/tours/cotizar.js
cotizarTour({ tour, tiposPasajero, pasajeros, fecha, hora, config })
  → { lineas, total, montoAPagar, saldoDestino }
```

Reglas (cada una `(ctx) => null | error`):

| Regla | Hotel | Tours | Eventos |
|---|---|---|---|
| Fecha no cerrada (`cierres_fecha`) | ✔ (todas las noches del rango) | ✔ | — |
| Anticipación mínima | ✔ | ✔ | — |
| Día y hora de salida válidos | — | ✔ | — |
| Capacidad (adultos, niños, máx.) | ✔ | `max_pasajeros` | `max_entradas_por_compra` |
| Edad mínima | — | aviso | aviso |
| Venta abierta (`venta_hasta`, función activa) | — | — | ✔ |
| Cupo disponible | — | — | ✔ (con bloqueo) |
| Máx. solicitudes abiertas por cliente (WhatsApp o documento) | ✔ | ✔ | — |

La **misma** cotización la usan la vitrina (`/cotizar`), la creación de la solicitud y el asesor IA, así nunca muestran precios distintos.

## Eventos: apartado de cupo

```
POST /store/eventos/compras
  $transaction
    SELECT ... FROM evento_tipos_entrada WHERE id = ANY($ids) ORDER BY id FOR UPDATE
    disponible = cupo − vendidos − Σ apartados(expira_en > now())
    validar reglas → crear pedido por_pagar + evento_apartados (expira_en según el método)
confirmar (webhook o verificación del organizador)
  $transaction
    FOR UPDATE de los tipos · vendidos += cantidad · borrar apartados · emitir entradas (qr_token HMAC)
```

Es el mismo patrón probado de `validarYBloquearStock`, con el apartado como la única pieza nueva.

## Endpoints

### Store
| Método y ruta | Uso |
|---|---|
| `GET /store/reservas/config` | Datos públicos de la configuración (cobro, instrucciones, política, horas de check-in) |
| `GET /store/reservas/cierres?desde&hasta&productoId` | Fechas cerradas para el calendario |
| `POST /store/reservas/cotizar` | Total, desglose, salida calculada y errores de reglas |
| `POST /store/reservas` | Crea la solicitud (`idempotency_key`). Devuelve código y token de seguimiento |
| `GET /store/reservas/seguimiento/:token` | Estado efectivo, hora de inicio, datos de pago (si está aceptada) y confirmación (si está confirmada) |
| `POST /store/reservas/seguimiento/:token/captura` | Sube la captura (multipart) |
| `POST /store/reservas/seguimiento/:token/cancelar` | Solo en `solicitada` / `aceptada` |
| `GET /store/eventos/:slug/funciones` | Funciones y tipos con disponibilidad |
| `POST /store/eventos/compras` | Apartado + pedido `por_pagar` |
| `POST /store/eventos/compras/:token/captura` | Captura del pago manual |
| `GET /store/entradas/:token` | Entradas con QR |

El token de seguimiento sigue el patrón de `libro.token.js` / `resenas.token.js` (firmado, atado a tienda y pedido). Con sesión, "Mi cuenta" lista también las reservas.

### Admin
| Método y ruta | Uso |
|---|---|
| `GET /admin/reservas?pestana=por_responder\|pago_por_verificar\|confirmadas\|historial` | Bandeja |
| `GET /admin/reservas/resumen` | Badge del menú |
| `GET /admin/reservas/:id` | Detalle + historial + captura (URL firmada) |
| `POST /admin/reservas/:id/aceptar` `{ ajusteMonto?, ajusteMotivo? }` | |
| `POST /admin/reservas/:id/rechazar` `{ motivo }` | |
| `POST /admin/reservas/:id/verificar-pago` / `rechazar-pago` `{ motivo }` | |
| `POST /admin/reservas/:id/cancelar` / `completar` | |
| `GET /admin/reservas/agenda?desde&hasta` | Vista "Hoy y mañana" |
| `GET/PUT /admin/reservas/config` | Configuración |
| `CRUD /admin/cierres` | Fechas cerradas |
| `CRUD` de habitaciones + modalidades, tours + tipos de pasajero, eventos + funciones + tipos de entrada | Sub-recursos de `productos` |
| `POST /admin/entradas/validar` `{ qrToken \| codigo }` | Validación en la puerta |

Roles: aceptar, rechazar, verificar y cancelar requieren `editor` o superior (en hoteles pequeños, el recepcionista suele ser editor). `viewer` solo lee.

## Avisos

| Evento | Negocio | Cliente |
|---|---|---|
| Solicitud creada | Correo + badge | Correo "recibimos tu solicitud" + página con botón **"Avisar por WhatsApp"** |
| Aceptada | — | Correo con monto y link para pagar (antes de la hora de inicio). El negocio puede además "Responder por WhatsApp" |
| Rechazada | — | Correo con motivo |
| Captura subida | Correo + badge | Página "pago en revisión" |
| Confirmada | — | Correo con la **confirmación** (o las entradas) + link |
| Vencida | Aparece en el historial | Página con botón para escribir por WhatsApp |

- **Links de WhatsApp:** `https://wa.me/<numero>?text=<plantilla>` con el número de la tienda (`tiendas.whatsapp_numero`) o el del cliente. Las plantillas se suman a `tienda-plantillas-whatsapp.service.js`: `reserva_recibida`, `reserva_aceptada`, `reserva_rechazada`, `reserva_confirmada`, `pago_recibido`.
- Los correos se envían después del commit, sin bloquear la respuesta (como la constancia del Libro de Reclamaciones). Si fallan, la reserva sigue y el link de seguimiento es la fuente de verdad.
- **Cuota de Resend:** cada reserva genera de 3 a 5 correos. Con el free tier (100/día) hay que vigilarlo cuando haya varias tiendas activas.

## FrontendStore

```
features/verticales/
  hotel/      habitaciones-page (grilla de tipos) · habitacion-page (ficha + selector de modalidad, fecha/hora, huéspedes, total)
  tours/      tours-page · tour-page (ficha + calendario con días de salida + pasajeros por tipo)
  eventos/    eventos-page · evento-page (funciones + entradas)
  reserva/    solicitud-page (formulario del titular) · seguimiento-page (estado, pago, captura, confirmación imprimible)
  entradas/   entradas-page (QR a pantalla completa)
```

- Rutas lazy cargadas según `tienda.tipoNegocio` (en `store.routes.ts`). La home suma secciones por vertical: grilla de habitaciones, tours destacados o próximos eventos.
- El **selector de fecha y hora** es el componente nuevo más importante: en la modalidad por horas muestra "Ingreso 18:30 → Salida 00:30 (6 h)" antes de enviar.
- El paso de pago reutiliza el componente de datos de pago del checkout (cuenta, Copiar, QR, monto).
- La página de seguimiento no tiene contador: muestra el estado y la hora de inicio. El único contador es el del apartado de entradas (eventos), que corre fuera de la zona de Angular y arranca tras `afterNextRender`. Los timers dentro de la zona ya rompieron la estabilidad de la app.
- La confirmación imprimible usa el mismo enfoque `@media print` que la constancia del libro.

## FrontendAdmin

- **Reservas:** bandeja con pestañas ordenadas por hora de inicio, filtros y búsqueda. El detalle muestra los datos del titular, el visor de la captura, los botones de acción y "Responder por WhatsApp".
- **Agenda:** hoy y mañana, imprimible.
- **Catálogo por vertical:** formulario de producto + pestaña propia (modalidades / tipos de pasajero y días de salida / funciones y entradas).
- **Fechas cerradas:** calendario de mes con rangos.
- **Configuración de reservas.**
- **Validar entradas:** pantalla móvil con cámara (`BarcodeDetector` o una librería de QR) y búsqueda por código.
- La Guía del admin suma pantallas y pasos de progreso por vertical: "crea tu primera habitación", "configura tus métodos de pago", "comparte tu link".

## Asesor de ventas IA

Perfil por vertical, la versión reducida de [agente-ventas.md](../verticales-reserva/agente-ventas.md):

| Vertical | Tools | Nota |
|---|---|---|
| Hotel | `ver_habitaciones` (tipos, modalidades, capacidad; tarjetas con precio), `info_negocio` | **Sin** tool de disponibilidad: el hotel confirma. La tarjeta lleva el botón "Solicitar" con tipo, modalidad, fecha y hora precargados |
| Tours | `buscar_tours` (orden `populares` = reservas confirmadas en 90 días; sin datos → destacados), `ver_tour`, `info_negocio` | Puede decir los días de salida y si una fecha está cerrada |
| Eventos | `ver_eventos`, `ver_entradas` (disponible / últimas / agotado) | El cupo de eventos sí es real |

Bloque de contexto con la fecha y hora de la tienda ("Hoy es miércoles 24/09/2026, 9:43, America/Lima"). Se mantienen las reglas actuales: no escribir montos, no inventar, solo lectura.

## Patrones aplicados

De [patrones.md](../verticales-reserva/patrones.md), solo lo que el mini booking necesita:

| Patrón | Uso |
|---|---|
| Strategy + registro por vertical (§3.1) | `cotizar`, `reglas` y el schema de la solicitud por vertical; la bandeja y los estados son comunes |
| Reglas componibles (§3.3) | Tabla de reglas de arriba |
| Cotización pura (§3.4, simplificado) | `cotizarHotel`, `cotizarTour` |
| Máquina de estados (§3.10) | Transiciones de reserva y de evento |
| Idempotency key (§3.9) | Creación de solicitudes y compras |
| Lease + bloqueo pesimista (§3.5, §3.6) | **Solo eventos** (cupo) |

Se descartan del diseño extendido: disponibilidad diaria, retenciones para hotel y tours, outbox (los correos son "best effort" y el link de seguimiento es la fuente de verdad), comandos masivos, adaptadores de canales e iCal.

## Decisiones

| Decisión | Por qué | Alternativa descartada |
|---|---|---|
| El negocio confirma (hotel y tours) | Así trabajan hoy; no hace falta inventario exacto; el negocio decide a quién recibe | Reserva instantánea con disponibilidad en tiempo real |
| Modalidades de estadía por tipo (noche y horas) | El caso real vende "fracción 6 h" además de la noche | Solo noches |
| Fecha **y hora** en la reserva (`TIMESTAMPTZ`) | La fracción empieza a la hora declarada; la salida se calcula | Solo fechas |
| Lo no respondido o no pagado se anula a la hora de inicio; advertencia de "reserva próxima" configurable por el negocio (horas y texto, defaults por vertical) | Si el negocio no atiende (cambio de turno, etc.), ningún aviso lo resuelve: el cliente llamará. Cero configuración | Plazos configurables, recordatorios o escalamiento / regla de Booking (solo con más de 3 días) |
| Precio "por persona" para camas en dormitorio, sin gestionar camas | Es una vitrina: el hostal confirma como en cualquier tipo | Inventario de camas por dormitorio |
| Solo soles (PEN) | Mercado peruano; la tienda ya tiene `moneda = 'PEN'` | Varias monedas o USD por tienda |
| Captura de pago subida a la reserva | El cuello de botella real fue verificar un pago que llegó por chat | Que la captura siga llegando por WhatsApp |
| Pago manual en la tabla `pagos` existente | Una sola historia de pagos por pedido, venga de Culqi o de Yape | Tabla nueva de capturas |
| Avisos con links `wa.me` | Gratis, sin aprobación de Meta; el negocio ya vive en WhatsApp | API de WhatsApp Business (costo por conversación y alta de cuenta) |
| Plazos calculados al leer | Railway duerme; un cron caído dejaría solicitudes "eternas" | Job que vence solicitudes |
| Una tabla `reservas` para hotel y tours | Mismos datos del titular y flujo; cambian solo las columnas de detalle | Una tabla por vertical |
| Cupo real solo en eventos | Las entradas se agotan y se venden sin intervención | Cupo en hotel y tours |
| En hotel, el mini booking termina en la confirmación; estadía, consumos y comprobante quedan en el hotel | Así trabaja el caso real: la boleta o factura sale en el check-out por todo, menos lo pagado a cuenta | Cargos de consumo y comprobante desde la plataforma (sería un PMS) |
| `completada` automática por hora de fin | Habilita las reseñas sin pedirle al negocio un paso más | Botón "check-out" en el admin |

## Riesgos

- **El negocio no responde a tiempo.** La solicitud se anula a la hora de inicio y el cliente contacta al negocio por su cuenta. Es responsabilidad del negocio; la plataforma solo muestra el badge, envía un correo y ofrece al cliente el botón "Avisar por WhatsApp".
- **Capturas falsas o editadas.** La plataforma no valida el depósito. El botón dice "Verifica en tu app del banco antes de confirmar". El número de operación ayuda a cruzarlo.
- **Cold start del backend** en reservas para el mismo día: la primera solicitud tras horas de inactividad puede tardar 10–30 s. El formulario muestra "Enviando…" y no permite doble envío (idempotency key).
- **Datos personales** (documento, fecha de nacimiento): se exponen solo al negocio y al titular. Las capturas viven en un bucket privado.
- **Cuota de correos** con varias tiendas activas: medir y pasar a un plan pago de Resend o agrupar avisos.
- **Hospedaje por horas:** es un modelo de negocio común y legal en Perú. La vitrina no lo destaca de forma especial; cada negocio decide sus modalidades.
