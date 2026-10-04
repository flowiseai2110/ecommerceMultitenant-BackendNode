# Vertical: hotel / hostal

> Parte de [spec.md](spec.md) (núcleo común: retenciones, políticas, participantes, estrategia).
> `tiendas.tipo_negocio = 'hotel'`.

## Cómo opera un hospedaje

- Vende **noches** de un **tipo de habitación** (Doble matrimonial, Triple, Suite). El cliente no elige la habitación 204: elige el tipo, y la recepción **asigna** la habitación física.
- **Hostales:** además venden **camas** en dormitorios compartidos (dorm 6 camas mixto / femenino). El inventario es la cama, no el cuarto.
- **Precio por noche variable:** temporada (Inti Raymi, fiestas patrias, Año Nuevo), fines de semana y ajustes manuales de último minuto.
- **Planes tarifarios** sobre el mismo tipo: "Solo alojamiento", "Con desayuno", "No reembolsable −10%".
- **Restricciones:** mínimo de noches (3 en Año Nuevo), cerrado a llegadas un día específico y anticipación mínima.
- **Ocupación:** adultos y niños con máximo por tipo; persona extra con recargo.
- **Venden en Booking / Airbnb / Expedia / Hostelworld a la vez.** Sin sincronizar calendarios hay sobreventa.
- **Operación diaria:** llegadas, salidas, huéspedes en casa, asignación, limpieza, registro de huéspedes y cobro del saldo al check-in.

## Modelo de datos

### Configuración

```sql
CREATE TABLE config_hotel (
  tienda_id                UUID PRIMARY KEY REFERENCES tiendas(id) ON DELETE CASCADE,
  tipo_alojamiento         VARCHAR(15) NOT NULL DEFAULT 'hotel', -- hotel | hostal | hospedaje | apart | ecolodge
  categoria_estrellas      INT CHECK (categoria_estrellas BETWEEN 1 AND 5),
  hora_checkin             TIME NOT NULL DEFAULT '14:00',
  hora_checkout            TIME NOT NULL DEFAULT '12:00',
  min_noches               INT NOT NULL DEFAULT 1,
  max_noches               INT NOT NULL DEFAULT 30,
  anticipacion_min_horas   INT NOT NULL DEFAULT 0,      -- reservas para "hoy" permitidas
  ventana_reserva_dias     INT NOT NULL DEFAULT 365,    -- hasta cuándo se puede reservar
  edad_nino_max            INT NOT NULL DEFAULT 11,
  minutos_retencion        INT NOT NULL DEFAULT 15,
  minutos_retencion_manual INT NOT NULL DEFAULT 120,
  adelanto_tipo            VARCHAR(12) NOT NULL DEFAULT 'porcentaje', -- porcentaje | primera_noche | total
  adelanto_pct             INT NOT NULL DEFAULT 100,
  politica_cancelacion_id  UUID REFERENCES politicas_cancelacion(id),
  exportacion_servicios    BOOLEAN NOT NULL DEFAULT false, -- IGV 0% a extranjeros no domiciliados (validar con contador)
  precios_incluyen_igv     BOOLEAN NOT NULL DEFAULT true,
  servicios                TEXT[] NOT NULL DEFAULT '{}',  -- wifi, estacionamiento, piscina... (iconos en el storefront)
  reglas_casa              TEXT,                          -- mascotas, fumar, silencio
  lat FLOAT, lng FLOAT                                     -- mapa en la home
  -- + auditoría
);
```

### Tipo de habitación (1:1 con `productos`)

