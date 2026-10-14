import { jest } from "@jest/globals";

jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: {}, default: {} }));
const { leerCatalogo, planDeCarga, sincronizarClavesAlIniciar } = await import("../claves.service.js");
const { GRUPOS_TEXTOS } = await import("../grupos.js");
const { DATOS } = await import("../../negocio/datos.js");
const { extraerClavesServidor } = await import("../claves-servidor.js");
const { readFileSync } = await import("node:fs");

// docs/specs/idiomas D8 · diseno.md B8 · contrato 5
describe("catálogo de textos fijos", () => {
  const catalogo = leerCatalogo();

  it("trae las claves de la tienda, sin repetidas y con un grupo conocido", () => {
    expect(catalogo.length).toBeGreaterThan(300);
    expect(new Set(catalogo.map((c) => c.clave)).size).toBe(catalogo.length);
    expect(catalogo.every((c) => GRUPOS_TEXTOS.includes(c.grupo))).toBe(true);
  });

  it("todo grupo con claves lo muestra al menos un rubro (si no, nadie lo traduciría)", () => {
    const usados = new Set(Object.values(DATOS).flatMap((d) => d.gruposTextos));
    const huerfanos = [...new Set(catalogo.map((c) => c.grupo))].filter((g) => !usados.has(g));
    expect(huerfanos).toEqual([]);
  });

  it.each(Object.keys(DATOS))("%s declara sus grupos: incluye comun y todos existen", (rubro) => {
    const g = DATOS[rubro].gruposTextos;
    expect(g).toContain("comun");
    expect(g.every((x) => GRUPOS_TEXTOS.includes(x))).toBe(true);
  });
});

describe("claves del servidor (marcadas con clave())", () => {
  it("claves-servidor.json está al día: si falla, corre `node scripts/claves-servidor.mjs`", () => {
    const enArchivo = JSON.parse(readFileSync(new URL("../claves/claves-servidor.json", import.meta.url), "utf8"));
    expect(enArchivo).toEqual(extraerClavesServidor());
  });
});

describe("plan de carga", () => {
  const existentes = [
    { clave: "Buscar", grupo: "comun", obsoleta: false },
    { clave: "Noches", grupo: "comun", obsoleta: false },
    { clave: "Vieja", grupo: "comun", obsoleta: false },
    { clave: "Volvió", grupo: "hotel", obsoleta: true },
    { clave: "Ya obsoleta", grupo: "comun", obsoleta: true }
  ];
  const catalogo = [
    { clave: "Buscar", grupo: "comun" },
    { clave: "Noches", grupo: "hotel" },
    { clave: "Volvió", grupo: "hotel" },
    { clave: "Agregar al carrito", grupo: "productos" }
  ];

  it("crea las nuevas, actualiza grupo o reactiva, y marca obsoletas las que ya no están", () => {
    expect(planDeCarga(existentes, catalogo)).toEqual({
      crear: [{ clave: "Agregar al carrito", grupo: "productos" }],
      actualizar: [{ clave: "Noches", grupo: "hotel" }, { clave: "Volvió", grupo: "hotel" }],
      obsoletas: ["Vieja"]
    });
  });

  it("si la tabla ya refleja el catálogo, no hay nada que hacer", () => {
    const iguales = catalogo.map((c) => ({ ...c, obsoleta: false }));
    expect(planDeCarga(iguales, catalogo)).toEqual({ crear: [], actualizar: [], obsoletas: [] });
  });
});

describe("al arrancar el backend", () => {
  it("si la base falla, no lanza: el servidor arranca igual", async () => {
    // El prisma de este test no tiene textos_claves: la consulta revienta.
    await expect(sincronizarClavesAlIniciar()).resolves.toBeUndefined();
  });
});
