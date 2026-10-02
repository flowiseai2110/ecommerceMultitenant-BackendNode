import { prisma } from "../../config/prisma.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";
import { claveCombinacion, claveDe, nombreVariante } from "./producto-opciones.js";

/**
 * Servicio de opciones/variantes de producto (ver producto-opciones.js para el modelo).
 */

const SELECT_VARIANTE = { id: true, nombre: true, sku: true, precio: true, stock: true, atributos: true, activo: true };

/**
 * Reemplaza las opciones y la matriz de variantes de un producto en una sola
 * transacción:
 * - Cada combinación reusa su variante existente (por id, o por atributos si el
 *   dueño quitó y volvió a poner un valor): así no cambia el varianteId que
 *   referencian los pedidos y carritos.
 * - Las variantes que ya no están en la matriz se DESACTIVAN, no se borran
 *   (pedidos viejos las referencian y reponerStock las usa al cancelar).
 * - productos.stock pasa a ser la suma de las variantes (invariante que mantiene
 *   inventario.service al vender/cancelar) y productos.colores sale de la opción
 *   de color, para que el filtro del asesor IA siga funcionando.
 *
 * Escrituras en lote (createMany / UPDATE ... FROM unnest): con la latencia al
 * pooler de Supabase, un update por variante haría que 100 variantes tarden
 * segundos y revienten el timeout de la transacción.
 *
 * @param {object} params
 * @param {string} params.productoId
 * @param {string} params.tiendaId - Tienda dueña ya validada por requireTiendaAccess.
 * @param {Array} params.opciones - Validadas por sincronizarVariantesSchema.
 * @param {Array} params.variantes - Validadas por sincronizarVariantesSchema.
 * @param {object} [params.user] - req.user, para auditoría.
 */
export async function sincronizarVariantes({ productoId, tiendaId, opciones, variantes, user }) {
  const usuario = user?.email || user?.id || "system";
  const claves = opciones.map(claveDe);

  return prisma.$transaction(async (tx) => {
    const producto = await tx.productos.findFirst({
      where: { id: productoId, tiendaId },
      select: { id: true, metadata: true }
    });
    if (!producto) throw new NotFoundError("Producto");

    const existentes = await tx.producto_variantes.findMany({
      where: { productoId },
      select: { id: true, atributos: true, activo: true }
    });
    const porId = new Map(existentes.map(v => [v.id, v]));
    // Si hubiera dos variantes con la misma combinación, se prefiere la activa.
    const porCombinacion = new Map();
    for (const v of existentes) {
      const combinacion = claveCombinacion(v.atributos, claves);
      if (combinacion && (!porCombinacion.has(combinacion) || v.activo)) porCombinacion.set(combinacion, v);
    }

    const usados = new Set();
    const actualizar = [];
    const crear = [];
    for (const entrada of variantes) {
      let destino = null;
      if (entrada.id) {
        destino = porId.get(entrada.id);
        if (!destino) throw new ValidationError("Una de las variantes no pertenece a este producto");
      } else {
        destino = porCombinacion.get(claveCombinacion(entrada.atributos, claves)) ?? null;
      }
      if (destino && usados.has(destino.id)) destino = null;

      const fila = {
        nombre: nombreVariante(opciones, entrada.atributos),
        sku: entrada.sku || null,
        precio: entrada.precio ?? null,
        stock: entrada.stock,
        atributos: entrada.atributos
      };
      if (destino) {
        usados.add(destino.id);
        actualizar.push({ id: destino.id, ...fila });
      } else {
        crear.push(fila);
      }
    }

    if (actualizar.length > 0) {
      await tx.$executeRaw`
        UPDATE producto_variantes pv
        SET nombre = d.nombre, sku = d.sku, precio = d.precio, stock = d.stock,
            atributos = d.atributos, activo = true,
            fecha_actualizacion = now(), usuario_actualizacion = ${usuario}
        FROM (
          SELECT unnest(${actualizar.map(v => v.id)}::uuid[]) AS id,
                 unnest(${actualizar.map(v => v.nombre)}::text[]) AS nombre,
                 unnest(${actualizar.map(v => v.sku)}::text[]) AS sku,
                 unnest(${actualizar.map(v => v.precio)}::numeric[]) AS precio,
                 unnest(${actualizar.map(v => v.stock)}::int[]) AS stock,
                 unnest(${actualizar.map(v => JSON.stringify(v.atributos))}::jsonb[]) AS atributos
        ) d
        WHERE pv.id = d.id AND pv.producto_id = ${productoId}::uuid
      `;
    }

    if (crear.length > 0) {
      await tx.producto_variantes.createMany({
        data: crear.map(v => ({ ...v, productoId, activo: true, usuarioRegistro: usuario }))
      });
    }

    const aDesactivar = existentes.filter(v => v.activo && !usados.has(v.id)).map(v => v.id);
    if (aDesactivar.length > 0) {
      await tx.producto_variantes.updateMany({
        where: { id: { in: aDesactivar }, productoId },
        data: { activo: false, fechaActualizacion: new Date(), usuarioActualizacion: usuario }
      });
    }

    const metadata = { ...(producto.metadata && typeof producto.metadata === "object" ? producto.metadata : {}) };
    if (opciones.length > 0) metadata.opciones = opciones;
    else delete metadata.opciones;

    const dataProducto = { metadata, fechaActualizacion: new Date(), usuarioActualizacion: usuario };
    if (variantes.length > 0) dataProducto.stock = variantes.reduce((s, v) => s + v.stock, 0);
    const opcionColor = opciones.find(o => o.tipo === "color");
    if (opcionColor) dataProducto.colores = opcionColor.valores;

    const actualizado = await tx.productos.update({
      where: { id: productoId },
      data: dataProducto,
      select: { stock: true, colores: true, metadata: true }
    });

    const activas = await tx.producto_variantes.findMany({
      where: { productoId, activo: true },
      select: SELECT_VARIANTE
    });

    return {
      opciones: actualizado.metadata?.opciones ?? [],
      stock: actualizado.stock,
      colores: actualizado.colores,
      variantes: activas
    };
  }, { timeout: 15000 });
}

