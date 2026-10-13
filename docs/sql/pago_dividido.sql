-- ============================================================================
-- PAGO DIVIDIDO DE CANCHAS (docs/specs/plantillas-por-rubro, E7)
-- ----------------------------------------------------------------------------
-- Corre este script UNA vez en el SQL Editor de Supabase ANTES de desplegar
-- el backend que lo usa. Después: `npx prisma generate`.
-- (Prisma selecciona todas las columnas de `pagos`: sin `parte_id` fallan los
-- pagos y el seguimiento de reservas.)
--
-- Quien reservó una cancha divide el total entre N jugadores; cada uno paga su
-- parte por link con la pasarela (pago automático).
-- ============================================================================

CREATE TABLE IF NOT EXISTS "reserva_partes" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tienda_id"      UUID NOT NULL,
  "pedido_id"      UUID NOT NULL REFERENCES "pedidos"("id") ON DELETE CASCADE,
  "numero"         INTEGER NOT NULL,
  "monto"          NUMERIC(10, 2) NOT NULL CHECK ("monto" > 0),
  "estado"         VARCHAR(15) NOT NULL DEFAULT 'pendiente' CHECK ("estado" IN ('pendiente', 'pagada')),
  "pagada_en"      TIMESTAMPTZ,
  "fecha_registro" TIMESTAMPTZ DEFAULT now(),
  UNIQUE ("pedido_id", "numero")
);
CREATE INDEX IF NOT EXISTS "idx_reserva_partes_pedido" ON "reserva_partes"("pedido_id");
ALTER TABLE "reserva_partes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "pagos" ADD COLUMN IF NOT EXISTS "parte_id" UUID REFERENCES "reserva_partes"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "idx_pagos_parte" ON "pagos"("parte_id");
-- Un solo pago válido por parte (como las cuotas, CE-11).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_pagos_parte_pagado" ON "pagos"("parte_id") WHERE "estado" = 'pagado';

-- Verificar:
--   select count(*) from reserva_partes;                                   → 0
--   select column_name from information_schema.columns
--   where table_name = 'pagos' and column_name = 'parte_id';               → 1 fila

