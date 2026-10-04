# Vertical: agencia de tours

> Parte de [spec.md](spec.md) (núcleo común: retenciones, políticas, participantes, estrategia).
> `tiendas.tipo_negocio = 'tours'`.

## Cómo opera una agencia de tours (Perú)

- Vende **plazas en salidas**: "Full Day Paracas y Huacachina, sábado 15/11, 4:30 a. m., grupo en español". La salida tiene un **cupo** (asientos del bus, capacidad del guía o del bote) y suele tener un **mínimo de pasajeros** para salir.
- **Precio por tipo de pasajero**: adulto, niño, estudiante, adulto mayor y, muy típico, **nacional / extranjero (CAN incluida)**, porque las entradas a sitios arqueológicos cuestan distinto.
- **Compartido o privado.** El privado tiene precio por persona según el tamaño del grupo (2 pax: S/ 250 c/u; 3-4 pax: S/ 190 c/u…) y no comparte cupo con nadie.
- **Recojo en hotel** dentro de una zona (Cusco centro, Miraflores/Barranco) con hora de recojo distinta por zona, o **punto de encuentro**.
- **Extras**: almuerzo, entrada a Huayna Picchu, alquiler de equipo, upgrade de tren. Algunos tienen cupo propio por salida.
- **Tours de varios días** (Camino Inca 4D/3N, Machu Picchu 2D/1N) con itinerario por día y alojamiento incluido.
- **Requisitos**: pasaporte (Machu Picchu exige el documento con el que se compró la entrada), edad mínima, nivel de dificultad, altitud.
- **Operación del día**: manifiesto de pasajeros, guía y vehículo asignados, hora de recojo por pasajero, check-in al subir.
- **Venta por terceros**: recepciones de hotel y promotores venden los tours de la agencia a comisión (fase 2).
- Requisito legal: inscripción en el **Directorio de Prestadores de Servicios Turísticos (MINCETUR / DIRCETUR)**. Mostrar el número genera confianza.

## Modelo de datos

### Configuración de la tienda

```sql
CREATE TABLE config_tours (
  tienda_id                UUID PRIMARY KEY REFERENCES tiendas(id) ON DELETE CASCADE,
  registro_mincetur        VARCHAR(50),
  corte_venta_horas        INT NOT NULL DEFAULT 12,     -- por defecto; cada tour puede sobrescribir
  minutos_retencion        INT NOT NULL DEFAULT 15,     -- con pasarela
  minutos_retencion_manual INT NOT NULL DEFAULT 120,    -- Yape/transferencia con captura
  adelanto_pct             INT NOT NULL DEFAULT 100 CHECK (adelanto_pct BETWEEN 1 AND 100),
  saldo_cobrar_en          VARCHAR(20) NOT NULL DEFAULT 'antes_salida', -- antes_salida | en_destino
  politica_cancelacion_id  UUID REFERENCES politicas_cancelacion(id),
  idiomas                  VARCHAR(5)[] NOT NULL DEFAULT '{es}',
  pedir_datos_pasajeros    VARCHAR(20) NOT NULL DEFAULT 'al_reservar', -- al_reservar | antes_salida | titular_solo
  exportacion_servicios    BOOLEAN NOT NULL DEFAULT false, -- IGV 0% a no domiciliados (validar con contador)
  edad_nino_max            INT NOT NULL DEFAULT 11
  -- + auditoría
);
```

### Ficha del tour (1:1 con `productos`)

