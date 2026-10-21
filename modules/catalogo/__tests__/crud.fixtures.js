import { jest } from "@jest/globals";
import express from "express";
import http from "node:http";

/**
 * Banco de pruebas de los CRUD del catálogo (docs/specs/antipatrones A7.3): una
 * BD en memoria con el mismo auto-scope de config/prisma.js, sesión por header y
 * membresías fijas. Sin red ni Supabase.
 *
 * Tiendas: A y B con marcas, C sin la capacidad `marcas`.
 * Usuarios: ana (admin de A y de C), edu (editor de A), vic (viewer de A),
 * beto (admin de B) y doble (admin de A y de B).
 */

export const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const A = uuid(1);
export const B = uuid(2);
export const C = uuid(3);
export const NO_EXISTE = uuid(999);

const MIEMBROS = {
  ana: { [A]: "admin", [C]: "admin" },
  edu: { [A]: "editor" },
  vic: { [A]: "viewer" },
  beto: { [B]: "admin" },
  doble: { [A]: "admin", [B]: "admin" }
};
const CON_MARCAS = new Set([A, B]);

export const ID = {
  catA: uuid(101), catA2: uuid(102), catB: uuid(103),
  marA: uuid(111), marB: uuid(112), marC: uuid(113),
  atrA: uuid(121), atrB: uuid(122),
  prodA: uuid(131), prodB: uuid(132),
  varA: uuid(141), varA2: uuid(142), varB: uuid(143),
  imgA: uuid(151), imgB: uuid(152)
};

const FECHA = new Date("2026-01-01T00:00:00.000Z");
const audit = { fechaRegistro: FECHA, usuarioRegistro: "seed", fechaActualizacion: null, usuarioActualizacion: null };

function semilla() {
  return {
    categorias: [
      { id: ID.catA, tiendaId: A, categoriaPadreId: null, nombre: "Polos", slug: "polos", codigo: null, descripcion: null, imagenUrl: null, orden: 0, activo: true, ...audit },
      { id: ID.catA2, tiendaId: A, categoriaPadreId: null, nombre: "Gorras", slug: "gorras", codigo: "GO", descripcion: null, imagenUrl: null, orden: 1, activo: false, ...audit },
      { id: ID.catB, tiendaId: B, categoriaPadreId: null, nombre: "Secreta", slug: "secreta", codigo: null, descripcion: null, imagenUrl: null, orden: 0, activo: true, ...audit }
    ],
    marcas: [
      { id: ID.marA, tiendaId: A, nombre: "Nike", slug: "nike", logoUrl: null, orden: 0, activo: true, ...audit },
      { id: ID.marB, tiendaId: B, nombre: "Puma", slug: "puma", logoUrl: null, orden: 0, activo: true, ...audit },
      { id: ID.marC, tiendaId: C, nombre: "Otra", slug: "otra", logoUrl: null, orden: 0, activo: true, ...audit }
    ],
    producto_atributos: [
      { id: ID.atrA, tiendaId: A, nombre: "Talla", valores: ["S", "M"], aplicaA: null, ...audit },
      { id: ID.atrB, tiendaId: B, nombre: "Color", valores: ["Rojo"], aplicaA: null, ...audit }
    ],
    productos: [
      { id: ID.prodA, tiendaId: A, nombre: "Polo", precioBase: 50 },
      { id: ID.prodB, tiendaId: B, nombre: "Casaca", precioBase: 90 }
    ],
    producto_variantes: [
      { id: ID.varA, productoId: ID.prodA, nombre: "S", sku: "P-S", precio: 50, stock: 3, atributos: null, activo: true, ...audit },
      { id: ID.varA2, productoId: ID.prodA, nombre: "M", sku: "P-M", precio: null, stock: 0, atributos: null, activo: false, ...audit },
      { id: ID.varB, productoId: ID.prodB, nombre: "L", sku: "C-L", precio: 90, stock: 1, atributos: null, activo: true, ...audit }
    ],
    producto_imagenes: [
      { id: ID.imgA, productoId: ID.prodA, varianteId: null, valorOpcion: null, url: "https://img.test/a.webp", urlJpeg: null, storagePath: "a.webp", storagePathJpeg: null, textoAlternativo: null, orden: 0, esPrincipal: true, ...audit },
      { id: ID.imgB, productoId: ID.prodB, varianteId: null, valorOpcion: null, url: "https://img.test/b.webp", urlJpeg: null, storagePath: "b.webp", storagePathJpeg: null, textoAlternativo: null, orden: 0, esPrincipal: true, ...audit }
    ]
  };
}

