-- ============================================================================
-- campanas-descuento C3 (R4, R5, R9): promoción por porcentaje de una campaña.
-- La campaña sigue en tienda_configuraciones (clave "campanas"); se liga por su id
-- UUID (sin FK: vive en JSON). Si la campaña se borra, el backend borra su promoción.
-- Correr ANTES del backend de C3a. Idempotente. Tablas vacías: no afecta a nadie.
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.campana_promociones (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id             uuid NOT NULL REFERENCES public.tiendas(id) ON DELETE CASCADE,
  campana_id            uuid NOT NULL,
  porcentaje            smallint NOT NULL CHECK (porcentaje BETWEEN 1 AND 90),
  alcance               varchar(12) NOT NULL CHECK (alcance IN ('tienda','categorias','productos')),
  permitir_cupones      boolean NOT NULL DEFAULT false,
  permitir_envio_gratis boolean NOT NULL DEFAULT false,
  version               integer NOT NULL DEFAULT 1,   -- sube con cada cambio de lo que se cobra (R9.5)
  fecha_registro        timestamptz DEFAULT now(),
  usuario_registro      varchar(100),
  fecha_actualizacion   timestamptz,
  usuario_actualizacion varchar(100),
  CONSTRAINT uq_promocion_campana UNIQUE (tienda_id, campana_id)   -- una promoción por campaña (R4.7)
);

CREATE TABLE IF NOT EXISTS public.campana_promocion_categorias (
  promocion_id uuid NOT NULL REFERENCES public.campana_promociones(id) ON DELETE CASCADE,
  tienda_id    uuid NOT NULL REFERENCES public.tiendas(id) ON DELETE CASCADE,
  categoria_id uuid NOT NULL REFERENCES public.categorias(id) ON DELETE CASCADE,
  PRIMARY KEY (promocion_id, categoria_id)
);
CREATE INDEX IF NOT EXISTS idx_promocion_categorias_tienda
  ON public.campana_promocion_categorias (tienda_id, categoria_id);

CREATE TABLE IF NOT EXISTS public.campana_promocion_productos (
  promocion_id uuid NOT NULL REFERENCES public.campana_promociones(id) ON DELETE CASCADE,
  tienda_id    uuid NOT NULL REFERENCES public.tiendas(id) ON DELETE CASCADE,
  producto_id  uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  PRIMARY KEY (promocion_id, producto_id)
);
CREATE INDEX IF NOT EXISTS idx_promocion_productos_tienda
  ON public.campana_promocion_productos (tienda_id, producto_id);

-- Quién confirmó, cuándo y qué (R9.4), para una versión y una ventana exactas (R9.5, R9.6).
CREATE TABLE IF NOT EXISTS public.campana_promocion_confirmaciones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id         uuid NOT NULL REFERENCES public.tiendas(id) ON DELETE CASCADE,
  promocion_id      uuid NULL REFERENCES public.campana_promociones(id) ON DELETE SET NULL,
  campana_id        uuid NOT NULL,
  promocion_version integer NOT NULL,
  ventana_inicio    timestamptz NOT NULL,
  ventana_fin       timestamptz NOT NULL CHECK (ventana_fin > ventana_inicio),
  detalle           jsonb NOT NULL,         -- porcentaje, alcance e ids, permisos, cupón, avisos mostrados
  confirmado_por    varchar(100) NOT NULL,
  confirmado_en     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_confirmacion_version_ventana
  ON public.campana_promocion_confirmaciones (promocion_id, promocion_version, ventana_inicio, ventana_fin);
CREATE INDEX IF NOT EXISTS idx_confirmaciones_tienda
  ON public.campana_promocion_confirmaciones (tienda_id, campana_id, confirmado_en DESC);

-- Registro de auditoría: no se edita. Única excepción: el SET NULL al borrar la promoción.
CREATE OR REPLACE FUNCTION public.confirmaciones_inmutables() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.promocion_id IS NULL
     AND (OLD.id, OLD.tienda_id, OLD.campana_id, OLD.promocion_version, OLD.ventana_inicio,
          OLD.ventana_fin, OLD.detalle, OLD.confirmado_por, OLD.confirmado_en)
         IS NOT DISTINCT FROM
         (NEW.id, NEW.tienda_id, NEW.campana_id, NEW.promocion_version, NEW.ventana_inicio,
          NEW.ventana_fin, NEW.detalle, NEW.confirmado_por, NEW.confirmado_en) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Una confirmación de promoción no se puede modificar';
END $$;
DROP TRIGGER IF EXISTS trg_confirmaciones_inmutables ON public.campana_promocion_confirmaciones;
CREATE TRIGGER trg_confirmaciones_inmutables
  BEFORE UPDATE ON public.campana_promocion_confirmaciones
  FOR EACH ROW EXECUTE FUNCTION public.confirmaciones_inmutables();

-- Cupón de la campaña (R4.8): vence con su promoción; uno por promoción.
ALTER TABLE public.cupones
  ADD COLUMN IF NOT EXISTS campana_promocion_id uuid NULL
  REFERENCES public.campana_promociones(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cupon_promocion
  ON public.cupones (campana_promocion_id) WHERE campana_promocion_id IS NOT NULL;

-- RLS sin políticas: solo el backend (service role).
ALTER TABLE public.campana_promociones              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campana_promocion_categorias     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campana_promocion_productos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campana_promocion_confirmaciones ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Verificación (solo lectura): las cuatro tablas vacías y la columna del cupón.
-- SELECT (SELECT count(*) FROM public.campana_promociones) AS promociones,
--        (SELECT count(*) FROM public.campana_promocion_confirmaciones) AS confirmaciones,
--        (SELECT count(*) FROM information_schema.columns
--          WHERE table_name = 'cupones' AND column_name = 'campana_promocion_id') AS columna_cupon;