```sql
CREATE TABLE tours (
  producto_id        UUID PRIMARY KEY REFERENCES productos(id) ON DELETE CASCADE,
  tienda_id          UUID NOT NULL,
  modalidad          VARCHAR(12) NOT NULL DEFAULT 'compartido', -- compartido | privado | ambos
  duracion_minutos   INT,            -- tours de un día
  duracion_dias      INT,            -- multi-día (con noches = dias - 1 por defecto)
  duracion_noches    INT,
  destino_ubigeo     VARCHAR(6),     -- para buscar por destino ("Cusco", "Ica")
  destino_nombre     VARCHAR(100),
  dificultad         VARCHAR(10),    -- facil | moderada | exigente | extrema
  altitud_max_msnm   INT,
  edad_minima        INT,
  cupo_por_defecto   INT NOT NULL DEFAULT 15,
  min_pasajeros      INT NOT NULL DEFAULT 1,  -- mínimo para que la salida se garantice
  corte_venta_horas  INT,                     -- null = config_tours
  politica_cancelacion_id UUID REFERENCES politicas_cancelacion(id),
  idiomas            VARCHAR(5)[] NOT NULL DEFAULT '{es}',
  incluye            TEXT[] NOT NULL DEFAULT '{}',
  no_incluye         TEXT[] NOT NULL DEFAULT '{}',
  que_llevar         TEXT[] NOT NULL DEFAULT '{}',
  requisitos         TEXT,
  requiere_pasaporte BOOLEAN NOT NULL DEFAULT false,
  recojo             VARCHAR(15) NOT NULL DEFAULT 'punto_encuentro', -- punto_encuentro | hotel | ambos
  punto_encuentro    TEXT,
  punto_lat          FLOAT,
  punto_lng          FLOAT
  -- + auditoría
);
CREATE INDEX idx_tours_tienda_destino ON tours (tienda_id, destino_ubigeo);
```

- `productos.precioBase` queda como **"desde S/ X"** para tarjetas y SEO. El precio real sale de `tour_tipos_pasajero`.
- `productos.stock` y las variantes no se usan.

### Itinerario

```sql
CREATE TABLE tour_itinerario (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id     UUID NOT NULL REFERENCES tours(producto_id) ON DELETE CASCADE,
  dia         INT NOT NULL DEFAULT 1,
  orden       INT NOT NULL DEFAULT 0,
  hora        TIME,                -- referencial ("05:30 Recojo", "09:00 Islas Ballestas")
  titulo      VARCHAR(150) NOT NULL,
  descripcion TEXT,
  imagen_url  VARCHAR(500),
  alojamiento VARCHAR(150),        -- multi-día: dónde se duerme ese día
  comidas     VARCHAR(3)[]         -- {D,A,C}
);
```

### Precios

```sql
-- Precio compartido por tipo de pasajero
CREATE TABLE tour_tipos_pasajero (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id        UUID NOT NULL REFERENCES tours(producto_id) ON DELETE CASCADE,
  codigo         VARCHAR(20) NOT NULL, -- adulto | nino | estudiante | adulto_mayor | adulto_extranjero ...
  nombre         VARCHAR(60) NOT NULL, -- "Adulto extranjero"
  precio         DECIMAL(10,2) NOT NULL,
  edad_min       INT,
  edad_max       INT,
  nacionalidad   VARCHAR(12),          -- null | nacional | extranjero | can
  requiere_sustento VARCHAR(30),       -- "carné universitario" (se valida en el check-in)
  ocupa_cupo     BOOLEAN NOT NULL DEFAULT true, -- infante en brazos: false
  orden          INT NOT NULL DEFAULT 0,
  UNIQUE (tour_id, codigo)
);

-- Privado: precio por persona según el tamaño del grupo
CREATE TABLE tour_precios_privado (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id             UUID NOT NULL REFERENCES tours(producto_id) ON DELETE CASCADE,
  min_pax             INT NOT NULL,
  max_pax             INT NOT NULL,
  precio_por_persona  DECIMAL(10,2) NOT NULL,
  CHECK (min_pax <= max_pax)
);

-- Extras opcionales
CREATE TABLE tour_extras (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id        UUID NOT NULL REFERENCES tours(producto_id) ON DELETE CASCADE,
  nombre         VARCHAR(100) NOT NULL,
  descripcion    TEXT,
  precio         DECIMAL(10,2) NOT NULL,
  cobro          VARCHAR(12) NOT NULL DEFAULT 'por_persona', -- por_persona | por_reserva
  cupo_por_salida INT,               -- null = ilimitado (ej. Huayna Picchu: 200/día)
  activo         BOOLEAN NOT NULL DEFAULT true,
  orden          INT NOT NULL DEFAULT 0
);
```

