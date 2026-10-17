import { jest } from "@jest/globals";

// Parámetros de la plataforma con la BD simulada.
delete process.env.CF_STREAM_TIMEOUT_SEG;

const prisma = { parametros_plataforma: { findMany: jest.fn(), upsert: jest.fn() } };
jest.unstable_mockModule("../../../generated/prisma/client.ts", () => ({ Prisma: {}, PrismaClient: class {} }));
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma, default: prisma }));

const { PARAMETROS, CLAVES } = await import("../parametros.registro.js");
const svc = await import("../parametros.service.js");

const admin = { id: "u1", email: "plataforma@test.com" };
const fila = (clave, valor, extra = {}) => ({ clave, valor, usuarioActualizacion: "plataforma@test.com", fechaActualizacion: new Date("2026-10-16T10:00:00Z"), ...extra });

beforeEach(() => {
  prisma.parametros_plataforma.findMany.mockReset().mockResolvedValue([]);
  prisma.parametros_plataforma.upsert.mockReset().mockResolvedValue({});
  svc.invalidarParametros();
});

describe("registro (contrato de cada parámetro)", () => {
  it.each(CLAVES)("%s tiene grupo, título, descripción, validación y un valor por defecto válido", (clave) => {
    const p = PARAMETROS[clave];
    expect(p.grupo).toEqual(expect.any(String));
    expect(p.titulo).toEqual(expect.any(String));
    expect(p.descripcion.length).toBeGreaterThan(20);
    expect(p.schema.safeParse(p.porDefecto()).success).toBe(true);
    expect(clave).toMatch(/^[a-z0-9_.]{1,60}$/);
  });

  it("la baja latencia viene activada y el timeout en 0 (el valor de Cloudflare)", () => {
    expect(PARAMETROS["transmision.baja_latencia"].porDefecto()).toBe(true);
    expect(PARAMETROS["transmision.timeout_segundos"].porDefecto()).toBe(0);
  });
});

describe("leer", () => {
  it("sin fila rige el valor por defecto; con fila, el guardado", async () => {
    expect(await svc.parametro("transmision.baja_latencia")).toBe(true);
    svc.invalidarParametros();
    prisma.parametros_plataforma.findMany.mockResolvedValue([fila("transmision.baja_latencia", false)]);
    expect(await svc.parametro("transmision.baja_latencia")).toBe(false);
  });

  it("un valor inválido en la BD (tocado a mano) cae al de por defecto", async () => {
    prisma.parametros_plataforma.findMany.mockResolvedValue([fila("transmision.timeout_segundos", "mucho")]);
    expect(await svc.parametro("transmision.timeout_segundos")).toBe(0);
  });

  it("si la BD falla, el de por defecto: un parámetro nunca frena el corte", async () => {
    prisma.parametros_plataforma.findMany.mockRejectedValue(new Error("sin conexión"));
    expect(await svc.parametro("transmision.baja_latencia")).toBe(true);
  });

  it("se cachea: dos lecturas seguidas consultan la BD una vez", async () => {
    await svc.parametro("transmision.baja_latencia");
    await svc.parametro("transmision.timeout_segundos");
    expect(prisma.parametros_plataforma.findMany).toHaveBeenCalledTimes(1);
  });

  it("una clave que no está en el registro es un error de programación", async () => {
    await expect(svc.parametro("transmision.no_existe")).rejects.toThrow(/registro/);
  });

  it("la lista para el admin trae descripción, valor, el de por defecto y quién lo cambió", async () => {
    prisma.parametros_plataforma.findMany.mockResolvedValue([fila("transmision.baja_latencia", false)]);
    const lista = await svc.listarParametros();
    expect(lista.map(p => p.clave)).toEqual(CLAVES);
    expect(lista[0]).toMatchObject({
      clave: "transmision.baja_latencia", valor: false, porDefecto: true, tipo: "boolean", cambiadoPor: "plataforma@test.com"
    });
  });
});

describe("cambiar", () => {
  it("valida con el registro, guarda quién lo cambió e invalida la caché", async () => {
    await svc.parametro("transmision.timeout_segundos"); // queda en caché
    prisma.parametros_plataforma.findMany.mockResolvedValue([fila("transmision.timeout_segundos", 60)]);
    const r = await svc.cambiarParametro("transmision.timeout_segundos", 60, admin);
    expect(prisma.parametros_plataforma.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { clave: "transmision.timeout_segundos" },
      update: expect.objectContaining({ valor: 60, usuarioActualizacion: "plataforma@test.com" })
    }));
    expect(r.valor).toBe(60);
    expect(await svc.parametro("transmision.timeout_segundos")).toBe(60);
  });

  it("rechaza un valor de otro tipo o fuera de rango, y una clave desconocida", async () => {
    await expect(svc.cambiarParametro("transmision.baja_latencia", "sí", admin)).rejects.toMatchObject({ statusCode: 400 });
    await expect(svc.cambiarParametro("transmision.timeout_segundos", -1, admin)).rejects.toMatchObject({ statusCode: 400 });
    await expect(svc.cambiarParametro("transmision.timeout_segundos", 2.5, admin)).rejects.toMatchObject({ statusCode: 400 });
    await expect(svc.cambiarParametro("otra.cosa", true, admin)).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.parametros_plataforma.upsert).not.toHaveBeenCalled();
  });
});
