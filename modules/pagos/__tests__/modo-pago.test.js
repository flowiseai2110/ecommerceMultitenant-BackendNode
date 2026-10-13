import { jest } from "@jest/globals";

// Modo de pago de la tienda (docs/specs/pago-automatico R1, R2): qué falta para
// el automático y qué rige si la pasarela deja de estar lista.

const prisma = {
  tiendas: { findUnique: jest.fn(), update: jest.fn(async () => ({})) },
  tienda_pasarela_config: { findUnique: jest.fn() }
};
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma, Prisma: {}, default: prisma }));
const plataforma = { nombre: "culqi", requiereCredenciales: true };
jest.unstable_mockModule("../pasarela/provider-factory.js", () => ({
  proveedorPlataforma: () => plataforma.nombre,
  getProvider: () => ({ requiereCredenciales: plataforma.requiereCredenciales })
}));

const { faltantesPasarela, cambiarModo, configPublica, exigirManual } = await import("../modo-pago.service.js");

const LISTA = { llavePublica: "pk_test", llaveSecretaCifrada: "cifrada", activo: true };

beforeEach(() => {
  jest.clearAllMocks();
  plataforma.nombre = "culqi";
  plataforma.requiereCredenciales = true;
});

describe("faltantesPasarela", () => {
  test("sin proveedor de la plataforma falta todo", () => {
    expect(faltantesPasarela({ proveedor: null, requiereCredenciales: true, configTienda: null })).toEqual(["proveedor"]);
  });
  test("un proveedor sin credenciales (simulador) está listo", () => {
    expect(faltantesPasarela({ proveedor: "simulado", requiereCredenciales: false, configTienda: null })).toEqual([]);
  });
  test("con credenciales, dice qué falta", () => {
    expect(faltantesPasarela({ proveedor: "culqi", requiereCredenciales: true, configTienda: null }))
      .toEqual(["llavePublica", "llaveSecreta", "activo"]);
    expect(faltantesPasarela({ proveedor: "culqi", requiereCredenciales: true, configTienda: { ...LISTA, activo: false } }))
      .toEqual(["activo"]);
    expect(faltantesPasarela({ proveedor: "culqi", requiereCredenciales: true, configTienda: LISTA })).toEqual([]);
  });
});

test("no deja pasar a automático sin la pasarela lista (422 PASARELA_NO_LISTA)", async () => {
  prisma.tienda_pasarela_config.findUnique.mockResolvedValue(null);
  const error = await cambiarModo("t-1", "automatico").catch(e => e);
  expect(error.statusCode).toBe(422);
  expect(error.details).toMatchObject({ motivo: "PASARELA_NO_LISTA", faltan: ["llavePublica", "llaveSecreta", "activo"] });
  expect(prisma.tiendas.update).not.toHaveBeenCalled();
});

test("volver a manual siempre se puede", async () => {
  prisma.tiendas.findUnique.mockResolvedValue({ modoPago: "manual" });
  prisma.tienda_pasarela_config.findUnique.mockResolvedValue(null);
  await cambiarModo("t-1", "manual");
  expect(prisma.tiendas.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ modoPago: "manual" }) }));
});

test("la tienda ve el proveedor solo en automático y con la pasarela lista", async () => {
  prisma.tiendas.findUnique.mockResolvedValue({ modoPago: "automatico" });
  prisma.tienda_pasarela_config.findUnique.mockResolvedValue(LISTA);
  expect(await configPublica("t-1")).toMatchObject({ modo: "automatico", proveedor: "culqi", llavePublica: "pk_test", metodos: ["tarjeta", "yape"] });

  // Le borraron la llave: cobra en manual hasta que la complete.
  prisma.tienda_pasarela_config.findUnique.mockResolvedValue({ ...LISTA, llaveSecretaCifrada: null });
  expect(await configPublica("t-1")).toEqual({ modo: "manual", proveedor: null, llavePublica: null, metodos: [] });
});

test("con el simulador la tienda recibe dónde tokenizar", async () => {
  plataforma.nombre = "simulado";
  plataforma.requiereCredenciales = false;
  prisma.tiendas.findUnique.mockResolvedValue({ modoPago: "automatico" });
  expect(await configPublica("t-1")).toMatchObject({ modo: "automatico", proveedor: "simulado", urlTokens: "/simulador-pagos/tokens" });
});

test("en automático no se suben capturas (409 PAGO_AUTOMATICO)", async () => {
  plataforma.requiereCredenciales = false;
  prisma.tiendas.findUnique.mockResolvedValue({ modoPago: "automatico" });
  await expect(exigirManual("t-1")).rejects.toMatchObject({ statusCode: 409, details: { motivo: "PAGO_AUTOMATICO" } });
  prisma.tiendas.findUnique.mockResolvedValue({ modoPago: "manual" });
  await expect(exigirManual("t-1")).resolves.toBeUndefined();
});
