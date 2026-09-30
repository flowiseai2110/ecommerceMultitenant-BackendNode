-- ============================================================================
-- RESEÑAS DE PRODUCTOS — Setup completo (tabla + rating en productos + RLS)
-- ----------------------------------------------------------------------------
-- Alternativa a `npx prisma db push`: corre este script UNA vez en el SQL
-- Editor de Supabase. El DDL se generó con `prisma migrate diff` desde el
-- schema, así que es IDÉNTICO al que Prisma espera (sin drift).
-- Después: `npx prisma generate`.
--
-- Todas las lecturas y escrituras pasan por el backend (rol postgres, bypass
-- RLS). RLS se habilita SIN políticas: la anon key es pública (va en el
-- storefront) y sin RLS cualquiera podría leer o insertar reseñas directo por
-- la API REST de Supabase, saltándose la verificación de compra.
-- ============================================================================

-- 1) Resumen de rating en productos (reseñas aprobadas) ---------------------
ALTER TABLE "productos" ADD COLUMN     "rating_cantidad" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rating_promedio" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- 2) Tabla (DDL exacto de Prisma) -------------------------------------------
CREATE TABLE "resenas" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "pedido_id" UUID NOT NULL,
    "auth_user_id" UUID,
    "estrellas" SMALLINT NOT NULL,
    "comentario" TEXT,
    "nombre_mostrado" VARCHAR(60) NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    "respuesta_tienda" TEXT,
    "fecha_respuesta" TIMESTAMPTZ,
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "resenas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_resenas_producto_estado" ON "resenas"("tienda_id", "producto_id", "estado", "fecha_registro" DESC);
CREATE INDEX "idx_resenas_tienda_estado" ON "resenas"("tienda_id", "estado", "fecha_registro" DESC);
CREATE UNIQUE INDEX "resenas_pedido_id_producto_id_key" ON "resenas"("pedido_id", "producto_id");

ALTER TABLE "resenas" ADD CONSTRAINT "resenas_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resenas" ADD CONSTRAINT "resenas_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) Reglas que Prisma no expresa --------------------------------------------
ALTER TABLE "resenas" ADD CONSTRAINT "resenas_estrellas_rango" CHECK ("estrellas" BETWEEN 1 AND 5);
ALTER TABLE "resenas" ADD CONSTRAINT "resenas_estado_valido" CHECK ("estado" IN ('pendiente', 'aprobada', 'rechazada'));

-- 4) RLS sin políticas: ni anon ni authenticated acceden directo --------------
ALTER TABLE public.resenas ENABLE ROW LEVEL SECURITY;
