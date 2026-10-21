import { prisma } from "../../config/prisma.js";
import { crearCrud } from "../../kernel/crud/crear-crud.js";
import { POLITICAS } from "../../kernel/crud/politicas.js";
import { requiereCapacidad } from "../negocio/negocio.middleware.js";
import { createMarcaSchema, updateMarcaSchema, idParamSchema, paginationSchema } from "./marcas.schema.js";
import { serializeMarcaAdmin } from "./marcas.serializer.js";

// Marcas de la tienda: solo rubros con la capacidad `marcas` (modules/negocio).
// La capacidad se pide al listar y al crear; ver, editar y borrar una que ya
// existe no la piden. El borrado deja sus productos sin marca (ON DELETE SET NULL).
const conMarcas = requiereCapacidad("marcas");

export default crearCrud({
  modelo: prisma.marcas,
  nombre: "Marca",
  politica: POLITICAS.adminTienda,
  serializer: serializeMarcaAdmin,
  schemas: { listado: paginationSchema, id: idParamSchema, crear: createMarcaSchema, editar: updateMarcaSchema },
  servicio: {
    defaultOrderBy: [{ orden: "asc" }, { nombre: "asc" }],
    searchFields: ["nombre", "slug"],
    allowedFilters: ["activo"],
    allowedOrderBy: ["orden", "nombre", "fechaRegistro"]
  },
  requiere: { listar: [conMarcas], crear: [conMarcas] }
}).router;
