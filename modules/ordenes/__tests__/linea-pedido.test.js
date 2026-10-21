import { lineaDePedido } from "../linea-pedido.js";

// Línea del pedido para el dueño y el seguimiento (docs/specs/campanas-descuento R8.3, CA-8.2).
const linea = (extra) => ({ cantidad: 2, precioUnitario: "80.00", precioRegular: "100.00", precioOrigen: "campana", campanaNombre: "Black Friday", ...extra });

describe("lineaDePedido", () => {
  it("CA-8.2: promoción, oferta del producto y sin descuento", () => {
    expect(lineaDePedido(linea())).toMatchObject({ descuentoPromocion: 40, origenDescuento: "campana", campanaNombre: "Black Friday" });
    expect(lineaDePedido(linea({ precioOrigen: "oferta", campanaNombre: null }))).toMatchObject({ descuentoPromocion: 40, origenDescuento: "oferta" });
    expect(lineaDePedido(linea({ precioUnitario: "100.00", precioOrigen: "regular", campanaNombre: null })))
      .toMatchObject({ descuentoPromocion: 0, origenDescuento: "ninguno" });
  });

  it("pedido anterior a precio-en-servidor: sin descuento ni origen", () => {
    expect(lineaDePedido(linea({ precioRegular: null, precioOrigen: null }))).toMatchObject({ descuentoPromocion: null, origenDescuento: null });
  });
});
