import { prisma } from "../../config/prisma.js";
import { crearCrud, tiendaDelPadre } from "../../kernel/crud/crear-crud.js";
import { POLITICAS } from "../../kernel/crud/politicas.js";
import {
  createVarianteSchema,
  updateVarianteSchema,
  idParamSchema,
  paginationSchema
} from "./producto-variantes.schema.js";
import { serializeVarianteAdmin } from "./producto-variantes.serializer.js";
import { guardaPrecioVariante } from "../campanas/promocion.guardas.js";

// Variantes de producto (Admin). producto_variantes no tiene tiendaId propio: la
// tienda dueña es la del producto (al crear, la del productoId del body). La
// política la verifica en cada ruta (kernel/crud, docs/specs/antipatrones A7).
export default crearCrud({
  modelo: prisma.producto_variantes,
  nombre: "ProductoVariante",
  politica: POLITICAS.adminTienda,
  serializer: serializeVarianteAdmin,
  schemas: { listado: paginationSchema, id: idParamSchema, crear: createVarianteSchema, editar: updateVarianteSchema },
  tienda: tiendaDelPadre({ relacion: "producto", campo: "productoId", modelo: prisma.productos, nombre: "Producto" }),
  servicio: {
    allowedFilters: ["productoId", "activo"],
    allowedOrderBy: ["nombre", "fechaRegistro"]
  },
  // R10.5: no sube el precio regular durante una promoción en curso
  antesDeGuardar: { editar: [guardaPrecioVariante] }
}).router;
