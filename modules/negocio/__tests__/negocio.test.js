import { jest } from "@jest/globals";

// Reglas por rubro (docs/specs/perfil-negocio): contrato, registro y prepararProducto.
// La BD se simula: el rubro sale de tiendas.tipo_negocio, nunca del request.
const PrismaStub = { PrismaClientKnownRequestError: class extends Error {}, PrismaClientValidationError: class extends Error {} };
const findUnique = jest.fn();
jest.unstable_mockModule("../../../generated/prisma/client.ts", () => ({ Prisma: PrismaStub, PrismaClient: class {} }));
jest.unstable_mockModule("../../../config/prisma.js", () => ({
  prisma: { tiendas: { findUnique } }, Prisma: PrismaStub, default: {}
}));

const { CONTRATO, faltantesDelContrato } = await import("../contrato.js");
const { ESTRATEGIAS, estrategiaDe, tiendaDe, invalidarRubrosCache } = await import("../registro.js");
const { prepararProductoDelRubro, requiereCapacidad } = await import("../negocio.middleware.js");
const { createProductoSchema } = await import("../../catalogo/productos.schema.js");
const { TIPOS_NEGOCIO } = await import("../../tenants/tiendas.schema.js");
const { MAQUINAS, transicionar } = await import("../../reservas/estados.js");
const { DTO_POR_TIPO } = await import("../../reservas/reservas.serializer.js");
const { CORREO_POR_TIPO } = await import("../../reservas/reservas.emails.js");

const TIENDA = "22222222-2222-4222-8222-222222222222";
const base = { tiendaId: TIENDA, nombre: "Matrimonial", slug: "matrimonial" };
const errorDe = (fn) => { try { fn(); } catch (e) { return e; } return null; };

describe("contrato", () => {
  it("hay una estrategia por cada tipo de negocio", () => {
    expect(Object.keys(ESTRATEGIAS).sort()).toEqual([...TIPOS_NEGOCIO].sort());
  });

  it.each(Object.keys(ESTRATEGIAS))("%s cumple el contrato", (tipo) => {
    expect(faltantesDelContrato(ESTRATEGIAS[tipo])).toEqual([]);
  });

  it("detecta lo que falta", () => {
    expect(faltantesDelContrato({})).toEqual(expect.arrayContaining([...CONTRATO, "carrito", "recibeReservas", "diseno.secciones", "agente", "dashboard", "reservas"]));
    // Dashboard por rubro (docs/specs/dashboard-por-rubro DR2): lista no vacía de widgets.
    expect(faltantesDelContrato({ ...ESTRATEGIAS.productos, dashboard: [] })).toEqual(["dashboard"]);
    expect(faltantesDelContrato({ ...ESTRATEGIAS.productos, dashboard: [{}] })).toEqual(["dashboard"]);
    const completo = { ...ESTRATEGIAS.productos, reservas: { este: "x" } };
    expect(faltantesDelContrato(completo)).toEqual(["reservas.cotizar", "reservas.tipoPedido"]);
    const hookMal = { ...ESTRATEGIAS.hotel, reservas: { ...ESTRATEGIAS.hotel.reservas, alAceptar: true } };
    expect(faltantesDelContrato(hookMal)).toEqual(["reservas.alAceptar"]);
  });

  it("capacidades por rubro", () => {
    const con = (c) => Object.keys(ESTRATEGIAS).filter((t) => ESTRATEGIAS[t][c]);
    expect(con("carrito")).toEqual(["productos"]);
    expect(con("recibeReservas")).toEqual(["hotel", "tours", "eventos", "locales", "canchas"]);
    expect(con("planDePagos")).toEqual(["locales"]);
    expect(con("transmisiones")).toEqual(["eventos"]);
    expect(con("alquilerPorHoras")).toEqual(["canchas"]);
    expect(con("marcas")).toEqual(["productos"]);
    expect(Object.keys(ESTRATEGIAS).filter((t) => ESTRATEGIAS[t].agente)).toEqual(["hotel", "tours", "eventos", "locales"]);
  });

  it("solo productos no recibe reservas; cada rubro de reservas tiene su vertical", () => {
    expect(ESTRATEGIAS.productos.reservas).toBeNull();
    expect(["hotel", "tours", "eventos", "locales", "canchas"].map((t) => ESTRATEGIAS[t].reservas.tipoPedido))
      .toEqual(["hotel", "tour", "evento", "local", "cancha"]);
    // Canchas mantiene la ocupación del horario en cada transición (alquiler-canchas R5).
    expect(typeof ESTRATEGIAS.canchas.reservas.alCambiarEstado).toBe("function");
    expect(typeof ESTRATEGIAS.locales.reservas.extraCotizacion).toBe("function");
    // Solo el hotel revisa algo al aceptar: el cupo (antipatrones A3.3).
    expect(Object.keys(ESTRATEGIAS).filter((t) => ESTRATEGIAS[t].reservas?.alAceptar)).toEqual(["hotel"]);
  });

  it("cada vertical tiene su máquina de estados; un tipo sin máquina es un error (antipatrones A3.4)", () => {
    const tipos = Object.values(ESTRATEGIAS).map((e) => e.reservas?.tipoPedido).filter(Boolean);
    expect(tipos.filter((t) => !MAQUINAS[t])).toEqual([]);
    expect(() => transicionar("solicitada", "aceptar", "xyz")).toThrow(/sin máquina/);
    expect(() => transicionar("solicitada", "aceptar")).toThrow(/sin máquina/);
  });

  it("cada tipo de reserva tiene su bloque en el DTO (antipatrones 3b)", () => {
    expect(Object.keys(DTO_POR_TIPO).sort()).toEqual(Object.keys(MAQUINAS).sort());
    expect(Object.values(DTO_POR_TIPO).every((d) => typeof d.base === "function")).toBe(true);
  });

  it("cada tipo de reserva tiene sus partes en los correos (antipatrones 3b)", () => {
    expect(Object.keys(CORREO_POR_TIPO).sort()).toEqual(Object.keys(MAQUINAS).sort());
    for (const c of Object.values(CORREO_POR_TIPO)) {
      expect([typeof c.voz, typeof c.detalle, typeof c.asuntoSolicitud, typeof c.avisaConsumos]).toEqual(["function", "function", "function", "boolean"]);
    }
  });
});

