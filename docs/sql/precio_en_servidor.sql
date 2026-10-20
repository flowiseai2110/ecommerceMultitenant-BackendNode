-- precio-en-servidor (ADR-0001 punto 5): snapshot del precio por línea del pedido.
-- Idempotente. Correr en Supabase ANTES de desplegar el backend (docs/specs/precio-en-servidor/impacto.md).
ALTER TABLE public.pedido_detalles
  ADD COLUMN IF NOT EXISTS precio_regular numeric(10,2),
  ADD COLUMN IF NOT EXISTS precio_origen  varchar(20);

COMMENT ON COLUMN public.pedido_detalles.precio_regular IS
  'Precio regular (referencia/tachado) al crear el pedido. NULL = pedido anterior a precio-en-servidor.';
COMMENT ON COLUMN public.pedido_detalles.precio_origen IS
  'De dónde salió precio_unitario: regular | oferta (campanas-descuento agrega campana). NULL = pedido anterior.';

-- Verificación (solo lectura): cupones de porcentaje mayores a 100 %.
SELECT t.slug, c.codigo, c.valor
FROM public.cupones c JOIN public.tiendas t ON t.id = c.tienda_id
WHERE c.tipo = 'porcentaje' AND c.valor > 100;
