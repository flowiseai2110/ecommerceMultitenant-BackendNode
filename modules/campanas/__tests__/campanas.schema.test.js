import {
  campanaTiendaSchema,
  listaCampanasSchema,
  listaWidgetsSchema,
  prefijoWidgets,
  urlsDeWidgetsAjenas,
  vistaPreviaQuerySchema,
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

  // campanas-cuando R2.9: "Mis fechas" sobre un preset (antes se rechazaba).
  it("un preset acepta 'Mis fechas': inicio y fin juntos, con hora y fin a las 00:00", () => {
    expect(campanaTiendaSchema.safeParse(madre({ inicio: "2027-05-01", fin: "2027-05-09" })).success).toBe(true);
    expect(campanaTiendaSchema.safeParse(madre({ inicio: "2027-05-01", fin: "2027-05-09", horaFin: "00:00" })).success).toBe(true);
  });

  it("'Mis fechas' en un preset: inicio y fin juntos, sin días antes/después y hasta 90 días (R2.9.3)", () => {
    expect(mensajes(campanaTiendaSchema.safeParse(madre({ inicio: "2027-05-01" })))).toContain("Indica la fecha de fin");
    expect(mensajes(campanaTiendaSchema.safeParse(madre({ inicio: "2027-05-01", fin: "2027-05-09", anticipacionDias: 3 }))))
      .toContain("Con tus propias fechas no se usan los días antes y después");
    expect(mensajes(campanaTiendaSchema.safeParse(madre({ inicio: "2027-05-09", fin: "2027-05-01" }))))
      .toContain("La fecha de fin no puede ser anterior al inicio");
    expect(mensajes(campanaTiendaSchema.safeParse(madre({ inicio: "2027-01-01", fin: "2027-04-30" }))))
      .toContain("Una campaña puede durar hasta 90 días");
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

describe("horas de inicio y fin (R3)", () => {
  it("acepta HH:mm y rechaza formatos raros", () => {
    expect(campanaTiendaSchema.safeParse(propia({ horaInicio: "10:00", horaFin: "22:30" })).success).toBe(true);
    expect(campanaTiendaSchema.safeParse(propia({ horaInicio: null, horaFin: null })).success).toBe(true);
    expect(campanaTiendaSchema.safeParse(propia({ horaInicio: "24:00" })).success).toBe(false);
    expect(campanaTiendaSchema.safeParse(propia({ horaFin: "9:5" })).success).toBe(false);
  });

  it("CA-3.5: el mismo día, la hora de fin va después de la de inicio", () => {
    const r = campanaTiendaSchema.safeParse(propia({ inicio: "2026-11-20", fin: "2026-11-20", horaInicio: "10:00", horaFin: "10:00" }));
    expect(mensajes(r)).toContain("La fecha y hora de fin deben ser posteriores al inicio");
    expect(campanaTiendaSchema.safeParse(propia({ inicio: "2026-11-20", fin: "2026-11-20", horaInicio: "10:00", horaFin: "10:01" })).success).toBe(true);
  });

  it("CA-3.6: 91 días se rechazan con o sin horas; fin a las 00:00 no cuenta el día siguiente", () => {
    const largo = { inicio: "2026-09-01", fin: "2026-11-30" };
    expect(mensajes(campanaTiendaSchema.safeParse(propia(largo)))).toContain("Una campaña puede durar hasta 90 días");
    expect(mensajes(campanaTiendaSchema.safeParse(propia({ ...largo, horaInicio: "23:00", horaFin: "01:00" })))).toContain("Una campaña puede durar hasta 90 días");
    // 1 sep 00:00 a 30 nov 00:00 toca 90 días.
    expect(campanaTiendaSchema.safeParse(propia({ ...largo, horaFin: "00:00" })).success).toBe(true);
  });

  it("R7.3: en el catálogo no se ofrece 00:00 como fin", () => {
    const r = campanaTiendaSchema.safeParse({ id: "00000000-0000-4000-8000-000000000001", presetId: "madre", activa: true, horaFin: "00:00" });
    expect(r.success).toBe(false);
    expect(campanaTiendaSchema.safeParse({ id: "00000000-0000-4000-8000-000000000001", presetId: "madre", activa: true, horaFin: "14:00" }).success).toBe(true);
  });

  it("catálogo: un solo día con la hora de fin antes de la de inicio queda vacío", () => {
    const r = campanaTiendaSchema.safeParse({ id: "00000000-0000-4000-8000-000000000001", presetId: "madre", activa: true, anticipacionDias: 0, despuesDias: 0, horaInicio: "15:00", horaFin: "14:00" });
    expect(mensajes(r).join(" ")).toContain("quedaría vacía");
  });

  it("la vista previa acepta hora opcional", () => {
    expect(vistaPreviaQuerySchema.safeParse({ fecha: "2026-11-29", hora: "21:00" }).success).toBe(true);
    expect(vistaPreviaQuerySchema.safeParse({ fecha: "2026-11-29" }).success).toBe(true);
    expect(vistaPreviaQuerySchema.safeParse({ fecha: "2026-11-29", hora: "25:00" }).success).toBe(false);
  });
});
