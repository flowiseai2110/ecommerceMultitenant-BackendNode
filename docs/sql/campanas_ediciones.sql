-- ============================================================================
-- CAMPAÑAS: FECHAS POR AÑO (docs/specs/campanas-cuando, R2 · pieza P2)
-- ----------------------------------------------------------------------------
-- Ediciones de las campañas del catálogo cuya fecha no se calcula (Cyber Wow):
-- las carga el administrador de la plataforma desde el Admin ("Fechas por año").
-- Sin tienda_id: es un dato de la plataforma, igual para todas las tiendas.
-- Qué ediciones se esperan cada año vive en modules/campanas/presets.js.
-- Sin fila para un año, la campaña no se muestra ese año (R2.6.1).
-- Correr ANTES de desplegar el backend que la usa. Después: npx prisma generate.
-- Se puede correr más de una vez.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS "campana_ediciones" (
  "id"                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "preset_id"             VARCHAR(60)  NOT NULL,             -- "cyber-wow"
  "anio"                  SMALLINT     NOT NULL CHECK ("anio" BETWEEN 2020 AND 2100),
  "clave"                 VARCHAR(30)  NOT NULL,             -- "abril" (edicionesEsperadas del preset)
  "nombre"                VARCHAR(60)  NOT NULL,             -- "Abril"
  "fecha_inicio"          DATE         NOT NULL,
  "hora_inicio"           TIME,                              -- NULL = 00:00
  "fecha_fin"             DATE         NOT NULL,
  "hora_fin"              TIME,                              -- NULL = al terminar el día
  "fuente"                VARCHAR(500),                      -- enlace del anuncio (R7.8), solo https
  "fecha_registro"        TIMESTAMPTZ  DEFAULT NOW(),
  "usuario_registro"      VARCHAR(100),
  "fecha_actualizacion"   TIMESTAMPTZ,
  "usuario_actualizacion" VARCHAR(100),
  CONSTRAINT "uq_campana_ediciones" UNIQUE ("preset_id", "anio", "clave"),
  CONSTRAINT "ck_campana_ediciones_fechas" CHECK ("fecha_fin" >= "fecha_inicio")
);
-- El UNIQUE ya sirve de índice para leer por (preset_id, anio).
-- Las demás reglas (fin posterior al inicio con horas, máximo 30 días, sin cruces
-- en el año) las valida el backend: solo escribe el administrador de la plataforma.

CREATE TABLE IF NOT EXISTS "campana_ediciones_historial" (
  "id"          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "edicion_id"  UUID         REFERENCES "campana_ediciones" ("id") ON DELETE SET NULL,
  "preset_id"   VARCHAR(60)  NOT NULL,
  "anio"        SMALLINT     NOT NULL,
  "clave"       VARCHAR(30)  NOT NULL,
  "accion"      VARCHAR(10)  NOT NULL CHECK ("accion" IN ('crear', 'cambiar', 'borrar')),
  "antes"       JSONB,
  "despues"     JSONB,
  "usuario"     VARCHAR(100) NOT NULL,
  "fecha"       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_campana_ediciones_historial"
  ON "campana_ediciones_historial" ("preset_id", "anio", "clave", "fecha" DESC);

-- Solo el backend (service role): RLS activo sin políticas, como el resto
-- (docs/sql/rls_hardening.sql). La anon key no lee ni escribe.
ALTER TABLE "campana_ediciones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campana_ediciones_historial" ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Verificación: las dos tablas con RLS activo (true, true).
SELECT relname, relrowsecurity FROM pg_class
 WHERE relname IN ('campana_ediciones', 'campana_ediciones_historial');
