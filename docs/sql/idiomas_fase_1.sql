-- ============================================================================
-- IDIOMAS — Fase 1 (idiomas de la plataforma y textos fijos por tienda)
-- Spec: docs/specs/idiomas (D1, D7, D11) · Tareas: tasks.md 1.1
-- ----------------------------------------------------------------------------
-- Correr UNA vez en el SQL Editor de Supabase. Crea 4 tablas, agrega
-- `pedidos.idioma` con default 'es' y amplía `reservas.idioma_huesped` de 2 a
-- 10 caracteres (solo metadatos: no reescribe la tabla). No cambia lo que ven
-- las tiendas existentes. La sección 1 se generó con `prisma migrate diff`,
-- así que es IDÉNTICA a lo que Prisma espera. Después: `npx prisma generate`.
-- ============================================================================

BEGIN;

-- 1) Tablas y columnas (DDL exacto de Prisma) ----------------------------------
-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "idioma" VARCHAR(10) NOT NULL DEFAULT 'es';

-- AlterTable
ALTER TABLE "reservas" ALTER COLUMN "idioma_huesped" SET DATA TYPE VARCHAR(10);

-- CreateTable
CREATE TABLE "idiomas" (
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "pais" VARCHAR(2) NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "ia" BOOLEAN NOT NULL DEFAULT false,
    "aviso_ia" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "idiomas_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "textos_claves" (
    "clave" TEXT NOT NULL,
    "grupo" VARCHAR(20) NOT NULL,
    "obsoleta" BOOLEAN NOT NULL DEFAULT false,
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "textos_claves_pkey" PRIMARY KEY ("clave")
);

-- CreateTable
CREATE TABLE "textos_plataforma" (
    "idioma" VARCHAR(10) NOT NULL,
    "clave" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "textos_plataforma_pkey" PRIMARY KEY ("idioma","clave")
);

-- CreateTable
CREATE TABLE "tienda_textos" (
    "tienda_id" UUID NOT NULL,
    "idioma" VARCHAR(10) NOT NULL,
    "clave" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "origen" VARCHAR(10) NOT NULL DEFAULT 'manual',
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "tienda_textos_pkey" PRIMARY KEY ("tienda_id","idioma","clave")
);

-- CreateIndex
CREATE INDEX "idx_textos_plataforma_clave" ON "textos_plataforma"("clave");

-- CreateIndex
CREATE INDEX "idx_tienda_textos_idioma" ON "tienda_textos"("idioma");

-- CreateIndex
CREATE INDEX "idx_tienda_textos_clave" ON "tienda_textos"("clave");

-- AddForeignKey
ALTER TABLE "textos_plataforma" ADD CONSTRAINT "textos_plataforma_idioma_fkey" FOREIGN KEY ("idioma") REFERENCES "idiomas"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "textos_plataforma" ADD CONSTRAINT "textos_plataforma_clave_fkey" FOREIGN KEY ("clave") REFERENCES "textos_claves"("clave") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tienda_textos" ADD CONSTRAINT "tienda_textos_tienda_id_fkey" FOREIGN KEY ("tienda_id") REFERENCES "tiendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tienda_textos" ADD CONSTRAINT "tienda_textos_idioma_fkey" FOREIGN KEY ("idioma") REFERENCES "idiomas"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tienda_textos" ADD CONSTRAINT "tienda_textos_clave_fkey" FOREIGN KEY ("clave") REFERENCES "textos_claves"("clave") ON DELETE CASCADE ON UPDATE CASCADE;


-- 2) Reglas que Prisma no expresa ----------------------------------------------
ALTER TABLE "idiomas"
  ADD CONSTRAINT idiomas_codigo CHECK ("codigo" ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  ADD CONSTRAINT idiomas_pais   CHECK ("pais" ~ '^[A-Z]{2}$');

ALTER TABLE "tienda_textos"
  ADD CONSTRAINT tienda_textos_origen CHECK ("origen" IN ('manual', 'ia'));

-- 3) Idiomas iniciales (D1) ----------------------------------------------------
-- es es el idioma base (IDIOMA_BASE en modules/idiomas): no se traduce.
-- qu y ay: la IA está disponible pero el admin avisa "revisa con un hablante".
INSERT INTO "idiomas" ("codigo", "nombre", "pais", "locale", "ia", "aviso_ia", "orden", "usuario_registro") VALUES
  ('es', 'Español',   'PE', 'es-PE', false, false, 0,  'docs/sql/idiomas_fase_1'),
  ('qu', 'Runasimi',  'PE', 'es-PE', true,  true,  1,  'docs/sql/idiomas_fase_1'),
  ('ay', 'Aymar aru', 'PE', 'es-PE', true,  true,  2,  'docs/sql/idiomas_fase_1'),
  ('en', 'English',   'US', 'en-US', true,  false, 10, 'docs/sql/idiomas_fase_1')
ON CONFLICT ("codigo") DO NOTHING;

-- 4) RLS sin políticas: solo el backend accede ---------------------------------
ALTER TABLE public.idiomas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.textos_claves     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.textos_plataforma ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tienda_textos     ENABLE ROW LEVEL SECURITY;

COMMIT;

-- 5) Verificación (debe devolver 0 filas) --------------------------------------
-- Tiendas con un idioma que no existe en `idiomas` (hoy solo hay es y en).
SELECT t.slug, i AS idioma_desconocido
FROM "tiendas" t, unnest(t."idiomas") AS i
WHERE i NOT IN (SELECT "codigo" FROM "idiomas");
