-- Reversa de precio_en_servidor.sql. Correr DESPUÉS de revertir el backend.
ALTER TABLE public.pedido_detalles
  DROP COLUMN IF EXISTS precio_origen,
  DROP COLUMN IF EXISTS precio_regular;
