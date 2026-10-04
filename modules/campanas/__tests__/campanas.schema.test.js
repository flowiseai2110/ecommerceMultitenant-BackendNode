import {
  campanaTiendaSchema,
  listaCampanasSchema,
  listaWidgetsSchema,
  prefijoWidgets,
  urlsDeWidgetsAjenas,
  widgetSchema
} from "../campanas.schema.js";
import { updateDisenoSchema } from "../../../validators/tienda-diseno.validator.js";

const TIENDA = "11111111-1111-4111-8111-111111111111";
const OTRA_TIENDA = "22222222-2222-4222-8222-222222222222";
const BASE = "https://img.example.com";
const PREFIJO = prefijoWidgets(BASE, TIENDA);

const sello = (ancla, texto = "Nuevo") => ({ contenido: { tipo: "sello", texto, forma: "circulo" }, ancla });
const imagen = (url, ancla = "hero-arriba-derecha") => ({ contenido: { tipo: "imagen", url }, ancla });
const id = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const madre = (extra = {}) => ({ id: id(1), presetId: "madre", activa: true, ...extra });
const propia = (extra = {}) => ({ id: id(2), presetId: null, activa: true, nombre: "Aniversario", inicio: "2026-11-10", fin: "2026-11-15", ...extra });

const mensajes = (resultado) => resultado.error?.issues.map((i) => i.message) ?? [];

describe("widgetSchema (R4.1, R4.4)", () => {
  it("completa tamaño, animación y móvil con valores por defecto", () => {
    expect(widgetSchema.parse(sello("junto-logo"))).toEqual({
      ...sello("junto-logo"),
      tamano: "mediano",
      animacion: "ninguna",
      enMovil: false
    });
  });

  it("rechaza figuras, anclas y tamaños fuera del catálogo", () => {
    expect(widgetSchema.safeParse({ contenido: { tipo: "figura", figura: "unicornio" }, ancla: "junto-logo" }).success).toBe(false);
    expect(widgetSchema.safeParse({ ...sello("junto-logo"), ancla: "footer" }).success).toBe(false);
    expect(widgetSchema.safeParse({ ...sello("junto-logo"), tamano: "gigante" }).success).toBe(false);
  });

  it("sello de máximo 12 caracteres y no vacío", () => {
    expect(widgetSchema.safeParse(sello("junto-logo", "Black Friday")).success).toBe(true);
    expect(mensajes(widgetSchema.safeParse(sello("junto-logo", "Envío gratis hoy")))).toContain("El sello admite hasta 12 caracteres");
    expect(widgetSchema.safeParse(sello("junto-logo", "   ")).success).toBe(false);
  });

  it("la imagen debe ser https", () => {
    expect(widgetSchema.safeParse(imagen("http://abc.supabase.co/x.png")).success).toBe(false);
    expect(widgetSchema.safeParse(imagen("javascript:alert(1)")).success).toBe(false);
  });
});

describe("listaWidgetsSchema (R4.3)", () => {
  it("dos widgets en la misma ancla → error en el segundo", () => {
    const r = listaWidgetsSchema.safeParse([sello("junto-logo"), sello("hero-arriba-derecha"), sello("junto-logo")]);
    expect(r.success).toBe(false);
    expect(r.error.issues[0].path).toEqual([2, "ancla"]);
  });

  it("máximo 5 widgets", () => {
    const seis = ["hero-arriba-derecha", "hero-abajo-derecha", "hero-arriba-izquierda", "flotante-izquierda", "junto-logo", "junto-logo"].map((a) => sello(a));
    expect(listaWidgetsSchema.safeParse(seis.slice(0, 5)).success).toBe(true);
    expect(mensajes(listaWidgetsSchema.safeParse(seis))).toContain("Máximo 5 widgets");
  });
});

