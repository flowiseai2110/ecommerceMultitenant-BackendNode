-- Reversa de campanas_descuento_promociones.sql (C3a). Correr DESPUÉS de revertir
-- el backend. Borra promociones, confirmaciones y cupones de campaña.
BEGIN;
DROP INDEX IF EXISTS public.uq_cupon_promocion;
-- Idempotente: si la columna ya no existe, no hay cupones de campaña que borrar.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'cupones' AND column_name = 'campana_promocion_id') THEN
    DELETE FROM public.cupones WHERE campana_promocion_id IS NOT NULL;
  END IF;
END $$;
ALTER TABLE public.cupones DROP COLUMN IF EXISTS campana_promocion_id;
DROP TABLE IF EXISTS public.campana_promocion_confirmaciones;
DROP TABLE IF EXISTS public.campana_promocion_productos;
DROP TABLE IF EXISTS public.campana_promocion_categorias;
DROP TABLE IF EXISTS public.campana_promociones;
DROP FUNCTION IF EXISTS public.confirmaciones_inmutables();
COMMIT;
