-- ============================================================================
-- campanas-descuento C2 (R10.4): historial del precio regular de productos y variantes.
-- Lo llenan triggers: ningún camino de escritura se lo salta (admin, variantes,
-- estrategias de rubro, SQL a mano). Base del aviso de Indecopi (R10.2).
-- Correr ANTES del backend de C2. Idempotente.
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.producto_precio_historial (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id       uuid NOT NULL REFERENCES public.tiendas(id) ON DELETE CASCADE,
  producto_id     uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  variante_id     uuid NULL REFERENCES public.producto_variantes(id) ON DELETE CASCADE,
  precio_anterior numeric(10,2) NULL,              -- NULL en 'alta' y 'linea_base'
  precio_nuevo    numeric(10,2) NULL,              -- variante: NULL = usa el precio del producto
  motivo          varchar(20) NOT NULL CHECK (motivo IN ('alta','cambio','linea_base')),
  usuario         varchar(100) NULL,
  fecha           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_precio_historial_producto
  ON public.producto_precio_historial (tienda_id, producto_id, fecha DESC);

CREATE OR REPLACE FUNCTION public.precio_historial_producto() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO producto_precio_historial (tienda_id, producto_id, precio_nuevo, motivo, usuario)
    VALUES (NEW.tienda_id, NEW.id, NEW.precio_base, 'alta', NEW.usuario_registro);
  ELSIF NEW.precio_base IS DISTINCT FROM OLD.precio_base THEN
    INSERT INTO producto_precio_historial (tienda_id, producto_id, precio_anterior, precio_nuevo, motivo, usuario)
    VALUES (NEW.tienda_id, NEW.id, OLD.precio_base, NEW.precio_base, 'cambio',
            COALESCE(NEW.usuario_actualizacion, NEW.usuario_registro));
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.precio_historial_variante() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_tienda uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.precio IS NOT DISTINCT FROM OLD.precio THEN RETURN NEW; END IF;
  SELECT tienda_id INTO v_tienda FROM productos WHERE id = NEW.producto_id;
  INSERT INTO producto_precio_historial (tienda_id, producto_id, variante_id, precio_anterior, precio_nuevo, motivo, usuario)
  VALUES (v_tienda, NEW.producto_id, NEW.id,
          CASE WHEN TG_OP = 'UPDATE' THEN OLD.precio END, NEW.precio,
          CASE WHEN TG_OP = 'INSERT' THEN 'alta' ELSE 'cambio' END,
          COALESCE(NEW.usuario_actualizacion, NEW.usuario_registro));
  RETURN NEW;
END $$;

-- Solo se agrega: un registro de Indecopi no se edita. (DELETE sí: llega por cascada al borrar el producto.)
CREATE OR REPLACE FUNCTION public.precio_historial_inmutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'El historial de precios no se puede modificar';
END $$;

DROP TRIGGER IF EXISTS trg_productos_precio_historial ON public.productos;
CREATE TRIGGER trg_productos_precio_historial
  AFTER INSERT OR UPDATE OF precio_base ON public.productos
  FOR EACH ROW EXECUTE FUNCTION public.precio_historial_producto();

DROP TRIGGER IF EXISTS trg_variantes_precio_historial ON public.producto_variantes;
CREATE TRIGGER trg_variantes_precio_historial
  AFTER INSERT OR UPDATE OF precio ON public.producto_variantes
  FOR EACH ROW EXECUTE FUNCTION public.precio_historial_variante();

DROP TRIGGER IF EXISTS trg_precio_historial_inmutable ON public.producto_precio_historial;
CREATE TRIGGER trg_precio_historial_inmutable
  BEFORE UPDATE ON public.producto_precio_historial
  FOR EACH ROW EXECUTE FUNCTION public.precio_historial_inmutable();

-- Línea base: el precio de hoy de lo que ya existe (desde aquí corren los 30 días).
INSERT INTO public.producto_precio_historial (tienda_id, producto_id, precio_nuevo, motivo, usuario)
SELECT p.tienda_id, p.id, p.precio_base, 'linea_base', 'sistema'
FROM public.productos p
WHERE NOT EXISTS (SELECT 1 FROM public.producto_precio_historial h
                  WHERE h.producto_id = p.id AND h.variante_id IS NULL);

INSERT INTO public.producto_precio_historial (tienda_id, producto_id, variante_id, precio_nuevo, motivo, usuario)
SELECT p.tienda_id, v.producto_id, v.id, v.precio, 'linea_base', 'sistema'
FROM public.producto_variantes v JOIN public.productos p ON p.id = v.producto_id
WHERE NOT EXISTS (SELECT 1 FROM public.producto_precio_historial h WHERE h.variante_id = v.id);

-- RLS sin políticas: solo el backend (service role) la lee y escribe.
ALTER TABLE public.producto_precio_historial ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Verificación (solo lectura): una fila por producto y variante.
-- SELECT motivo, count(*) FROM public.producto_precio_historial GROUP BY motivo;
