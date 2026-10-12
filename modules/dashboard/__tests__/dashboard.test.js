import { jest } from "@jest/globals";

// Dashboard por rubro (docs/specs/dashboard-por-rubro). La BD se simula con un
// Prisma que responde vacío a todo, salvo las consultas que se siembran abajo:
// así cada rubro arma su dashboard completo sin base de datos.
const PrismaStub = {
  PrismaClientKnownRequestError: class extends Error {}, PrismaClientValidationError: class extends Error {},
  sql: (strings, ...valores) => ({ sql: strings.join("?"), valores }), empty: { sql: "", valores: [] }
};

let tienda = { id: "", tipoNegocio: "productos" };
/** Respuestas de $queryRaw por fragmento de SQL; lo demás devuelve []. */
let crudas = [];
const consultasCrudas = [];

const VACIO = { findMany: [], findFirst: null, findUnique: null, count: 0, groupBy: [], aggregate: { _sum: {}, _count: { _all: 0 } } };
const modelo = (nombre) => new Proxy({}, {
  get: (_, metodo) => async () => {
    if (nombre === "tiendas" && metodo === "findUnique") return tienda;
    return structuredClone(VACIO[metodo] ?? null);
  }
});
const sqlDe = (strings, valores) => strings.reduce((s, parte, i) => s + parte + (valores[i]?.sql ?? (i < valores.length ? "?" : "")), "");
const prisma = new Proxy({
  $queryRaw: async (strings, ...valores) => {
    const sql = sqlDe(strings, valores);
    consultasCrudas.push(sql);
    return structuredClone(crudas.find(([fragmento]) => sql.includes(fragmento))?.[1] ?? []);
  },
  $executeRaw: async () => 0
}, { get: (base, k) => (k in base ? base[k] : modelo(k)) });

jest.unstable_mockModule("../../../generated/prisma/client.ts", () => ({ Prisma: PrismaStub, PrismaClient: class {} }));
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma, Prisma: PrismaStub, default: {} }));

const { armarDashboard } = await import("../dashboard.service.js");
const { sinMontos, verMontos } = await import("../montos.js");
const { ultimos30, sumarPorPeriodo, etiquetaDia } = await import("../periodo.js");
const { TIPOS_WIDGET } = await import("../widgets.js");
const { ESTRATEGIAS, invalidarRubrosCache } = await import("../../negocio/registro.js");
const { pasajerosDe } = await import("../../reservas/tours/dashboard.js");

const AHORA = new Date("2026-10-12T21:20:00Z"); // lunes 16:20 en Lima
let n = 0;
const nuevaTienda = (tipoNegocio) => {
  invalidarRubrosCache();
  tienda = { id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, tipoNegocio };
  return tienda.id;
};

/** Con montos sembrados: cobros, ventas y más vendidos. */
const CON_MONTOS = [
  ["FROM pagos", [{ dia: "2026-10-12", monto: "350.50" }, { dia: "2026-09-01", monto: "100" }]],
  ["FROM pedidos\n    WHERE", [{ dia: "2026-10-11", monto: "189.90", n: 2 }]],
  ["FROM pedido_detalles", [{ nombre: "Polo oversize", unidades: 3, monto: "120" }]]
];

beforeEach(() => { crudas = []; consultasCrudas.length = 0; });

describe("periodo", () => {
  it("son los 30 días de Lima con hoy incluido, y los 30 anteriores", () => {
    const p = ultimos30(AHORA);
    expect(p.fechas).toHaveLength(30);
    expect(p.fechas[29]).toBe("2026-10-12");
    expect(p.fechas[0]).toBe("2026-09-13");
    expect(p.desde.toISOString()).toBe("2026-09-13T05:00:00.000Z");
    expect(p.anteriorDesde.toISOString()).toBe("2026-08-14T05:00:00.000Z");
  });

  it("separa lo del periodo de lo anterior", () => {
    const p = ultimos30(AHORA);
    expect(sumarPorPeriodo(p, new Map([["2026-10-12", 10], ["2026-09-13", 5], ["2026-09-12", 7]]))).toEqual({ valor: 15, anterior: 7 });
    expect(etiquetaDia("2026-10-12")).toBe("12 oct");
  });
});

