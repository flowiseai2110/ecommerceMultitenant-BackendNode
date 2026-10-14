-- Plantillas por rubro, parte 4 (datos y pago del hotel):
--   - formulario de la reserva configurable por tienda (modules/reservas/formulario.js);
--   - el cliente elige adelanto o total (C8);
--   - hora estimada de llegada.
-- Correr en el SQL Editor de Supabase ANTES de reiniciar el backend
-- (Prisma selecciona todas las columnas). Va después de apartado_en_linea.sql.
alter table config_reservas
  add column if not exists cobro_eleccion boolean not null default false,
  add column if not exists campos_formulario jsonb;

-- El documento y el país dejan de ser obligatorios si la tienda no los pide.
alter table reservas
  alter column titular_doc_tipo drop not null,
  alter column titular_doc_numero drop not null,
  alter column titular_nacionalidad drop not null,
  add column if not exists hora_llegada varchar(5);

-- Verificar:
-- select cobro_eleccion, campos_formulario from config_reservas limit 5;
-- select hora_llegada from reservas limit 1;
