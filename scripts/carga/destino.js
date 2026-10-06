/**
 * Protección del destino del seed de carga: NUNCA debe escribir en producción.
 *
 * Tres barreras, todas obligatorias:
 *  1. NODE_ENV=production → se niega.
 *  2. El proyecto de la base (ref de Supabase, o el host si no es Supabase)
 *     está en REFS_PRODUCCION o en SEED_CARGA_REFS_PROHIBIDOS → se niega.
 *  3. --confirmar-db debe repetir exactamente ese ref: obliga a mirar a qué
 *     base apunta el .env antes de correrlo.
 */

// Refs de los proyectos Supabase con CLIENTES REALES. Vacío a propósito
// (2026-10-05): horszyybxnjivkuuubjd sirve a la app publicada, pero todo es de
// prueba, sin clientes. El día que entre el primer cliente real, agregar aquí
// el ref de esa base (o crear un proyecto de staging aparte).
export const REFS_PRODUCCION = [];

/**
 * Identifica el proyecto al que apunta una URL de Postgres.
 *  - Pooler Supabase: usuario "postgres.<ref>" → <ref>
 *  - Directa Supabase: host "db.<ref>.supabase.co" → <ref>
 *  - Otro Postgres: el host (ej. "localhost").
 * @param {string} databaseUrl
 * @returns {string}
 */
export function refDeBase(databaseUrl) {
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL no es una URL válida");
  }
  const usuario = decodeURIComponent(url.username);
  const porUsuario = usuario.match(/^postgres\.([a-z0-9]+)$/);
  if (porUsuario) return porUsuario[1];
  const porHost = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/);
  if (porHost) return porHost[1];
  return url.hostname;
}

/**
 * @param {object} p
 * @param {string|undefined} p.databaseUrl
 * @param {string|undefined} p.confirmar - Valor de --confirmar-db.
 * @param {string|undefined} p.nodeEnv
 * @param {string|undefined} [p.prohibidosExtra] - SEED_CARGA_REFS_PROHIBIDOS (separados por coma).
 * @returns {string} El ref validado.
 */
export function verificarDestino({ databaseUrl, confirmar, nodeEnv, prohibidosExtra = "" }) {
  if (nodeEnv === "production") {
    throw new Error("NODE_ENV=production: el seed de carga no corre en producción");
  }
  if (!databaseUrl) throw new Error("Falta DATABASE_URL");

  const ref = refDeBase(databaseUrl);
  const prohibidos = [...REFS_PRODUCCION, ...prohibidosExtra.split(",").map(s => s.trim()).filter(Boolean)];
  if (prohibidos.includes(ref)) {
    throw new Error(`DATABASE_URL apunta a PRODUCCIÓN (${ref}). Usa el proyecto de staging.`);
  }
  if (confirmar !== ref) {
    throw new Error(`DATABASE_URL apunta a "${ref}". Si es el proyecto de pruebas, repite: --confirmar-db ${ref}`);
  }
  return ref;
}
