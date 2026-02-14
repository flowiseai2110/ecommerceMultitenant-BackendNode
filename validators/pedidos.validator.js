import { z } from "zod";

// Schema para un item del detalle del pedido
const detalleItemSchema = z.object({
  productoId: z.string().uuid("ID de producto inválido").optional().nullable(),
  varianteId: z.string().uuid("ID de variante inválido").optional().nullable(),
  productoNombre: z.string({ required_error: "El nombre del producto es requerido" }).min(1).max(200),
  varianteNombre: z.string().max(100).optional().nullable(),
  cantidad: z.coerce.number({ required_error: "La cantidad es requerida" }).int().min(1, "La cantidad mínima es 1"),
  precioUnitario: z.coerce.number({ required_error: "El precio unitario es requerido" }).min(0),
  descuento: z.coerce.number().min(0).optional().default(0)
});

// Schema para crear pedido (desde storefront)
export const createPedidoSchema = z.object({
  tiendaId: z.string({ required_error: "El ID de tienda es requerido" }).uuid("ID de tienda inválido"),
  // Datos del cliente (se crea o busca automáticamente)
  cliente: z.object({
    nombre: z.string().min(1, "El nombre es requerido").max(100),
    whatsappNumero: z.string().min(9, "Número de WhatsApp inválido").max(20),
    email: z.string().email("Email inválido").optional().nullable(),
    tipoDocumento: z.string().max(10).optional().nullable(),
    numeroDocumento: z.string().max(20).optional().nullable()
  }),
  // Items del pedido
  detalles: z.array(detalleItemSchema).min(1, "Debe incluir al menos un producto"),
  // Info de envío y pago
  metodoPago: z.string().max(50).optional().nullable(),
  metodoEnvio: z.string().max(50).optional().nullable(),
  direccionEnvio: z.string().optional().nullable(),
  costoEnvio: z.coerce.number().min(0).optional().default(0),
  descuentoMonto: z.coerce.number().min(0).optional().default(0),
  notas: z.string().optional().nullable(),
  origen: z.string().max(20).optional().default("web")
});

// Schema para actualizar estado del pedido
export const updateEstadoSchema = z.object({
  estado: z.enum(
    ["pendiente", "confirmado", "en_proceso", "enviado", "entregado", "cancelado"],
    { required_error: "El estado es requerido", invalid_type_error: "Estado no válido" }
  ),
  notas: z.string().optional().nullable()
});

// Schema para actualizar estado de pago
export const updateEstadoPagoSchema = z.object({
  estadoPago: z.enum(
    ["pendiente", "pagado", "rechazado", "reembolsado"],
    { required_error: "El estado de pago es requerido" }
  ),
  referenciaPago: z.string().max(100).optional().nullable(),
  metodoPago: z.string().max(50).optional().nullable()
});

// Schema para validar ID en params
export const idParamSchema = z.object({
  id: z.string().uuid("ID inválido")
});

// Schema para query params de paginación
export const paginationSchema = z.object({
  page: z.string().regex(/^\d+$/, "La página debe ser un número").transform((val) => parseInt(val, 10)).optional(),
  limit: z.string().regex(/^\d+$/, "El límite debe ser un número").transform((val) => parseInt(val, 10)).optional(),
  orderBy: z.string().regex(/^[a-zA-Z_]+:(asc|desc)$/i, "Formato de ordenamiento inválido").optional()
}).passthrough();

export default {
  createPedidoSchema,
  updateEstadoSchema,
  updateEstadoPagoSchema,
  idParamSchema,
  paginationSchema
};
