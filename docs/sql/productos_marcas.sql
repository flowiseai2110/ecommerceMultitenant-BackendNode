-- ============================================================================
-- PRODUCTOS — Marca del producto (solo rubro productos)
-- ----------------------------------------------------------------------------
-- Correr una sola vez en el SQL Editor (idempotente), o `prisma db push`.
-- Después: `npx prisma generate`.
--
-- Catálogo de marcas por tienda (slug único por tienda: "Nike" y "nike " son
-- la misma marca). Borrar una marca deja sus productos sin marca.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS "marcas" (
  "id"                    UUID         NOT NULL,
  "tienda_id"             UUID         NOT NULL,
  "nombre"                VARCHAR(100) NOT NULL,
  "slug"                  VARCHAR(100) NOT NULL,
  "logo_url"              VARCHAR(500),
  "orden"                 INTEGER      NOT NULL DEFAULT 0,
  "activo"                BOOLEAN      NOT NULL DEFAULT true,
  "fecha_registro"        TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
  "usuario_registro"      VARCHAR(100),
  "fecha_actualizacion"   TIMESTAMPTZ,
  "usuario_actualizacion" VARCHAR(100),
  CONSTRAINT "marcas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_marcas_tienda_slug" ON "marcas"("tienda_id", "slug");
CREATE INDEX IF NOT EXISTS "idx_marcas_tienda_activo" ON "marcas"("tienda_id", "activo");

ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "marca_id" UUID;
CREATE INDEX IF NOT EXISTS "idx_productos_tienda_marca" ON "productos"("tienda_id", "marca_id");

ALTER TABLE "productos" DROP CONSTRAINT IF EXISTS "productos_marca_id_fkey";
ALTER TABLE "productos" ADD CONSTRAINT "productos_marca_id_fkey"
  FOREIGN KEY ("marca_id") REFERENCES "marcas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS sin políticas: solo el backend accede.
ALTER TABLE public.marcas ENABLE ROW LEVEL SECURITY;

COMMIT;
