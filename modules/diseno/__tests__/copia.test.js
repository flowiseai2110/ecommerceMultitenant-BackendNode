import { copiarPlantilla, TIPOS_CON_AFIRMACIONES } from "../copia.js";
import { buscarPlantilla, PLANTILLAS } from "../plantillas.js";
import { estructuraSchema } from "../secciones.schema.js";
import { FORMATO_ACTUAL } from "../migrar.js";

const seccion = (estructura, tipo) => estructura.home.secciones.find((s) => s.tipo === tipo);

describe("copiarPlantilla", () => {
  it("copia layout, radio, encabezados y todas las secciones en el formato actual (R3.1)", () => {
    const moda = buscarPlantilla("moda");
    const e = copiarPlantilla(moda);
    expect(e).toMatchObject({ formato: FORMATO_ACTUAL, plantillaId: "moda", plantillaVersion: moda.version, radio: "recto", encabezados: "editorial" });
    expect(e.layout).toEqual(moda.layout);
    expect(e.home.secciones.map((s) => s.id)).toEqual(moda.secciones.map((s) => s.id));
  });

  it("los testimonios se copian sin items (R3.2)", () => {
    expect(seccion(copiarPlantilla(buscarPlantilla("belleza")), "testimonios").items).toEqual([]);
  });

  it("la oferta se copia oculta y sin fecha (R3.3)", () => {
    expect(seccion(copiarPlantilla(buscarPlantilla("tecnologia")), "oferta")).toMatchObject({ oculto: true, terminaEn: null });
  });

  it("las secciones con afirmaciones se copian ocultas y como ejemplo (R3.5)", () => {
    const e = copiarPlantilla(buscarPlantilla("tecnologia"));
    expect(seccion(e, "cinta")).toMatchObject({ oculto: true, ejemplo: true, items: expect.arrayContaining(["Garantía de 12 meses"]) });
    expect(seccion(e, "faq")).toMatchObject({ oculto: true, ejemplo: true });
    // Las de datos reales quedan visibles.
    expect(seccion(e, "categorias").oculto).toBeUndefined();
    expect(e.home.secciones.filter((s) => s.tipo === "productos").every((s) => !s.oculto)).toBe(true);
  });

  it("la clásica no oculta nada: ninguna tienda existente cambia de aspecto (R2.4)", () => {
    const e = copiarPlantilla(buscarPlantilla("clasica"));
    expect(e.home.secciones.some((s) => s.oculto || s.ejemplo)).toBe(false);
  });

  it("sin textos propios, el hero queda sin título ni subtítulo (no publica los de ejemplo)", () => {
    const hero = seccion(copiarPlantilla(buscarPlantilla("tecnologia")), "hero");
    expect(hero).toMatchObject({ titulo: null, subtitulo: null, textoBoton: "Ver productos" });
  });

  it("el hero toma los textos de la clave `hero` (R3.4)", () => {
    const hero = seccion(copiarPlantilla(buscarPlantilla("moda"), { hero: { titulo: "Ropa de Ana", subtitulo: "  ", textoBoton: null } }), "hero");
    expect(hero).toMatchObject({ titulo: "Ropa de Ana", subtitulo: null, textoBoton: "Ver la colección", variante: "imagen-completa" });
  });

  it("la estructura anterior gana a la clave `hero`", () => {
    const anterior = copiarPlantilla(buscarPlantilla("clasica"), { hero: { titulo: "Viejo" } });
    anterior.home.secciones[0].titulo = "Nuevo";
    const hero = seccion(copiarPlantilla(buscarPlantilla("hogar"), { estructuraAnterior: anterior, hero: { titulo: "Viejo" } }), "hero");
    expect(hero.titulo).toBe("Nuevo");
  });

  it("no muta la plantilla del catálogo", () => {
    const tec = buscarPlantilla("tecnologia");
    const antes = JSON.stringify(tec);
    copiarPlantilla(tec).home.secciones[0].titulo = "x";
    expect(JSON.stringify(tec)).toBe(antes);
  });

  it.each(PLANTILLAS.map((p) => p.id))("la copia de %s pasa el schema de estructura", (id) => {
    const r = estructuraSchema.safeParse(copiarPlantilla(buscarPlantilla(id)));
    expect(r.success ? null : r.error.issues).toBeNull();
  });

  it("los tipos con afirmaciones son los de la spec", () => {
    expect([...TIPOS_CON_AFIRMACIONES].sort()).toEqual(["beneficios", "cinta", "faq", "imagen-texto"]);
  });
});
