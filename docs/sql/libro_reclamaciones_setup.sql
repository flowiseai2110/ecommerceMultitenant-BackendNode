-- ============================================================================
-- LIBRO DE RECLAMACIONES — Setup completo (tablas + reglas + inmutabilidad + RLS)
-- Spec: docs/specs/libro-reclamaciones
-- ----------------------------------------------------------------------------
-- Correr UNA vez en el SQL Editor de Supabase. El DDL (sección 1) se generó con
-- `prisma migrate diff` desde el schema, así que es IDÉNTICO al que Prisma
-- espera (sin drift). Después: `npx prisma generate`.
--
-- Las hojas son un documento legal: se conservan al menos 2 años y no se
-- modifican ni se borran. El trigger de la sección 3 lo impone para cualquier
-- cliente (backend, Prisma Studio, SQL Editor).
-- ============================================================================

-- 1) Tablas (DDL exacto de Prisma) -------------------------------------------
-- CreateTable
CREATE TABLE "libro_reclamaciones" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "anio" SMALLINT NOT NULL,
    "correlativo" INTEGER NOT NULL,
    "numero" VARCHAR(15) NOT NULL,
    "tipo" VARCHAR(10) NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    "fecha_limite" DATE NOT NULL,
    "proveedor_nombre" VARCHAR(100) NOT NULL,
    "proveedor_razon_social" VARCHAR(200),
    "proveedor_ruc" VARCHAR(20),
    "proveedor_direccion" TEXT,
    "consumidor_nombres" VARCHAR(150) NOT NULL,
    "consumidor_apellidos" VARCHAR(150) NOT NULL,
    "consumidor_doc_tipo" VARCHAR(10) NOT NULL,
    "consumidor_doc_numero" VARCHAR(20) NOT NULL,
    "consumidor_domicilio" TEXT NOT NULL,
    "consumidor_telefono" VARCHAR(20),
    "consumidor_email" VARCHAR(100) NOT NULL,
    "es_menor" BOOLEAN NOT NULL DEFAULT false,
    "apoderado_nombre" VARCHAR(200),
    "apoderado_doc_tipo" VARCHAR(10),
    "apoderado_doc_numero" VARCHAR(20),
    "bien_tipo" VARCHAR(10) NOT NULL,
    "bien_descripcion" TEXT NOT NULL,
    "monto_reclamado" DECIMAL(10,2),
    "moneda" VARCHAR(3) NOT NULL DEFAULT 'PEN',
    "pedido_id" UUID,
    "numero_pedido_texto" VARCHAR(30),
    "detalle" TEXT NOT NULL,
    "pedido_consumidor" TEXT NOT NULL,
    "medio_respuesta" VARCHAR(10) NOT NULL DEFAULT 'email',
    "acepta_declaracion" BOOLEAN NOT NULL,
    "auth_user_id" UUID,
    "ip_hash" VARCHAR(64),
    "respuesta" TEXT,
    "accion_adoptada" TEXT,
    "fecha_respuesta" TIMESTAMPTZ,
    "respondido_por" VARCHAR(100),
    "fecha_registro" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "libro_reclamaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "libro_reclamaciones_eventos" (
    "id" UUID NOT NULL,
    "hoja_id" UUID NOT NULL,
    "tipo" VARCHAR(30) NOT NULL,
    "detalle" JSONB,
    "usuario" VARCHAR(100),
    "fecha_registro" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "libro_reclamaciones_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_libro_tienda_estado_limite" ON "libro_reclamaciones"("tienda_id", "estado", "fecha_limite");

