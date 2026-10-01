-- ============================================================================
-- ASESOR IA — Búsqueda de productos tolerante a typos
-- ----------------------------------------------------------------------------
-- Correr una sola vez en el SQL Editor de Supabase (idempotente).
-- No toca schema.prisma ni requiere `prisma generate`.
--
-- La búsqueda de `buscar_productos` usa el full-text search de Postgres con la
-- config `spanish` (viene de fábrica: su stemmer ya une plural/singular y
-- quita tildes). pg_trgm agrega la tolerancia a errores de tipeo
-- ("sapatilla", "mujeres" vs "Mujer") vía word_similarity().
--
-- Sin índice a propósito: con ~150 productos por tienda el cálculo al vuelo
-- cuesta milisegundos, y un índice GIN no declarado en schema.prisma lo
-- borraría `prisma db push`.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
