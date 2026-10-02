import { resolverTema } from "../resolver.js";
import { copiarPlantilla } from "../copia.js";
import { buscarPlantilla } from "../plantillas.js";
import { FORMATO_ACTUAL, migrarEstructura } from "../migrar.js";
import { disenoPublico } from "../../campanas/resolver.js";

const ahora = new Date("2026-10-01T12:00:00-05:00");
const ids = (tema) => tema.estructura.home.secciones.map((s) => s.id);

describe("resolverTema (R6)", () => {
  it("tienda sin nada guardado: la clásica, con la paleta y la tipografía de hoy (R2.4, R2.5)", () => {
    const tema = resolverTema({}, ahora);
    expect(tema.estructura.plantillaId).toBe("clasica");
    expect(ids(tema)).toEqual(buscarPlantilla("clasica").secciones.map((s) => s.id));
    expect(tema.paleta).toMatchObject({ id: "tienda-contraste", primario: null, neutro: "gray" });
    expect(tema.tipografia).toMatchObject({ id: "inter", titulos: "inter", cuerpo: "inter" });
  });

  it("sin estructura, el hero de la clásica toma la clave `hero`", () => {
    const tema = resolverTema({ hero: { titulo: "Bodega Rosita" } }, ahora);
    expect(tema.estructura.home.secciones[0]).toMatchObject({ tipo: "hero", titulo: "Bodega Rosita" });
  });

  it("los ids del tema se resuelven a sus valores", () => {
    const tema = resolverTema({ tema: { paleta: "emerald-clara", tipografia: "moderna" } }, ahora);
    expect(tema.paleta).toMatchObject({ primario: "#059669", neutro: "zinc", fondos: { topBar: "claro", pagina: "blanco" } });
    expect(tema.tipografia).toMatchObject({ titulos: "poppins", cuerpo: "inter" });
  });

  it("un id que ya no existe en el catálogo cae al de por defecto", () => {
    expect(resolverTema({ tema: { paleta: "retirada", tipografia: "retirada" } }, ahora)).toMatchObject({
      paleta: { id: "tienda-contraste" }, tipografia: { id: "inter" }
    });
  });

  it("no publica las secciones ocultas (las de ejemplo sin revisar)", () => {
    const estructura = copiarPlantilla(buscarPlantilla("tecnologia"));
    expect(ids(resolverTema({ estructura }, ahora))).not.toEqual(expect.arrayContaining(["cinta", "faq", "oferta"]));
  });

  it("quita la oferta vencida y deja la vigente (R6.2)", () => {
    const estructura = copiarPlantilla(buscarPlantilla("tecnologia"));
    const oferta = estructura.home.secciones.find((s) => s.tipo === "oferta");
    oferta.oculto = false;

    oferta.terminaEn = "2026-10-01T11:59:00-05:00";
    expect(ids(resolverTema({ estructura }, ahora))).not.toContain("oferta");
    oferta.terminaEn = "2026-10-01T12:01:00-05:00";
    expect(ids(resolverTema({ estructura }, ahora))).toContain("oferta");
  });

  it("una estructura sin `producto` recibe los defaults del detalle", () => {
    const estructura = copiarPlantilla(buscarPlantilla("moda"));
    delete estructura.layout.producto;
    expect(resolverTema({ estructura }, ahora).estructura.layout.producto).toMatchObject({ galeria: "lado", relacionados: true });
  });

  it("una estructura de un formato desconocido cae a la clásica en vez de romper la tienda", () => {
    const estructura = { ...copiarPlantilla(buscarPlantilla("moda")), formato: FORMATO_ACTUAL + 1 };
    expect(resolverTema({ estructura }, ahora).estructura.plantillaId).toBe("clasica");
  });
});

describe("migrarEstructura (R1.4)", () => {
  it("el formato actual queda igual", () => {
    const e = copiarPlantilla(buscarPlantilla("moda"));
    expect(migrarEstructura(e)).toEqual(e);
  });

  it("sin formato es el 1; uno mayor al actual o no entero → null", () => {
    const { formato, ...sinFormato } = copiarPlantilla(buscarPlantilla("moda"));
    expect(migrarEstructura(sinFormato).formato).toBe(1);
    expect(migrarEstructura({ ...sinFormato, formato: FORMATO_ACTUAL + 1 })).toBeNull();
    expect(migrarEstructura({ ...sinFormato, formato: "1" })).toBeNull();
  });
});

describe("disenoPublico + tema", () => {
  it("publica el tema resuelto y nunca las claves crudas ni la estructura anterior", () => {
    const estructura = copiarPlantilla(buscarPlantilla("moda"));
    const publico = disenoPublico({ tema: { paleta: "rose-tinte", tipografia: "editorial" }, estructura, estructura_anterior: { estructura: null } }, ahora);
    expect(publico).not.toHaveProperty("estructura");
    expect(publico).not.toHaveProperty("estructura_anterior");
    expect(publico.tema).toMatchObject({ estructura: { plantillaId: "moda" }, paleta: { id: "rose-tinte" }, tipografia: { id: "editorial" } });
  });
});
