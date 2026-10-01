import { jest } from "@jest/globals";

// Sin red: fetch se simula.
const { esRucValido, consultarRuc } = await import("../ruc.service.js");

const COLUMNAS = ["ruc", "razon_social", "estado", "condicion", "tipo_contribuyente", "ubigeo", "direccion", "departamento", "provincia", "distrito"];
const BCP = ["20100047218", "BANCO DE CREDITO DEL PERU", "ACTIVO", "HABIDO", "PERSONA JURIDICA", "150114", "JR. CENTENARIO Nro. 156", null, null, null];
const BAJA = ["20100001226", "ALTERNADORES S A", "BAJA DEFINITIVA", "HABIDO", "SOCIEDAD ANONIMA", "150101", "-", null, null, null];

const respuesta = (status, body) => ({ status, ok: status < 400, json: async () => body });

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue(respuesta(200, { prefix: "20100", columns: COLUMNAS, records: [BCP, BAJA] }));
});

describe("esRucValido", () => {
  it("acepta RUC con dígito verificador correcto", () => {
    expect(esRucValido("20100047218")).toBe(true);
    expect(esRucValido("20100001226")).toBe(true);
  });

  it("rechaza dígito verificador, prefijo o largo incorrectos", () => {
    expect(esRucValido("20100047219")).toBe(false);
    expect(esRucValido("30100047218")).toBe(false);
    expect(esRucValido("2010004721")).toBe(false);
  });
});

describe("consultarRuc", () => {
  it("devuelve los datos del padrón", async () => {
    const data = await consultarRuc("20100047218");
    expect(data).toMatchObject({
      razonSocial: "BANCO DE CREDITO DEL PERU",
      activo: true,
      habido: true,
      ubigeo: "150114",
      direccion: "JR. CENTENARIO Nro. 156"
    });
    expect(fetch.mock.calls[0][0]).toMatch(/\/20100\.json$/);
  });

  it("marca inactivo un RUC dado de baja y sin domicilio", async () => {
    const data = await consultarRuc("20100001226");
    expect(data).toMatchObject({ activo: false, direccion: null });
  });

  it("rechaza un RUC inválido sin consultar", async () => {
    await expect(consultarRuc("20100047219")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("404 si el RUC no figura en el padrón", async () => {
    global.fetch = jest.fn().mockResolvedValue(respuesta(404, null));
    // 20999999990: prefijo sin trozo en caché, dígito verificador válido.
    await expect(consultarRuc("20999999990")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("503 si el CDN no responde", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("timeout"));
    await expect(consultarRuc("20555555556")).rejects.toMatchObject({ statusCode: 503 });
  });
});
