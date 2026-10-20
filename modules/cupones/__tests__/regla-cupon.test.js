import { evaluarCupon } from "../regla-cupon.js";

// Regla del cupón (docs/specs/precio-en-servidor): la misma para mostrar y para cobrar. En céntimos.
const AHORA = new Date("2026-10-20T15:00:00Z");
const cupon = (extra = {}) => ({
  activo: true, tipo: "porcentaje", valor: "10", minimoCompra: "0",
  usoMaximo: null, usoActual: 0, usoMaximoPorCliente: null,
  fechaInicio: null, fechaFin: null, ...extra
});
const evaluar = (c, subtotal = 10000, usosCliente = null) => evaluarCupon(c, { subtotal, ahora: AHORA, usosCliente });

describe("evaluarCupon", () => {
  it("válido: 10 % de 100 = 10", () => {
    expect(evaluar(cupon())).toEqual({ valido: true, descuento: 1000 });
  });

  it("inexistente o inactivo", () => {
    expect(evaluar(null).clave).toBe("Cupón no válido");
    expect(evaluar(cupon({ activo: false })).clave).toBe("Cupón inactivo");
  });

  it("vencido y futuro", () => {
    expect(evaluar(cupon({ fechaFin: new Date("2026-10-19T00:00:00Z") })).clave).toBe("Cupón expirado");
    expect(evaluar(cupon({ fechaInicio: new Date("2026-10-21T00:00:00Z") })).clave).toBe("Cupón aún no vigente");
  });

  it("agotado", () => {
    expect(evaluar(cupon({ usoMaximo: 5, usoActual: 5 })).clave).toBe("Cupón agotado");
  });

  it("bajo la compra mínima", () => {
    const r = evaluar(cupon({ minimoCompra: "150" }), 14999);
    expect(r).toEqual({ valido: false, clave: "Compra mínima requerida: {minimo}", params: { minimo: "150" } });
    expect(evaluar(cupon({ minimoCompra: "150" }), 15000).valido).toBe(true);
  });

  it("máximo por cliente", () => {
    expect(evaluar(cupon({ usoMaximoPorCliente: 1 }), 10000, 1).valido).toBe(false);
    expect(evaluar(cupon({ usoMaximoPorCliente: 1 }), 10000, 0).valido).toBe(true);
    // Sin cliente conocido no se puede contar: no bloquea.
    expect(evaluar(cupon({ usoMaximoPorCliente: 1 }), 10000, null).valido).toBe(true);
  });

  it("150 % queda limitado al subtotal", () => {
    expect(evaluar(cupon({ valor: "150" }), 8000)).toEqual({ valido: true, descuento: 8000 });
  });

  it("monto fijo mayor al subtotal queda limitado al subtotal", () => {
    expect(evaluar(cupon({ tipo: "monto_fijo", valor: "50" }), 3000)).toEqual({ valido: true, descuento: 3000 });
    expect(evaluar(cupon({ tipo: "monto_fijo", valor: "20" }), 3000)).toEqual({ valido: true, descuento: 2000 });
  });

  it("porcentaje con redondeo al céntimo: 20 % de 19.99 = 4.00", () => {
    expect(evaluar(cupon({ valor: "20" }), 1999).descuento).toBe(400);
  });
});