/** Relaciones a un padre con tiendaId (las que usan los CRUD hijos). */
const RELACIONES = { producto: { tabla: "productos", campo: "productoId" } };
/** Únicos compuestos de la BD (uq_*_tienda_slug). */
const UNICOS = { categorias: ["tiendaId", "slug"], marcas: ["tiendaId", "slug"] };

class PrismaClientKnownRequestError extends Error {
  constructor(message, { code, meta }) { super(message); this.code = code; this.meta = meta; }
}
class PrismaClientValidationError extends Error {}

/**
 * BD en memoria con la forma de Prisma que usan GenericRepository y los
 * resolvers. `autoScope` copia `conScopeDeTienda` de config/prisma.js; se apaga
 * para probar que la política aísla sola.
 */
export function crearBd({ getTenantStore, MODELOS_DE_TIENDA }) {
  const bd = { tablas: semilla(), autoScope: true, secuencia: 500 };

  const relacionDe = (fila, nombre) => {
    const rel = RELACIONES[nombre];
    return bd.tablas[rel.tabla].find((p) => p.id === fila[rel.campo]) ?? null;
  };

  function cumple(fila, where) {
    if (!where) return true;
    return Object.entries(where).every(([k, v]) => {
      if (v === undefined) return true;
      if (k === "AND") return [].concat(v).every((w) => cumple(fila, w));
      if (k === "OR") return v.some((w) => cumple(fila, w));
      if (RELACIONES[k]) { const padre = relacionDe(fila, k); return !!padre && cumple(padre, v); }
      if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
        if ("contains" in v) return String(fila[k] ?? "").toLowerCase().includes(String(v.contains).toLowerCase());
        if ("in" in v) return v.in.includes(fila[k]);
        if ("gte" in v || "lte" in v) return (v.gte === undefined || fila[k] >= v.gte) && (v.lte === undefined || fila[k] <= v.lte);
      }
      return fila[k] === v;
    });
  }

  function proyectar(fila, select) {
    if (!fila || !select) return fila ? structuredClone(fila) : null;
    const salida = {};
    for (const [k, v] of Object.entries(select)) {
      if (!v) continue;
      salida[k] = RELACIONES[k] ? proyectar(relacionDe(fila, k), v.select) : fila[k];
    }
    return salida;
  }

  function ordenar(filas, orderBy) {
    const criterios = [].concat(orderBy ?? []).flatMap((o) => Object.entries(o));
    return [...filas].sort((x, y) => {
      for (const [campo, dir] of criterios) {
        if (x[campo] === y[campo]) continue;
        const menor = x[campo] == null ? -1 : y[campo] == null ? 1 : x[campo] < y[campo] ? -1 : 1;
        return dir === "desc" ? -menor : menor;
      }
      return 0;
    });
  }

  function exigirId(where) {
    if (where?.id === undefined) throw new PrismaClientValidationError("Argument `where` needs `id`");
  }

  function modelo(nombre) {
    const tabla = () => bd.tablas[nombre];
    const scope = (where, porClave) => {
      const store = getTenantStore();
      const tiendaId = bd.autoScope && store && !store.bypass ? store.tiendaId : null;
      if (!tiendaId || !MODELOS_DE_TIENDA.has(nombre)) return where;
      if (porClave) return { ...where, AND: [...[].concat(where?.AND ?? []), { tiendaId }] };
      return where ? { AND: [where, { tiendaId }] } : { tiendaId };
    };
    const unico = (fila, id) => {
      const campos = UNICOS[nombre];
      if (campos && tabla().some((o) => o.id !== id && campos.every((c) => o[c] === fila[c]))) {
        throw new PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", meta: { target: campos } });
      }
    };
    return {
      async findMany({ where, orderBy, skip = 0, take, select } = {}) {
        const filas = ordenar(tabla().filter((f) => cumple(f, scope(where))), orderBy);
        return filas.slice(skip, take === undefined ? undefined : skip + take).map((f) => proyectar(f, select));
      },
      async count({ where } = {}) {
        return tabla().filter((f) => cumple(f, scope(where))).length;
      },
      async findUnique({ where, select }) {
        exigirId(where);
        return proyectar(tabla().find((f) => cumple(f, scope(where, true))) ?? null, select);
      },
      async findFirst({ where, select } = {}) {
        return proyectar(tabla().find((f) => cumple(f, scope(where))) ?? null, select);
      },
      async create({ data }) {
        const fila = { id: uuid(++bd.secuencia), ...data };
        unico(fila);
        tabla().push(fila);
        return structuredClone(fila);
      },
      async update({ where, data }) {
        exigirId(where);
        const fila = tabla().find((f) => cumple(f, scope(where, true)));
        if (!fila) throw new PrismaClientKnownRequestError("Record not found", { code: "P2025", meta: {} });
        unico({ ...fila, ...data }, fila.id);
        Object.assign(fila, data);
        return structuredClone(fila);
      },
      async delete({ where }) {
        exigirId(where);
        const i = tabla().findIndex((f) => cumple(f, scope(where, true)));
        if (i < 0) throw new PrismaClientKnownRequestError("Record not found", { code: "P2025", meta: {} });
        return tabla().splice(i, 1)[0];
      }
    };
  }

  bd.prisma = Object.fromEntries(Object.keys(semilla()).map((n) => [n, modelo(n)]));
  bd.reiniciar = () => { bd.tablas = semilla(); bd.autoScope = true; bd.secuencia = 500; };
  return bd;
}

