-- ============================================================================
-- RECEPCIÓN — Fase 3 (llegada de reservas web al mostrador)
-- Spec: docs/specs/recepcion/spec.md (R3.5)
-- ----------------------------------------------------------------------------
-- Correr UNA vez en el SQL Editor de Supabase, después de recepcion_fase_2.sql.
-- Solo agrega una columna nullable con su índice y FK. Generado con
-- `prisma migrate diff`. Después: `npx prisma generate`.
-- (Consumos del mostrador y recibo no necesitan cambios en la base.)
-- ============================================================================

BEGIN;

-- AlterTable
ALTER TABLE "hotel_estadias" ADD COLUMN     "pedido_id" UUID;

-- CreateIndex
CREATE INDEX "idx_hotel_estadias_pedido" ON "hotel_estadias"("pedido_id");

-- AddForeignKey
ALTER TABLE "hotel_estadias" ADD CONSTRAINT "hotel_estadias_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
