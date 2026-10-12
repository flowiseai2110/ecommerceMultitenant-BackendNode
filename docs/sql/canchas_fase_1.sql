-- ============================================================================
-- ALQUILER DE CANCHAS — Fase 1 (canchas, horario, reservas por hora y bloqueos)
-- Spec: docs/specs/alquiler-canchas/spec.md
-- ----------------------------------------------------------------------------
-- Correr en el SQL Editor de Supabase DESPUÉS de locales_fase_1.sql. Se puede
-- correr más de una vez: la sección 0 borra lo que haya dejado un intento
-- anterior y la sección 1 lo vuelve a crear. Después: `npx prisma generate`.
--
-- ⚠️ Borra las canchas y las reservas de canchas que existan. No toca hoteles,
-- tours, eventos, locales ni sus reservas.
--
-- Un horario nunca se vende dos veces (R4): la restricción de exclusión
-- ex_cancha_ocupacion impide que dos franjas activas de la misma cancha se
-- crucen. Necesita btree_gist (ya la habilita locales_fase_1.sql).
--
-- No usar `prisma db push` para recrear estas tablas: Prisma no conoce la
-- columna generada ni la restricción de exclusión.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 0) Limpieza de un intento anterior -------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reservas' AND column_name = 'cancha') THEN
    DELETE FROM pedidos WHERE tipo = 'cancha';
  END IF;
END $$;

ALTER TABLE reservas DROP CONSTRAINT IF EXISTS reservas_cancha_valida;
ALTER TABLE reservas DROP COLUMN IF EXISTS cancha;

DROP TABLE IF EXISTS cancha_ocupaciones CASCADE;
DROP TABLE IF EXISTS cancha_canchas     CASCADE;

ALTER TABLE config_reservas DROP CONSTRAINT IF EXISTS config_canchas_validas;
ALTER TABLE config_reservas
  DROP COLUMN IF EXISTS cancha_apertura, DROP COLUMN IF EXISTS cancha_cierre, DROP COLUMN IF EXISTS cancha_inicio_noche,
  DROP COLUMN IF EXISTS cancha_finde_noche, DROP COLUMN IF EXISTS cancha_duraciones;

-- Los CHECK de tipo se recrean en la sección 2 (con 'canchas' / 'cancha').
UPDATE tiendas SET tipo_negocio = 'productos' WHERE tipo_negocio = 'canchas';
ALTER TABLE tiendas  DROP CONSTRAINT IF EXISTS tiendas_tipo_negocio_valido;
ALTER TABLE pedidos  DROP CONSTRAINT IF EXISTS pedidos_tipo_valido;
ALTER TABLE reservas DROP CONSTRAINT IF EXISTS reservas_tipo_valido;

-- 1) Tablas y columnas (DDL de Prisma; `franja` generada) ----------------------
-- AlterTable
ALTER TABLE "config_reservas" ADD COLUMN     "cancha_apertura" VARCHAR(5) NOT NULL DEFAULT '07:00',
ADD COLUMN     "cancha_cierre" VARCHAR(5) NOT NULL DEFAULT '23:00',
ADD COLUMN     "cancha_inicio_noche" VARCHAR(5) NOT NULL DEFAULT '18:00',
ADD COLUMN     "cancha_finde_noche" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "cancha_duraciones" INTEGER[] DEFAULT ARRAY[60, 90, 120]::INTEGER[];

-- AlterTable
ALTER TABLE "reservas" ADD COLUMN     "cancha" JSONB;

-- CreateTable
CREATE TABLE "cancha_canchas" (
    "producto_id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "formato" VARCHAR(4) NOT NULL,
    "largo_m" INTEGER,
    "ancho_m" INTEGER,
    "jugadores_max" INTEGER NOT NULL,
    "techada" BOOLEAN NOT NULL DEFAULT false,
    "superficie" VARCHAR(60),
    "precio_dia" DECIMAL(10,2) NOT NULL,
    "precio_noche" DECIMAL(10,2) NOT NULL,
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "cancha_canchas_pkey" PRIMARY KEY ("producto_id")
);

