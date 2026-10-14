import { jest } from "@jest/globals";

// docs/specs/idiomas — P5 refinada: el 100 % se exige para publicar, no para seguir publicado.
const TIENDA = "33333333-3333-4333-8333-333333333333";
let tienda;
let avance;
const prisma = {
  tiendas: {
    findUnique: jest.fn(async () => tienda),
    update: jest.fn(async ({ data }) => { tienda = { ...tienda, ...data }; return tienda; })
  },
  idiomas: { findMany: jest.fn(async () => [
    { codigo: "es", nombre: "Español", activo: true, orden: 0 },
    { codigo: "qu", nombre: "Runasimi", activo: true, orden: 1 },
    { codigo: "en", nombre: "English", activo: true, orden: 10 }
  ]) }
};
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma, default: prisma }));
jest.unstable_mockModule("../textos.service.js", () => ({
  avanceTextos: jest.fn(async (_t, idioma) => avance[idioma.codigo])
}));

const { despublicadosAlCambiar, estadoIdiomas, publicarCompletos } = await import("../publicacion.service.js");
const { idiomasVisibles, invalidarIdiomasDeTienda } = await import("../idiomas-tienda.js");
const { invalidarIdiomas } = await import("../idiomas.service.js");

beforeEach(() => {
  tienda = { idiomas: ["es", "qu", "en"], idiomasPublicados: [] };
  avance = { qu: { total: 300, traducidos: 120 }, en: { total: 300, traducidos: 300 } };
  invalidarIdiomas();
  invalidarIdiomasDeTienda();
  jest.clearAllMocks();
});

const visibles = async () => (await idiomasVisibles(TIENDA)).map((i) => i.codigo);

describe("publicar un idioma", () => {
  it("al 100 % se publica y aparece; a medias, no", async () => {
    expect(await publicarCompletos(TIENDA)).toEqual(["en"]);
    expect(tienda.idiomasPublicados).toEqual(["en"]);
    expect(await visibles()).toEqual(["es", "en"]);
  });

  it("si nada llegó al 100 %, no escribe", async () => {
    avance.en = { total: 300, traducidos: 299 };
    expect(await publicarCompletos(TIENDA)).toEqual([]);
    expect(prisma.tiendas.update).not.toHaveBeenCalled();
  });

  it("ya publicado, un texto nuevo sin traducir no lo oculta: el admin ve cuántos faltan", async () => {
    tienda.idiomasPublicados = ["qu"];
    avance.qu = { total: 301, traducidos: 300 };
    expect(await visibles()).toContain("qu");
    const qu = (await estadoIdiomas(TIENDA)).find((e) => e.idioma.codigo === "qu");
    expect(qu).toMatchObject({ publicado: true, total: 301, traducidos: 300, faltan: 1, nuevos: 1 });
  });

  it("sin publicar, el admin ve lo que falta para publicarlo (no son \"nuevos\")", async () => {
    const qu = (await estadoIdiomas(TIENDA)).find((e) => e.idioma.codigo === "qu");
    expect(qu).toMatchObject({ publicado: false, faltan: 180, nuevos: 0 });
  });

  it("quitar un idioma de la tienda lo despublica", async () => {
    tienda.idiomasPublicados = ["qu", "en"];
    expect(await despublicadosAlCambiar(TIENDA, ["es", "en"])).toEqual(["en"]);
  });
});
