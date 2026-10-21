import { campanaDePromocion, campanasDePromociones } from "./promocion.repository.js";
import { efectiva } from "./resolver.js";

/**
 * Nombre de la campaña de un cupón de campaña (`cupones.campana_promocion_id`),
 * para el mensaje "Este cupón es de la campaña {nombre} y ya no está vigente"
 * (docs/specs/campanas-descuento R4.8). "" si la campaña ya no existe. Aparte de
 * promocion.service.js para que el checkout no cargue todo el Admin de promociones.
 * @param {object} db - Cliente Prisma (transaccional al crear el pedido).
 * @param {string} tiendaId
 * @param {string} promocionId
 * @returns {Promise<string>}
 */
export async function nombreCampanaDelCupon(db, tiendaId, promocionId) {
  const campana = await campanaDePromocion(db, tiendaId, promocionId);
  return (campana && efectiva(campana)?.nombre) || "";
}

/**
 * La campaña de cada cupón de campaña de una lista, para Cupones del Admin
 * (docs/specs/campanas-descuento A8): `campana: { id, presetId, nombre }` o null
 * en los cupones de la tienda. El cupón de una campaña se edita solo en ella.
 * @param {object} db - Cliente Prisma.
 * @param {string} tiendaId
 * @param {object[]} cupones - Filas de `cupones`.
 * @returns {Promise<object[]>}
 */
export async function conCampana(db, tiendaId, cupones) {
  const ids = [...new Set(cupones.map((c) => c.campanaPromocionId).filter(Boolean))];
  const campanas = await campanasDePromociones(db, tiendaId, ids);
  return cupones.map((c) => {
    const campana = c.campanaPromocionId ? campanas.get(c.campanaPromocionId) : null;
    return {
      ...c,
      campana: campana ? { id: campana.id, presetId: campana.presetId ?? null, nombre: efectiva(campana)?.nombre ?? "" } : null
    };
  });
}
