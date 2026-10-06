import { jest } from "@jest/globals";

// Seed de carga (Fase 1): la barrera que impide correrlo contra producción y
// la coherencia de los datos generados con las reglas de la app.

const prismaStub = new Proxy({}, { get: () => ({}) });
jest.unstable_mockModule("../../../generated/prisma/client.ts", () => ({ Prisma: {}, PrismaClient: class {} }));
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: prismaStub, Prisma: {}, default: prismaStub }));

const { refDeBase, verificarDestino, REFS_PRODUCCION } = await import("../destino.js");
const { generarTienda, parsearRango } = await import("../generador.js");
const { COLORES_PRODUCTO } = await import("../../../modules/catalogo/productos.schema.js");
const { calcularRatingScore } = await import("../../../modules/resenas/resenas.service.js");

const PROD = REFS_PRODUCCION[0];
const POOLER = (ref) => `postgresql://postgres.${ref}:clave@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`;

describe("destino", () => {
  it("lee el ref del pooler, de la conexión directa y de un host cualquiera", () => {
    expect(refDeBase(POOLER("abc123"))).toBe("abc123");
    expect(refDeBase("postgresql://postgres:clave@db.xyz789.supabase.co:5432/postgres")).toBe("xyz789");
    expect(refDeBase("postgresql://yo:clave@localhost:5432/tienda")).toBe("localhost");
  });

  it("se niega con producción aunque se confirme", () => {
    expect(() => verificarDestino({ databaseUrl: POOLER(PROD), confirmar: PROD })).toThrow(/PRODUCCIÓN/);
  });

  it("se niega con NODE_ENV=production", () => {
    expect(() => verificarDestino({ databaseUrl: POOLER("staging1"), confirmar: "staging1", nodeEnv: "production" }))
      .toThrow(/production/);
  });

  it("exige confirmar exactamente el ref de la base", () => {
    expect(() => verificarDestino({ databaseUrl: POOLER("staging1") })).toThrow(/--confirmar-db staging1/);
    expect(() => verificarDestino({ databaseUrl: POOLER("staging1"), confirmar: "otro" })).toThrow(/--confirmar-db staging1/);
  });

  it("respeta la lista extra de prohibidos", () => {
    expect(() => verificarDestino({ databaseUrl: POOLER("otraprod"), confirmar: "otraprod", prohibidosExtra: "x, otraprod" }))
      .toThrow(/PRODUCCIÓN/);
  });

  it("acepta el proyecto de pruebas confirmado", () => {
    expect(verificarDestino({ databaseUrl: POOLER("staging1"), confirmar: "staging1" })).toBe("staging1");
  });
});

describe("parsearRango", () => {
  it("acepta N y MIN-MAX", () => {
    expect(parsearRango("45", "productos")).toEqual([45, 45]);
    expect(parsearRango("40-50", "productos")).toEqual([40, 50]);
  });

  it("rechaza formatos inválidos y rangos invertidos", () => {
    expect(() => parsearRango("abc", "productos")).toThrow(/--productos/);
    expect(() => parsearRango("50-40", "productos")).toThrow(/mínimo/);
  });
});

