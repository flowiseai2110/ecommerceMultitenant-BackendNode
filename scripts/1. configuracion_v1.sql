-- CLAUDE: https://claude.ai/chat/d6f07020-06a5-493a-a1a3-285e03a1a137

-- ============================================
-- MINI E-COMMERCE PARA EMPRENDEDORES
-- Script para Supabase (PostgreSQL)
-- Versión 2.0 - Sin ENUMs, con tabla enumerados
-- ============================================

-- ============================================
-- EXTENSIONES
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLA: ENUMERADOS (Reemplaza los ENUMs)
-- ============================================

CREATE TABLE enumerados (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tipo VARCHAR(50) NOT NULL,
    codigo VARCHAR(50) NOT NULL,
    valor VARCHAR(100) NOT NULL,
    descripcion TEXT,
    orden INT DEFAULT 0,
    color VARCHAR(20),
    icono VARCHAR(50),
    metadata JSONB,
    activo BOOLEAN DEFAULT true,
    
    CONSTRAINT uq_enumerado_tipo_codigo UNIQUE (tipo, codigo)
);

-- Índices para enumerados
CREATE INDEX idx_enumerados_tipo ON enumerados(tipo);
CREATE INDEX idx_enumerados_activo ON enumerados(tipo, activo);

COMMENT ON TABLE enumerados IS 'Tabla genérica para valores enumerados del sistema';
COMMENT ON COLUMN enumerados.tipo IS 'Agrupa los valores: estado_pedido, estado_pago, tipo_negocio, etc.';
COMMENT ON COLUMN enumerados.codigo IS 'Código interno usado en las tablas';
COMMENT ON COLUMN enumerados.valor IS 'Nombre para mostrar en UI';


-- ============================================
-- MÓDULO: UBIGEO
-- ============================================

CREATE TABLE ubigeos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo VARCHAR(8) NOT NULL UNIQUE,
    tipo VARCHAR(50) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    codigo_padre VARCHAR(8),
    activo BOOLEAN DEFAULT true,
    
    CONSTRAINT fk_ubigeo_padre FOREIGN KEY (codigo_padre) REFERENCES ubigeos(codigo)
);

-- Índices para ubigeos
CREATE INDEX idx_ubigeos_codigo ON ubigeos(codigo);
CREATE INDEX idx_ubigeos_tipo ON ubigeos(tipo);
CREATE INDEX idx_ubigeos_codigo_padre ON ubigeos(codigo_padre);

COMMENT ON TABLE ubigeos IS 'Tabla de ubicaciones geográficas (país, departamento, provincia, distrito)';
COMMENT ON COLUMN ubigeos.codigo IS 'Código de 8 dígitos: 2 país + 2 departamento + 2 provincia + 2 distrito';

-- ============================================
-- MÓDULO: TIENDA
-- ============================================

CREATE TABLE tiendas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT,
    logo_url VARCHAR(500),
    banner_url VARCHAR(500),
    whatsapp_numero VARCHAR(20),
    email VARCHAR(100),
    direccion TEXT,
    
    -- Datos para facturación electrónica
    ruc VARCHAR(20),
    razon_social VARCHAR(200),
    razon_comercial VARCHAR(200),
    direccion_fiscal TEXT,
    
    -- Ubicación
    ubigeo VARCHAR(8),
    
    -- Configuración general
    moneda VARCHAR(3) DEFAULT 'PEN',
    tipo_negocio VARCHAR(50) DEFAULT 'productos',
    activo BOOLEAN DEFAULT true,
    
    -- Auditoría
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_registro VARCHAR(100),
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actualizacion VARCHAR(100),
    
    CONSTRAINT fk_tienda_ubigeo FOREIGN KEY (ubigeo) REFERENCES ubigeos(codigo)
);
 

COMMENT ON TABLE tiendas IS 'Tiendas/negocios de los emprendedores';

-- ============================================
-- TABLA: TIENDA CONFIGURACIONES
-- ============================================