/** Tareas de IA: taskId → tienda que la generó. */
/** Código completo: los casos dicen solo la acción ("LIST", "CREATED"…). */
export const PREFIJOS = {
  categorias: "CATEGORIA", marcas: "MARCA", atributos: "PRODUCTOATRIBUTO",
  variantes: "PRODUCTOVARIANTE", imagenes: "PRODUCTOIMAGEN", vitrinaCategorias: "CATEGORIA"
};
const ACCIONES = new Set(["LIST", "FOUND", "CREATED", "UPDATED", "DELETED"]);
export const codigo = (recurso, accion) => (ACCIONES.has(accion) ? `${PREFIJOS[recurso]}_${accion}` : accion);

export const TAREAS_IA = new Map([["tarea-a", A], ["tarea-b", B]]);

/**
 * Registra los mocks de módulo. Se llama en el nivel superior del test, antes de
 * importar las rutas. `bd` se completa después (el fake necesita módulos reales).
 */
export function registrarMocks(ref) {
  const callado = { error() {}, warn() {}, info() {}, debug() {}, http() {}, log() {} };
  jest.unstable_mockModule("../../../config/logger.js", () => ({ logger: callado, default: callado }));
  jest.unstable_mockModule("../../../config/prisma.js", () => ({
    get prisma() { return ref.bd.prisma; }
  }));
  jest.unstable_mockModule("../../../generated/prisma/client.ts", () => ({
    Prisma: { PrismaClientKnownRequestError, PrismaClientValidationError }
  }));
  jest.unstable_mockModule("../../../middlewares/auth.middleware.js", async () => {
    const { UnauthorizedError } = await import("../../../utils/errors.js");
    const authMiddleware = (req, _res, next) => {
      const id = req.get("x-usuario");
      if (!id) return next(new UnauthorizedError("Token no proporcionado"));
      req.user = { id, email: `${id}@test.pe` };
      next();
    };
    return { authMiddleware, requireRole: () => (_q, _s, n) => n(), optionalAuth: (_q, _s, n) => n(), default: {} };
  });
  jest.unstable_mockModule("../../../kernel/tenant/membership.js", () => ({
    findActiveMembership: async (usuario, tiendaId) => (MIEMBROS[usuario]?.[tiendaId] ? { rol: MIEMBROS[usuario][tiendaId] } : null),
    hasAnyActiveMembership: async (usuario) => !!MIEMBROS[usuario]
  }));
  jest.unstable_mockModule("../../../services/roles.service.js", () => ({
    getCodigoRol: async (rol) => rol,
    getRolesUsuario: async () => [],
    getIdRolByCodigo: async (c) => c,
    tienePermisosAdmin: async () => true,
    compararRoles: async () => 0,
    default: {}
  }));
  jest.unstable_mockModule("../../negocio/negocio.middleware.js", async () => {
    const { ValidationError } = await import("../../../utils/errors.js");
    return {
      requiereCapacidad: (capacidad) => (req, _res, next) => (CON_MARCAS.has(req.tiendaId)
        ? next()
        : next(new ValidationError("Errores de validación", { body: { tiendaId: `Sin ${capacidad}` } }))),
      prepararProductoDelRubro: () => (_q, _s, n) => n()
    };
  });
  // R10.5 de campanas-descuento: aquí, un precio de más de 1000 "sube" durante una promoción.
  jest.unstable_mockModule("../../campanas/promocion.guardas.js", async () => {
    const { ConflictError } = await import("../../../utils/errors.js");
    return {
      guardaPrecioVariante: (req, _res, next) => (req.body?.precio > 1000 ? next(new ConflictError("En promoción")) : next()),
      guardaPrecioProducto: (_q, _s, n) => n(),
      guardaPrecioVariantes: (_q, _s, n) => n(),
      mensajePrecioEnPromocion: () => ""
    };
  });
  jest.unstable_mockModule("../../../middlewares/upload.middleware.js", () => ({
    uploadImage: { single: () => (_q, _s, n) => n() }
  }));
  jest.unstable_mockModule("../../../controllers/producto-imagenes.controller.js", () => ({
    makeUploadImagen: () => (req, res) => res.status(201).json({ code: "SUBIDA", tiendaId: req.tiendaId, productoId: req.body.productoId }),
    makeUploadImagenForProducto: () => (_req, res) => res.status(201).json({ code: "SUBIDA" }),
    // Como el real: borra por id sin la tienda (ya verificada por la ruta) y limpia archivos.
    deleteImagenWithCleanup: async (req, res) => {
      await ref.bd.prisma.producto_imagenes.delete({ where: { id: req.params.id } });
      res.json({ code: "PRODUCTOIMAGEN_DELETED" });
    }
  }));
  jest.unstable_mockModule("../../../controllers/ai-imagen.controller.js", () => ({
    generarImagenIA: (req, res) => res.json({ code: "IA_INICIADA", tiendaId: req.tiendaId, id: req.params.id }),
    consultarEstadoImagenIA: (req, res) => res.json({ code: "IA_ESTADO", taskId: req.params.taskId }),
    confirmarImagenIA: (req, res) => res.status(201).json({ code: "IA_CONFIRMADA", tiendaId: req.tiendaId })
  }));
  jest.unstable_mockModule("../../../services/ai-image.service.js", () => ({
    getTaskTiendaId: (taskId) => TAREAS_IA.get(taskId) ?? null,
    default: {}
  }));
}

