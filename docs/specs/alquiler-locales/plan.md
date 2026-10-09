# Plan técnico: Alquiler de locales para eventos

> Implementa [spec.md](spec.md). Etapa: **diseño**. Tareas: [tasks.md](tasks.md).
> Extiende el módulo `modules/reservas` (mini-booking + hospedaje-completo) con una vertical nueva, `local`. No crea un módulo aparte.

## Idea central

| Pieza | Se resuelve con |
|---|---|
| Salón (ficha, fotos, SEO, reseñas) | `productos` + `local_salones` (1:1) |
| Turnos y paquetes | `local_turnos` y `local_paquetes` por salón |
| Reserva (cliente, dinero, comprobante) | `pedidos` con `tipo = 'local'` + `reservas` (columnas nuevas para local) |
| Disponibilidad | `local_ocupaciones` con **restricción de exclusión** de PostgreSQL sobre la franja: dos franjas que se cruzan en el mismo salón son imposibles (CE-01) |
| Apartados con vencimiento | Fila de ocupación con `expira_en`. Se limpia al inicio de la transacción que vuelve a tocar el salón; las lecturas la ignoran si venció |
| Plan de pagos | `reserva_cuotas` (varias por reserva) + `pagos.cuota_id` |
| Contrato | Plantilla en `config_reservas` + copia aceptada en `reservas.contrato` |
| Reprogramación, suspensión, ajustes | `reserva_cambios` (historial) |
| Devoluciones | `reserva_devoluciones` |
| Día del evento y garantía | `reserva_liquidaciones` |
| Promoción | `reserva_participantes` (cada uno con su cuota y su token) |
| Cotizaciones, visitas, lista de espera | `local_cotizaciones`, `local_visitas`, `local_lista_espera` |
| Recordatorios | Job cada 30 min, como `jobs/resenas-reservas.job.js`, idempotente por cuota y por tipo de aviso |
| Temporadas | `hotel_temporadas` tal cual (sus `producto_ids` sirven para salones) |

## Modelo de datos

Un script por fase para el SQL Editor de Supabase (`docs/sql/locales_fase_1.sql`, `locales_fase_2.sql`, `locales_fase_3.sql`), generado con `prisma migrate diff` y completado a mano donde Prisma no llega (extensión, restricción de exclusión, columna generada). Todas las tablas con `tienda_id` van a `TENANT_SCOPED_MODELS` y tienen RLS sin políticas (solo backend).

### Tipo de negocio y configuración

```sql
ALTER TABLE tiendas DROP CONSTRAINT chk_tiendas_tipo_negocio,
  ADD CONSTRAINT chk_tiendas_tipo_negocio CHECK (tipo_negocio IN ('productos','hotel','tours','eventos','locales'));

ALTER TABLE config_reservas
  ADD COLUMN separacion_tipo          VARCHAR(10)   NOT NULL DEFAULT 'porcentaje', -- porcentaje (usa adelanto_pct) | monto_fijo
  ADD COLUMN separacion_monto         DECIMAL(10,2),
  ADD COLUMN respuesta_horas          INT           NOT NULL DEFAULT 24,  -- plazo del negocio para responder (aparta la fecha)
  ADD COLUMN apartado_horas           INT           NOT NULL DEFAULT 48,  -- aceptada sin pagar
  ADD COLUMN saldo_dias_antes         INT           NOT NULL DEFAULT 30,
  ADD COLUMN max_cuotas               INT           NOT NULL DEFAULT 3,
  ADD COLUMN garantia_monto           DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN garantia_devolucion_dias INT           NOT NULL DEFAULT 3,
  ADD COLUMN invitados_confirmar_dias INT           NOT NULL DEFAULT 7,
  ADD COLUMN reprogramaciones_max     INT           NOT NULL DEFAULT 1,
  ADD COLUMN reprogramacion_min_dias  INT           NOT NULL DEFAULT 30,
  ADD COLUMN cargo_reprogramacion     DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN politica_tramos          JSONB,        -- [{ desdeDias: 60, separacionPct: 0, restoPct: 100 }, ...] (orden descendente)
  ADD COLUMN gracia_mora_dias         INT           NOT NULL DEFAULT 3,
  ADD COLUMN saldo_favor_meses        INT           NOT NULL DEFAULT 6,
  ADD COLUMN cotizacion_vigencia_dias INT           NOT NULL DEFAULT 7,
  ADD COLUMN contrato_plantilla       TEXT,
  ADD COLUMN contrato_version         INT           NOT NULL DEFAULT 1,   -- sube al guardar la plantilla
  ADD COLUMN proveedores_externos     BOOLEAN       NOT NULL DEFAULT true,
  ADD COLUMN tarifa_coordinacion      DECIMAL(10,2),
  ADD COLUMN descorche_botella        DECIMAL(10,2),
  ADD COLUMN hora_tope                VARCHAR(5)    NOT NULL DEFAULT '03:00',
  ADD COLUMN visitas_horario          JSONB;        -- { "1": ["16:00-19:00"], "6": ["10:00-13:00"] } (día ISO → rangos)
```