### Programación y salidas

```sql
-- Regla recurrente: "lun-sáb 04:30, cupo 20, español", vigente en un rango
CREATE TABLE tour_programaciones (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id      UUID NOT NULL REFERENCES tours(producto_id) ON DELETE CASCADE,
  dias_semana  INT[] NOT NULL,         -- 1=lun ... 7=dom
  hora         TIME NOT NULL,
  idioma       VARCHAR(5) NOT NULL DEFAULT 'es',
  cupo         INT NOT NULL,
  vigente_desde DATE NOT NULL,
  vigente_hasta DATE,
  activo       BOOLEAN NOT NULL DEFAULT true
);

-- Cada salida concreta: la unidad de inventario
CREATE TABLE tour_salidas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id        UUID NOT NULL,
  tour_id          UUID NOT NULL REFERENCES tours(producto_id) ON DELETE CASCADE,
  programacion_id  UUID REFERENCES tour_programaciones(id) ON DELETE SET NULL,
  fecha            DATE NOT NULL,
  hora             TIME NOT NULL,
  idioma           VARCHAR(5) NOT NULL DEFAULT 'es',
  cupo_total       INT NOT NULL,
  cupo_confirmado  INT NOT NULL DEFAULT 0,  -- plazas con pago confirmado
  privada          BOOLEAN NOT NULL DEFAULT false, -- creada por una reserva privada: no se vende a otros
  estado           VARCHAR(12) NOT NULL DEFAULT 'abierta',
                   -- abierta | garantizada | cerrada | cancelada | en_curso | completada
  precio_ajuste_pct INT,                    -- feriados / temporada alta (null = sin ajuste)
  guia_id          UUID REFERENCES tour_guias(id),
  vehiculo_id      UUID REFERENCES tour_vehiculos(id),
  notas_operacion  TEXT,
  CHECK (cupo_confirmado <= cupo_total)
);
-- Una sola salida compartida por tour/fecha/hora/idioma; las privadas pueden repetirse
CREATE UNIQUE INDEX uq_salida_compartida ON tour_salidas (tour_id, fecha, hora, idioma) WHERE privada = false;
CREATE INDEX idx_salidas_tienda_fecha ON tour_salidas (tienda_id, fecha);
CREATE INDEX idx_salidas_tour_fecha ON tour_salidas (tour_id, fecha) WHERE estado IN ('abierta','garantizada');
```

- **Materialización perezosa:** las salidas de una programación se crean cuando alguien consulta o reserva esa fecha (`INSERT ... ON CONFLICT DO NOTHING`) y, opcionalmente, en un lote de 90 días cuando el admin guarda la programación. No hace falta un cron diario.
- **Privadas:** cada reserva privada crea su propia salida (`privada = true`, cupo = tamaño del grupo). Por eso el índice único es parcial y aplica solo a las compartidas. `tour_guias` y `tour_vehiculos` (sección Operación) se crean antes que esta tabla.
- El estado `garantizada` se marca solo cuando `cupo_confirmado >= tours.min_pasajeros`. El storefront lo muestra como "Salida confirmada", que vende más.
- Cupo de extras limitados por salida: tabla `tour_salida_extras (salida_id, extra_id, cupo_total, cupo_confirmado)`, con retención `recurso_tipo = 'tour_extra'`.

### Recojo

Se reutiliza la idea de `zonas_envio`: prefijos UBIGEO INEI, gana el más largo.

```sql
CREATE TABLE tour_zonas_recojo (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id          UUID NOT NULL,
  tour_id            UUID REFERENCES tours(producto_id) ON DELETE CASCADE, -- null = todas las de la tienda
  nombre             VARCHAR(60) NOT NULL,      -- "Cusco centro histórico"
  ubigeos            VARCHAR(6)[] NOT NULL DEFAULT '{}',
  minutos_antes      INT NOT NULL DEFAULT 0,    -- recojo X min antes de la hora de salida
  costo              DECIMAL(10,2) NOT NULL DEFAULT 0,
  orden              INT NOT NULL DEFAULT 0
);
```

