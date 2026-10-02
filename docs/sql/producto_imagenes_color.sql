-- ============================================================================
-- REEMPLAZADO por producto_imagenes_valor_opcion.sql (la columna se renombra
-- a valor_opcion). Se conserva como historial: ya se corrió en Supabase.
-- ----------------------------------------------------------------------------
-- PRODUCTO IMÁGENES — Color de la imagen
-- ----------------------------------------------------------------------------
-- Correr una sola vez en el SQL Editor de Supabase (idempotente) ANTES de
-- desplegar el backend que lo usa. Después: `npx prisma generate`.
-- (Prisma lee todas las columnas de producto_imagenes en el CRUD genérico: sin
-- esta columna fallan las consultas de imágenes.)
--
-- Asocia una foto a un valor de la paleta fija de colores (COLORES_PRODUCTO en
-- productos.schema.js). NULL = foto general del producto, se ve con cualquier
-- color. El storefront cambia la galería al elegir un color y usa la foto como
-- muestra del color; el asesor IA muestra la foto del color que pidió el cliente.
-- ============================================================================

ALTER TABLE "producto_imagenes" ADD COLUMN IF NOT EXISTS "color" VARCHAR(30);