`adelanto_pct` (ya existe) es el porcentaje cuando `separacion_tipo = 'porcentaje'`. El seed de una tienda `locales` pone `modo_confirmacion = 'solicitud'`, `adelanto_pct = 40`, `comprobante_en = 'al_pagar'`, la política por tramos de la spec (R10.2) y una plantilla de contrato base.

### Salones, turnos y paquetes

```sql
CREATE TABLE local_salones (
  producto_id      UUID PRIMARY KEY REFERENCES productos(id) ON DELETE CASCADE,
  tienda_id        UUID NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  metros           INT,
  aforo_maximo     INT NOT NULL CHECK (aforo_maximo > 0),   -- el de la licencia / ITSE (R2.2)
  preparacion_min  INT NOT NULL DEFAULT 60,                 -- antes y después de cada reserva (R2.4)
  por_horas        BOOLEAN NOT NULL DEFAULT false,
  precio_hora      DECIMAL(10,2),
  min_horas        INT,
  horas_desde      VARCHAR(5),                              -- franja en la que se puede alquilar por horas
  horas_hasta      VARCHAR(5),
  servicios        JSONB                                    -- ["mesas", "sillas", "cocina", "barra", "sonido_dj", ...]
  -- + auditoría
);

CREATE TABLE local_turnos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id    UUID NOT NULL,
  producto_id  UUID NOT NULL REFERENCES local_salones(producto_id) ON DELETE CASCADE,
  nombre       VARCHAR(60) NOT NULL,         -- "Noche"
  hora_inicio  VARCHAR(5)  NOT NULL,         -- "19:00"
  hora_fin     VARCHAR(5)  NOT NULL,         -- "03:00" (menor que inicio = termina al día siguiente)
  dias_semana  INT[] NOT NULL DEFAULT '{1,2,3,4,5,6,7}',
  precios      JSONB NOT NULL,               -- { lj: 1800, v: 2300, s: 2700, d: 2000, f: 2700 } precio "solo local"
  activo       BOOLEAN NOT NULL DEFAULT true,
  orden        INT NOT NULL DEFAULT 0
  -- + auditoría
);

CREATE TABLE local_paquetes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id         UUID NOT NULL,
  producto_id       UUID NOT NULL REFERENCES local_salones(producto_id) ON DELETE CASCADE,
  nombre            VARCHAR(80) NOT NULL,    -- "Reina", "Solo local", "Conferencia"
  modalidad         VARCHAR(12) NOT NULL,    -- solo_local | paquete | por_horas
  precio_tipo       VARCHAR(12) NOT NULL DEFAULT 'fijo',   -- fijo | por_persona
  precios           JSONB,                   -- mismo formato que turnos; null en solo_local (usa el del turno) y por_horas
  min_personas      INT,
  max_personas      INT,
  incluye           JSONB,                   -- ["Buffet criollo", "DJ 5 h", "Hora loca", ...]
  horas_incluidas   INT,
  hora_extra_precio DECIMAL(10,2),
  tipos_evento      TEXT[] NOT NULL DEFAULT '{}',  -- vacío = todos
  es_promocion      BOOLEAN NOT NULL DEFAULT false, -- R13
  turno_ids         UUID[] NOT NULL DEFAULT '{}',   -- turnos en que se ofrece; vacío = todos
  activo            BOOLEAN NOT NULL DEFAULT true,
  orden             INT NOT NULL DEFAULT 0,
  traducciones      JSONB
  -- + auditoría
);
```

Las claves de precio por día: `lj` (lunes a jueves), `v`, `s`, `d`, `f` (feriado). Una clave ausente cae en `lj`.

