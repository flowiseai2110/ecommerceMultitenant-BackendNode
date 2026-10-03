/**
 * Tool `estado_pedido` — estado de los pedidos del cliente con sesión.
 *
 * La identidad sale del JWT de la request (authUserId), NUNCA del input del
 * modelo: el modelo solo puede pedir un número, y la consulta filtra por
 * tienda + dueño. Un número ajeno responde igual que uno inexistente
 * (NO_ENCONTRADO), así que no sirve para averiguar pedidos de otros.
 *
 * Sin montos para el modelo (spec R6): estado, fechas y forma de envío.
 *
 * @see docs/specs/agente-ventas/spec.md — R11.
 */

import { prisma } from "../../../config/prisma.js";

// Pedidos recientes cuando el cliente no da número ("¿cómo va mi pedido?").
const MAX_PEDIDOS_RECIENTES = 3;

export const estadoPedidoToolDef = {
  name: "estado_pedido",
  description:
    "Consulta el estado de los pedidos que el cliente hizo en ESTA tienda con su sesión " +
    "iniciada. Úsala cuando pregunte por su pedido, su compra o su entrega. Si no da número, " +
    "devuelve sus últimos pedidos. Si responde NO_AUTENTICADO, pídele iniciar sesión con la " +
    "cuenta con la que compró, o que use «Rastrear pedido» con su número.",
  input_schema: {
    type: "object",
    properties: {
      numero_pedido: {
        type: "string",
        description: "Número de pedido si el cliente lo dio. Ej: 'PED-0007'."
      }
    }
  }
};

const fecha = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

/**
 * @param {object} params
 * @param {string} params.tiendaId - Server-side.
 * @param {string|null} params.authUserId - Del JWT (optionalAuth), o null sin sesión.
 * @param {object} params.input - Input del modelo ({ numero_pedido? }).
 * @returns {Promise<{ paraModelo: object, pedidos?: Array<{numeroPedido:string, estado:string}> }>}
 */
export async function ejecutarEstadoPedido({ tiendaId, authUserId, input }) {
  if (!tiendaId) throw new Error("estado_pedido: falta tiendaId (scope multi-tenant).");

  if (!authUserId) {
    return { paraModelo: { error: "NO_AUTENTICADO" } };
  }

  const numero = typeof input?.numero_pedido === "string"
    ? input.numero_pedido.trim().toUpperCase().slice(0, 20)
    : "";

  const pedidos = await prisma.pedidos.findMany({
    where: { tiendaId, authUserId, ...(numero ? { numeroPedido: numero } : {}) },
    orderBy: { fechaRegistro: "desc" },
    take: numero ? 1 : MAX_PEDIDOS_RECIENTES,
    select: {
      numeroPedido: true,
      estado: true,
      estadoPago: true,
      metodoEnvio: true,
      courier: true,
      fechaRegistro: true,
      fechaEntregado: true
    }
  });

  if (pedidos.length === 0) {
    return { paraModelo: { error: numero ? "NO_ENCONTRADO" : "SIN_PEDIDOS" } };
  }

  return {
    paraModelo: {
      pedidos: pedidos.map(p => ({
        numero: p.numeroPedido,
        estado: p.estado,
        estado_pago: p.estadoPago,
        envio: p.courier || p.metodoEnvio || null,
        fecha_pedido: fecha(p.fechaRegistro),
        fecha_entrega: fecha(p.fechaEntregado)
      }))
    },
    // El chat muestra un acceso al seguimiento de cada uno.
    pedidos: pedidos.map(p => ({ numeroPedido: p.numeroPedido, estado: p.estado }))
  };
}
