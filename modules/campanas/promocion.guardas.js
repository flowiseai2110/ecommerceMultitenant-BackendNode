import { prisma } from "../../config/prisma.js";
import { ConflictError } from "../../utils/errors.js";
import { aCentimos } from "../precios/precio-vigente.js";
import { promocionesDeProducto } from "./promocion.service.js";
import { productoParaGuarda, varianteParaGuarda } from "./promocion.repository.js";

/**
 * R10.5 (Q3, CA-10.6): mientras una promoción confirmada **en curso** cubre un
 * producto, su precio regular no sube (el descuento se calcula sobre él,
 * R10.1). Bajarlo o editar otra cosa pasa. Middlewares para los tres caminos
 * que escriben un precio regular desde el Admin: el producto, la matriz de
 * variantes y una variante suelta (T3b.8).
 */

export const mensajePrecioEnPromocion = (campana, hasta) =>
  `Este producto está en la promoción ${campana} hasta el ${hasta}. Para cambiar su precio regular, apaga la promoción o espera a que termine.`;

/** ¿Sube? Compara en céntimos; un precio nuevo vacío no sube nada. */
const sube = (nuevo, actual) => nuevo != null && aCentimos(nuevo) > aCentimos(actual);

async function exigirSinPromocionEnCurso(producto, ahora = new Date()) {
  const enCurso = (await promocionesDeProducto(producto, ahora)).find((p) => p.enCurso);
  if (!enCurso) return;
  const message = mensajePrecioEnPromocion(enCurso.nombre, enCurso.hasta);
  throw new ConflictError(message, {
    message,
    motivo: "PRECIO_EN_PROMOCION",
    campana: { id: enCurso.campanaId, nombre: enCurso.nombre, fin: enCurso.fin }
  });
}

/** PUT /admin/productos/:id con `precioBase`. */
export async function guardaPrecioProducto(req, _res, next) {
  if (req.body?.precioBase == null) return next();
  const producto = await productoParaGuarda(prisma, req.params.id);
  if (producto && sube(req.body.precioBase, producto.precioBase)) await exigirSinPromocionEnCurso(producto);
  next();
}

/**
 * PUT /admin/productos/:id/variantes: una variante existente cuyo precio
 * propio sube (sin precio propio, su regular es el del producto). Las nuevas
 * no tienen precio anterior: no "suben".
 */
export async function guardaPrecioVariantes(req, _res, next) {
  const conPrecio = (req.body?.variantes ?? []).filter((v) => v.id && v.precio != null);
  if (conPrecio.length === 0) return next();
  const producto = await productoParaGuarda(prisma, req.params.id);
  if (!producto) return next();
  const actuales = new Map(producto.variantes.map((v) => [v.id, v.precio]));
  const alguna = conPrecio.some((v) => actuales.has(v.id) && sube(v.precio, actuales.get(v.id) ?? producto.precioBase));
  if (alguna) await exigirSinPromocionEnCurso(producto);
  next();
}

/** PUT /admin/producto-variantes/:id con `precio`. */
export async function guardaPrecioVariante(req, _res, next) {
  if (req.body?.precio == null) return next();
  const variante = await varianteParaGuarda(prisma, req.params.id);
  if (variante && sube(req.body.precio, variante.precio ?? variante.producto.precioBase)) {
    await exigirSinPromocionEnCurso(variante.producto);
  }
  next();
}
