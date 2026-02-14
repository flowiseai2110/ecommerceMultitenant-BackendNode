-- ============================================
-- POLÍTICAS RLS (Row Level Security) COMPLETAS
-- Mini E-commerce Multi-tenant
-- ============================================

-- ============================================
-- FUNCIÓN AUXILIAR: Obtener tiendas del usuario
-- ============================================

CREATE OR REPLACE FUNCTION obtener_tiendas_usuario()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT tienda_id 
    FROM usuario_tiendas 
    WHERE user_id = auth.uid() 
    AND activo = true;
$$;

-- ============================================
-- FUNCIÓN AUXILIAR: Verificar rol en tienda
-- ============================================

CREATE OR REPLACE FUNCTION tiene_rol_en_tienda(p_tienda_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM usuario_tiendas
        WHERE user_id = auth.uid()
        AND tienda_id = p_tienda_id
        AND rol = ANY(p_roles)
        AND activo = true
    );
$$;

-- ============================================
-- TABLAS PÚBLICAS (Todos pueden leer)
-- ============================================

-- ENUMERADOS: Lectura pública
DROP POLICY IF EXISTS "Enumerados lectura pública" ON enumerados;
CREATE POLICY "Enumerados lectura pública" ON enumerados
    FOR SELECT USING (true);

-- UBIGEOS: Lectura pública
DROP POLICY IF EXISTS "Ubigeos lectura pública" ON ubigeos;
CREATE POLICY "Ubigeos lectura pública" ON ubigeos
    FOR SELECT USING (true);

-- ============================================
-- TABLA: TIENDAS
-- ============================================

-- SELECT: Usuario ve tiendas donde tiene acceso
DROP POLICY IF EXISTS "Tiendas: ver mis tiendas" ON tiendas;
CREATE POLICY "Tiendas: ver mis tiendas" ON tiendas
    FOR SELECT USING (
        id IN (SELECT obtener_tiendas_usuario())
    );

-- INSERT: Cualquier usuario autenticado puede crear tienda
DROP POLICY IF EXISTS "Tiendas: crear" ON tiendas;
CREATE POLICY "Tiendas: crear" ON tiendas
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL
    );

-- UPDATE: Solo owner y admin pueden actualizar
DROP POLICY IF EXISTS "Tiendas: actualizar" ON tiendas;
CREATE POLICY "Tiendas: actualizar" ON tiendas
    FOR UPDATE USING (
        tiene_rol_en_tienda(id, ARRAY['owner', 'admin'])
    );

-- DELETE: Solo owner puede eliminar
DROP POLICY IF EXISTS "Tiendas: eliminar" ON tiendas;
CREATE POLICY "Tiendas: eliminar" ON tiendas
    FOR DELETE USING (
        tiene_rol_en_tienda(id, ARRAY['owner'])
    );

-- ============================================
-- TABLA: TIENDA_CONFIGURACIONES
-- ============================================

DROP POLICY IF EXISTS "TiendaConfig: ver" ON tienda_configuraciones;
CREATE POLICY "TiendaConfig: ver" ON tienda_configuraciones
    FOR SELECT USING (
        tienda_id IN (SELECT obtener_tiendas_usuario())
    );

DROP POLICY IF EXISTS "TiendaConfig: crear" ON tienda_configuraciones;
CREATE POLICY "TiendaConfig: crear" ON tienda_configuraciones
    FOR INSERT WITH CHECK (
        tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin'])
    );

DROP POLICY IF EXISTS "TiendaConfig: actualizar" ON tienda_configuraciones;
CREATE POLICY "TiendaConfig: actualizar" ON tienda_configuraciones
    FOR UPDATE USING (
        tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin'])
    );

DROP POLICY IF EXISTS "TiendaConfig: eliminar" ON tienda_configuraciones;
CREATE POLICY "TiendaConfig: eliminar" ON tienda_configuraciones
    FOR DELETE USING (
        tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin'])
    );

-- ============================================
-- TABLA: CATEGORIAS
-- ============================================

DROP POLICY IF EXISTS "Categorias: ver" ON categorias;
CREATE POLICY "Categorias: ver" ON categorias
    FOR SELECT USING (
        tienda_id IN (SELECT obtener_tiendas_usuario())
    );

DROP POLICY IF EXISTS "Categorias: crear" ON categorias;
CREATE POLICY "Categorias: crear" ON categorias
    FOR INSERT WITH CHECK (
        tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin', 'editor'])
    );