### Disponibilidad: `local_ocupaciones`

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE local_ocupaciones (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id    UUID NOT NULL,
  producto_id  UUID NOT NULL REFERENCES local_salones(producto_id) ON DELETE CASCADE,
  pedido_id    UUID REFERENCES pedidos(id) ON DELETE CASCADE,   -- null = bloqueo manual
  tipo         VARCHAR(10) NOT NULL,          -- solicitud | apartado | reserva | bloqueo
  inicio       TIMESTAMPTZ NOT NULL,          -- ya incluye la preparación (R3.3)
  fin          TIMESTAMPTZ NOT NULL,
  franja       TSTZRANGE GENERATED ALWAYS AS (tstzrange(inicio, fin, '[)')) STORED,
  expira_en    TIMESTAMPTZ,                   -- solicitud / apartado; null = no vence
  activo       BOOLEAN NOT NULL DEFAULT true,
  motivo       VARCHAR(100),                  -- bloqueos manuales (visible solo en el admin)
  fecha_registro TIMESTAMPTZ DEFAULT now(), usuario_registro VARCHAR(100),
  CHECK (fin > inicio),
  CONSTRAINT ex_local_ocupacion EXCLUDE USING gist (producto_id WITH =, franja WITH &&) WHERE (activo)
);
CREATE INDEX idx_local_ocupaciones_salon ON local_ocupaciones (producto_id, inicio) WHERE activo;
CREATE UNIQUE INDEX uq_local_ocupacion_pedido ON local_ocupaciones (pedido_id) WHERE activo;
```

En Prisma, `franja` se declara `Unsupported("tstzrange")?` (opcional, así el cliente puede crear filas) y la restricción vive solo en el SQL.

**Ocupar una franja** (`locales/ocupaciones.js → ocupar(tx, …)`), siempre dentro de la transacción que crea o cambia la reserva:

1. `UPDATE local_ocupaciones SET activo = false WHERE producto_id = $1 AND activo AND expira_en <= now() AND franja && $2` (limpia apartados vencidos que estorban).
2. Si la reserva ya tenía una fila activa (reprogramación), se desactiva.
3. `INSERT` de la fila nueva. Si PostgreSQL responde `23P01` (exclusion_violation), se lanza `ConflictError` `FECHA_NO_DISPONIBLE` con alternativas (R3.4).

**Sincronía con el estado** (`reservas.service.js`):

| Transición | Ocupación |
|---|---|
| crear `solicitada` | `tipo = solicitud`, `expira_en = ahora + respuesta_horas` |
| `aceptar` | `tipo = apartado`, `expira_en = ahora + apartado_horas` |
| 1.ª cuota en revisión | `expira_en = null` (el cliente ya pagó; no vence, como `pago_en_revision` en mini-booking) |
| 1.ª cuota verificada | `tipo = reserva` |
| `rechazar_pago` | vuelve a `apartado` con `expira_en` nuevo |
| `rechazar`, `cancelar_*`, vencer | `activo = false` |
| `reprogramar` | desactiva la fila vieja e inserta la nueva en la misma transacción |
| `suspender` | `activo = false` (la fecha se libera; el dinero queda como saldo a favor) |
| `no_show`, `completada` | se deja: la franja ya pasó |

Las lecturas (calendario, cotización) consideran ocupada una fila si `activo AND (expira_en IS NULL OR expira_en > now())`. `persistirVencimientos` (ya existe) también desactiva las ocupaciones de las reservas que pasa a `vencida`.

### Reserva: columnas nuevas

```sql
ALTER TABLE reservas
  ADD COLUMN turno_id          UUID REFERENCES local_turnos(id) ON DELETE SET NULL,
  ADD COLUMN paquete_id        UUID REFERENCES local_paquetes(id) ON DELETE SET NULL,
  ADD COLUMN cotizacion_id     UUID,
  ADD COLUMN invitados         INT,
  ADD COLUMN tipo_evento       VARCHAR(20),   -- quinceanos | promocion | cumpleanos | boda | corporativo | conferencia | otro
  ADD COLUMN agasajado         VARCHAR(120),
  ADD COLUMN local             JSONB,         -- snapshot: salón, turno, paquete, precios, separación, garantía, tramos, tarifas de hora extra y descorche
  ADD COLUMN contrato          JSONB,         -- { version, hash, texto, aceptadoEn, ip, adendas: [...] }
  ADD COLUMN reprogramaciones  INT NOT NULL DEFAULT 0,
  ADD COLUMN saldo_favor_hasta TIMESTAMPTZ,   -- suspendida (R9.8)
  ADD COLUMN invitados_confirmados_en TIMESTAMPTZ;
```

`reservas.inicio` y `fin` son el horario del evento **sin** preparación; `horas` ya existe para el alquiler por horas; `apartado_hasta` se reutiliza como plazo de la solicitud y del apartado. `reservas.tipo` y `pedidos.tipo` suman `'local'`.

### Plan de pagos

```sql
CREATE TABLE reserva_cuotas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id       UUID NOT NULL,
  pedido_id       UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  participante_id UUID,                       -- promoción (fase 3)
  numero          INT NOT NULL,
  concepto        VARCHAR(20) NOT NULL,       -- separacion | cuota | saldo | garantia | hora_extra | descorche | danos | penalidad | diferencia | cargo_reprogramacion
  monto           DECIMAL(10,2) NOT NULL CHECK (monto > 0),
  vence_en        DATE NOT NULL,
  estado          VARCHAR(12) NOT NULL DEFAULT 'pendiente',  -- pendiente | en_revision | pagada | anulada
  pagada_en       TIMESTAMPTZ,
  recordatorios   JSONB NOT NULL DEFAULT '{}', -- { "d7": "2026-...", "d3": ..., "d1": ... } (R14.7)
  idempotency_key UUID,
  -- + auditoría
  UNIQUE (pedido_id, numero),
  UNIQUE (tienda_id, idempotency_key)
);
CREATE INDEX idx_cuotas_vencimiento ON reserva_cuotas (tienda_id, estado, vence_en);

