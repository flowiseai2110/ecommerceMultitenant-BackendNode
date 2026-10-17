-- ============================================================================
-- TRANSMISIÓN DE EVENTOS — Medición de cortes (calidad que vio cada invitado)
-- Spec: docs/specs/transmision-eventos/investigacion-calidad.md (punto 4)
-- ----------------------------------------------------------------------------
-- Correr en el SQL Editor de Supabase ANTES de desplegar el backend que las usa.
-- Después: `npx prisma generate`. Se puede correr más de una vez.
--
-- El reproductor del invitado mide los segundos que el video se quedó esperando
-- (sin contar la carga inicial ni las pausas del propio invitado), los segundos
-- que vio y cuántas veces se cortó, y los manda con el latido de cada 30 s.
-- ============================================================================

BEGIN;

ALTER TABLE evento_invitaciones
  DROP COLUMN IF EXISTS pausa_seg, DROP COLUMN IF EXISTS visto_seg,
  DROP COLUMN IF EXISTS cortes, DROP COLUMN IF EXISTS ultimo_corte_en;

ALTER TABLE "evento_invitaciones"
  ADD COLUMN "pausa_seg" DECIMAL(10,1) NOT NULL DEFAULT 0,
  ADD COLUMN "visto_seg" DECIMAL(10,1) NOT NULL DEFAULT 0,
  ADD COLUMN "cortes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ultimo_corte_en" TIMESTAMPTZ;

ALTER TABLE evento_invitaciones
  ADD CONSTRAINT invitacion_calidad_valida CHECK (pausa_seg >= 0 AND visto_seg >= 0 AND cortes >= 0);

COMMIT;
