import { prisma } from "../../config/prisma.js";
import { crearCrud } from "../../kernel/crud/crear-crud.js";
import { POLITICAS } from "../../kernel/crud/politicas.js";
import {
  createCategoriaSchema,
  updateCategoriaSchema,
  idParamSchema,
  paginationSchema
} from "./categorias.schema.js";
import { serializeCategoriaAdmin } from "./categorias.serializer.js";

// Categorías de la tienda (Admin). Rutas, acceso por rol y alcance de tienda los
// pone la política (kernel/crud, docs/specs/antipatrones A7). El serializer admin
// incluye la auditoría, que el Admin sí ve, igual en listado y detalle.
export default crearCrud({
  modelo: prisma.categorias,
  nombre: "Categoria",
  politica: POLITICAS.adminTienda,
  serializer: serializeCategoriaAdmin,
  schemas: { listado: paginationSchema, id: idParamSchema, crear: createCategoriaSchema, editar: updateCategoriaSchema },
  servicio: {
    defaultOrderBy: [{ orden: "asc" }, { fechaRegistro: "asc" }],
    allowedFilters: ["activo", "categoriaPadreId"],
    allowedOrderBy: ["orden", "nombre", "fechaRegistro"]
  }
}).router;
