import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { precioVigente, redondearCentimos, aCentimos, aSoles } from "../precio-vigente.js";

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
