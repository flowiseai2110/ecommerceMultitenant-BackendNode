-- ============================================================================
-- ALQUILER DE LOCALES — Fase 1 (salón, calendario, solicitud, contrato y plan de pagos)
-- Spec: docs/specs/alquiler-locales · Plan: plan.md · Tareas: tasks.md (L1.1)
-- ----------------------------------------------------------------------------
-- Correr en el SQL Editor de Supabase DESPUÉS de los scripts de mini booking y
-- hospedaje. Se puede correr más de una vez: la sección 0 borra lo que haya
-- dejado un intento anterior y la sección 1 lo vuelve a crear. El DDL de la
-- sección 1 es el de `prisma migrate diff` desde el schema, salvo `franja`,
-- que aquí es una columna generada. Después: `npx prisma generate`.
--
-- ⚠️ Borra los salones, cotizaciones y reservas de locales que existan. No toca
-- hoteles, tours, eventos ni sus reservas.
--
-- La disponibilidad la garantiza la base de datos (CE-01): la restricción de
-- exclusión ex_local_ocupacion impide que dos franjas activas del mismo salón
-- se crucen. Necesita la extensión btree_gist; si no se puede habilitar, el
-- script falla en lugar de seguir sin esa protección.
--
-- No usar `prisma db push` para recrear estas tablas: Prisma no conoce la
-- columna generada ni la restricción de exclusión.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 0) Limpieza de un intento anterior -------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reservas' AND column_name = 'turno_id') THEN
    DELETE FROM pedidos WHERE tipo = 'local';
  END IF;
END $$;

DROP INDEX IF EXISTS uq_pagos_cuota_pagado;
DROP INDEX IF EXISTS idx_pagos_cuota;
ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_cuota_id_fkey;
ALTER TABLE pagos DROP COLUMN IF EXISTS cuota_id;

ALTER TABLE reservas DROP CONSTRAINT IF EXISTS reservas_turno_id_fkey;
ALTER TABLE reservas DROP CONSTRAINT IF EXISTS reservas_paquete_id_fkey;
ALTER TABLE reservas DROP CONSTRAINT IF EXISTS reservas_local_valida;
ALTER TABLE reservas DROP CONSTRAINT IF EXISTS reservas_invitados_validos;
ALTER TABLE reservas
  DROP COLUMN IF EXISTS turno_id, DROP COLUMN IF EXISTS paquete_id, DROP COLUMN IF EXISTS cotizacion_id,
  DROP COLUMN IF EXISTS invitados, DROP COLUMN IF EXISTS tipo_evento, DROP COLUMN IF EXISTS agasajado,
  DROP COLUMN IF EXISTS local, DROP COLUMN IF EXISTS contrato, DROP COLUMN IF EXISTS reprogramaciones,
  DROP COLUMN IF EXISTS saldo_favor_hasta, DROP COLUMN IF EXISTS invitados_confirmados_en;

DROP TABLE IF EXISTS local_cotizaciones CASCADE;
DROP TABLE IF EXISTS reserva_cambios    CASCADE;
DROP TABLE IF EXISTS reserva_cuotas     CASCADE;
DROP TABLE IF EXISTS local_ocupaciones  CASCADE;
DROP TABLE IF EXISTS local_paquetes     CASCADE;
DROP TABLE IF EXISTS local_turnos       CASCADE;
DROP TABLE IF EXISTS local_salones      CASCADE;

ALTER TABLE config_reservas DROP CONSTRAINT IF EXISTS config_locales_validos;
ALTER TABLE config_reservas
  DROP COLUMN IF EXISTS separacion_tipo, DROP COLUMN IF EXISTS separacion_monto, DROP COLUMN IF EXISTS respuesta_horas,
  DROP COLUMN IF EXISTS apartado_horas, DROP COLUMN IF EXISTS saldo_dias_antes, DROP COLUMN IF EXISTS max_cuotas,
  DROP COLUMN IF EXISTS garantia_monto, DROP COLUMN IF EXISTS garantia_devolucion_dias, DROP COLUMN IF EXISTS invitados_confirmar_dias,
  DROP COLUMN IF EXISTS reprogramaciones_max, DROP COLUMN IF EXISTS reprogramacion_min_dias, DROP COLUMN IF EXISTS cargo_reprogramacion,
  DROP COLUMN IF EXISTS politica_tramos, DROP COLUMN IF EXISTS gracia_mora_dias, DROP COLUMN IF EXISTS saldo_favor_meses,
  DROP COLUMN IF EXISTS cotizacion_vigencia_dias, DROP COLUMN IF EXISTS contrato_plantilla, DROP COLUMN IF EXISTS contrato_version,
  DROP COLUMN IF EXISTS proveedores_externos, DROP COLUMN IF EXISTS tarifa_coordinacion, DROP COLUMN IF EXISTS descorche_botella,
  DROP COLUMN IF EXISTS hora_tope, DROP COLUMN IF EXISTS visitas_horario;

