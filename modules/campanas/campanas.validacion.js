import { prisma } from "../../config/prisma.js";
import { ConflictError, ValidationError } from "../../utils/errors.js";
import { leerPromociones } from "../precios/contexto.service.js";
import { ventanaConfirmadaCambiada } from "./promocion.js";
import { getDiseno } from "../../services/tienda-diseno.service.js";
import { errorDeUso } from "./uso.js";
import { errorDeSentido } from "./sentido.js";
import { edicionesParaResolver } from "./ediciones.service.js";

const rechazar = (mensaje) => {
  throw new ValidationError("Errores de validación", { message: mensaje, body: { campanas: [mensaje] } });
};

/**
 * Reglas de las campañas que dependen de la tienda o del reloj: fechas de uso
 * en una tienda sin reservas (R1.1) y las de sentido común (R8), que comparan
 * con lo guardado para revisar solo lo que cambia.
 */
export async function validarCampanasDeTienda(tiendaId, campanas) {
  if (!campanas) return;
  if (campanas.some((c) => c.uso)) {
    const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { tipoNegocio: true } });
    const mensaje = errorDeUso(campanas, tienda?.tipoNegocio);
    if (mensaje) rechazar(mensaje);
  }
  const [{ campanas: anteriores }, ediciones] = await Promise.all([getDiseno(tiendaId), edicionesParaResolver()]);
  const mensaje = errorDeSentido(campanas, anteriores, new Date(), ediciones);
  if (mensaje) rechazar(mensaje);
}

/**
 * Guarda del PUT de diseño (campanas-descuento T3b.7): el editor guarda el
 * arreglo completo de campañas y no sabe de promociones. Si cambiaría las
 * fechas de una campaña con promoción confirmada para su ventana en curso o
 * próxima → 409: se cambian desde Campañas, con su confirmación (R9.5).
 */
export async function validarPromocionesDelDiseno(tiendaId, campanas, ahora = new Date()) {
  if (!Array.isArray(campanas)) return;
  const datos = await leerPromociones(prisma, tiendaId);
  if (!datos) return;
  const nombre = ventanaConfirmadaCambiada(datos.campanas, campanas, datos.promociones, datos.confirmaciones, ahora, datos.ediciones);
  if (nombre) {
    const message = `${nombre} tiene una promoción confirmada: cambia sus fechas desde Campañas`;
    throw new ConflictError(message, { message, motivo: "CAMPANA_CON_PROMOCION" });
  }
}
