-- ============================================================================
-- RECEPCIÓN — Fase 1 (habitaciones físicas, estadías del mostrador, cobros)
-- Spec: docs/specs/recepcion/spec.md
-- ----------------------------------------------------------------------------
-- Correr UNA vez en el SQL Editor de Supabase. Solo crea tablas nuevas: no
-- cambia nada de las tiendas existentes. La sección 1 se generó con
-- `prisma migrate diff`, así que es IDÉNTICA a lo que Prisma espera.
-- Después: `npx prisma generate`.
-- ============================================================================

BEGIN;

-- 1) Tablas (DDL exacto de Prisma) ---------------------------------------------
-- CreateTable
CREATE TABLE "hotel_habitaciones" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "numero" VARCHAR(20) NOT NULL,
    "piso" VARCHAR(20),
    "orden" INTEGER NOT NULL DEFAULT 0,
    "estado" VARCHAR(14) NOT NULL DEFAULT 'activa',
    "limpieza" VARCHAR(12) NOT NULL DEFAULT 'limpia',
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "hotel_habitaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_estadias" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "habitacion_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "modalidad" VARCHAR(6) NOT NULL,
    "inicio" TIMESTAMPTZ NOT NULL,
    "fin" TIMESTAMPTZ NOT NULL,
    "salida" TIMESTAMPTZ,
    "estado" VARCHAR(10) NOT NULL DEFAULT 'en_curso',
    "cargos" JSONB NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "pagado" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "personas" INTEGER,
    "huesped_doc_tipo" VARCHAR(10),
    "huesped_doc_numero" VARCHAR(20),
    "huesped_nombre" VARCHAR(150),
    "motivo_anulacion" VARCHAR(200),
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "hotel_estadias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_cobros" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "estadia_id" UUID NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "forma_pago" VARCHAR(10) NOT NULL,
    "concepto" VARCHAR(100) NOT NULL,
    "fecha" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario" VARCHAR(100),

    CONSTRAINT "hotel_cobros_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_hotel_habitaciones_tipo" ON "hotel_habitaciones"("producto_id");

-- CreateIndex
CREATE UNIQUE INDEX "hotel_habitaciones_tienda_id_numero_key" ON "hotel_habitaciones"("tienda_id", "numero");

-- CreateIndex
CREATE INDEX "idx_hotel_estadias_tienda_estado" ON "hotel_estadias"("tienda_id", "estado");

-- CreateIndex
CREATE INDEX "idx_hotel_estadias_habitacion" ON "hotel_estadias"("habitacion_id", "inicio");

-- CreateIndex
CREATE INDEX "idx_hotel_cobros_tienda_fecha" ON "hotel_cobros"("tienda_id", "fecha");

-- AddForeignKey
ALTER TABLE "hotel_habitaciones" ADD CONSTRAINT "hotel_habitaciones_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "hotel_tipos_habitacion"("producto_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_estadias" ADD CONSTRAINT "hotel_estadias_habitacion_id_fkey" FOREIGN KEY ("habitacion_id") REFERENCES "hotel_habitaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_cobros" ADD CONSTRAINT "hotel_cobros_estadia_id_fkey" FOREIGN KEY ("estadia_id") REFERENCES "hotel_estadias"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AlterTable
ALTER TABLE "config_reservas" ADD COLUMN     "recepcion_documento" VARCHAR(8) NOT NULL DEFAULT 'noche';

-- 2) Reglas que Prisma no expresa ----------------------------------------------
-- Una habitación tiene a lo más una estadía en curso: dos recepcionistas no
-- pueden meter gente a la misma habitación a la vez.
CREATE UNIQUE INDEX "uq_hotel_estadias_en_curso" ON "hotel_estadias"("habitacion_id") WHERE "estado" = 'en_curso';

ALTER TABLE "hotel_habitaciones"
  ADD CONSTRAINT hotel_habitacion_estado   CHECK ("estado" IN ('activa', 'mantenimiento')),
  ADD CONSTRAINT hotel_habitacion_limpieza CHECK ("limpieza" IN ('limpia', 'por_limpiar'));

ALTER TABLE "hotel_estadias"
  ADD CONSTRAINT hotel_estadia_estado    CHECK ("estado" IN ('en_curso', 'cerrada', 'anulada')),
  ADD CONSTRAINT hotel_estadia_modalidad CHECK ("modalidad" IN ('noche', 'horas')),
  ADD CONSTRAINT hotel_estadia_rango     CHECK ("fin" > "inicio"),
  ADD CONSTRAINT hotel_estadia_montos    CHECK ("total" >= 0 AND "pagado" >= 0);

ALTER TABLE "config_reservas"
  ADD CONSTRAINT config_reservas_recepcion_documento CHECK ("recepcion_documento" IN ('siempre', 'noche', 'nunca'));

ALTER TABLE "hotel_cobros"
  ADD CONSTRAINT hotel_cobro_monto CHECK ("monto" > 0),
  ADD CONSTRAINT hotel_cobro_forma CHECK ("forma_pago" IN ('efectivo', 'yape', 'plin', 'tarjeta'));

-- 3) RLS sin políticas: solo el backend accede ---------------------------------
ALTER TABLE public.hotel_habitaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_estadias     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_cobros       ENABLE ROW LEVEL SECURITY;

COMMIT;
