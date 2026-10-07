-- ============================================================================
-- LIBRO DE RECLAMACIONES — nombres y apellidos hasta 150 caracteres
-- ----------------------------------------------------------------------------
-- Solo si libro_reclamaciones_setup.sql YA se corrió con VARCHAR(100).
-- Si aún no se corrió, no hace falta: el setup ya trae VARCHAR(150).
-- Ampliar un VARCHAR no reescribe filas ni dispara el trigger de inmutabilidad.
-- ============================================================================

ALTER TABLE "libro_reclamaciones"
  ALTER COLUMN "consumidor_nombres"   TYPE VARCHAR(150),
  ALTER COLUMN "consumidor_apellidos" TYPE VARCHAR(150);