CREATE TABLE tienda_configuraciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tienda_id UUID NOT NULL,
    clave VARCHAR(100) NOT NULL,
    valor JSONB,
    categoria VARCHAR(50),
    
    -- Auditoría
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_registro VARCHAR(100),
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actualizacion VARCHAR(100),
    
    CONSTRAINT fk_config_tienda FOREIGN KEY (tienda_id) REFERENCES tiendas(id) ON DELETE CASCADE,
    CONSTRAINT uq_tienda_clave UNIQUE (tienda_id, clave)
);

-- Índices para tienda_configuraciones
CREATE INDEX idx_tienda_config_tienda ON tienda_configuraciones(tienda_id); 

COMMENT ON TABLE tienda_configuraciones IS 'Configuraciones flexibles por tienda (clave-valor)';
COMMENT ON COLUMN tienda_configuraciones.categoria IS 'Categorías: general, pedidos, notificaciones, apariencia, chatbot';

-- ============================================
-- MÓDULO: CATÁLOGO
-- ============================================

CREATE TABLE categorias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tienda_id UUID NOT NULL,
    categoria_padre_id UUID,
    nombre VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    descripcion TEXT,
    imagen_url VARCHAR(500),
    orden INT DEFAULT 0,
    activo BOOLEAN DEFAULT true,
    
    CONSTRAINT fk_categoria_tienda FOREIGN KEY (tienda_id) REFERENCES tiendas(id) ON DELETE CASCADE,
    CONSTRAINT fk_categoria_padre FOREIGN KEY (categoria_padre_id) REFERENCES categorias(id) ON DELETE SET NULL
);

-- Índices para categorias
CREATE INDEX idx_categorias_tienda ON categorias(tienda_id);

COMMENT ON TABLE categorias IS 'Categorías de productos por tienda';

-- ============================================
-- TABLA: PRODUCTOS
-- ============================================

CREATE TABLE productos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tienda_id UUID NOT NULL,
    categoria_id UUID,
    nombre VARCHAR(200) NOT NULL,
    slug VARCHAR(200) NOT NULL,
    descripcion TEXT,
    descripcion_corta VARCHAR(500),
    sku VARCHAR(50),
    precio_base DECIMAL(10,2) NOT NULL,
    precio_oferta DECIMAL(10,2),
    precio_costo DECIMAL(10,2),
    stock INT DEFAULT 0,
    stock_alerta INT DEFAULT 5,
    unidad VARCHAR(20) DEFAULT 'pieza',
    activo BOOLEAN DEFAULT true,
    destacado BOOLEAN DEFAULT false,
    es_servicio BOOLEAN DEFAULT false,
    etiquetas TEXT[],
    metadata JSONB,
    
    -- Auditoría
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_registro VARCHAR(100),
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actualizacion VARCHAR(100),
    
    CONSTRAINT fk_producto_tienda FOREIGN KEY (tienda_id) REFERENCES tiendas(id) ON DELETE CASCADE,
    CONSTRAINT fk_producto_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL
);

-- Índices para productos
CREATE INDEX idx_productos_tienda ON productos(tienda_id);
CREATE INDEX idx_productos_categoria ON productos(categoria_id);
CREATE INDEX idx_productos_activo ON productos(tienda_id, activo); 

COMMENT ON TABLE productos IS 'Catálogo de productos y servicios';
COMMENT ON COLUMN productos.metadata IS 'Atributos flexibles según tipo de producto (marca, material, etc.)';

-- ============================================
-- TABLA: PRODUCTO VARIANTES
-- ============================================

CREATE TABLE producto_variantes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    producto_id UUID NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    sku VARCHAR(50),
    precio DECIMAL(10,2),
    stock INT DEFAULT 0,
    atributos JSONB,
    activo BOOLEAN DEFAULT true,
    
    -- Auditoría
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_registro VARCHAR(100),
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actualizacion VARCHAR(100),
    
    CONSTRAINT fk_variante_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
);