-- Los CHECK de tipo se recrean en la sección 2 (con 'locales' / 'local').
UPDATE tiendas SET tipo_negocio = 'productos' WHERE tipo_negocio = 'locales';
ALTER TABLE tiendas  DROP CONSTRAINT IF EXISTS tiendas_tipo_negocio_valido;
ALTER TABLE pedidos  DROP CONSTRAINT IF EXISTS pedidos_tipo_valido;
ALTER TABLE reservas DROP CONSTRAINT IF EXISTS reservas_tipo_valido;

-- 1) Tablas y columnas (DDL de Prisma; `franja` generada) ----------------------
-- AlterTable
ALTER TABLE "pagos" ADD COLUMN     "cuota_id" UUID;

-- AlterTable
ALTER TABLE "config_reservas" ADD COLUMN     "apartado_horas" INTEGER NOT NULL DEFAULT 48,
ADD COLUMN     "cargo_reprogramacion" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "contrato_plantilla" TEXT,
ADD COLUMN     "contrato_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "cotizacion_vigencia_dias" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "descorche_botella" DECIMAL(10,2),
ADD COLUMN     "garantia_devolucion_dias" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "garantia_monto" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "gracia_mora_dias" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "hora_tope" VARCHAR(5) NOT NULL DEFAULT '03:00',
ADD COLUMN     "invitados_confirmar_dias" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "max_cuotas" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "politica_tramos" JSONB,
ADD COLUMN     "proveedores_externos" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reprogramacion_min_dias" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "reprogramaciones_max" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "respuesta_horas" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "saldo_dias_antes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "saldo_favor_meses" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "separacion_monto" DECIMAL(10,2),
ADD COLUMN     "separacion_tipo" VARCHAR(10) NOT NULL DEFAULT 'porcentaje',
ADD COLUMN     "tarifa_coordinacion" DECIMAL(10,2),
ADD COLUMN     "visitas_horario" JSONB;

-- AlterTable
ALTER TABLE "reservas" ADD COLUMN     "agasajado" VARCHAR(120),
ADD COLUMN     "contrato" JSONB,
ADD COLUMN     "cotizacion_id" UUID,
ADD COLUMN     "invitados" INTEGER,
ADD COLUMN     "invitados_confirmados_en" TIMESTAMPTZ,
ADD COLUMN     "local" JSONB,
ADD COLUMN     "paquete_id" UUID,
ADD COLUMN     "reprogramaciones" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "saldo_favor_hasta" TIMESTAMPTZ,
ADD COLUMN     "tipo_evento" VARCHAR(20),
ADD COLUMN     "turno_id" UUID;

-- CreateTable
CREATE TABLE "local_salones" (
    "producto_id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "metros" INTEGER,
    "aforo_maximo" INTEGER NOT NULL,
    "preparacion_min" INTEGER NOT NULL DEFAULT 60,
    "por_horas" BOOLEAN NOT NULL DEFAULT false,
    "precio_hora" DECIMAL(10,2),
    "min_horas" INTEGER,
    "horas_desde" VARCHAR(5),
    "horas_hasta" VARCHAR(5),
    "servicios" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "local_salones_pkey" PRIMARY KEY ("producto_id")
);

