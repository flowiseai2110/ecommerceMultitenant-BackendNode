import { validate } from "../../middlewares/validation.middleware.js";
import { NotFoundError } from "../../utils/errors.js";
import {
  authMiddleware,
  requireTiendaAccess,
  resolveTiendaId,
  scopeReadToResourceTienda,
  requireTienda,
  scopeQueryToTienda
} from "../tenant/index.js";

/**
 * Políticas de acceso de un CRUD (docs/specs/antipatrones A7.2, Policy Object).
 *
 * Una política dice, para cada operación, quién puede (auth y rol mínimo), cómo
 * se limita a la tienda y en qué punto se valida la entrada. `crearCrud` la
 * compone con el recurso; ninguna ruta arma esa cadena a mano, así que olvidar
 * `scopeReadToResourceTienda` o el chequeo del dueño deja de ser posible.
 *
 * El recurso (`r`) que recibe `rutas` trae:
 * - `nombre`: para los 404.
 * - `schemas`: `{ listado, id, crear, editar }`.
 * - `dueno`: `{ delRegistro, delPadre }`, resolvers memorizados por request de
 *   la tienda dueña real (de la fila, o del padre al crear un hijo).
 * - `hijo`: true si la fila no tiene `tiendaId` propio (la hereda del padre).
 * - `nombrePadre`: para el 404 al crear un hijo con un padre de otra tienda.
 * - `requiere[op]`: guardas de "quién puede" del recurso (p. ej. la capacidad
 *   `marcas`), justo después del acceso.
 * - `antesDeGuardar[op]`: reglas de negocio con la entrada ya validada.
 */

/**
 * La tienda verificada por requireTiendaAccess tiene que ser la dueña real del
 * registro. Sin esto, un usuario de la tienda A que manda `?tiendaId=A` (o en el
 * body) para una fila de la tienda B pasaba el acceso con A; en las filas hijas
 * (variantes, imágenes), que el auto-scope de Prisma no cubre, eso leía y
 * escribía la fila de B. Mismo 404 que da el repositorio en las filas con
 * `tiendaId` propio. Si la fila no existe, sigue de largo: el 404 lo da el
 * repositorio, como antes.
 */
export function exigirTiendaDuena(resolver, nombre) {
  return async (req, _res, next) => {
    const duena = await resolver(req);
    if (duena && duena !== req.tiendaId) throw new NotFoundError(nombre);
    next();
  };
}

/** El listado usa la tienda verificada, no otra que llegue en la query. */
function listarSoloLaTiendaVerificada(req, _res, next) {
  req.validatedQuery = { ...(req.validatedQuery ?? {}), tiendaId: req.tiendaId };
  next();
}

/**
 * Filas hijas: no tienen columna `tiendaId`, así que el repositorio no filtra por
 * ella (ya se verificó la dueña arriba). `skipExistsCheck` evita repetir la
 * consulta de existencia que hizo el resolver del dueño.
 */
const sinColumnaTienda = ({ skipExistsCheck = false } = {}) => (req, _res, next) => {
  req.tiendaId = null;
  if (skipExistsCheck) req.skipExistsCheck = true;
  next();
};

/**
 * Acceso de escritura del Admin, después de authMiddleware: resuelve la tienda
 * dueña si el cliente no la manda, exige el rol en esa tienda y que sea la dueña
 * real. También lo usan las rutas de un recurso que no son CRUD (subir imagen, IA).
 */
export function accesoAdmin(rol, resolver, nombre) {
  return [resolveTiendaId(resolver), requireTiendaAccess(rol), exigirTiendaDuena(resolver, nombre)];
}

const de = (lista) => lista ?? [];

/** Panel de administración: miembro de la tienda con el rol de cada operación. */
const adminTienda = Object.freeze({
  nombre: "adminTienda",
  roles: Object.freeze({ listar: "viewer", ver: "viewer", crear: "editor", editar: "editor", borrar: "admin" }),
  servicio: Object.freeze({ enableAudit: true, requireTiendaId: true }),

  rutas(r) {
    const { roles } = adminTienda;
    const { delRegistro, delPadre } = r.dueno;
    return [
      {
        op: "listar", metodo: "get", ruta: "/",
        cadena: [
          authMiddleware,
          requireTiendaAccess(roles.listar),
          ...de(r.requiere.listar),
          validate({ query: r.schemas.listado }),
          listarSoloLaTiendaVerificada
        ]
      },
      {
        op: "ver", metodo: "get", ruta: "/:id",
        cadena: [
          authMiddleware,
          validate({ params: r.schemas.id }),
          // Siempre la dueña real, aunque el Admin mande la tienda activa.
          scopeReadToResourceTienda(delRegistro),
          requireTiendaAccess(roles.ver),
          exigirTiendaDuena(delRegistro, r.nombre),
          ...de(r.requiere.ver)
        ]
      },
      {
        op: "crear", metodo: "post", ruta: "/",
        cadena: [
          // Fila propia: la tienda viene en el body y es la que se verifica.
          // Fila hija: la tienda es la del padre (p. ej. el producto).
          authMiddleware,
          ...(r.hijo ? accesoAdmin(roles.crear, delPadre, r.nombrePadre) : [requireTiendaAccess(roles.crear)]),
          ...de(r.requiere.crear),
          validate({ body: r.schemas.crear }),
          ...de(r.antesDeGuardar.crear)
        ]
      },
      {
        op: "editar", metodo: "put", ruta: "/:id",
        cadena: [
          authMiddleware,
          ...accesoAdmin(roles.editar, delRegistro, r.nombre),
          ...de(r.requiere.editar),
          ...(r.hijo ? [sinColumnaTienda({ skipExistsCheck: true })] : []),
          validate({ params: r.schemas.id, body: r.schemas.editar }),
          ...de(r.antesDeGuardar.editar)
        ]
      },
      {
        op: "borrar", metodo: "delete", ruta: "/:id",
        cadena: [
          authMiddleware,
          ...accesoAdmin(roles.borrar, delRegistro, r.nombre),
          ...de(r.requiere.borrar),
          ...(r.hijo ? [sinColumnaTienda()] : []),
          validate({ params: r.schemas.id }),
          ...de(r.antesDeGuardar.borrar)
        ]
      }
    ];
  }
});

/**
 * Vitrina de la tienda: lectura pública, sin sesión. La tienda sale del
 * subdominio (o `?tienda=`/`?tiendaId=` en desarrollo); el detalle la exige.
 */
const vitrinaPublica = Object.freeze({
  nombre: "vitrinaPublica",
  roles: Object.freeze({}),
  servicio: Object.freeze({ requireTiendaId: true }),

  rutas(r) {
    return [
      {
        op: "listar", metodo: "get", ruta: "/",
        cadena: [validate({ query: r.schemas.listado }), scopeQueryToTienda, ...de(r.requiere.listar)]
      },
      {
        op: "ver", metodo: "get", ruta: "/:id",
        cadena: [
          validate({ params: r.schemas.id }),
          requireTienda,
          // El auto-scope de Prisma ya limita las filas propias, pero no las hijas:
          // la política no depende de él.
          exigirTiendaDuena(r.dueno.delRegistro, r.nombre),
          ...de(r.requiere.ver)
        ]
      }
    ];
  }
});

export const POLITICAS = Object.freeze({ adminTienda, vitrinaPublica });