-- Índices para producto_variantes
CREATE INDEX idx_variantes_producto ON producto_variantes(producto_id);

COMMENT ON TABLE producto_variantes IS 'Variantes de producto (talla, color, etc.)';
COMMENT ON COLUMN producto_variantes.atributos IS 'Ej: {"talla": "M", "color": "Rojo"}';

-- ============================================
-- TABLA: PRODUCTO IMÁGENES
-- ============================================

CREATE TABLE producto_imagenes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    producto_id UUID NOT NULL,
    variante_id UUID,
    url VARCHAR(500) NOT NULL,
    texto_alternativo VARCHAR(200),
    orden INT DEFAULT 0,
    es_principal BOOLEAN DEFAULT false,
    
    CONSTRAINT fk_imagen_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
    CONSTRAINT fk_imagen_variante FOREIGN KEY (variante_id) REFERENCES producto_variantes(id) ON DELETE SET NULL
);

-- Índices para producto_imagenes
CREATE INDEX idx_imagenes_producto ON producto_imagenes(producto_id);
CREATE INDEX idx_imagenes_variante ON producto_imagenes(variante_id);

COMMENT ON TABLE producto_imagenes IS 'Galería de imágenes de productos';

-- ============================================
-- TABLA: PRODUCTO ATRIBUTOS
-- ============================================

CREATE TABLE producto_atributos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tienda_id UUID NOT NULL,
    nombre VARCHAR(50) NOT NULL,
    valores TEXT[],
    aplica_a VARCHAR(50),
    
    CONSTRAINT fk_atributo_tienda FOREIGN KEY (tienda_id) REFERENCES tiendas(id) ON DELETE CASCADE
);

-- Índices para producto_atributos
CREATE INDEX idx_atributos_tienda ON producto_atributos(tienda_id);

COMMENT ON TABLE producto_atributos IS 'Definición de atributos disponibles por tienda';
COMMENT ON COLUMN producto_atributos.valores IS 'Valores posibles: ["S", "M", "L", "XL"]';

-- ============================================
-- MÓDULO: CLIENTES
-- ============================================

CREATE TABLE clientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tienda_id UUID NOT NULL,
    whatsapp_numero VARCHAR(20) NOT NULL,
    nombre VARCHAR(100),
    email VARCHAR(100),
    tipo_documento VARCHAR(10),
    numero_documento VARCHAR(20),
    direccion_predeterminada TEXT,
    ubigeo VARCHAR(8),
    notas TEXT,
    total_pedidos INT DEFAULT 0,
    total_gastado DECIMAL(12,2) DEFAULT 0,
    ultimo_pedido_fecha TIMESTAMP,
    
    -- Auditoría
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_registro VARCHAR(100),
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actualizacion VARCHAR(100),
    
    CONSTRAINT fk_cliente_tienda FOREIGN KEY (tienda_id) REFERENCES tiendas(id) ON DELETE CASCADE,
    CONSTRAINT fk_cliente_ubigeo FOREIGN KEY (ubigeo) REFERENCES ubigeos(codigo),
    CONSTRAINT uq_cliente_whatsapp UNIQUE (tienda_id, whatsapp_numero)
);

-- Índices para clientes
CREATE INDEX idx_clientes_tienda ON clientes(tienda_id); 

COMMENT ON TABLE clientes IS 'Clientes de cada tienda';

-- ============================================
-- TABLA: CLIENTE DIRECCIONES
-- ============================================

CREATE TABLE cliente_direcciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID NOT NULL,
    etiqueta VARCHAR(50),
    direccion TEXT NOT NULL,
    ubigeo VARCHAR(8),
    referencia VARCHAR(200),
    es_predeterminada BOOLEAN DEFAULT false,
    
    CONSTRAINT fk_direccion_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    CONSTRAINT fk_direccion_ubigeo FOREIGN KEY (ubigeo) REFERENCES ubigeos(codigo)
);

-- Índices para cliente_direcciones
CREATE INDEX idx_direcciones_cliente ON cliente_direcciones(cliente_id); 

