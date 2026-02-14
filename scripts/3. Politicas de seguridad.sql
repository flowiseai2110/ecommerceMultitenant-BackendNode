

-- ============================================
-- POLÍTICAS RLS (Row Level Security) PARA SUPABASE
-- ============================================

-- Habilitar RLS en todas las tablas
ALTER TABLE enumerados ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE tienda_configuraciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE producto_variantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE producto_imagenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE producto_atributos ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cliente_direcciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_detalles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_historial_estados ENABLE ROW LEVEL SECURITY;
ALTER TABLE metodos_pago ENABLE ROW LEVEL SECURITY;
ALTER TABLE zonas_envio ENABLE ROW LEVEL SECURITY;
ALTER TABLE zona_envio_ubigeos ENABLE ROW LEVEL SECURITY;

-- Política pública para enumerados (todos pueden leer)
CREATE POLICY "Enumerados lectura pública" ON enumerados
    FOR SELECT USING (true);

-- Política pública para ubigeos (todos pueden leer)
CREATE POLICY "Ubigeos lectura pública" ON ubigeos
    FOR SELECT USING (true);