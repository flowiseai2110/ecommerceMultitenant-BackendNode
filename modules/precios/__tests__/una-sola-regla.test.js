import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Fitness function "una sola función de precio" (ADR-0001.1; docs/specs/campanas-descuento,
// impacto "Patrones"). Fuera de modules/precios/ nadie decide un precio comparando la
// oferta con el precio base: se llama a precioVigente. Y el dinero se cobra con una
// lectura fresca de las promociones (R5.2, CA-5.8).

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const CARPETAS = ["modules", "services", "routes", "utils", "controllers", "repositories", "jobs", "kernel", "validators"];

// oferta <op> base, base <op> oferta, `oferta || base`, `oferta ?? base` (camelCase o snake_case), en una línea.
const OFERTA = "precio_?[oO]ferta";
const BASE = "precio_?[bB]ase";
const PATRON = new RegExp(
  `${OFERTA}[^;\\n]{0,60}(?:[<>]=?|\\|\\||\\?\\?)[^;\\n]{0,60}${BASE}|${BASE}[^;\\n]{0,60}[<>]=?[^;\\n]{0,60}${OFERTA}`
);

/** archivo → motivo. Comparaciones que no deciden el precio que se cobra. */
const PERMITIDAS = {};

function archivos(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === "node_modules" || e.name === "__tests__" || e.name.startsWith(".")) return [];
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return archivos(ruta);
    return e.name.endsWith(".js") ? [ruta] : [];
  });
}

const leer = (rel) => readFileSync(join(RAIZ, rel), "utf8");

describe("una sola regla de precio (fitness)", () => {
  test("el patrón detecta el cálculo copiado", () => {
    expect("CASE WHEN p.precio_oferta > 0 AND p.precio_oferta < p.precio_base THEN".match(PATRON)).not.toBeNull();
    expect("const precio = p.precioOferta || p.precioBase;".match(PATRON)).not.toBeNull();
    expect("p.precio_base * (100 - 20) / 100 <= 200".match(PATRON)).toBeNull();
  });

  test("fuera de modules/precios/ nadie compara la oferta con el precio base", () => {
    const encontrados = CARPETAS.flatMap((c) => archivos(join(RAIZ, c)))
      .map((f) => relative(RAIZ, f).split(sep).join("/"))
      .filter((rel) => !rel.startsWith("modules/precios/") && !PERMITIDAS[rel])
      .filter((rel) => PATRON.test(leer(rel)));
    expect(encontrados).toEqual([]);
  });

  test("cotizar y crear el pedido piden el contexto sin caché", () => {
    const fuente = leer("modules/ordenes/crear-pedido.js");
    expect(fuente).toMatch(/contextoDePrecios\([^)]*conCache:\s*false/);
    expect(fuente).not.toMatch(/conCache:\s*true/);
  });
});
