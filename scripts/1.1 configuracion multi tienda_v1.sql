-- ============================================
-- MÓDULO: USUARIOS - TIENDAS (Multi-tenant)
-- Vinculación de usuarios Supabase Auth con tiendas
-- ============================================

-- ============================================
-- TABLA: USUARIO_TIENDAS
-- ============================================

CREATE TABLE usuario_tiendas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,  -- ID del usuario de Supabase Auth (auth.users)
    tienda_id UUID NOT NULL,
    rol VARCHAR(50) DEFAULT 'viewer',  -- owner, admin, editor, viewer
    activo BOOLEAN DEFAULT true,
    
    -- Auditoría
    fecha_registro TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    usuario_registro VARCHAR(100),
    fecha_actualizacion TIMESTAMPTZ,
    usuario_actualizacion VARCHAR(100),
    
    -- Foreign Keys
    CONSTRAINT fk_usuario_tienda_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
    CONSTRAINT fk_usuario_tienda_tienda FOREIGN KEY (tienda_id) REFERENCES tiendas(id) ON DELETE CASCADE,
    
    -- Unique constraint: un usuario solo puede tener un rol por tienda
    CONSTRAINT uq_usuario_tienda UNIQUE (user_id, tienda_id)
);

-- Índices
CREATE INDEX idx_usuario_tiendas_user ON usuario_tiendas(user_id);
CREATE INDEX idx_usuario_tiendas_tienda ON usuario_tiendas(tienda_id);
CREATE INDEX idx_usuario_tiendas_rol ON usuario_tiendas(rol);
CREATE INDEX idx_usuario_tiendas_activo ON usuario_tiendas(activo);

COMMENT ON TABLE usuario_tiendas IS 'Relación entre usuarios de Supabase Auth y tiendas (multi-tenant)';
COMMENT ON COLUMN usuario_tiendas.user_id IS 'ID del usuario en auth.users de Supabase';
COMMENT ON COLUMN usuario_tiendas.rol IS 'Roles: owner (dueño), admin (administrador), editor (puede editar), viewer (solo ver)';

-- ============================================
-- DATOS INICIALES: ROLES EN ENUMERADOS
-- ============================================

INSERT INTO enumerados (tipo, codigo, valor, descripcion, orden, color, icono, metadata) VALUES
('rol_usuario', 'owner', 'Propietario', 'Dueño de la tienda con acceso total', 1, '#9B59B6', 'crown', '{"permisos": ["*"]}'),
('rol_usuario', 'admin', 'Administrador', 'Administrador con casi todos los permisos', 2, '#3498DB', 'shield', '{"permisos": ["productos", "pedidos", "clientes", "configuracion"]}'),
('rol_usuario', 'editor', 'Editor', 'Puede editar productos y gestionar pedidos', 3, '#27AE60', 'edit', '{"permisos": ["productos", "pedidos"]}'),
('rol_usuario', 'viewer', 'Visualizador', 'Solo puede ver información', 4, '#95A5A6', 'eye', '{"permisos": ["ver"]}');

-- ============================================
-- HABILITAR RLS
-- ============================================

ALTER TABLE usuario_tiendas ENABLE ROW LEVEL SECURITY;

-- ============================================
-- POLÍTICAS RLS PARA USUARIO_TIENDAS
-- ============================================

-- Política: Los usuarios pueden ver sus propias relaciones con tiendas
CREATE POLICY "Usuarios ven sus propias tiendas"
ON usuario_tiendas
FOR SELECT
USING (auth.uid() = user_id);

-- Política: Solo owners y admins pueden insertar nuevos usuarios a su tienda
CREATE POLICY "Owners y admins pueden agregar usuarios"
ON usuario_tiendas
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM usuario_tiendas ut
        WHERE ut.user_id = auth.uid()
        AND ut.tienda_id = tienda_id
        AND ut.rol IN ('owner', 'admin')
        AND ut.activo = true
    )
);

-- Política: Solo owners pueden actualizar roles
CREATE POLICY "Owners pueden actualizar usuarios"
ON usuario_tiendas
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM usuario_tiendas ut
        WHERE ut.user_id = auth.uid()
        AND ut.tienda_id = tienda_id
        AND ut.rol = 'owner'
        AND ut.activo = true
    )
);

-- Política: Solo owners pueden eliminar usuarios de su tienda
CREATE POLICY "Owners pueden eliminar usuarios"
ON usuario_tiendas
FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM usuario_tiendas ut
        WHERE ut.user_id = auth.uid()
        AND ut.tienda_id = tienda_id
        AND ut.rol = 'owner'
        AND ut.activo = true
    )
);

-- ============================================
-- POLÍTICAS RLS PARA TIENDAS (Actualizar)
-- ============================================

-- Eliminar política anterior si existe
DROP POLICY IF EXISTS "Usuarios ven solo su tienda" ON tiendas;

-- Política: Los usuarios solo ven tiendas donde tienen acceso
CREATE POLICY "Usuarios ven tiendas donde tienen acceso"
ON tiendas
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM usuario_tiendas ut
        WHERE ut.user_id = auth.uid()
        AND ut.tienda_id = id
        AND ut.activo = true
    )
);

