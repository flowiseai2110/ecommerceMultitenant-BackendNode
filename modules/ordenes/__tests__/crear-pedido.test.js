import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Pedido de compra con precios del servidor (docs/specs/precio-en-servidor, ADR-0001).
// La BD se simula con un tx en memoria; la regla (cotización, cupón, envío) es la real.
const TIENDA = "11111111-1111-4111-8111-111111111111";
const OTRA = "99999999-9999-4999-8999-999999999999";
const P_CAMISA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P_RELOJ = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P_AJENO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const V_RELOJ_ORO = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const M_DELIVERY = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

// Firma del precio asegurado (campanas-descuento C6): config la lee al importar.
process.env.PRECIOS_TOKEN_SECRET = "secreto-de-prueba-del-precio-asegurado-0123456789";

let bd;
let tipoNegocio;
function bdInicial() {
  return {
    productos: [
      { id: P_CAMISA, tiendaId: TIENDA, nombre: "Camisa", precioBase: "100.00", precioOferta: "80.00", activo: true },
      { id: P_RELOJ, tiendaId: TIENDA, nombre: "Reloj", precioBase: "500.00", precioOferta: null, activo: true },
      { id: P_AJENO, tiendaId: OTRA, nombre: "Ajeno", precioBase: "10.00", precioOferta: null, activo: true }
    ],
    variantes: [{ id: V_RELOJ_ORO, productoId: P_RELOJ, nombre: "Oro", precio: "900.00", activo: true }],
    metodos: [],
    cupones: [],
    escrituras: []
  };
}

const escribe = (que) => jest.fn(async (args) => { bd.escrituras.push(que); return { id: "x", ...args?.data }; });
const tx = {
  productos: { findMany: jest.fn(async ({ where }) => bd.productos.filter((p) => p.tiendaId === where.tiendaId && where.id.in.includes(p.id))) },
  producto_variantes: {
    findMany: jest.fn(async ({ where }) => bd.variantes.filter((v) => where.id.in.includes(v.id)
      && bd.productos.find((p) => p.id === v.productoId)?.tiendaId === where.producto.tiendaId))
  },
  metodos_envio: {
    findFirst: jest.fn(async ({ where }) => bd.metodos.find((m) => m.id === where.id) ?? null),
    count: jest.fn(async () => bd.metodos.length)
  },
  tiendas: { findUnique: jest.fn(async () => ({ envioGratisMinimo: null, emiteFactura: false })) },
  // findFirst devuelve la foto leída al empezar: así dos pedidos simultáneos ven el mismo usoActual.
  cupones: {
    findFirst: jest.fn(async ({ where }) => { const c = bd.cupones.find((x) => x.codigo === where.codigo); return c ? { ...c } : null; }),
    updateMany: jest.fn(async ({ where }) => {
      const c = bd.cupones.find((x) => x.id === where.id);
      if (where.usoActual && !(c.usoActual < where.usoActual.lt)) return { count: 0 };
      c.usoActual += 1;
      bd.escrituras.push("cupon");
      return { count: 1 };
    })
  },
  clientes: { findFirst: jest.fn(async () => null), update: escribe("cliente") },
  pedidos: { count: jest.fn(async () => 0), create: jest.fn(async ({ data }) => { bd.escrituras.push("pedido"); return data; }) }
};

