-- ============================================================================
-- PLANTILLAS DE DISEÑO EN LA BASE — Setup (editor-diseno-en-vivo, fase 2)
-- ----------------------------------------------------------------------------
-- Corre este script UNA vez en el SQL Editor de Supabase ANTES de desplegar
-- el backend que lo usa. Después: `npx prisma generate`.
--
-- Plantillas de la plataforma creadas o editadas desde el editor de Diseño
-- por el administrador de la plataforma (PLATFORM_ADMIN_EMAILS). Las de
-- modules/diseno/plantillas.js siguen siendo la base: una fila con el mismo
-- id las reemplaza (textos, orden, ocultar) y una con id nuevo agrega otra.
--
-- Sin tienda_id: es de la plataforma, igual para todas las tiendas.
-- Nunca se borran filas: una plantilla se oculta con activa = false, porque
-- las tiendas que la usan la siguen necesitando para su tipo de negocio.
-- Si la tabla no existe o falla, el backend usa solo las del código.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "plantillas_diseno" (
  "id"                     VARCHAR(60)  PRIMARY KEY,
  "tipo_negocio"           VARCHAR(30)  NOT NULL,
  "rubro"                  VARCHAR(30)  NOT NULL DEFAULT 'general',
  "nombre"                 VARCHAR(80)  NOT NULL,
  "descripcion"            VARCHAR(300) NOT NULL DEFAULT '',
  "version"                INTEGER      NOT NULL DEFAULT 1,
  "orden"                  INTEGER      NOT NULL DEFAULT 0,
  "activa"                 BOOLEAN      NOT NULL DEFAULT TRUE,
  -- radio, encabezados, layout, secciones (con textos de ejemplo) y tema.
  "contenido"              JSONB        NOT NULL,
  "fecha_registro"         TIMESTAMPTZ  DEFAULT NOW(),
  "usuario_registro"       VARCHAR(100),
  "fecha_actualizacion"    TIMESTAMPTZ,
  "usuario_actualizacion"  VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS "idx_plantillas_diseno_tipo" ON "plantillas_diseno" ("tipo_negocio", "orden");

-- Solo el backend (service role) la lee y escribe: RLS activo sin políticas,
-- como el resto de tablas (docs/sql/rls_hardening.sql).
ALTER TABLE "plantillas_diseno" ENABLE ROW LEVEL SECURITY;
