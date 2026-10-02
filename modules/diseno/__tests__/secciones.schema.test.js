import { estructuraSchema, temaSchema, seccionesSchema, MAX_SECCIONES } from "../secciones.schema.js";
import { copiarPlantilla } from "../copia.js";
import { buscarPlantilla } from "../plantillas.js";
import { PRESETS_SECCION } from "../presets.js";

const estructura = (secciones) => {
  const e = copiarPlantilla(buscarPlantilla("clasica"));
  if (secciones) e.home.secciones = secciones;
  return e;
};
const productos = (id) => ({ id, tipo: "productos", fuente: "destacados", variante: "carrusel", fondo: "pagina", titulo: "Productos" });
const hero = { id: "hero", tipo: "hero", variante: "compacto" };

/** Mensajes de error por ruta ("home.secciones.1.tipo" → [...]). */
function errores(schema, valor) {
  const r = schema.safeParse(valor);
  if (r.success) return {};
  return Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
}

describe("estructuraSchema (R4.3)", () => {
  it("acepta la clásica y completa los defaults del detalle de producto", () => {
    const e = estructura();
    delete e.layout.producto;
    const r = estructuraSchema.parse(e);
    expect(r.layout.producto).toEqual({
      galeria: "lado", envio: { mostrar: true, texto: null }, devoluciones: { mostrar: true, texto: null },
      relacionados: true, resenas: true, beneficios: []
    });
  });

  it("rechaza dos heroes y un hero que no va primero", () => {
    expect(errores(estructuraSchema, estructura([hero, { ...hero, id: "hero-2" }]))).toHaveProperty(["home.secciones.1.tipo"]);
    expect(errores(estructuraSchema, estructura([productos("p1"), hero]))["home.secciones.1.tipo"]).toMatch(/primera/);
  });

  it(`rechaza más de ${MAX_SECCIONES} secciones`, () => {
    const muchas = Array.from({ length: MAX_SECCIONES + 1 }, (_, i) => productos(`p${i}`));
    expect(errores(estructuraSchema, estructura(muchas))).toHaveProperty(["home.secciones"]);
  });

  it("rechaza más de 4 secciones de productos", () => {
    const cinco = ["a", "b", "c", "d", "e"].map(productos);
    expect(errores(estructuraSchema, estructura(cinco))["home.secciones.4.tipo"]).toMatch(/Máximo 4/);
  });

  it("rechaza ids repetidos o con formato inválido", () => {
    expect(errores(estructuraSchema, estructura([productos("a"), productos("a")]))).toHaveProperty(["home.secciones.1.id"]);
    expect(errores(estructuraSchema, estructura([productos("Con Espacios")]))).toHaveProperty(["home.secciones.0.id"]);
  });

  it("una oferta visible necesita fecha; oculta, no", () => {
    const oferta = { ...PRESETS_SECCION.oferta, id: "oferta" };
    expect(errores(estructuraSchema, estructura([{ ...oferta, oculto: false }]))).toHaveProperty(["home.secciones.0.terminaEn"]);
    expect(errores(estructuraSchema, estructura([oferta]))).toEqual({});
    expect(errores(estructuraSchema, estructura([{ ...oferta, oculto: false, terminaEn: "2026-12-24T23:59:00-05:00" }]))).toEqual({});
  });

  it("rechaza variantes inexistentes y textos largos, con la ruta de la sección", () => {
    expect(errores(estructuraSchema, estructura([{ ...productos("p"), variante: "lista" }]))).toHaveProperty(["home.secciones.0.variante"]);
    expect(errores(estructuraSchema, estructura([{ ...productos("p"), titulo: "x".repeat(81) }]))).toHaveProperty(["home.secciones.0.titulo"]);
  });

  it("rechaza un tipo de sección desconocido", () => {
    expect(errores(estructuraSchema, estructura([{ id: "video", tipo: "video" }]))).toHaveProperty(["home.secciones.0.tipo"]);
  });

  it("rechaza una plantilla de origen inexistente y un formato futuro", () => {
    expect(errores(estructuraSchema, { ...estructura(), plantillaId: "joyeria" })).toHaveProperty(["plantillaId"]);
    expect(errores(estructuraSchema, { ...estructura(), formato: 99 })).toHaveProperty(["formato"]);
  });

  it("una estructura sin `formato` se toma como formato 1", () => {
    const { formato, ...sinFormato } = estructura();
    expect(estructuraSchema.parse(sinFormato).formato).toBe(1);
  });

  it("todos los presets de sección pasan el schema", () => {
    const secciones = Object.entries(PRESETS_SECCION)
      .filter(([tipo]) => tipo !== "hero")
      .map(([tipo, p]) => ({ ...p, id: tipo }));
    expect(errores(seccionesSchema, [{ ...PRESETS_SECCION.hero, id: "hero" }, ...secciones])).toEqual({});
  });
});

describe("temaSchema (R2.1)", () => {
  it("acepta ids del catálogo y rechaza los demás", () => {
    expect(temaSchema.safeParse({ paleta: "emerald-clara", tipografia: "moderna" }).success).toBe(true);
    expect(errores(temaSchema, { paleta: "fucsia", tipografia: "comic-sans" })).toEqual({
      paleta: "Paleta inexistente",
      tipografia: "Tipografía inexistente"
    });
  });
});
