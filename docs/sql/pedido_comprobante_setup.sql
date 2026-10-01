-- ============================================================================
-- COMPROBANTE DE PAGO EN PEDIDOS (boleta / factura) — Setup
-- ----------------------------------------------------------------------------
-- Alternativa a `npx prisma db push`: corre este script UNA vez en el SQL
-- Editor de Supabase. Refleja exactamente el cambio de `pedidos` y `tiendas`
-- en el schema. Después: `npx prisma generate`.
--
-- `pedidos.comprobante` ya existía (boleta/factura/ninguno). Faltaban los
-- datos del adquiriente para que el vendedor pueda emitirlo ante SUNAT:
--   - boleta: DNI/CE (obligatorio desde S/ 700)
--   - factura: RUC + razón social + dirección fiscal
-- Se guardan como snapshot en el pedido (no en `clientes`): un mismo cliente
-- puede pedir boleta a su nombre y factura a nombre de su empresa.
--
-- `tiendas.emite_factura`: los negocios del Nuevo RUS solo emiten boletas;
-- con false el storefront no ofrece factura.
--
-- Todas nullable / con default: los pedidos anteriores no se ven afectados.
-- ============================================================================

ALTER TABLE "pedidos"
  ADD COLUMN IF NOT EXISTS "comprobante_doc_tipo" VARCHAR(10),
  ADD COLUMN IF NOT EXISTS "comprobante_doc_numero" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "razon_social" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "direccion_fiscal" TEXT;

ALTER TABLE "tiendas"
  ADD COLUMN IF NOT EXISTS "emite_factura" BOOLEAN NOT NULL DEFAULT true;