```sql
CREATE TABLE hotel_tipos_habitacion (
  producto_id        UUID PRIMARY KEY REFERENCES productos(id) ON DELETE CASCADE,
  tienda_id          UUID NOT NULL,
  modo_venta         VARCHAR(12) NOT NULL DEFAULT 'habitacion', -- habitacion | cama (dormitorio de hostal)
  unidades           INT NOT NULL,              -- n.º de habitaciones (o de camas si modo_venta = cama)
  capacidad_adultos  INT NOT NULL DEFAULT 2,
  capacidad_ninos    INT NOT NULL DEFAULT 0,
  capacidad_max      INT NOT NULL DEFAULT 2,    -- adultos + niños
  ocupacion_base     INT NOT NULL DEFAULT 2,    -- personas incluidas en el precio
  precio_persona_extra DECIMAL(10,2) NOT NULL DEFAULT 0,
  precio_fin_semana  DECIMAL(10,2),             -- vie y sáb; null = precio base
  camas              JSONB,                     -- [{"tipo":"queen","cantidad":1},{"tipo":"individual","cantidad":1}]
  metros2            INT,
  genero_dormitorio  VARCHAR(10),               -- mixto | femenino | masculino (solo modo cama)
  amenities          TEXT[] NOT NULL DEFAULT '{}', -- baño privado, TV, calefacción, vista...
  orden              INT NOT NULL DEFAULT 0
  -- + auditoría
);
```

`productos.precioBase` es el precio **base por noche** ("desde S/ X" en tarjetas). Imágenes, descripción, reseñas y SEO vienen de `productos`.

### Habitaciones físicas

```sql
CREATE TABLE hotel_habitaciones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id   UUID NOT NULL,
  tipo_id     UUID NOT NULL REFERENCES hotel_tipos_habitacion(producto_id) ON DELETE CASCADE,
  codigo      VARCHAR(10) NOT NULL,       -- "204", "Dorm A - cama 3"
  piso        VARCHAR(10),
  estado      VARCHAR(15) NOT NULL DEFAULT 'operativa',  -- operativa | mantenimiento | fuera_servicio
  limpieza    VARCHAR(10) NOT NULL DEFAULT 'limpia',     -- limpia | sucia | inspeccion
  notas       TEXT,
  UNIQUE (tienda_id, codigo)
);
```

La cantidad de habitaciones operativas de un tipo debería coincidir con `hotel_tipos_habitacion.unidades`. Una habitación en mantenimiento por un rango se registra como **bloqueo** (ver abajo) para que reste disponibilidad solo en esas fechas.

### Planes tarifarios y temporadas

```sql
CREATE TABLE hotel_planes_tarifa (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id      UUID NOT NULL,
  nombre         VARCHAR(80) NOT NULL,      -- "Con desayuno", "No reembolsable"
  descripcion    TEXT,
  ajuste_tipo    VARCHAR(10) NOT NULL DEFAULT 'pct', -- pct | monto (por noche)
  ajuste_valor   DECIMAL(10,2) NOT NULL DEFAULT 0,   -- -10 = 10% menos; +25 = S/ 25 más por noche
  ajuste_por_persona BOOLEAN NOT NULL DEFAULT false, -- desayuno: S/ 15 × persona × noche
  politica_cancelacion_id UUID REFERENCES politicas_cancelacion(id),
  incluye        TEXT[] NOT NULL DEFAULT '{}',
  tipos_ids      UUID[],                    -- null = aplica a todos los tipos
  activo         BOOLEAN NOT NULL DEFAULT true,
  orden          INT NOT NULL DEFAULT 0
);

CREATE TABLE hotel_temporadas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id     UUID NOT NULL,
  nombre        VARCHAR(60) NOT NULL,  -- "Temporada alta", "Fiestas Patrias"
  fecha_inicio  DATE NOT NULL,
  fecha_fin     DATE NOT NULL,         -- inclusiva
  ajuste_pct    INT,                   -- +30 sobre el precio base de todos los tipos
  precios       JSONB,                 -- o precio fijo por tipo: {"<tipo_id>": 280}
  min_noches    INT,
  prioridad     INT NOT NULL DEFAULT 0, -- si se superponen, gana la de mayor prioridad
  CHECK (fecha_inicio <= fecha_fin)
);
```

### Disponibilidad diaria: el corazón