DROP POLICY IF EXISTS "Categorias: actualizar" ON categorias;
CREATE POLICY "Categorias: actualizar" ON categorias
    FOR UPDATE USING (
        tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin', 'editor'])
    );

DROP POLICY IF EXISTS "Categorias: eliminar" ON categorias;
CREATE POLICY "Categorias: eliminar" ON categorias
    FOR DELETE USING (
        tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin'])
    );

-- ============================================
-- TABLA: PRODUCTOS
-- ============================================

DROP POLICY IF EXISTS "Productos: ver" ON productos;
CREATE POLICY "Productos: ver" ON productos
    FOR SELECT USING (
        tienda_id IN (SELECT obtener_tiendas_usuario())
    );

DROP POLICY IF EXISTS "Productos: crear" ON productos;
CREATE POLICY "Productos: crear" ON productos
    FOR INSERT WITH CHECK (
        tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin', 'editor'])
    );

DROP POLICY IF EXISTS "Productos: actualizar" ON productos;
CREATE POLICY "Productos: actualizar" ON productos
    FOR UPDATE USING (
        tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin', 'editor'])
    );

DROP POLICY IF EXISTS "Productos: eliminar" ON productos;
CREATE POLICY "Productos: eliminar" ON productos
    FOR DELETE USING (
        tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin'])
    );

-- ============================================
-- TABLA: PRODUCTO_VARIANTES
-- ============================================

DROP POLICY IF EXISTS "ProductoVariantes: ver" ON producto_variantes;
CREATE POLICY "ProductoVariantes: ver" ON producto_variantes
    FOR SELECT USING (
        producto_id IN (
            SELECT id FROM productos 
            WHERE tienda_id IN (SELECT obtener_tiendas_usuario())
        )
    );

DROP POLICY IF EXISTS "ProductoVariantes: crear" ON producto_variantes;
CREATE POLICY "ProductoVariantes: crear" ON producto_variantes
    FOR INSERT WITH CHECK (
        producto_id IN (
            SELECT id FROM productos 
            WHERE tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin', 'editor'])
        )
    );

DROP POLICY IF EXISTS "ProductoVariantes: actualizar" ON producto_variantes;
CREATE POLICY "ProductoVariantes: actualizar" ON producto_variantes
    FOR UPDATE USING (
        producto_id IN (
            SELECT id FROM productos 
            WHERE tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin', 'editor'])
        )
    );

DROP POLICY IF EXISTS "ProductoVariantes: eliminar" ON producto_variantes;
CREATE POLICY "ProductoVariantes: eliminar" ON producto_variantes
    FOR DELETE USING (
        producto_id IN (
            SELECT id FROM productos 
            WHERE tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin'])
        )
    );

-- ============================================
-- TABLA: PRODUCTO_IMAGENES
-- ============================================

DROP POLICY IF EXISTS "ProductoImagenes: ver" ON producto_imagenes;
CREATE POLICY "ProductoImagenes: ver" ON producto_imagenes
    FOR SELECT USING (
        producto_id IN (
            SELECT id FROM productos 
            WHERE tienda_id IN (SELECT obtener_tiendas_usuario())
        )
    );

DROP POLICY IF EXISTS "ProductoImagenes: crear" ON producto_imagenes;
CREATE POLICY "ProductoImagenes: crear" ON producto_imagenes
    FOR INSERT WITH CHECK (
        producto_id IN (
            SELECT id FROM productos 
            WHERE tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin', 'editor'])
        )
    );

DROP POLICY IF EXISTS "ProductoImagenes: actualizar" ON producto_imagenes;
CREATE POLICY "ProductoImagenes: actualizar" ON producto_imagenes
    FOR UPDATE USING (
        producto_id IN (
            SELECT id FROM productos 
            WHERE tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin', 'editor'])
        )
    );

DROP POLICY IF EXISTS "ProductoImagenes: eliminar" ON producto_imagenes;
CREATE POLICY "ProductoImagenes: eliminar" ON producto_imagenes
    FOR DELETE USING (
        producto_id IN (
            SELECT id FROM productos 
            WHERE tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin', 'editor'])
        )
    );

-- ============================================
-- TABLA: PRODUCTO_ATRIBUTOS
-- ============================================

DROP POLICY IF EXISTS "ProductoAtributos: ver" ON producto_atributos;
CREATE POLICY "ProductoAtributos: ver" ON producto_atributos
    FOR SELECT USING (
        tienda_id IN (SELECT obtener_tiendas_usuario())
    );