-- CreateIndex
CREATE INDEX "idx_libro_tienda_fecha" ON "libro_reclamaciones"("tienda_id", "fecha_registro" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "libro_reclamaciones_tienda_id_anio_correlativo_key" ON "libro_reclamaciones"("tienda_id", "anio", "correlativo");

-- CreateIndex
CREATE INDEX "idx_libro_eventos_hoja" ON "libro_reclamaciones_eventos"("hoja_id", "fecha_registro");

-- AddForeignKey
ALTER TABLE "libro_reclamaciones" ADD CONSTRAINT "libro_reclamaciones_tienda_id_fkey" FOREIGN KEY ("tienda_id") REFERENCES "tiendas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "libro_reclamaciones" ADD CONSTRAINT "libro_reclamaciones_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "libro_reclamaciones_eventos" ADD CONSTRAINT "libro_reclamaciones_eventos_hoja_id_fkey" FOREIGN KEY ("hoja_id") REFERENCES "libro_reclamaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- 2) Reglas que Prisma no expresa --------------------------------------------
ALTER TABLE "libro_reclamaciones"
  ADD CONSTRAINT "libro_tipo_valido"       CHECK ("tipo" IN ('reclamo', 'queja')),
  ADD CONSTRAINT "libro_estado_valido"     CHECK ("estado" IN ('pendiente', 'en_atencion', 'respondida')),
  ADD CONSTRAINT "libro_bien_valido"       CHECK ("bien_tipo" IN ('producto', 'servicio')),
  ADD CONSTRAINT "libro_medio_valido"      CHECK ("medio_respuesta" IN ('email', 'domicilio')),
  ADD CONSTRAINT "libro_doc_valido"        CHECK ("consumidor_doc_tipo" IN ('DNI', 'CE', 'PASAPORTE')),
  ADD CONSTRAINT "libro_menor_apoderado"   CHECK (NOT "es_menor" OR ("apoderado_nombre" IS NOT NULL AND "apoderado_doc_numero" IS NOT NULL)),
  ADD CONSTRAINT "libro_monto_positivo"    CHECK ("monto_reclamado" IS NULL OR "monto_reclamado" >= 0),
  ADD CONSTRAINT "libro_respondida_texto"  CHECK ("estado" <> 'respondida' OR ("respuesta" IS NOT NULL AND "fecha_respuesta" IS NOT NULL));

-- 3) Inmutabilidad ------------------------------------------------------------
-- En la hoja solo pueden cambiar el estado, la respuesta y la auditoría.
-- pedido_id queda fuera porque ON DELETE SET NULL lo limpia si se borra el
-- pedido (numero_pedido_texto conserva lo que escribió el consumidor).
CREATE OR REPLACE FUNCTION libro_reclamaciones_inmutable() RETURNS trigger AS $$
DECLARE
  editables text[] := ARRAY['estado', 'respuesta', 'accion_adoptada', 'fecha_respuesta',
                            'respondido_por', 'fecha_actualizacion', 'usuario_actualizacion', 'pedido_id'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las hojas del Libro de Reclamaciones no se pueden borrar (hoja %)', OLD.numero;
  END IF;
  IF (to_jsonb(NEW) - editables) IS DISTINCT FROM (to_jsonb(OLD) - editables) THEN
    RAISE EXCEPTION 'Los datos de la hoja % no se pueden modificar', OLD.numero;
  END IF;
  IF OLD.estado = 'respondida' AND (
       NEW.estado IS DISTINCT FROM OLD.estado
       OR NEW.respuesta IS DISTINCT FROM OLD.respuesta
       OR NEW.accion_adoptada IS DISTINCT FROM OLD.accion_adoptada
       OR NEW.fecha_respuesta IS DISTINCT FROM OLD.fecha_respuesta) THEN
    RAISE EXCEPTION 'La respuesta de la hoja % ya fue enviada y no se puede cambiar', OLD.numero;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_libro_reclamaciones_inmutable"
  BEFORE UPDATE OR DELETE ON "libro_reclamaciones"
  FOR EACH ROW EXECUTE FUNCTION libro_reclamaciones_inmutable();

-- Los eventos son append-only: ni UPDATE ni DELETE.
CREATE OR REPLACE FUNCTION libro_reclamaciones_eventos_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'El historial del Libro de Reclamaciones no se puede modificar';
END $$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_libro_reclamaciones_eventos_append_only"
  BEFORE UPDATE OR DELETE ON "libro_reclamaciones_eventos"
  FOR EACH ROW EXECUTE FUNCTION libro_reclamaciones_eventos_append_only();

-- 4) RLS sin políticas: ni anon ni authenticated acceden directo --------------
-- La anon key es pública (va en el storefront): sin RLS cualquiera podría leer
-- los datos personales de las hojas por la API REST de Supabase.
ALTER TABLE public.libro_reclamaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.libro_reclamaciones_eventos ENABLE ROW LEVEL SECURITY;

-- 5) Verificación (opcional) ---------------------------------------------------
-- Ambas deben fallar sobre una hoja existente:
--   UPDATE libro_reclamaciones SET detalle = 'x' WHERE numero = '00001-2026';
--   DELETE FROM libro_reclamaciones WHERE numero = '00001-2026';