-- Política: Solo owners y admins pueden actualizar su tienda
CREATE POLICY "Owners y admins pueden actualizar tienda"
ON tiendas
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM usuario_tiendas ut
        WHERE ut.user_id = auth.uid()
        AND ut.tienda_id = id
        AND ut.rol IN ('owner', 'admin')
        AND ut.activo = true
    )
);

-- ============================================
-- FUNCIÓN: Crear tienda con owner automático
-- ============================================

CREATE OR REPLACE FUNCTION crear_tienda_con_owner(
    p_nombre VARCHAR(100),
    p_slug VARCHAR(100),
    p_descripcion TEXT DEFAULT NULL,
    p_whatsapp VARCHAR(20) DEFAULT NULL,
    p_email VARCHAR(100) DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tienda_id UUID;
    v_user_id UUID;
BEGIN
    -- Obtener el usuario actual
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;
    
    -- Crear la tienda
    INSERT INTO tiendas (nombre, slug, descripcion, whatsapp_numero, email, usuario_registro)
    VALUES (p_nombre, p_slug, p_descripcion, p_whatsapp, p_email, v_user_id::TEXT)
    RETURNING id INTO v_tienda_id;
    
    -- Asignar al usuario como owner
    INSERT INTO usuario_tiendas (user_id, tienda_id, rol, usuario_registro)
    VALUES (v_user_id, v_tienda_id, 'owner', v_user_id::TEXT);
    
    RETURN v_tienda_id;
END;
$$;

-- ============================================
-- FUNCIÓN: Obtener tiendas del usuario actual
-- ============================================

CREATE OR REPLACE FUNCTION obtener_mis_tiendas()
RETURNS TABLE (
    tienda_id UUID,
    nombre VARCHAR(100),
    slug VARCHAR(100),
    rol VARCHAR(50),
    activo BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id AS tienda_id,
        t.nombre,
        t.slug,
        ut.rol,
        ut.activo
    FROM tiendas t
    INNER JOIN usuario_tiendas ut ON ut.tienda_id = t.id
    WHERE ut.user_id = auth.uid()
    AND ut.activo = true
    ORDER BY ut.rol, t.nombre;
END;
$$;

-- ============================================
-- FUNCIÓN: Verificar permiso del usuario
-- ============================================

CREATE OR REPLACE FUNCTION tiene_permiso(
    p_tienda_id UUID,
    p_roles_permitidos TEXT[]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM usuario_tiendas
        WHERE user_id = auth.uid()
        AND tienda_id = p_tienda_id
        AND rol = ANY(p_roles_permitidos)
        AND activo = true
    );
END;
$$;

-- ============================================
-- FUNCIÓN: Invitar usuario a tienda
-- ============================================

CREATE OR REPLACE FUNCTION invitar_usuario_tienda(
    p_tienda_id UUID,
    p_email VARCHAR(100),
    p_rol VARCHAR(50) DEFAULT 'viewer'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_invitador_rol VARCHAR(50);
BEGIN
    -- Verificar que el invitador es owner o admin
    SELECT rol INTO v_invitador_rol
    FROM usuario_tiendas
    WHERE user_id = auth.uid()
    AND tienda_id = p_tienda_id
    AND activo = true;
    
    IF v_invitador_rol IS NULL OR v_invitador_rol NOT IN ('owner', 'admin') THEN
        RETURN json_build_object('success', false, 'error', 'No tienes permiso para invitar usuarios');
    END IF;
    
    -- Buscar usuario por email en auth.users
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = p_email;
    
    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no encontrado. Debe registrarse primero.');
    END IF;
    
    -- Verificar que no exista ya la relación
    IF EXISTS (SELECT 1 FROM usuario_tiendas WHERE user_id = v_user_id AND tienda_id = p_tienda_id) THEN
        RETURN json_build_object('success', false, 'error', 'El usuario ya está vinculado a esta tienda');
    END IF;
    
    -- Crear la relación
    INSERT INTO usuario_tiendas (user_id, tienda_id, rol, usuario_registro)
    VALUES (v_user_id, p_tienda_id, p_rol, auth.uid()::TEXT);
    
    RETURN json_build_object('success', true, 'message', 'Usuario invitado correctamente');
END;
$$;

-- ============================================
-- EJEMPLO DE USO EN TU APLICACIÓN
-- ============================================

/*
-- 1. REGISTRAR USUARIO (Supabase Auth lo maneja)
-- El usuario se registra via supabase.auth.signUp()

-- 2. CREAR TIENDA (automáticamente asigna owner)
SELECT crear_tienda_con_owner(
    'Mi Tienda de Zapatos',
    'mi-tienda-zapatos',
    'Venta de zapatos de calidad',
    '51999888777',
    'tienda@email.com'
);

-- 3. VER MIS TIENDAS
SELECT * FROM obtener_mis_tiendas();

-- 4. INVITAR COLABORADOR
SELECT invitar_usuario_tienda(
    'uuid-de-la-tienda',
    'colaborador@email.com',
    'editor'
);

-- 5. VERIFICAR PERMISO
SELECT tiene_permiso('uuid-de-la-tienda', ARRAY['owner', 'admin']);
*/