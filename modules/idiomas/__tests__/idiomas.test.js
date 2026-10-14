import { jest } from "@jest/globals";

// docs/specs/idiomas D1 · diseno.md B1
const filas = [
  { codigo: "es", nombre: "Español", pais: "PE", locale: "es-PE", ia: false, avisoIa: false, activo: true, orden: 0 },
  { codigo: "qu", nombre: "Runasimi", pais: "PE", locale: "es-PE", ia: true, avisoIa: true, activo: true, orden: 1 },
  { codigo: "en", nombre: "English", pais: "US", locale: "en-US", ia: true, avisoIa: false, activo: true, orden: 10 }
];
const idiomas = {
  findMany: jest.fn(async () => filas),
  findUnique: jest.fn(async ({ where }) => filas.find((f) => f.codigo === where.codigo) ?? null),
  create: jest.fn(async ({ data }) => data),
  update: jest.fn(async ({ where, data }) => ({ ...filas.find((f) => f.codigo === where.codigo), ...data }))
};
const TIENDA = "11111111-1111-4111-8111-111111111111";
// Eligió inglés y quechua; solo el inglés está publicado (P5).
const tiendas = { findUnique: jest.fn(async ({ where }) => (where.id === TIENDA ? { idiomas: ["es", "en", "qu"], idiomasPublicados: ["en"] } : null)) };
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: { idiomas, tiendas }, default: { idiomas, tiendas } }));

const { crearIdioma, IDIOMA_BASE } = await import("../idioma.js");
const servicio = await import("../idiomas.service.js");
const { crearIdiomaSchema, actualizarIdiomaSchema } = await import("../idiomas.schema.js");
const { updateTiendaSchema } = await import("../../tenants/tiendas.schema.js");
const { idiomasElegidos, idiomasVisibles, invalidarIdiomasDeTienda, resolverIdioma } = await import("../idiomas-tienda.js");

beforeEach(() => {
  servicio.invalidarIdiomas();
  invalidarIdiomasDeTienda();
  jest.clearAllMocks();
});

describe("crearIdioma", () => {
  it("solo el idioma base es base, y el objeto no se puede modificar", () => {
    const [es, qu] = filas.map(crearIdioma);
    expect(IDIOMA_BASE).toBe("es");
    expect(es.esBase).toBe(true);
    expect(qu.esBase).toBe(false);
    expect(Object.isFrozen(qu)).toBe(true);
    expect(qu).toMatchObject({ codigo: "qu", locale: "es-PE", ia: true, avisoIa: true });
  });
});

describe("idiomas activos", () => {
  it("se leen una vez y se cachean hasta que se edita uno", async () => {
    await servicio.idiomasActivos();
    await servicio.idiomasActivos();
    expect(idiomas.findMany).toHaveBeenCalledTimes(1);
    expect(idiomas.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { activo: true } }));

    await servicio.actualizarIdioma("qu", { nombre: "Runa simi" }, { email: "admin@plataforma.pe" });
    await servicio.idiomasActivos();
    expect(idiomas.findMany).toHaveBeenCalledTimes(2);
  });

  it("idiomaActivo devuelve el idioma o null; idiomaBase, el español", async () => {
    expect((await servicio.idiomaActivo("qu")).nombre).toBe("Runasimi");
    expect(await servicio.idiomaActivo("pt")).toBeNull();
    expect((await servicio.idiomaBase()).codigo).toBe("es");
  });
});

describe("idiomas que elige una tienda", () => {
  it("quedan sin repetidos y en el orden de la plataforma", async () => {
    expect(await servicio.validarIdiomasDeTienda(["en", "es", "qu", "en"])).toEqual(["es", "qu", "en"]);
  });

  it("rechaza un idioma que la plataforma no ofrece", async () => {
    await expect(servicio.validarIdiomasDeTienda(["es", "pt"])).rejects.toMatchObject({ statusCode: 400, message: "Idioma no disponible: pt" });
  });

  it("el schema exige el idioma base y un código válido", () => {
    const idiomasSchema = updateTiendaSchema.innerType().shape.idiomas;
    expect(idiomasSchema.safeParse(["es", "qu", "ay"]).success).toBe(true);
    expect(idiomasSchema.safeParse(["qu"]).success).toBe(false);
    expect(idiomasSchema.safeParse(["es", "EN"]).success).toBe(false);
  });
});

