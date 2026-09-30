-- ============================================================================
-- DESTINO DE ENTREGA EN PEDIDOS — Setup
-- ----------------------------------------------------------------------------
-- Alternativa a `npx prisma db push`: corre este script UNA vez en el SQL
-- Editor de Supabase. Refleja exactamente el cambio de `pedidos` en el schema.
-- Después: `npx prisma generate`.
--
-- Hasta ahora el storefront enviaba el destino (agencia courier, ubigeo,
-- referencia, pin del mapa) pero el backend lo descartaba: solo llegaba al
-- vendedor dentro del mensaje de WhatsApp. Con estas columnas queda guardado
-- en el pedido y sirve para autocompletar el checkout del comprador logueado.
--
-- Todas nullable: los pedidos anteriores quedan con el destino vacío.
-- ============================================================================

ALTER TABLE "pedidos"
  ADD COLUMN "courier" VARCHAR(50),
  ADD COLUMN "agencia_texto" TEXT,
  ADD COLUMN "departamento" VARCHAR(100),
  ADD COLUMN "provincia" VARCHAR(100),
  ADD COLUMN "distrito" VARCHAR(100),
  ADD COLUMN "ubigeo_code" VARCHAR(10),
  ADD COLUMN "referencia" TEXT,
  ADD COLUMN "latitud" DOUBLE PRECISION,
  ADD COLUMN "longitud" DOUBLE PRECISION;