describe("estrategiaDe", () => {
  it("elige por el rubro de la tienda y cae en productos si es desconocido", () => {
    expect(estrategiaDe({ id: TIENDA, tipoNegocio: "hotel" })).toBe(ESTRATEGIAS.hotel);
    expect(estrategiaDe({ id: TIENDA, tipoNegocio: "xyz" })).toBe(ESTRATEGIAS.productos);
  });
});

describe("prepararProducto — productos (y tours, eventos, locales)", () => {
  const { prepararProducto } = ESTRATEGIAS.productos;

  it("exige el precio al crear", () => {
    const e = errorDe(() => prepararProducto({ ...base }, { modo: "crear" }));
    expect(e.statusCode ?? e.status).toBe(400);
    expect(e.details).toEqual({ body: { precioBase: ["El precio base es requerido"] } });
  });

  it("rechaza precio 0", () => {
    const e = errorDe(() => prepararProducto({ ...base, precioBase: 0 }, { modo: "crear" }));
    expect(e.details.body.precioBase).toEqual(["El precio base debe ser positivo"]);
  });

  it("al editar el precio es opcional, pero si viene debe ser positivo", () => {
    expect(prepararProducto({ nombre: "X" }, { modo: "editar" })).toEqual({ nombre: "X" });
    expect(errorDe(() => prepararProducto({ precioBase: 0 }, { modo: "editar" }))).not.toBeNull();
  });

  it.each(["tours", "eventos", "locales"])("%s usa la misma regla", (tipo) => {
    expect(ESTRATEGIAS[tipo].prepararProducto).toBe(ESTRATEGIAS.productos.prepararProducto);
  });
});

