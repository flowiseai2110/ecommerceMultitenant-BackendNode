import { jest } from "@jest/globals";

jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: {}, default: {} }));
const { leerTextosPlataforma, planTextosPlataforma } = await import("../plataforma.service.js");
const { leerCatalogo } = await import("../claves.service.js");

// docs/specs/idiomas D7 · tasks.md 1.7a
describe("traducciones de la plataforma (archivos del repo)", () => {
  const archivos = leerTextosPlataforma();
  const catalogo = leerCatalogo();

  it("el inglés cubre todas las claves (tienda y servidor): con P5, una tienda en inglés no queda oculta", () => {
    const sinIngles = catalogo.map((c) => c.clave).filter((k) => !(k in archivos.en));
    expect(sinIngles).toEqual([]);
  });

  it("no hay traducciones de textos que ya no existen (el catálogo y el archivo van juntos)", () => {
    const enCatalogo = new Set(catalogo.map((c) => c.clave));
    expect(Object.keys(archivos.en).filter((k) => !enCatalogo.has(k))).toEqual([]);
  });

  it("los marcadores {x}: ninguna traducción inventa uno ni pierde los del texto base (salvo que la clave declare alternativas)", () => {
    const marcas = (t) => t.match(/\{\w+\}/g) ?? [];
    const malas = Object.entries(archivos.en).filter(([clave, texto]) => {
      const [base, contexto = ""] = clave.split("|");
      const disponibles = marcas(clave);
      const inventa = marcas(texto).some((m) => !disponibles.includes(m));
      const pierde = !marcas(contexto).length && marcas(base).some((m) => !texto.includes(m));
      return inventa || pierde;
    });
    expect(malas).toEqual([]);
  });
});

describe("plan de carga", () => {
  const base = {
    idiomas: new Set(["es", "en"]),
    claves: new Set(["Buscar", "Carrito", "Quedan {n}"])
  };

  it("guarda lo nuevo o cambiado, quita lo que salió del archivo y omite idiomas o claves que no existen", () => {
    const plan = planTextosPlataforma({
      ...base,
      existentes: [
        { idioma: "en", clave: "Buscar", texto: "Search" },
        { idioma: "en", clave: "Carrito", texto: "Basket" },
        { idioma: "en", clave: "Quedan {n}", texto: "{n} left" }
      ],
      deseados: {
        en: { Buscar: "Search", Carrito: "Cart", "Noche": "Night" },
        pt: { Buscar: "Buscar" }
      }
    });
    expect(plan.guardar).toEqual([{ idioma: "en", clave: "Carrito", texto: "Cart" }]);
    expect(plan.borrar).toEqual([{ idioma: "en", clave: "Quedan {n}" }]);
    expect(plan.omitidas).toEqual([
      { idioma: "en", clave: "Noche", motivo: "clave" },
      { idioma: "pt", clave: "Buscar", motivo: "idioma" }
    ]);
  });

  it("si la tabla ya refleja los archivos, no hay nada que escribir", () => {
    const plan = planTextosPlataforma({ ...base, existentes: [{ idioma: "en", clave: "Buscar", texto: "Search" }], deseados: { en: { Buscar: "Search" } } });
    expect(plan.guardar).toEqual([]);
    expect(plan.borrar).toEqual([]);
  });
});