/** Monta los routers como en routes/admin y routes/store, con el contexto ALS de server.js. */
export async function montar(routers) {
  const { runWithTenantContext, setContextTiendaId } = await import("../../../kernel/tenant/index.js");
  const { errorHandler, notFoundHandler } = await import("../../../middlewares/error.middleware.js");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => runWithTenantContext(next));
  // Lo que hace resolveTienda en routes/store: la tienda del subdominio.
  app.use((req, _res, next) => {
    const tienda = req.get("x-tienda");
    if (tienda) { req.tiendaId = tienda; setContextTiendaId(tienda); }
    next();
  });
  for (const [ruta, router] of Object.entries(routers)) app.use(ruta, router);
  app.use(notFoundHandler);
  app.use(errorHandler);
  const server = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  // node:http y no fetch: hace falta mandar body también en un GET (caso de ataque).
  function pedir({ metodo = "GET", ruta, usuario, tienda, body }) {
    const headers = { "content-type": "application/json" };
    if (usuario) headers["x-usuario"] = usuario;
    if (tienda) headers["x-tienda"] = tienda;
    const datos = body === undefined ? null : JSON.stringify(body);
    if (datos) headers["content-length"] = Buffer.byteLength(datos);
    return new Promise((resolve, reject) => {
      const req = http.request(`${base}${ruta}`, { method: metodo, headers }, (res) => {
        let texto = "";
        res.setEncoding("utf8");
        res.on("data", (c) => { texto += c; });
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(texto) }));
      });
      req.on("error", reject);
      if (datos) req.write(datos);
      req.end();
    });
  }
  const cerrar = () => new Promise((resolve) => server.close(resolve));
  return { pedir, cerrar };
}