```sql
CREATE TABLE hotel_disponibilidad (
  tipo_id            UUID NOT NULL REFERENCES hotel_tipos_habitacion(producto_id) ON DELETE CASCADE,
  fecha              DATE NOT NULL,          -- la NOCHE de esa fecha
  tienda_id          UUID NOT NULL,
  unidades_total     INT NOT NULL,           -- copia de tipo.unidades (editable por día)
  unidades_confirmadas INT NOT NULL DEFAULT 0,
  unidades_bloqueadas  INT NOT NULL DEFAULT 0, -- mantenimiento + reservas de canales externos
  precio             DECIMAL(10,2),          -- override manual de ese día (gana sobre todo)
  min_noches         INT,                    -- override
  cerrado            BOOLEAN NOT NULL DEFAULT false, -- stop sell
  cerrado_llegada    BOOLEAN NOT NULL DEFAULT false, -- CTA: no se puede llegar ese día
  cerrado_salida     BOOLEAN NOT NULL DEFAULT false, -- CTD: no se puede salir ese día
  PRIMARY KEY (tipo_id, fecha),
  CHECK (unidades_confirmadas + unidades_bloqueadas <= unidades_total)
);
CREATE INDEX idx_hotel_disp_tienda_fecha ON hotel_disponibilidad (tienda_id, fecha);
```

- **Materialización:** al crear un tipo se generan sus filas para `ventana_reserva_dias`. Una consulta o reserva que caiga fuera de lo generado hace `INSERT ... ON CONFLICT DO NOTHING` del rango antes de bloquearlo. Unas 365 filas por tipo es poco: un hotel de 8 tipos son unas 3.000 filas.
- **Cambiar `tipo.unidades`** actualiza `unidades_total` en las fechas futuras. Si en alguna fecha quedaría por debajo de lo vendido, se rechaza el cambio y se informa qué fechas lo impiden.

**Precio de una noche** (`tarifas.js`, función pura, en este orden de prioridad):
```
1. disponibilidad.precio (override del día)
2. temporada vigente de mayor prioridad (precio fijo por tipo, o base × (1 + ajuste_pct))
3. precio_fin_semana si es viernes o sábado
4. productos.precio_base
→ + plan tarifario (pct/monto, por persona si aplica)
→ + persona extra × (personas − ocupacion_base)
```

### Bloqueos y canales externos

```sql
CREATE TABLE hotel_bloqueos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id     UUID NOT NULL,
  tipo_id       UUID NOT NULL REFERENCES hotel_tipos_habitacion(producto_id) ON DELETE CASCADE,
  habitacion_id UUID REFERENCES hotel_habitaciones(id) ON DELETE SET NULL,
  fecha_desde   DATE NOT NULL,
  fecha_hasta   DATE NOT NULL,      -- exclusiva (como el check-out)
  unidades      INT NOT NULL DEFAULT 1,
  motivo        VARCHAR(15) NOT NULL, -- mantenimiento | canal_externo | uso_interno
  canal_id      UUID REFERENCES hotel_canales_ical(id) ON DELETE CASCADE,
  uid_externo   VARCHAR(255),          -- UID del VEVENT de iCal
  resumen       VARCHAR(255),
  UNIQUE (canal_id, uid_externo)
);

CREATE TABLE hotel_canales_ical (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id     UUID NOT NULL,
  tipo_id       UUID NOT NULL REFERENCES hotel_tipos_habitacion(producto_id) ON DELETE CASCADE,
  canal         VARCHAR(20) NOT NULL,  -- booking | airbnb | expedia | hostelworld | otro
  url_importar  VARCHAR(1000),         -- iCal del canal → bloqueos aquí
  token_exportar VARCHAR(64) NOT NULL UNIQUE, -- /ical/<token>.ics → nuestras reservas al canal
  ultima_sync   TIMESTAMPTZ,
  ultimo_error  TEXT,
  activo        BOOLEAN NOT NULL DEFAULT true
);
```

