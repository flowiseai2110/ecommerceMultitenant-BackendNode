-- Reversa de campanas_descuento_historial.sql (C2). Borra el historial acumulado.
BEGIN;
DROP TRIGGER IF EXISTS trg_productos_precio_historial ON public.productos;
DROP TRIGGER IF EXISTS trg_variantes_precio_historial ON public.producto_variantes;
DROP TABLE IF EXISTS public.producto_precio_historial;
DROP FUNCTION IF EXISTS public.precio_historial_producto();
DROP FUNCTION IF EXISTS public.precio_historial_variante();
DROP FUNCTION IF EXISTS public.precio_historial_inmutable();
COMMIT;