Con esto, la lógica pura de `cotizacion.js` se generaliza o se copia.

### Reservas

```sql
CREATE TABLE tour_reservas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id       UUID NOT NULL,
  pedido_id       UUID NOT NULL UNIQUE REFERENCES pedidos(id) ON DELETE CASCADE,
  salida_id       UUID NOT NULL REFERENCES tour_salidas(id),
  codigo          VARCHAR(12) NOT NULL,      -- "TR-8K2F" para voucher y WhatsApp
  modalidad       VARCHAR(12) NOT NULL,      -- compartido | privado
  pasajeros       INT NOT NULL,              -- solo los que ocupan cupo
  estado          VARCHAR(15) NOT NULL DEFAULT 'confirmada',
                  -- confirmada | reprogramada | abordo | completada | no_show | cancelada
  recojo_tipo     VARCHAR(15),               -- punto_encuentro | hotel
  recojo_zona_id  UUID REFERENCES tour_zonas_recojo(id),
  recojo_hotel    VARCHAR(150),
  recojo_direccion TEXT,
  recojo_lat      FLOAT,
  recojo_lng      FLOAT,
  hora_recojo     TIME,                      -- calculada; el operador puede ajustarla
  solicitudes     TEXT,                      -- dieta, movilidad reducida...
  qr_token        VARCHAR(64) NOT NULL,      -- check-in al abordar (nucleo/qr.js)
  fecha_abordo    TIMESTAMPTZ,
  UNIQUE (tienda_id, codigo)
);
CREATE INDEX idx_tour_reservas_salida ON tour_reservas (salida_id);

CREATE TABLE tour_reserva_lineas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reserva_id      UUID NOT NULL REFERENCES tour_reservas(id) ON DELETE CASCADE,
  tipo            VARCHAR(10) NOT NULL,  -- pasajero | extra | recojo | privado
  referencia_id   UUID,                  -- tipo_pasajero_id / extra_id / zona_id
  descripcion     VARCHAR(150) NOT NULL, -- snapshot: "Adulto extranjero"
  cantidad        INT NOT NULL,
  precio_unitario DECIMAL(10,2) NOT NULL -- snapshot
);
```

Los pasajeros individuales van en `participantes` (núcleo). Cada uno lleva en `datos`: `{ tipo_pasajero_id, alergias, contacto_emergencia }`.

### Operación

```sql
CREATE TABLE tour_guias (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id  UUID NOT NULL,
  nombre     VARCHAR(100) NOT NULL,
  telefono   VARCHAR(20),
  idiomas    VARCHAR(5)[] NOT NULL DEFAULT '{es}',
  licencia   VARCHAR(50),       -- carné de guía oficial
  activo     BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE tour_vehiculos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id  UUID NOT NULL,
  descripcion VARCHAR(100) NOT NULL, -- "Sprinter 20 asientos"
  placa      VARCHAR(10),
  capacidad  INT NOT NULL,
  proveedor  VARCHAR(100),          -- muchas agencias tercerizan el transporte
  activo     BOOLEAN NOT NULL DEFAULT true
);
```

## Reglas de negocio

**Cotizar** (`precios.js`, función pura):
```
compartido: Σ (tipo_pasajero.precio × cantidad) × (1 + salida.precio_ajuste_pct)
privado:    tramo de tour_precios_privado donde min_pax ≤ N ≤ max_pax → precio_por_persona × N
          + Σ extras (por_persona × N | por_reserva × 1)
          + zona_recojo.costo
          − cupón
adelanto = total × config_tours.adelanto_pct
```

**Reservar** (`tours.service.retener`):
1. Resolver la salida (materializarla si viene de una programación) y validar `fecha + hora − corte_venta_horas > ahora` y `estado IN (abierta, garantizada)`.
2. `SELECT ... FROM tour_salidas WHERE id = $1 FOR UPDATE` (más `tour_salida_extras` si aplica, en orden de id).
3. `disponible = cupo_total − cupo_confirmado − Σ retenciones vigentes`. Debe cumplirse `≥ pasajeros que ocupan cupo`.
4. Validar los requisitos: edad mínima contra `fecha_nacimiento` si ya se pidió, idioma ofrecido y recojo en zona (si no hay zona que cubra el hotel, se ofrece el punto de encuentro).
5. Insertar la retención y el pedido `por_pagar`.