- **Exportar:** `GET /api/v1/public/ical/:token.ics` lista las reservas confirmadas y los bloqueos que no vienen de ese mismo canal. El canal la consulta solo cada cierto tiempo.
- **Importar:** se descarga el `.ics` y se sincronizan los `hotel_bloqueos` del canal (alta, baja y cambio por `uid_externo`), ajustando `unidades_bloqueadas` en la misma transacción. Se dispara con `pg_cron` cada 15-30 min y también con el botón "Sincronizar ahora" del admin.
- **Límite conocido:** iCal tiene retraso (de 15 min a horas, según el canal) y solo bloquea fechas; no trae precio ni huésped. Para un hospedaje pequeño es el estándar de facto. Un channel manager real (API de Booking) queda fuera del MVP.

### Reservas

```sql
CREATE TABLE hotel_reservas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id       UUID NOT NULL,
  pedido_id       UUID UNIQUE REFERENCES pedidos(id) ON DELETE CASCADE, -- null: walk-in sin cobro online
  codigo          VARCHAR(12) NOT NULL,
  fecha_entrada   DATE NOT NULL,
  fecha_salida    DATE NOT NULL,
  noches          INT GENERATED ALWAYS AS (fecha_salida - fecha_entrada) STORED,
  estado          VARCHAR(12) NOT NULL DEFAULT 'confirmada',
                  -- confirmada | en_casa | finalizada | no_show | cancelada
  origen          VARCHAR(12) NOT NULL DEFAULT 'web', -- web | manual | walk_in | telefono
  hora_llegada    TIME,                -- estimada por el huésped
  solicitudes     TEXT,
  fecha_checkin   TIMESTAMPTZ,
  fecha_checkout  TIMESTAMPTZ,
  UNIQUE (tienda_id, codigo),
  CHECK (fecha_salida > fecha_entrada)
);
CREATE INDEX idx_hotel_reservas_tienda_entrada ON hotel_reservas (tienda_id, fecha_entrada);
CREATE INDEX idx_hotel_reservas_tienda_salida  ON hotel_reservas (tienda_id, fecha_salida);

CREATE TABLE hotel_reserva_habitaciones (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reserva_id     UUID NOT NULL REFERENCES hotel_reservas(id) ON DELETE CASCADE,
  tipo_id        UUID NOT NULL REFERENCES hotel_tipos_habitacion(producto_id),
  plan_id        UUID REFERENCES hotel_planes_tarifa(id),
  habitacion_id  UUID REFERENCES hotel_habitaciones(id), -- asignada por recepción
  adultos        INT NOT NULL,
  ninos          INT NOT NULL DEFAULT 0,
  precio_total   DECIMAL(10,2) NOT NULL,
  desglose       JSONB NOT NULL       -- snapshot [{"fecha":"2026-11-10","precio":180}, ...]
);

-- Consumos durante la estadía (lavandería, minibar, tour vendido en recepción)
CREATE TABLE hotel_cargos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reserva_id  UUID NOT NULL REFERENCES hotel_reservas(id) ON DELETE CASCADE,
  descripcion VARCHAR(150) NOT NULL,
  monto       DECIMAL(10,2) NOT NULL,
  pagado      BOOLEAN NOT NULL DEFAULT false,
  fecha       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Una reserva = una estadía (mismas fechas), con una o varias habitaciones. Los huéspedes van en `participantes`: titular al reservar y el resto en el check-in.

**Asignación sin solapes:** al asignar `habitacion_id`, se valida que no exista otra asignación de esa habitación con fechas solapadas, ni un bloqueo sobre ella. Se puede reforzar con un constraint `EXCLUDE USING gist (habitacion_id WITH =, daterange(...) WITH &&)`, que requiere desnormalizar las fechas en la fila.

## Reglas de negocio

**Buscar disponibilidad** (`GET /store/hotel/disponibilidad?entrada&salida&adultos&ninos&habitaciones`). Es una sola consulta:
```sql
SELECT d.tipo_id,
       MIN(d.unidades_total - d.unidades_confirmadas - d.unidades_bloqueadas
           - COALESCE(r.retenidas,0)) AS libres
FROM hotel_disponibilidad d
LEFT JOIN (SELECT recurso_id, fecha, SUM(cantidad) retenidas FROM retenciones_cupo
           WHERE recurso_tipo='hotel_noche' AND expira_en > now() GROUP BY 1,2) r
       ON r.recurso_id = d.tipo_id AND r.fecha = d.fecha
