//INICIALIZANDO PROYECTO


Inicializa el proyecto Node
npm init -y

Instala lo mínimo necesario:
npm install express cors dotenv
npm install prisma --save-dev
npm install @prisma/client

Supabase
db_tests
Sistemas_21_10

model Persona {
  id        Int      @id @default(autoincrement())
  dni     String   
  nombre    String
  apellidoPaterno String
  apellidoMaterno String
  creadoEn  DateTime @default(now())
}


#PRISMA 
npx prisma generate


#configuracion para reiniciar el modelo

npx prisma generate


Algoritmos
https://www.academia-x.com/settings/member_setup?return_to=BAhbB3sHOgdpZEkiDDFmMTZlOWMGOgZFVDoKdmFsdWUiJ2h0dHBzOi8vd3d3LmFjYWRlbWlhLXguY29tL2xpYnJhcnlVOiBBY3RpdmVTdXBwb3J0OjpUaW1lV2l0aFpvbmVbCEl1OglUaW1lDSSEH8AKk8FSCToNbmFub19udW1pAq8DOg1uYW5vX2RlbmkGOg1zdWJtaWNybyIHlDA6CXpvbmVJIghVVEMGOwZGSSITQW1lcmljYS9Cb2dvdGEGOwZUSXU7CQ33gx%2FACpPBUgk7CmkCrwM7C2kGOwwiB5QwOw1ADA%3D%3D--5533d90bffe4035c23ec65359c91ed98f53bcd9b

Sistemas2110

si no encuentras la informacion no rellenes este dato.

si necesitas mas informacion, hazme las preguntas que consideres necesario.

No hagas suposiciones en la respuesta.

No bases tu respuesta en estereotipos o juicios de valor infundados.

FRAMEWORK CICLO

C: CONTEXTO     -> PROPORCIONAL LA INFORMACION NECESARIO PARA QUE EL MODELO ENTIENDA LA SITUACION
I: INSTRUCCIONES -> EXPLICA DE MANERA CLARA Y PRECISA LO QUE ESPERAS QUE EL MODELO HAGA.
C: CONDICIONES   -> ESTABLECE LAS REGLAS O REQUISITOS QUE DEBEN CUMPLIRSE DURANTE LA TAREA.
L: LIMITES       -> DEFINE LOS LIMITES QUE DEBEN TENERSE ENCUENTA PARA CUMPLIR LA TAREA
O: OUTPUT        -> EXPLICA COMO DEBE SER EL RESULTADO FINAL Y QUE CARACTERISTICAS DEBE TENER.


--------------------- PROMPT ----------------------------

#CONTEXTO: estoy realizando una aplicacion web, multi tiendas es un sass, estoy utilizando para este proyecto frontend: angular,typescript, tailwind , backend nodejs, prisma como orm y base de datos supabase #MODELO DE DATOS: 
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
    activo BOOLEAN DEFAULT true 
);
  

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
); 

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
    
 
);
  

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
  
);
 
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
     
);
 

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
    usuario_actualizacion VARCHAR(100)
);
 

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
    activo BOOLEAN DEFAULT true
);
 
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
    es_principal BOOLEAN DEFAULT false
);
  
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
     
);
 
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
    es_predeterminada BOOLEAN DEFAULT false
);
 

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
    fecha_entregado TIMESTAMP
);
 

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
     
);
 

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
 
);
 

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
    activo BOOLEAN DEFAULT true 
);
 
 

-- ============================================
-- TABLA: ZONA ENVÍO UBIGEOS (Intermedia)
-- ============================================

CREATE TABLE zona_envio_ubigeos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zona_envio_id UUID NOT NULL,
    ubigeo VARCHAR(8) NOT NULL 
);
  

 #INSTRUCCIONES: 1. analiza si es necesario instalar redis como cache es sufiente otra forma de cachear los datos #LIMITES: esta aplicacion la estoy pensando implementar en Peru, Latinoamerica #salida muestra un cuadro comparativo