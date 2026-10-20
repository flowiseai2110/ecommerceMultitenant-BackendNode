-- Reversa de campanas_ediciones.sql. Antes de correrla, guardar las ediciones
-- cargadas (se pierden): SELECT * FROM campana_ediciones; y su historial.
-- Correr DESPUÉS de volver al backend anterior (el nuevo las lee).
BEGIN;
DROP TABLE IF EXISTS "campana_ediciones_historial";
DROP TABLE IF EXISTS "campana_ediciones";
COMMIT;
