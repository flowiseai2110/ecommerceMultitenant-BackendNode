import { aIsoLima, fechaClave, parsearFecha, proximaVentana, ventana, vigente } from "../calendario.js";
import { CAMPANA_PRESETS, buscarPreset, sugeridoPara } from "../presets.js";
import { RUBROS } from "../../tenants/rubros.js";

// Instante a partir de una hora de Lima ("2026-10-31T23:59").
const lima = (texto) => new Date(`${texto}:00-05:00`);
const ymd = ({ anio, mes, dia }) => `${anio}-${mes}-${dia}`;
const idVigente = (campanas, texto) => vigente(campanas, lima(texto))?.campana.id ?? null;

const preset = (id) => buscarPreset(id);

describe("fechaClave (R1.1)", () => {
  // Fechas verificadas contra el calendario: si la regla se corre un día,
  // la tienda se viste de Día de la Madre una semana tarde.
  const casos = [
    ["madre", 2026, "2026-5-10"],
    ["madre", 2027, "2027-5-9"],
    ["padre", 2026, "2026-6-21"],
    ["padre", 2027, "2027-6-20"],
    ["nino", 2026, "2026-4-12"],
    ["nino", 2027, "2027-4-11"],
    ["black-friday", 2026, "2026-11-27"],
    ["black-friday", 2027, "2027-11-26"],
    ["navidad", 2026, "2026-12-25"]
  ];

  it.each(casos)("%s %i → %s", (id, anio, esperada) => {
    expect(ymd(fechaClave(preset(id).regla, anio))).toBe(esperada);
  });
});

describe("ventana (R1.2)", () => {
  it("va de las 00:00 de Lima del inicio a las 00:00 del día siguiente al último", () => {
    const v = ventana(preset("madre"), 2027);
    expect(aIsoLima(v.inicio)).toBe("2027-04-19T00:00:00-05:00");
    expect(aIsoLima(v.fechaClave)).toBe("2027-05-09T00:00:00-05:00");
    expect(aIsoLima(v.fin)).toBe("2027-05-10T00:00:00-05:00");
  });

  it("campaña propia: fechas explícitas, ambas inclusive", () => {
    const v = ventana({ id: "aniversario", inicio: "2026-11-10", fin: "2026-11-15" });
    expect(aIsoLima(v.inicio)).toBe("2026-11-10T00:00:00-05:00");
    expect(aIsoLima(v.fin)).toBe("2026-11-16T00:00:00-05:00");
  });

  it("campaña propia con una fecha imposible no tiene ventana", () => {
    expect(parsearFecha("2027-02-30")).toBeNull();
    expect(ventana({ id: "x", inicio: "2027-02-01", fin: "2027-02-30" })).toBeNull();
  });
});

