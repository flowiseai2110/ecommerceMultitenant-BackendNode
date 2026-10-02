-- ============================================================================
-- PRODUCTO IMÁGENES — Foto por valor de la opción principal
-- ----------------------------------------------------------------------------
-- Reemplaza a producto_imagenes_color.sql: la columna "color" pasa a llamarse
-- "valor_opcion" porque no todo producto distingue sus fotos por color (un
-- peluche las distingue por personaje, un plato por diseño).
--
-- Correr una sola vez en el SQL Editor de Supabase (idempotente) ANTES de
-- desplegar el backend que lo usa. Después: `npx prisma generate`.
-- Sirve tanto si ya se corrió producto_imagenes_color.sql (renombra) como si
-- no (crea la columna).
--
-- Modelo de opciones y variantes (ver modules/catalogo/producto-opciones.js):
-- - productos.metadata.opciones define las opciones en orden. La PRIMERA es la
--   opción principal ("padre"): la que cambia cómo se ve el producto.
-- - Cada variante es una combinación de valores (producto_variantes.atributos).
-- - Cada foto pertenece a un valor de la opción principal (valor_opcion).
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'producto_imagenes' AND column_name = 'color'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'producto_imagenes' AND column_name = 'valor_opcion'
  ) THEN
    ALTER TABLE "producto_imagenes" RENAME COLUMN "color" TO "valor_opcion";
  END IF;
END $$;

ALTER TABLE "producto_imagenes" ADD COLUMN IF NOT EXISTS "valor_opcion" VARCHAR(30);

COMMENT ON COLUMN "producto_imagenes"."valor_opcion" IS
  'Valor de la opción principal del producto (la primera de productos.metadata.opciones) al que pertenece la foto. Ej: "negro" si la opción principal es Color (valor de la paleta COLORES_PRODUCTO), "Stitch" si es Personaje, "Floral" si es Diseño. NULL = foto general, se muestra con cualquier valor. La tienda filtra la galería con esto al elegir el valor y lo usa como miniatura del valor.';

COMMENT ON COLUMN "producto_variantes"."atributos" IS
  'Combinación de valores que define la variante, una clave por opción del producto: {"color": "negro", "talla": "40 US"}. La clave sale del nombre de la opción en minúsculas y sin tildes (la de color siempre es "color"). NULL en variantes antiguas de nombre libre.';

COMMENT ON COLUMN "productos"."metadata" IS
  'Datos extra del producto en JSON. metadata.opciones = [{nombre, tipo: "color"|"texto", valores[]}] define las opciones de variante en orden; la primera es la opción principal (sus valores tienen fotos propias).';