-- CreateTable
CREATE TABLE "local_turnos" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "hora_inicio" VARCHAR(5) NOT NULL,
    "hora_fin" VARCHAR(5) NOT NULL,
    "dias_semana" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6, 7]::INTEGER[],
    "precios" JSONB NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "local_turnos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "local_paquetes" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "descripcion" VARCHAR(300),
    "modalidad" VARCHAR(12) NOT NULL,
    "precio_tipo" VARCHAR(12) NOT NULL DEFAULT 'fijo',
    "precios" JSONB,
    "min_personas" INTEGER,
    "max_personas" INTEGER,
    "incluye" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "horas_incluidas" INTEGER,
    "hora_extra_precio" DECIMAL(10,2),
    "tipos_evento" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "es_promocion" BOOLEAN NOT NULL DEFAULT false,
    "turno_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "traducciones" JSONB,
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "local_paquetes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "local_ocupaciones" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "pedido_id" UUID,
    "tipo" VARCHAR(10) NOT NULL,
    "inicio" TIMESTAMPTZ NOT NULL,
    "fin" TIMESTAMPTZ NOT NULL,
    "franja" TSTZRANGE GENERATED ALWAYS AS (tstzrange("inicio", "fin", '[)')) STORED,
    "expira_en" TIMESTAMPTZ,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "motivo" VARCHAR(100),
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),

    CONSTRAINT "local_ocupaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reserva_cuotas" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "pedido_id" UUID NOT NULL,
    "participante_id" UUID,
    "numero" INTEGER NOT NULL,
    "concepto" VARCHAR(20) NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "vence_en" DATE NOT NULL,
    "estado" VARCHAR(12) NOT NULL DEFAULT 'pendiente',
    "pagada_en" TIMESTAMPTZ,
    "recordatorios" JSONB NOT NULL DEFAULT '{}',
    "idempotency_key" UUID,
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "reserva_cuotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reserva_cambios" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "pedido_id" UUID NOT NULL,
    "tipo" VARCHAR(20) NOT NULL,
    "antes" JSONB,
    "despues" JSONB,
    "actor" VARCHAR(10) NOT NULL,
    "motivo" VARCHAR(30),
    "nota" VARCHAR(300),
    "diferencia" DECIMAL(10,2),
    "estado" VARCHAR(12) NOT NULL DEFAULT 'aplicado',
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),

    CONSTRAINT "reserva_cambios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "local_cotizaciones" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "turno_id" UUID,
    "paquete_id" UUID,
    "fecha" DATE NOT NULL,
    "hora_inicio" VARCHAR(5) NOT NULL,
    "hora_fin" VARCHAR(5) NOT NULL,
    "invitados" INTEGER NOT NULL,
    "tipo_evento" VARCHAR(20) NOT NULL,
    "detalle" JSONB NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "vence_en" TIMESTAMPTZ NOT NULL,
    "canal_origen" VARCHAR(20),
    "creada_por" VARCHAR(10) NOT NULL,
    "ajuste_monto" DECIMAL(10,2),
    "ajuste_motivo" VARCHAR(200),
    "cliente_nombre" VARCHAR(100),
    "cliente_whatsapp" VARCHAR(20),
    "cliente_email" VARCHAR(100),
    "pedido_id" UUID,
    "recordatorio_en" TIMESTAMPTZ,
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "local_cotizaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_local_salones_tienda" ON "local_salones"("tienda_id");

-- CreateIndex
CREATE INDEX "idx_local_turnos_salon" ON "local_turnos"("producto_id");

-- CreateIndex
CREATE INDEX "idx_local_paquetes_salon" ON "local_paquetes"("producto_id");

-- CreateIndex
CREATE INDEX "idx_local_ocupaciones_salon" ON "local_ocupaciones"("producto_id", "inicio");

-- CreateIndex
CREATE INDEX "idx_local_ocupaciones_tienda" ON "local_ocupaciones"("tienda_id", "inicio");

-- CreateIndex
CREATE INDEX "idx_local_ocupaciones_pedido" ON "local_ocupaciones"("pedido_id");

-- CreateIndex
CREATE INDEX "idx_cuotas_vencimiento" ON "reserva_cuotas"("tienda_id", "estado", "vence_en");