describe("vigente", () => {
  it("activa todo el día clave en Lima y se apaga a las 00:00 del siguiente", () => {
    expect(idVigente(CAMPANA_PRESETS, "2026-10-31T23:59")).toBe("halloween");
    expect(idVigente(CAMPANA_PRESETS, "2026-11-01T00:00")).toBeNull();
  });

  it("usa la hora de Lima, no la UTC (R3.2)", () => {
    // 1 nov 03:00 UTC = 31 oct 22:00 en Lima: todavía es Halloween.
    expect(vigente(CAMPANA_PRESETS, new Date("2026-11-01T03:00:00Z"))?.campana.id).toBe("halloween");
  });

  it("empieza a las 00:00 de Lima del primer día", () => {
    expect(idVigente(CAMPANA_PRESETS, "2026-10-14T23:59")).toBeNull();
    expect(idVigente(CAMPANA_PRESETS, "2026-10-15T00:00")).toBe("halloween");
  });

  it("a mayor prioridad gana la campaña (R1.3)", () => {
    expect(idVigente(CAMPANA_PRESETS, "2026-11-25T12:00")).toBe("black-friday");
    // Black Friday sigue hasta el Cyber Monday (30 nov) y vuelve Navidad.
    expect(idVigente(CAMPANA_PRESETS, "2026-11-30T23:00")).toBe("black-friday");
    expect(idVigente(CAMPANA_PRESETS, "2026-12-01T00:00")).toBe("navidad");
    expect(idVigente(CAMPANA_PRESETS, "2027-02-05T12:00")).toBe("amistad");
    expect(idVigente(CAMPANA_PRESETS, "2027-02-15T12:00")).toBe("verano");
  });

  it("a igual prioridad gana la ventana más corta (la más específica)", () => {
    const aniversario = { id: "aniversario", inicio: "2026-12-10", fin: "2026-12-12" };
    expect(idVigente([...CAMPANA_PRESETS, aniversario], "2026-12-11T12:00")).toBe("aniversario");
    expect(idVigente([...CAMPANA_PRESETS, aniversario], "2026-12-13T12:00")).toBe("navidad");
  });

  it("encuentra ventanas que cruzan el cambio de año", () => {
    const anioNuevo = { id: "anio-nuevo", regla: { tipo: "fija", mes: 1, dia: 1 }, anticipacionDias: 5 };
    const v = vigente([anioNuevo], lima("2026-12-29T12:00"));
    expect(aIsoLima(v.fechaClave)).toBe("2027-01-01T00:00:00-05:00");

    const propia = { id: "liquidacion", inicio: "2026-12-28", fin: "2027-01-03" };
    expect(idVigente([propia], "2027-01-02T12:00")).toBe("liquidacion");
  });

  it("sin campañas activas devuelve null", () => {
    expect(vigente([], lima("2026-12-24T12:00"))).toBeNull();
  });
});

describe("proximaVentana", () => {
  it("salta al año siguiente si la de este año ya pasó", () => {
    expect(aIsoLima(proximaVentana(preset("madre"), lima("2026-09-30T12:00")).fechaClave)).toBe("2027-05-09T00:00:00-05:00");
    expect(aIsoLima(proximaVentana(preset("navidad"), lima("2026-09-30T12:00")).fechaClave)).toBe("2026-12-25T00:00:00-05:00");
  });

  it("durante la campaña devuelve la ventana en curso", () => {
    expect(aIsoLima(proximaVentana(preset("navidad"), lima("2026-12-20T12:00")).fechaClave)).toBe("2026-12-25T00:00:00-05:00");
  });

  it("una campaña propia que ya terminó no tiene próxima", () => {
    expect(proximaVentana({ id: "x", inicio: "2026-01-10", fin: "2026-01-12" }, lima("2026-09-30T12:00"))).toBeNull();
  });
});

describe("CAMPANA_PRESETS", () => {
  it("ids únicos y presets inmutables", () => {
    const ids = CAMPANA_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.isFrozen(preset("madre").hero)).toBe(true);
  });

  it.each(CAMPANA_PRESETS.map((p) => [p.id, p]))("%s: un widget por ancla y sellos de máx. 12 caracteres (R4.3, R4.4)", (_id, p) => {
    const anclas = p.widgets.map((w) => w.ancla);
    expect(new Set(anclas).size).toBe(anclas.length);
    expect(p.widgets.length).toBeLessThanOrEqual(5);
    for (const w of p.widgets) {
      if (w.contenido.tipo === "sello") expect(w.contenido.texto.length).toBeLessThanOrEqual(12);
    }
  });
});

describe("sugeridoPara (R2.5)", () => {
  it("filtra por rubro y trata la tienda sin rubro como general", () => {
    expect(sugeridoPara(preset("halloween"), "moda")).toBe(true);
    expect(sugeridoPara(preset("halloween"), "tecnologia")).toBe(false);
    expect(sugeridoPara(preset("halloween"), null)).toBe(true);
    expect(sugeridoPara(preset("navidad"), "tecnologia")).toBe(true);
  });

  it("los presets solo nombran rubros que existen", () => {
    for (const p of CAMPANA_PRESETS) {
      if (p.rubros !== "*") expect(RUBROS).toEqual(expect.arrayContaining([...p.rubros]));
    }
  });
});
