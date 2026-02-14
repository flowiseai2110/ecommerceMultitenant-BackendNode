-- ============================================
-- BUCKET ÚNICO: tiendas (PUBLIC)
-- ============================================
-- Estructura:
-- tiendas/
--   └── [tienda_id]/
--       ├── productos/
--       ├── categorias/
--       ├── logos/
--       ├── banners/
--       └── otros/

-- Crear bucket (si no existe)
INSERT INTO storage.buckets (id, name, public)
VALUES ('tiendas', 'tiendas', true)
ON CONFLICT (id) DO NOTHING;

-- Eliminar políticas anteriores si existen
DROP POLICY IF EXISTS "Usuarios autenticados pueden subir" ON storage.objects;
DROP POLICY IF EXISTS "Lectura pública" ON storage.objects;

-- Política INSERT para usuarios autenticados
CREATE POLICY "Usuarios autenticados pueden subir" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'tiendas');

-- Política SELECT pública (para URLs públicas)
CREATE POLICY "Lectura pública" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'tiendas');

-- Política UPDATE para usuarios autenticados (reemplazar imágenes)
CREATE POLICY "Usuarios autenticados pueden actualizar" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'tiendas');
