# Vertical: eventos

> Parte de [spec.md](spec.md) (núcleo común: retenciones, políticas, participantes, estrategia).
> `tiendas.tipo_negocio = 'eventos'`.

## Cómo opera un organizador de eventos

- Vende **entradas** de distintos **tipos** (General, VIP, Platea, Mesa para 4) para una o varias **funciones** (fechas/horas) del mismo evento.
- **Dos topes a la vez:** el cupo de cada tipo de entrada (100 VIP) y el **aforo de la función** (el local admite 800 en total, aunque la suma de tipos dé más).
- **Preventas escalonadas:** Early bird S/ 60 (primeras 100 o hasta el 30/10) → Preventa 2 S/ 80 → Puerta S/ 100.
- **Entradas especiales:** cortesías, entradas con código (prensa, staff), abono para todas las funciones, entrada doble o mesa (1 compra = N accesos).
- **Control de acceso** en la puerta con QR: rápido, a veces sin buena señal y con intentos de duplicar capturas.
- **Nominativas o al portador:** conferencias y talleres piden el nombre de cada asistente (certificado); conciertos casi nunca.
- **Eventos virtuales/híbridos:** el link de acceso solo se revela al comprador.
- **Cambios:** postergación y cancelación, con obligación de devolver si el evento no se realiza (INDECOPI).
- **Cargo por servicio** (de la plataforma o del organizador) visible y separado.

## Modelo de datos

### Configuración

```sql
CREATE TABLE config_eventos (
  tienda_id                UUID PRIMARY KEY REFERENCES tiendas(id) ON DELETE CASCADE,
  minutos_retencion        INT NOT NULL DEFAULT 10,
  minutos_retencion_manual INT NOT NULL DEFAULT 60,
  max_entradas_por_compra  INT NOT NULL DEFAULT 10,
  entradas_nominativas     BOOLEAN NOT NULL DEFAULT false, -- por defecto; cada evento puede sobrescribir
  permitir_transferencia   BOOLEAN NOT NULL DEFAULT true,
  mostrar_restantes_bajo   INT DEFAULT 20,     -- "quedan 12" solo si quedan ≤ N; null = nunca
  cargo_servicio_tipo      VARCHAR(10),        -- null | pct | fijo
  cargo_servicio_valor     DECIMAL(10,2),
  cargo_servicio_asume     VARCHAR(12) NOT NULL DEFAULT 'comprador', -- comprador | organizador
  politica_cancelacion_id  UUID REFERENCES politicas_cancelacion(id)
  -- + auditoría
);
```

### Evento (1:1 con `productos`)

```sql
CREATE TABLE eventos (
  producto_id      UUID PRIMARY KEY REFERENCES productos(id) ON DELETE CASCADE,
  tienda_id        UUID NOT NULL,
  tipo             VARCHAR(15) NOT NULL DEFAULT 'concierto',
                   -- concierto | conferencia | taller | fiesta | deportivo | teatro | feria | otro
  modalidad        VARCHAR(12) NOT NULL DEFAULT 'presencial', -- presencial | virtual | hibrido
  estado           VARCHAR(12) NOT NULL DEFAULT 'borrador',
                   -- borrador | publicado | agotado | finalizado | postergado | cancelado
  lugar_nombre     VARCHAR(150),
  lugar_direccion  TEXT,
  ubigeo           VARCHAR(6),
  lat              FLOAT,
  lng              FLOAT,
  url_acceso_virtual VARCHAR(500),     -- NUNCA se expone en el endpoint público
  aforo            INT,                -- por defecto para las funciones
  edad_minima      INT,
  organizador      VARCHAR(150),       -- si difiere de la tienda (productora que vende para otros)
  artistas         JSONB,              -- [{"nombre":"...","imagen_url":"...","rol":"headliner"}]
  nominativas      BOOLEAN,            -- null = config_eventos
  politica_cancelacion_id UUID REFERENCES politicas_cancelacion(id),
  terminos         TEXT,               -- prohibiciones, objetos no permitidos...
  mapa_imagen_url  VARCHAR(500)        -- plano de zonas (imagen; sin asientos numerados en el MVP)
  -- + auditoría
);
```