describe("administración de la plataforma", () => {
  it("no deja desactivar el idioma base", async () => {
    await expect(servicio.actualizarIdioma("es", { activo: false })).rejects.toMatchObject({ statusCode: 400 });
    expect(idiomas.update).not.toHaveBeenCalled();
  });

  it("deja desactivar otro idioma y registra quién", async () => {
    const qu = await servicio.actualizarIdioma("qu", { activo: false }, { email: "admin@plataforma.pe" });
    expect(qu.activo).toBe(false);
    expect(idiomas.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { codigo: "qu" }, data: expect.objectContaining({ activo: false, usuarioActualizacion: "admin@plataforma.pe" })
    }));
  });

  it("no crea un código repetido; uno nuevo sale con sus valores por defecto", async () => {
    await expect(servicio.crearIdiomaPlataforma({ codigo: "qu", nombre: "x", pais: "PE", locale: "es-PE" })).rejects.toMatchObject({ statusCode: 409 });

    const datos = crearIdiomaSchema.parse({ codigo: "pt", nombre: "Português", pais: "BR", locale: "pt-BR" });
    expect(datos).toMatchObject({ ia: false, avisoIa: false, activo: true, orden: 0 });
    const pt = await servicio.crearIdiomaPlataforma(datos, { email: "admin@plataforma.pe" });
    expect(pt).toMatchObject({ codigo: "pt", esBase: false });
  });

  it("el código no se puede cambiar al editar", () => {
    expect(actualizarIdiomaSchema.safeParse({ codigo: "qx" }).success).toBe(false);
    expect(actualizarIdiomaSchema.safeParse({}).success).toBe(false);
    expect(actualizarIdiomaSchema.safeParse({ ia: true }).success).toBe(true);
  });
});

// docs/specs/idiomas D2 · diseno.md B2
describe("idioma de una petición a la tienda", () => {
  const resolver = async (req) => {
    const r = { query: {}, body: {}, ...req };
    await new Promise((ok, mal) => resolverIdioma(r, {}, (e) => (e ? mal(e) : ok())));
    return r.idioma;
  };

  it("la tienda muestra el base y los que eligió y están publicados, en el orden de la plataforma", async () => {
    expect((await idiomasVisibles(TIENDA)).map((i) => i.codigo)).toEqual(["es", "en"]);
  });

  it("un idioma elegido sin publicar no se muestra, pero el dueño trabaja con él en Traducciones", async () => {
    expect((await idiomasElegidos(TIENDA)).map((i) => i.codigo)).toEqual(["es", "qu", "en"]);
    expect((await resolver({ tiendaId: TIENDA, query: { lang: "qu" } })).codigo).toBe("es");
  });

  it("toma el ?lang= pedido si la tienda lo ofrece", async () => {
    expect((await resolver({ tiendaId: TIENDA, query: { lang: "en" } })).codigo).toBe("en");
    expect((await resolver({ body: { tiendaId: TIENDA, lang: "en" } })).codigo).toBe("en");
  });

  it("un idioma que la tienda no eligió, desconocido o ausente cae al base sin error", async () => {
    expect((await resolver({ tiendaId: TIENDA, query: { lang: "ay" } })).codigo).toBe("es");
    expect((await resolver({ tiendaId: TIENDA, query: { lang: "xx" } })).codigo).toBe("es");
    expect((await resolver({ tiendaId: TIENDA })).esBase).toBe(true);
  });

  it("sin tienda conocida basta con que la plataforma lo tenga activo", async () => {
    expect((await resolver({ query: { lang: "qu" } })).codigo).toBe("qu");
    expect((await resolver({ query: { lang: "pt" } })).codigo).toBe("es");
  });

  it("los idiomas de la tienda se cachean", async () => {
    await idiomasVisibles(TIENDA);
    await idiomasVisibles(TIENDA);
    expect(tiendas.findUnique).toHaveBeenCalledTimes(1);
  });
});