DROP POLICY IF EXISTS "ProductoAtributos: crear" ON producto_atributos;
CREATE POLICY "ProductoAtributos: crear" ON producto_atributos
    FOR INSERT WITH CHECK (
        tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin', 'editor'])
    );

DROP POLICY IF EXISTS "ProductoAtributos: actualizar" ON producto_atributos;
CREATE POLICY "ProductoAtributos: actualizar" ON producto_atributos
    FOR UPDATE USING (
        tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin', 'editor'])
    );

DROP POLICY IF EXISTS "ProductoAtributos: eliminar" ON producto_atributos;
CREATE POLICY "ProductoAtributos: eliminar" ON producto_atributos
    FOR DELETE USING (
        tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin'])
    );

-- ============================================
-- TABLA: CLIENTES
-- ============================================

DROP POLICY IF EXISTS "Clientes: ver" ON clientes;
CREATE POLICY "Clientes: ver" ON clientes
    FOR SELECT USING (
        tienda_id IN (SELECT obtener_tiendas_usuario())
    );

DROP POLICY IF EXISTS "Clientes: crear" ON clientes;
CREATE POLICY "Clientes: crear" ON clientes
    FOR INSERT WITH CHECK (
        tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin', 'editor'])
    );

DROP POLICY IF EXISTS "Clientes: actualizar" ON clientes;
CREATE POLICY "Clientes: actualizar" ON clientes
    FOR UPDATE USING (
        tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin', 'editor'])
    );

DROP POLICY IF EXISTS "Clientes: eliminar" ON clientes;
CREATE POLICY "Clientes: eliminar" ON clientes
    FOR DELETE USING (
        tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin'])
    );

-- ============================================
-- TABLA: CLIENTE_DIRECCIONES
-- ============================================

DROP POLICY IF EXISTS "ClienteDirecciones: ver" ON cliente_direcciones;
CREATE POLICY "ClienteDirecciones: ver" ON cliente_direcciones
    FOR SELECT USING (
        cliente_id IN (
            SELECT id FROM clientes 
            WHERE tienda_id IN (SELECT obtener_tiendas_usuario())
        )
    );

DROP POLICY IF EXISTS "ClienteDirecciones: crear" ON cliente_direcciones;
CREATE POLICY "ClienteDirecciones: crear" ON cliente_direcciones
    FOR INSERT WITH CHECK (
        cliente_id IN (
            SELECT id FROM clientes 
            WHERE tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin', 'editor'])
        )
    );

DROP POLICY IF EXISTS "ClienteDirecciones: actualizar" ON cliente_direcciones;
CREATE POLICY "ClienteDirecciones: actualizar" ON cliente_direcciones
    FOR UPDATE USING (
        cliente_id IN (
            SELECT id FROM clientes 
            WHERE tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin', 'editor'])
        )
    );

DROP POLICY IF EXISTS "ClienteDirecciones: eliminar" ON cliente_direcciones;
CREATE POLICY "ClienteDirecciones: eliminar" ON cliente_direcciones
    FOR DELETE USING (
        cliente_id IN (
            SELECT id FROM clientes 
            WHERE tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin'])
        )
    );

-- ============================================
-- TABLA: PEDIDOS
-- ============================================

DROP POLICY IF EXISTS "Pedidos: ver" ON pedidos;
CREATE POLICY "Pedidos: ver" ON pedidos
    FOR SELECT USING (
        tienda_id IN (SELECT obtener_tiendas_usuario())
    );

DROP POLICY IF EXISTS "Pedidos: crear" ON pedidos;
CREATE POLICY "Pedidos: crear" ON pedidos
    FOR INSERT WITH CHECK (
        tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin', 'editor'])
    );

DROP POLICY IF EXISTS "Pedidos: actualizar" ON pedidos;
CREATE POLICY "Pedidos: actualizar" ON pedidos
    FOR UPDATE USING (
        tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin', 'editor'])
    );

DROP POLICY IF EXISTS "Pedidos: eliminar" ON pedidos;
CREATE POLICY "Pedidos: eliminar" ON pedidos
    FOR DELETE USING (
        tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin'])
    );

-- ============================================
-- TABLA: PEDIDO_DETALLES
-- ============================================

