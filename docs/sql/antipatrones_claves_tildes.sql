-- ============================================================================
-- ANTIPATRONES — Pieza 4, hallazgos del e2e: textos del checkout con tilde
-- Spec: docs/specs/antipatrones (cambios.md "Hallazgos del e2e") · tasks.md pieza 4
-- ----------------------------------------------------------------------------
-- Correr UNA vez en el SQL Editor de Supabase, DESPUÉS de desplegar el backend
-- y la tienda con las claves nuevas. Idempotente: correrlo dos veces no cambia nada.
--
-- En la tienda el texto en español ES la clave. Al corregir las tildes
-- ("Telefono" → "Teléfono") la clave cambia: el backend crea la nueva al
-- arrancar y marca la vieja como obsoleta (no la borra). El inglés de la
-- plataforma ya se movió en modules/idiomas/plataforma/en.json; lo que
-- quedaría huérfano es lo que cada tienda tradujo a mano (`tienda_textos`).
-- Aquí se copia a la clave nueva. Si la tienda ya tenía la nueva traducida
-- ("Envío", "Tu carrito está vacío" ya existían), se respeta la suya.
--
-- No se copian (su texto ya no corresponde a la clave nueva):
--  - "Buscar mi agencia Shalom" / "Buscar mi agencia u agente Olva" → ahora
--    "Buscar mi agencia {courier}" (lleva el nombre del courier de la tienda).
--  - El aviso de recojo en tienda con "(Selección de local — funcionalidad
--    pendiente.)": la traducción vieja arrastraría ese texto interno.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE claves_renombradas (vieja TEXT PRIMARY KEY, nueva TEXT NOT NULL) ON COMMIT DROP;
INSERT INTO claves_renombradas (vieja, nueva) VALUES
  ('Envio', 'Envío'),
  ('Envio y entrega', 'Envío y entrega'),
  ('Numero de Pedido', 'Número de Pedido'),
  ('Telefono', 'Teléfono'),
  ('Telefono / WhatsApp', 'Teléfono / WhatsApp'),
  ('Tu carrito esta vacio', 'Tu carrito está vacío'),
  ('Ej: Juan Perez', 'Ej: Juan Pérez');

-- La clave nueva tiene que existir (FK). Si el backend ya arrancó, ya está.
INSERT INTO "textos_claves" ("clave", "grupos", "usuario_registro")
SELECT r.nueva, c."grupos", 'antipatrones-tildes'
FROM claves_renombradas r
JOIN "textos_claves" c ON c."clave" = r.vieja
ON CONFLICT ("clave") DO NOTHING;

-- Copia lo que cada tienda tradujo; no pisa una traducción que ya tenga.
INSERT INTO "tienda_textos" ("tienda_id", "idioma", "clave", "texto", "origen", "usuario_registro")
SELECT t."tienda_id", t."idioma", r.nueva, t."texto", t."origen", 'antipatrones-tildes'
FROM "tienda_textos" t
JOIN claves_renombradas r ON r.vieja = t."clave"
ON CONFLICT ("tienda_id", "idioma", "clave") DO NOTHING;

COMMIT;