ALTER TABLE pagos ADD COLUMN cuota_id UUID REFERENCES reserva_cuotas(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX uq_pagos_cuota_pagado ON pagos (cuota_id) WHERE estado = 'pagado';  -- un solo pago válido por cuota (CE-11)
```

- Una cuota manual: `pagos` con `proveedor = 'manual'` y la captura (como hoy) + `cuota_id`. Verificar el pago marca la cuota `pagada` y recalcula `pedidos.monto_pagado` = suma de cuotas pagadas **sin** `garantia` (R7.8).
- Mora (R7.7): indicador calculado al leer, `cuotas.some(c => c.estado === 'pendiente' && c.vence_en < hoy)`.

### Cambios, devoluciones y liquidación

```sql
CREATE TABLE reserva_cambios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id   UUID NOT NULL,
  pedido_id   UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  tipo        VARCHAR(20) NOT NULL,    -- reprogramacion | suspension | ajuste_monto | ajuste_plan | adenda | cancelacion
  antes       JSONB, despues JSONB,
  actor       VARCHAR(10) NOT NULL,    -- cliente | negocio
  motivo      VARCHAR(30),             -- personal | falta_de_pago | cambio_de_opinion | comite | fuerza_mayor | negocio | otro
  nota        VARCHAR(300),
  diferencia  DECIMAL(10,2),
  estado      VARCHAR(12) NOT NULL DEFAULT 'aplicado', -- pedido (el cliente pidió reprogramar) | aplicado | rechazado
  fecha_registro TIMESTAMPTZ DEFAULT now(), usuario_registro VARCHAR(100)
);

CREATE TABLE reserva_devoluciones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id       UUID NOT NULL,
  pedido_id       UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  pago_id         UUID REFERENCES pagos(id),
  motivo          VARCHAR(20) NOT NULL,   -- cancelacion | garantia | rechazo | doble_cobro | diferencia
  monto           DECIMAL(10,2) NOT NULL CHECK (monto > 0),
  medio           VARCHAR(12) NOT NULL,   -- pasarela | manual
  estado          VARCHAR(12) NOT NULL DEFAULT 'pendiente',  -- pendiente | hecha
  constancia_path VARCHAR(300),           -- bucket privado de capturas (config.reservas.bucketCapturas)
  vence_en        DATE,                   -- garantía: hasta cuándo devolver (R1.2)
  hecha_en        TIMESTAMPTZ,
  idempotency_key UUID,
  -- + auditoría
  UNIQUE (tienda_id, idempotency_key)
);

CREATE TABLE reserva_liquidaciones (
  pedido_id         UUID PRIMARY KEY REFERENCES pedidos(id) ON DELETE CASCADE,
  tienda_id         UUID NOT NULL,
  entrega_en        TIMESTAMPTZ,
  inventario        JSONB,          -- [{ item, cantidad, fotoPath }]
  novedades         JSONB NOT NULL DEFAULT '[]',  -- [{ tipo: hora_extra|descorche|proveedor|dano|penalidad, descripcion, cantidad, monto, fotos }]
  cierre_en         TIMESTAMPTZ,
  garantia_recibida DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_cargos      DECIMAL(10,2) NOT NULL DEFAULT 0,
  garantia_estado   VARCHAR(12) NOT NULL DEFAULT 'en_custodia'  -- en_custodia | por_devolver | devuelta | aplicada
  -- + auditoría
);
```

### Cotizaciones, visitas, lista de espera

```sql
CREATE TABLE local_cotizaciones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id       UUID NOT NULL,
  producto_id     UUID NOT NULL REFERENCES local_salones(producto_id) ON DELETE CASCADE,
  turno_id        UUID, paquete_id UUID,
  fecha           DATE NOT NULL,
  hora_inicio     VARCHAR(5) NOT NULL, hora_fin VARCHAR(5) NOT NULL,
  invitados       INT NOT NULL,
  tipo_evento     VARCHAR(20) NOT NULL,
  detalle         JSONB NOT NULL,          -- líneas, total, separación, garantía (el precio congelado, R4.2)
  total           DECIMAL(10,2) NOT NULL,
  vence_en        TIMESTAMPTZ NOT NULL,
  canal_origen    VARCHAR(20),             -- tiktok | instagram | facebook | google | portal | recomendacion | cartel | otro
  creada_por      VARCHAR(10) NOT NULL,    -- cliente | negocio
  ajuste_monto    DECIMAL(10,2), ajuste_motivo VARCHAR(200),
  cliente_nombre  VARCHAR(100), cliente_whatsapp VARCHAR(20), cliente_email VARCHAR(100),
  pedido_id       UUID REFERENCES pedidos(id) ON DELETE SET NULL,  -- usada
  recordatorio_en TIMESTAMPTZ,
  -- + auditoría
);

