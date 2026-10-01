import { jest } from "@jest/globals";

// Prisma simulado: cada test arma las respuestas que necesita. $transaction
// ejecuta el callback con el mismo mock como `tx`.
const db = {
  pedidos: { findFirst: jest.fn(), findMany: jest.fn() },
  tiendas: { findUnique: jest.fn() },
  productos: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  resenas: {
    findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn(),
    count: jest.fn(), groupBy: jest.fn(), aggregate: jest.fn()
  },
  tienda_configuraciones: { findUnique: jest.fn(), upsert: jest.fn() },
  $transaction: jest.fn(fn => fn(db))
};
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: db, Prisma: {}, default: db }));
// Config controlada: el test no depende del .env local.
const config = {
  platform: { baseDomain: "ecompyme.com", storefrontUrl: "http://localhost:4200/" },
  resenas: { linkSecret: "secreto-de-prueba-de-al-menos-32-bytes!!", linkTtlDias: 60 }
};
jest.unstable_mockModule("../../../config/index.js", () => ({ default: config }));
const invalidateProductoDetailCache = jest.fn();
jest.unstable_mockModule("../../catalogo/productos.cache.js", () => ({ invalidateProductoDetailCache }));

const service = await import("../resenas.service.js");
const { verificarTokenResena } = await import("../resenas.token.js");
const { ForbiddenError, NotFoundError, UnprocessableError } = await import("../../../utils/errors.js");

const TIENDA = "t-1";
const PEDIDO = "p-1";
const PRODUCTO = "prod-1";
const USUARIO = "user-1";

function resetMocks() {
  for (const modelo of Object.values(db)) {
    if (typeof modelo === "function") continue;
    for (const fn of Object.values(modelo)) fn.mockReset();
  }
  db.$transaction.mockImplementation(fn => fn(db));
  invalidateProductoDetailCache.mockReset();
}

// Pedido entregado de USUARIO que incluye PRODUCTO; se sobreescribe por test.
function pedidoOk(overrides = {}) {
  return {
    id: PEDIDO, estado: "entregado", authUserId: USUARIO, clienteNombre: "juan pérez garcía",
    detalles: [{ id: "d-1" }], ...overrides
  };
}

const verificar = (overrides = {}) => service.verificarCompra(db, {
  tiendaId: TIENDA, pedidoId: PEDIDO, productoId: PRODUCTO, authUserId: USUARIO, porToken: false, ...overrides
});

beforeEach(() => {
  resetMocks();
  db.productos.findFirst.mockResolvedValue({ id: PRODUCTO });
  db.resenas.aggregate.mockResolvedValue({ _avg: { estrellas: null }, _sum: { estrellas: null }, _count: { _all: 0 } });
});

describe("formatearNombreMostrado", () => {
  it.each([
    ["juan pérez garcía", "Juan P."],
    ["Ana María Gutiérrez", "Ana M."],
    ["  lucía   ", "Lucía"],
    ["", "Cliente"],
    [null, "Cliente"]
  ])("%p → %p", (entrada, esperado) => {
    expect(service.formatearNombreMostrado(entrada)).toBe(esperado);
  });

  it("nunca publica el nombre completo", () => {
    expect(service.formatearNombreMostrado("Rosa Elena Quispe Mamani")).toBe("Rosa E.");
  });
});

