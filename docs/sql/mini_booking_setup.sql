-- ============================================================================
-- MINI BOOKING — Fase 1 (hotel / hostal + núcleo de reservas)
-- Spec: docs/specs/mini-booking
-- ----------------------------------------------------------------------------
-- Correr UNA vez en el SQL Editor de Supabase. El DDL (sección 1) se generó con
-- `prisma migrate diff` desde el schema, así que es IDÉNTICO al que Prisma
-- espera (sin drift). Después: `npx prisma generate`.
-- ============================================================================

-- 0) Normalizar tipo_negocio antes del CHECK de la sección 2 --------------------
-- La columna existía como texto libre (default 'productos') y nunca se usó.
UPDATE tiendas SET tipo_negocio = 'productos'
WHERE tipo_negocio IS NULL OR tipo_negocio NOT IN ('productos', 'hotel', 'tours', 'eventos');

-- 1) Tablas y columnas (DDL exacto de Prisma) ----------------------------------
-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "fecha_servicio" TIMESTAMPTZ,
ADD COLUMN     "idempotency_key" UUID,
ADD COLUMN     "monto_pagado" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tipo" VARCHAR(10) NOT NULL DEFAULT 'compra';

-- CreateTable
CREATE TABLE "config_reservas" (
    "tienda_id" UUID NOT NULL,
    "modo_confirmacion" VARCHAR(12) NOT NULL DEFAULT 'solicitud',
    "cobro" VARCHAR(10) NOT NULL DEFAULT 'total',
    "adelanto_pct" INTEGER,
    "anticipacion_min_horas" INTEGER NOT NULL DEFAULT 0,
    "aviso_proximo_horas" INTEGER,
    "aviso_proximo_texto" VARCHAR(300),
    "max_solicitudes_abiertas" INTEGER NOT NULL DEFAULT 3,
    "instrucciones" TEXT,
    "politica_cancelacion" TEXT,
    "hora_checkin" VARCHAR(5) NOT NULL DEFAULT '14:00',
    "hora_checkout" VARCHAR(5) NOT NULL DEFAULT '12:00',
    "comprobante_en" VARCHAR(14) NOT NULL DEFAULT 'al_pagar',
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "config_reservas_pkey" PRIMARY KEY ("tienda_id")
);

-- CreateTable
CREATE TABLE "cierres_fecha" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "producto_id" UUID,
    "fecha_desde" DATE NOT NULL,
    "fecha_hasta" DATE NOT NULL,
    "motivo" VARCHAR(100),
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),

    CONSTRAINT "cierres_fecha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_tipos_habitacion" (
    "producto_id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "capacidad_adultos" INTEGER NOT NULL DEFAULT 2,
    "capacidad_ninos" INTEGER NOT NULL DEFAULT 0,
    "capacidad_max" INTEGER NOT NULL DEFAULT 2,
    "por_persona" BOOLEAN NOT NULL DEFAULT false,
    "camas" VARCHAR(100),
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "hotel_tipos_habitacion_pkey" PRIMARY KEY ("producto_id")
);

-- CreateTable
CREATE TABLE "hotel_modalidades" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "tipo" VARCHAR(6) NOT NULL,
    "horas" INTEGER,
    "precio" DECIMAL(10,2) NOT NULL,
    "precio_vie_sab" DECIMAL(10,2),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "hotel_modalidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservas" (
    "pedido_id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "tipo" VARCHAR(5) NOT NULL,
    "producto_id" UUID NOT NULL,
    "modalidad_id" UUID,
    "inicio" TIMESTAMPTZ NOT NULL,
    "fin" TIMESTAMPTZ,
    "noches" INTEGER,
    "horas" INTEGER,
    "adultos" INTEGER,
    "ninos" INTEGER,
    "pasajeros" JSONB,
    "titular_nombres" VARCHAR(100) NOT NULL,
    "titular_apellidos" VARCHAR(100) NOT NULL,
    "titular_doc_tipo" VARCHAR(10) NOT NULL,
    "titular_doc_numero" VARCHAR(20) NOT NULL,
    "titular_nacionalidad" VARCHAR(2) NOT NULL,
    "titular_nacimiento" DATE,
    "acompanantes" JSONB,
    "comentarios" TEXT,
    "acepta_datos" BOOLEAN NOT NULL,
    "respondida_en" TIMESTAMPTZ,
    "motivo_rechazo" VARCHAR(200),
    "ajuste_monto" DECIMAL(10,2),
    "ajuste_motivo" VARCHAR(200),
    "monto_a_pagar" DECIMAL(10,2) NOT NULL,
    "saldo_destino" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "reservas_pkey" PRIMARY KEY ("pedido_id")
);

-- CreateIndex
CREATE INDEX "idx_cierres_tienda_rango" ON "cierres_fecha"("tienda_id", "fecha_desde", "fecha_hasta");

-- CreateIndex
CREATE INDEX "idx_hotel_tipos_tienda" ON "hotel_tipos_habitacion"("tienda_id");

-- CreateIndex
CREATE INDEX "idx_hotel_modalidades_producto" ON "hotel_modalidades"("producto_id");

