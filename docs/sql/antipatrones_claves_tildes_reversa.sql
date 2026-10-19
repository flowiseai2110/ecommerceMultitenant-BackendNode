-- ============================================================================
-- Reversa de antipatrones_claves_tildes.sql
-- ----------------------------------------------------------------------------
-- Quita solo las traducciones que copió ese archivo (marcadas con
-- usuario_registro = 'antipatrones-tildes' y sin editar después). Las de la
-- clave vieja nunca se tocaron. Las claves de `textos_claves` se quedan: las
-- maneja el backend al arrancar (si vuelve el código anterior, las marca obsoletas).
-- ============================================================================

BEGIN;

DELETE FROM "tienda_textos"
WHERE "usuario_registro" = 'antipatrones-tildes'
  AND "fecha_actualizacion" IS NULL;

COMMIT;
