-- ============================================================================
-- ALQUILER DE LOCALES — Fase 2 (cambios, devoluciones y día del evento)
-- Spec: docs/specs/alquiler-locales · Plan: plan.md · Tareas: tasks.md (L2.1)
-- ----------------------------------------------------------------------------
-- Correr en el SQL Editor de Supabase DESPUÉS de locales_fase_1.sql. Se puede
-- correr más de una vez: la sección 0 borra lo que haya dejado un intento
-- anterior y la sección 1 lo vuelve a crear. Después: `npx prisma generate`.
--
-- No toca hoteles, tours, eventos ni locales de la fase 1 (salones, turnos,
-- paquetes, ocupaciones, cotizaciones, cuotas, cambios). Solo agrega tablas
-- nuevas para reprogramación/cancelación (reserva_devoluciones), día del
-- evento (reserva_liquidaciones), visitas (local_visitas), lista de espera
-- (local_lista_espera) y el registro del job de recordatorios (job_corridas).
-- ============================================================================

BEGIN;

-- 0) Limpieza de un intento anterior -------------------------------------------
DROP TABLE IF EXISTS job_corridas         CASCADE;
DROP TABLE IF EXISTS local_lista_espera   CASCADE;
DROP TABLE IF EXISTS local_visitas        CASCADE;
DROP TABLE IF EXISTS reserva_liquidaciones CASCADE;
DROP TABLE IF EXISTS reserva_devoluciones CASCADE;

-- 1) Tablas y columnas (DDL de Prisma) ------------------------------------------
-- CreateTable
CREATE TABLE "reserva_devoluciones" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "pedido_id" UUID NOT NULL,
    "pago_id" UUID,
    "motivo" VARCHAR(20) NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "medio" VARCHAR(12) NOT NULL,
    "estado" VARCHAR(12) NOT NULL DEFAULT 'pendiente',
    "constancia_path" VARCHAR(300),
    "vence_en" DATE,
    "hecha_en" TIMESTAMPTZ,
    "idempotency_key" UUID,
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "reserva_devoluciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reserva_liquidaciones" (
    "pedido_id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "entrega_en" TIMESTAMPTZ,
    "inventario" JSONB,
    "novedades" JSONB NOT NULL DEFAULT '[]',
    "cierre_en" TIMESTAMPTZ,
    "garantia_recibida" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_cargos" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "garantia_estado" VARCHAR(12) NOT NULL DEFAULT 'en_custodia',
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "reserva_liquidaciones_pkey" PRIMARY KEY ("pedido_id")
);

-- CreateTable
CREATE TABLE "local_visitas" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "cotizacion_id" UUID,
    "fecha_hora" TIMESTAMPTZ NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "whatsapp" VARCHAR(20) NOT NULL,
    "email" VARCHAR(100),
    "estado" VARCHAR(12) NOT NULL DEFAULT 'solicitada',
    "nota" VARCHAR(300),
    "recordatorio_en" TIMESTAMPTZ,
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "local_visitas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "local_lista_espera" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "desde" DATE NOT NULL,
    "hasta" DATE NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "whatsapp" VARCHAR(20),
    "pedido_id" UUID,
    "avisado_en" TIMESTAMPTZ,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),

    CONSTRAINT "local_lista_espera_pkey" PRIMARY KEY ("id")
);

-- CreateTable (global, sin tienda_id: una corrida sirve a todas las tiendas)
CREATE TABLE "job_corridas" (
    "nombre" VARCHAR(40) NOT NULL,
    "ultima_corrida" TIMESTAMPTZ NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "detalle" JSONB,

    CONSTRAINT "job_corridas_pkey" PRIMARY KEY ("nombre")
);

-- CreateIndex
CREATE INDEX "idx_reserva_devoluciones_pedido" ON "reserva_devoluciones"("pedido_id");

-- CreateIndex
CREATE INDEX "idx_reserva_devoluciones_estado" ON "reserva_devoluciones"("tienda_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "reserva_devoluciones_tienda_id_idempotency_key_key" ON "reserva_devoluciones"("tienda_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "idx_reserva_liquidaciones_tienda" ON "reserva_liquidaciones"("tienda_id", "garantia_estado");

-- CreateIndex
CREATE INDEX "idx_local_visitas_salon" ON "local_visitas"("producto_id", "fecha_hora");

-- CreateIndex
CREATE INDEX "idx_local_visitas_tienda" ON "local_visitas"("tienda_id", "estado");

-- CreateIndex
CREATE INDEX "idx_local_lista_espera_salon" ON "local_lista_espera"("producto_id", "desde", "hasta") WHERE activo;

-- AddForeignKey
ALTER TABLE "reserva_devoluciones" ADD CONSTRAINT "reserva_devoluciones_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva_devoluciones" ADD CONSTRAINT "reserva_devoluciones_pago_id_fkey" FOREIGN KEY ("pago_id") REFERENCES "pagos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva_liquidaciones" ADD CONSTRAINT "reserva_liquidaciones_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_visitas" ADD CONSTRAINT "local_visitas_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "local_salones"("producto_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_visitas" ADD CONSTRAINT "local_visitas_cotizacion_id_fkey" FOREIGN KEY ("cotizacion_id") REFERENCES "local_cotizaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_lista_espera" ADD CONSTRAINT "local_lista_espera_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "local_salones"("producto_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_lista_espera" ADD CONSTRAINT "local_lista_espera_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2) Reglas que Prisma no expresa --------------------------------------------
ALTER TABLE reserva_devoluciones
  ADD CONSTRAINT reserva_devolucion_monto  CHECK (monto > 0),
  ADD CONSTRAINT reserva_devolucion_motivo CHECK (motivo IN ('cancelacion', 'garantia', 'rechazo', 'doble_cobro', 'diferencia')),
  ADD CONSTRAINT reserva_devolucion_medio  CHECK (medio IN ('pasarela', 'manual')),
  ADD CONSTRAINT reserva_devolucion_estado CHECK (estado IN ('pendiente', 'hecha'));

ALTER TABLE reserva_liquidaciones
  ADD CONSTRAINT reserva_liquidacion_garantia CHECK (garantia_recibida >= 0),
  ADD CONSTRAINT reserva_liquidacion_cargos   CHECK (total_cargos >= 0),
  ADD CONSTRAINT reserva_liquidacion_estado   CHECK (garantia_estado IN ('en_custodia', 'por_devolver', 'devuelta', 'aplicada'));

ALTER TABLE local_visitas
  ADD CONSTRAINT local_visita_estado CHECK (estado IN ('solicitada', 'confirmada', 'realizada', 'no_asistio', 'cancelada'));

ALTER TABLE local_lista_espera
  ADD CONSTRAINT local_lista_espera_rango CHECK (hasta >= desde);

-- 3) RLS sin políticas: solo el backend accede ---------------------------------
ALTER TABLE public.reserva_devoluciones  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reserva_liquidaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_visitas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_lista_espera    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_corridas          ENABLE ROW LEVEL SECURITY;

COMMIT;