jest.unstable_mockModule("../../../generated/prisma/client.ts", () => ({ Prisma: {}, PrismaClient: class {} }));
jest.unstable_mockModule("../../../config/prisma.js", () => {
  // Fuera de la transacción (cotizar) se lee con las mismas tablas simuladas.
  const prisma = { ...tx, $transaction: async (fn) => fn(tx) };
  return { prisma, Prisma: {}, default: prisma };
});
jest.unstable_mockModule("../../negocio/rubros.cache.js", () => ({
  tiendaDe: async (id) => ({ id, tipoNegocio }), invalidarRubrosCache: () => {}
}));
jest.unstable_mockModule("../pedidos.service.js", () => ({
  CAMPOS_DESTINO: ["ubigeoCode"],
  generarNumeroPedido: async () => "PED-0001",
  upsertCliente: async () => { bd.escrituras.push("upsertCliente"); return { id: "cli-1" }; }
}));
const validarYBloquearStock = jest.fn(async () => { bd.escrituras.push("stock-lock"); return { variantesADescontar: [], productosADescontar: [] }; });
jest.unstable_mockModule("../../inventario/inventario.service.js", () => ({
  validarYBloquearStock, descontarStock: async () => { bd.escrituras.push("stock"); }, reponerStock: async () => {}
}));
// Promociones de campaña vigentes (campanas-descuento C3a): el cargador real se prueba aparte.
let promociones = [];
const contextoDePrecios = jest.fn(async (_db, _tiendaId, { ahora }) => ({ ahora, promociones, proximoCambio: null }));
jest.unstable_mockModule("../../precios/contexto.service.js", () => ({ contextoDePrecios }));
jest.unstable_mockModule("../../sunat/ruc.service.js", () => ({ datosFactura: async () => null }));
jest.unstable_mockModule("../pedidos-pendientes-cache.js", () => ({ invalidatePendientesCount: () => {} }));

const { crearPedido, cotizarPedido } = await import("../crear-pedido.js");
const { createPedidoSchema, cotizarPedidoSchema } = await import("../pedidos.schema.js");
const { firmar } = await import("../../precios/precio-congelado.token.js");

const cliente = { nombre: "Ana", whatsappNumero: "987654321" };
// Pasa por el schema real, como en la ruta: lo que no declara se descarta.
const cuerpo = (extra = {}) => createPedidoSchema.parse({ tiendaId: TIENDA, cliente, detalles: [{ productoId: P_CAMISA, cantidad: 2 }], ...extra });
const crear = (extra) => crearPedido(cuerpo(extra));
const fallo = async (p) => { try { await p; } catch (e) { return e; } throw new Error("no falló"); };

beforeEach(() => {
  bd = bdInicial();
  tipoNegocio = "productos";
  promociones = [];
  jest.clearAllMocks();
});

describe("crearPedido: el precio lo pone el servidor", () => {
  it("ignora precioUnitario, descuento y nombre del body: precio de la BD con su oferta", async () => {
    const pedido = await crear({
      detalles: [{ productoId: P_CAMISA, cantidad: 2, precioUnitario: 1, descuento: 999, productoNombre: "Gratis" }]
    });
    expect(pedido.detalles.createMany.data).toEqual([{
      productoId: P_CAMISA, varianteId: null, productoNombre: "Camisa", varianteNombre: null, cantidad: 2,
      precioUnitario: 80, precioRegular: 100, precioOrigen: "oferta", descuento: 0, total: 160,
      campanaId: null, campanaNombre: null, promocionPorcentaje: null
    }]);
    expect(pedido).toMatchObject({ subtotal: 160, descuentoMonto: 0, costoEnvio: 0, total: 160, metodoEnvio: "Por coordinar" });
  });

  it("descuentoMonto y costoEnvio del body sin cupón no cuentan", async () => {
    const pedido = await crear({ descuentoMonto: 150, costoEnvio: 0, metodoEnvio: "Delivery" });
    expect(pedido).toMatchObject({ descuentoMonto: 0, total: 160, metodoEnvio: "Por coordinar" });
  });

  it("variante con precio propio: su precio, sin la oferta del producto (D3)", async () => {
    const pedido = await crear({ detalles: [{ productoId: P_RELOJ, varianteId: V_RELOJ_ORO, cantidad: 1 }] });
    expect(pedido.detalles.createMany.data[0]).toMatchObject({ varianteNombre: "Oro", precioUnitario: 900, precioOrigen: "regular" });
  });

  it("línea sin productoId → 400 del schema", () => {
    expect(createPedidoSchema.safeParse({ tiendaId: TIENDA, cliente, detalles: [{ cantidad: 1, productoNombre: "Inventado", precioUnitario: 5 }] }).success).toBe(false);
  });

  it("variante de otro producto → 400", async () => {
    const e = await fallo(crear({ detalles: [{ productoId: P_CAMISA, varianteId: V_RELOJ_ORO, cantidad: 1 }] }));
    expect(e.statusCode).toBe(400);
    expect(e.details.clave).toBe("Variante \"{producto}\" no disponible");
  });

  it("producto de otra tienda → 400", async () => {
    const e = await fallo(crear({ detalles: [{ productoId: P_AJENO, cantidad: 1 }] }));
    expect(e.statusCode).toBe(400);
    expect(e.details.clave).toBe("Producto no disponible");
  });

  it("tienda sin la capacidad carrito → 400, sin abrir la transacción", async () => {
    tipoNegocio = "hotel";
    const e = await fallo(crear());
    expect(e.statusCode).toBe(400);
    expect(e.details.clave).toBe("Esta tienda no vende con carrito");
    expect(tx.productos.findMany).not.toHaveBeenCalled();
  });
});

