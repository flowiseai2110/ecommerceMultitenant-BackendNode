import { jest } from "@jest/globals";

// Prisma, config, logger y Resend simulados (mismo patrón que libro.service.test.js).
const db = {
  tienda_configuraciones: { findUnique: jest.fn(), upsert: jest.fn() },
  reservas: { findMany: jest.fn() },
  tiendas: { findUnique: jest.fn() }
};
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: db, Prisma: {}, default: db }));
const config = { platform: { baseDomain: "ecompyme.com", storefrontUrl: "http://localhost:4200/" }, resend: {}, resenas: {} };
jest.unstable_mockModule("../../../config/index.js", () => ({ default: config, config }));
jest.unstable_mockModule("../../../config/logger.js", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
const sendTransactionalEmail = jest.fn();
jest.unstable_mockModule("../../../services/email.service.js", () => ({
  sendTransactionalEmail,
  escapeHtml: (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}));
jest.unstable_mockModule("../../resenas/resenas.service.js", () => ({
  urlTienda: (slug, ruta) => `https://${slug}.ecompyme.com/${ruta}`
}));

const { agruparPorEmail, comunicadoEmail, iniciarEnvio, linkAbsoluto, rangoLima, MAX_RANGO_DIAS } = await import("../comunicados.email.js");

describe("rangoLima", () => {
  it("abarca días completos de Lima, con hasta inclusivo", () => {
    const { inicio, fin } = rangoLima("2026-10-12", "2026-10-15");
    expect(inicio.toISOString()).toBe("2026-10-12T05:00:00.000Z");
    expect(fin.toISOString()).toBe("2026-10-16T05:00:00.000Z");
  });

  it("acepta un solo día y rechaza rangos invertidos o demasiado largos", () => {
    expect(() => rangoLima("2026-10-12", "2026-10-12")).not.toThrow();
    expect(() => rangoLima("2026-10-15", "2026-10-12")).toThrow("igual o posterior");
    expect(() => rangoLima("2026-01-01", "2026-12-31")).toThrow(`${MAX_RANGO_DIAS} días`);
  });
});

describe("agruparPorEmail", () => {
  const reserva = (email, producto, extra = {}) => ({
    inicio: new Date("2026-10-12T19:00:00Z"),
    fin: new Date("2026-10-14T17:00:00Z"),
    titularNombres: "Ana",
    producto: { nombre: producto },
    pedido: { clienteEmail: email, clienteNombre: "Ana P.", numeroPedido: "R-1" },
    ...extra
  });

  it("un correo por persona (sin distinguir mayúsculas) con todas sus reservas", () => {
    const grupos = agruparPorEmail([reserva("Ana@Mail.pe", "Suite"), reserva("ana@mail.pe ", "Doble"), reserva("luis@mail.pe", "Simple")]);
    expect(grupos).toHaveLength(2);
    expect(grupos[0]).toMatchObject({ email: "ana@mail.pe", nombre: "Ana" });
    expect(grupos[0].reservas.map((r) => r.producto)).toEqual(["Suite", "Doble"]);
  });

  it("ignora reservas sin email", () => {
    expect(agruparPorEmail([reserva(null, "Suite"), reserva("  ", "Doble")])).toEqual([]);
  });
});

describe("comunicadoEmail", () => {
  const tienda = { nombre: "Hotel <Sol>", slug: "hotel-sol", email: "hola@sol.pe" };
  const destinatario = { email: "ana@mail.pe", nombre: "Ana", reservas: [{ producto: "Suite", inicio: "2026-10-12T19:00:00Z", fin: "2026-10-14T17:00:00Z", numero: "R-1" }] };
  const comunicado = { titulo: "Sauna <b>cerrado</b>", mensaje: "Línea 1\nLínea <script>2</script>", boton: null };

  it("escapa todo el contenido del dueño y respeta los saltos de línea", () => {
    const { subject, html } = comunicadoEmail({ comunicado, tienda, destinatario });
    expect(subject).toBe("Sauna <b>cerrado</b> · Hotel <Sol>"); // el asunto es texto plano
    expect(html).not.toContain("<script>");
    expect(html).toContain("Sauna &lt;b&gt;cerrado&lt;/b&gt;");
    expect(html).toContain("Hotel &lt;Sol&gt;");
    expect(html.match(/Línea/g)).toHaveLength(2);
    expect(html).toContain("esta reserva");
    expect(html).toContain("R-1");
  });

  it("lleva el botón con link absoluto a la tienda", () => {
    const { html } = comunicadoEmail({ comunicado: { ...comunicado, boton: { texto: "Ver política", link: "/paginas/politicas" } }, tienda, destinatario });
    expect(html).toContain("Ver política");
    expect(html).toMatch(/href="https?:\/\/[^"]*hotel-sol[^"]*paginas\/politicas"/);
  });
});

describe("linkAbsoluto", () => {
  it("deja igual un https y vuelve absoluta una ruta interna", () => {
    expect(linkAbsoluto("https://wa.me/51999", "x")).toBe("https://wa.me/51999");
    expect(linkAbsoluto("/paginas/x", "mi-tienda")).toMatch(/mi-tienda.*\/paginas\/x$/);
  });
});

describe("iniciarEnvio", () => {
  const TIENDA = "11111111-1111-4111-8111-111111111111";
  const CID = "00000000-0000-4000-8000-000000000001";
  const comunicado = { id: CID, titulo: "Sauna cerrado", mensaje: "Del 12 al 15", boton: null, version: 1 };
  const reserva = (email) => ({
    inicio: new Date("2026-10-12T19:00:00Z"), fin: new Date("2026-10-14T17:00:00Z"), titularNombres: "Ana",
    producto: { nombre: "Suite" }, pedido: { clienteEmail: email, clienteNombre: null, numeroPedido: "R-1" }
  });
  let guardada;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    guardada = [comunicado];
    db.tienda_configuraciones.findUnique.mockImplementation(async () => ({ valor: guardada }));
    db.tienda_configuraciones.upsert.mockImplementation(async ({ update }) => { guardada = update.valor; });
    db.tiendas.findUnique.mockResolvedValue({ nombre: "Hotel Sol", slug: "hotel-sol", email: "hola@sol.pe" });
    sendTransactionalEmail.mockResolvedValue({ success: true });
  });

  afterEach(() => jest.useRealTimers());

  it("marca el envío, manda un correo por persona y registra el resultado", async () => {
    db.reservas.findMany.mockResolvedValue([reserva("ana@mail.pe"), reserva("luis@mail.pe"), reserva("ANA@mail.pe")]);
    sendTransactionalEmail.mockRejectedValueOnce(new Error("Resend caído"));

    const envio = await iniciarEnvio(TIENDA, CID, { desde: "2026-10-12", hasta: "2026-10-15" }, { email: "dueno@sol.pe" });
    expect(envio).toMatchObject({ estado: "enviando", cantidad: 2, enviadoPor: "dueno@sol.pe" });
    expect(guardada[0].emailEnvio.estado).toBe("enviando");

    await jest.runAllTimersAsync();
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(2);
    expect(sendTransactionalEmail.mock.calls[1][0]).toMatchObject({ to: "luis@mail.pe", replyTo: "hola@sol.pe" });
    expect(guardada[0].emailEnvio).toMatchObject({ estado: "enviado", cantidad: 2, fallidos: 1 });

    // Solo reservas vigentes de la tienda que se cruzan con el rango.
    const { where } = db.reservas.findMany.mock.calls[0][0];
    expect(where.tiendaId).toBe(TIENDA);
    expect(where.pedido.estado.in).toEqual(expect.arrayContaining(["confirmada", "solicitada"]));
    expect(where.pedido.estado.in).not.toContain("cancelada");
  });

  it("no envía dos veces el mismo comunicado", async () => {
    guardada = [{ ...comunicado, emailEnvio: { estado: "enviado" } }];
    await expect(iniciarEnvio(TIENDA, CID, { desde: "2026-10-12", hasta: "2026-10-15" }, {})).rejects.toThrow("ya se envió");
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("sin reservas en el rango responde 400 y no marca nada", async () => {
    db.reservas.findMany.mockResolvedValue([]);
    await expect(iniciarEnvio(TIENDA, CID, { desde: "2026-10-12", hasta: "2026-10-15" }, {})).rejects.toThrow("No hay clientes");
    expect(db.tienda_configuraciones.upsert).not.toHaveBeenCalled();
  });

  it("comunicado inexistente → 404", async () => {
    await expect(iniciarEnvio(TIENDA, "00000000-0000-4000-8000-000000000999", { desde: "2026-10-12", hasta: "2026-10-15" }, {})).rejects.toThrow("no encontrado");
  });
});
