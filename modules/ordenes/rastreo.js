/**
 * Seguimiento público de pedidos en dos niveles.
 *
 * Los números de pedido son correlativos (PED-0001, PED-0002…): con solo el
 * número cualquiera puede recorrerlos, así que sin más prueba se muestra el
 * nivel PÚBLICO (estado y fechas, sin datos personales). El detalle COMPLETO
 * (dirección, productos, montos) exige ser el dueño con sesión o dar los
 * últimos 4 dígitos del WhatsApp del pedido.
 *
 * Funciones puras: la carga de BD vive en pedidos.service.js.
 *
 * @see docs/specs/agente-ventas/spec.md — R4.
 */

import { timingSafeEqual } from "node:crypto";
import { AppError } from "../../utils/errors.js";

export const NIVEL = Object.freeze({ PUBLICO: "publico", COMPLETO: "completo" });

/**
 * Últimos 4 dígitos de un número de WhatsApp, ignorando "+", espacios y guiones.
 * @param {string|null|undefined} whatsapp
 * @returns {string|null} null si no hay al menos 4 dígitos.
 */
export function ultimos4Digitos(whatsapp) {
  const digitos = String(whatsapp ?? "").replace(/\D/g, "");
  return digitos.length >= 4 ? digitos.slice(-4) : null;
}

function mismoCodigo(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Qué puede ver quien consulta el pedido.
 * @param {{ authUserId?: string|null, clienteWhatsapp?: string|null }} pedido
 * @param {{ verificacion?: string, authUserId?: string|null }} solicitante
 * @returns {"publico"|"completo"}
 * @throws {AppError} 403 VERIFICACION_INVALIDA si mandó un código que no coincide.
 */
export function nivelDeAcceso(pedido, { verificacion, authUserId } = {}) {
  if (authUserId && pedido.authUserId && pedido.authUserId === authUserId) {
    return NIVEL.COMPLETO;
  }

  if (verificacion) {
    const esperado = ultimos4Digitos(pedido.clienteWhatsapp);
    if (esperado && mismoCodigo(String(verificacion), esperado)) return NIVEL.COMPLETO;
    throw new AppError(
      "Los dígitos no coinciden con el WhatsApp del pedido.",
      403,
      "VERIFICACION_INVALIDA"
    );
  }

  return NIVEL.PUBLICO;
}

/**
 * Respuesta del seguimiento según el nivel. `clienteWhatsapp` y `authUserId`
 * se usan para decidir el nivel y NUNCA salen en la respuesta.
 * @param {object} pedido - Pedido con detalles e historialEstados.
 * @param {"publico"|"completo"} nivel
 * @returns {object}
 */
export function serializarRastreo(pedido, nivel) {
  const { clienteWhatsapp, authUserId, ...resto } = pedido;
  const puedeVerificar = ultimos4Digitos(clienteWhatsapp) !== null;

  if (nivel === NIVEL.COMPLETO) {
    return { ...resto, detalleCompleto: true, puedeVerificar };
  }

  return {
    numeroPedido: pedido.numeroPedido,
    estado: pedido.estado,
    estadoPago: pedido.estadoPago,
    fechaRegistro: pedido.fechaRegistro,
    fechaConfirmado: pedido.fechaConfirmado,
    fechaEntregado: pedido.fechaEntregado,
    // Sin notas: las escribe la tienda y pueden traer datos del cliente.
    historialEstados: (pedido.historialEstados ?? []).map(h => ({
      id: h.id,
      estado: h.estado,
      fechaRegistro: h.fechaRegistro
    })),
    detalleCompleto: false,
    puedeVerificar
  };
}
