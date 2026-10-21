import { prisma } from "../../config/prisma.js";
import { crearCrud } from "../../kernel/crud/crear-crud.js";
import { POLITICAS } from "../../kernel/crud/politicas.js";
import { idParamSchema, paginationSchema } from "./categorias.schema.js";
import { serializeCategoriaStore } from "./categorias.serializer.js";
import { localizado } from "../traducciones/localizar.js";
import { FUENTES } from "../traducciones/fuentes.js";

// Categorías de la vitrina (público): listado de la tienda del subdominio (o
// ?tiendaId= en desarrollo) y detalle que exige la tienda (docs/specs/antipatrones
// A1.8, A7). El serializer del store deja fuera la auditoría; nombre y descripción
// van en el idioma del visitante (docs/specs/idiomas D5).
export default crearCrud({
  modelo: prisma.categorias,
  nombre: "Categoria",
  politica: POLITICAS.vitrinaPublica,
  serializer: localizado(serializeCategoriaStore, FUENTES.categorias),
  schemas: { listado: paginationSchema, id: idParamSchema },
  servicio: {
    searchFields: ["nombre", "slug"],
    allowedFilters: ["activo", "categoriaPadreId"],
    allowedOrderBy: ["orden", "nombre", "fechaRegistro"]
  }
}).router;
