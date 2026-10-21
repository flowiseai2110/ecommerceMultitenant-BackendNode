import { prisma } from "../../config/prisma.js";
import { crearCrud } from "../../kernel/crud/crear-crud.js";
import { POLITICAS } from "../../kernel/crud/politicas.js";
import {
  createAtributoSchema,
  updateAtributoSchema,
  idParamSchema,
  paginationSchema
} from "./producto-atributos.schema.js";
import { serializeAtributoAdmin } from "./producto-atributos.serializer.js";

// Atributos de producto de la tienda (Admin). Rutas, acceso y alcance de tienda:
// la política (kernel/crud, docs/specs/antipatrones A7).
export default crearCrud({
  modelo: prisma.producto_atributos,
  nombre: "ProductoAtributo",
  politica: POLITICAS.adminTienda,
  serializer: serializeAtributoAdmin,
  schemas: { listado: paginationSchema, id: idParamSchema, crear: createAtributoSchema, editar: updateAtributoSchema },
  servicio: {
    allowedFilters: ["aplicaA"],
    allowedOrderBy: ["nombre", "fechaRegistro"]
  }
}).router;