### Funciones

```sql
CREATE TABLE evento_funciones (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id        UUID NOT NULL,
  evento_id        UUID NOT NULL REFERENCES eventos(producto_id) ON DELETE CASCADE,
  inicio           TIMESTAMPTZ NOT NULL,
  fin              TIMESTAMPTZ,
  apertura_puertas TIMESTAMPTZ,
  aforo            INT NOT NULL,          -- copia de eventos.aforo, editable
  aforo_confirmado INT NOT NULL DEFAULT 0,  -- accesos vendidos (mesa de 4 = 4)
  estado           VARCHAR(12) NOT NULL DEFAULT 'activa', -- activa | agotada | postergada | cancelada | finalizada
  CHECK (aforo_confirmado <= aforo)
);
CREATE INDEX idx_funciones_tienda_inicio ON evento_funciones (tienda_id, inicio);
```

Un evento de una sola fecha tiene una función. Una obra con temporada o un festival de 3 días tiene varias.

### Tipos de entrada

```sql
CREATE TABLE evento_tipos_entrada (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id         UUID NOT NULL,
  evento_id         UUID NOT NULL REFERENCES eventos(producto_id) ON DELETE CASCADE,
  funcion_id        UUID REFERENCES evento_funciones(id) ON DELETE CASCADE,
                    -- null = vale para cualquier función que elija el cliente (el cupo es por tipo)
  es_abono          BOOLEAN NOT NULL DEFAULT false, -- da acceso a TODAS las funciones
  nombre            VARCHAR(80) NOT NULL,  -- "VIP · Preventa 1"
  zona              VARCHAR(50),           -- "VIP": agrupa las fases de precio de una misma zona
  descripcion       TEXT,
  precio            DECIMAL(10,2) NOT NULL, -- 0 = gratuita (registro)
  cupo              INT NOT NULL,
  cupo_confirmado   INT NOT NULL DEFAULT 0,
  accesos_por_entrada INT NOT NULL DEFAULT 1, -- mesa de 4 = 4 (cuentan para el aforo)
  min_por_compra    INT NOT NULL DEFAULT 1,
  max_por_compra    INT,
  venta_desde       TIMESTAMPTZ,
  venta_hasta       TIMESTAMPTZ,
  siguiente_id      UUID REFERENCES evento_tipos_entrada(id), -- fase de precio que se abre al agotarse esta
  requiere_codigo   BOOLEAN NOT NULL DEFAULT false, -- prensa, staff, invitados
  visible           BOOLEAN NOT NULL DEFAULT true,
  orden             INT NOT NULL DEFAULT 0,
  CHECK (cupo_confirmado <= cupo)
);

CREATE TABLE evento_codigos_acceso (   -- para tipos con requiere_codigo
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_entrada_id UUID NOT NULL REFERENCES evento_tipos_entrada(id) ON DELETE CASCADE,
  codigo        VARCHAR(30) NOT NULL,
  usos_max      INT NOT NULL DEFAULT 1,
  usos          INT NOT NULL DEFAULT 0,
  UNIQUE (tipo_entrada_id, codigo)
);
```

**Fases de precio:** "Preventa 1 → Preventa 2 → General" son tipos distintos con la misma `zona`, encadenados con `siguiente_id` y/o con fechas `venta_desde/hasta`. El storefront muestra solo la fase vigente por zona: la primera con fechas válidas y cupo. Así cada fase tiene su propio cupo y su precio queda en el snapshot de la venta.

### Entradas emitidas

