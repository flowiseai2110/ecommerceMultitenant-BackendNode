import { calendarioAnual, disenoPublico, efectiva, mezclarWidgets, resolverCampana } from "../resolver.js";
import { buscarPreset } from "../presets.js";
import { calendarioQuerySchema, vistaPreviaQuerySchema } from "../campanas.schema.js";

const lima = (texto) => new Date(`${texto}:00-05:00`);
const id = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const sello = (ancla, texto) => ({ contenido: { tipo: "sello", texto, forma: "circulo" }, ancla, tamano: "chico", animacion: "ninguna", enMovil: false });

const madre = (extra = {}) => ({ id: id(1), presetId: "madre", activa: true, ...extra });
const navidad = (extra = {}) => ({ id: id(2), presetId: "navidad", activa: true, ...extra });
const aniversario = (extra = {}) => ({ id: id(3), presetId: null, activa: true, nombre: "Aniversario", inicio: "2026-12-10", fin: "2026-12-12", ...extra });

describe("efectiva", () => {
  it("sin personalizar, toma todo del preset", () => {
    const e = efectiva(madre());
    const p = buscarPreset("madre");
    expect(e).toMatchObject({ nombre: p.nombre, regla: p.regla, anticipacionDias: 20, paleta: p.paleta, topBar: p.topBar, oferta: p.oferta });
    expect(e.hero).toEqual(p.hero);
  });

  it("lo personalizado gana campo por campo (también dentro del hero)", () => {
    const e = efectiva(madre({ anticipacionDias: 7, topBar: "Pide hasta el jueves", hero: { titulo: "Mamá primero" } }));
    expect(e.anticipacionDias).toBe(7);
    expect(e.topBar).toBe("Pide hasta el jueves");
    expect(e.hero).toEqual({ ...buscarPreset("madre").hero, titulo: "Mamá primero" });
  });

  it("oferta: false quita la cuenta regresiva; widgets: [] quita los widgets", () => {
    const e = efectiva(madre({ oferta: false, widgets: [] }));
    expect(e.oferta).toBeNull();
    expect(e.widgets).toEqual([]);
  });

  it("campaña propia sin paleta conserva los colores de la tienda", () => {
    expect(efectiva(aniversario())).toMatchObject({ presetId: null, nombre: "Aniversario", paleta: null, inicio: "2026-12-10" });
  });

  it("un preset retirado del catálogo se ignora", () => {
    expect(efectiva({ id: id(9), presetId: "dia-del-gato", activa: true })).toBeNull();
  });
});

describe("mezclarWidgets (R4.6)", () => {
  it("el de la campaña reemplaza al permanente de su ancla; el resto sigue", () => {
    const r = mezclarWidgets([sello("junto-logo", "Nuevo"), sello("hero-arriba-derecha", "Envío gratis")], [sello("hero-arriba-derecha", "-30%")]);
    expect(r.map((w) => w.contenido.texto)).toEqual(["-30%", "Nuevo"]);
  });
});

