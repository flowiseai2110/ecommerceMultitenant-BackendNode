import { jest } from "@jest/globals";

jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: {}, default: {} }));
const { diccionarioDeOpciones, palabrasDeOpciones, opcionesTraducidas } = await import("../opciones.js");
const { FUENTES } = await import("../fuentes.js");
const { DATOS } = await import("../../negocio/datos.js");

// docs/specs/idiomas (decisión 2026-10-16): Talla, Color y sus valores se traducen una vez por tienda.
describe("opciones de las variantes", () => {
  it("junta las palabras distintas de todos los productos (nombres y valores), en orden y sin repetir; los códigos de color no (son de la paleta)", () => {
    const metadatas = [
      { opciones: [{ nombre: "Talla", valores: ["S", "M"] }, { nombre: "Color", tipo: "color", valores: ["Rojo"] }] },
      { opciones: [{ nombre: "Talla", valores: ["M", "L", " "] }] },
      null,
      { opciones: "dato roto" },
      { otra: 1 }
    ];
    expect(palabrasDeOpciones(metadatas)).toEqual(["Talla", "S", "M", "Color", "L"]);
  });

  it("el diccionario de un idioma solo trae lo traducido (manual o vigente); lo demás se ve como se escribió", () => {
    const traducciones = {
      qu: {
        Talla: { t: "Sayay", o: "Talla", m: true },
        Rojo: { t: "Puka", o: "Rojo", m: false },
        Azul: { t: "", o: "Azul", m: false }
      },
      en: { Talla: { t: "Size", o: "Talla" } }
    };
    expect(diccionarioDeOpciones(traducciones, "qu")).toEqual({ Talla: "Sayay", Rojo: "Puka" });
    expect(diccionarioDeOpciones(traducciones, "en")).toEqual({ Talla: "Size" });
    expect(diccionarioDeOpciones(traducciones, "ay")).toEqual({});
    expect(diccionarioDeOpciones(null, "qu")).toEqual({});
  });

  it("en el idioma base no hay nada que traducir (ni se lee la BD)", async () => {
    expect(await opcionesTraducidas("t1", { codigo: "es", esBase: true })).toEqual({});
  });

  it("la fuente: una fila por tienda, cada palabra es un campo, en Tu contenido como \"Opciones de productos\"", () => {
    const fila = { id: "t1", palabras: ["Talla", "M"], traducciones: { en: { Talla: { t: "Size", o: "Talla" } } } };
    expect(FUENTES.opciones.textos(fila)).toEqual({ Talla: "Talla", M: "M" });
    expect(FUENTES.opciones.aplicar(fila, fila.traducciones.en).textos).toEqual({ Talla: "Size", M: "M" });
    const [lugar] = FUENTES.opciones.lugares(fila, "Talla", DATOS.productos);
    expect(lugar.lugar).toMatchObject({ id: "contenido/opciones", zona: "contenido", nombre: "Opciones de productos" });
    expect(FUENTES.opciones.nombreCampo("Talla")).toBe("Opción o valor");
  });
});
