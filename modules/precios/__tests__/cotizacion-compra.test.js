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
        precioUnitario: 80, precioRegular: 100, precioOrigen: "oferta", campana: null, total: 160 },
      { productoId: "b", varianteId: "v1", nombre: "Producto b", varianteNombre: "Rojo", cantidad: 3,
        precioUnitario: 19.9, precioRegular: 19.9, precioOrigen: "regular", campana: null, total: 59.7 }
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

describe("cotizarCompra con precio asegurado (campanas-descuento C6, R8.4)", () => {
  const promocion = { campanaId: "c-bf", nombre: "Black Friday", porcentaje: 20, orden: 0, hasta: AHORA,
    permitirCupones: false, permitirEnvioGratis: true, alcance: { tipo: "tienda" } };
  const asegurado = (unitario, extra = {}) => ({ productoId: "a", varianteId: null, unitario, regular: 10000, origen: "campana",
    campana: { id: "c-bf", nombre: "Black Friday", porcentaje: 20, permitirCupones: false, permitirEnvioGratis: true }, ...extra });
  const linea = [{ producto: producto("a", "100"), variante: null, cantidad: 2 }];

  it("la línea con promoción trae su campaña y `precios` guarda lo que se firma (en céntimos, sin `hasta`)", () => {
    const r = cotizarCompra(linea, { ahora: AHORA, contexto: { promociones: [promocion] } });
    expect(r.lineas[0]).toMatchObject({ precioUnitario: 80, precioOrigen: "campana", campana: { id: "c-bf", nombre: "Black Friday", porcentaje: 20 } });
    expect(r.precios).toEqual([asegurado(8000)]);
  });

  it("la promoción terminó: cobra lo asegurado (R8.6)", () => {
    const r = cotizarCompra(linea, { ahora: AHORA, congelado: [asegurado(8000)] });
    expect(r.lineas[0]).toMatchObject({ precioUnitario: 80, precioRegular: 100, precioOrigen: "campana", total: 160 });
    expect(r.total).toBe(160);
  });

  it("el precio de ahora es menor: cobra el de ahora", () => {
    const r = cotizarCompra(linea, { ahora: AHORA, contexto: { promociones: [{ ...promocion, porcentaje: 30 }] }, congelado: [asegurado(8000)] });
    expect(r.lineas[0]).toMatchObject({ precioUnitario: 70, campana: { porcentaje: 30 } });
  });

  it("otra variante del mismo producto no toma el precio asegurado", () => {
    const r = cotizarCompra([{ producto: producto("a", "100"), variante: { id: "v2", nombre: "Azul", precio: null }, cantidad: 1 }],
      { ahora: AHORA, congelado: [asegurado(8000)] });
    expect(r.lineas[0]).toMatchObject({ precioUnitario: 100, precioOrigen: "regular", campana: null });
  });
});

