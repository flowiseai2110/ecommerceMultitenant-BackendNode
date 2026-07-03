import { prisma } from "../config/prisma.js";

/**
 * Plantillas de métodos de pago sugeridos (mercado peruano) que se precargan
 * al crear una tienda. El dueño solo completa sus datos de cobro (cuentaInfo)
 * y los activa desde el mantenimiento — o agrega otros nuevos.
 *
 * Solo "Pago contra entrega" nace activo porque no requiere datos de cobro;
 * el resto queda desactivado para que el checkout nunca muestre un método
 * sin número de cuenta/billetera configurado.
 */
export const METODOS_PAGO_PLANTILLAS = [
  {
    nombre: "Yape",
    tipo: "billetera_digital",
    activo: false,
    orden: 1,
    instrucciones: "Realiza tu pago por Yape al número indicado y envíanos la captura del pago por WhatsApp."
  },
  {
    nombre: "Plin",
    tipo: "billetera_digital",
    activo: false,
    orden: 2,
    instrucciones: "Realiza tu pago por Plin al número indicado y envíanos la captura del pago por WhatsApp."
  },
  {
    nombre: "Transferencia bancaria",
    tipo: "transferencia",
    activo: false,
    orden: 3,
    instrucciones: "Transfiere el monto total a la cuenta indicada y envíanos el comprobante por WhatsApp."
  },
  {
    nombre: "Pago contra entrega",
    tipo: "contra_entrega",
    activo: true,
    orden: 4,
    instrucciones: "Paga en efectivo cuando recibas tu pedido en la puerta de tu casa."
  },
  {
    nombre: "Efectivo en tienda",
    tipo: "efectivo",
    activo: false,
    orden: 5,
    instrucciones: "Paga en efectivo al recoger tu pedido en nuestra tienda."
  }
];

/**
 * Inserta en la tienda las plantillas que aún no tenga (comparando por nombre,
 * sin distinguir mayúsculas), sin tocar los métodos ya creados por el dueño.
 *
 * @param {string} tiendaId
 * @param {object} [opts]
 * @param {boolean} [opts.forzarInactivos] - true para tiendas ya operativas
 *   (backfill): todo se precarga desactivado para no alterar su checkout en vivo.
 * @param {object} [db] - cliente Prisma o transacción (tx) donde ejecutar.
 * @returns {Promise<number>} cantidad de métodos creados
 */
export async function seedMetodosPagoParaTienda(tiendaId, { forzarInactivos = false } = {}, db = prisma) {
  const existentes = await db.metodos_pago.findMany({
    where: { tiendaId },
    select: { nombre: true }
  });
  const nombresExistentes = new Set(existentes.map((m) => m.nombre.trim().toLowerCase()));

  const faltantes = METODOS_PAGO_PLANTILLAS
    .filter((p) => !nombresExistentes.has(p.nombre.toLowerCase()))
    .map((p) => ({
      ...p,
      tiendaId,
      activo: forzarInactivos ? false : p.activo
    }));

  if (faltantes.length === 0) return 0;

  await db.metodos_pago.createMany({ data: faltantes });
  return faltantes.length;
}

export default { METODOS_PAGO_PLANTILLAS, seedMetodosPagoParaTienda };
