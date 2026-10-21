import { jest } from "@jest/globals";

jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: {} }));
const { conCampana } = await import("../cupon-campana.service.js");

// Cupones del Admin (docs/specs/campanas-descuento A8, T4.8): el cupón de una
// campaña dice de cuál es; los de la tienda, null. La BD se simula.
const TIENDA = "11111111-1111-4111-8111-111111111111";

const db = (promociones, campanas) => ({
  campana_promociones: { findMany: async ({ where }) => promociones.filter((p) => where.id.in.includes(p.id) && where.tiendaId === TIENDA) },
  tienda_configuraciones: { findFirst: async () => ({ valor: campanas }) }
});

describe("conCampana", () => {
  it("nombra la campaña del cupón de campaña y deja null en los de la tienda", async () => {
    const base = db([{ id: "p-1", campanaId: "c-1" }], [{ id: "c-1", presetId: null, activa: true, nombre: "Aniversario", inicio: "2026-11-20", fin: "2026-11-30" }]);
    const filas = await conCampana(base, TIENDA, [
      { id: "cup-1", codigo: "ANIV10", campanaPromocionId: "p-1" },
      { id: "cup-2", codigo: "BIENVENIDO", campanaPromocionId: null }
    ]);
    expect(filas[0].campana).toEqual({ id: "c-1", presetId: null, nombre: "Aniversario" });
    expect(filas[1].campana).toBeNull();
  });

  it("sin cupones de campaña no consulta las promociones", async () => {
    const sinConsultas = { campana_promociones: { findMany: async () => { throw new Error("no debía consultar"); } } };
    expect(await conCampana(sinConsultas, TIENDA, [{ id: "cup-2", campanaPromocionId: null }])).toEqual([{ id: "cup-2", campanaPromocionId: null, campana: null }]);
  });

  it("una campaña que ya no existe en el JSON deja el cupón sin campaña", async () => {
    const base = db([{ id: "p-1", campanaId: "c-borrada" }], []);
    const [fila] = await conCampana(base, TIENDA, [{ id: "cup-1", campanaPromocionId: "p-1" }]);
    expect(fila.campana).toBeNull();
  });
});