-- CreateIndex
CREATE UNIQUE INDEX "reserva_cuotas_pedido_id_numero_key" ON "reserva_cuotas"("pedido_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "reserva_cuotas_tienda_id_idempotency_key_key" ON "reserva_cuotas"("tienda_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "idx_reserva_cambios_pedido" ON "reserva_cambios"("pedido_id");

-- CreateIndex
CREATE INDEX "idx_local_cotizaciones_tienda" ON "local_cotizaciones"("tienda_id", "fecha_registro" DESC);

-- CreateIndex
CREATE INDEX "idx_local_cotizaciones_salon" ON "local_cotizaciones"("producto_id");

-- CreateIndex
CREATE INDEX "idx_local_cotizaciones_pedido" ON "local_cotizaciones"("pedido_id");

-- CreateIndex
CREATE INDEX "idx_pagos_cuota" ON "pagos"("cuota_id");

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_cuota_id_fkey" FOREIGN KEY ("cuota_id") REFERENCES "reserva_cuotas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "local_turnos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_paquete_id_fkey" FOREIGN KEY ("paquete_id") REFERENCES "local_paquetes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_salones" ADD CONSTRAINT "local_salones_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_turnos" ADD CONSTRAINT "local_turnos_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "local_salones"("producto_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_paquetes" ADD CONSTRAINT "local_paquetes_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "local_salones"("producto_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_ocupaciones" ADD CONSTRAINT "local_ocupaciones_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "local_salones"("producto_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_ocupaciones" ADD CONSTRAINT "local_ocupaciones_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva_cuotas" ADD CONSTRAINT "reserva_cuotas_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva_cambios" ADD CONSTRAINT "reserva_cambios_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_cotizaciones" ADD CONSTRAINT "local_cotizaciones_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "local_salones"("producto_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_cotizaciones" ADD CONSTRAINT "local_cotizaciones_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- 2) Reglas que Prisma no expresa --------------------------------------------
ALTER TABLE tiendas
  ADD CONSTRAINT tiendas_tipo_negocio_valido CHECK (tipo_negocio IN ('productos', 'hotel', 'tours', 'eventos', 'locales'));
ALTER TABLE pedidos
  ADD CONSTRAINT pedidos_tipo_valido CHECK (tipo IN ('compra', 'hotel', 'tour', 'evento', 'local'));
ALTER TABLE reservas
  ADD CONSTRAINT reservas_tipo_valido       CHECK (tipo IN ('hotel', 'tour', 'evento', 'local')),
  ADD CONSTRAINT reservas_local_valida      CHECK (tipo <> 'local' OR (invitados IS NOT NULL AND tipo_evento IS NOT NULL AND local IS NOT NULL)),
  ADD CONSTRAINT reservas_invitados_validos CHECK (invitados IS NULL OR invitados BETWEEN 1 AND 5000);

ALTER TABLE config_reservas
  ADD CONSTRAINT config_locales_validos CHECK (
    separacion_tipo IN ('porcentaje', 'monto_fijo')
    AND (separacion_monto IS NULL OR separacion_monto > 0)
    AND respuesta_horas BETWEEN 1 AND 168
    AND apartado_horas BETWEEN 1 AND 336
    AND saldo_dias_antes BETWEEN 0 AND 365
    AND max_cuotas BETWEEN 1 AND 12
    AND garantia_monto >= 0
    AND garantia_devolucion_dias BETWEEN 0 AND 60
    AND invitados_confirmar_dias BETWEEN 0 AND 60
    AND reprogramaciones_max BETWEEN 0 AND 10
    AND reprogramacion_min_dias BETWEEN 0 AND 365
    AND cargo_reprogramacion >= 0
    AND gracia_mora_dias BETWEEN 0 AND 60
    AND saldo_favor_meses BETWEEN 1 AND 24
    AND cotizacion_vigencia_dias BETWEEN 1 AND 60
    AND contrato_version >= 1
    AND (tarifa_coordinacion IS NULL OR tarifa_coordinacion >= 0)
    AND (descorche_botella IS NULL OR descorche_botella >= 0)
    AND hora_tope ~ '^([01]\d|2[0-3]):[0-5]\d$');

ALTER TABLE local_salones
  ADD CONSTRAINT local_salon_aforo       CHECK (aforo_maximo BETWEEN 1 AND 5000),
  ADD CONSTRAINT local_salon_metros      CHECK (metros IS NULL OR metros > 0),
  ADD CONSTRAINT local_salon_preparacion CHECK (preparacion_min BETWEEN 0 AND 480),
  ADD CONSTRAINT local_salon_por_horas   CHECK (NOT por_horas OR (precio_hora > 0 AND min_horas BETWEEN 1 AND 24
                                                AND horas_desde IS NOT NULL AND horas_hasta IS NOT NULL));

ALTER TABLE local_turnos
  ADD CONSTRAINT local_turno_horas CHECK (hora_inicio ~ '^([01]\d|2[0-3]):[0-5]\d$' AND hora_fin ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  ADD CONSTRAINT local_turno_dias  CHECK (dias_semana <@ ARRAY[1, 2, 3, 4, 5, 6, 7] AND cardinality(dias_semana) >= 1);

ALTER TABLE local_paquetes
  ADD CONSTRAINT local_paquete_modalidad CHECK (modalidad IN ('solo_local', 'paquete', 'por_horas')),
  ADD CONSTRAINT local_paquete_precio    CHECK (precio_tipo IN ('fijo', 'por_persona') AND (modalidad <> 'paquete' OR precios IS NOT NULL)),
  ADD CONSTRAINT local_paquete_personas  CHECK ((min_personas IS NULL OR min_personas >= 1)
                                                AND (max_personas IS NULL OR max_personas >= COALESCE(min_personas, 1))),
  ADD CONSTRAINT local_paquete_hora_extra CHECK (hora_extra_precio IS NULL OR hora_extra_precio >= 0);

-- Una fecha nunca se vende dos veces (CE-01): dos franjas activas del mismo
-- salón no se cruzan. Las filas vencidas (expira_en <= now()) se desactivan en
-- la transacción que vuelve a tocar el salón (modules/reservas/locales/ocupaciones.js).
ALTER TABLE local_ocupaciones
  ADD CONSTRAINT local_ocupacion_tipo  CHECK (tipo IN ('solicitud', 'apartado', 'reserva', 'bloqueo')),
  ADD CONSTRAINT local_ocupacion_rango CHECK (fin > inicio),
  ADD CONSTRAINT local_ocupacion_dueno CHECK ((tipo = 'bloqueo') = (pedido_id IS NULL)),
  ADD CONSTRAINT ex_local_ocupacion EXCLUDE USING gist (producto_id WITH =, franja WITH &&) WHERE (activo);
-- Una sola franja activa por reserva.
CREATE UNIQUE INDEX uq_local_ocupacion_pedido ON local_ocupaciones (pedido_id) WHERE activo;

ALTER TABLE reserva_cuotas
  ADD CONSTRAINT reserva_cuota_monto    CHECK (monto > 0),
  ADD CONSTRAINT reserva_cuota_numero   CHECK (numero >= 1),
  ADD CONSTRAINT reserva_cuota_estado   CHECK (estado IN ('pendiente', 'en_revision', 'pagada', 'anulada')),
  ADD CONSTRAINT reserva_cuota_concepto CHECK (concepto IN ('separacion', 'cuota', 'saldo', 'garantia', 'hora_extra', 'descorche',
                                                            'danos', 'penalidad', 'diferencia', 'cargo_reprogramacion'));

-- Un solo pago válido por cuota (CE-11).
CREATE UNIQUE INDEX uq_pagos_cuota_pagado ON pagos (cuota_id) WHERE estado = 'pagado';

ALTER TABLE reserva_cambios
  ADD CONSTRAINT reserva_cambio_actor  CHECK (actor IN ('cliente', 'negocio')),
  ADD CONSTRAINT reserva_cambio_estado CHECK (estado IN ('pedido', 'aplicado', 'rechazado'));

ALTER TABLE local_cotizaciones
  ADD CONSTRAINT local_cotizacion_invitados CHECK (invitados BETWEEN 1 AND 5000),
  ADD CONSTRAINT local_cotizacion_total     CHECK (total >= 0),
  ADD CONSTRAINT local_cotizacion_creada    CHECK (creada_por IN ('cliente', 'negocio'));

-- 3) RLS sin políticas: solo el backend accede ---------------------------------
ALTER TABLE public.local_salones      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_turnos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_paquetes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_ocupaciones  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reserva_cuotas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reserva_cambios    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_cotizaciones ENABLE ROW LEVEL SECURITY;

COMMIT;

-- 4) Verificación (opcional) ---------------------------------------------------
--   SELECT conname FROM pg_constraint WHERE conname = 'ex_local_ocupacion';
--   -- Debe fallar con 23P01 (dos franjas que se cruzan en el mismo salón):
--   -- INSERT INTO local_ocupaciones (id, tienda_id, producto_id, tipo, inicio, fin) VALUES
--   --   (gen_random_uuid(), '<tienda>', '<salon>', 'bloqueo', '2026-12-05 18:00-05', '2026-12-06 04:00-05'),
--   --   (gen_random_uuid(), '<tienda>', '<salon>', 'bloqueo', '2026-12-06 02:00-05', '2026-12-06 08:00-05');
