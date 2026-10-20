import { jest } from "@jest/globals";
import { cache } from "../cache.js";

// Cache-Control de las respuestas con un instante de cambio (campanas-cuando R3.9.1, CA-3.13).
describe("cache(segundos, { hasta })", () => {
  afterEach(() => jest.useRealTimers());

  const responder = (mw, body) => {
    const cabeceras = {};
    const res = {
      statusCode: 200,
      set: (k, v) => { cabeceras[k] = v; },
      json: jest.fn((b) => b)
    };
    mw({ method: "GET" }, res, () => {});
    res.json(body);
    return cabeceras["Cache-Control"];
  };
  const mw = cache(300, { hasta: (b) => b?.data?.[0]?.proximoCambio });
  const en = (segundos) => new Date(Date.now() + segundos * 1000).toISOString();

  it("sin cambio cercano deja 300 s con swr", () => {
    expect(responder(mw, { data: [{ proximoCambio: en(3600) }] })).toBe("public, max-age=300, stale-while-revalidate=150");
    expect(responder(mw, { data: [{ proximoCambio: null }] })).toBe("public, max-age=300, stale-while-revalidate=150");
  });

  it("a 2 minutos del cambio: max-age <= 120 y sin swr", () => {
    const valor = responder(mw, { data: [{ proximoCambio: en(120) }] });
    expect(valor).toMatch(/^public, max-age=(119|120)$/);
    expect(valor).not.toContain("stale-while-revalidate");
  });

  it("entre 300 y 450 s: max-age 300 pero sin swr", () => {
    expect(responder(mw, { data: [{ proximoCambio: en(400) }] })).toBe("public, max-age=300");
  });

  it("un cambio ya pasado da max-age 0", () => {
    expect(responder(mw, { data: [{ proximoCambio: en(-5) }] })).toBe("public, max-age=0");
  });
});
