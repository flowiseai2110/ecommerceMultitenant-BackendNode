import { z } from "zod";
import { PROVEEDORES_SOPORTADOS } from "./provider-factory.js";

/** Métodos de pago online soportados por el flujo de token (frontend). */
const METODOS = ["tarjeta", "yape"];

/**
 * Body para crear un cargo desde el storefront.
 * El token se genera en el frontend con Culqi.js; el backend nunca ve la tarjeta.
 * El monto NO se recibe del cliente: se toma del pedido en el servidor.
 */
export const crearCargoSchema = z.object({
  tiendaId: z.string({ required_error: "El ID de tienda es requerido" }).uuid("ID de tienda inválido"),
  pedidoId: z.string({ required_error: "El ID de pedido es requerido" }).uuid("ID de pedido inválido"),
  tokenId: z.string({ required_error: "El token es requerido" }).min(1).max(120),
  metodo: z.enum(METODOS, { errorMap: () => ({ message: `Método inválido (${METODOS.join(", ")})` }) }),
  proveedor: z.enum(PROVEEDORES_SOPORTADOS).optional().default("culqi"),
  email: z.string().email("Email inválido").optional(),
  antifraud: z.object({
    first_name: z.string().max(50).optional(),
    last_name: z.string().max(50).optional(),
    address: z.string().max(100).optional(),
    address_city: z.string().max(50).optional(),
    country_code: z.string().length(2).optional(),
    phone_number: z.string().max(15).optional()
  }).optional()
});

/**
 * Body para crear/actualizar la configuración de pasarela de una tienda (admin).
 * La llave secreta y el webhook secret son opcionales en update (para poder
 * editar modo/llave pública sin re-enviar los secretos).
 */
export const upsertConfigSchema = z.object({
  tiendaId: z.string({ required_error: "El ID de tienda es requerido" }).uuid("ID de tienda inválido"),
  proveedor: z.enum(PROVEEDORES_SOPORTADOS, {
    errorMap: () => ({ message: `Proveedor inválido (${PROVEEDORES_SOPORTADOS.join(", ")})` })
  }),
  modo: z.enum(["test", "live"]).optional(),
  llavePublica: z.string().max(200).optional(),
  llaveSecreta: z.string().max(200).optional(),
  webhookSecret: z.string().max(200).optional(),
  activo: z.boolean().optional()
});

/** Query para leer config (admin): requiere tiendaId; proveedor opcional. */
export const configQuerySchema = z.object({
  tiendaId: z.string({ required_error: "El ID de tienda es requerido" }).uuid("ID de tienda inválido"),
  proveedor: z.enum(PROVEEDORES_SOPORTADOS).optional()
}).passthrough();

/** Param del proveedor en la ruta del webhook. */
export const webhookProveedorParamSchema = z.object({
  proveedor: z.enum(PROVEEDORES_SOPORTADOS, {
    errorMap: () => ({ message: `Proveedor inválido (${PROVEEDORES_SOPORTADOS.join(", ")})` })
  })
});

export default {
  crearCargoSchema,
  upsertConfigSchema,
  configQuerySchema,
  webhookProveedorParamSchema
};