describe("crearPedido: promoción de campaña (campanas-descuento C3a)", () => {
  const promo = (porcentaje) => ({
    campanaId: "c-bf", nombre: "Black Friday", porcentaje, orden: 0, hasta: new Date("2026-12-01T05:00:00Z"),
    permitirCupones: false, permitirEnvioGratis: false,
    alcance: { tipo: "tienda", elegidas: [], categoriaIds: new Set(), productoIds: new Set() }
  });

  it("cobra el precio con la promoción vigente, leída sin caché (R5.2)", async () => {
    promociones = [promo(20)];
    const pedido = await crear({ detalles: [{ productoId: P_RELOJ, cantidad: 1 }] });
    expect(pedido.detalles.createMany.data[0]).toMatchObject({ precioUnitario: 400, precioRegular: 500, precioOrigen: "campana" });
    expect(contextoDePrecios).toHaveBeenCalledWith(expect.anything(), TIENDA, expect.objectContaining({ conCache: false }));
  });

  it("empate con la oferta del producto → gana la oferta (E8)", async () => {
    promociones = [promo(20)];
    const pedido = await crear();
    expect(pedido.detalles.createMany.data[0]).toMatchObject({ precioUnitario: 80, precioOrigen: "oferta" });
  });

  it("cotizar usa la misma lectura fresca", async () => {
    promociones = [promo(10)];
    const { lineas } = await cotizarPedido(cotizarPedidoSchema.parse({ tiendaId: TIENDA, detalles: [{ productoId: P_RELOJ, cantidad: 2 }] }));
    expect(lineas[0]).toMatchObject({ precioUnitario: 450, precioOrigen: "campana", total: 900 });
    expect(contextoDePrecios).toHaveBeenCalledWith(expect.anything(), TIENDA, expect.objectContaining({ conCache: false }));
  });
});