describe("verificarCompra — solo compras verificadas", () => {
  it("acepta un pedido entregado, de la cuenta, que incluye el producto", async () => {
    db.pedidos.findFirst.mockResolvedValue(pedidoOk());

    await expect(verificar()).resolves.toMatchObject({ id: PEDIDO });
    expect(db.pedidos.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: PEDIDO, tiendaId: TIENDA }
    }));
  });

  it("404 si el pedido no existe en esta tienda", async () => {
    db.pedidos.findFirst.mockResolvedValue(null);

    await expect(verificar()).rejects.toBeInstanceOf(NotFoundError);
  });

  it("403 si el pedido es de otra cuenta", async () => {
    db.pedidos.findFirst.mockResolvedValue(pedidoOk({ authUserId: "otro-usuario" }));

    await expect(verificar()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("403 si es un pedido de invitado y se intenta con sesión (sin token)", async () => {
    db.pedidos.findFirst.mockResolvedValue(pedidoOk({ authUserId: null }));

    await expect(verificar()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("con token acepta el pedido de invitado (el token prueba que lo recibió)", async () => {
    db.pedidos.findFirst.mockResolvedValue(pedidoOk({ authUserId: null }));

    await expect(verificar({ authUserId: null, porToken: true })).resolves.toMatchObject({ id: PEDIDO });
  });

  it.each(["pendiente", "confirmado", "enviado", "cancelado"])("422 si el pedido está %s", async (estado) => {
    db.pedidos.findFirst.mockResolvedValue(pedidoOk({ estado }));

    const err = await verificar().catch(e => e);
    expect(err).toBeInstanceOf(UnprocessableError);
    expect(err.details).toEqual({ motivo: "PEDIDO_NO_ENTREGADO" });
  });

  it("422 si el producto no está en el pedido", async () => {
    db.pedidos.findFirst.mockResolvedValue(pedidoOk({ detalles: [] }));

    const err = await verificar().catch(e => e);
    expect(err).toBeInstanceOf(UnprocessableError);
    expect(err.details).toEqual({ motivo: "PRODUCTO_NO_EN_PEDIDO" });
  });

  it("404 si el producto ya no existe en la tienda", async () => {
    db.pedidos.findFirst.mockResolvedValue(pedidoOk());
    db.productos.findFirst.mockResolvedValue(null);

    await expect(verificar()).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("guardarResena", () => {
  const input = {
    tiendaId: TIENDA, pedidoId: PEDIDO, productoId: PRODUCTO, estrellas: 4,
    comentario: "Muy buena tela", authUserId: USUARIO, porToken: false
  };

  beforeEach(() => {
    db.pedidos.findFirst.mockResolvedValue(pedidoOk());
    db.resenas.findUnique.mockResolvedValue(null);
    db.resenas.create.mockImplementation(({ data }) => Promise.resolve({ id: "r-1", ...data }));
    db.resenas.update.mockImplementation(({ data }) => Promise.resolve({ id: "r-1", ...data }));
  });

  it("con moderación previa (default) queda pendiente y no se publica", async () => {
    db.tienda_configuraciones.findUnique.mockResolvedValue(null);

    const r = await service.guardarResena(input);

    expect(r).toMatchObject({ estado: "pendiente", publicada: false });
    expect(db.resenas.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        estado: "pendiente", estrellas: 4, nombreMostrado: "Juan P.", authUserId: USUARIO, tiendaId: TIENDA
      })
    });
  });

  it("con moderación automática se publica al instante y recalcula el rating", async () => {
    db.tienda_configuraciones.findUnique.mockResolvedValue({ valor: { modo: "automatica" } });
    db.resenas.aggregate.mockResolvedValue({ _avg: { estrellas: 4 }, _sum: { estrellas: 4 }, _count: { _all: 1 } });

    const r = await service.guardarResena(input);

    expect(r).toMatchObject({ estado: "aprobada", publicada: true });
    expect(db.productos.update).toHaveBeenCalledWith({
      where: { id: PRODUCTO }, data: { ratingPromedio: 4, ratingCantidad: 1, ratingScore: 4 }
    });
    // La ficha cacheada (60s) debe mostrar el rating nuevo al instante.
    expect(invalidateProductoDetailCache).toHaveBeenCalledWith(PRODUCTO);
  });

  it("si ya existía la reemplaza (no duplica) y la vuelve a moderar", async () => {
    db.tienda_configuraciones.findUnique.mockResolvedValue(null);
    db.resenas.findUnique.mockResolvedValue({ id: "r-1", authUserId: USUARIO });

    await service.guardarResena({ ...input, estrellas: 2 });

    expect(db.resenas.create).not.toHaveBeenCalled();
    expect(db.resenas.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "r-1" },
      data: expect.objectContaining({ estrellas: 2, estado: "pendiente" })
    }));
    // Recalcula igual: la versión anterior pudo estar aprobada y contar en el promedio.
    expect(db.productos.update).toHaveBeenCalled();
  });

  it("al editar por link conserva el usuario que la había dejado con sesión", async () => {
    db.tienda_configuraciones.findUnique.mockResolvedValue(null);
    db.pedidos.findFirst.mockResolvedValue(pedidoOk({ authUserId: null }));
    db.resenas.findUnique.mockResolvedValue({ id: "r-1", authUserId: USUARIO });

    await service.guardarResena({ ...input, authUserId: null, porToken: true });

    expect(db.resenas.update.mock.calls[0][0].data.authUserId).toBe(USUARIO);
  });

  it("no escribe nada si la compra no se verifica", async () => {
    db.pedidos.findFirst.mockResolvedValue(pedidoOk({ estado: "enviado" }));

    await expect(service.guardarResena(input)).rejects.toBeInstanceOf(UnprocessableError);
    expect(db.resenas.create).not.toHaveBeenCalled();
    expect(db.resenas.update).not.toHaveBeenCalled();
    expect(invalidateProductoDetailCache).not.toHaveBeenCalled();
  });
});

describe("recalcularRatingProducto", () => {
  it("redondea el promedio a 2 decimales", async () => {
    db.resenas.aggregate.mockResolvedValue({ _avg: { estrellas: 4.666666 }, _sum: { estrellas: 14 }, _count: { _all: 3 } });

    await expect(service.recalcularRatingProducto(db, PRODUCTO))
      .resolves.toEqual({ ratingPromedio: 4.67, ratingCantidad: 3, ratingScore: 4.3333 });
  });

  it("sin reseñas aprobadas deja 0 y 0", async () => {
    await expect(service.recalcularRatingProducto(db, PRODUCTO))
      .resolves.toEqual({ ratingPromedio: 0, ratingCantidad: 0, ratingScore: 0 });
  });

  it("solo cuenta reseñas aprobadas", async () => {
    await service.recalcularRatingProducto(db, PRODUCTO);

    expect(db.resenas.aggregate.mock.calls[0][0].where).toEqual({ productoId: PRODUCTO, estado: "aprobada" });
  });
});

describe("listarResenasProducto", () => {
  it("solo aprobadas, sin datos privados, con resumen y distribución", async () => {
    db.resenas.findMany.mockResolvedValue([{
      id: "r-1", estrellas: 5, comentario: "Top", nombreMostrado: "Ana G.", respuestaTienda: null,
      fechaRespuesta: null, fechaRegistro: "2026-09-01", pedidoId: PEDIDO, authUserId: USUARIO, estado: "aprobada"
    }]);
    db.resenas.count.mockResolvedValue(3);
    db.resenas.groupBy.mockResolvedValue([
      { estrellas: 5, _count: { _all: 2 } },
      { estrellas: 3, _count: { _all: 1 } }
    ]);

    const r = await service.listarResenasProducto(TIENDA, PRODUCTO, { page: 1, limit: 10 });

    expect(db.resenas.findMany.mock.calls[0][0].where).toEqual({ tiendaId: TIENDA, productoId: PRODUCTO, estado: "aprobada" });
    expect(r.data[0]).not.toHaveProperty("pedidoId");
    expect(r.data[0]).not.toHaveProperty("authUserId");
    expect(r.resumen).toEqual({ promedio: 4.33, cantidad: 3, distribucion: { 5: 2, 4: 0, 3: 1, 2: 0, 1: 0 } });
  });
});

describe("listarResenables", () => {
  it("un item por producto (sin repetir variantes), sin productos borrados, con la reseña existente", async () => {
    db.pedidos.findMany.mockResolvedValue([{
      id: PEDIDO, numeroPedido: "PED-0001", fechaEntregado: "2026-09-10",
      detalles: [
        { productoId: PRODUCTO, productoNombre: "Polo", varianteNombre: "M" },
        { productoId: PRODUCTO, productoNombre: "Polo", varianteNombre: "L" },
        { productoId: "borrado", productoNombre: "Gorra", varianteNombre: null },
        { productoId: null, productoNombre: "Servicio suelto", varianteNombre: null }
      ],
      resenas: [{ productoId: PRODUCTO, estrellas: 5, comentario: null, estado: "pendiente" }]
    }]);
    db.productos.findMany.mockResolvedValue([{ id: PRODUCTO, imagenes: [{ url: "https://img/polo.webp" }] }]);

    const r = await service.listarResenables(TIENDA, { authUserId: USUARIO });

    expect(db.pedidos.findMany.mock.calls[0][0].where).toEqual({ tiendaId: TIENDA, estado: "entregado", authUserId: USUARIO });
    expect(r).toEqual([{
      pedidoId: PEDIDO, numeroPedido: "PED-0001", fechaEntregado: "2026-09-10",
      items: [{
        productoId: PRODUCTO, productoNombre: "Polo", imagenUrl: "https://img/polo.webp",
        resena: { estrellas: 5, comentario: null, estado: "pendiente" }
      }]
    }]);
  });

  it("sin cuenta ni pedido no consulta nada", async () => {
    await expect(service.listarResenables(TIENDA, {})).resolves.toEqual([]);
    expect(db.pedidos.findMany).not.toHaveBeenCalled();
  });
});

describe("moderación (admin)", () => {
  const user = { id: "admin-1", email: "dueno@tienda.pe" };

  it("404 al moderar una reseña de otra tienda", async () => {
    db.resenas.findUnique.mockResolvedValue({ id: "r-1", tiendaId: "otra-tienda", estado: "pendiente" });

    await expect(service.cambiarEstadoResena(TIENDA, "r-1", "aprobada", user)).rejects.toBeInstanceOf(NotFoundError);
    expect(db.resenas.update).not.toHaveBeenCalled();
  });

  it("aprobar recalcula el rating del producto", async () => {
    db.resenas.findUnique.mockResolvedValue({ id: "r-1", tiendaId: TIENDA, productoId: PRODUCTO, estado: "pendiente" });
    db.resenas.update.mockResolvedValue({ id: "r-1", estado: "aprobada", productoId: PRODUCTO });

    await service.cambiarEstadoResena(TIENDA, "r-1", "aprobada", user);

    expect(db.productos.update).toHaveBeenCalled();
    expect(invalidateProductoDetailCache).toHaveBeenCalledWith(PRODUCTO);
    expect(db.resenas.update.mock.calls[0][0].data.usuarioActualizacion).toBe("dueno@tienda.pe");
  });

  it("no recalcula si el estado no cambia", async () => {
    db.resenas.findUnique.mockResolvedValue({ id: "r-1", tiendaId: TIENDA, productoId: PRODUCTO, estado: "aprobada" });
    db.resenas.update.mockResolvedValue({ id: "r-1", estado: "aprobada" });

    await service.cambiarEstadoResena(TIENDA, "r-1", "aprobada", user);

    expect(db.productos.update).not.toHaveBeenCalled();
    expect(invalidateProductoDetailCache).not.toHaveBeenCalled();
  });

  it("responder con null borra la respuesta y su fecha", async () => {
    db.resenas.findUnique.mockResolvedValue({ id: "r-1", tiendaId: TIENDA });
    db.resenas.update.mockResolvedValue({ id: "r-1" });

    await service.responderResena(TIENDA, "r-1", null, user);

    expect(db.resenas.update.mock.calls[0][0].data).toMatchObject({ respuestaTienda: null, fechaRespuesta: null });
  });

  it("el modo de moderación por defecto es 'previa'", async () => {
    db.tienda_configuraciones.findUnique.mockResolvedValue(null);

    await expect(service.getModoModeracion(TIENDA)).resolves.toBe("previa");
  });
});

describe("link 'califica tu compra'", () => {
  afterEach(() => { config.platform.baseDomain = "ecompyme.com"; });

  it("en producción usa el subdominio de la tienda", () => {
    expect(service.urlTienda("zapateria", "resenar/abc")).toBe("https://zapateria.ecompyme.com/resenar/abc");
  });

  it("sin dominio de plataforma (dev) usa el modo por ruta, sin doble barra", () => {
    config.platform.baseDomain = null;
    expect(service.urlTienda("zapateria", "resenar/abc")).toBe("http://localhost:4200/zapateria/resenar/abc");
  });

  it("genera un link cuyo token prueba el pedido y la tienda", async () => {
    db.pedidos.findFirst.mockResolvedValue({ id: PEDIDO, estado: "entregado" });
    db.tiendas.findUnique.mockResolvedValue({ slug: "zapateria" });

    const { url, expiraEn } = await service.generarEnlaceResena(TIENDA, PEDIDO);

    // https://<slug>.<dominio>/resenar/<JWT de 3 partes>
    expect(url).toMatch(/^https:\/\/zapateria\.ecompyme\.com\/resenar\/[\w-]+\.[\w-]+\.[\w-]+$/);
    const token = url.split("/resenar/")[1];
    await expect(verificarTokenResena(token)).resolves.toEqual({ pedidoId: PEDIDO, tiendaId: TIENDA });
    expect(new Date(expiraEn).getTime()).toBeGreaterThan(Date.now() + 59 * 24 * 60 * 60 * 1000);
  });

  it("no emite links para pedidos no entregados", async () => {
    db.pedidos.findFirst.mockResolvedValue({ id: PEDIDO, estado: "enviado" });

    const err = await service.generarEnlaceResena(TIENDA, PEDIDO).catch(e => e);
    expect(err).toBeInstanceOf(UnprocessableError);
    expect(err.details).toEqual({ motivo: "PEDIDO_NO_ENTREGADO" });
  });

  it("404 si el pedido no es de la tienda", async () => {
    db.pedidos.findFirst.mockResolvedValue(null);

    await expect(service.generarEnlaceResena(TIENDA, PEDIDO)).rejects.toBeInstanceOf(NotFoundError);
    expect(db.pedidos.findFirst.mock.calls[0][0].where).toEqual({ id: PEDIDO, tiendaId: TIENDA });
  });
});

describe("ranking 'Mejor valorados' (promedio bayesiano)", () => {
  it("sin reseñas el puntaje es 0 (esos productos van al final)", () => {
    expect(service.calcularRatingScore(0, 0)).toBe(0);
  });

  it("un 5.0 con 1 reseña NO supera a un 4.9 con 40", () => {
    const unaReseña = service.calcularRatingScore(5, 1);
    const cuarenta = service.calcularRatingScore(4.9 * 40, 40);

    expect(unaReseña).toBe(4.25);
    expect(cuarenta).toBeGreaterThan(unaReseña);
  });

  it("con muchas reseñas el puntaje converge al promedio real", () => {
    expect(service.calcularRatingScore(4.5 * 1000, 1000)).toBeCloseTo(4.5, 2);
  });

  it("una sola reseña mala no hunde el puntaje por debajo de otras reseñadas", () => {
    expect(service.calcularRatingScore(1, 1)).toBe(3.25);
  });
});

describe("listarResenasDestacadas (testimonios del home)", () => {
  it("solo aprobadas de 4-5 estrellas con comentario, sin datos privados", async () => {
    db.resenas.findMany.mockResolvedValue([{
      id: "r-1", estrellas: 5, comentario: "Me encantó", nombreMostrado: "Ana G.", respuestaTienda: null,
      fechaRespuesta: null, fechaRegistro: "2026-09-01", productoId: PRODUCTO, pedidoId: PEDIDO,
      authUserId: USUARIO, producto: { nombre: "Polo" }
    }]);

    const r = await service.listarResenasDestacadas(TIENDA, 6);

    expect(db.resenas.findMany.mock.calls[0][0]).toMatchObject({
      where: { tiendaId: TIENDA, estado: "aprobada", estrellas: { gte: 4 }, comentario: { not: null } },
      take: 6
    });
    expect(r[0]).toMatchObject({ comentario: "Me encantó", productoNombre: "Polo", nombreMostrado: "Ana G." });
    expect(r[0]).not.toHaveProperty("pedidoId");
    expect(r[0]).not.toHaveProperty("authUserId");
  });
});
