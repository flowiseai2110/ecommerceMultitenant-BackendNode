import { prisma } from "../../config/prisma.js";
import { cotizarMetodo } from "./cotizacion.js";

// Carga de BD + cotización. La regla vive en cotizacion.js (pura y testeada).

const metodoSelect = {
  id: true,
  tipo: true,
  costoReferencial: true,
  fueraDeZona: true,
  pagoEnDestino: true,
  zonas: { select: { nombre: true, costo: true, diasMin: true, diasMax: true, ubigeos: true, orden: true } }
};

async function envioGratisMinimoDe(tiendaId, db) {
  const tienda = await db.tiendas.findUnique({ where: { id: tiendaId }, select: { envioGratisMinimo: true } });
  return tienda?.envioGratisMinimo != null ? Number(tienda.envioGratisMinimo) : null;
}

/**
 * Cotiza todos los métodos de envío activos de la tienda para un destino.
 */
export async function cotizarEnvios(tiendaId, { ubigeo = null, subtotal = 0 } = {}) {
  const [metodos, envioGratisMinimo] = await Promise.all([
    prisma.metodos_envio.findMany({
      where: { tiendaId, activo: true },
      orderBy: { orden: "asc" },
      select: { ...metodoSelect, nombre: true }
    }),
    envioGratisMinimoDe(tiendaId, prisma)
  ]);
  // nombre: lo usa el asesor IA (tool calcular_envio) para presentar las opciones.
  return metodos.map(m => ({ nombre: m.nombre, ...cotizarMetodo(m, m.zonas, { ubigeo, subtotal, envioGratisMinimo }) }));
}

/**
 * Carga un método de envío activo de la tienda, con sus zonas y el mínimo del
 * envío gratis, dentro de una transacción (creación de pedido). La cotización la
 * hace la regla pura con el subtotal del servidor (precios/cotizacion-compra.js).
 * Devuelve null si el método no existe, no es de la tienda o está inactivo.
 */
export async function cargarMetodoEnvio(tx, tiendaId, metodoEnvioId) {
  const metodo = await tx.metodos_envio.findFirst({
    where: { id: metodoEnvioId, tiendaId, activo: true },
    select: { ...metodoSelect, nombre: true }
  });
  if (!metodo) return null;
  return { metodo, envioGratisMinimo: await envioGratisMinimoDe(tiendaId, tx) };
}

/** ¿La tienda tiene métodos de envío activos? Si tiene, el pedido debe elegir uno. */
export async function hayMetodosEnvio(tx, tiendaId) {
  return (await tx.metodos_envio.count({ where: { tiendaId, activo: true } })) > 0;
}
