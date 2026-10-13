import { z } from "zod";
import { PROVEEDORES_SOPORTADOS } from "./provider-factory.js";

/** Métodos de pago online soportados por el flujo de token (frontend). */
const METODOS = ["tarjeta", "yape"];

/**
 * Body para crear un cargo desde el storefront.
 * El token se genera en el frontend con Culqi.js; el backend nunca ve la tarjeta.
 * El monto NO se recibe del cliente: se toma del pedido en el servidor.
 * El proveedor tampoco: es el de la plataforma (docs/specs/pago-automatico R4.2).
 */
export const crearCargoSchema = z.object({
  tiendaId: z.string({ required_error: "El ID de tienda es requerido" }).uuid("ID de tienda inválido"),
  pedidoId: z.string({ required_error: "El ID de pedido es requerido" }).uuid("ID de pedido inválido"),
  tokenId: z.string({ required_error: "El token es requerido" }).min(1).max(120),
  metodo: z.enum(METODOS, { errorMap: () => ({ message: `Método inválido (${METODOS.join(", ")})` }) }),
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

/** Store: cobrar una reserva (o una cuota de un local) con la pasarela (pago-automatico R3.1). */
export const pagarReservaSchema = z.object({
  tokenId: z.string({ required_error: "El token es requerido" }).min(1).max(120),
  metodo: z.enum(METODOS, { errorMap: () => ({ message: `Método inválido (${METODOS.join(", ")})` }) }),
  cuotaId: z.string().uuid("Cuota inválida").optional(),
  email: z.string().email("Email inválido").optional()
});

/** Admin: cambiar cómo cobra la tienda (pago-automatico R1.2). */
export const modoPagoSchema = z.object({
  tiendaId: z.string({ required_error: "El ID de tienda es requerido" }).uuid("ID de tienda inválido"),
  modo: z.enum(["manual", "automatico"], { errorMap: () => ({ message: "Modo inválido (manual, automatico)" }) })
});

/** Admin: llaves del pago automático (el proveedor lo pone la plataforma). */
export const credencialesPagoSchema = z.object({
  tiendaId: z.string({ required_error: "El ID de tienda es requerido" }).uuid("ID de tienda inválido"),
  llavePublica: z.string().trim().min(1, "Ingresa la llave pública").max(200),
  llaveSecreta: z.string().trim().max(200).optional()
});

/** Param del proveedor en la ruta del webhook. */
export const webhookProveedorParamSchema = z.object({
  proveedor: z.enum(PROVEEDORES_SOPORTADOS, {
    errorMap: () => ({ message: `Proveedor inválido (${PROVEEDORES_SOPORTADOS.join(", ")})` })
  })
});

export default {
  crearCargoSchema,
  pagarReservaSchema,
  modoPagoSchema,
  upsertConfigSchema,
  configQuerySchema,
  webhookProveedorParamSchema
};
