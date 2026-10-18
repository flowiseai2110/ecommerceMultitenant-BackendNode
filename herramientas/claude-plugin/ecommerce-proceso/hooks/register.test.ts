import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const RAIZ = 'C:/Users/diego armando/repositorios/ecommerce/ecommerceMultitenant-BackendNode'
const DISENO = `${RAIZ}/docs/disenos/plantillas-canchas/v1-2026-10-12.html`
const CODIGO = `${RAIZ}/config/index.js`

/** Un disco de mentira debajo del plugin y una herramienta que siempre responde bien. */
const preparar = (on: On, archivos: Record<string, string>) => {
  // El motor entrega las rutas con "\" en Windows: se comparan normalizadas.
  const clave = (ruta: string) => ruta.replace(/\\/g, '/').toLowerCase()
  const disco = new Map(Object.entries(archivos).map(([ruta, texto]) => [clave(ruta), texto]))
  on('fs.exists', ($, e) => ({ value: disco.has(clave(e.path)) }))
  on('fs.read', ($, e) => ({ value: disco.get(clave(e.path)) ?? '' }))
  on('tool.call', () => ({ result: 'ok' }))
}

describe('diseños aprobados', () => {
  test('no se editan', async ($, on) => {
    preparar(on, { [DISENO]: '<html>' })
    const r = await $.tool.call({ tool: 'Edit', file_path: DISENO, old_string: 'a', new_string: 'b' })
    expect(r.deny !== undefined && r.deny.includes('versión aprobada')).toBe(true)
  })

  test('no se sobrescriben', async ($, on) => {
    preparar(on, { [DISENO]: '<html>' })
    const r = await $.tool.call({ tool: 'Write', file_path: DISENO, content: '<html>nuevo' })
    expect(r.deny !== undefined).toBe(true)
  })

  test('una versión nueva sí se crea', async ($, on) => {
    preparar(on, {})
    const r = await $.tool.call({
      tool: 'Write',
      file_path: `${RAIZ}/docs/disenos/plantillas-canchas/v2-2026-11-01.html`,
      content: '<html>',
    })
    expect(r.deny).toBe(undefined)
  })

  test('el índice sí se edita', async ($, on) => {
    preparar(on, { [`${RAIZ}/docs/disenos/INDICE.md`]: '# Índice' })
    const r = await $.tool.call({ tool: 'Edit', file_path: `${RAIZ}/docs/disenos/INDICE.md`, old_string: 'a', new_string: 'b' })
    expect(r.deny).toBe(undefined)
  })
})

describe('llaves nuevas', () => {
  test('avisa la que .env.example no declara', async ($, on) => {
    preparar(on, { [`${RAIZ}/.env.example`]: 'PORT=\nRESEND_API_KEY=\n', [CODIGO]: '' })
    const r = await $.tool.call({
      tool: 'Edit',
      file_path: CODIGO,
      old_string: 'const a = 1',
      new_string: 'const a = process.env.WHATSAPP_TOKEN; const b = process.env.RESEND_API_KEY; const c = process.env.NODE_ENV',
    })
    expect(r.context?.length).toBe(1)
    const aviso = r.context?.[0] ?? ''
    expect(aviso.includes('WHATSAPP_TOKEN')).toBe(true)
    expect(aviso.includes('RESEND_API_KEY')).toBe(false)
  })

  test('no avisa una llave que el archivo ya leía', async ($, on) => {
    preparar(on, { [`${RAIZ}/.env.example`]: '', [CODIGO]: "process.env['VIEJA']" })
    const r = await $.tool.call({ tool: 'Write', file_path: CODIGO, content: "process.env['VIEJA'] // cambio" })
    expect(r.context).toBe(undefined)
  })
})

describe('avisos de despliegue', () => {
  test('pide crear .env.example si el repo no lo tiene', async ($, on) => {
    const admin = 'C:/Users/diego armando/repositorios/ecommerce/ecommerceMultitenant-FrontendAdmin'
    preparar(on, {})
    const r = await $.tool.call({ tool: 'Write', file_path: `${admin}/scripts/build.js`, content: 'process.env.ADMIN_KEY' })
    const aviso = r.context?.[0] ?? ''
    expect(aviso.includes('créalo')).toBe(true)
    expect(aviso.includes('ADMIN_KEY')).toBe(true)
  })

  test('un SQL nuevo pide anotarlo para el despliegue', async ($, on) => {
    preparar(on, {})
    const r = await $.tool.call({ tool: 'Write', file_path: `${RAIZ}/docs/sql/multi_sede_fase_1.sql`, content: 'select 1;' })
    expect((r.context?.[0] ?? '').includes('Supabase')).toBe(true)
  })

  test('editar un SQL que ya existía no repite el aviso', async ($, on) => {
    const sql = `${RAIZ}/docs/sql/multi_sede_fase_1.sql`
    preparar(on, { [sql]: 'select 1;' })
    const r = await $.tool.call({ tool: 'Write', file_path: sql, content: 'select 2;' })
    expect(r.context).toBe(undefined)
  })
})

describe('bitácora al terminar el turno', () => {
  test('pide cambios.md si se tocó código sin bitácora', async ($, on) => {
    preparar(on, { [CODIGO]: '' })
    on('classic.Stop', () => ({}))
    await $.tool.call({ tool: 'Edit', file_path: CODIGO, old_string: 'a', new_string: 'b' })
    const r = await $.classic.Stop({ stop_hook_active: false })
    expect(r.block !== undefined && r.block.includes('cambios.md')).toBe(true)
  })

  test('no insiste si ya se anotó en la bitácora', async ($, on) => {
    preparar(on, { [CODIGO]: '' })
    on('classic.Stop', () => ({}))
    await $.tool.call({ tool: 'Edit', file_path: CODIGO, old_string: 'a', new_string: 'b' })
    await $.tool.call({ tool: 'Write', file_path: `${RAIZ}/docs/specs/multi-sede/cambios.md`, content: '# Cambios' })
    const r = await $.classic.Stop({ stop_hook_active: false })
    expect(r.block).toBe(undefined)
  })

  test('no vuelve a bloquear el turno que ya bloqueó', async ($, on) => {
    preparar(on, { [CODIGO]: '' })
    on('classic.Stop', () => ({}))
    await $.tool.call({ tool: 'Edit', file_path: CODIGO, old_string: 'a', new_string: 'b' })
    const r = await $.classic.Stop({ stop_hook_active: true })
    expect(r.block).toBe(undefined)
  })

  test('ignora archivos fuera de los tres repos', async ($, on) => {
    preparar(on, {})
    on('classic.Stop', () => ({}))
    await $.tool.call({ tool: 'Edit', file_path: 'C:/otro-proyecto/src/app.ts', old_string: 'a', new_string: 'b' })
    const r = await $.classic.Stop({ stop_hook_active: false })
    expect(r.block).toBe(undefined)
  })
})