CREATE TABLE local_visitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tienda_id UUID NOT NULL,
  producto_id UUID NOT NULL, cotizacion_id UUID,
  fecha_hora TIMESTAMPTZ NOT NULL,
  nombre VARCHAR(100) NOT NULL, whatsapp VARCHAR(20) NOT NULL, email VARCHAR(100),
  estado VARCHAR(12) NOT NULL DEFAULT 'solicitada',   -- solicitada | confirmada | realizada | no_asistio | cancelada
  nota VARCHAR(300), recordatorio_en TIMESTAMPTZ
  -- + auditoría
);

CREATE TABLE local_lista_espera (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tienda_id UUID NOT NULL,
  producto_id UUID NOT NULL, desde DATE NOT NULL, hasta DATE NOT NULL,
  nombre VARCHAR(100) NOT NULL, email VARCHAR(100) NOT NULL, whatsapp VARCHAR(20),
  pedido_id UUID,         -- viene de una reprogramación (CT-08)
  avisado_en TIMESTAMPTZ, activo BOOLEAN NOT NULL DEFAULT true,
  fecha_registro TIMESTAMPTZ DEFAULT now()
);
```

Las cotizaciones y visitas se abren por un token firmado (patrón de `reservas.token.js`), no por su id.

### Promoción (fase 3)

```sql
CREATE TABLE reserva_participantes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id  UUID NOT NULL,
  pedido_id  UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  alumno     VARCHAR(120) NOT NULL,
  apoderado  VARCHAR(120),
  whatsapp   VARCHAR(20),
  invitados  INT NOT NULL DEFAULT 0,
  estado     VARCHAR(10) NOT NULL DEFAULT 'activo',   -- activo | retirado
  -- + auditoría
);
ALTER TABLE reserva_cuotas ADD CONSTRAINT fk_cuota_participante
  FOREIGN KEY (participante_id) REFERENCES reserva_participantes(id) ON DELETE SET NULL;
