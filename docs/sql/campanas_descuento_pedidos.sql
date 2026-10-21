-- campanas-descuento C6 (R8.3): de qué campaña vino el descuento de cada línea.
-- Se suma al snapshot de precio-en-servidor (precio_regular, precio_origen). Sin FK: es una foto.
-- Correr ANTES del backend de C6. Idempotente: se puede correr dos veces.
BEGIN;
ALTER TABLE public.pedido_detalles
  ADD COLUMN IF NOT EXISTS campana_id           uuid,
  ADD COLUMN IF NOT EXISTS campana_nombre       varchar(120),
  ADD COLUMN IF NOT EXISTS promocion_porcentaje smallint;
COMMENT ON COLUMN public.pedido_detalles.precio_origen IS
  'De dónde salió precio_unitario: regular | oferta | campana. NULL = pedido anterior a precio-en-servidor.';
COMMENT ON COLUMN public.pedido_detalles.campana_id IS
  'Campaña cuya promoción fijó el precio (origen campana). NULL en los demás casos.';
COMMIT;

-- Verificación (solo lectura): las tres columnas nuevas.
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'pedido_detalles'
--    AND column_name IN ('campana_id', 'campana_nombre', 'promocion_porcentaje');
