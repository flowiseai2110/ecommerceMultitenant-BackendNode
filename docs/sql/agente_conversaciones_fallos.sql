-- ============================================================================
-- AGENTE DE VENTAS IA — Contador de fallos consecutivos (Fase 3)
-- ----------------------------------------------------------------------------
-- Corre este script UNA vez en el SQL Editor de Supabase ANTES de desplegar el
-- backend de la Fase 3. Idempotente. Después: `npx prisma generate`.
--
-- Con 2 fallos seguidos (búsqueda sin resultados, error de herramienta,
-- mensaje sin sentido o «no me entiendes») el asesor ofrece pasar con una
-- persona (docs/specs/agente-ventas/spec.md, R8.2). Un turno con productos lo
-- reinicia.
-- ============================================================================

ALTER TABLE "agente_conversaciones"
  ADD COLUMN IF NOT EXISTS "fallos" INTEGER NOT NULL DEFAULT 0;

-- Verificación:
--   SELECT fallos FROM agente_conversaciones LIMIT 1;   -- sin error
