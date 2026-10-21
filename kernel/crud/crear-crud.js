import { Router } from "express";
import GenericController from "../../controllers/generic.controller.js";
import GenericService from "../../services/generic.service.js";
import GenericRepository from "../../repositories/generic.repository.js";
import { runUnscoped } from "../tenant/index.js";
import { accesoAdmin } from "./politicas.js";

/**
 * Composition Root del CRUD genérico (docs/specs/antipatrones A7.1). Es el único
 * lugar que crea repositorio, servicio y controller con `new` y los une con las
 * rutas y los middlewares de su política (`POLITICAS`, A7.2).
 *
 * Dónde está la tienda dueña de una fila:
 * - `tiendaPropia` (por defecto): la fila tiene columna `tiendaId`.
 * - `tiendaDelPadre({ relacion, campo, modelo, nombre })`: la hereda del padre
 *   (`relacion` para leerla desde la fila, `campo` del body al crear).
 */
export const tiendaPropia = Object.freeze({ tipo: "propia" });

export const tiendaDelPadre = ({ relacion, campo, modelo, nombre }) =>
  Object.freeze({ tipo: "padre", relacion, campo, modelo, nombre });

/**
 * La dueña real, una consulta por request aunque varios middlewares pregunten.
 * Sin el auto-scope: cuando ya hay una tienda en el contexto (la que mandó el
 * cliente), el filtro escondería la fila de otra tienda y la dueña saldría null,
 * que es justo el caso que hay que rechazar.
 */
function porRequest(resolver) {
  const vistos = new WeakMap();
  return (req) => {
    if (!vistos.has(req)) vistos.set(req, runUnscoped(() => resolver(req)));
    return vistos.get(req);
  };
}

/**
 * @param {object} opciones
 * @param {object} opciones.modelo - delegado de Prisma (`prisma.categorias`).
 * @param {string} opciones.nombre - nombre del recurso: codes (`CATEGORIA_LIST`) y 404.
 * @param {object} opciones.politica - una de `POLITICAS`.
 * @param {(fila: object, ctx: object) => object} opciones.serializer
 * @param {{ listado, id, crear?, editar? }} opciones.schemas - Zod de entrada.
 * @param {object} [opciones.servicio] - orden, filtros y búsqueda permitidos
 *   (`defaultOrderBy`, `allowedFilters`, `allowedOrderBy`, `searchFields`).
 * @param {object} [opciones.tienda] - `tiendaPropia` o `tiendaDelPadre(...)`.
 * @param {object} [opciones.requiere] - por operación, guardas tras el acceso.
 * @param {object} [opciones.antesDeGuardar] - por operación, reglas tras validar.
 * @param {object} [opciones.acciones] - por operación, otro handler en lugar del
 *   del controller (p. ej. borrar la imagen y sus archivos).
 * @returns {{ router, repositorio, servicio, controller, acceso }} `acceso(rol,
 *   "registro" | "padre")` da la cadena de escritura del Admin (va después de
 *   authMiddleware) para las rutas del recurso que no son CRUD.
 */
export function crearCrud({
  modelo,
  nombre,
  politica,
  serializer,
  schemas,
  servicio = {},
  tienda = tiendaPropia,
  requiere = {},
  antesDeGuardar = {},
  acciones = {}
}) {
  const hijo = tienda.tipo === "padre";
  const repositorio = new GenericRepository(modelo, nombre);
  const padre = hijo ? new GenericRepository(tienda.modelo, tienda.nombre) : null;

  const service = new GenericService(repositorio, {
    ...servicio,
    ...politica.servicio,
    ...(hijo ? { tenantRelation: tienda.relacion } : {})
  });
  const controller = new GenericController(service, nombre, { serialize: serializer });

  const dueno = {
    delRegistro: porRequest((req) => hijo
      ? repositorio.findRelatedTiendaId(req.params.id, tienda.relacion)
      : repositorio.findTiendaIdById(req.params.id)),
    delPadre: hijo
      ? porRequest(async (req) => {
        const padreId = req.body?.[tienda.campo];
        return padreId ? padre.findTiendaIdById(padreId) : null;
      })
      : null
  };

  const handlers = {
    listar: controller.findAll,
    ver: controller.findById,
    crear: controller.create,
    editar: controller.update,
    borrar: controller.delete,
    ...acciones
  };

  const router = Router();
  const rutas = politica.rutas({ nombre, schemas, dueno, hijo, nombrePadre: tienda.nombre, requiere, antesDeGuardar });
  for (const { op, metodo, ruta, cadena } of rutas) {
    router[metodo](ruta, ...cadena, handlers[op]);
  }

  const acceso = (rol, desde = "registro") => {
    if (desde !== "padre") return accesoAdmin(rol, dueno.delRegistro, nombre);
    if (!hijo) throw new Error(`${nombre}: "padre" solo existe con tiendaDelPadre`);
    return accesoAdmin(rol, dueno.delPadre, tienda.nombre);
  };

  return { router, repositorio, servicio: service, controller, acceso };
}
