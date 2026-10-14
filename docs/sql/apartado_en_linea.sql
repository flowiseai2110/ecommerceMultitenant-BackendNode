-- Reserva directa de hospedaje (docs/specs/reserva-directa-hotel RD6):
-- minutos que se aparta el cupo mientras el cliente paga en línea.
-- Correr en el SQL Editor de Supabase ANTES de reiniciar el backend
-- (Prisma selecciona todas las columnas de config_reservas).
alter table config_reservas
  add column if not exists apartado_en_linea_min integer not null default 15;

-- Verificar:
-- select apartado_manual_min, apartado_en_linea_min from config_reservas limit 5;
