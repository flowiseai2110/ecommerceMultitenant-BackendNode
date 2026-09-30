-- ============================================================================
-- CUENTA DE CLIENTE (login con Google en el storefront) — Setup
-- ----------------------------------------------------------------------------
-- Alternativa a `npx prisma db push`: corre este script UNA vez en el SQL
-- Editor de Supabase. Refleja exactamente el cambio de `pedidos` en el schema
-- (columna auth_user_id + índice), así que un futuro `db push` queda en sync.
--
-- Después: `npx prisma generate` para que el cliente Prisma conozca la columna.
--
-- La columna es nullable: los pedidos de invitado (sin login) siguen igual.
-- No hay FK a auth.users a propósito: auth vive en otro schema gestionado por
-- Supabase y borrar un usuario no debe tocar el historial de pedidos.
-- ============================================================================

ALTER TABLE "pedidos" ADD COLUMN "auth_user_id" UUID;

CREATE INDEX "idx_pedidos_tienda_auth_user"
  ON "pedidos"("tienda_id", "auth_user_id", "fecha_registro" DESC);