describe("prepararProducto — hotel", () => {
  const { prepararProducto } = ESTRATEGIAS.hotel;

  it("crea el tipo de habitación sin precio: queda en 0 hasta guardar la estadía", () => {
    expect(prepararProducto({ ...base }, { modo: "crear" })).toEqual({ ...base, precioBase: 0, precioOferta: null });
  });

  it("ignora un precio enviado al crear", () => {
    expect(prepararProducto({ ...base, precioBase: 99, precioOferta: 80 }, { modo: "crear" }))
      .toEqual({ ...base, precioBase: 0, precioOferta: null });
  });

  it("al editar no toca el precio (lo maneja la estadía)", () => {
    expect(prepararProducto({ nombre: "Doble", precioBase: 1, precioOferta: null }, { modo: "editar" }))
      .toEqual({ nombre: "Doble" });
  });
});

describe("createProductoSchema", () => {
  it("acepta crear sin precio (la regla la pone el rubro)", () => {
    expect(createProductoSchema.parse({ ...base }).precioBase).toBeUndefined();
    expect(createProductoSchema.parse({ ...base, precioBase: null }).precioBase).toBeUndefined();
    expect(createProductoSchema.parse({ ...base, precioBase: 0 }).precioBase).toBe(0);
  });

  it("rechaza precio negativo", () => {
    expect(createProductoSchema.safeParse({ ...base, precioBase: -1 }).success).toBe(false);
  });
});

describe("prepararProductoDelRubro (middleware)", () => {
  beforeEach(() => {
    findUnique.mockReset();
    invalidarRubrosCache();
  });

  const correr = (modo, body) => new Promise((resolve) => {
    const req = { tiendaId: TIENDA, body };
    prepararProductoDelRubro(modo)(req, {}, (err) => resolve({ err, body: req.body }));
  });

  it("toma el rubro de la BD, no del request", async () => {
    findUnique.mockResolvedValue({ id: TIENDA, tipoNegocio: "productos" });
    const { err } = await correr("crear", { ...base, tipoNegocio: "hotel" });
    expect(err?.details?.body?.precioBase).toEqual(["El precio base es requerido"]);
  });

  it("hotel: deja crear sin precio", async () => {
    findUnique.mockResolvedValue({ id: TIENDA, tipoNegocio: "hotel" });
    const { err, body } = await correr("crear", { ...base });
    expect(err).toBeUndefined();
    expect(body.precioBase).toBe(0);
  });

  it("cachea el rubro de la tienda", async () => {
    findUnique.mockResolvedValue({ id: TIENDA, tipoNegocio: "hotel" });
    await tiendaDe(TIENDA);
    await tiendaDe(TIENDA);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it("marca: productos la guarda; otro rubro la rechaza o la quita si viene vacía", async () => {
    const MARCA = "33333333-3333-4333-8333-333333333333";
    findUnique.mockResolvedValue({ id: TIENDA, tipoNegocio: "productos" });
    expect((await correr("editar", { marcaId: MARCA })).body).toEqual({ marcaId: MARCA });

    invalidarRubrosCache();
    findUnique.mockResolvedValue({ id: TIENDA, tipoNegocio: "tours" });
    const { err } = await correr("editar", { marcaId: MARCA });
    expect(err.details.body.marcaId).toEqual(["Este tipo de negocio no maneja marcas"]);
    const { err: sinError, body } = await correr("editar", { nombre: "X", marcaId: null });
    expect(sinError).toBeUndefined();
    expect(body).toEqual({ nombre: "X" });
  });

  it("requiereCapacidad: corta la ruta si el rubro no la tiene", async () => {
    const pasar = (tipo) => new Promise((resolve) => {
      invalidarRubrosCache();
      findUnique.mockResolvedValue({ id: TIENDA, tipoNegocio: tipo });
      requiereCapacidad("marcas")({ tiendaId: TIENDA }, {}, resolve);
    });
    expect(await pasar("productos")).toBeUndefined();
    expect((await pasar("hotel")).statusCode ?? (await pasar("hotel")).status).toBe(400);
  });

  it("tienda inexistente: 404", async () => {
    findUnique.mockResolvedValue(null);
    const { err } = await correr("crear", { ...base });
    expect(err.statusCode ?? err.status).toBe(404);
  });
});