describe("generarTienda", () => {
  const AHORA = new Date("2026-10-05T12:00:00Z");
  const base = { prefijo: "carga", semilla: 42, productos: [40, 50], pedidos: [80, 120], dias: 180, ahora: AHORA };
  const tiendas = ["medias", "zapatillas", "ropa", "belleza", "mascotas"]
    .map((perfil, i) => generarTienda({ ...base, indice: i + 1, perfil }));

  it("es determinista: misma semilla e índice → mismos datos", () => {
    const otra = generarTienda({ ...base, indice: 1, perfil: "medias" });
    expect(otra).toEqual(tiendas[0]);
    expect(generarTienda({ ...base, indice: 2, perfil: "medias" }).tienda.id).not.toBe(tiendas[0].tienda.id);
  });

  it("respeta los rangos y el formato de slug", () => {
    tiendas.forEach((d, i) => {
      expect(d.tienda.slug).toBe(`carga-00${i + 1}`);
      expect(d.productos.length).toBeGreaterThanOrEqual(40);
      expect(d.productos.length).toBeLessThanOrEqual(50);
      expect(d.pedidos.length).toBeGreaterThanOrEqual(80);
      expect(d.pedidos.length).toBeLessThanOrEqual(120);
    });
  });

  it.each([0, 1, 2, 3, 4])("tienda %i: todas las referencias apuntan a filas de la misma tienda", (i) => {
    const d = tiendas[i];
    const tid = d.tienda.id;
    const productos = new Set(d.productos.map(p => p.id));
    const variantes = new Map(d.variantes.map(v => [v.id, v]));
    const categorias = new Set(d.categorias.map(c => c.id));
    const clientes = new Set(d.clientes.map(c => c.id));
    const pedidos = new Set(d.pedidos.map(p => p.id));

    for (const fila of [...d.categorias, ...d.productos, ...d.clientes, ...d.pedidos, ...d.resenas]) expect(fila.tiendaId).toBe(tid);
    for (const p of d.productos) expect(categorias.has(p.categoriaId)).toBe(true);
    for (const v of d.variantes) expect(productos.has(v.productoId)).toBe(true);
    for (const img of d.imagenes) expect(productos.has(img.productoId)).toBe(true);
    for (const p of d.pedidos) expect(clientes.has(p.clienteId)).toBe(true);
    for (const det of d.detalles) {
      expect(pedidos.has(det.pedidoId)).toBe(true);
      expect(productos.has(det.productoId)).toBe(true);
      if (det.varianteId) expect(variantes.get(det.varianteId).productoId).toBe(det.productoId);
    }
  });

  it.each([0, 1, 2, 3, 4])("tienda %i: cumple las restricciones únicas de la BD", (i) => {
    const d = tiendas[i];
    const unicos = (arr) => new Set(arr).size === arr.length;
    expect(unicos(d.clientes.map(c => c.whatsappNumero))).toBe(true); // uq_cliente_whatsapp
    expect(unicos(d.pedidos.map(p => p.numeroPedido))).toBe(true); // uq_numero_pedido
    expect(unicos(d.resenas.map(r => `${r.pedidoId}|${r.productoId}`))).toBe(true); // uq_resena_pedido_producto
    expect(unicos(d.productos.map(p => p.slug))).toBe(true);
  });

  it.each([0, 1, 2, 3, 4])("tienda %i: productos y variantes coherentes", (i) => {
    const d = tiendas[i];
    const porProducto = Map.groupBy(d.variantes, v => v.productoId);
    for (const p of d.productos) {
      const vs = porProducto.get(p.id) ?? [];
      expect(vs.length).toBeLessThanOrEqual(100);
      if (vs.length) {
        expect(p.stock).toBe(vs.reduce((s, v) => s + v.stock, 0));
        expect(p.metadata.opciones.length).toBeGreaterThan(0);
      }
      for (const c of p.colores) expect(COLORES_PRODUCTO).toContain(c);
      if (p.precioOferta !== null) expect(p.precioOferta).toBeLessThan(p.precioBase);
      expect(d.imagenes.filter(img => img.productoId === p.id && img.esPrincipal)).toHaveLength(1);
    }
  });

  it.each([0, 1, 2, 3, 4])("tienda %i: pedidos con totales, historial y fechas coherentes", (i) => {
    const d = tiendas[i];
    const detallesDe = Map.groupBy(d.detalles, x => x.pedidoId);
    const historialDe = Map.groupBy(d.historial, x => x.pedidoId);
    for (const p of d.pedidos) {
      const suma = detallesDe.get(p.id).reduce((s, x) => s + x.total, 0);
      expect(p.subtotal).toBeCloseTo(suma, 2);
      expect(p.total).toBeCloseTo(p.subtotal + p.costoEnvio, 2);
      const pasos = historialDe.get(p.id);
      expect(pasos[0].estado).toBe("pendiente");
      expect(pasos.at(-1).estado).toBe(p.estado);
      expect(p.fechaRegistro.getTime()).toBeLessThanOrEqual(AHORA.getTime());
      for (const h of pasos) expect(h.fechaRegistro.getTime()).toBeLessThanOrEqual(AHORA.getTime());
    }
  });

  it.each([0, 1, 2, 3, 4])("tienda %i: reseñas solo de compras entregadas y rating desnormalizado correcto", (i) => {
    const d = tiendas[i];
    const pedidos = new Map(d.pedidos.map(p => [p.id, p]));
    const lineas = new Set(d.detalles.map(x => `${x.pedidoId}|${x.productoId}`));
    for (const r of d.resenas) {
      expect(pedidos.get(r.pedidoId).estado).toBe("entregado");
      expect(lineas.has(`${r.pedidoId}|${r.productoId}`)).toBe(true);
      expect(r.estrellas).toBeGreaterThanOrEqual(1);
      expect(r.estrellas).toBeLessThanOrEqual(5);
      expect(r.fechaRegistro.getTime()).toBeLessThanOrEqual(AHORA.getTime());
    }
    const aprobadas = Map.groupBy(d.resenas.filter(r => r.estado === "aprobada"), r => r.productoId);
    for (const p of d.productos) {
      const lista = aprobadas.get(p.id) ?? [];
      const suma = lista.reduce((s, r) => s + r.estrellas, 0);
      expect(p.ratingCantidad).toBe(lista.length);
      expect(p.ratingScore).toBe(calcularRatingScore(suma, lista.length));
    }
  });

  it.each([0, 1, 2, 3, 4])("tienda %i: estadísticas de clientes = sus pedidos no cancelados", (i) => {
    const d = tiendas[i];
    const validos = Map.groupBy(d.pedidos.filter(p => p.estado !== "cancelado"), p => p.clienteId);
    for (const c of d.clientes) {
      const lista = validos.get(c.id) ?? [];
      expect(c.totalPedidos).toBe(lista.length);
      expect(c.totalGastado).toBeCloseTo(lista.reduce((s, p) => s + p.total, 0), 2);
    }
  });
});
