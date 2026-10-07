import { jest } from "@jest/globals";

// Sin red: fetch se simula.
const { esRucValido, consultarRuc, datosFactura } = await import("../ruc.service.js");

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

  it("503 si ninguna fuente responde", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("timeout"));
    await expect(consultarRuc("20555555556")).rejects.toMatchObject({ statusCode: 503 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("usa GitHub directo si jsDelivr falla", async () => {
    // 20601010101: prefijo sin trozo en caché, dígito verificador válido.
    const fila = ["20601010101", "EMPRESA DE PRUEBA SAC", "ACTIVO", "HABIDO", "SOCIEDAD ANONIMA CERRADA", "150101", "AV. LIMA 123", null, null, null];
    global.fetch = jest.fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(respuesta(200, { columns: COLUMNAS, records: [fila] }));
    await expect(consultarRuc("20601010101")).resolves.toMatchObject({ razonSocial: "EMPRESA DE PRUEBA SAC" });
    expect(fetch.mock.calls[0][0]).toMatch(/jsdelivr/);
    expect(fetch.mock.calls[1][0]).toMatch(/raw\.githubusercontent/);
  });
});

describe("datosFactura", () => {
  it("toma razón social y dirección del padrón, con distrito - provincia - departamento", async () => {
    await expect(datosFactura("20100047218")).resolves.toEqual({
      razonSocial: "BANCO DE CREDITO DEL PERU",
      direccionFiscal: "JR. CENTENARIO Nro. 156, La Molina - Lima - Lima",
      verificado: true
    });
  });

  it("rechaza un RUC dado de baja", async () => {
    await expect(datosFactura("20100001226")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rechaza un RUC que no figura en el padrón", async () => {
    global.fetch = jest.fn().mockResolvedValue(respuesta(404, null));
    // 20999999990: prefijo sin trozo en caché (el test de consultarRuc lo cacheó vacío).
    await expect(datosFactura("20999999990")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("con el padrón caído acepta el RUC sin verificar", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("timeout"));
    // 20444444445: prefijo nuevo, dígito verificador válido.
    await expect(datosFactura("20444444445")).resolves.toEqual({ razonSocial: null, direccionFiscal: null, verificado: false });
  });

  it("RUC sin domicilio en el padrón: dirección null", async () => {
    const sinDomicilio = ["10456789019", "PEREZ QUISPE JUAN", "ACTIVO", "HABIDO", "PERSONA NATURAL CON NEGOCIO", "-", "-", null, null, null];
    global.fetch = jest.fn().mockResolvedValue(respuesta(200, { columns: COLUMNAS, records: [sinDomicilio] }));
    await expect(datosFactura("10456789019")).resolves.toMatchObject({ razonSocial: "PEREZ QUISPE JUAN", direccionFiscal: null });
  });
});
