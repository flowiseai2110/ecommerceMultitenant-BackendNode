# Receta: SQL nuevo para Supabase

1. Archivo `BackendNode/docs/sql/<feature>_<fase>.sql`. **Decide** el nombre siguiendo los vecinos (`transmisiones_fase2.sql`, `tienda_rubro.sql`).
2. Idempotente y en transacción: `begin; … commit;`, `create table if not exists`, `alter table … add column if not exists`,
   `create index if not exists`, `drop policy if exists` antes de `create policy`.
3. Toda tabla nueva con RLS activado y sus políticas en el mismo archivo.
4. Si cambia el modelo, actualiza `prisma/schema.prisma` (nombres en español, snake_case con `@map`, campos de auditoría) y corre `npm run prisma:generate`.
5. Reversa: `<mismo nombre>_reversa.sql` si el cambio no es solo aditivo.
6. Anota en `cambios.md` → "Afecta al despliegue" y en `docs/ESTADO.md` → "Te toca: correr `<archivo>` en Supabase". Nunca lo corras tú.
