
-- ============================================
-- DATOS INICIALES: ENUMERADOS
-- ============================================

INSERT INTO enumerados (tipo, codigo, valor, descripcion, orden, color, icono, metadata) VALUES
-- Estado de pedido
('estado_pedido', 'pendiente', 'Pendiente', 'El pedido está esperando confirmación', 1, '#FFA500', 'clock', '{"permite_cancelar": true}'),
('estado_pedido', 'confirmado', 'Confirmado', 'El pedido ha sido confirmado', 2, '#3498DB', 'check-circle', '{"permite_cancelar": true}'),
('estado_pedido', 'preparando', 'En preparación', 'El pedido se está preparando', 3, '#9B59B6', 'package', '{"permite_cancelar": false}'),
('estado_pedido', 'enviado', 'Enviado', 'El pedido ha sido enviado', 4, '#1ABC9C', 'truck', '{"permite_cancelar": false}'),
('estado_pedido', 'entregado', 'Entregado', 'El pedido ha sido entregado', 5, '#27AE60', 'check-square', '{"permite_cancelar": false}'),
('estado_pedido', 'cancelado', 'Cancelado', 'El pedido ha sido cancelado', 6, '#E74C3C', 'x-circle', '{"permite_cancelar": false}'),

-- Estado de pago
('estado_pago', 'pendiente', 'Pendiente', 'El pago está pendiente', 1, '#FFA500', 'clock', NULL),
('estado_pago', 'pagado', 'Pagado', 'El pago ha sido recibido', 2, '#27AE60', 'check-circle', NULL),
('estado_pago', 'reembolsado', 'Reembolsado', 'El pago ha sido devuelto', 3, '#E74C3C', 'rotate-ccw', NULL),

-- Tipo de negocio
('tipo_negocio', 'productos', 'Productos', 'Venta de productos físicos', 1, NULL, 'box', NULL),
('tipo_negocio', 'servicios', 'Servicios', 'Prestación de servicios', 2, NULL, 'briefcase', NULL),
('tipo_negocio', 'ambos', 'Productos y Servicios', 'Venta de productos y servicios', 3, NULL, 'layers', NULL),

-- Tipo de método de pago
('tipo_metodo_pago', 'efectivo', 'Efectivo', 'Pago en efectivo', 1, NULL, 'banknote', NULL),
('tipo_metodo_pago', 'transferencia', 'Transferencia', 'Transferencia bancaria', 2, NULL, 'building', NULL),
('tipo_metodo_pago', 'billetera', 'Billetera digital', 'Yape, Plin, etc.', 3, NULL, 'smartphone', NULL),
('tipo_metodo_pago', 'tarjeta', 'Tarjeta', 'Tarjeta de crédito o débito', 4, NULL, 'credit-card', NULL),

-- Tipo de ubigeo
('tipo_ubigeo', 'pais', 'País', 'País', 1, NULL, 'globe', NULL),
('tipo_ubigeo', 'departamento', 'Departamento', 'Departamento o región', 2, NULL, 'map', NULL),
('tipo_ubigeo', 'provincia', 'Provincia', 'Provincia', 3, NULL, 'map-pin', NULL),
('tipo_ubigeo', 'distrito', 'Distrito', 'Distrito', 4, NULL, 'navigation', NULL);



-- ============================================
-- DATOS INICIALES: UBIGEOS DE EJEMPLO (PERÚ)
-- ============================================

INSERT INTO ubigeos (codigo, tipo, nombre, codigo_padre) VALUES
-- País
('01000000', 'pais', 'Perú', NULL),

-- Departamentos
('01150000', 'departamento', 'Lima', '01000000'),
('01130000', 'departamento', 'La Libertad', '01000000'),
('01040000', 'departamento', 'Arequipa', '01000000'),

-- Provincias de Lima
('01150100', 'provincia', 'Lima', '01150000'),
('01150700', 'provincia', 'Callao', '01150000'),

-- Distritos de Lima Provincia
('01150101', 'distrito', 'Lima', '01150100'),
('01150102', 'distrito', 'Miraflores', '01150100'),
('01150103', 'distrito', 'San Isidro', '01150100'),
('01150104', 'distrito', 'Surco', '01150100'),
('01150105', 'distrito', 'San Borja', '01150100'),
('01150106', 'distrito', 'La Molina', '01150100'),
('01150107', 'distrito', 'Barranco', '01150100'),
('01150108', 'distrito', 'Chorrillos', '01150100'),
('01150109', 'distrito', 'San Miguel', '01150100'),
('01150110', 'distrito', 'Jesús María', '01150100'),
('01150111', 'distrito', 'Lince', '01150100'),
('01150112', 'distrito', 'Magdalena', '01150100'),
('01150113', 'distrito', 'Pueblo Libre', '01150100'),
('01150114', 'distrito', 'Breña', '01150100'),
('01150115', 'distrito', 'La Victoria', '01150100'),
('01150116', 'distrito', 'San Luis', '01150100'),
('01150117', 'distrito', 'El Agustino', '01150100'),
('01150118', 'distrito', 'Santa Anita', '01150100'),
('01150119', 'distrito', 'Ate', '01150100'),
('01150120', 'distrito', 'San Juan de Lurigancho', '01150100'),
('01150121', 'distrito', 'Los Olivos', '01150100'),
('01150122', 'distrito', 'San Martín de Porres', '01150100'),
('01150123', 'distrito', 'Independencia', '01150100'),
('01150124', 'distrito', 'Comas', '01150100'),
('01150125', 'distrito', 'Carabayllo', '01150100'),
('01150126', 'distrito', 'Villa El Salvador', '01150100'),
('01150127', 'distrito', 'Villa María del Triunfo', '01150100'),
('01150128', 'distrito', 'San Juan de Miraflores', '01150100'),
('01150129', 'distrito', 'Surquillo', '01150100');