DROP POLICY IF EXISTS "PedidoDetalles: ver" ON pedido_detalles;
CREATE POLICY "PedidoDetalles: ver" ON pedido_detalles
    FOR SELECT USING (
        pedido_id IN (
            SELECT id FROM pedidos 
            WHERE tienda_id IN (SELECT obtener_tiendas_usuario())
        )
    );

DROP POLICY IF EXISTS "PedidoDetalles: crear" ON pedido_detalles;
CREATE POLICY "PedidoDetalles: crear" ON pedido_detalles
    FOR INSERT WITH CHECK (
        pedido_id IN (
            SELECT id FROM pedidos 
            WHERE tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin', 'editor'])
        )
    );

DROP POLICY IF EXISTS "PedidoDetalles: actualizar" ON pedido_detalles;
CREATE POLICY "PedidoDetalles: actualizar" ON pedido_detalles
    FOR UPDATE USING (
        pedido_id IN (
            SELECT id FROM pedidos 
            WHERE tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin', 'editor'])
        )
    );

DROP POLICY IF EXISTS "PedidoDetalles: eliminar" ON pedido_detalles;
CREATE POLICY "PedidoDetalles: eliminar" ON pedido_detalles
    FOR DELETE USING (
        pedido_id IN (
            SELECT id FROM pedidos 
            WHERE tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin'])
        )
    );

-- ============================================
-- TABLA: PEDIDO_HISTORIAL_ESTADOS
-- ============================================

DROP POLICY IF EXISTS "PedidoHistorial: ver" ON pedido_historial_estados;
CREATE POLICY "PedidoHistorial: ver" ON pedido_historial_estados
    FOR SELECT USING (
        pedido_id IN (
            SELECT id FROM pedidos 
            WHERE tienda_id IN (SELECT obtener_tiendas_usuario())
        )
    );

DROP POLICY IF EXISTS "PedidoHistorial: crear" ON pedido_historial_estados;
CREATE POLICY "PedidoHistorial: crear" ON pedido_historial_estados
    FOR INSERT WITH CHECK (
        pedido_id IN (
            SELECT id FROM pedidos 
            WHERE tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin', 'editor'])
        )
    );

-- Historial no se actualiza ni elimina (es log)

-- ============================================
-- TABLA: METODOS_PAGO
-- ============================================

DROP POLICY IF EXISTS "MetodosPago: ver" ON metodos_pago;
CREATE POLICY "MetodosPago: ver" ON metodos_pago
    FOR SELECT USING (
        tienda_id IN (SELECT obtener_tiendas_usuario())
    );

DROP POLICY IF EXISTS "MetodosPago: crear" ON metodos_pago;
CREATE POLICY "MetodosPago: crear" ON metodos_pago
    FOR INSERT WITH CHECK (
        tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin'])
    );

DROP POLICY IF EXISTS "MetodosPago: actualizar" ON metodos_pago;
CREATE POLICY "MetodosPago: actualizar" ON metodos_pago
    FOR UPDATE USING (
        tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin'])
    );

DROP POLICY IF EXISTS "MetodosPago: eliminar" ON metodos_pago;
CREATE POLICY "MetodosPago: eliminar" ON metodos_pago
    FOR DELETE USING (
        tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin'])
    );

-- ============================================
-- TABLA: ZONAS_ENVIO
-- ============================================

DROP POLICY IF EXISTS "ZonasEnvio: ver" ON zonas_envio;
CREATE POLICY "ZonasEnvio: ver" ON zonas_envio
    FOR SELECT USING (
        tienda_id IN (SELECT obtener_tiendas_usuario())
    );

DROP POLICY IF EXISTS "ZonasEnvio: crear" ON zonas_envio;
CREATE POLICY "ZonasEnvio: crear" ON zonas_envio
    FOR INSERT WITH CHECK (
        tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin'])
    );

DROP POLICY IF EXISTS "ZonasEnvio: actualizar" ON zonas_envio;
CREATE POLICY "ZonasEnvio: actualizar" ON zonas_envio
    FOR UPDATE USING (
        tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin'])
    );

DROP POLICY IF EXISTS "ZonasEnvio: eliminar" ON zonas_envio;
CREATE POLICY "ZonasEnvio: eliminar" ON zonas_envio
    FOR DELETE USING (
        tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin'])
    );

-- ============================================
-- TABLA: ZONA_ENVIO_UBIGEOS
-- ============================================

