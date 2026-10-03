-- ============================================================================
-- AGENTE DE VENTAS IA — Historial de conversaciones en el servidor
-- ----------------------------------------------------------------------------
-- Alternativa a `npx prisma db push`: corre este script UNA vez en el SQL
-- Editor de Supabase ANTES de desplegar el backend que lo usa. El DDL se generó
-- con `prisma migrate diff` desde el schema, así que es IDÉNTICO al que Prisma
-- espera (sin drift). Después: `npx prisma generate`.
--
-- El historial que recibe el LLM sale SOLO de estas tablas, nunca del cliente
-- (docs/specs/agente-ventas/spec.md, R1).
--
-- Todas las lecturas y escrituras pasan por el backend (rol postgres, bypass
-- RLS). RLS se habilita SIN políticas: la anon key es pública (va en el
-- storefront) y sin RLS cualquiera podría leer las conversaciones de todas las
-- tiendas por la API REST de Supabase.
-- ============================================================================

-- 1) Tablas (DDL exacto de Prisma) ------------------------------------------
CREATE TABLE IF NOT EXISTS "agente_conversaciones" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "session_token" VARCHAR(64) NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'activa',
    "turnos" INTEGER NOT NULL DEFAULT 0,
    "ultima_actividad" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "agente_conversaciones_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "agente_mensajes" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "conversacion_id" UUID NOT NULL,
    "rol" VARCHAR(20) NOT NULL,
    "contenido" TEXT NOT NULL,
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agente_mensajes_pkey" PRIMARY KEY ("id")
);

-- 2) Índices ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "idx_agente_conv_sesion" ON "agente_conversaciones"("tienda_id", "session_token", "ultima_actividad" DESC);
CREATE INDEX IF NOT EXISTS "idx_agente_mensajes_conv" ON "agente_mensajes"("conversacion_id", "fecha_registro");

-- 3) Llaves foráneas --------------------------------------------------------
ALTER TABLE "agente_conversaciones" ADD CONSTRAINT "agente_conversaciones_tienda_id_fkey" FOREIGN KEY ("tienda_id") REFERENCES "tiendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agente_mensajes" ADD CONSTRAINT "agente_mensajes_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "agente_conversaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4) RLS sin políticas (solo el backend accede) -----------------------------
ALTER TABLE public.agente_conversaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agente_mensajes ENABLE ROW LEVEL SECURITY;

-- Verificación:
--   SELECT count(*) FROM agente_conversaciones;   -- 0, sin error
