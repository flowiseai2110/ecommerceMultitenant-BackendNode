import { jest } from "@jest/globals";
import express from "express";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Errores centralizados (docs/specs/antipatrones A2). Las rutas no envuelven su
// cuerpo en try/catch: con Express 5 una promesa rechazada (o un throw) llega
// sola a errorHandler. Aquí se fija que el código y el estado HTTP son los mismos
// que con el envoltorio, y que el envoltorio no vuelve a aparecer.

class PrismaClientKnownRequestError extends Error {
  constructor(message, { code, meta }) { super(message); this.code = code; this.meta = meta; }
}
class PrismaClientValidationError extends Error {}
jest.unstable_mockModule("../../generated/prisma/client.ts", () => ({
  Prisma: { PrismaClientKnownRequestError, PrismaClientValidationError }
}));

const { errorHandler } = await import("../error.middleware.js");
const { NotFoundError, ConflictError, ForbiddenError } = await import("../../utils/errors.js");

const CASOS = [
  { ruta: "/no-encontrado", error: () => new NotFoundError("Reserva"), status: 404, code: "NOT_FOUND" },
  { ruta: "/conflicto", error: () => new ConflictError("Ya existe"), status: 409, code: "CONFLICT" },
  { ruta: "/prohibido", error: () => new ForbiddenError(), status: 403, code: "FORBIDDEN" },
  {
    ruta: "/prisma-duplicado",
    error: () => new PrismaClientKnownRequestError("dup", { code: "P2002", meta: { target: ["slug"] } }),
    status: 409, code: "DUPLICATE_RECORD"
  },
  {
    ruta: "/prisma-no-existe",
    error: () => new PrismaClientKnownRequestError("nf", { code: "P2025", meta: {} }),
    status: 404, code: "RECORD_NOT_FOUND"
  },
  { ruta: "/inesperado", error: () => new Error("boom"), status: 500, code: "INTERNAL_SERVER_ERROR" }
];

let server;
let baseUrl;

beforeAll(async () => {
  const app = express();
  for (const c of CASOS) {
    // async sin try/catch: el rechazo lo lleva Express 5
    app.get(`/async${c.ruta}`, async () => { await Promise.resolve(); throw c.error(); });
    // throw síncrono
    app.get(`/sync${c.ruta}`, () => { throw c.error(); });
    // el envoltorio de antes, como referencia
    app.get(`/envuelto${c.ruta}`, async (req, res, next) => {
      try { await Promise.resolve(); throw c.error(); } catch (error) { next(error); }
    });
  }
  app.use(errorHandler);
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
});

async function pedir(ruta) {
  const res = await fetch(`${baseUrl}${ruta}`);
  return { status: res.status, code: (await res.json()).code };
}

describe("errorHandler sin try/catch en la ruta (A2.1, A2.3)", () => {
  test.each(CASOS)("$ruta → $status $code, igual que con el envoltorio", async ({ ruta, status, code }) => {
    const envuelto = await pedir(`/envuelto${ruta}`);
    expect(envuelto).toEqual({ status, code });
    expect(await pedir(`/async${ruta}`)).toEqual(envuelto);
    expect(await pedir(`/sync${ruta}`)).toEqual(envuelto);
  });
});

describe("rutas sin el envoltorio try/catch → next (A2.4)", () => {
  const raiz = fileURLToPath(new URL("../../", import.meta.url));

  function archivosDeRutas(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      if (e.name === "node_modules" || e.name === "__tests__" || e.name.startsWith(".")) return [];
      const ruta = join(dir, e.name);
      return e.isDirectory() ? archivosDeRutas(ruta) : e.name.endsWith(".routes.js") ? [ruta] : [];
    });
  }

  // `catch (e) { next(e); }` o `return next(e)`: el catch no hace nada más.
  const ENVOLTORIO = /catch\s*\((\w+)\)\s*\{\s*(?:return\s+)?next\(\1\);?\s*\}/;

  test("ningún *.routes.js reenvía el error a mano", () => {
    const archivos = ["modules", "routes"].flatMap((d) => archivosDeRutas(join(raiz, d)));
    expect(archivos.length).toBeGreaterThan(40);
    const conEnvoltorio = archivos.filter((f) => ENVOLTORIO.test(readFileSync(f, "utf8"))).map((f) => relative(raiz, f));
    expect(conEnvoltorio).toEqual([]);
  });
});
