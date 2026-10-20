import { cotizarCompra } from "../cotizacion-compra.js";

// Cotización pura de una compra (docs/specs/precio-en-servidor): líneas ya cargadas de la BD.
const AHORA = new Date("2026-10-20T15:00:00Z");
const producto = (id, precioBase, precioOferta = null) => ({ id, nombre: `Producto ${id}`, precioBase, precioOferta });
const cupon = (extra = {}) => ({
  activo: true, tipo: "porcentaje", valor: "10", minimoCompra: "0", usoMaximo: null, usoActual: 0,
  usoMaximoPorCliente: null, fechaInicio: null, fechaFin: null, ...extra
});
const metodo = { id: "m1", nombre: "Delivery", tipo: "delivery", fueraDeZona: "coordinar", pagoEnDestino: false,
  zonas: [{ nombre: "Lima", costo: "10.00", ubigeos: ["15"], orden: 0 }] };

describe("cotizarCompra", () => {
  it("líneas con precio vigente, regular y origen; snapshot del nombre", () => {
    const r = cotizarCompra([
      { producto: producto("a", "100", "80"), variante: null, cantidad: 2 },
      { producto: producto("b", "19.90"), variante: { id: "v1", nombre: "Rojo", precio: null }, cantidad: 3 }
    ], { ahora: AHORA });
    expect(r.lineas).toEqual([
      { productoId: "a", varianteId: null, nombre: "Producto a", varianteNombre: null, cantidad: 2,
        precioUnitario: 80, precioRegular: 100, precioOrigen: "oferta", total: 160 },
      { productoId: "b", varianteId: "v1", nombre: "Producto b", varianteNombre: "Rojo", cantidad: 3,
        precioUnitario: 19.9, precioRegular: 19.9, precioOrigen: "regular", total: 59.7 }
    ]);
    expect(r).toMatchObject({ subtotal: 219.7, descuentoCupon: 0, costoEnvio: 0, total: 219.7, envio: null });
  });

  it("el cupón se suma a la oferta manual (D2): porcentaje sobre el subtotal ya con oferta", () => {
    const r = cotizarCompra([{ producto: producto("a", "100", "80"), variante: null, cantidad: 1 }], { cupon: cupon(), ahora: AHORA });
    expect(r).toMatchObject({ subtotal: 80, descuentoCupon: 8, total: 72 });
  });

  it("cupón bajo el mínimo: error con la clave del catálogo", () => {
    expect(() => cotizarCompra([{ producto: producto("a", "50"), variante: null, cantidad: 1 }],
      { cupon: cupon({ minimoCompra: "100" }), ahora: AHORA })).toThrow("Compra mínima requerida: 100");
  });

  it("el total nunca es negativo", () => {
    const r = cotizarCompra([{ producto: producto("a", "30"), variante: null, cantidad: 1 }],
      { cupon: cupon({ tipo: "monto_fijo", valor: "500" }), ahora: AHORA });
    expect(r).toMatchObject({ subtotal: 30, descuentoCupon: 30, total: 0 });
  });

  it("envío con costo de la zona", () => {
    const r = cotizarCompra([{ producto: producto("a", "50"), variante: null, cantidad: 1 }],
      { envio: { metodo, ubigeo: "150101", envioGratisMinimo: null }, ahora: AHORA });
    expect(r).toMatchObject({ costoEnvio: 10, total: 60 });
    expect(r.envio).toMatchObject({ nombre: "Delivery", modo: "fijo", disponible: true });
  });

  it("envío gratis con el subtotal del servidor, ya descontado el cupón", () => {
    const lineas = [{ producto: producto("a", "100"), variante: null, cantidad: 1 }];
    const envio = { metodo, ubigeo: "150101", envioGratisMinimo: 100 };
    expect(cotizarCompra(lineas, { envio, ahora: AHORA })).toMatchObject({ costoEnvio: 0, total: 100 });
    // Con el 10 % el subtotal neto es 90: ya no llega al mínimo del envío gratis.
    expect(cotizarCompra(lineas, { envio, cupon: cupon(), ahora: AHORA })).toMatchObject({ descuentoCupon: 10, costoEnvio: 10, total: 100 });
  });

  it("cupón que no aplica: lanza al crear; al cotizar se omite y se cuenta en cuponRechazado", () => {
    const lineas = [{ producto: producto("a", "50"), variante: null, cantidad: 1 }];
    const minimo = cupon({ minimoCompra: "100" });
    expect(() => cotizarCompra(lineas, { cupon: minimo, ahora: AHORA })).toThrow("Compra mínima requerida: 100");
    const r = cotizarCompra(lineas, { cupon: minimo, ahora: AHORA, cuponInvalido: "omitir" });
    expect(r).toMatchObject({ descuentoCupon: 0, total: 50, cuponRechazado: { clave: "Compra mínima requerida: {minimo}" } });
    expect(cotizarCompra(lineas, { cupon: cupon(), ahora: AHORA, cuponInvalido: "omitir" })).not.toHaveProperty("cuponRechazado");
  });
});