**Confirmar:** `cupo_confirmado += pasajeros`, crear `tour_reservas` y recalcular `garantizada`. Se envía el **voucher** (código, QR, hora y lugar de recojo, qué llevar) por email y WhatsApp.

**Cancelar o reprogramar por la agencia** (lluvia, huaico, no se llegó al mínimo):
- Acción masiva sobre la salida: elegir una salida destino (reprogramar, si hay cupo) o cancelar con reembolso del 100%, ignorando la política.
- Se avisa a todos los pasajeros por WhatsApp usando las plantillas que ya existen (`tienda-plantillas-whatsapp.service.js`).

**Cancelación por el cliente:** `calcularReembolso(snapshot, fecha+hora de salida, ahora)`.

**Salida no garantizada al corte de venta:** se alerta al admin (no se cancela sola). La agencia decide si sale igual, reprograma o une grupos con otra agencia ("pool", muy común).

## Storefront

| Pantalla | Contenido |
|---|---|
| Home | Buscador **destino + fecha + pasajeros** en el hero; tours destacados; categorías (aventura, cultural, gastronómico, multi-día) |
| Listado / búsqueda | Filtro por destino, fecha (solo tours con salida abierta ese día), duración, dificultad, precio, idioma |
| Ficha del tour | Galería, resumen (duración, dificultad, altitud, idiomas), **calendario de salidas** con precio "desde" y cupos ("quedan 4"), itinerario por día, incluye / no incluye, qué llevar, mapa del punto de encuentro, política de cancelación, reseñas |
| Reserva (paso de logística) | Salida (fecha + hora + idioma) → pasajeros por tipo (+/−) → compartido/privado → extras → recojo (buscar hotel / dirección con el `domicilio-picker` + Nominatim que ya existe, o punto de encuentro) → resumen con desglose y adelanto |
| Datos de pasajeros | Formulario por persona (nombre, documento, nacionalidad, fecha de nacimiento) **ahora o después** según `pedir_datos_pasajeros`; link "completa tus datos" en el voucher |
| Mis reservas | Voucher con QR, hora de recojo confirmada, datos del guía (el día anterior), botón de WhatsApp con la agencia |

## Admin

- **Tours:** ficha + tabs de itinerario, precios por tipo de pasajero, tramos privados, extras, programaciones y zonas de recojo.
- **Calendario de salidas:** vista semana/mes con ocupación por salida (`12/20 · garantizada`). Permite cerrar, cancelar, reprogramar o crear salidas especiales.
- **Salida del día / manifiesto:** lista de pasajeros con documento, tipo, hotel y hora de recojo ordenada por ruta; asignar guía y vehículo; **exportar PDF/Excel** para el guía; enviar el manifiesto por WhatsApp.
- **Check-in al abordar:** escáner QR PWA compartido con eventos; también por código o nombre.
- **Reserva manual:** venta por teléfono, en oficina o por un revendedor, con descuento de cupo en el acto.
- **Reportes:** ocupación por salida, ingresos por tour, tasa de no-show, salidas canceladas por mínimo.

## Fase 2 (no entra en el MVP)

- **Afiliados / revendedores** (hoteles, promotores): `afiliados (tienda_id, nombre, codigo, comision_pct)`. El link `?ref=CODIGO` se guarda en `pedidos.afiliado_id` y genera un reporte de comisiones por liquidar. Es muy común en Cusco, Arequipa e Ica.
- **Paquetes** (Cusco 4D: city tour + Valle Sagrado + Machu Picchu): un producto que agrupa salidas en fechas relativas.
- **Pool entre agencias:** compartir cupo de una salida con otra tienda de la plataforma.
- **Inventarios externos** (entradas oficiales a Machu Picchu, tren PeruRail/IncaRail): por ahora el cupo de esos extras es manual.
- Asignación automática de rutas de recojo.