-- CreateTable
CREATE TABLE "cancha_ocupaciones" (
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

    CONSTRAINT "cancha_ocupaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_cancha_canchas_tienda" ON "cancha_canchas"("tienda_id");

-- CreateIndex
CREATE INDEX "idx_cancha_ocupaciones_cancha" ON "cancha_ocupaciones"("producto_id", "inicio");

-- CreateIndex
CREATE INDEX "idx_cancha_ocupaciones_tienda" ON "cancha_ocupaciones"("tienda_id", "inicio");

-- CreateIndex
CREATE INDEX "idx_cancha_ocupaciones_pedido" ON "cancha_ocupaciones"("pedido_id");

-- AddForeignKey
ALTER TABLE "cancha_canchas" ADD CONSTRAINT "cancha_canchas_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancha_ocupaciones" ADD CONSTRAINT "cancha_ocupaciones_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "cancha_canchas"("producto_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancha_ocupaciones" ADD CONSTRAINT "cancha_ocupaciones_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) Reglas que Prisma no expresa ----------------------------------------------
ALTER TABLE tiendas
  ADD CONSTRAINT tiendas_tipo_negocio_valido CHECK (tipo_negocio IN ('productos', 'hotel', 'tours', 'eventos', 'locales', 'canchas'));
ALTER TABLE pedidos
  ADD CONSTRAINT pedidos_tipo_valido CHECK (tipo IN ('compra', 'hotel', 'tour', 'evento', 'local', 'cancha'));
ALTER TABLE reservas
  ADD CONSTRAINT reservas_tipo_valido   CHECK (tipo IN ('hotel', 'tour', 'evento', 'local', 'cancha')),
  ADD CONSTRAINT reservas_cancha_valida CHECK (tipo <> 'cancha' OR (cancha IS NOT NULL AND fin IS NOT NULL));

ALTER TABLE config_reservas
  ADD CONSTRAINT config_canchas_validas CHECK (
    cancha_apertura ~ '^([01]\d|2[0-3]):00$'
    AND cancha_cierre ~ '^([01]\d|2[0-3]):00$'
    AND cancha_inicio_noche ~ '^([01]\d|2[0-3]):00$'
    AND cancha_duraciones <@ ARRAY[60, 90, 120, 180]
    AND cardinality(cancha_duraciones) >= 1
  );

ALTER TABLE cancha_canchas
  ADD CONSTRAINT cancha_formato   CHECK (formato IN ('F5', 'F6', 'F7', 'F8', 'F9', 'F11')),
  ADD CONSTRAINT cancha_jugadores CHECK (jugadores_max BETWEEN 2 AND 40),
  ADD CONSTRAINT cancha_medidas   CHECK ((largo_m IS NULL OR largo_m BETWEEN 10 AND 120) AND (ancho_m IS NULL OR ancho_m BETWEEN 5 AND 90)),
  ADD CONSTRAINT cancha_precios   CHECK (precio_dia > 0 AND precio_noche > 0);

-- Un horario nunca se vende dos veces (R4): dos franjas activas de la misma
-- cancha no se cruzan. Las filas vencidas (expira_en <= now()) se desactivan en
-- la transacción que vuelve a tocar la cancha (modules/reservas/canchas/ocupaciones.js).
ALTER TABLE cancha_ocupaciones
  ADD CONSTRAINT cancha_ocupacion_tipo  CHECK (tipo IN ('apartado', 'reserva', 'bloqueo')),
  ADD CONSTRAINT cancha_ocupacion_rango CHECK (fin > inicio),
  ADD CONSTRAINT cancha_ocupacion_dueno CHECK ((tipo = 'bloqueo') = (pedido_id IS NULL)),
  ADD CONSTRAINT ex_cancha_ocupacion EXCLUDE USING gist (producto_id WITH =, franja WITH &&) WHERE (activo);
-- Una sola franja activa por reserva.
CREATE UNIQUE INDEX uq_cancha_ocupacion_pedido ON cancha_ocupaciones (pedido_id) WHERE activo;

-- 3) RLS sin políticas: solo el backend accede ---------------------------------
ALTER TABLE public.cancha_canchas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cancha_ocupaciones ENABLE ROW LEVEL SECURITY;

COMMIT;

-- 4) Verificación (opcional) ---------------------------------------------------
--   SELECT conname FROM pg_constraint WHERE conname = 'ex_cancha_ocupacion';
--   -- Debe fallar con 23P01 (dos franjas que se cruzan en la misma cancha):
--   -- INSERT INTO cancha_ocupaciones (id, tienda_id, producto_id, tipo, inicio, fin) VALUES
--   --   (gen_random_uuid(), '<tienda>', '<cancha>', 'bloqueo', '2026-12-05 19:00-05', '2026-12-05 20:30-05'),
--   --   (gen_random_uuid(), '<tienda>', '<cancha>', 'bloqueo', '2026-12-05 20:00-05', '2026-12-05 21:00-05');
