-- Reversa de campanas_descuento_pedidos.sql (C6). Correr DESPUÉS de revertir el backend.
-- Las columnas son opcionales y pueden quedarse; quitarlas borra de qué campaña vino
-- el descuento de los pedidos ya creados (el precio cobrado y el regular se conservan).
BEGIN;
ALTER TABLE public.pedido_detalles
  DROP COLUMN IF EXISTS promocion_porcentaje,
  DROP COLUMN IF EXISTS campana_nombre,
  DROP COLUMN IF EXISTS campana_id;
COMMENT ON COLUMN public.pedido_detalles.precio_origen IS
  'De dónde salió precio_unitario: regular | oferta. NULL = pedido anterior a precio-en-servidor.';
COMMIT;
