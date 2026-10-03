/**
 * Distrito en texto libre ("Surco", "miraflores arequipa", "SJL") → código
 * UBIGEO INEI de 6 dígitos, para cotizar el envío desde el chat.
 *
 * Usa el mismo dataset que el checkout del storefront (peru-utils, offline,
 * 1801 distritos), así el código que resuelve el asesor es el mismo que
 * elegiría el cliente en el formulario. La tabla `ubigeos` de la BD no está
 * completa y no sirve para esto.
 *
 * @see docs/specs/agente-ventas/spec.md — R9.
 */

import { ubigeoINEI } from "peru-utils";

// Máximo de opciones cuando el nombre se repite en varias provincias.
const MAX_OPCIONES = 5;

// Formas comunes de nombrar distritos de Lima y Callao que no coinciden con el
// nombre oficial del INEI.
const ALIAS = {
  "surco": "150140",
  "santiago de surco": "150140",
  "sjl": "150132",
  "smp": "150135",
  "sjm": "150133",
  "ves": "150142",
  "vmt": "150143",
  "magdalena": "150120",
  "cercado": "150101",
  "cercado de lima": "150101",
  "lima cercado": "150101",
  "callao": "070101",
  "la perla": "070104",
  "breña": "150105",
  "brena": "150105"
};

function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Índice plano, construido una sola vez (el dataset es estático).
let indice = null;
function obtenerIndice() {
  if (indice) return indice;
  indice = [];
  for (const dep of ubigeoINEI.getDepartments()) {
    for (const prov of (ubigeoINEI.getProvince(dep.code) ?? []).filter(Boolean)) {
      for (const dist of (ubigeoINEI.getDistrict(prov.code) ?? []).filter(Boolean)) {
        indice.push({
          ubigeo: dist.code,
          distrito: dist.name,
          provincia: prov.name,
          departamento: dep.name,
          norm: normalizar(dist.name),
          provNorm: normalizar(prov.name),
          depNorm: normalizar(dep.name)
        });
      }
    }
  }
  return indice;
}

/**
 * Departamento + provincia INEI ("1501") del ubigeo de la tienda.
 * `tiendas.ubigeo` viene de la tabla `ubigeos`, que usa 8 dígitos: "01" (país)
 * + departamento + provincia + distrito. Departamento y provincia coinciden con
 * el INEI; el número de distrito NO (Miraflores es 01150102 ahí y 150122 en el
 * INEI), por eso solo se usan los 4 primeros dígitos INEI.
 * @param {string|null} ubigeo - 8 dígitos (tabla ubigeos) o 6 (INEI).
 * @returns {string|null}
 */
export function prefijoInei(ubigeo) {
  const codigo = String(ubigeo ?? "").replace(/\D/g, "");
  const inei = codigo.length === 8 && codigo.startsWith("01") ? codigo.slice(2) : codigo;
  if (inei.length < 2 || inei.startsWith("00")) return null;
  // "1500" (solo departamento) → "15".
  return inei.slice(2, 4) === "00" ? inei.slice(0, 2) : inei.slice(0, 4);
}

/** "Santiago de Surco, Lima" — etiqueta que ve el cliente. */
export function etiquetaDistrito(d) {
  return d.provincia === d.distrito ? `${d.distrito}, ${d.departamento}` : `${d.distrito}, ${d.provincia}`;
}

/**
 * @param {string} texto - Lo que escribió el cliente ("miraflores", "Surco", "Cayma, Arequipa").
 * @param {{ ubigeoTienda?: string|null }} [ctx] - Si el nombre se repite, gana el
 *   distrito del departamento de la tienda (ahí vende la mayoría).
 * @returns {{ estado: "ok", distrito: object }
 *   | { estado: "ambiguo", opciones: object[] }
 *   | { estado: "no_encontrado" }}
 */
export function resolverDistrito(texto, { ubigeoTienda = null } = {}) {
  const idx = obtenerIndice();
  let limpio = normalizar(texto).replace(/^(el |en |distrito de |distrito )+/, "");
  if (!limpio) return { estado: "no_encontrado" };

  if (ALIAS[limpio]) {
    return { estado: "ok", distrito: idx.find(d => d.ubigeo === ALIAS[limpio]) };
  }

  // Coincidencia exacta con el nombre completo, o "<distrito> <provincia|departamento>".
  let candidatos = idx.filter(d => d.norm === limpio);
  if (candidatos.length === 0) {
    candidatos = idx.filter(d =>
      limpio.startsWith(`${d.norm} `) &&
      [d.provNorm, d.depNorm].some(lugar => limpio.slice(d.norm.length + 1) === lugar)
    );
  }
  // Nombre parcial con palabras completas ("lurigancho" → San Juan de / Lurigancho).
  if (candidatos.length === 0 && limpio.length >= 4) {
    const re = new RegExp(`(^| )${limpio}( |$)`);
    candidatos = idx.filter(d => re.test(d.norm));
  }

  if (candidatos.length === 0) return { estado: "no_encontrado" };
  if (candidatos.length === 1) return { estado: "ok", distrito: candidatos[0] };

  // El nombre se repite: gana el más cercano a la tienda (misma provincia,
  // luego mismo departamento) si es uno solo. Si no, se pregunta.
  const base = prefijoInei(ubigeoTienda);
  const cercania = (d) => {
    if (!base) return 0;
    if (base.length >= 4 && d.ubigeo.startsWith(base.slice(0, 4))) return 2;
    if (d.ubigeo.startsWith(base.slice(0, 2))) return 1;
    return 0;
  };
  const ordenados = [...candidatos].sort((a, b) => cercania(b) - cercania(a));
  const mejor = cercania(ordenados[0]);
  if (mejor > 0 && cercania(ordenados[1]) < mejor) return { estado: "ok", distrito: ordenados[0] };

  return { estado: "ambiguo", opciones: ordenados.slice(0, MAX_OPCIONES) };
}