```sql
CREATE TABLE entradas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id        UUID NOT NULL,
  pedido_id        UUID REFERENCES pedidos(id) ON DELETE CASCADE, -- null: cortesía emitida desde el admin
  tipo_entrada_id  UUID NOT NULL REFERENCES evento_tipos_entrada(id),
  funcion_id       UUID REFERENCES evento_funciones(id),            -- null si es abono
  codigo           VARCHAR(16) NOT NULL,       -- legible: "EV-7K3M-Q9TX" (búsqueda manual en la puerta)
  qr_token         VARCHAR(80) NOT NULL UNIQUE, -- id + firma HMAC (nucleo/qr.js)
  titular_nombre   VARCHAR(150),
  titular_documento VARCHAR(20),
  titular_email    VARCHAR(100),
  estado           VARCHAR(12) NOT NULL DEFAULT 'valida', -- valida | usada | anulada | reembolsada
  accesos_total    INT NOT NULL DEFAULT 1,     -- mesa de 4 / abono de 3 días
  accesos_usados   INT NOT NULL DEFAULT 0,
  es_cortesia      BOOLEAN NOT NULL DEFAULT false,
  transferida_de   UUID REFERENCES entradas(id),
  fecha_emision    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tienda_id, codigo)
);
CREATE INDEX idx_entradas_funcion ON entradas (funcion_id, estado);
CREATE INDEX idx_entradas_pedido ON entradas (pedido_id);

CREATE TABLE entrada_escaneos (       -- bitácora de puerta: auditoría y antifraude
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id   UUID NOT NULL,
  entrada_id  UUID REFERENCES entradas(id) ON DELETE SET NULL,
  funcion_id  UUID REFERENCES evento_funciones(id),
  qr_leido    VARCHAR(80),
  resultado   VARCHAR(15) NOT NULL, -- ok | ya_usada | anulada | otra_funcion | invalida | firma_mala
  puerta      VARCHAR(30),
  dispositivo VARCHAR(60),
  usuario_id  UUID,                 -- staff con rol en usuario_tiendas
  fecha       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- **Una fila por entrada** (comprar 3 VIP emite 3 entradas, cada una con su QR) para que cada asistente entre por separado y se pueda transferir o anular de a una. La mesa de 4 es **una** entrada con `accesos_total = 4`.
- **Nominativas:** si el evento lo exige, `titular_*` se completa en el checkout o luego desde "Mis entradas". Además se crea la fila en `participantes`, útil para certificados de talleres.
- **Transferencia:** se anula la entrada original (`estado = anulada`) y se emite una nueva con `transferida_de` y un nuevo `qr_token`. Así una captura del QR viejo deja de servir.

## Reglas de negocio

**Mostrar disponibilidad** (`GET /store/eventos/:slug/funciones`): por función y zona, la fase vigente con
`libres = min(tipo.cupo − tipo.cupo_confirmado − ret(tipo), (función.aforo − función.aforo_confirmado − ret(función)) / accesos_por_entrada)`.

**Reservar** (`eventos.service.retener`):
1. Validar que el evento esté `publicado` y la función `activa`, que la ventana `venta_desde/hasta` esté vigente, los mínimos y máximos por compra, `max_entradas_por_compra` y el código de acceso si se requiere.
2. Bloquear en orden fijo: `evento_funciones FOR UPDATE` → `evento_tipos_entrada ... ORDER BY id FOR UPDATE`.
3. Verificar **ambos** topes (tipo y aforo de la función), contando retenciones vigentes.
4. Crear retenciones (`evento_tipo_entrada`, más una de aforo `evento_funcion` por los accesos) y el pedido `por_pagar` con `fecha_servicio = fecha local de la función`. El cargo por servicio va como línea aparte en `pedido_detalles`.
5. **Retención corta** (10 min) con contador visible. En lanzamientos con mucha demanda es lo que evita que la gente "acapare" entradas sin pagar.

**Confirmar:** suma a `cupo_confirmado` y `aforo_confirmado`, **emite las entradas** y envía el email con los QR (y un PDF) más el aviso por WhatsApp con el link a "Mis entradas". Si el tipo se agotó, se abre su `siguiente_id` y, si la función llega al aforo, pasa a `agotada`.

**Entradas gratuitas (registro):** con precio 0 no hay pasarela. Se confirma directo, sin pasar por `por_pagar`.

**Validación en la puerta** (`POST /admin/eventos/escanear`):
1. Verificar la firma HMAC del QR (rechaza QR inventados sin consultar la BD).
2. `SELECT ... FROM entradas WHERE qr_token = $1 FOR UPDATE`.
3. Comprobar que la función corresponda (o que sea abono), que `estado = valida` y que `accesos_usados < accesos_total`. Entonces `accesos_usados += 1` y, si se completó, `estado = usada`.
4. Registrar en `entrada_escaneos` y responder con el nombre del titular y el tipo, en verde o rojo.

**Modo sin conexión:** el escáner descarga la lista de `qr_token` de la función antes de abrir puertas, valida localmente (la firma más la lista) y sincroniza los escaneos al recuperar señal. Si dos puertas validaron el mismo QR estando offline, el segundo escaneo queda marcado `ya_usada` en la bitácora para revisarlo.

**Postergar / cancelar el evento** (acción masiva del admin):
- Postergar: se cambia la fecha de la función, las entradas siguen válidas, se avisa a todos y se ofrece un reembolso a quien no pueda asistir (plazo configurable).
- Cancelar: todas las entradas pasan a `reembolsada`, se gestiona el reembolso al 100% y se avisa por email y WhatsApp.

**Cancelación por el comprador:** normalmente no aplica (política "no reembolsable"); la transferencia es la alternativa.

## Storefront

| Pantalla | Contenido |
|---|---|
| Home | Si hay **un** evento destacado, la home es su landing (banner, cuenta regresiva, CTA "Comprar entradas"). Si hay varios, cartelera por fecha y tipo |
| Ficha del evento | Banner, fecha(s), lugar con mapa, artistas / ponentes, descripción, plano de zonas, tipos con fase vigente, precio y "quedan N", términos, política |
| Selección | Función (si hay varias) → cantidades por tipo (+/−) → código de acceso si aplica → **contador de la retención** al continuar |
| Paso de logística | Titulares por entrada si son nominativas (o "lo completo después"); no hay dirección ni envío |
| Confirmación / Mis entradas | Una tarjeta por entrada con su QR a pantalla completa (brillo alto), agregar al calendario, cómo llegar, transferir y link virtual si aplica |

## Admin

- **Eventos:** ficha, funciones, tipos de entrada con fases (vista de "escalera" por zona), códigos de acceso y estado (publicar, postergar, cancelar).
- **Ventas en vivo:** vendidas / aforo por función y tipo, ingresos y ritmo de venta por día.
- **Asistentes:** lista filtrable con exportación a Excel/CSV, reenviar entradas, anular y transferir.
- **Cortesías:** emitir N entradas de un tipo a nombre de alguien (sin pedido o con pedido de origen `cortesia` a S/ 0, para el reporte).
- **Escáner (PWA):** cámara con `BarcodeDetector` o una librería de QR, selección de puerta y función, contador de ingresados y modo offline. Se habilita para usuarios con rol `editor` (staff de puerta) sin dar acceso a ventas.
- **Post-evento:** asistencia real vs vendida, no-show, envío de la encuesta de reseña y certificados (talleres: PDF con el nombre del participante).

## Fuera de alcance

- **Asientos numerados** con mapa interactivo: requiere `evento_asientos (funcion_id, sector, fila, numero, estado)`, retención por asiento y un editor de planos. Es el siguiente paso natural, pero duplica el alcance del MVP.
- Lista de espera automática al agotarse.
- Reventa oficial con precio tope.
- Wallet (Apple / Google Pass).
- Venta en boletería física con impresión térmica.
