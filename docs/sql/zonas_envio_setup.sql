-- ============================================================================
-- ZONAS Y TARIFAS DE ENVÍO — Setup
-- ----------------------------------------------------------------------------
-- Alternativa a `npx prisma db push`: corre este script UNA vez en el SQL
-- Editor de Supabase. Refleja exactamente el cambio en el schema.
-- Después: `npx prisma generate`.
--
-- Cada método de envío puede tener zonas con tarifa fija. Una zona es una
-- lista de prefijos UBIGEO (INEI): '15' = departamento de Lima, '1501' =
-- provincia de Lima, '150122' = Miraflores, '*' = todo el país. Para un
-- destino gana la zona con el prefijo MÁS específico.
--
-- El "domicilio" es relativo al almacén de la tienda (tiendas.ubigeo): el
-- delivery propio solo cubre sus zonas; fuera de ellas el método se oculta o
-- queda "por coordinar" según metodos_envio.fuera_de_zona.
--
-- Un método SIN zonas mantiene el comportamiento anterior (costo por
-- coordinar por WhatsApp): las tiendas que no configuren nada no cambian.
-- ============================================================================

ALTER TABLE "metodos_envio"
  -- 'coordinar' (default, comportamiento anterior) | 'no_disponible'
  ADD COLUMN IF NOT EXISTS "fuera_de_zona" VARCHAR(20) NOT NULL DEFAULT 'coordinar',
  -- true = el cliente paga el flete al courier al recoger (no suma al total)
  ADD COLUMN IF NOT EXISTS "pago_en_destino" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "zonas_envio" (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tienda_id"        UUID NOT NULL,
  "metodo_envio_id"  UUID NOT NULL REFERENCES "metodos_envio"("id") ON DELETE CASCADE,
  "nombre"           VARCHAR(60) NOT NULL,
  "costo"            DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK ("costo" >= 0),
  "dias_min"         INTEGER CHECK ("dias_min" >= 0),
  "dias_max"         INTEGER CHECK ("dias_max" >= 0),
  "ubigeos"          VARCHAR(6)[] NOT NULL DEFAULT '{}',
  "orden"            INTEGER NOT NULL DEFAULT 0,
  "fecha_registro"   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_zonas_envio_metodo" ON "zonas_envio" ("metodo_envio_id");
CREATE INDEX IF NOT EXISTS "idx_zonas_envio_tienda" ON "zonas_envio" ("tienda_id");

-- Igual que el resto de tablas: el acceso va solo por el backend (service role)
ALTER TABLE "zonas_envio" ENABLE ROW LEVEL SECURITY;
