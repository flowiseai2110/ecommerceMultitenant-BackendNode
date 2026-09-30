import { createPedidoSchema } from "../pedidos.schema.js";

// Pedido mínimo válido; cada test le agrega campos de destino.
const base = {
  tiendaId: "8f14e45f-ceea-467a-9a36-dedd4bea2543",
  cliente: { nombre: "Ana", whatsappNumero: "987654321" },
  detalles: [{ productoNombre: "Polo", cantidad: 1, precioUnitario: 30 }],
  metodoEnvio: "Shalom"
};

const parse = (destino) => createPedidoSchema.safeParse({ ...base, ...destino });

describe("createPedidoSchema — destino de entrega", () => {
  it("conserva el destino de recojo en agencia (courier)", () => {
    const r = parse({ courier: "Shalom", agenciaTexto: "Agencia Shalom Av. Arequipa 123 — Lince" });

    expect(r.success).toBe(true);
    expect(r.data.courier).toBe("Shalom");
    expect(r.data.agenciaTexto).toBe("Agencia Shalom Av. Arequipa 123 — Lince");
  });

  it("conserva el destino a domicilio con ubigeo y pin del mapa", () => {
    const r = parse({
      departamento: "Lima", provincia: "Lima", distrito: "Miraflores", ubigeoCode: "150122",
      referencia: "Frente al parque", latitud: -12.1211, longitud: -77.0297
    });

    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({
      distrito: "Miraflores", ubigeoCode: "150122", referencia: "Frente al parque",
      latitud: -12.1211, longitud: -77.0297
    });
  });

  it("sin destino (recojo en tienda) deja todos los campos en null", () => {
    const r = parse({});

    expect(r.success).toBe(true);
    for (const campo of ["courier", "agenciaTexto", "distrito", "ubigeoCode", "referencia", "latitud", "longitud"]) {
      expect(r.data[campo] ?? null).toBeNull();
    }
  });

  it("recorta el texto largo en vez de rechazar el pedido", () => {
    const r = parse({ agenciaTexto: "x".repeat(5000), courier: "c".repeat(80) });

    expect(r.success).toBe(true);
    expect(r.data.agenciaTexto).toHaveLength(2000);
    expect(r.data.courier).toHaveLength(50);
  });

  it("normaliza espacios y convierte texto vacío en null", () => {
    const r = parse({ referencia: "   ", distrito: "  Surco  " });

    expect(r.success).toBe(true);
    expect(r.data.referencia).toBeNull();
    expect(r.data.distrito).toBe("Surco");
  });

  it("descarta coordenadas fuera de rango o no numéricas sin rechazar el pedido", () => {
    const r = parse({ latitud: 123, longitud: "abc" });

    expect(r.success).toBe(true);
    expect(r.data.latitud).toBeNull();
    expect(r.data.longitud).toBeNull();
  });

  it("un destino raro no oculta errores reales del pedido", () => {
    const r = createPedidoSchema.safeParse({ ...base, detalles: [], agenciaTexto: "x".repeat(5000) });

    expect(r.success).toBe(false);
  });
});
