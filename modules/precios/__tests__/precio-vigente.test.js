import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { precioVigente, precioPublico, porcentajeDescuento, redondearCentimos, aCentimos, aSoles } from "../precio-vigente.js";

// La regla única de precio (docs/specs/precio-en-servidor, ADR-0001 punto 1). En céntimos.
const prod = (precioBase, precioOferta = null) => ({ precioBase, precioOferta });

describe("precioVigente", () => {
  it("sin oferta: el precio base", () => {
    expect(precioVigente(prod("250.00"))).toEqual({ unitario: 25000, regular: 25000, origen: "regular" });
  });

  it("oferta menor que el base: la oferta, con el base como regular", () => {
    expect(precioVigente(prod("250.00", "180.00"))).toEqual({ unitario: 18000, regular: 25000, origen: "oferta" });
  });

  it("oferta igual o mayor al base se ignora", () => {
    expect(precioVigente(prod(250, 250)).origen).toBe("regular");
    expect(precioVigente(prod(250, 300))).toEqual({ unitario: 25000, regular: 25000, origen: "regular" });
  });

  it("oferta 0 o null se ignora", () => {
    expect(precioVigente(prod(250, 0)).unitario).toBe(25000);
    expect(precioVigente(prod(250, null)).unitario).toBe(25000);
  });

  it("variante con precio propio y producto en oferta: el precio de la variante (D3)", () => {
    expect(precioVigente(prod(250, 180), { precio: "300.00" })).toEqual({ unitario: 30000, regular: 30000, origen: "regular" });
  });

  it("variante con precio null o 0: el del producto (con su oferta)", () => {
    expect(precioVigente(prod(250, 180), { precio: null })).toEqual({ unitario: 18000, regular: 25000, origen: "oferta" });
    expect(precioVigente(prod(250, 180), { precio: 0 }).unitario).toBe(18000);
  });

  it("céntimos: 3 × 19.90 = 59.70 sin error de coma flotante", () => {
    expect(aSoles(precioVigente(prod("19.90")).unitario * 3)).toBe(59.7);
    expect(aCentimos(19.99)).toBe(1999);
  });
});

describe("precioVigente con promociones de campaña (campanas-descuento C3a)", () => {
  const hasta = new Date("2026-12-01T05:00:00Z");
  const promo = (porcentaje, extra = {}) => ({
    campanaId: `c-${porcentaje}`, nombre: `Campaña ${porcentaje}`, porcentaje, hasta, orden: 0,
    permitirCupones: false, permitirEnvioGratis: true,
    alcance: { tipo: "tienda", elegidas: [], categoriaIds: new Set(), productoIds: new Set() }, ...extra
  });
  const ctx = (...promociones) => ({ promociones });

  it("sin promociones: idéntico a P1", () => {
    expect(precioVigente(prod(250, 180), null, ctx())).toEqual({ unitario: 18000, regular: 25000, origen: "oferta" });
  });

  it("20 % sobre S/ 100 → S/ 80, con la campaña (CA-5.3)", () => {
    expect(precioVigente(prod(100), null, ctx(promo(20)))).toEqual({
      unitario: 8000, regular: 10000, origen: "campana",
      campana: { id: "c-20", nombre: "Campaña 20", porcentaje: 20, hasta, permitirCupones: false, permitirEnvioGratis: true }
    });
  });

  it("gana el mayor descuento entre oferta y promoción (CA-5.4)", () => {
    expect(precioVigente(prod(100, 70), null, ctx(promo(20))).origen).toBe("oferta");
    expect(precioVigente(prod(100, 90), null, ctx(promo(20))).unitario).toBe(8000);
  });

  it("empate oferta = promoción → la oferta (E8)", () => {
    expect(precioVigente(prod(100, 80), null, ctx(promo(20)))).toEqual({ unitario: 8000, regular: 10000, origen: "oferta" });
  });

  it("empate entre promociones → la de menor orden", () => {
    const a = promo(20, { campanaId: "a", orden: 0 });
    const b = promo(20, { campanaId: "b", orden: 1 });
    expect(precioVigente(prod(100), null, ctx(a, b)).campana.id).toBe("a");
  });

  it("sobre el precio de la variante (CA-5.6): S/ 150 → 120; y 19,99 → 15,99", () => {
    expect(precioVigente(prod(250, 180), { precio: "150.00" }, ctx(promo(20))).unitario).toBe(12000);
    expect(precioVigente(prod("19.99"), null, ctx(promo(20))).unitario).toBe(1599);
  });

  it("nunca menos de S/ 0,01 (R4.9)", () => {
    expect(precioVigente(prod("0.01"), null, ctx(promo(90))).unitario).toBe(1);
  });

  it("una promoción que no cubre al producto no cuenta", () => {
    const otra = promo(50, { alcance: { tipo: "productos", elegidas: [], categoriaIds: new Set(), productoIds: new Set(["otro"]) } });
    expect(precioVigente({ id: "este", precioBase: 100 }, null, ctx(otra)).origen).toBe("regular");
  });
});

describe("precioPublico", () => {
  it("en soles, con el porcentaje sobre el regular y la campaña sin datos internos", () => {
    const promocion = {
      campanaId: "bf", nombre: "Black Friday", porcentaje: 20, orden: 0, hasta: new Date("2026-12-01T05:00:00Z"),
      permitirCupones: true, permitirEnvioGratis: false,
      alcance: { tipo: "tienda", elegidas: [], categoriaIds: new Set(), productoIds: new Set() }
    };
    expect(precioPublico(prod(100), null, { promociones: [promocion] })).toEqual({
      vigente: 80, regular: 100, origen: "campana", porcentaje: 20,
      campana: { id: "bf", nombre: "Black Friday", hasta: "2026-12-01T00:00:00-05:00" }
    });
    expect(precioPublico(prod(250, 180))).toEqual({ vigente: 180, regular: 250, origen: "oferta", porcentaje: 28, campana: null });
    expect(porcentajeDescuento({ unitario: 100, regular: 100 })).toBe(0);
  });
});

describe("redondearCentimos", () => {
  it("19.99 con 20 % = 15.99", () => {
    expect(aSoles(1999 - redondearCentimos(1999 * 20 / 100))).toBe(15.99);
  });

  it("mitad hacia arriba", () => {
    expect(redondearCentimos(12.5)).toBe(13);
    expect(redondearCentimos(12.4999999999)).toBe(13);
    expect(redondearCentimos(12.49)).toBe(12);
  });
});

describe("modules/precios no toca la BD", () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..");
  // El cargador (*.service.js) recibe la transacción; la regla no importa Prisma.
  it.each(readdirSync(dir).filter((f) => f.endsWith(".js")))("%s no importa Prisma", (f) => {
    expect(readFileSync(join(dir, f), "utf8")).not.toMatch(/config\/prisma|generated\/prisma|@prisma/);
  });
});
