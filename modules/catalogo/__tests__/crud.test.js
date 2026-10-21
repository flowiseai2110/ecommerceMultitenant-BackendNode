import { registrarMocks, crearBd, montar, codigo, A, B, ID } from "./crud.fixtures.js";
import { CASOS, ATAQUES } from "./crud.casos.js";

// CRUD del catálogo armados con crearCrud y POLITICAS (docs/specs/antipatrones
// A7). Fija rutas, códigos y paginación (comparados con las rutas anteriores en
// la pieza 5) y que la tienda A no lee ni modifica nada de la tienda B, también
// sin el auto-scope de Prisma.

const ref = {};
registrarMocks(ref);
const { getTenantStore } = await import("../../../kernel/tenant/tenant-store.js");
const { MODELOS_DE_TIENDA } = await import("../../../kernel/tenant/alcance.js");
ref.bd = crearBd({ getTenantStore, MODELOS_DE_TIENDA });

const carga = async (f) => (await import(`../${f}`)).default;
let api;
beforeAll(async () => {
  api = await montar({
    "/admin/categorias": await carga("categorias.admin.routes.js"),
    "/admin/marcas": await carga("marcas.admin.routes.js"),
    "/admin/producto-atributos": await carga("producto-atributos.admin.routes.js"),
    "/admin/producto-variantes": await carga("producto-variantes.admin.routes.js"),
    "/admin/producto-imagenes": await carga("producto-imagenes.admin.routes.js"),
    "/store/categorias": await carga("categorias.store.routes.js")
  });
});
afterAll(() => api.cerrar());
beforeEach(() => ref.bd.reiniciar());

describe.each(Object.keys(CASOS))("%s: rutas y respuestas", (recurso) => {
  test.each(CASOS[recurso])("$caso → $esperado", async (caso) => {
    const { status, body } = await api.pedir(caso);
    expect([status, body.code]).toEqual([caso.esperado[0], codigo(recurso, caso.esperado[1])]);
  });
});

describe("contenido y paginación", () => {
  test("el listado trae solo la tienda, con su meta", async () => {
    const { body } = await api.pedir({ ruta: `/admin/categorias?tiendaId=${A}&page=2&limit=1`, usuario: "vic" });
    expect(body.data.map((c) => c.id)).toEqual([ID.catA2]);
    expect(body.meta).toEqual({ total: 2, page: 2, limit: 1, totalPages: 2, hasNextPage: false, hasPrevPage: true });
  });

  test("las variantes se listan por la tienda del producto", async () => {
    const { body } = await api.pedir({ ruta: `/admin/producto-variantes?tiendaId=${A}`, usuario: "vic" });
    expect(body.data.map((v) => v.id).sort()).toEqual([ID.varA, ID.varA2].sort());
  });

  test("crear deja la auditoría y responde la fila creada", async () => {
    const { body } = await api.pedir({ metodo: "POST", ruta: "/admin/marcas", usuario: "edu", body: { tiendaId: A, nombre: "Adidas", slug: "ADIDAS" } });
    expect(body.data).toMatchObject({ tiendaId: A, nombre: "Adidas", slug: "adidas", usuarioRegistro: "edu@test.pe" });
  });

  test("la vitrina no muestra la auditoría", async () => {
    const { body } = await api.pedir({ ruta: `/store/categorias/${ID.catA}`, tienda: A });
    expect(body.data.id).toBe(ID.catA);
    expect(body.data).not.toHaveProperty("usuarioRegistro");
  });
});

/** Todo lo que pertenece a la tienda B, para ver que un ataque no lo toca. */
function filasDeB() {
  const { tablas } = ref.bd;
  const deB = (f) => f.tiendaId === B || f.productoId === ID.prodB;
  return JSON.stringify(Object.fromEntries(Object.entries(tablas).map(([t, filas]) => [t, filas.filter(deB)])));
}

const NADA_DE_B = [B, ID.catB, ID.marB, ID.atrB, ID.prodB, ID.varB, ID.imgB, "Secreta", "Puma"];

describe.each([
  ["con el auto-scope de Prisma", true],
  ["sin el auto-scope: la política aísla sola", false]
])("tienda A contra tienda B, %s", (_titulo, autoScope) => {
  describe.each(Object.keys(ATAQUES))("%s", (recurso) => {
    test.each(ATAQUES[recurso])("$caso → $esperado", async (caso) => {
      ref.bd.autoScope = autoScope;
      const antes = filasDeB();
      const { status, body } = await api.pedir({ usuario: caso.sinUsuario ? undefined : "ana", ...caso });
      expect(status).toBe(caso.esperado);
      expect(filasDeB()).toBe(antes);
      const texto = JSON.stringify(body);
      for (const dato of NADA_DE_B) expect(texto).not.toContain(dato);
    });
  });
});