/**
 * Opciones que la tienda ya usó en otros productos, para autocompletar el
 * formulario: nombre de la opción + todos los valores que ha usado con ella.
 * Agrupa por clave para que "Talla" y "talla" cuenten como la misma.
 * @param {string} tiendaId
 * @returns {Promise<Array<{ nombre: string, tipo: string, valores: string[], productos: number }>>}
 */
export async function opcionesUsadasPorTienda(tiendaId) {
  // WITH ORDINALITY conserva el orden en que la tienda escribió los valores
  // (S, M, L) en vez del alfabético (L, M, S).
  const filas = await prisma.$queryRaw`
    WITH v AS (
      SELECT o->>'nombre' AS nombre, coalesce(o->>'tipo', 'texto') AS tipo, x.valor, x.ord, p.id AS producto_id
      FROM productos p
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(p.metadata->'opciones') = 'array' THEN p.metadata->'opciones' ELSE '[]'::jsonb END
      ) o
      CROSS JOIN LATERAL jsonb_array_elements_text(o->'valores') WITH ORDINALITY x(valor, ord)
      WHERE p.tienda_id = ${tiendaId}::uuid
    ),
    g AS (
      SELECT nombre, tipo, valor, min(ord) AS ord FROM v GROUP BY nombre, tipo, valor
    )
    SELECT g.nombre, g.tipo, array_agg(g.valor ORDER BY g.ord, g.valor) AS valores,
           (SELECT count(DISTINCT v.producto_id) FROM v WHERE v.nombre = g.nombre AND v.tipo = g.tipo)::int AS productos
    FROM g
    GROUP BY g.nombre, g.tipo
  `;

  // Postgres agrupa "Talla" y "talla" por separado: se unen aquí por clave,
  // quedándose con el nombre del grupo más usado.
  const porClave = new Map();
  for (const f of filas) {
    const clave = claveDe({ nombre: f.nombre, tipo: f.tipo });
    if (!clave) continue;
    const previo = porClave.get(clave);
    if (!previo) {
      porClave.set(clave, { nombre: f.nombre, tipo: f.tipo, valores: [...f.valores], productos: f.productos });
      continue;
    }
    if (f.productos > previo.productos) previo.nombre = f.nombre;
    previo.productos += f.productos;
    for (const v of f.valores) {
      if (!previo.valores.some(x => x.toLowerCase() === v.toLowerCase())) previo.valores.push(v);
    }
  }
  return [...porClave.values()].sort((a, b) => b.productos - a.productos);
}
