import { jest } from "@jest/globals";

// docs/specs/idiomas D7 · diseno.md B4, B7
const TIENDA = "22222222-2222-4222-8222-222222222222";
let claves, plataforma, propias;
const filtrar = (lista, where = {}) => lista.filter((x) => Object.entries(where).every(([k, v]) =>
  (v && typeof v === "object" && "in" in v ? v.in.includes(x[k]) : x[k] === v)));
const prisma = {
  tiendas: { findUnique: jest.fn(async () => ({ id: TIENDA, tipoNegocio: "productos" })) },
  textos_claves: { findMany: jest.fn(async ({ where }) => claves.filter((c) => c.grupos.some((g) => where.grupos.hasSome.includes(g)) && !c.obsoleta)) },
  textos_plataforma: { findMany: jest.fn(async ({ where } = {}) => filtrar(plataforma, where)) },
  tienda_textos: {
    findMany: jest.fn(async ({ where }) => filtrar(propias, where)),
    createMany: jest.fn((args) => ({ op: "createMany", args })),
    deleteMany: jest.fn((args) => ({ op: "deleteMany", args }))
  },
  $transaction: jest.fn(async (ops) => ops),
  idiomas: { findMany: jest.fn(async () => [
    { codigo: "es", nombre: "Español", activo: true, orden: 0 },
    { codigo: "en", nombre: "English", activo: true, orden: 10 }
  ]) }
};
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma, default: prisma }));

const { avanceTextos, clavesDeTienda, diccionario, grupoPrincipal, invalidarTextos, textoBase, textosPara, traductorPara } = await import("../textos.service.js");
const { invalidarIdiomas } = await import("../idiomas.service.js");
const { invalidarRubrosCache } = await import("../../negocio/rubros.cache.js");
const { FUENTES } = await import("../../traducciones/fuentes.js");
const { crearIdioma } = await import("../idioma.js");

const qu = crearIdioma({ codigo: "qu", nombre: "Runasimi", activo: true });
const en = crearIdioma({ codigo: "en", nombre: "English", activo: true });

beforeEach(() => {
  claves = [
    { clave: "Buscar", grupos: ["comun"], obsoleta: false },
    { clave: "Agregar al carrito", grupos: ["productos"], obsoleta: false },
    { clave: "Quedan {n}", grupos: ["productos", "tours"], obsoleta: false },
    { clave: "Salida|tour", grupos: ["tours"], obsoleta: false },
    { clave: "Vieja", grupos: ["comun"], obsoleta: true }
  ];
  plataforma = [
    { idioma: "en", clave: "Buscar", texto: "Search" },
    { idioma: "en", clave: "Agregar al carrito", texto: "Add to cart" },
    { idioma: "en", clave: "Salida|tour", texto: "Departure" }
  ];
  propias = [
    { tiendaId: TIENDA, idioma: "qu", clave: "Buscar", texto: "Maskay", origen: "manual" },
    { tiendaId: TIENDA, idioma: "en", clave: "Buscar", texto: "Find", origen: "manual" }
  ];
  invalidarTextos();
  invalidarRubrosCache();
  invalidarIdiomas();
  jest.clearAllMocks();
});

describe("diccionario de una tienda", () => {
  it("la traducción de la tienda gana a la de la plataforma", async () => {
    expect(await diccionario(TIENDA, en)).toEqual({ Buscar: "Find", "Agregar al carrito": "Add to cart" });
  });

  it("solo entran los grupos del rubro (productos no ve tours) y no las obsoletas", async () => {
    const dic = await diccionario(TIENDA, en);
    expect(dic).not.toHaveProperty("Salida|tour");
    expect(dic).not.toHaveProperty("Vieja");
  });

  it("un idioma sin traducciones de la plataforma solo tiene las de la tienda", async () => {
    expect(await diccionario(TIENDA, qu)).toEqual({ Buscar: "Maskay" });
  });

  it("avance: cuántos de los textos del rubro tienen traducción", async () => {
    expect(await avanceTextos(TIENDA, qu)).toEqual({ total: 3, traducidos: 1 });
    expect(await avanceTextos(TIENDA, en)).toEqual({ total: 3, traducidos: 2 });
  });

  it("se cachea por tienda e idioma", async () => {
    await diccionario(TIENDA, en);
    await diccionario(TIENDA, en);
    expect(prisma.textos_claves.findMany).toHaveBeenCalledTimes(1);
  });
});

