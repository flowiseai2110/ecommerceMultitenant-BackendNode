import { createPedidoSchema } from "../pedidos.schema.js";

// Pedido mínimo válido; cada test le agrega el comprobante.
const base = {
  tiendaId: "8f14e45f-ceea-467a-9a36-dedd4bea2543",
  cliente: { nombre: "Ana", whatsappNumero: "987654321" },
  detalles: [{ productoNombre: "Polo", cantidad: 1, precioUnitario: 30 }]
};

const parse = (comprobante) => createPedidoSchema.safeParse({ ...base, comprobante });
const mensajes = (r) => r.error.issues.map(i => i.message);

const factura = {
  tipo: "factura", docTipo: "RUC", docNumero: "20123456789",
  razonSocial: "Comercial Andina S.A.C.", direccionFiscal: "Av. Arequipa 123, Lima"
};

describe("createPedidoSchema — comprobante", () => {
  it("sin comprobante sigue siendo un pedido válido (pedidos de antes del cambio)", () => {
    expect(createPedidoSchema.safeParse(base).success).toBe(true);
  });

  it("acepta boleta sin documento (el mínimo de S/ 700 lo valida el servicio)", () => {
    expect(parse({ tipo: "boleta" }).success).toBe(true);
  });

  it("acepta boleta con DNI de 8 dígitos o CE", () => {
    expect(parse({ tipo: "boleta", docTipo: "DNI", docNumero: "12345678" }).success).toBe(true);
    expect(parse({ tipo: "boleta", docTipo: "CE", docNumero: "001234567" }).success).toBe(true);
  });

  it("rechaza un DNI con formato inválido", () => {
    const r = parse({ tipo: "boleta", docTipo: "DNI", docNumero: "1234" });
    expect(r.success).toBe(false);
    expect(mensajes(r)).toContain("Número de documento inválido");
  });

  it("acepta factura completa con RUC 10 o 20", () => {
    expect(parse(factura).success).toBe(true);
    expect(parse({ ...factura, docNumero: "10456789012" }).success).toBe(true);
  });

  it("la factura solo exige el RUC: razón social y dirección salen de SUNAT", () => {
    const r = parse({ tipo: "factura" });
    expect(r.success).toBe(false);
    expect(mensajes(r)).toEqual(["La factura requiere RUC"]);
    expect(parse({ tipo: "factura", docTipo: "RUC", docNumero: "20100047218" }).success).toBe(true);
  });

  it("rechaza RUC con prefijo inválido o factura con DNI", () => {
    expect(parse({ ...factura, docNumero: "30123456789" }).success).toBe(false);
    expect(parse({ ...factura, docTipo: "DNI", docNumero: "12345678" }).success).toBe(false);
  });
});
