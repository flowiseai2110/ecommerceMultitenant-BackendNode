import { jest } from "@jest/globals";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: {}, default: {} }));
const { FUENTES } = await import("../../traducciones/fuentes.js");

/**
 * Contratos de idiomas que se verifican leyendo el código (docs/specs/idiomas,
 * diseno.md "Contratos"). Fallan cuando alguien agrega algo que rompe la regla,
 * aunque los demás tests pasen.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CARPETAS = ["modules", "routes", "services", "middlewares", "kernel", "jobs", "controllers"];

function* archivos(dir) {
  let entradas;
  try { entradas = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entradas) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "__tests__" && e.name !== "node_modules") yield* archivos(ruta); }
    else if (e.name.endsWith(".js")) yield ruta;
  }
}
const codigo = [...CARPETAS.flatMap((c) => [...archivos(join(RAIZ, c))])]
  .map((ruta) => ({ rel: relative(RAIZ, ruta).split(sep).join("/"), texto: readFileSync(ruta, "utf8") }));
/** Sin comentarios: una mención en un comentario no cuenta. */
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

describe("contrato 2: cada fuente traducible se muestra traducida en la tienda", () => {
  // Fuentes que la tienda recibe por otra vía, con su motivo.
  const POR_OTRA_VIA = {
    textos: "los textos fijos llegan armados en GET /store/textos (idiomas/textos.service.js)"
  };

  it.each(Object.keys(FUENTES))("%s se pasa por localizar/localizado fuera de traducciones/", (nombre) => {
    if (POR_OTRA_VIA[nombre]) return;
    const usos = codigo.filter((a) => !a.rel.startsWith("modules/traducciones/")
      && new RegExp(`\\bFUENTES\\.${nombre}\\b`).test(sinComentarios(a.texto)));
    expect(usos.map((a) => a.rel)).not.toEqual([]);
  });
});

/** Comparar contra un código de idioma ("en", 'es'…), o los viejos `enIngles` y `lang ===`. */
const patronIdioma = /(===|!==)\s*["'](es|en|qu|ay|pt|agr)["']|["'](es|en|qu|ay|pt|agr)["']\s*(===|!==)|enIngles|\blang\s*===/;

describe("contrato 3: ningún código pregunta por un idioma concreto (salvo modules/idiomas)", () => {
  it("el test lee el código de verdad y su patrón detecta lo que había antes", () => {
    expect(codigo.length).toBeGreaterThan(100);
    for (const viejo of ['req.query.lang === "en" ? "en" : "es"', 'r.idiomaHuesped === "en"', "const enIngles = (r) => r"]) {
      expect(patronIdioma.test(viejo)).toBe(true);
    }
  });

  it("sin comparaciones contra un código de idioma", () => {
    const malos = codigo
      .filter((a) => !a.rel.startsWith("modules/idiomas/"))
      .flatMap((a) => sinComentarios(a.texto).split("\n").map((l, i) => (patronIdioma.test(l) ? `${a.rel}:${i + 1}  ${l.trim()}` : null)))
      .filter(Boolean);
    expect(malos).toEqual([]);
  });
});

describe("contrato 6: la IA de traducción solo corre cuando el dueño la pide", () => {
  it("solo la ruta \"Traducir con IA\" del admin llama a traducirPendientes; nadie más llama a traducirTextos", () => {
    const usos = (fn) => codigo.filter((a) => new RegExp(`\\b${fn}\\(`).test(sinComentarios(a.texto))).map((a) => a.rel).sort();
    expect(usos("traducirPendientes")).toEqual(["modules/traducciones/traducciones.admin.routes.js", "modules/traducciones/traducciones.service.js"]);
    expect(usos("traducirTextos")).toEqual(["modules/traducciones/traducciones.service.js", "modules/traducciones/traducir-ia.js"]);
  });

  it("no existe un disparo al guardar (traducirTrasGuardar / programarTraduccion)", () => {
    const malos = codigo.filter((a) => /traducirTrasGuardar|programarTraduccion/.test(sinComentarios(a.texto))).map((a) => a.rel);
    expect(malos).toEqual([]);
  });
});