describe("precio asegurado mientras se paga (campanas-descuento C6, R8.4)", () => {
  const promo = (porcentaje) => ({
    campanaId: "c-bf", nombre: "Black Friday", porcentaje, orden: 0, hasta: new Date("2026-11-30T03:00:00Z"),
    permitirCupones: false, permitirEnvioGratis: false,
    alcance: { tipo: "tienda", elegidas: [], categoriaIds: new Set(), productoIds: new Set() }
  });
  const reloj = [{ productoId: P_RELOJ, cantidad: 1 }];
  // Hora de Lima (UTC−5); la promoción termina a las 22:00.
  const a = (hora) => jest.setSystemTime(new Date(`2026-11-29T${hora}:00-05:00`));
  const entrarAlPago = async () => {
    a("21:50");
    promociones = [promo(20)];
    return cotizarPedido(cotizarPedidoSchema.parse({ tiendaId: TIENDA, detalles: reloj, congelar: true }));
  };

  beforeEach(() => jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] }));
  afterEach(() => jest.useRealTimers());

  it("al entrar al pago la cotización asegura el precio 15 minutos", async () => {
    const cotizacion = await entrarAlPago();
    expect(cotizacion.lineas[0]).toMatchObject({
      precioUnitario: 400, precioRegular: 500, precioOrigen: "campana", campana: { id: "c-bf", nombre: "Black Friday", porcentaje: 20 }
    });
    expect(cotizacion.precioAsegurado.vence).toBe("2026-11-30T03:05:00.000Z");
    expect(cotizacion).not.toHaveProperty("precios");
  });

  it("CA-8.3: entra 21:50, la promoción termina 22:00, confirma 22:05 → S/ 400 y la foto de la campaña", async () => {
    const { precioAsegurado } = await entrarAlPago();
    a("22:05");
    promociones = [];
    const pedido = await crear({ detalles: reloj, tokenPrecio: precioAsegurado.token, totalEsperado: 400 });
    expect(pedido.detalles.createMany.data[0]).toMatchObject({
      precioUnitario: 400, precioRegular: 500, precioOrigen: "campana",
      campanaId: "c-bf", campanaNombre: "Black Friday", promocionPorcentaje: 20
    });
    expect(pedido.total).toBe(400);
  });

  it("CA-8.3: confirma 22:30 (token vencido) → se recalcula a S/ 500 y 409 sin crear nada", async () => {
    const { precioAsegurado } = await entrarAlPago();
    a("22:30");
    promociones = [];
    const error = await fallo(crear({ detalles: reloj, tokenPrecio: precioAsegurado.token, totalEsperado: 400 }));
    expect(error.code).toBe("PRECIO_CAMBIO");
    expect(error.details.cotizacion.total).toBe(500);
    expect(bd.escrituras).toEqual([]);
  });

  it("R8.6: la campaña se apaga con el token vigente → S/ 400", async () => {
    const { precioAsegurado } = await entrarAlPago();
    a("21:55");
    promociones = [];
    const { lineas } = await cotizarPedido(cotizarPedidoSchema.parse({ tiendaId: TIENDA, detalles: reloj, tokenPrecio: precioAsegurado.token }));
    expect(lineas[0]).toMatchObject({ precioUnitario: 400, precioOrigen: "campana" });
  });

  it("si el precio bajó mientras pagaba, cobra el menor", async () => {
    const { precioAsegurado } = await entrarAlPago();
    promociones = [promo(30)];
    const pedido = await crear({ detalles: reloj, tokenPrecio: precioAsegurado.token });
    expect(pedido.detalles.createMany.data[0]).toMatchObject({ precioUnitario: 350, promocionPorcentaje: 30 });
  });

  it("token de otra tienda o alterado → se ignora (precio de ahora)", async () => {
    a("21:55");
    promociones = [];
    const ajeno = await firmar({ tiendaId: OTRA, lineas: [{ productoId: P_RELOJ, varianteId: null, unitario: 100, regular: 50000, origen: "campana", campana: null }] });
    const { precioAsegurado } = await entrarAlPago();
    promociones = [];
    const alterado = precioAsegurado.token.slice(0, -2) + (precioAsegurado.token.endsWith("AA") ? "BB" : "AA");
    for (const tokenPrecio of [ajeno.token, alterado, "basura"]) {
      const pedido = await crear({ detalles: reloj, tokenPrecio });
      expect(pedido.detalles.createMany.data[0]).toMatchObject({ precioUnitario: 500, precioOrigen: "regular", campanaId: null });
    }
  });

  it("pedir un precio asegurado nuevo no renueva el anterior: asegura el de ahora", async () => {
    const { precioAsegurado } = await entrarAlPago();
    a("22:04");
    promociones = [];
    const nuevo = await cotizarPedido(cotizarPedidoSchema.parse({ tiendaId: TIENDA, detalles: reloj, tokenPrecio: precioAsegurado.token, congelar: true }));
    expect(nuevo.lineas[0]).toMatchObject({ precioUnitario: 500, precioOrigen: "regular", campana: null });
  });

  it("CA-8.1: el navegador manda S/ 10 → cobra S/ 400 (precio vigente)", async () => {
    a("21:50");
    promociones = [promo(20)];
    const pedido = await crear({ detalles: [{ productoId: P_RELOJ, cantidad: 1, precioUnitario: 10 }] });
    expect(pedido.detalles.createMany.data[0].precioUnitario).toBe(400);
  });
});

