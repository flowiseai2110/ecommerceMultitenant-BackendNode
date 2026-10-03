import { ultimos4Digitos, nivelDeAcceso, serializarRastreo, NIVEL } from "../rastreo.js";

const DUENO = "6f1c2c0e-5b7a-4b1e-9f0e-2d7c1a3b4c5d";

const pedido = {
  id: "p1",
  numeroPedido: "PED-0007",
  estado: "enviado",
  estadoPago: "pagado",
  total: 199,
  direccionEnvio: "Av. Siempre Viva 742",
  notas: "Dejar con el portero",
  fechaRegistro: "2026-10-01T10:00:00Z",
  fechaConfirmado: "2026-10-01T11:00:00Z",
  fechaEntregado: null,
  cliente: { nombre: "Ana" },
  detalles: [{ id: "d1", productoNombre: "Zapatilla Running", cantidad: 1, total: 199 }],
  historialEstados: [
    { id: "h1", estado: "pendiente", notas: null, fechaRegistro: "2026-10-01T10:00:00Z" },
    { id: "h2", estado: "enviado", notas: "Ana, tu courier es Shalom", fechaRegistro: "2026-10-02T09:00:00Z" }
  ],
  clienteWhatsapp: "+51 987 654 821",
  authUserId: DUENO
};

describe("ultimos4Digitos", () => {
  it("ignora +, espacios y guiones", () => {
    expect(ultimos4Digitos("+51 987-654-821")).toBe("4821");
  });

  it("devuelve null sin WhatsApp o con menos de 4 dígitos", () => {
    expect(ultimos4Digitos(null)).toBeNull();
    expect(ultimos4Digitos("12a")).toBeNull();
  });
});

describe("nivelDeAcceso", () => {
  it("solo con el número: nivel público", () => {
    expect(nivelDeAcceso(pedido, {})).toBe(NIVEL.PUBLICO);
  });

  it("el dueño con sesión ve el detalle completo sin verificar", () => {
    expect(nivelDeAcceso(pedido, { authUserId: DUENO })).toBe(NIVEL.COMPLETO);
  });

  it("otro usuario con sesión no es el dueño: nivel público", () => {
    expect(nivelDeAcceso(pedido, { authUserId: "otro-usuario" })).toBe(NIVEL.PUBLICO);
  });

  it("un pedido de invitado (sin authUserId) no se abre con cualquier sesión", () => {
    expect(nivelDeAcceso({ ...pedido, authUserId: null }, { authUserId: DUENO })).toBe(NIVEL.PUBLICO);
  });

  it("los 4 dígitos correctos dan el detalle completo", () => {
    expect(nivelDeAcceso(pedido, { verificacion: "4821" })).toBe(NIVEL.COMPLETO);
  });

  it("dígitos incorrectos: 403 VERIFICACION_INVALIDA", () => {
    expect(() => nivelDeAcceso(pedido, { verificacion: "0000" }))
      .toThrow(expect.objectContaining({ statusCode: 403, code: "VERIFICACION_INVALIDA" }));
  });

  it("pedido sin WhatsApp: ningún código lo abre", () => {
    expect(() => nivelDeAcceso({ ...pedido, clienteWhatsapp: null }, { verificacion: "0000" }))
      .toThrow(expect.objectContaining({ code: "VERIFICACION_INVALIDA" }));
  });
});

describe("serializarRastreo", () => {
  it("nivel público: estado y fechas, sin datos personales, productos ni montos", () => {
    const r = serializarRastreo(pedido, NIVEL.PUBLICO);

    expect(r).toEqual({
      numeroPedido: "PED-0007",
      estado: "enviado",
      estadoPago: "pagado",
      fechaRegistro: "2026-10-01T10:00:00Z",
      fechaConfirmado: "2026-10-01T11:00:00Z",
      fechaEntregado: null,
      historialEstados: [
        { id: "h1", estado: "pendiente", fechaRegistro: "2026-10-01T10:00:00Z" },
        { id: "h2", estado: "enviado", fechaRegistro: "2026-10-02T09:00:00Z" }
      ],
      detalleCompleto: false,
      puedeVerificar: true
    });
  });

  it("nivel completo: todo el pedido, pero nunca el WhatsApp ni el authUserId", () => {
    const r = serializarRastreo(pedido, NIVEL.COMPLETO);

    expect(r.detalleCompleto).toBe(true);
    expect(r.direccionEnvio).toBe("Av. Siempre Viva 742");
    expect(r.detalles).toHaveLength(1);
    expect(r).not.toHaveProperty("clienteWhatsapp");
    expect(r).not.toHaveProperty("authUserId");
  });

  it("puedeVerificar es false si el pedido no tiene WhatsApp", () => {
    expect(serializarRastreo({ ...pedido, clienteWhatsapp: null }, NIVEL.PUBLICO).puedeVerificar).toBe(false);
  });
});