describe("campanaTiendaSchema (R2)", () => {
  it("activar un preset solo requiere id, presetId y activa", () => {
    expect(campanaTiendaSchema.safeParse(madre()).success).toBe(true);
  });

  it("acepta personalizaciones y oferta: false para quitar la cuenta regresiva", () => {
    const r = campanaTiendaSchema.safeParse(
      madre({ anticipacionDias: 10, topBar: "Pide hasta el jueves", oferta: false, widgets: [], cinta: ["Día de la Madre"] })
    );
    expect(r.success).toBe(true);
  });

  it("rechaza un preset que no existe", () => {
    expect(mensajes(campanaTiendaSchema.safeParse(madre({ presetId: "dia-del-gato" })))).toContain('No existe la campaña "dia-del-gato"');
  });

  it("un preset no lleva fechas fijas", () => {
    expect(campanaTiendaSchema.safeParse(madre({ inicio: "2027-05-01", fin: "2027-05-09" })).success).toBe(false);
  });

  it("campaña propia: válida con nombre y fechas", () => {
    expect(campanaTiendaSchema.safeParse(propia()).success).toBe(true);
  });

  it("campaña propia sin fechas o sin nombre → error", () => {
    const r = campanaTiendaSchema.safeParse(propia({ inicio: null, fin: undefined, nombre: null }));
    expect(mensajes(r)).toEqual(expect.arrayContaining(["Indica la fecha de inicio", "Indica la fecha de fin", "Ponle un nombre a la campaña"]));
  });

  it("campaña propia: fin antes del inicio, más de 90 días o fecha imposible → error", () => {
    expect(mensajes(campanaTiendaSchema.safeParse(propia({ fin: "2026-11-01" })))).toContain("La fecha de fin no puede ser anterior al inicio");
    expect(mensajes(campanaTiendaSchema.safeParse(propia({ fin: "2027-03-01" })))).toContain("Una campaña puede durar hasta 90 días");
    expect(campanaTiendaSchema.safeParse(propia({ fin: "2026-11-31" })).success).toBe(false);
  });

  it("campaña propia no usa anticipación", () => {
    expect(campanaTiendaSchema.safeParse(propia({ anticipacionDias: 5 })).success).toBe(false);
  });

  it("paleta con color en #rrggbb y fondos del catálogo", () => {
    const fondos = { topBar: "primario", header: "tinte", pagina: "tinte", footer: "oscuro" };
    expect(campanaTiendaSchema.safeParse(madre({ paleta: { primario: "#db2777", neutro: "stone", fondos } })).success).toBe(true);
    expect(campanaTiendaSchema.safeParse(madre({ paleta: { primario: "red", neutro: "stone", fondos } })).success).toBe(false);
  });
});

describe("listaCampanasSchema", () => {
  it("un preset se activa una sola vez", () => {
    const r = listaCampanasSchema.safeParse([madre(), madre({ id: id(3) })]);
    expect(mensajes(r)).toContain('"madre" ya está en la lista');
  });

  it("ids únicos", () => {
    expect(mensajes(listaCampanasSchema.safeParse([madre(), propia({ id: id(1) })]))).toContain("Id de campaña repetido");
  });
});

describe("urlsDeWidgetsAjenas (R4.5)", () => {
  it("acepta imágenes de la carpeta widgets/ de la propia tienda", () => {
    const data = { widgets: [imagen(`${PREFIJO}sol.webp`)], campanas: [madre({ widgets: [imagen(`${PREFIJO}mama.webp`)] })] };
    expect(urlsDeWidgetsAjenas(data, PREFIJO)).toEqual([]);
  });

  it("detecta URLs de otra tienda, de otra carpeta, externas o con ..", () => {
    const ajenas = [
      `${prefijoWidgets(BASE, OTRA_TIENDA)}sol.webp`,
      `${BASE}/${TIENDA}/logos/logo.png`,
      "https://tracker.example.com/pixel.png",
      `${PREFIJO}../logos/logo.png`
    ];
    const data = { campanas: [madre({ widgets: ajenas.map((u, i) => imagen(u, ["hero-arriba-derecha", "hero-abajo-derecha", "junto-logo", "flotante-izquierda"][i])) })] };
    expect(urlsDeWidgetsAjenas(data, PREFIJO)).toEqual(ajenas);
  });

  it("el prefijo tolera la barra final en la URL base", () => {
    expect(prefijoWidgets(`${BASE}/`, TIENDA)).toBe(PREFIJO);
  });
});

describe("updateDisenoSchema", () => {
  it("acepta solo campañas o solo widgets", () => {
    expect(updateDisenoSchema.safeParse({ campanas: [madre()] }).success).toBe(true);
    expect(updateDisenoSchema.safeParse({ widgets: [sello("junto-logo")] }).success).toBe(true);
  });

  it("un body vacío sigue siendo error", () => {
    expect(updateDisenoSchema.safeParse({}).success).toBe(false);
  });
});
