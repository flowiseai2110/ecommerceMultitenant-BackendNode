import { ValidationError } from "../../utils/errors.js";

/**
 * Servicio de Inventario: control de stock de productos y variantes.
 *
 * Todas las operaciones reciben una transacción Prisma (`tx`) porque son
 * concurrency-critical y deben correr dentro de la misma transacción que crea o
 * cancela el pedido (contexto Órdenes). Usan SELECT ... FOR UPDATE y UPDATE con
 * guardas de stock para serializar pedidos concurrentes sobre el mismo item y
 * evitar oversell. No abren su propia transacción ni tocan la red.
 */

/**
 * Valida y BLOQUEA (FOR UPDATE) el stock de todos los items en 2 queries fijas
 * (una por tabla), sin importar cuántos items tenga el pedido.
 *
 * - Agrupa cantidades por producto/variante (el mismo item puede venir en varias
 *   líneas y debe validarse contra la suma total).
 * - Los ids se ordenan para que transacciones concurrentes tomen los locks en el
 *   mismo orden y no se produzcan deadlocks.
 * - Filtra por tiendaId (scope multi-tenant).
 * - Los productos tipo servicio se excluyen del descuento (no manejan stock).
 *
 * @param {import("../../config/prisma.js").prisma} tx - Cliente transaccional Prisma.
 * @param {string} tiendaId
 * @param {Array<{productoId?: string, varianteId?: string, cantidad: number, productoNombre?: string, varianteNombre?: string}>} detalles
 * @returns {Promise<{ variantesADescontar: Array<{id:string,cantidad:number}>, productosADescontar: Array<{id:string,cantidad:number}> }>}
 * @throws {ValidationError} si algún item no está disponible o no alcanza el stock.
 */
export async function validarYBloquearStock(tx, tiendaId, detalles) {
  const cantidadesVariante = new Map();
  const cantidadesProducto = new Map();
  const nombrePorId = new Map();

  for (const item of detalles) {
    if (!item.productoId) continue;
    if (item.varianteId) {
      cantidadesVariante.set(
        item.varianteId,
        (cantidadesVariante.get(item.varianteId) || 0) + item.cantidad
      );
      nombrePorId.set(item.varianteId, item.varianteNombre || item.varianteId);
    } else {
      cantidadesProducto.set(
        item.productoId,
        (cantidadesProducto.get(item.productoId) || 0) + item.cantidad
      );
      nombrePorId.set(item.productoId, item.productoNombre);
    }
  }

  const varianteIds = [...cantidadesVariante.keys()].sort();
  const productoIds = [...cantidadesProducto.keys()].sort();

  const variantes = varianteIds.length
    ? await tx.$queryRaw`
        SELECT pv.id, pv.stock, pv.activo
        FROM producto_variantes pv
        JOIN productos p ON p.id = pv.producto_id
        WHERE pv.id = ANY(${varianteIds}::uuid[])
          AND p.tienda_id = ${tiendaId}::uuid
        ORDER BY pv.id
        FOR UPDATE OF pv
      `
    : [];

  const productos = productoIds.length
    ? await tx.$queryRaw`
        SELECT id, stock, activo, es_servicio AS "esServicio"
        FROM productos
        WHERE id = ANY(${productoIds}::uuid[])
          AND tienda_id = ${tiendaId}::uuid
        ORDER BY id
        FOR UPDATE
      `
    : [];

  const variantesPorId = new Map(variantes.map(v => [v.id, v]));
  for (const [id, cantidad] of cantidadesVariante) {
    const variante = variantesPorId.get(id);
    if (!variante || !variante.activo) {
      throw new ValidationError(`Variante "${nombrePorId.get(id)}" no disponible`);
    }
    if (variante.stock < cantidad) {
      throw new ValidationError(
        `Stock insuficiente para "${nombrePorId.get(id)}". Disponible: ${variante.stock}, solicitado: ${cantidad}`
      );
    }
  }

  const productosPorId = new Map(productos.map(p => [p.id, p]));
  for (const [id, cantidad] of cantidadesProducto) {
    const producto = productosPorId.get(id);
    if (!producto || !producto.activo) {
      throw new ValidationError(`Producto "${nombrePorId.get(id)}" no disponible`);
    }
    // Los servicios no tienen stock físico
    if (!producto.esServicio && producto.stock < cantidad) {
      throw new ValidationError(
        `Stock insuficiente para "${nombrePorId.get(id)}". Disponible: ${producto.stock}, solicitado: ${cantidad}`
      );
    }
  }

  return {
    variantesADescontar: [...cantidadesVariante].map(([id, cantidad]) => ({ id, cantidad })),
    productosADescontar: [...cantidadesProducto]
      .filter(([id]) => !productosPorId.get(id).esServicio)
      .map(([id, cantidad]) => ({ id, cantidad }))
  };
}

