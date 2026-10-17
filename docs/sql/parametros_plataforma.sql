-- ============================================================================
-- PARÁMETROS DE LA PLATAFORMA (modules/parametros)
-- ----------------------------------------------------------------------------
-- Valores que el administrador de la plataforma cambia sin deploy, desde el
-- admin ("Parámetros de la plataforma"). La lista de claves, su validación y su
-- valor por defecto viven en modules/parametros/parametros.registro.js: aquí
-- solo se guarda lo que alguien cambió. Sin fila, rige el valor por defecto.
--
-- Correr UNA vez en el SQL Editor de Supabase, ANTES de desplegar el backend que
-- la usa. Después: `npx prisma generate`. Se puede correr más de una vez.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS "parametros_plataforma" (
    "clave" VARCHAR(60) NOT NULL,
    "valor" JSONB NOT NULL,
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "parametros_plataforma_pkey" PRIMARY KEY ("clave")
);

-- Sin acceso directo con la anon key (docs/sql/rls_hardening.sql): solo el backend.
ALTER TABLE parametros_plataforma ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Verificación: lo que se cambió (vacío = todo con su valor por defecto).
SELECT clave, valor, usuario_actualizacion, fecha_actualizacion FROM parametros_plataforma ORDER BY clave;
