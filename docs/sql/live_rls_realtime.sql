-- ============================================================================
-- AVISO DE LIVE — RLS + Realtime  (SIN procesos automáticos)
-- ----------------------------------------------------------------------------
-- La tabla `avisos_live` la CREA Prisma (`npm run prisma:generate` +
-- `npx prisma db push`). Este script NO crea la tabla: solo configura lo que
-- Prisma no gestiona (RLS y la publicación Realtime).
--
-- Ejecutar UNA vez en el SQL Editor de Supabase, DESPUÉS del `db push`.
--
-- APAGADO 100% MANUAL: el live se apaga cuando el emprendedor pulsa "Detener"
-- (POST /api/v1/admin/live/stop). No hay cron ni jobs en background. El backend
-- además corrige de forma perezosa (solo al leer, dentro del request) un live
-- cuyo expira_en ya pasó, para no reportar `activo` obsoleto — pero eso vive en
-- el código Node, no en la base de datos.
--
-- Nota de seguridad: el backend escribe con Prisma vía el rol `postgres`
-- (BYPASSRLS en Supabase), así que RLS NO afecta las escrituras del backend.
-- RLS solo gobierna al cliente anon del storefront, que únicamente lee.
-- ============================================================================

-- 1) Habilitar RLS ----------------------------------------------------------
alter table public.avisos_live enable row level security;

-- 2) SELECT público (anon + authenticated) ----------------------------------
--    Los links no son secretos y la tienda necesita recibir por Realtime
--    también el evento cuando el live se DESACTIVA (fila que cambia a
--    activo=false al pulsar "Detener"), por eso el SELECT cubre todas las filas.
drop policy if exists "avisos_live_select_publico" on public.avisos_live;
create policy "avisos_live_select_publico"
  on public.avisos_live
  for select
  to anon, authenticated
  using (true);

-- 3) Sin INSERT/UPDATE/DELETE para anon ni authenticated --------------------
--    No se crean policies de escritura => quedan denegadas por defecto.
--    Todas las escrituras pasan por el backend (rol postgres, bypass RLS).

-- 4) Publicación Realtime ---------------------------------------------------
--    Añade la tabla a la publicación que Supabase Realtime escucha, para que el
--    storefront reciba el encendido/apagado manual en tiempo real.
alter publication supabase_realtime add table public.avisos_live;
