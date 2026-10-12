import { estructuraVigente, resolverTema, temaPorDefecto } from "../resolver.js";
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

// editor-diseno-en-vivo V16: el editor arranca con lo que la tienda muestra hoy.
describe("estructuraVigente y temaPorDefecto", () => {
  it("sin estructura guardada, la copia de la plantilla por defecto del rubro con los textos de la clave hero", () => {
    const e = estructuraVigente({ estructura: null, hero: { titulo: "Mi hotel" }, tipoNegocio: "hotel" });
    expect(e.plantillaId).toBe("hotel-boutique");
    expect(e.home.secciones.find((s) => s.tipo === "hero").titulo).toBe("Mi hotel");
  });

  it("conserva la guardada si es del rubro de la tienda, con las secciones ocultas incluidas", () => {
    const guardada = copiarPlantilla(buscarPlantilla("tecnologia"));
    const e = estructuraVigente({ estructura: guardada, tipoNegocio: "productos" });
    expect(e.plantillaId).toBe("tecnologia");
    expect(e.home.secciones.some((s) => s.oculto)).toBe(true);
  });

  it("una guardada de otro rubro se reemplaza por la del rubro actual", () => {
    const guardada = copiarPlantilla(buscarPlantilla("moda"));
    expect(estructuraVigente({ estructura: guardada, tipoNegocio: "canchas" }).plantillaId).toBe("canchas-complejo");
  });

  it("el tema por defecto es el del rubro o el de siempre", () => {
    expect(temaPorDefecto("canchas")).toEqual({ paleta: "cancha-tinte", tipografia: "deportiva" });
    expect(temaPorDefecto("productos")).toEqual({ paleta: "tienda-contraste", tipografia: "inter" });
  });
});

describe("estructura de una plantilla que todavía no está en el registro (fase 2)", () => {
  it("se conserva: se validó al publicar", () => {
    const guardada = { ...copiarPlantilla(buscarPlantilla("canchas-complejo")), plantillaId: "canchas-simple-1a2b" };
    expect(estructuraVigente({ estructura: guardada, tipoNegocio: "canchas" }).plantillaId).toBe("canchas-simple-1a2b");
  });
});