describe("montos por rol", () => {
  it("solo editor, admin y owner ven montos", () => {
    expect(["viewer", "editor", "admin", "owner", "recepcionista"].map(verMontos)).toEqual([false, true, true, true, false]);
  });

  it("quita widgets, indicadores y claves con montos, a cualquier profundidad", () => {
    const widgets = [
      { tipo: "barras", id: "ventas", formato: "PEN", serie: [] },
      { tipo: "barras", id: "pasajeros", formato: "num", serie: [] },
      { tipo: "kpis", id: "a", items: [{ clave: "ventas", formato: "PEN", valor: 10 }, { clave: "pedidos", formato: "num", valor: 2 }] },
      { tipo: "kpis", id: "b", items: [{ clave: "ingresos", formato: "PEN", valor: 10 }] },
      { tipo: "ranking", id: "r", items: [{ nombre: "Polo", valor: 3, monto: 120 }] }
    ];
    expect(sinMontos(widgets)).toEqual([
      { tipo: "barras", id: "pasajeros", formato: "num", serie: [] },
      { tipo: "kpis", id: "a", items: [{ clave: "pedidos", formato: "num", valor: 2 }] },
      { tipo: "ranking", id: "r", items: [{ nombre: "Polo", valor: 3 }] }
    ]);
  });
});

describe.each(Object.keys(ESTRATEGIAS))("dashboard de %s", (tipoNegocio) => {
  it("solo tipos conocidos, ids únicos y la franja de atención primero (DR5)", async () => {
    const { widgets, montos, periodo } = await armarDashboard(nuevaTienda(tipoNegocio), { rol: "owner", ahora: AHORA });
    expect(montos).toBe(true);
    expect(periodo.dias).toBe(30);
    expect(widgets[0].tipo).toBe("atencion");
    for (const w of widgets) expect(TIPOS_WIDGET).toContain(w.tipo);
    const ids = widgets.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("el viewer no recibe ningún monto (DR4)", async () => {
    crudas = CON_MONTOS;
    const { widgets, montos } = await armarDashboard(nuevaTienda(tipoNegocio), { rol: "viewer", ahora: AHORA });
    expect(montos).toBe(false);
    const json = JSON.stringify(widgets);
    expect(json).not.toContain('"PEN"');
    expect(json).not.toContain('"monto"');
    expect(json).not.toContain("S/");
  });
});

describe("ingresos (DR6)", () => {
  it("productos: ventas de compras, sin reservas", async () => {
    crudas = CON_MONTOS;
    const { widgets } = await armarDashboard(nuevaTienda("productos"), { rol: "owner", ahora: AHORA });
    expect(consultasCrudas.some((sql) => sql.includes("tipo = 'compra'") && sql.includes("estado <> 'cancelado'"))).toBe(true);
    const ventas = widgets.find((w) => w.id === "periodo").items.find((k) => k.clave === "ventas");
    expect(ventas).toMatchObject({ valor: 189.9, formato: "PEN", anterior: 0 });
  });

  it("reservas: solo pagos verificados; el hotel suma el mostrador", async () => {
    crudas = CON_MONTOS;
    const { widgets } = await armarDashboard(nuevaTienda("hotel"), { rol: "owner", ahora: AHORA });
    const cobros = consultasCrudas.find((sql) => sql.includes("FROM pagos"));
    expect(cobros).toContain("estado = 'pagado'");
    expect(cobros).toContain("hotel_cobros");
    const ingresos = widgets.find((w) => w.id === "periodo").items.find((k) => k.clave === "ingresos");
    expect(ingresos).toMatchObject({ valor: 350.5, anterior: 100 });

    consultasCrudas.length = 0;
    await armarDashboard(nuevaTienda("tours"), { rol: "owner", ahora: AHORA });
    expect(consultasCrudas.find((sql) => sql.includes("FROM pagos"))).not.toContain("hotel_cobros");
  });
});

describe("tours", () => {
  it("los pasajeros salen del snapshot por tipo; sin snapshot, de adultos y niños", () => {
    expect(pasajerosDe({ pasajeros: [{ cantidad: 2 }, { cantidad: 1 }] })).toBe(3);
    expect(pasajerosDe({ pasajeros: null, adultos: 2, ninos: 1 })).toBe(3);
    expect(pasajerosDe({})).toBe(1);
  });
});
