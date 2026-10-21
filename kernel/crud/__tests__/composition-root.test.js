import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Composition Root del CRUD (docs/specs/antipatrones A7): los recursos migrados no
// arman sus capas con `new` ni su cadena de acceso a mano; lo hace crearCrud con
// una política con nombre. Un recurso nuevo que se suma a crearCrud entra aquí.

// Sin BD: la política importa el kernel de tenant, que trae el cliente de Prisma.
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: {} }));
const { POLITICAS } = await import("../politicas.js");

const raiz = fileURLToPath(new URL("../../../", import.meta.url));
const leer = (f) => readFileSync(`${raiz}${f}`, "utf8");

const MIGRADOS = [
  "modules/catalogo/categorias.admin.routes.js",
  "modules/catalogo/categorias.store.routes.js",
  "modules/catalogo/marcas.admin.routes.js",
  "modules/catalogo/producto-atributos.admin.routes.js",
  "modules/catalogo/producto-variantes.admin.routes.js",
  "modules/catalogo/producto-imagenes.admin.routes.js"
];

describe("CRUD con Composition Root (A7.1, A7.3)", () => {
  test.each(MIGRADOS)("%s usa crearCrud con una política", (archivo) => {
    const codigo = leer(archivo);
    expect(codigo).toMatch(/crearCrud\(\{/);
    expect(codigo).toMatch(/politica: POLITICAS\.(adminTienda|vitrinaPublica)/);
  });

  test.each(MIGRADOS)("%s no crea sus capas ni su acceso a mano", (archivo) => {
    const codigo = leer(archivo);
    expect(codigo).not.toMatch(/new Generic(Repository|Service|Controller)/);
    expect(codigo).not.toMatch(/\b(resolveTiendaId|scopeReadToResourceTienda|requireTiendaAccess)\(/);
  });
});

describe("POLITICAS (A7.2)", () => {
  test("hay dos políticas con nombre, congeladas", () => {
    expect(Object.keys(POLITICAS)).toEqual(["adminTienda", "vitrinaPublica"]);
    expect(Object.isFrozen(POLITICAS)).toBe(true);
    for (const politica of Object.values(POLITICAS)) {
      expect(Object.isFrozen(politica)).toBe(true);
      // Las dos limitan el listado a una tienda en el servicio.
      expect(politica.servicio.requireTiendaId).toBe(true);
    }
  });

  test("el Admin pide un rol por operación; la vitrina solo lee", () => {
    expect(POLITICAS.adminTienda.roles).toEqual({ listar: "viewer", ver: "viewer", crear: "editor", editar: "editor", borrar: "admin" });
    const r = { nombre: "X", schemas: {}, dueno: {}, hijo: false, requiere: {}, antesDeGuardar: {} };
    expect(POLITICAS.vitrinaPublica.rutas(r).map((x) => x.op)).toEqual(["listar", "ver"]);
  });
});
