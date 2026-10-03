import { jest } from "@jest/globals";
import express from "express";

// Controller del asesor (docs/specs/agente-ventas/spec.md, R7–R8): respuesta
// SSE, pase a persona por pedido explícito o por fallos seguidos, y
// recuperación de la conversación. Servicio, BD y consumo simulados.

jest.unstable_mockModule("../../../generated/prisma/client.ts", () => ({ Prisma: {}, PrismaClient: class {} }));
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: {}, Prisma: {}, default: {} }));

const responderTurno = jest.fn();
jest.unstable_mockModule("../agente.service.js", () => ({ responderTurno }));

const conversacion = { id: "c1", turnos: 0, fallos: 0 };
const guardarTurno = jest.fn().mockResolvedValue();
const obtenerConversacionActiva = jest.fn();
const listarMensajes = jest.fn();
jest.unstable_mockModule("../agente.conversaciones.js", () => ({
  obtenerConversacion: jest.fn(async () => ({ ...conversacion })),
  obtenerConversacionActiva,
  cargarHistorial: jest.fn().mockResolvedValue([]),
  listarMensajes,
  guardarTurno
}));

const conConsulta = jest.fn(async (tiendaId, tipo, fn) => ({ resultado: await fn() }));
jest.unstable_mockModule("../../consumo-ia/consumo-ia.service.js", () => ({ conConsulta, sumarUso: jest.fn() }));

jest.unstable_mockModule("../tools/buscar-productos.js", () => ({
  obtenerFacetas: jest.fn().mockResolvedValue({
    categorias: [{ id: "1", nombre: "Hombre", categoriaPadreId: null }, { id: "2", nombre: "Running", categoriaPadreId: "1" }],
    colores: [],
    opciones: []
  })
}));

const { responder, responderStream, recuperarConversacion } = await import("../agente.controller.js");
const { validate } = await import("../../../middlewares/validation.middleware.js");
const { conversacionQuerySchema } = await import("../agente.schema.js");
const { errorHandler } = await import("../../../middlewares/error.middleware.js");
const { QuotaExceededError } = await import("../../../utils/errors.js");

const TIENDA = "8f14e45f-ceea-467a-9a36-dedd4bea2543";
const TOKEN = "3b241101-e2bb-4255-8caf-4136c566a962";
const producto = { id: "p1", nombre: "Running", slug: "running", precioBase: 150, precioOferta: null, stock: 2 };

let server;
let baseUrl;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  // Simula resolveTienda; el header decide si la tienda tiene WhatsApp.
  app.use((req, res, next) => {
    req.tiendaId = TIENDA;
    req.tienda = { id: TIENDA, nombre: "Zap", whatsappNumero: req.get("x-sin-whatsapp") ? null : "987654321" };
    next();
  });
  app.post("/mensajes", responder);
  app.post("/stream", responderStream);
  app.get("/conversacion", validate({ query: conversacionQuerySchema }), recuperarConversacion);
  app.use(errorHandler);
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
});

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(conversacion, { turnos: 0, fallos: 0 });
});

