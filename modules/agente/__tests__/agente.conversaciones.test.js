import { jest } from "@jest/globals";

// El cliente generado por Prisma es .ts (Jest no lo parsea): se simulan solo
// los métodos que usa agente.conversaciones.js.
const prisma = {
  agente_conversaciones: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  agente_mensajes: { findMany: jest.fn(), createMany: jest.fn() },
  $transaction: jest.fn(async (ops) => ops)
};
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma, Prisma: {}, default: prisma }));

const { default: config } = await import("../../../config/index.js");
const { recortarHistorial, obtenerConversacion, cargarHistorial, guardarTurno } =
  await import("../agente.conversaciones.js");

const TIENDA = "8f14e45f-ceea-467a-9a36-dedd4bea2543";
const TOKEN = "3b241101-e2bb-4255-8caf-4136c566a962";

const u = (contenido) => ({ rol: "user", contenido });
const a = (contenido) => ({ rol: "assistant", contenido });

beforeEach(() => jest.clearAllMocks());

describe("recortarHistorial", () => {
  it("devuelve los últimos N mensajes en orden cronológico", () => {
    const mensajes = [u("1"), a("2"), u("3"), a("4"), u("5"), a("6")];
    expect(recortarHistorial(mensajes, 4)).toEqual([u("3"), a("4"), u("5"), a("6")]);
  });

  it("descarta respuestas del asesor al inicio: el primer turno debe ser del cliente", () => {
    const mensajes = [u("1"), a("2"), u("3"), a("4")];
    expect(recortarHistorial(mensajes, 3)).toEqual([u("3"), a("4")]);
  });

  it("devuelve vacío si no hay mensajes del cliente", () => {
    expect(recortarHistorial([], 10)).toEqual([]);
    expect(recortarHistorial([a("hola")], 10)).toEqual([]);
  });

  it("no filtra campos extra hacia el LLM", () => {
    expect(recortarHistorial([{ rol: "user", contenido: "x", id: "1" }], 10)).toEqual([u("x")]);
  });
});

describe("obtenerConversacion", () => {
  it("reutiliza la conversación activa de la sesión dentro de la ventana de inactividad", async () => {
    prisma.agente_conversaciones.findFirst.mockResolvedValue({ id: "c1", turnos: 3 });
    const ahora = new Date("2026-10-02T15:00:00Z");

    const conv = await obtenerConversacion(TIENDA, TOKEN, ahora);

    expect(conv).toEqual({ id: "c1", turnos: 3 });
    const { where } = prisma.agente_conversaciones.findFirst.mock.calls[0][0];
    expect(where).toMatchObject({ tiendaId: TIENDA, sessionToken: TOKEN, estado: "activa" });
    const limite = ahora.getTime() - config.agente.inactividadMin * 60 * 1000;
    expect(where.ultimaActividad.gte.getTime()).toBe(limite);
    expect(prisma.agente_conversaciones.create).not.toHaveBeenCalled();
  });

  it("abre una conversación nueva si no hay una activa (o venció)", async () => {
    prisma.agente_conversaciones.findFirst.mockResolvedValue(null);
    prisma.agente_conversaciones.create.mockResolvedValue({ id: "c2", turnos: 0 });

    const conv = await obtenerConversacion(TIENDA, TOKEN);

    expect(conv).toEqual({ id: "c2", turnos: 0 });
    expect(prisma.agente_conversaciones.create.mock.calls[0][0].data)
      .toMatchObject({ tiendaId: TIENDA, sessionToken: TOKEN });
  });
});

describe("cargarHistorial", () => {
  it("lee de la BD scoped a la tienda y lo devuelve en orden cronológico", async () => {
    // findMany viene ordenado del más nuevo al más viejo.
    prisma.agente_mensajes.findMany.mockResolvedValue([a("4"), u("3"), a("2"), u("1")]);

    const historial = await cargarHistorial(TIENDA, "c1");

    expect(historial).toEqual([u("1"), a("2"), u("3"), a("4")]);
    const args = prisma.agente_mensajes.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ tiendaId: TIENDA, conversacionId: "c1" });
    expect(args.take).toBe(config.agente.maxHistorial);
  });
});

describe("guardarTurno", () => {
  it("guarda mensaje y respuesta con fechas distintas y suma un turno", async () => {
    // Fecha en el futuro: aunque Date.now() sea menor, la respuesta va después.
    const inicio = new Date(Date.now() + 60_000);

    await guardarTurno({ tiendaId: TIENDA, conversacionId: "c1", mensaje: "hola", respuesta: "¡Hola!", inicio });

    const [user, asistente] = prisma.agente_mensajes.createMany.mock.calls[0][0].data;
    expect(user).toMatchObject({ tiendaId: TIENDA, rol: "user", contenido: "hola", fechaRegistro: inicio });
    expect(asistente).toMatchObject({ tiendaId: TIENDA, rol: "assistant", contenido: "¡Hola!" });
    expect(asistente.fechaRegistro.getTime()).toBeGreaterThan(inicio.getTime());

    const update = prisma.agente_conversaciones.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: "c1" });
    expect(update.data.turnos).toEqual({ increment: 1 });
  });
});