/**
 * Descuenta stock en 2 queries fijas (una por tabla) vía UPDATE ... FROM unnest.
 * La guarda "stock >= cantidad" es defensa en profundidad: con los locks
 * FOR UPDATE ya tomados en validarYBloquearStock nunca debería fallar, pero si
 * fallara el conteo de filas afectadas no cuadra y se hace rollback en vez de
 * dejar stock negativo.
 *
 * @param {import("../../config/prisma.js").prisma} tx
 * @param {Array<{id:string,cantidad:number}>} variantesADescontar
 * @param {Array<{id:string,cantidad:number}>} productosADescontar
 * @throws {ValidationError} si el stock cambió y el conteo de filas no cuadra.
 */
export async function descontarStock(tx, variantesADescontar, productosADescontar) {
  if (variantesADescontar.length > 0) {
    const ids = variantesADescontar.map(v => v.id);
    const cantidades = variantesADescontar.map(v => v.cantidad);
    const afectadas = await tx.$executeRaw`
      UPDATE producto_variantes pv
      SET stock = pv.stock - d.cantidad
      FROM (SELECT unnest(${ids}::uuid[]) AS id, unnest(${cantidades}::int[]) AS cantidad) d
      WHERE pv.id = d.id AND pv.stock >= d.cantidad
    `;
    if (afectadas !== variantesADescontar.length) {
      throw new ValidationError("El stock cambió mientras se procesaba el pedido. Intenta nuevamente.");
    }
  }

  if (productosADescontar.length > 0) {
    const ids = productosADescontar.map(p => p.id);
    const cantidades = productosADescontar.map(p => p.cantidad);
    const afectados = await tx.$executeRaw`
      UPDATE productos p
      SET stock = p.stock - d.cantidad
      FROM (SELECT unnest(${ids}::uuid[]) AS id, unnest(${cantidades}::int[]) AS cantidad) d
      WHERE p.id = d.id AND p.stock >= d.cantidad
    `;
    if (afectados !== productosADescontar.length) {
      throw new ValidationError("El stock cambió mientras se procesaba el pedido. Intenta nuevamente.");
    }
  }
}

/**
 * Repone stock a partir de los detalles de un pedido (usado al cancelar).
 * Agrupa por variante/producto y repone en 2 queries fijas. Los productos tipo
 * servicio no se reponen (no se les descontó al crear).
 *
 * @param {import("../../config/prisma.js").prisma} tx
 * @param {Array<{productoId?: string, varianteId?: string, cantidad: number}>} detalles
 */
export async function reponerStock(tx, detalles) {
  const reponerVariantes = new Map();
  const reponerProductos = new Map();
  for (const item of detalles) {
    if (!item.productoId) continue;
    if (item.varianteId) {
      reponerVariantes.set(
        item.varianteId,
        (reponerVariantes.get(item.varianteId) || 0) + item.cantidad
      );
    } else {
      reponerProductos.set(
        item.productoId,
        (reponerProductos.get(item.productoId) || 0) + item.cantidad
      );
    }
  }

  if (reponerVariantes.size > 0) {
    const ids = [...reponerVariantes.keys()];
    const cantidades = [...reponerVariantes.values()];
    await tx.$executeRaw`
      UPDATE producto_variantes pv
      SET stock = pv.stock + d.cantidad
      FROM (SELECT unnest(${ids}::uuid[]) AS id, unnest(${cantidades}::int[]) AS cantidad) d
      WHERE pv.id = d.id
    `;
  }

  if (reponerProductos.size > 0) {
    const ids = [...reponerProductos.keys()];
    const cantidades = [...reponerProductos.values()];
    // Los servicios no manejan stock físico: no se les descuenta al crear
    // ni se les repone al cancelar
    await tx.$executeRaw`
      UPDATE productos p
      SET stock = p.stock + d.cantidad
      FROM (SELECT unnest(${ids}::uuid[]) AS id, unnest(${cantidades}::int[]) AS cantidad) d
      WHERE p.id = d.id AND p.es_servicio = false
    `;
  }
}