describe("cotizarCompra: cupones y envío gratis con promoción (campanas-descuento C7, R7)", () => {
  // Zapatillas S/ 200 con Black Friday −20 % (S/ 160) y una Camisa sin descuento.
  const promo = (extra = {}) => ({
    campanaId: "c-bf", promocionId: "p-bf", nombre: "Black Friday", porcentaje: 20, orden: 0, hasta: AHORA,
    permitirCupones: false, permitirEnvioGratis: false,
    alcance: { tipo: "productos", productoIds: new Set(["zap"]), categoriaIds: new Set() }, ...extra
  });
  const zapatillas = (precio = "200") => ({ producto: { id: "zap", nombre: "Zapatillas", precioBase: precio, precioOferta: null }, variante: null, cantidad: 1 });
  const camisa = (precio = "50") => ({ producto: { id: "cam", nombre: "Camisa", precioBase: precio, precioOferta: null }, variante: null, cantidad: 1 });
  const contexto = (...promociones) => ({ promociones: promociones.length ? promociones : [promo()] });
  const envio = (envioGratisMinimo = 150) => ({ metodo, ubigeo: "150101", envioGratisMinimo });

  it("CA-7.2: permisos apagados, carrito mixto: el 10 % sale solo sobre la camisa (S/ 5) y lo dice", () => {
    const r = cotizarCompra([zapatillas(), camisa()], { cupon: cupon(), ahora: AHORA, contexto: contexto() });
    expect(r).toMatchObject({ subtotal: 210, descuentoCupon: 5, total: 205 });
    expect(r.avisos.cuponSoloSinPromocion).toEqual({ productos: ["Camisa"] });
  });

  it("el mínimo del cupón se mide solo sobre las líneas sin promoción", () => {
    const opciones = { cupon: cupon({ minimoCompra: "100" }), ahora: AHORA, contexto: contexto() };
    expect(() => cotizarCompra([zapatillas(), camisa()], opciones)).toThrow("Compra mínima requerida: 100");
  });

  it("CA-7.3: solo productos en promoción: se rechaza con el mensaje de la promoción", () => {
    const opciones = { cupon: cupon(), ahora: AHORA, contexto: contexto() };
    expect(() => cotizarCompra([zapatillas()], opciones)).toThrow("Los productos en promoción no admiten cupones.");
    const r = cotizarCompra([zapatillas()], { ...opciones, cuponInvalido: "omitir" });
    expect(r).toMatchObject({ descuentoCupon: 0, total: 160, cuponRechazado: { clave: "Los productos en promoción no admiten cupones." } });
    expect(r.avisos.cuponSoloSinPromocion).toBeNull();
  });

  it("CA-7.4: envío gratis desde S/ 150 con permiso apagado: S/ 160 en promoción paga envío; la camisa sola de S/ 200 no", () => {
    const conPromo = cotizarCompra([zapatillas()], { envio: envio(), ahora: AHORA, contexto: contexto() });
    expect(conPromo).toMatchObject({ subtotal: 160, costoEnvio: 10, total: 170 });
    expect(conPromo.avisos.envioGratisNoAplica).toBe(true);
    const sinPromo = cotizarCompra([camisa("200")], { envio: envio(), ahora: AHORA, contexto: contexto() });
    expect(sinPromo).toMatchObject({ costoEnvio: 0, total: 200 });
    expect(sinPromo.avisos.envioGratisNoAplica).toBe(false);
  });

  it("CA-7.5: con el permiso de cupones, el 10 % sobre Zapatillas a S/ 80 es S/ 8", () => {
    const r = cotizarCompra([zapatillas("100")], { cupon: cupon(), ahora: AHORA, contexto: contexto(promo({ permitirCupones: true })) });
    expect(r).toMatchObject({ subtotal: 80, descuentoCupon: 8, total: 72 });
    expect(r.avisos.cuponSoloSinPromocion).toBeNull();
  });

  it("CA-7.6: con el permiso de envío gratis, mínimo S/ 150: S/ 160 ya con la promoción es gratis; S/ 140 no", () => {
    const ctx = contexto(promo({ permitirEnvioGratis: true }));
    const r160 = cotizarCompra([zapatillas()], { envio: envio(), ahora: AHORA, contexto: ctx });
    expect(r160).toMatchObject({ costoEnvio: 0, total: 160 });
    expect(r160.avisos.envioGratisNoAplica).toBe(false);
    expect(cotizarCompra([zapatillas("175")], { envio: envio(), ahora: AHORA, contexto: ctx })).toMatchObject({ subtotal: 140, costoEnvio: 10 });
  });

  it("dos campañas con permisos distintos: el cupón cuenta la que lo permite; el envío lo quita la que no lo permite", () => {
    const cyber = promo({ campanaId: "c-cy", promocionId: "p-cy", nombre: "Cyber", permitirCupones: true, permitirEnvioGratis: true,
      alcance: { tipo: "productos", productoIds: new Set(["cam"]), categoriaIds: new Set() } });
    const r = cotizarCompra([zapatillas(), camisa("100")], { cupon: cupon(), envio: envio(), ahora: AHORA, contexto: contexto(promo(), cyber) });
    // Camisa a S/ 80 con Cyber (admite cupón): 10 % = 8; Zapatillas con Black Friday no.
    expect(r).toMatchObject({ subtotal: 240, descuentoCupon: 8, costoEnvio: 10 });
    expect(r.avisos).toEqual({ cuponSoloSinPromocion: { productos: ["Camisa"] }, envioGratisNoAplica: true });
  });

  it("recojo en tienda sigue gratis y no se avisa", () => {
    const recojo = { ...metodo, tipo: "recojo_tienda", zonas: [] };
    const r = cotizarCompra([zapatillas()], { envio: { metodo: recojo, ubigeo: null, envioGratisMinimo: 150 }, ahora: AHORA, contexto: contexto() });
    expect(r).toMatchObject({ costoEnvio: 0 });
    expect(r.avisos.envioGratisNoAplica).toBe(false);
  });

  it("sin método elegido (el carrito) se avisa por las líneas (la tienda lo dice si tiene envío gratis por monto)", () => {
    expect(cotizarCompra([zapatillas()], { ahora: AHORA, contexto: contexto() }).avisos.envioGratisNoAplica).toBe(true);
  });

  it("sin promociones no hay avisos (como en P2)", () => {
    const r = cotizarCompra([camisa("200")], { cupon: cupon(), envio: envio(), ahora: AHORA });
    expect(r).toMatchObject({ descuentoCupon: 20, costoEnvio: 0 });
    expect(r.avisos).toEqual({ cuponSoloSinPromocion: null, envioGratisNoAplica: false });
  });

  it("CA-4.7: el cupón de la campaña vale solo mientras su promoción aplica, y con su permiso (R7.5)", () => {
    const cyber10 = cupon({ campanaPromocionId: "p-bf", campanaNombre: "Black Friday" });
    // Dentro de la ventana, con el permiso apagado, vale solo sobre la camisa.
    expect(cotizarCompra([zapatillas(), camisa()], { cupon: cyber10, ahora: AHORA, contexto: contexto() }))
      .toMatchObject({ descuentoCupon: 5 });
    // Fuera de la ventana: su promoción ya no está entre las vigentes.
    expect(() => cotizarCompra([camisa()], { cupon: cyber10, ahora: AHORA, contexto: { promociones: [] } }))
      .toThrow("Este cupón es de la campaña Black Friday y ya no está vigente");
    expect(cotizarCompra([camisa()], { cupon: cyber10, ahora: AHORA, contexto: { promociones: [] }, cuponInvalido: "omitir" }).cuponRechazado)
      .toEqual({ clave: "Este cupón es de la campaña {nombre} y ya no está vigente", params: { nombre: "Black Friday" } });
  });
});
