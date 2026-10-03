/**
 * Jerga peruana → términos del catálogo, por rubro de la tienda
 * (modules/tenants/rubros.js). Amplía la consulta de buscar_productos antes
 * del full-text search: "zapas pa correr" busca también "zapatillas".
 *
 * Se AGREGAN términos, no se reemplazan: el FTS combina con OR y ordena por
 * cuántos coinciden, así que si el catálogo sí usa la jerga ("chompa"), lo
 * sigue encontrando. Sin LLM ni embeddings.
 *
 * Los cambios al glosario los revisa una persona (spec: «nada se automodifica»).
 *
 * @see docs/specs/agente-ventas/spec.md — R10.
 */

// Vale para todas las tiendas.
const COMUN = {
  zapas: "zapatillas",
  tabas: "zapatillas zapatos",
  cel: "celular",
  celu: "celular",
  regalito: "regalo"
};

const POR_RUBRO = {
  moda: {
    chimpunes: "chimpunes futbol",
    chompa: "chompa sueter",
    casaca: "casaca chaqueta",
    buzo: "buzo jogger",
    polo: "polo camiseta",
    polera: "polera poleron",
    ojotas: "sandalias",
    jean: "jean pantalon",
    blusita: "blusa",
    vestidito: "vestido",
    gorrito: "gorro"
  },
  tecnologia: {
    audis: "audifonos",
    audifonos: "audifonos auriculares",
    lap: "laptop",
    compu: "computadora laptop",
    parlante: "parlante altavoz",
    smartwatch: "smartwatch reloj",
    cargador: "cargador cable"
  },
  belleza: {
    rimel: "rimel mascara pestañas",
    labial: "labial",
    perfume: "perfume fragancia",
    bloqueador: "bloqueador protector solar"
  },
  alimentos: {
    chela: "cerveza",
    chelas: "cerveza",
    gaseosa: "gaseosa bebida",
    keke: "keke queque"
  },
  mascotas: {
    perrito: "perro",
    michi: "gato",
    gatito: "gato",
    croquetas: "croquetas alimento comida"
  },
  hogar: {
    terma: "terma calentador",
    refri: "refrigeradora",
    cubrecama: "cubrecama edredon",
    tapete: "tapete alfombra"
  }
};

// Muletillas que no describen el producto: con el OR del FTS solo meten ruido.
const MULETILLAS = new Set([
  "pe", "pes", "ps", "causa", "bacan", "chevere", "porfa", "xfa", "oe", "nomas",
  "pa", "pal", "q", "xq", "plis", "pls"
]);

function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string} consulta - El `query` que armó el modelo.
 * @param {string|null} [rubro] - Rubro de la tienda; null o desconocido = solo lo común.
 * @returns {string} Consulta sin muletillas y con los equivalentes agregados.
 */
export function expandirConsulta(consulta, rubro = null) {
  const glosario = { ...COMUN, ...(POR_RUBRO[rubro] ?? {}) };
  // Se conservan las palabras con tilde ("clásica"): el parecido por typo
  // compara contra los nombres del catálogo, que sí las tienen. Solo se
  // normaliza para comparar con el glosario y las muletillas.
  const palabras = String(consulta ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(p => p && !MULETILLAS.has(normalizar(p)));

  const resultado = [...palabras];
  const presentes = new Set(palabras.map(normalizar));
  for (const p of palabras) {
    for (const extra of (glosario[normalizar(p)] ?? "").split(" ").filter(Boolean)) {
      if (!presentes.has(extra)) {
        resultado.push(extra);
        presentes.add(extra);
      }
    }
  }
  return resultado.join(" ");
}
