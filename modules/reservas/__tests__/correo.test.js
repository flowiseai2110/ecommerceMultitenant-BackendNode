import { jest } from "@jest/globals";

jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: {}, default: {} }));
const { enmascararCorreo } = await import("../reservas.serializer.js");

// Seguimiento (plantillas-por-rubro, parte 5): "confirmación enviada a a••@correo.com".
describe("enmascararCorreo", () => {
  it("deja la primera letra y el dominio", () => {
    expect(enmascararCorreo("ana@correo.com")).toBe("a••@correo.com");
    expect(enmascararCorreo("x@y.pe")).toBe("x••@y.pe");
  });
  it("sin correo válido no muestra nada", () => {
    expect(enmascararCorreo(null)).toBeNull();
    expect(enmascararCorreo("sin-arroba")).toBeNull();
  });
});