WHERE d.tienda_id = $1 AND d.fecha >= $entrada AND d.fecha < $salida AND NOT d.cerrado
GROUP BY d.tipo_id
HAVING COUNT(*) = ($salida - $entrada)   -- todas las noches existen y están abiertas
   AND MIN(...) >= 1;
```
Después se filtra por capacidad, CTA del día de llegada, CTD del día de salida y mínimo de noches, y se cotiza cada tipo × plan con `tarifas.js`.

**Reservar** (`hotel.service.retener`):
1. Validar el rango: `min_noches` (config, temporada y override del día de llegada), `max_noches`, anticipación y ventana.
2. `SELECT ... FROM hotel_disponibilidad WHERE tipo_id = ANY($tipos) AND fecha >= $e AND fecha < $s ORDER BY tipo_id, fecha FOR UPDATE`.
3. Verificar que estén las N filas por tipo, que cada noche tenga libres ≥ unidades pedidas, y CTA/CTD.
4. Insertar una retención **por noche y tipo** y el pedido `por_pagar` con `fecha_servicio = entrada`. En `pedido_detalles` va una línea por habitación ("Doble matrimonial · Con desayuno · 3 noches").

**Confirmar:** `unidades_confirmadas += n` en cada noche, crear `hotel_reservas` y sus habitaciones. Se envía la confirmación con dirección, mapa, hora de check-in y política.

**Cancelar:** se resta de cada noche y se calcula el reembolso con la política del plan elegido.

**No-show:** si a la hora de corte del día de llegada no hubo check-in, el admin lo marca. Las noches restantes se liberan si la política lo permite.

**Modificar fechas:** se trata como cancelar y volver a reservar en una sola transacción, cobrando o devolviendo la diferencia.

## Storefront

| Pantalla | Contenido |
|---|---|
| Home | Hero con buscador **llegada · salida · huéspedes**; servicios con iconos; galería; ubicación con mapa; reseñas; reglas de la casa |
| Resultados | Tipos disponibles para las fechas con precio **total de la estadía** y por noche, planes como opciones ("Con desayuno +S/ 30"), "quedan 2"; los no disponibles aparecen atenuados con fechas alternativas |
| Ficha del tipo | Galería, camas, m², amenities, capacidad, **calendario de precios** de 2 meses (verde/rojo) |
| Paso de logística | Resumen de la estadía (fechas, noches, habitaciones, huéspedes por habitación), titular, hora estimada de llegada, solicitudes; desglose por noche; adelanto vs saldo en el hotel |
| Mis reservas | Confirmación, cómo llegar, botón de WhatsApp, **check-in online** (datos de los huéspedes antes de llegar) y cancelar según la política |

## Admin

- **Calendario de ocupación (Gantt):** filas = habitaciones agrupadas por tipo, columnas = días. Las reservas son barras que se pueden arrastrar para asignar o reasignar. Es la pantalla principal del hotelero.
- **Grilla de tarifas y disponibilidad:** filas = tipos, columnas = días, con edición masiva por rango (precio, mínimo de noches, cerrar, CTA/CTD) y gestión de temporadas.
- **Hoy:** llegadas, salidas, en casa, check-in (registro de huéspedes con documento, asignar habitación, cobrar saldo) y check-out (cargos extra, cobro final, comprobante).
- **Housekeeping:** estado de limpieza por habitación; vista móvil para el personal.
- **Reserva manual / walk-in** desde el calendario.
- **Canales iCal:** URL de importación por canal, URL de exportación para copiar, último estado de sincronización.
- **Reportes:** ocupación %, ADR (tarifa promedio), RevPAR, ingresos por canal y noches vendidas.

## Fuera de alcance

- Channel manager por API (Booking/Expedia): precios y reservas en dos direcciones.
- Revenue management automático (precio dinámico según ocupación).
- POS de restaurante / bar integrado. Por ahora `hotel_cargos` es manual.
- Cerraduras electrónicas y llaves digitales.
