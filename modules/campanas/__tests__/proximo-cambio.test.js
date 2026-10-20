import { proximoCambio } from "../calendario.js";
import { efectiva } from "../resolver.js";

const lima = (texto) => new Date(`${texto}:00-05:00`);
const propia = (id, inicio, fin, extra = {}) => efectiva({ id, activa: true, inicio, fin, ...extra });

describe("proximoCambio (R3.9.1)", () => {
  it("es el fin de la campaña en curso", () => {
    const c = propia("a", "2026-11-27", "2026-11-30", { horaFin: "10:00" });
    expect(proximoCambio([c], lima("2026-11-29T23:58"))).toEqual(lima("2026-11-30T10:00"));
  });

  it("es el inicio de la próxima cuando aún no empieza", () => {
    const c = propia("a", "2026-11-27", "2026-11-30", { horaInicio: "08:30" });
    expect(proximoCambio([c], lima("2026-11-20T12:00"))).toEqual(lima("2026-11-27T08:30"));
  });

  it("toma la frontera más cercana entre varias campañas", () => {
    const a = propia("a", "2026-11-27", "2026-11-30");
    const b = propia("b", "2026-11-28", "2026-11-29", { horaFin: "12:00" });
    expect(proximoCambio([a, b], lima("2026-11-28T10:00"))).toEqual(lima("2026-11-29T12:00"));
  });

  it("incluye las campañas del catálogo (regla anual)", () => {
    const bf = efectiva({ id: "bf", activa: true, presetId: "black-friday" });
    expect(proximoCambio([bf], lima("2026-11-01T00:00"))).not.toBeNull();
  });

  it("suma las fronteras del efecto festivo solo si hay efecto", () => {
    const sin = propia("a", "2026-11-27", "2026-11-30");
    const con = propia("a", "2026-11-27", "2026-11-30", { efecto: "confeti", efectoModo: "campana" });
    expect(proximoCambio([sin], lima("2026-11-27T12:00"))).toEqual(lima("2026-12-01T00:00"));
    expect(proximoCambio([con], lima("2026-11-27T12:00"))).toEqual(lima("2026-12-01T00:00"));
  });

  it("null si no queda ningún cambio", () => {
    const c = propia("a", "2026-01-01", "2026-01-05");
    expect(proximoCambio([c], lima("2026-06-01T00:00"))).toBeNull();
    expect(proximoCambio([], lima("2026-06-01T00:00"))).toBeNull();
  });
});