DROP POLICY IF EXISTS "ZonaEnvioUbigeos: ver" ON zona_envio_ubigeos;
CREATE POLICY "ZonaEnvioUbigeos: ver" ON zona_envio_ubigeos
    FOR SELECT USING (
        zona_envio_id IN (
            SELECT id FROM zonas_envio 
            WHERE tienda_id IN (SELECT obtener_tiendas_usuario())
        )
    );

DROP POLICY IF EXISTS "ZonaEnvioUbigeos: crear" ON zona_envio_ubigeos;
CREATE POLICY "ZonaEnvioUbigeos: crear" ON zona_envio_ubigeos
    FOR INSERT WITH CHECK (
        zona_envio_id IN (
            SELECT id FROM zonas_envio 
            WHERE tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin'])
        )
    );

DROP POLICY IF EXISTS "ZonaEnvioUbigeos: eliminar" ON zona_envio_ubigeos;
CREATE POLICY "ZonaEnvioUbigeos: eliminar" ON zona_envio_ubigeos
    FOR DELETE USING (
        zona_envio_id IN (
            SELECT id FROM zonas_envio 
            WHERE tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin'])
        )
    );

-- ============================================
-- TABLA: USUARIO_TIENDAS
-- ============================================

DROP POLICY IF EXISTS "UsuarioTiendas: ver mis relaciones" ON usuario_tiendas;
CREATE POLICY "UsuarioTiendas: ver mis relaciones" ON usuario_tiendas
    FOR SELECT USING (
        user_id = auth.uid()
        OR
        tienda_id IN (
            SELECT tienda_id FROM usuario_tiendas 
            WHERE user_id = auth.uid() 
            AND rol IN ('owner', 'admin')
            AND activo = true
        )
    );

DROP POLICY IF EXISTS "UsuarioTiendas: crear" ON usuario_tiendas;
CREATE POLICY "UsuarioTiendas: crear" ON usuario_tiendas
    FOR INSERT WITH CHECK (
        -- Owner/Admin pueden agregar usuarios a su tienda
        tiene_rol_en_tienda(tienda_id, ARRAY['owner', 'admin'])
        OR
        -- O es el creador inicial (cuando crea tienda)
        (user_id = auth.uid() AND rol = 'owner')
    );

DROP POLICY IF EXISTS "UsuarioTiendas: actualizar" ON usuario_tiendas;
CREATE POLICY "UsuarioTiendas: actualizar" ON usuario_tiendas
    FOR UPDATE USING (
        tiene_rol_en_tienda(tienda_id, ARRAY['owner'])
    );

DROP POLICY IF EXISTS "UsuarioTiendas: eliminar" ON usuario_tiendas;
CREATE POLICY "UsuarioTiendas: eliminar" ON usuario_tiendas
    FOR DELETE USING (
        tiene_rol_en_tienda(tienda_id, ARRAY['owner'])
        AND user_id != auth.uid()  -- No puede eliminarse a sí mismo
    );

-- ============================================
-- RESUMEN DE PERMISOS POR ROL
-- ============================================

/*
┌────────────────────┬─────────┬─────────┬─────────┬─────────┐
│ Acción             │ Owner   │ Admin   │ Editor  │ Viewer  │
├────────────────────┼─────────┼─────────┼─────────┼─────────┤
│ Ver datos          │ ✅      │ ✅      │ ✅      │ ✅      │
│ Crear productos    │ ✅      │ ✅      │ ✅      │ ❌      │
│ Editar productos   │ ✅      │ ✅      │ ✅      │ ❌      │
│ Eliminar productos │ ✅      │ ✅      │ ❌      │ ❌      │
│ Gestionar pedidos  │ ✅      │ ✅      │ ✅      │ ❌      │
│ Config. tienda     │ ✅      │ ✅      │ ❌      │ ❌      │
│ Config. pagos      │ ✅      │ ✅      │ ❌      │ ❌      │
│ Config. envíos     │ ✅      │ ✅      │ ❌      │ ❌      │
│ Invitar usuarios   │ ✅      │ ✅      │ ❌      │ ❌      │
│ Cambiar roles      │ ✅      │ ❌      │ ❌      │ ❌      │
│ Eliminar usuarios  │ ✅      │ ❌      │ ❌      │ ❌      │
│ Eliminar tienda    │ ✅      │ ❌      │ ❌      │ ❌      │
└────────────────────┴─────────┴─────────┴─────────┴─────────┘
*/

-- ============================================
-- FIN DEL SCRIPT DE POLÍTICAS RLS
-- ============================================