describe("resolverCampana (R3)", () => {
  it("devuelve la campaña vigente con fechas ISO de Lima", () => {
    const c = resolverCampana([madre()], [], lima("2027-05-01T10:00"));
    expect(c).toMatchObject({
      id: id(1),
      presetId: "madre",
      nombre: "Día de la Madre",
      inicio: "2027-04-19T00:00:00-05:00",
      fechaClave: "2027-05-09T00:00:00-05:00",
      fin: "2027-05-10T00:00:00-05:00"
    });
    expect(c.widgets.map((w) => w.ancla)).toEqual(["hero-arriba-derecha", "hero-abajo-derecha", "flotante-izquierda"]);
  });

  it("solo campañas activadas (opt-in, R2.1)", () => {
    expect(resolverCampana([madre({ activa: false })], [], lima("2027-05-01T10:00"))).toBeNull();
    // Halloween no está activada: aunque sea su fecha, no se aplica.
    expect(resolverCampana([madre()], [], lima("2026-10-31T12:00"))).toBeNull();
  });

  it("la anticipación personalizada mueve el inicio", () => {
    expect(resolverCampana([madre({ anticipacionDias: 5 })], [], lima("2027-05-01T10:00"))).toBeNull();
    expect(resolverCampana([madre({ anticipacionDias: 5 })], [], lima("2027-05-04T00:00"))?.presetId).toBe("madre");
  });

  it("una campaña propia más corta le gana a Navidad", () => {
    expect(resolverCampana([navidad(), aniversario()], [], lima("2026-12-11T12:00"))?.nombre).toBe("Aniversario");
    expect(resolverCampana([navidad(), aniversario()], [], lima("2026-12-13T12:00"))?.presetId).toBe("navidad");
  });

  it("mezcla los widgets permanentes con los de la campaña", () => {
    const c = resolverCampana([navidad({ widgets: [sello("hero-arriba-derecha", "Feliz")] })], [sello("junto-logo", "Nuevo")], lima("2026-12-20T12:00"));
    expect(c.widgets.map((w) => w.contenido.texto)).toEqual(["Feliz", "Nuevo"]);
  });

  it("sin campañas guardadas devuelve null", () => {
    expect(resolverCampana(undefined, undefined, lima("2026-12-20T12:00"))).toBeNull();
  });
});

describe("disenoPublico", () => {
  it("quita la lista de campañas y agrega la vigente (R3.1)", () => {
    const anuncio = { activo: true, texto: "Hola" };
    const r = disenoPublico({ anuncio, widgets: [], campanas: [madre(), navidad()] }, lima("2026-12-20T12:00"));
    expect(r).not.toHaveProperty("campanas");
    expect(r.anuncio).toEqual(anuncio);
    expect(r.campana.presetId).toBe("navidad");
  });

  it("sin campaña vigente, campana es null", () => {
    expect(disenoPublico({}, lima("2026-08-15T12:00")).campana).toBeNull();
  });
});

describe("calendarioAnual (R2.5)", () => {
  it("lista los presets del año ordenados, con estado y sugerencia por rubro", () => {
    const cal = calendarioAnual([madre({ anticipacionDias: 10 }), navidad({ activa: false })], "tecnologia", 2027);
    expect(cal[0]).toMatchObject({ presetId: "verano", inicio: "2027-01-02T00:00:00-05:00", activa: false, personalizada: false });

    const m = cal.find((c) => c.presetId === "madre");
    expect(m).toMatchObject({ campanaId: id(1), activa: true, personalizada: true, sugerida: true, inicio: "2027-04-29T00:00:00-05:00" });

    expect(cal.find((c) => c.presetId === "navidad")).toMatchObject({ activa: false, personalizada: true });
    expect(cal.find((c) => c.presetId === "halloween").sugerida).toBe(false);
  });

  it("incluye las campañas propias que tocan ese año", () => {
    const liquidacion = aniversario({ id: id(4), nombre: "Liquidación", inicio: "2026-12-28", fin: "2027-01-03" });
    expect(calendarioAnual([liquidacion], null, 2026).some((c) => c.nombre === "Liquidación")).toBe(true);
    expect(calendarioAnual([liquidacion], null, 2027).some((c) => c.nombre === "Liquidación")).toBe(true);
    expect(calendarioAnual([liquidacion], null, 2028).some((c) => c.nombre === "Liquidación")).toBe(false);
  });
});

describe("query de los endpoints admin", () => {
  it("calendario: año opcional, por defecto el actual", () => {
    expect(calendarioQuerySchema.parse({ anio: "2027" })).toEqual({ anio: 2027 });
    expect(calendarioQuerySchema.parse({}).anio).toBeGreaterThanOrEqual(2026);
    expect(calendarioQuerySchema.safeParse({ anio: "1999" }).success).toBe(false);
  });

  it("vista previa: fecha obligatoria y real", () => {
    expect(vistaPreviaQuerySchema.safeParse({ fecha: "2027-05-01" }).success).toBe(true);
    expect(vistaPreviaQuerySchema.safeParse({ fecha: "2027-02-30" }).success).toBe(false);
    expect(vistaPreviaQuerySchema.safeParse({}).success).toBe(false);
  });
});
