-- ============================================================================
-- ENTRADAS CON QR (docs/specs/plantillas-por-rubro, E6)
-- ----------------------------------------------------------------------------
-- Corre este script UNA vez en el SQL Editor de Supabase ANTES de desplegar
-- el backend que lo usa. Después: `npx prisma generate`.
-- (El seguimiento de reservas incluye las entradas: sin la tabla, falla.)
--
-- Una fila por persona de una compra confirmada, con un código único que se
-- muestra como QR. En la puerta se marca `usada_en`: no entra dos veces.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "evento_entradas" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tienda_id"       UUID NOT NULL,
  "pedido_id"       UUID NOT NULL REFERENCES "pedidos"("id") ON DELETE CASCADE,
  "funcion_id"      UUID,
  "tipo_entrada_id" UUID NOT NULL,
  "tipo_nombre"     VARCHAR(80) NOT NULL,
  "numero"          INTEGER NOT NULL,
  "codigo"          VARCHAR(12) NOT NULL UNIQUE,
  "usada_en"        TIMESTAMPTZ,
  "usada_por"       VARCHAR(100),
  "anulada"         BOOLEAN NOT NULL DEFAULT false,
  "fecha_registro"  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_evento_entradas_pedido" ON "evento_entradas"("pedido_id");
CREATE INDEX IF NOT EXISTS "idx_evento_entradas_funcion" ON "evento_entradas"("tienda_id", "funcion_id");

-- Solo el backend lee y escribe (Prisma con service role).
ALTER TABLE "evento_entradas" ENABLE ROW LEVEL SECURITY;

-- Compras ya confirmadas antes de este cambio: emitir sus entradas
-- (una por persona, con código aleatorio de 10 caracteres sin 0/O/1/I/L).
INSERT INTO "evento_entradas" ("tienda_id", "pedido_id", "funcion_id", "tipo_entrada_id", "tipo_nombre", "numero", "codigo")
SELECT i.tienda_id, i.pedido_id, r.funcion_id, i.tipo_entrada_id, i.nombre,
       row_number() OVER (PARTITION BY i.pedido_id ORDER BY i.precio DESC, i.nombre, g.n),
       (SELECT string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
          FROM generate_series(1, 10) WHERE g.n IS NOT NULL)
FROM "evento_compra_items" i
JOIN "pedidos" p ON p.id = i.pedido_id AND p.estado IN ('confirmada', 'completada')
JOIN "reservas" r ON r.pedido_id = i.pedido_id
CROSS JOIN LATERAL generate_series(1, i.cantidad) AS g(n)
WHERE NOT EXISTS (SELECT 1 FROM "evento_entradas" e WHERE e.pedido_id = i.pedido_id);

-- Verificar:
--   select count(*) from evento_entradas;   → una por persona de las compras confirmadas
