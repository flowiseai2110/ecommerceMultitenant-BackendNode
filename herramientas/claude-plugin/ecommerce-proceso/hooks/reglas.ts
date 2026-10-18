// Reglas del proceso (docs/proceso/README.md) como funciones puras, sin $.

const REPOS = /^(.*\/ecommerceMultitenant-(?:BackendNode|FrontendAdmin|FrontendStore))\//i

export const normalizar = (ruta: string): string => ruta.replace(/\\/g, '/')

/** Raíz del repo (BackendNode, FrontendAdmin o FrontendStore) que contiene la ruta. */
export const raizDelRepo = (ruta: string): string | undefined => normalizar(ruta).match(REPOS)?.[1]

/** Un archivo dentro de una versión de diseño: docs/disenos/<diseño>/v<N>… (docs/disenos/README.md). */
export const esDisenoVersionado = (ruta: string): boolean =>
  /\/docs\/disenos\/[^/]+\/v\d+[^/]*(\/|$)/i.test(normalizar(ruta))

/** Un SQL para correr a mano en Supabase al desplegar (docs/sql/ de un repo). */
export const esSqlDeDespliegue = (ruta: string): boolean =>
  raizDelRepo(ruta) !== undefined && /\/docs\/sql\/[^/]+\.sql$/i.test(normalizar(ruta))

/** La bitácora de una funcionalidad o el tablero. */
export const esBitacora = (ruta: string): boolean =>
  /\/docs\/(ESTADO\.md|specs\/[^/]+\/cambios\.md)$/i.test(normalizar(ruta))

const FUERA_DEL_CODIGO = /\/(docs|prototipos|node_modules|dist|\.angular|\.claude|herramientas|e2e|playwright-report|test-results)\//i
const EXTENSIONES_DE_CODIGO = /\.(ts|tsx|js|mjs|cjs|html|scss|css|prisma)$/i

/** Código de uno de los tres repos (no documentación, prototipos ni lo generado). */
export const esCodigo = (ruta: string): boolean => {
  const n = normalizar(ruta)
  return raizDelRepo(n) !== undefined && !FUERA_DEL_CODIGO.test(n) && EXTENSIONES_DE_CODIGO.test(n)
}

// Las pone la plataforma (Railway, Vercel, Node), no Diego.
const DE_LA_PLATAFORMA = new Set(['NODE_ENV', 'PORT', 'VERCEL', 'VERCEL_ENV', 'VERCEL_URL', 'CI', 'TZ'])

const LLAVE = /process\.env(?:\.([A-Z][A-Z0-9_]*)|\[\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\])/g

/** Las variables de entorno que lee un texto de código. */
export const llavesLeidas = (texto: string): Set<string> => {
  const llaves = new Set<string>()
  for (const m of texto.matchAll(LLAVE)) {
    const llave = m[1] ?? m[2]
    if (llave !== undefined) llaves.add(llave)
  }
  return llaves
}

/** Las variables que `despues` lee y `antes` no, sin las de la plataforma. */
export const llavesNuevas = (antes: string, despues: string): string[] => {
  const ya = llavesLeidas(antes)
  return [...llavesLeidas(despues)].filter(
    llave => !ya.has(llave) && !DE_LA_PLATAFORMA.has(llave) && !llave.startsWith('RAILWAY_'),
  )
}

/** Si `.env.example` declara la llave (activa o comentada). */
export const estaDeclarada = (envExample: string, llave: string): boolean =>
  new RegExp(`^\\s*#?\\s*${llave}\\s*=`, 'm').test(envExample)
