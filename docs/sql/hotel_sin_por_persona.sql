-- ============================================================================
-- HOTEL — Fuera "precio por persona" y "solo mujeres" (2026-10-11)
-- ----------------------------------------------------------------------------
-- Cada tipo de habitación tiene capacidad y precio fijos; el cliente solo
-- elige cuántas quiere. Una cama de dormitorio es un tipo más con capacidad 1
-- ("Cama en dormitorio femenino de 6"): unidades = total de camas, precio = la
-- cama, y 3 personas piden 3. Mixto/femenino/masculino va en el nombre.
--
-- Correr UNA vez en el SQL Editor de Supabase, DESPUÉS de desplegar el backend
-- que ya no lee estas columnas. Después: `npx prisma generate`.
-- ============================================================================

BEGIN;

-- 1) Las reservas de un dormitorio ocupaban una cama por persona: pasan a
--    pedir esa misma cantidad de "habitaciones" (camas) para que el cupo no cambie.
UPDATE "reservas" r
SET "habitaciones" = GREATEST(COALESCE(r."adultos", 0) + COALESCE(r."ninos", 0), 1)
FROM "hotel_tipos_habitacion" t
WHERE t."producto_id" = r."producto_id" AND t."por_persona" = true;

-- 2) Los tipos de dormitorio pasan a ser "una cama": capacidad 1. El precio ya
--    era por cama y `unidades` ya era el total de camas: no cambian.
UPDATE "hotel_tipos_habitacion"
SET "capacidad_adultos" = 1,
    "capacidad_ninos"   = LEAST("capacidad_ninos", 1),
    "capacidad_max"     = 1
WHERE "por_persona" = true;

-- 3) Las columnas ya no se usan.
ALTER TABLE "hotel_tipos_habitacion" DROP COLUMN "por_persona", DROP COLUMN "solo_mujeres";

COMMIT;