// diseno.md "Grupos exactos": una clave lleva todos los grupos donde se usa
describe("claves que traduce una tienda", () => {
  it("las que tienen alguno de sus grupos, una vez cada una, con su grupo principal; las de otro rubro no", async () => {
    // Tienda de productos: "Quedan {n}" es de productos y de tours; "Salida|tour" solo de tours.
    const porClave = (a, b) => a.clave.localeCompare(b.clave);
    expect((await clavesDeTienda(TIENDA)).sort(porClave)).toEqual([
      { clave: "Agregar al carrito", grupo: "productos" },
      { clave: "Buscar", grupo: "comun" },
      { clave: "Quedan {n}", grupo: "productos" }
    ]);
  });

  it("grupoPrincipal: el primero de los del rubro, en su orden", () => {
    expect(grupoPrincipal(["tours", "productos"], ["comun", "productos"])).toBe("productos");
    expect(grupoPrincipal(["hotel", "comun"], ["comun", "reservas", "hotel"])).toBe("comun");
  });
});

describe("textosPara (servidor)", () => {
  it("traduce, llena los marcadores y sin traducción usa el texto base sin su contexto", async () => {
    const t = await textosPara(TIENDA, qu);
    expect(t("Buscar")).toBe("Maskay");
    expect(t("Quedan {n}", { n: 3 })).toBe("Quedan 3");
    expect(textoBase("Salida|tour")).toBe("Salida");
    expect(t("Salida|tour")).toBe("Salida");
  });
});

describe("traductorPara (con el código guardado en el pedido o la reserva)", () => {
  it("sin código, en el base o con uno desconocido, traduce al base sin consultar la BD de textos", async () => {
    for (const codigo of [undefined, "es", "xx"]) expect((await traductorPara(TIENDA, codigo))("Buscar")).toBe("Buscar");
    expect(prisma.textos_claves.findMany).not.toHaveBeenCalled();
  });

  it("con un idioma activo usa el diccionario de la tienda", async () => {
    expect((await traductorPara(TIENDA, "en"))("Buscar")).toBe("Find");
  });
});

describe("textos fijos en la pantalla Traducciones (fuente `textos`)", () => {
  const almacen = FUENTES.textos.almacen;

  it("una fila por grupo del rubro; lo de la plataforma cuenta como traducido", async () => {
    const filas = await almacen.leer(TIENDA);
    expect(filas.map((f) => f.id)).toEqual(["comun", "productos"]);
    const productos = filas.find((f) => f.id === "productos");
    expect(FUENTES.textos.textos(productos)).toEqual({ "Agregar al carrito": "Agregar al carrito", "Quedan {n}": "Quedan {n}" });
    expect(productos.traducciones.en["Agregar al carrito"]).toEqual({ t: "Add to cart", o: "Agregar al carrito", m: false });
  });

  it("guardar a mano escribe en la tienda como manual; lo que no cambió no se toca", async () => {
    await almacen.guardar(TIENDA, "productos", "qu", (actual) => ({ ...actual, "Quedan {n}": { t: "{n} qhipan", o: "Quedan {n}", m: true } }), "dueno@tienda.pe");
    const [ops] = prisma.$transaction.mock.calls[0];
    const creadas = ops.find((o) => o.op === "createMany").args.data;
    expect(creadas).toHaveLength(1);
    expect(creadas[0]).toMatchObject({ tiendaId: TIENDA, idioma: "qu", clave: "Quedan {n}", texto: "{n} qhipan", origen: "manual" });
  });

  it("lo que traduce la IA queda con origen ia", async () => {
    await almacen.guardar(TIENDA, "productos", "qu", (actual) => ({ ...actual, "Agregar al carrito": { t: "Carritoman churay", o: "Agregar al carrito", m: false } }), "traducciones-ia");
    const [ops] = prisma.$transaction.mock.calls[0];
    expect(ops.find((o) => o.op === "createMany").args.data[0].origen).toBe("ia");
  });

  it("borrar la propia la quita de la tienda (vuelve la de la plataforma); sin cambios no escribe", async () => {
    await almacen.guardar(TIENDA, "comun", "en", (actual) => { const n = { ...actual }; delete n.Buscar; return n; }, "dueno@tienda.pe");
    const [ops] = prisma.$transaction.mock.calls[0];
    expect(ops.find((o) => o.op === "deleteMany").args.where).toEqual({ tiendaId: TIENDA, idioma: "en", clave: { in: ["Buscar"] } });

    prisma.$transaction.mockClear();
    await almacen.guardar(TIENDA, "comun", "en", (actual) => actual, "dueno@tienda.pe");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
