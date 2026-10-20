import { prisma } from "../../config/prisma.js";
import { ValidationError } from "../../utils/errors.js";
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
