import { prisma } from "../config/prisma.js";

const RECURSO_IMAGENES_IA = "imagenes_ia";

function periodoActual() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Registra un uso del recurso "imagenes_ia" para la tienda en el periodo actual
 * y devuelve el consumo acumulado del mes (incluido + excedente). No bloquea
 * nunca: el modelo de negocio es pay-per-use, el excedente se factura aparte.
 * @param {string} tiendaId
 * @returns {Promise<{ cantidadUsada: number, cantidadIncluida: number|null, excedente: number }>}
 */
export async function registrarUsoImagenIA(tiendaId) {
  const periodo = periodoActual();

  const existente = await prisma.tienda_uso_recursos.findUnique({
    where: { uq_tienda_recurso_periodo: { tiendaId, recurso: RECURSO_IMAGENES_IA, periodo } }
  });

  let uso;
  if (existente) {
    uso = await prisma.tienda_uso_recursos.update({
      where: { id: existente.id },
      data: { cantidadUsada: { increment: 1 } }
    });
  } else {
    const tienda = await prisma.tiendas.findUnique({
      where: { id: tiendaId },
      include: { plan: true }
    });

    uso = await prisma.tienda_uso_recursos.create({
      data: {
        tiendaId,
        recurso: RECURSO_IMAGENES_IA,
        periodo,
        cantidadUsada: 1,
        cantidadIncluida: tienda?.plan?.limiteImagenesIaMes ?? null
      }
    });
  }

  const excedente = uso.cantidadIncluida == null ? 0 : Math.max(0, uso.cantidadUsada - uso.cantidadIncluida);

  return { cantidadUsada: uso.cantidadUsada, cantidadIncluida: uso.cantidadIncluida, excedente };
}

export default { registrarUsoImagenIA };