ALTER TABLE reservas ADD COLUMN lista_cerrada_en TIMESTAMPTZ, ADD COLUMN corte_lista DATE;
```

### Job

```sql
CREATE TABLE job_corridas (
  nombre        VARCHAR(40) PRIMARY KEY,
  ultima_corrida TIMESTAMPTZ NOT NULL,
  ok            BOOLEAN NOT NULL,
  detalle       JSONB
);
```

## Lógica de estados

`modules/reservas/estados.js` suma la máquina de la vertical:

```js
export const TRANSICIONES_LOCAL = {
  solicitada:       { aceptar: "aceptada", rechazar: "rechazada", cancelar_cliente: "cancelada" },
  aceptada:         { subir_captura: "pago_en_revision", pago_pasarela: "confirmada", cancelar_cliente: "cancelada" },
  pago_en_revision: { verificar: "confirmada", rechazar_pago: "aceptada", subir_captura: "pago_en_revision" },
  confirmada:       { reprogramar: "confirmada", suspender: "suspendida", cancelar_negocio: "cancelada", no_show: "no_show" },
  suspendida:       { reprogramar: "confirmada", cancelar_negocio: "cancelada" },
  completada:       { no_show: "no_show" }
};
```

- `transicionar(actual, accion, "local")` elige esta máquina.
- `estadoEfectivo`: una `solicitada` con `apartadoHasta` vencido es `vencida` (hoy solo se aplica a `aceptada`); el cambio no afecta a hotel ni a tours porque sus solicitudes no tienen `apartadoHasta`. Una `suspendida` con `saldo_favor_hasta` vencido se muestra "por resolver" (no cambia sola: el contrato decide, R9.8).
- `subir_captura` y `verificar` en estado `confirmada` no son transiciones: son operaciones sobre **cuotas** (las cuotas siguientes a la primera no cambian el estado de la reserva).
- `ESTADOS_RESERVA` suma `suspendida`; su etiqueta: "Suspendida, fecha por definir".

## Cálculos puros (con tests)

| Archivo | Función | Notas |
|---|---|---|
| `locales/cotizar.js` | `cotizar({ salon, turno, paquete, fecha, horas, invitados, temporadas, feriados, cupon, config })` | Precio del día (`lj/v/s/d/f`), por persona o fijo, temporadas, cupón, tarifa de proveedores externos. Valida aforo (licencia y paquete), días del turno, tipo de evento, anticipación. Devuelve líneas, total, separación, garantía y la franja con y sin preparación |
| `locales/franja.js` | `franjaDe(fecha, horaInicio, horaFin, preparacionMin)` | Turnos que pasan la medianoche; todo en `America/Lima` con `tiempo.js` (CE-06) |
| `locales/plan-pagos.js` | `generarPlan({ total, garantia, config, fechaEvento, hoy })` | Separación + hasta N cuotas iguales (los céntimos sobrantes van en la última) que vencen antes de `fechaEvento − saldo_dias_antes`; si la fecha ya está dentro de ese plazo, todo el saldo vence en 2 días. Garantía con el saldo |
| `locales/plan-pagos.js` | `replanificar({ cuotas, nuevoTotal, cargo, … })` | Reprogramación: conserva las pagadas, anula las pendientes y genera las nuevas con la diferencia (o la descuenta si es a favor) |
| `locales/devolucion.js` | `calcularDevolucion({ cuotas, motivo, diasAntes, tramos, eventoOcurrio })` | Tramo por días, separación vs resto, garantía completa si no hubo evento, 100 % si `negocio` o `fuerza_mayor` |
| `locales/liquidacion.js` | `liquidar({ garantiaRecibida, novedades })` | Saldo a devolver o cobro adicional (R11.5) |
| `locales/contrato.js` | `renderContrato(plantilla, datos)` + `hashContrato` | Variables `{{titular.nombre}}`, `{{fecha}}`, `{{plan_pagos}}`… Variable desconocida = error al guardar la plantilla, no al aceptar |
| `locales/alternativas.js` | `alternativas(ocupadas, salon, turnos, fecha)` | Hasta 3 franjas libres cercanas para el 409 (R3.4) |

## Endpoints

Mismas convenciones que mini-booking: respuesta estándar, Zod en `reservas.schema.js` (o `locales/locales.schema.js`), roles `lectura` / `operacion` (editor+) / `gestion` (admin+).

### Store
| Método y ruta | Uso |
|---|---|
| `GET /store/locales/salones` | Salones con desde-precio y aforo |
| `GET /store/locales/salones/:slug` | Ficha: turnos, paquetes, servicios, reglas de proveedores |
| `GET /store/locales/salones/:slug/calendario?desde&hasta` | Estado de cada fecha y turno (libre, parcial, ocupada, cerrada). Sin datos de otras reservas |
| `POST /store/locales/cotizaciones` | Cotiza y guarda. Devuelve el detalle y un token |
| `GET /store/locales/cotizaciones/:token` | Cotización (vigente o vencida) |
| `POST /store/locales/visitas` / `GET /store/locales/visitas/:token` | Visita al local |
| `POST /store/locales/lista-espera` | Anotarse para un rango de fechas |
| `POST /store/reservas` | Ya existe: acepta `tipo = 'local'` + `cotizacionToken` (o los datos para cotizar) + `idempotencyKey`. Ocupa la franja en la transacción |
| `GET /store/reservas/seguimiento/:token` | Ya existe: suma plan de pagos, contrato, mora, garantía, historial de cambios y devoluciones |
| `POST /store/reservas/seguimiento/:token/contrato` | Acepta el contrato (versión + hash; guarda IP y hora) |
| `POST /store/reservas/seguimiento/:token/cuotas/:cuotaId/captura` | Captura o número de operación de una cuota |
| `GET /store/reservas/seguimiento/:token/reprogramacion` | Opciones de fecha con diferencia de precio |
| `POST /store/reservas/seguimiento/:token/reprogramacion` | Pide el cambio (aparta la fecha nueva por `respuesta_horas`) |
| `POST /store/reservas/seguimiento/:token/participantes` | Delegado: carga o edita la lista (fase 3) |
| `POST /store/reservas/seguimiento/:token/participantes/cerrar` | Delegado: cierra la lista (fase 3) |
| `GET /store/reservas/participante/:token` · `POST …/captura` | Apoderado: su cuota (fase 3) |

### Admin
| Método y ruta | Uso |
|---|---|
| `GET/PUT /admin/reservas/locales/salones/:productoId` | Salón (como `habitaciones/:productoId`) |
| `CRUD /admin/reservas/locales/salones/:productoId/turnos` y `/paquetes` | |
| `GET /admin/reservas/locales/calendario?productoId&desde&hasta` | Reservas, apartados, bloqueos y cierres |
| `POST /admin/reservas/locales/bloqueos` · `DELETE …/:id` | Bloqueo manual (R3.6) |
| `GET/POST /admin/reservas/locales/cotizaciones` | Cotizaciones del negocio (R4.4) |
| `GET /admin/reservas/locales/visitas` · `POST …/:id/confirmar\|reprogramar\|realizada\|no-asistio` | |
| `GET /admin/reservas?pestana=…` | Ya existe: suma `cuotas_vencidas` y `garantias` |
| `PUT /admin/reservas/:id/plan` | Edita el plan antes del primer pago (409 `PLAN_BLOQUEADO` después) |
| `POST /admin/reservas/:id/cuotas/:cuotaId/verificar` · `rechazar` | La primera confirma la reserva |
| `POST /admin/reservas/:id/cuotas` | Cargo extra (hora extra, daños, diferencia) |
| `POST /admin/reservas/:id/reprogramacion/aprobar` · `rechazar` | Pedido del cliente |
| `POST /admin/reservas/:id/reprogramar` `{ fecha, turnoId, horas?, actor, motivo }` | Directo o por el negocio (R9.6, R9.7) |
| `POST /admin/reservas/:id/suspender` `{ motivo }` | Fuerza mayor (R9.8) |
| `GET /admin/reservas/:id/cancelacion?motivo=` | Simula la devolución |
| `POST /admin/reservas/:id/cancelar` | Ya existe: suma `motivo`, `devolucion` (propuesta o cambiada con nota) |
| `POST /admin/reservas/:id/devoluciones/:devId/hecha` | Constancia (multipart) |
| `POST /admin/reservas/:id/liquidacion/entrega` · `/novedades` · `/cerrar` | Día del evento (R11) |
| `GET /admin/reservas/locales/reporte-canales?mes=` | R12.5 |

Errores nuevos: `FECHA_NO_DISPONIBLE` (409, con `alternativas`), `AFORO_EXCEDIDO` (422), `COTIZACION_VENCIDA` (409), `CONTRATO_NO_ACEPTADO` (409), `CONTRATO_DESACTUALIZADO` (409: el hash no coincide), `CUOTA_YA_PAGADA` (409), `PLAN_BLOQUEADO` (409), `REPROGRAMACION_NO_PERMITIDA` (409), `HORA_TOPE_EXCEDIDA` (422), `CAMBIO_CON_RESERVAS` (409, con la lista de reservas afectadas, R2.7).

### Rate limit (R14.8)

Dos limitadores con `crearLimitador` (`kernel/http/rate-limit.js`) para las rutas `/store/locales` y `/store/reservas`: lectura (300 / 15 min por IP) y escritura (30 / 15 min por IP, `skipSuccessfulRequests: false`). Los valores van a `config/index.js`.

## Job de locales

`jobs/locales.job.js`, cada 30 min, mismo patrón que `resenas-reservas.job.js` (sin bloqueo entre réplicas: cada paso es idempotente). `LOCALES_JOB=false` lo apaga.

1. Recordatorios de cuota a 7, 3 y 1 días (marca `recordatorios.dN` en la misma consulta que lo envía: `UPDATE … WHERE recordatorios->>'d3' IS NULL RETURNING`).
2. Recordatorio de cotización por vencer (`recordatorio_en`).
3. Recordatorio de visita del día siguiente.
4. Aviso a la lista de espera cuando se libera una franja de su rango (`avisado_en`).
5. Garantías por devolver vencidas: alerta en el resumen del admin.
6. (Fase 3) Conciliación de pagos de pasarela `pendiente` con más de 15 min (R14.2).
7. Registra la corrida en `job_corridas`. El resumen del admin avisa si la última tiene más de 24 h (R14.7).

Railway puede dormir el proceso. Los plazos que importan (vencimientos y apartados) se calculan al leer y no dependen del job; los recordatorios sí, por eso existe el aviso de R14.7.

## Avisos

Correo (Resend, `reservas.emails.js`) y links `wa.me` con las plantillas de WhatsApp de la tienda:

| Evento | Cliente | Negocio |
|---|---|---|
| Solicitud enviada | Recibida + seguimiento | Nueva solicitud |
| Aceptada | Contrato + plan + datos de pago | — |
| Captura subida | — | Pago por verificar |
| Cuota verificada | Constancia; la 1.ª: confirmación | — |
| Cuota por vencer (7/3/1 d) | Recordatorio | — |
| Reprogramación pedida / aprobada | Confirmación con fecha nueva | Pedido de cambio |
| Cancelada | Motivo + devolución | — |
| Devolución hecha | Constancia | — |
| Liquidación cerrada | Detalle + devolución de garantía | — |

## FrontendStore

- Ruta `/salones` (grilla) y `/salones/:slug` (ficha) para tiendas `locales`; home con la sección de salones.
- Ficha: calendario mensual con estados por fecha, turnos del día, paquetes filtrados por tipo de evento y aforo, resumen con precio del día, separación y garantía, botones "Cotizar", "Agendar visita" y "Solicitar".
- `/cotizacion/:token`: detalle imprimible, vigencia, "Solicitar con esta cotización", "Enviar por WhatsApp".
- Seguimiento (ya existe) para local: contrato con aceptación, plan de pagos con una tarjeta por cuota (pagar, subir captura, estado), mora, garantía, historial, botones "Reprogramar" y "Avisar por WhatsApp".
- Promoción (fase 3): panel del delegado y página del apoderado.
- Página de mantenimiento con el WhatsApp de la tienda cuando la API no responde (R14.4).

## FrontendAdmin

- Menú por `tipoNegocio = 'locales'`: Calendario, Reservas, Cotizaciones, Visitas, Salones, Fechas cerradas, Configuración de reservas.
- Salón: formulario con aforo, preparación, por horas, servicios; pestañas Turnos y Paquetes.
- Calendario: mes y semana por salón, franjas por estado, crear bloqueo o cotización desde una franja libre.
- Detalle de reserva para local: plan de pagos (editar antes del primer pago, verificar cuota, cargo extra), contrato, reprogramar, suspender, cancelar con simulación, devoluciones, liquidación del día del evento (entrega con fotos, novedades, cierre).
- Configuración: separación, plazos, garantía, política por tramos (tabla editable), plantilla del contrato con vista previa y variables, proveedores, hora tope, horario de visitas.
- Nuevas acciones en el store de NgRx `reservas` (o un slice `locales` si crece).

## Asesor de ventas IA

Perfil `locales` en `modules/agente`: herramientas `ver_salones` (aforo, servicios, paquetes) y `fechas_libres` (salón, mes, tipo de evento). Responde con tarjetas calculadas por el servidor y un enlace a la cotización precargada. Recibe la fecha actual de la tienda.

## Patrones aplicados

| Patrón | Dónde |
|---|---|
| Strategy por vertical (ya existe en `reservas.service.js`) | `cotizar`, reglas, estado inicial y serializer de la vertical `local` |
| Máquina de estados declarativa | `TRANSICIONES_LOCAL` |
| Restricción en la base de datos, no en el código | Exclusión sobre `franja` (CE-01) |
| Idempotency key | Solicitud, cuotas, devoluciones (CE-09, CE-11) |
| Snapshot | `reservas.local`, `local_cotizaciones.detalle`, `reservas.contrato` (CE-07) |
| Cálculo al leer | Vencimientos, mora, estado de cotizaciones |
| Funciones puras + servicio transaccional | Cotizar, plan, devolución y liquidación sin Prisma; el servicio solo orquesta |

## Decisiones

| Tema | Decisión | Descartado |
|---|---|---|
| Disponibilidad | Restricción de exclusión con `tstzrange` + `btree_gist` | Bloqueo `FOR UPDATE` del salón y verificación en código (funciona, pero un camino que lo olvide vende dos veces) |
| Apartados vencidos | Se desactivan en la transacción que vuelve a tocar el salón; las lecturas los ignoran | Job que los limpie (Railway duerme) |
| Turnos y horas | Un solo modelo de franja (inicio, fin) para turnos y para alquiler por horas | Tablas distintas por modalidad |
| Confirmación | La primera cuota verificada confirma | Confirmar solo con el 100 % (no es como trabaja el mercado) |
| Garantía | Cuota de concepto `garantia`, fuera de `monto_pagado`, liquidada aparte | Preautorización (Yape y transferencia no la permiten) |
| Mora | Indicador, no estado; la cancelación la decide el negocio | Cancelar solo (una fecha de quinceaños no se cancela por un recordatorio perdido) |
| Contrato | Plantilla con variables, copia con hash, aceptación con casilla | Firma electrónica certificada |
| Temporadas | Reutilizar `hotel_temporadas` | Tabla propia (sería un duplicado) |

## Riesgos

- **`btree_gist` en Supabase:** está disponible, pero hay que habilitarla en el script. Sin ella la restricción no se crea; el script falla en lugar de seguir sin protección.
- **Prisma y `tstzrange`:** la columna es `Unsupported`; las alternativas del 409 y el calendario se leen con `inicio`/`fin`, no con `franja`. Un `prisma db pull` no debe sobrescribir el modelo a mano.
- **Turnos que cruzan la medianoche** con fechas en UTC: toda conversión pasa por `tiempo.js`; tests con turnos 19:00–03:00 en sábado y feriado.
- **Plan de pagos editado después de pagar:** se bloquea (`PLAN_BLOQUEADO`); los cambios posteriores son cargos o reprogramaciones, que quedan en el historial.
- **Datos de menores** (alumnos de promoción): solo nombre; nada de DNI ni fecha de nacimiento.
</content>
</invoke>
