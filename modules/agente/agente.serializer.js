/**
 * Serializer de salida del asesor de ventas IA (audiencia STORE).
 *
 * Contrato: la respuesta se construye campo por campo. La tarjeta de producto
 * expone SOLO lo necesario para renderizar en el chat; nunca campos internos
 * (precioCosto, stock exacto de gestión, auditoría, metadata).
 *
 * @see modules/agente/arquitectura.md — §5 ("Mostrar el producto").
 */

/**
 * Tarjeta de producto tal como la ve el storefront dentro del chat.
 * @param {object} p - Producto devuelto por la tool `buscar_productos`.
 * @returns {object}
 */
export function serializeProductoCardChat(p) {
  return {
    id: p.id,
    nombre: p.nombre,
    slug: p.slug,
    precioBase: p.precioBase,
    precioOferta: p.precioOferta ?? null,
    // Bandera de disponibilidad en vez del stock exacto: el frontend solo
    // necesita saber si mostrar "disponible" / "agotado".
    disponible: (p.stock ?? 0) > 0,
    imagenUrl: p.imagenUrl ?? null,
    imagenAlt: p.imagenAlt ?? null
  };
}

/**
 * Respuesta completa de un turno del asesor.
 * @param {object} params
 * @param {string} params.mensaje - Texto del asesor (redactado por el modelo).
 * @param {Array}  params.productos - Productos recomendados (para tarjetas).
 * @param {string[]} [params.sugerencias] - Respuestas rápidas (botones) que el chat
 *   envía como mensaje al tocarlas.
 * @param {boolean} [params.ofrecerPersona] - El chat destaca el pase a una persona
 *   (lo pidió el cliente o la conversación acumuló fallos).
 * @param {object|null} [params.envio] - Tarjeta de envío (tool calcular_envio).
 * @param {Array} [params.pedidos] - Pedidos del cliente con sesión (tool estado_pedido).
 * @returns {object} DTO público del turno.
 */
export function serializeTurnoAgente({
  mensaje, productos = [], sugerencias = [], ofrecerPersona = false, envio = null, pedidos = []
}) {
  return {
    mensaje,
    productos: productos.map(serializeProductoCardChat),
    sugerencias,
    ofrecerPersona,
    envio: envio ? serializeEnvioChat(envio) : null,
    pedidos: pedidos.map(p => ({ numeroPedido: p.numeroPedido, estado: p.estado }))
  };
}

/**
 * Tarjeta de envío: montos de la BD (misma cotización que el checkout). El
 * total final lo recalcula el backend al crear el pedido.
 * @param {object} envio - De ejecutarCalcularEnvio.
 */
export function serializeEnvioChat(envio) {
  return {
    distrito: envio.distrito,
    ubigeo: envio.ubigeo,
    envioGratisMinimo: envio.envioGratisMinimo ?? null,
    opciones: envio.opciones.map(o => ({
      nombre: o.nombre,
      modo: o.modo,
      costo: o.costo,
      costoReferencial: o.costoReferencial ?? null,
      diasMin: o.diasMin ?? null,
      diasMax: o.diasMax ?? null
    }))
  };
}