const post = (ruta, mensaje, headers = {}) => fetch(`${baseUrl}${ruta}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify({ sessionToken: TOKEN, mensaje })
});

/** Parsea un cuerpo SSE en [[evento, data], …]. */
function eventosSSE(cuerpo) {
  return cuerpo.trim().split("\n\n").map(bloque => {
    const evento = bloque.match(/^event: (.+)$/m)[1];
    const data = JSON.parse(bloque.match(/^data: (.+)$/m)[1]);
    return [evento, data];
  });
}

describe("POST /stream (SSE)", () => {
  it("emite productos y texto en vivo, y cierra con fin", async () => {
    responderTurno.mockImplementation(async ({ emisor }) => {
      emisor.productos([producto]);
      emisor.texto("Te recomiendo ");
      emisor.texto("la Running.");
      return { mensaje: "Te recomiendo la Running.", productos: [producto], uso: {}, senales: {} };
    });

    const res = await post("/stream", "zapatillas running");
    const eventos = eventosSSE(await res.text());

    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toContain("no-transform");
    expect(eventos.map(([e]) => e)).toEqual(["productos", "texto", "texto", "fin"]);
    expect(eventos[0][1].productos[0]).toMatchObject({ id: "p1", disponible: true });
    expect(eventos.at(-1)[1]).toMatchObject({
      code: "AGENTE_RESPUESTA",
      mensaje: "Te recomiendo la Running.",
      ofrecerPersona: false
    });
  });

  it("una cuota agotada llega como evento error 402, sin cifras", async () => {
    conConsulta.mockRejectedValueOnce(new QuotaExceededError("Usaste 100 de 100 consultas"));

    const eventos = eventosSSE(await (await post("/stream", "zapatillas")).text());

    expect(eventos).toEqual([["error", {
      status: 402,
      code: "QUOTA_EXCEEDED",
      message: "El asesor no está disponible por ahora."
    }]]);
  });

  it("un saludo responde fin directo, sin LLM", async () => {
    const eventos = eventosSSE(await (await post("/stream", "hola")).text());

    expect(eventos).toHaveLength(1);
    expect(eventos[0][1].sugerencias).toEqual(["Hombre"]);
    expect(responderTurno).not.toHaveBeenCalled();
  });
});

describe("pase a persona", () => {
  it("«quiero hablar con una persona» → plantilla, sin LLM ni consulta", async () => {
    const { data } = await (await post("/mensajes", "quiero hablar con una persona")).json();

    expect(data.ofrecerPersona).toBe(true);
    expect(data.mensaje).toContain("Hablar con una persona");
    expect(conConsulta).not.toHaveBeenCalled();
  });

  it("sin WhatsApp en la tienda no ofrece el botón", async () => {
    const { data } = await (await post("/mensajes", "quiero hablar con una persona", { "x-sin-whatsapp": "1" })).json();

    expect(data.ofrecerPersona).toBe(false);
    expect(data.mensaje).toContain("contacto");
  });

  it("con el segundo fallo seguido lo ofrece", async () => {
    conversacion.fallos = 1;
    responderTurno.mockResolvedValue({
      mensaje: "No tengo eso.", productos: [], uso: {}, senales: { busquedasSinResultados: 1, errorHerramienta: false }
    });

    const { data } = await (await post("/mensajes", "polos rojos")).json();

    expect(data.ofrecerPersona).toBe(true);
    expect(guardarTurno.mock.calls[0][0].fallo).toBe("sumar");
  });

  it("un turno con productos reinicia el contador", async () => {
    conversacion.fallos = 1;
    responderTurno.mockResolvedValue({
      mensaje: "Mira esta.", productos: [producto], uso: {}, senales: { busquedasSinResultados: 0, errorHerramienta: false }
    });

    const { data } = await (await post("/mensajes", "zapatillas")).json();

    expect(data.ofrecerPersona).toBe(false);
    expect(guardarTurno.mock.calls[0][0].fallo).toBe("reiniciar");
  });

  it("los mensajes sin sentido también cuentan como fallo", async () => {
    conversacion.fallos = 1;
    const { data } = await (await post("/mensajes", "jjjjjj")).json();
    expect(data.ofrecerPersona).toBe(true);
  });
});

describe("GET /conversacion", () => {
  it("devuelve los mensajes de la conversación activa", async () => {
    obtenerConversacionActiva.mockResolvedValue({ id: "c1" });
    listarMensajes.mockResolvedValue([{ rol: "user", contenido: "hola" }, { rol: "assistant", contenido: "¡Hola!" }]);

    const { data } = await (await fetch(`${baseUrl}/conversacion?sessionToken=${TOKEN}`)).json();

    expect(data.mensajes).toHaveLength(2);
    expect(listarMensajes).toHaveBeenCalledWith(TIENDA, "c1");
  });

  it("sin conversación activa devuelve vacío y no crea una", async () => {
    obtenerConversacionActiva.mockResolvedValue(null);

    const { data } = await (await fetch(`${baseUrl}/conversacion?sessionToken=${TOKEN}`)).json();

    expect(data.mensajes).toEqual([]);
    expect(listarMensajes).not.toHaveBeenCalled();
  });
});
