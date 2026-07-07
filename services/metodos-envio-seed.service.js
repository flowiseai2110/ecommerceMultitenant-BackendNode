import { prisma } from "../config/prisma.js";

/**
 * Plantillas de métodos de envío sugeridos (mercado peruano) que se precargan
 * al crear una tienda. El dueño solo las activa/completa desde el mantenimiento
 * — o agrega otras nuevas (ej. otro courier local).
 *
 * Solo "Recojo en tienda" nace activo porque no depende de coordinar tarifa
 * con un courier externo; los couriers quedan desactivados hasta que el dueño
 * confirme que trabaja con ellos.
 */
export const METODOS_ENVIO_PLANTILLAS = [
  {
    nombre: "Recojo en tienda",
    tipo: "recojo_tienda",
    activo: true,
    orden: 1,
    instrucciones: "Coordina el horario de recojo por WhatsApp."
  },
  {
    nombre: "Shalom",
    tipo: "courier",
    activo: false,
    orden: 2,
    instrucciones: "El costo se coordina por WhatsApp según destino."
  },
  {
    nombre: "Olva Courier",
    tipo: "courier",
    activo: false,
    orden: 3,
    instrucciones: "El costo se coordina por WhatsApp según destino."
  },
  {
    nombre: "Delivery propio",
    tipo: "delivery_propio",
    activo: false,
    orden: 4,
    instrucciones: "Delivery propio de la tienda, costo a coordinar por WhatsApp."
  }
];

/**
 * Inserta en la tienda las plantillas que aún no tenga (comparando por nombre,
 * sin distinguir mayúsculas), sin tocar los métodos ya creados por el dueño.
 *
 * @param {string} tiendaId
 * @param {object} [opts]
 * @param {boolean} [opts.forzarInactivos] - true para tiendas ya operativas
 *   (backfill): todo se precarga desactivado, salvo "Recojo en tienda" que no
 *   requiere configuración adicional y da un método utilizable de inmediato.
 * @param {object} [db] - cliente Prisma o transacción (tx) donde ejecutar.
 * @returns {Promise<number>} cantidad de métodos creados
 */
export async function seedMetodosEnvioParaTienda(tiendaId, { forzarInactivos = false } = {}, db = prisma) {
  const existentes = await db.metodos_envio.findMany({
    where: { tiendaId },
    select: { nombre: true }
  });
  const nombresExistentes = new Set(existentes.map((m) => m.nombre.trim().toLowerCase()));

  const faltantes = METODOS_ENVIO_PLANTILLAS
    .filter((p) => !nombresExistentes.has(p.nombre.toLowerCase()))
    .map((p) => ({
      ...p,
      tiendaId,
      activo: forzarInactivos && p.tipo !== "recojo_tienda" ? false : p.activo
    }));

  if (faltantes.length === 0) return 0;

  await db.metodos_envio.createMany({ data: faltantes });
  return faltantes.length;
}

export default { METODOS_ENVIO_PLANTILLAS, seedMetodosEnvioParaTienda };
