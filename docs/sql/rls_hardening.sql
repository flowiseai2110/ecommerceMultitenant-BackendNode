-- ============================================================================
-- RLS HARDENING — cerrar las tablas de `public` al acceso directo con la anon key
-- ----------------------------------------------------------------------------
-- Por qué: la anon key es pública (va en el JS del storefront y del admin) y
-- Supabase expone TODAS las tablas de `public` por su API REST. Una tabla sin
-- RLS se puede leer (y según los GRANT, escribir) directo con esa key, sin
-- pasar por el backend: pedidos, clientes (WhatsApp, emails), cupones, etc.
--
-- Por qué es seguro:
--   - El backend usa Prisma con el rol `postgres`, DUEÑO de las tablas: RLS no
--     aplica al dueño (y en Supabase además tiene BYPASSRLS). Sigue igual.
--   - Ningún frontend lee tablas directo: el admin usa Supabase solo para login
--     y el storefront solo lee `avisos_live` por Realtime, que YA tiene RLS con
--     su política de SELECT público (docs/sql/live_rls_realtime.sql).
--   - RLS sin políticas = nadie más que el dueño accede. No se crean políticas.
--
-- Cómo correrlo (SQL Editor de Supabase), en este orden:
--   1) PASO 1 solo (diagnóstico): mira qué tablas quedan expuestas y confirma
--      que el dueño es `postgres` (el rol del DATABASE_URL del backend).
--   2) PASO 2: habilita RLS en las que no lo tienen. Es idempotente.
--   3) PASO 3: verifica que no quede ninguna en false.
--   4) Prueba el storefront (catálogo, checkout, aviso de live) y el admin.
-- ============================================================================

-- PASO 1 — Diagnóstico ------------------------------------------------------
select c.relname                 as tabla,
       c.relrowsecurity          as rls_activo,
       pg_get_userbyid(c.relowner) as dueno,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relrowsecurity, c.relname;

-- PASO 2 — Habilitar RLS donde falte ----------------------------------------
do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    raise notice 'RLS habilitado en %', t.relname;
  end loop;
end $$;

-- PASO 3 — Verificación: debe devolver 0 filas ------------------------------
select c.relname as tabla_sin_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- ROLLBACK (solo si algo se rompe; reemplaza <tabla>) -------------------------
-- alter table public.<tabla> disable row level security;
