-- ============================================================================
-- AVISO DE LIVE — Setup completo en un solo paso (tabla + RLS + Realtime)
-- ----------------------------------------------------------------------------
-- Alternativa a `npx prisma db push` cuando este va muy lento: corre este script
-- UNA vez en el SQL Editor de Supabase. El DDL de la tabla se generó con
-- `prisma migrate diff` desde el schema, así que es IDÉNTICO al que Prisma
-- espera (un futuro `db push` reportará "in sync", sin drift).
--
-- El cliente Prisma ya se regeneró (`npx prisma generate`), así que el backend
-- reconoce el modelo `avisos_live` sin más pasos.
--
-- Apagado 100% MANUAL (POST /stop). Sin cron ni triggers.
-- ============================================================================

-- 1) Tabla (DDL exacto de Prisma) -------------------------------------------
CREATE TABLE "avisos_live" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "titulo" VARCHAR(100),
    "tiktok_url" TEXT,
    "youtube_url" TEXT,
    "facebook_url" TEXT,
    "mostrar_tiktok" BOOLEAN NOT NULL DEFAULT false,
    "mostrar_youtube" BOOLEAN NOT NULL DEFAULT false,
    "mostrar_facebook" BOOLEAN NOT NULL DEFAULT false,
    "iniciado_en" TIMESTAMPTZ,
    "expira_en" TIMESTAMPTZ,
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "avisos_live_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "avisos_live_tienda_id_key" ON "avisos_live"("tienda_id");
CREATE INDEX "idx_avisos_live_activo_expira" ON "avisos_live"("activo", "expira_en");

ALTER TABLE "avisos_live"
  ADD CONSTRAINT "avisos_live_tienda_id_fkey"
  FOREIGN KEY ("tienda_id") REFERENCES "tiendas"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) RLS: SELECT público (anon + authenticated) -----------------------------
--    Los links no son secretos y la tienda necesita recibir por Realtime el
--    evento cuando el live se DESACTIVA (activo=false al pulsar "Detener").
alter table public.avisos_live enable row level security;

drop policy if exists "avisos_live_select_publico" on public.avisos_live;
create policy "avisos_live_select_publico"
  on public.avisos_live
  for select
  to anon, authenticated
  using (true);

-- 3) Sin policies de INSERT/UPDATE/DELETE => escritura denegada por defecto.
--    Todo lo escribe el backend con Prisma (rol postgres, bypass RLS).

-- 4) Publicación Realtime ---------------------------------------------------
alter publication supabase_realtime add table public.avisos_live;
