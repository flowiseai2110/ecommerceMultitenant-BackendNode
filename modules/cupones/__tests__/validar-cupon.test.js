import { jest } from "@jest/globals";

// validarCupon con el cupón de una campaña (docs/specs/campanas-descuento R4.8, CA-4.7):
// fuera de la ventana de su promoción el servidor lo rechaza. La BD se simula.
const TIENDA = "11111111-1111-4111-8111-111111111111";
let cupon;
let promociones;

jest.unstable_mockModule("../../../config/prisma.js", () => ({
  prisma: {
    cupones: { findFirst: async () => cupon },
    clientes: { findFirst: async () => null },
    pedidos: { count: async () => 0 }
  }
}));
jest.unstable_mockModule("../../precios/contexto.service.js", () => ({
  contextoDePrecios: async () => ({ promociones, proximoCambio: null })
}));
jest.unstable_mockModule("../../campanas/cupon-campana.service.js", () => ({
  nombreCampanaDelCupon: async () => "Cyber Wow",
  conCampana: async (_db, _tiendaId, cupones) => cupones
}));

const { validarCupon } = await import("../cupones.service.js");

const fila = (extra = {}) => ({
  id: "cup-1", codigo: "CYBER10", activo: true, tipo: "porcentaje", valor: "10", minimoCompra: "0",
  usoMaximo: null, usoActual: 0, usoMaximoPorCliente: null, fechaInicio: null, fechaFin: null, campanaPromocionId: "p-cyber", ...extra
});

describe("validarCupon con el cupón de una campaña", () => {
  it("dentro de la ventana de su promoción, vale", async () => {
    cupon = fila();
    promociones = [{ promocionId: "p-cyber" }];
    expect(await validarCupon(TIENDA, "cyber10", 100)).toMatchObject({ valido: true, descuento: 10 });
  });

  it("CA-4.7: el 1 dic (su promoción ya no aplica) se rechaza con el nombre de la campaña", async () => {
    cupon = fila();
    promociones = [];
    expect(await validarCupon(TIENDA, "CYBER10", 100)).toEqual({
      valido: false, mensaje: "Este cupón es de la campaña Cyber Wow y ya no está vigente"
    });
  });

  it("un cupón de la tienda no mira las promociones", async () => {
    cupon = fila({ codigo: "BIENVENIDA", campanaPromocionId: null });
    promociones = [];
    expect(await validarCupon(TIENDA, "BIENVENIDA", 100)).toMatchObject({ valido: true });
  });
});