COMMENT ON TABLE cliente_direcciones IS 'Direcciones de envío de los clientes';

-- ============================================
-- MÓDULO: PEDIDOS
-- ============================================

CREATE TABLE pedidos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tienda_id UUID NOT NULL,
    cliente_id UUID,
    numero_pedido VARCHAR(20) NOT NULL,
    estado VARCHAR(50) DEFAULT 'pendiente',
    subtotal DECIMAL(10,2) DEFAULT 0,
    descuento_monto DECIMAL(10,2) DEFAULT 0,
    costo_envio DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) DEFAULT 0,
    metodo_pago VARCHAR(50),
    estado_pago VARCHAR(50) DEFAULT 'pendiente',
    referencia_pago VARCHAR(100),
    metodo_envio VARCHAR(50),
    direccion_envio TEXT,
    notas TEXT,
    origen VARCHAR(20) DEFAULT 'whatsapp',
    fecha_confirmado TIMESTAMP,
    fecha_entregado TIMESTAMP,
    
    -- Auditoría
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_registro VARCHAR(100),
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actualizacion VARCHAR(100),
    
    CONSTRAINT fk_pedido_tienda FOREIGN KEY (tienda_id) REFERENCES tiendas(id) ON DELETE CASCADE,
    CONSTRAINT fk_pedido_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
    CONSTRAINT uq_numero_pedido UNIQUE (tienda_id, numero_pedido)
);

-- Índices para pedidos
CREATE INDEX idx_pedidos_tienda ON pedidos(tienda_id);
CREATE INDEX idx_pedidos_cliente ON pedidos(cliente_id); 
CREATE INDEX idx_pedidos_numero ON pedidos(numero_pedido);

COMMENT ON TABLE pedidos IS 'Pedidos de los clientes';
COMMENT ON COLUMN pedidos.origen IS 'Origen del pedido: whatsapp, web, manual';

-- ============================================
-- TABLA: PEDIDO DETALLES
-- ============================================

CREATE TABLE pedido_detalles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pedido_id UUID NOT NULL,
    producto_id UUID,
    variante_id UUID,
    producto_nombre VARCHAR(200) NOT NULL,
    variante_nombre VARCHAR(100),
    cantidad INT NOT NULL DEFAULT 1,
    precio_unitario DECIMAL(10,2) NOT NULL,
    descuento DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) NOT NULL,
    
    CONSTRAINT fk_detalle_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
    CONSTRAINT fk_detalle_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE SET NULL,
    CONSTRAINT fk_detalle_variante FOREIGN KEY (variante_id) REFERENCES producto_variantes(id) ON DELETE SET NULL
);

-- Índices para pedido_detalles
CREATE INDEX idx_detalles_pedido ON pedido_detalles(pedido_id);
CREATE INDEX idx_detalles_producto ON pedido_detalles(producto_id);

COMMENT ON TABLE pedido_detalles IS 'Detalle de productos en cada pedido';
COMMENT ON COLUMN pedido_detalles.producto_nombre IS 'Snapshot del nombre al momento de la compra';

-- ============================================
-- TABLA: PEDIDO HISTORIAL ESTADOS
-- ============================================

CREATE TABLE pedido_historial_estados (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pedido_id UUID NOT NULL,
    estado VARCHAR(50) NOT NULL,
    notas TEXT,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_historial_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE
);

-- Índices para pedido_historial_estados
CREATE INDEX idx_historial_pedido ON pedido_historial_estados(pedido_id);
CREATE INDEX idx_historial_fecha ON pedido_historial_estados(fecha_registro);

COMMENT ON TABLE pedido_historial_estados IS 'Historial de cambios de estado de pedidos';

-- ============================================
-- MÓDULO: CONFIGURACIÓN
-- ============================================

