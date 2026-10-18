import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Fitness function anti-identidad (docs/specs/antipatrones A3.6). El código común le
// pide algo a la estrategia del rubro (negocio/registro.js) o a la vertical de
// reservas; no pregunta `tipo === "hotel"`. Fuera de las carpetas de un solo rubro
// (modules/negocio/<rubro>/, modules/reservas/<rubro>/), toda comparación por rubro
// está declarada aquí:
//   - NO_ES_RUBRO: compara otra cosa.
//   - DEUDA: comparaciones por rubro conocidas, a corregir (pieza 3b). Solo baja: si
//     arreglas una, baja su número; si no coincide, el test falla.

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const CARPETAS = ["modules", "services", "jobs", "kernel", "middlewares", "routes", "utils", "config"];
const RUBROS = ["productos", "hotel", "tours", "eventos", "locales", "canchas"];
const DE_UN_RUBRO = [...RUBROS.map((r) => `modules/negocio/${r}/`), ...["hotel", "tours", "eventos", "locales", "canchas"].map((r) => `modules/reservas/${r}/`)];
const TIPOS = ["hotel", "tour", "evento", "local", "cancha", ...RUBROS];
const LIT = `["'\`](?:${TIPOS.join("|")})["'\`]`;
const PATRON = new RegExp(
  `\\b(?:tipo|tipoNegocio|tipoPedido)\\)?\\s*[!=]==?\\s*${LIT}|${LIT}\\s*[!=]==?\\s*[\\w.?!()]*\\b(?:tipo|tipoNegocio|tipoPedido)\\b|\\bes(?:Hotel|Tour|Evento|Local|Cancha|Productos)\\(`,
  "g"
);

/** archivo → [cuántas, motivo] */
const NO_ES_RUBRO = {};

/** archivo → cuántas. Vacía desde la pieza 3b: una comparación nueva por rubro no entra aquí, va a su rubro. */
const DEUDA = {};

function archivos(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === "node_modules" || e.name === "__tests__" || e.name.startsWith(".")) return [];
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return archivos(ruta);
    return e.name.endsWith(".js") && !e.name.endsWith(".test.js") ? [ruta] : [];
  });
}

function encontrados() {
  const out = {};
  for (const f of CARPETAS.flatMap((c) => archivos(join(RAIZ, c)))) {
    const rel = relative(RAIZ, f).split(sep).join("/");
    if (DE_UN_RUBRO.some((d) => rel.startsWith(d))) continue;
    const n = (readFileSync(f, "utf8").match(PATRON) ?? []).length;
    if (n) out[rel] = n;
  }
  return out;
}

describe("anti-identidad (antipatrones A3.6)", () => {
  const hay = encontrados();
  const declarado = (rel) => (NO_ES_RUBRO[rel]?.[0] ?? 0) + (DEUDA[rel] ?? 0);

  test("detecta las comparaciones por rubro", () => {
    expect("if (pedido.tipo === \"hotel\")".match(PATRON)).toHaveLength(1);
    expect("datos.tipoNegocio !== 'productos'".match(PATRON)).toHaveLength(1);
    expect("const x = esCancha(r);".match(PATRON)).toHaveLength(1);
    expect("s.tipo === 'imagen-texto'".match(PATRON)).toBeNull();
  });

  test("no hay comparaciones por rubro nuevas en código compartido", () => {
    const nuevas = Object.entries(hay).filter(([rel, n]) => n > declarado(rel)).map(([rel, n]) => `${rel}: ${n} (declaradas ${declarado(rel)})`);
    expect(nuevas).toEqual([]);
  });

  test("la deuda declarada coincide con el código (si arreglaste una, bájala aquí)", () => {
    const sobran = [...Object.keys(DEUDA), ...Object.keys(NO_ES_RUBRO)]
      .filter((rel) => (hay[rel] ?? 0) < declarado(rel)).map((rel) => `${rel}: ${hay[rel] ?? 0} (declaradas ${declarado(rel)})`);
    expect(sobran).toEqual([]);
  });
});
