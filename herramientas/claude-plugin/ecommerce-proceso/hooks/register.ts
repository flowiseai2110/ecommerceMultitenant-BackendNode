import type { EngineInterface, Register } from 'claude-code'
import {
  esBitacora,
  esCodigo,
  esDisenoVersionado,
  esSqlDeDespliegue,
  estaDeclarada,
  llavesNuevas,
  normalizar,
  raizDelRepo,
} from './reglas.ts'

// Lo tocado desde el último fin de turno (Stop), para recordar la bitácora.
const codigoTocado = new Set<string>()
let bitacoraTocada = false

const anotar = (ruta: string) => {
  if (esCodigo(ruta)) codigoTocado.add(ruta)
  if (esBitacora(ruta)) bitacoraTocada = true
}

const DISENO_APROBADO = (ruta: string) =>
  `${ruta} es una versión aprobada de un diseño y no se edita. ` +
  'Crea la versión siguiente (v<N+1>-AAAA-MM-DD) y mueve la anterior a "Reemplazados" en docs/disenos/INDICE.md (ver docs/disenos/README.md).'

/** Aviso, para el modelo, de las llaves nuevas que el `.env.example` del repo no declara. */
const avisoDeLlaves = async ($: EngineInterface, ruta: string, antes: string, despues: string) => {
  const raiz = raizDelRepo(ruta)
  if (raiz === undefined || !esCodigo(ruta)) return undefined
  const nuevas = llavesNuevas(antes, despues)
  if (nuevas.length === 0) return undefined
  const ejemplo = `${raiz}/.env.example`
  const existe = await $.fs.exists(ejemplo)
  const envExample = existe ? String(await $.fs.read(ejemplo)) : ''
  const faltan = nuevas.filter(llave => !estaDeclarada(envExample, llave))
  if (faltan.length === 0) return undefined
  const donde = existe ? `que ${ejemplo} no declara` : `y el repo no tiene ${ejemplo}: créalo`
  return (
    `Llaves nuevas ${donde}: ${faltan.join(', ')}. ` +
    'Decláralas ahí con un comentario de para qué sirven y cómo generarlas, y anótalas en "Afecta al despliegue" de cambios.md: ' +
    'el deployer arma la lista de Railway/Vercel desde ese archivo.'
  )
}

const AVISO_SQL = (ruta: string) =>
  `${ruta} es un SQL que Diego corre a mano en Supabase al desplegar. ` +
  'Anótalo en "Afecta al despliegue" de cambios.md (con su reversa) y en "Te toca" de docs/ESTADO.md.'

// La coordinación del proceso (coordinacion.md), solo en sesiones de los tres repos o de su carpeta padre.
let coordinacion: Promise<string | undefined> | undefined

const leerCoordinacion = async ($: EngineInterface): Promise<string | undefined> => {
  const raiz = normalizar(await $.session.root()).replace(/\/$/, '')
  const enElProyecto =
    raizDelRepo(`${raiz}/`) !== undefined || (await $.fs.exists(`${raiz}/ecommerceMultitenant-BackendNode`))
  return enElProyecto ? String(await $.fs.read(`${$.plugin.root}/coordinacion.md`)) : undefined
}

export const register: Register = on => {
  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    if (esDisenoVersionado(e.file_path)) return { deny: DISENO_APROBADO(e.file_path) }
    const hecho = await next(e)
    if (hecho.deny !== undefined || hecho.isError) return hecho
    anotar(e.file_path)
    const aviso = await avisoDeLlaves($, e.file_path, e.old_string, e.new_string)
    return aviso === undefined ? hecho : { ...hecho, context: [...(hecho.context ?? []), aviso] }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: `${$.plugin.name}: falló su revisión de ${e.file_path}.` }))

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const existia = await $.fs.exists(e.file_path)
    if (existia && esDisenoVersionado(e.file_path)) return { deny: DISENO_APROBADO(e.file_path) }
    const antes = existia && esCodigo(e.file_path) ? String(await $.fs.read(e.file_path)) : ''
    const hecho = await next(e)
    if (hecho.deny !== undefined || hecho.isError) return hecho
    anotar(e.file_path)
    const avisos = [
      await avisoDeLlaves($, e.file_path, antes, e.content),
      !existia && esSqlDeDespliegue(e.file_path) ? AVISO_SQL(e.file_path) : undefined,
    ].filter(aviso => aviso !== undefined)
    return avisos.length === 0 ? hecho : { ...hecho, context: [...(hecho.context ?? []), ...avisos] }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: `${$.plugin.name}: falló su revisión de ${e.file_path}.` }))

  on('prompt.compose', async ($, e, next) => {
    const prompt = await next(e)
    coordinacion ??= leerCoordinacion($).catch(() => undefined)
    const texto = await coordinacion
    if (texto === undefined) return prompt
    return { sections: [...prompt.sections, { id: 'ecommerce-proceso:coordinacion', text: texto, scope: 'session' as const }] }
  })

  on('classic.Stop', async ($, e, next) => {
    const respuesta = await next(e)
    const tocado = [...codigoTocado]
    const sinBitacora = tocado.length > 0 && !bitacoraTocada
    codigoTocado.clear()
    bitacoraTocada = false
    if (e.stop_hook_active || !sinBitacora || respuesta.block !== undefined) return respuesta
    const lista = tocado.slice(0, 5).join(', ') + (tocado.length > 5 ? ` y ${tocado.length - 5} más` : '')
    return {
      ...respuesta,
      block:
        `Cambiaste código (${lista}) y no tocaste la bitácora. ` +
        'Si el cambio es de una funcionalidad con carpeta en BackendNode docs/specs/, agrega su entrada en cambios.md y actualiza docs/ESTADO.md antes de terminar. ' +
        'Si es un cambio chico sin spec, dilo en una línea y termina.',
    }
  })
}
