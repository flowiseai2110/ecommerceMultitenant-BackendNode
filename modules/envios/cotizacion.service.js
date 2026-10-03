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
 * Cotiza un método puntual dentro de una transacción (creación de pedido).
 * Devuelve null si el método no existe, no es de la tienda o está inactivo.
 */
export async function cotizarMetodoEnvio(tx, tiendaId, metodoEnvioId, { ubigeo = null, subtotal = 0 } = {}) {
  const metodo = await tx.metodos_envio.findFirst({
    where: { id: metodoEnvioId, tiendaId, activo: true },
    select: { ...metodoSelect, nombre: true }
  });
  if (!metodo) return null;
  const envioGratisMinimo = await envioGratisMinimoDe(tiendaId, tx);
  return {
    nombre: metodo.nombre,
    ...cotizarMetodo(metodo, metodo.zonas, { ubigeo, subtotal, envioGratisMinimo })
  };
}
