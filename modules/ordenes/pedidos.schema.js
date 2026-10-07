import { z } from "zod";

// Schema para un item del detalle del pedido
const detalleItemSchema = z.object({
  productoId: z.string().uuid("ID de producto inválido").optional().nullable(),
  varianteId: z.string().uuid("ID de variante inválido").optional().nullable(),
  productoNombre: z.string({ required_error: "El nombre del producto es requerido" }).min(1).max(200),
  varianteNombre: z.string().max(100).optional().nullable(),
  // El máximo aplica sobre todo a servicios (sin stock físico); para productos
  // con stock la validación real es contra el stock disponible
  cantidad: z.coerce.number({ required_error: "La cantidad es requerida" }).int().min(1, "La cantidad mínima es 1").max(100, "La cantidad máxima por producto es 100"),
  precioUnitario: z.coerce.number({ required_error: "El precio unitario es requerido" }).min(0),
  descuento: z.coerce.number().min(0).optional().default(0)
});

// El destino de entrega es una anotación para el vendedor (no afecta el total):
// un dato raro NO debe tumbar el pedido. Por eso se recorta en vez de rechazar
// (el form del storefront no limita el largo del texto pegado del mapa del
// courier) y una coordenada inválida se descarta como null.
const textoDestino = (max) => z.string().nullish()
  .transform(v => {
    const limpio = v?.trim();
    return limpio ? limpio.slice(0, max) : null;
  });
const coordenada = (limite) => z.number().min(-limite).max(limite).nullish().catch(null);

// Comprobante que pide el comprador. Boleta: DNI/CE opcional (el mínimo de
// S/ 700 se valida en el servicio, que es quien conoce el total real).
// Factura: solo el RUC. Razón social y dirección fiscal las pone el servicio
// desde el padrón de SUNAT (datosFactura); lo que mande el navegador se ignora.
const DOC_FORMATOS = {
  DNI: /^\d{8}$/,
  CE: /^[A-Za-z0-9]{9,12}$/,
  RUC: /^(10|15|17|20)\d{9}$/
};

const comprobanteSchema = z.object({
  tipo: z.enum(["boleta", "factura"]),
  docTipo: z.enum(["DNI", "CE", "RUC"]).nullish(),
  docNumero: z.string().trim().max(20).nullish(),
  // Aceptados por compatibilidad con storefronts viejos, pero no se usan.
  razonSocial: z.string().trim().max(200).nullish(),
  direccionFiscal: z.string().trim().max(500).nullish()
}).superRefine((c, ctx) => {
  if (c.tipo === "factura" && (c.docTipo !== "RUC" || !c.docNumero)) {
    ctx.addIssue({ code: "custom", path: ["docNumero"], message: "La factura requiere RUC" });
  }
  if (c.docNumero && (!c.docTipo || !DOC_FORMATOS[c.docTipo].test(c.docNumero))) {
    ctx.addIssue({ code: "custom", path: ["docNumero"], message: "Número de documento inválido" });
  }
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
  detalles: z.array(detalleItemSchema)
    .min(1, "Debe incluir al menos un producto")
    .max(50, "Un pedido no puede tener más de 50 productos distintos"),
  // Info de envío y pago
  metodoPago: z.string().max(50).optional().nullable(),
  metodoEnvio: z.string().max(50).optional().nullable(),
  // Con el id, el backend cotiza el envío por zonas (costoEnvio del body se ignora)
  metodoEnvioId: z.string().uuid("ID de método de envío inválido").nullish(),
  direccionEnvio: z.string().optional().nullable(),
  // Destino de entrega (ver textoDestino/coordenada arriba)
  courier: textoDestino(50),
  agenciaTexto: textoDestino(2000),
  departamento: textoDestino(100),
  provincia: textoDestino(100),
  distrito: textoDestino(100),
  ubigeoCode: textoDestino(10),
  referencia: textoDestino(1000),
  latitud: coordenada(90),
  longitud: coordenada(180),
  costoEnvio: z.coerce.number().min(0).optional().default(0),
  descuentoMonto: z.coerce.number().min(0).optional().default(0),
  notas: z.string().optional().nullable(),
  origen: z.string().max(20).optional().default("web"),
  codigoCupon: z.string().max(50).optional().nullable(),
  comprobante: comprobanteSchema.nullish()
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

// Schema para actualizar detalles logísticos del pedido (entrega, comprobante, nota interna)
export const updateDetallesSchema = z.object({
  metodoEnvio: z.string().max(50).optional().nullable(),
  direccionEnvio: z.string().optional().nullable(),
  comprobante: z.enum(["boleta", "factura", "ninguno"]).optional().nullable(),
  // Datos del comprobante que el admin puede corregir (ej. el cliente se equivocó de DNI)
  comprobanteDocTipo: z.enum(["DNI", "CE", "RUC"]).optional().nullable(),
  comprobanteDocNumero: z.string().trim().max(20).optional().nullable(),
  razonSocial: z.string().trim().max(200).optional().nullable(),
  direccionFiscal: z.string().trim().max(500).optional().nullable(),
  notas: z.string().optional().nullable()
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "Debe enviar al menos un campo para actualizar" }
).refine(
  (d) => !d.comprobanteDocNumero || (d.comprobanteDocTipo && DOC_FORMATOS[d.comprobanteDocTipo].test(d.comprobanteDocNumero)),
  { path: ["comprobanteDocNumero"], message: "Número de documento inválido" }
);

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

// Schema para GET /lista — listado optimizado del admin
export const listaQuerySchema = z.object({
  tiendaId: z.string({ required_error: "tiendaId es requerido" }).uuid("tiendaId inválido"),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  orderBy: z.string().regex(/^[a-zA-Z_]+:(asc|desc)$/i, "Formato de ordenamiento inválido").optional(),
  estado: z.enum(["pendiente", "confirmado", "en_proceso", "enviado", "entregado", "cancelado"]).optional(),
  estadoPago: z.enum(["pendiente", "pagado", "rechazado", "reembolsado"]).optional(),
});

// Schema para GET /pendientes/count — badge del sidebar del admin
export const pendientesCountQuerySchema = z.object({
  tiendaId: z.string({ required_error: "tiendaId es requerido" }).uuid("tiendaId inválido")
});

export default {
  createPedidoSchema,
  updateEstadoSchema,
  updateEstadoPagoSchema,
  updateDetallesSchema,
  idParamSchema,
  paginationSchema,
  listaQuerySchema,
  pendientesCountQuerySchema
};