-- CreateIndex
CREATE INDEX "idx_reservas_tienda_inicio" ON "reservas"("tienda_id", "inicio");

-- CreateIndex
CREATE INDEX "idx_pedidos_tienda_tipo_servicio" ON "pedidos"("tienda_id", "tipo", "fecha_servicio");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_tienda_id_idempotency_key_key" ON "pedidos"("tienda_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "config_reservas" ADD CONSTRAINT "config_reservas_tienda_id_fkey" FOREIGN KEY ("tienda_id") REFERENCES "tiendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierres_fecha" ADD CONSTRAINT "cierres_fecha_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_tipos_habitacion" ADD CONSTRAINT "hotel_tipos_habitacion_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_modalidades" ADD CONSTRAINT "hotel_modalidades_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "hotel_tipos_habitacion"("producto_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_modalidad_id_fkey" FOREIGN KEY ("modalidad_id") REFERENCES "hotel_modalidades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2) Reglas que Prisma no expresa --------------------------------------------
ALTER TABLE tiendas ALTER COLUMN tipo_negocio SET NOT NULL;
ALTER TABLE tiendas
  ADD CONSTRAINT tiendas_tipo_negocio_valido CHECK (tipo_negocio IN ('productos', 'hotel', 'tours', 'eventos'));

ALTER TABLE pedidos
  ADD CONSTRAINT pedidos_tipo_valido CHECK (tipo IN ('compra', 'hotel', 'tour', 'evento')),
  ADD CONSTRAINT pedidos_monto_pagado_positivo CHECK (monto_pagado >= 0);

ALTER TABLE config_reservas
  ADD CONSTRAINT config_modo_valido     CHECK (modo_confirmacion IN ('solicitud', 'pago_directo')),
  ADD CONSTRAINT config_cobro_valido    CHECK (cobro IN ('total', 'adelanto', 'en_destino')),
  ADD CONSTRAINT config_adelanto_valido CHECK (cobro <> 'adelanto' OR adelanto_pct BETWEEN 1 AND 99),
  ADD CONSTRAINT config_anticipacion    CHECK (anticipacion_min_horas BETWEEN 0 AND 720),
  ADD CONSTRAINT config_aviso           CHECK (aviso_proximo_horas IS NULL OR aviso_proximo_horas BETWEEN 1 AND 720),
  ADD CONSTRAINT config_max_abiertas    CHECK (max_solicitudes_abiertas BETWEEN 1 AND 20),
  ADD CONSTRAINT config_horas_validas   CHECK (hora_checkin ~ '^([01]\d|2[0-3]):[0-5]\d$' AND hora_checkout ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  ADD CONSTRAINT config_comprobante     CHECK (comprobante_en IN ('al_pagar', 'en_el_servicio'));

ALTER TABLE cierres_fecha
  ADD CONSTRAINT cierres_rango_valido CHECK (fecha_desde <= fecha_hasta);

ALTER TABLE hotel_tipos_habitacion
  ADD CONSTRAINT hotel_capacidad_valida CHECK (
    capacidad_adultos >= 1 AND capacidad_ninos >= 0 AND capacidad_max >= 1 AND capacidad_max <= 50);

ALTER TABLE hotel_modalidades
  ADD CONSTRAINT hotel_modalidad_valida CHECK (
    (tipo = 'noche' AND horas IS NULL) OR (tipo = 'horas' AND horas BETWEEN 1 AND 23 AND precio_vie_sab IS NULL)),
  ADD CONSTRAINT hotel_modalidad_precio CHECK (precio > 0 AND (precio_vie_sab IS NULL OR precio_vie_sab > 0));
-- Una sola modalidad "noche" y un solo bloque por cantidad de horas, por tipo.
CREATE UNIQUE INDEX uq_hotel_modalidad ON hotel_modalidades (producto_id, tipo, COALESCE(horas, 0));

ALTER TABLE reservas
  ADD CONSTRAINT reservas_tipo_valido     CHECK (tipo IN ('hotel', 'tour')),
  ADD CONSTRAINT reservas_doc_valido      CHECK (titular_doc_tipo IN ('DNI', 'CE', 'PASAPORTE')),
  ADD CONSTRAINT reservas_rango_valido    CHECK (fin IS NULL OR fin > inicio),
  ADD CONSTRAINT reservas_montos_validos  CHECK (monto_a_pagar >= 0 AND saldo_destino >= 0);

-- 3) RLS sin políticas: solo el backend accede ---------------------------------
-- La anon key es pública (va en el storefront): sin RLS cualquiera podría leer
-- los datos del titular (documento, fecha de nacimiento) por la API REST.
ALTER TABLE public.config_reservas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cierres_fecha          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_tipos_habitacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_modalidades      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservas               ENABLE ROW LEVEL SECURITY;

-- 4) Bucket PRIVADO para las capturas de pago ----------------------------------
-- Solo el backend (service key) sube y genera URLs firmadas de corta duración.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('pagos-capturas', 'pagos-capturas', false, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- 5) Verificación (opcional) ---------------------------------------------------
--   SELECT tipo_negocio, COUNT(*) FROM tiendas GROUP BY 1;
--   SELECT id, public FROM storage.buckets WHERE id = 'pagos-capturas';  -- public = false
