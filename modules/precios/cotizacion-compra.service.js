import { ValidationError } from "../../utils/errors.js";
import { clave } from "../idiomas/clave.js";
import { errorConClave } from "../idiomas/errores.js";
import { precioVigente } from "./precio-vigente.js";

/**
 * Cargador de la cotización de una compra (docs/specs/precio-en-servidor): lee de
 * la BD los productos y variantes del pedido, una consulta por tabla y con la
 * tienda explícita. La regla vive en cotizacion-compra.js (pura).
 *
 * Exige (C6, C7): producto activo y de la tienda; variante activa, de la tienda y
 * del mismo producto; precio vigente > 0. El nombre y la variante salen de la BD,
 * en el idioma base de la tienda (D6): lo que lee el dueño, no lo que mandó el navegador.
 *
 * @param {object} tx - Cliente transaccional Prisma.
 * @param {string} tiendaId
 * @param {Array<{ productoId: string, varianteId?: string|null, cantidad: number }>} detalles
 * @returns {Promise<Array<{ producto: object, variante: object|null, cantidad: number }>>}
 * @throws {ValidationError}
 */
export async function cargarLineas(tx, tiendaId, detalles) {
  const productoIds = [...new Set(detalles.map((d) => d.productoId))];
  const varianteIds = [...new Set(detalles.map((d) => d.varianteId).filter(Boolean))];

  const productos = await tx.productos.findMany({
    where: { tiendaId, id: { in: productoIds } },
    select: { id: true, nombre: true, categoriaId: true, precioBase: true, precioOferta: true, activo: true }
  });
  const variantes = varianteIds.length
    ? await tx.producto_variantes.findMany({
        where: { id: { in: varianteIds }, producto: { tiendaId } },
        select: { id: true, productoId: true, nombre: true, precio: true, activo: true }
      })
    : [];

  const productoPorId = new Map(productos.map((p) => [p.id, p]));
  const variantePorId = new Map(variantes.map((v) => [v.id, v]));

  return detalles.map(({ productoId, varianteId, cantidad }) => {
    const producto = productoPorId.get(productoId);
    if (!producto?.activo) throw errorConClave(ValidationError, clave("Producto no disponible"));
    let variante = null;
    if (varianteId) {
      variante = variantePorId.get(varianteId);
      if (!variante?.activo || variante.productoId !== productoId) {
        throw errorConClave(ValidationError, clave("Variante \"{producto}\" no disponible"), { producto: producto.nombre });
      }
    }
    if (precioVigente(producto, variante).unitario <= 0) {
      throw errorConClave(ValidationError, clave("Producto sin precio: {producto}"), { producto: producto.nombre });
    }
    return { producto, variante, cantidad };
  });
}