describe("crearPedido: cupón", () => {
  const cupon = (extra) => ({ id: "cup-1", codigo: "PROMO", activo: true, tipo: "porcentaje", valor: "10", minimoCompra: "0",
    usoMaximo: null, usoActual: 0, usoMaximoPorCliente: null, fechaInicio: null, fechaFin: null, ...extra });

  it("se suma a la oferta (D2) y el descuento lo calcula el servidor", async () => {
    bd.cupones.push(cupon());
    const pedido = await crear({ codigoCupon: "promo", descuentoMonto: 999 });
    expect(pedido).toMatchObject({ subtotal: 160, descuentoMonto: 16, total: 144, codigoCupon: "PROMO" });
  });

  it("bajo la compra mínima → 400", async () => {
    bd.cupones.push(cupon({ minimoCompra: "200" }));
    const e = await fallo(crear({ codigoCupon: "PROMO" }));
    expect(e.statusCode).toBe(400);
    expect(e.message).toBe("Compra mínima requerida: 200");
  });

  it("dos pedidos con el último uso: uno sale, el otro 'Cupón agotado'", async () => {
    bd.cupones.push(cupon({ usoMaximo: 5, usoActual: 4 }));
    const r = await Promise.allSettled([crear({ codigoCupon: "PROMO" }), crear({ codigoCupon: "PROMO" })]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(r.find((x) => x.status === "rejected").reason.message).toBe("Cupón agotado");
    expect(bd.cupones[0].usoActual).toBe(5);
  });
});

describe("crearPedido: total que vio el cliente (D1)", () => {
  it("menor que el real → 409 PRECIO_CAMBIO con la cotización, y nada escrito", async () => {
    const e = await fallo(crear({ totalEsperado: 150 }));
    expect(e.statusCode).toBe(409);
    expect(e.code).toBe("PRECIO_CAMBIO");
    expect(e.details.cotizacion).toMatchObject({ total: 160, lineas: [{ precioUnitario: 80, precioRegular: 100 }] });
    expect(bd.escrituras).toEqual([]);
    expect(validarYBloquearStock).not.toHaveBeenCalled();
  });

  it("mayor, igual o ausente → se crea con el total del servidor", async () => {
    expect((await crear({ totalEsperado: 999 })).total).toBe(160);
    expect((await crear({ totalEsperado: 160 })).total).toBe(160);
    expect((await crear()).total).toBe(160);
  });
});

describe("crearPedido: envío", () => {
  const delivery = { id: M_DELIVERY, nombre: "Delivery", tipo: "delivery", activo: true, fueraDeZona: "coordinar", pagoEnDestino: false,
    costoReferencial: null, zonas: [{ nombre: "Lima", costo: "12.00", ubigeos: ["15"], orden: 0 }] };

  it("con métodos activos y sin metodoEnvioId → 400", async () => {
    bd.metodos.push(delivery);
    const e = await fallo(crear());
    expect(e.statusCode).toBe(400);
    expect(e.details.clave).toBe("Elige un método de envío");
  });

  it("con metodoEnvioId: costo y nombre del servidor", async () => {
    bd.metodos.push(delivery);
    const pedido = await crear({ metodoEnvioId: M_DELIVERY, ubigeoCode: "150101", metodoEnvio: "Gratis" });
    expect(pedido).toMatchObject({ costoEnvio: 12, total: 172, metodoEnvio: "Delivery" });
  });
});

describe("cotizarPedido (POST /store/pedidos/cotizar, pieza 4)", () => {
  const cotizar = (extra = {}) => cotizarPedido(cotizarPedidoSchema.parse({ tiendaId: TIENDA, detalles: [{ productoId: P_CAMISA, cantidad: 2 }], ...extra }));
  const cupon = (extra) => ({ id: "cup-1", codigo: "PROMO", activo: true, tipo: "porcentaje", valor: "10", minimoCompra: "0",
    usoMaximo: null, usoActual: 0, usoMaximoPorCliente: 1, fechaInicio: null, fechaFin: null, ...extra });
  const delivery = { id: M_DELIVERY, nombre: "Delivery", tipo: "delivery", activo: true, fueraDeZona: "coordinar", pagoEnDestino: false,
    costoReferencial: null, zonas: [{ nombre: "Lima", costo: "12.00", ubigeos: ["15"], orden: 0 }] };

  it("el mismo total que crear el pedido, sin escribir nada", async () => {
    bd.cupones.push(cupon());
    bd.metodos.push(delivery);
    const extra = { codigoCupon: "promo", metodoEnvioId: M_DELIVERY, ubigeoCode: "150101" };
    const cotizacion = await cotizar({ ...extra, precioUnitario: 1, cliente });
    expect(bd.escrituras).toEqual([]);
    expect(cotizacion).toMatchObject({ subtotal: 160, descuentoCupon: 16, costoEnvio: 12, total: 156, cuponRechazado: null,
      lineas: [{ productoId: P_CAMISA, precioUnitario: 80, precioRegular: 100, precioOrigen: "oferta", total: 160 }] });
    expect(cotizacion.envio).toMatchObject({ nombre: "Delivery", disponible: true });
    expect((await crear(extra)).total).toBe(cotizacion.total);
  });

  it("sin método de envío cotiza sin envío aunque la tienda tenga métodos", async () => {
    bd.metodos.push(delivery);
    expect(await cotizar()).toMatchObject({ costoEnvio: 0, total: 160, envio: null });
  });

  it("cupón que ya no aplica: cotiza sin él y lo avisa", async () => {
    bd.cupones.push(cupon({ minimoCompra: "200" }));
    expect(await cotizar({ codigoCupon: "PROMO" })).toMatchObject({
      descuentoCupon: 0, total: 160, cuponRechazado: { clave: "Compra mínima requerida: {minimo}", params: { minimo: "200" } }
    });
    expect(await cotizar({ codigoCupon: "NOEXISTE" })).toMatchObject({ total: 160, cuponRechazado: { clave: "Cupón no válido" } });
  });

  it("una línea inválida o una tienda sin carrito → 400, como al crear", async () => {
    expect((await fallo(cotizar({ detalles: [{ productoId: P_AJENO, cantidad: 1 }] }))).statusCode).toBe(400);
    tipoNegocio = "hotel";
    expect((await fallo(cotizar())).details.clave).toBe("Esta tienda no vende con carrito");
  });
});

describe("fitness: el navegador no fija montos", () => {
  const leer = (f) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", f), "utf8");

  it("pedidos.schema.js no acepta precioUnitario, descuento, descuentoMonto, costoEnvio ni nombres", () => {
    expect(leer("pedidos.schema.js")).not.toMatch(/\b(precioUnitario|descuento|descuentoMonto|costoEnvio|productoNombre|varianteNombre)\s*:/);
  });

  it("crear-pedido.js no lee montos del body", () => {
    const fuente = leer("crear-pedido.js");
    const entrada = fuente.match(/const \{([^}]*)\} = data;/)[1];
    expect(entrada).not.toMatch(/precioUnitario|descuentoMonto|costoEnvio|metodoEnvio\b/);
    expect(fuente).not.toMatch(/\b(data|item|detalle|d)\.(precioUnitario|descuento|descuentoMonto|costoEnvio|productoNombre)\b/);
  });
});