CREATE TABLE metodos_pago (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tienda_id UUID NOT NULL,
    nombre VARCHAR(50) NOT NULL,
    tipo VARCHAR(50) NOT NULL,
    instrucciones TEXT,
    cuenta_info JSONB,
    activo BOOLEAN DEFAULT true,
    orden INT DEFAULT 0,
    
    CONSTRAINT fk_metodo_tienda FOREIGN KEY (tienda_id) REFERENCES tiendas(id) ON DELETE CASCADE
);

-- Índices para metodos_pago
CREATE INDEX idx_metodos_tienda ON metodos_pago(tienda_id);
CREATE INDEX idx_metodos_activo ON metodos_pago(tienda_id, activo);

COMMENT ON TABLE metodos_pago IS 'Métodos de pago disponibles por tienda';
COMMENT ON COLUMN metodos_pago.cuenta_info IS 'Info de cuenta: {"banco": "BCP", "cuenta": "123456", "cci": "00212345"}';

-- ============================================
-- TABLA: ZONAS ENVÍO
-- ============================================

CREATE TABLE zonas_envio (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tienda_id UUID NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    costo_envio DECIMAL(10,2) NOT NULL DEFAULT 0,
    envio_gratis_minimo DECIMAL(10,2),
    dias_estimados INT,
    activo BOOLEAN DEFAULT true,
    
    CONSTRAINT fk_zona_tienda FOREIGN KEY (tienda_id) REFERENCES tiendas(id) ON DELETE CASCADE
);

-- Índices para zonas_envio
CREATE INDEX idx_zonas_tienda ON zonas_envio(tienda_id);
CREATE INDEX idx_zonas_activo ON zonas_envio(tienda_id, activo);

COMMENT ON TABLE zonas_envio IS 'Zonas de envío con costos por tienda';

-- ============================================
-- TABLA: ZONA ENVÍO UBIGEOS (Intermedia)
-- ============================================

CREATE TABLE zona_envio_ubigeos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zona_envio_id UUID NOT NULL,
    ubigeo VARCHAR(8) NOT NULL,
    
    CONSTRAINT fk_zona_ubigeo_zona FOREIGN KEY (zona_envio_id) REFERENCES zonas_envio(id) ON DELETE CASCADE,
    CONSTRAINT fk_zona_ubigeo_ubigeo FOREIGN KEY (ubigeo) REFERENCES ubigeos(codigo),
    CONSTRAINT uq_zona_ubigeo UNIQUE (zona_envio_id, ubigeo)
);

-- Índices para zona_envio_ubigeos
CREATE INDEX idx_zona_ubigeos_zona ON zona_envio_ubigeos(zona_envio_id);
CREATE INDEX idx_zona_ubigeos_ubigeo ON zona_envio_ubigeos(ubigeo);

COMMENT ON TABLE zona_envio_ubigeos IS 'Relación entre zonas de envío y ubigeos';

-- ============================================
-- FUNCIÓN: Registrar cambio de estado de pedido
-- ============================================

CREATE OR REPLACE FUNCTION registrar_cambio_estado_pedido()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.estado IS DISTINCT FROM NEW.estado THEN
        INSERT INTO pedido_historial_estados (pedido_id, estado, notas)
        VALUES (NEW.id, NEW.estado, 'Cambio automático de estado');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_pedido_cambio_estado
    AFTER UPDATE ON pedidos
    FOR EACH ROW
    EXECUTE FUNCTION registrar_cambio_estado_pedido();

-- ============================================
-- FUNCIÓN: Actualizar estadísticas del cliente
-- ============================================

CREATE OR REPLACE FUNCTION actualizar_estadisticas_cliente()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.estado = 'entregado' AND OLD.estado != 'entregado' THEN
        UPDATE clientes
        SET 
            total_pedidos = total_pedidos + 1,
            total_gastado = total_gastado + NEW.total,
            ultimo_pedido_fecha = CURRENT_TIMESTAMP
        WHERE id = NEW.cliente_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_actualizar_stats_cliente
    AFTER UPDATE ON pedidos
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_estadisticas_cliente();


-- ============================================
-- FIN DEL SCRIPT - 15/06
-- ============================================