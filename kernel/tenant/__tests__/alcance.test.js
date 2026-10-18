import { readFileSync } from "node:fs";
import { ALCANCE, MOTIVO_GLOBAL } from "../alcance.js";

// Test de contrato del registro ALCANCE (docs/specs/antipatrones A1.3): todo
// modelo con tiendaId está clasificado. Si alguien agrega una tabla de tienda y
// no la clasifica, este test falla en vez de quedar sin filtro automático.

const schema = readFileSync(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");

/** Modelos del schema con un campo `tiendaId`. */
function modelosConTiendaId() {
  const modelos = new Set();
  let actual = null;
  for (const linea of schema.split("\n")) {
    const inicio = linea.match(/^model\s+(\w+)\s*\{/);
    if (inicio) actual = inicio[1];
    else if (/^\}/.test(linea)) actual = null;
    else if (actual && /^\s+tiendaId\s/.test(linea)) modelos.add(actual);
  }
  return modelos;
}

const conTiendaId = modelosConTiendaId();

describe("ALCANCE (contrato)", () => {
  test("lee los modelos del schema", () => {
    expect(conTiendaId.size).toBeGreaterThan(50);
  });

  test("todo modelo con tiendaId está clasificado", () => {
    const sinClasificar = [...conTiendaId].filter((m) => !(m in ALCANCE));
    expect(sinClasificar).toEqual([]);
  });

  test("no hay modelos en ALCANCE que ya no existan o no tengan tiendaId", () => {
    const sobrantes = Object.keys(ALCANCE).filter((m) => !conTiendaId.has(m));
    expect(sobrantes).toEqual([]);
  });

  test("solo usa valores conocidos", () => {
    const desconocidos = Object.entries(ALCANCE).filter(([, a]) => !["tienda", "global"].includes(a));
    expect(desconocidos).toEqual([]);
  });

  test("cada modelo global declara su motivo", () => {
    const globales = Object.keys(ALCANCE).filter((m) => ALCANCE[m] === "global");
    expect(globales.filter((m) => !MOTIVO_GLOBAL[m]?.trim())).toEqual([]);
    expect(Object.keys(MOTIVO_GLOBAL).filter((m) => ALCANCE[m] !== "global")).toEqual([]);
  });
});
