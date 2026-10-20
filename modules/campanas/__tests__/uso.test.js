import { campanaTiendaSchema } from "../campanas.schema.js";
import { calendarioAnual, disenoPublico, resolverCampana } from "../resolver.js";
import { errorDeUso } from "../uso.js";

const lima = (texto) => new Date(`${texto}:00-05:00`);
const id = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const viernes = (extra = {}) => ({ id: id(1), presetId: "black-friday", activa: true, ...extra });
const propia = (extra = {}) => ({ id: id(2), presetId: null, activa: true, nombre: "Aniversario", inicio: "2026-11-20", fin: "2026-12-03", ...extra });
const mensajes = (r) => r.error?.issues.map((i) => i.message) ?? [];

describe("ventana de uso en el resolver (R1.3, R1.4)", () => {
  it("CA-1.9: Black Friday con 90 días después llega al 28 feb 2027; en 2027, al 27 feb 2028", () => {
    const c = viernes({ uso: { hastaDiasDespues: 90 } });
    expect(resolverCampana([c], [], lima("2026-11-25T10:00"), null, true).uso).toEqual({ desde: null, hasta: "2027-02-28" });
    expect(resolverCampana([c], [], lima("2027-11-25T10:00"), null, true).uso.hasta).toBe("2028-02-27");
  });

  it("el desde del catálogo cuenta desde el primer día de la campaña", () => {
    const c = viernes({ uso: { hastaDiasDespues: 0, desdeDiasDespuesInicio: 10 } });
    const uso = resolverCampana([c], [], lima("2026-11-25T10:00"), null, true).uso;
    expect(uso.desde).toBe("2026-11-30");
  });

  it("una propia entrega sus fechas tal cual", () => {
    const c = propia({ uso: { desde: "2026-12-01", hasta: "2027-03-31" } });
    expect(resolverCampana([c], [], lima("2026-11-25T10:00"), null, true).uso).toEqual({ desde: "2026-12-01", hasta: "2027-03-31" });
  });

  it("sin la capacidad o sin uso, la clave no viaja", () => {
    const c = propia({ uso: { hasta: "2027-03-31" } });
    expect(resolverCampana([c], [], lima("2026-11-25T10:00"), null, false)).not.toHaveProperty("uso");
    expect(resolverCampana([propia()], [], lima("2026-11-25T10:00"), null, true)).not.toHaveProperty("uso");
  });

  it("disenoPublico lo da según el rubro", () => {
    const diseno = { campanas: [propia({ uso: { hasta: "2027-03-31" } })] };
    expect(disenoPublico(diseno, lima("2026-11-25T10:00"), "hotel").campana.uso.hasta).toBe("2027-03-31");
    expect(disenoPublico(diseno, lima("2026-11-25T10:00"), "productos").campana).not.toHaveProperty("uso");
  });

  it("el calendario del dueño trae el uso resuelto del año", () => {
    const filas = calendarioAnual([viernes({ uso: { hastaDiasDespues: 90 } })], null, 2026, null, true);
    expect(filas.find((f) => f.presetId === "black-friday").uso).toEqual({ desde: null, hasta: "2027-02-28" });
    const sin = calendarioAnual([viernes({ uso: { hastaDiasDespues: 90 } })], null, 2026, null, false);
    expect(sin.find((f) => f.presetId === "black-friday")).not.toHaveProperty("uso");
  });
});

describe("validación de uso (R1.3, R1.4, R1.10)", () => {
  it("CA-1.10: uso más allá de un año después del fin se rechaza", () => {
    expect(campanaTiendaSchema.safeParse(propia({ uso: { hasta: "2027-12-03" } })).success).toBe(true);
    expect(mensajes(campanaTiendaSchema.safeParse(propia({ uso: { hasta: "2027-12-04" } })))).toContain(
      "El uso no puede pasar de un año después de que termina la campaña"
    );
  });

  it("la propia exige 'hasta' y no admite días; el catálogo exige días y no admite fechas", () => {
    expect(mensajes(campanaTiendaSchema.safeParse(propia({ uso: { desde: "2026-12-01" } })))).toContain("Indica hasta cuándo se usa");
    expect(campanaTiendaSchema.safeParse(propia({ uso: { hasta: "2027-01-01", hastaDiasDespues: 3 } })).success).toBe(false);
    expect(campanaTiendaSchema.safeParse(viernes({ uso: { hasta: "2027-01-01" } })).success).toBe(false);
    expect(campanaTiendaSchema.safeParse(viernes({ uso: { hastaDiasDespues: 90, desdeDiasDespuesInicio: 5 } })).success).toBe(true);
    expect(campanaTiendaSchema.safeParse(viernes({ uso: { hastaDiasDespues: 400 } })).success).toBe(false);
  });

  it("el desde no puede ser posterior al hasta", () => {
    expect(campanaTiendaSchema.safeParse(propia({ uso: { desde: "2027-02-01", hasta: "2027-01-01" } })).success).toBe(false);
  });

  it("CA-1.1: una tienda sin reservas no usa fechas de uso", () => {
    const con = [propia({ uso: { hasta: "2027-03-31" } })];
    expect(errorDeUso(con, "productos")).toBe("Esta tienda no usa fechas de uso");
    expect(errorDeUso(con, "hotel")).toBeNull();
    expect(errorDeUso([propia()], "productos")).toBeNull();
  });
});
