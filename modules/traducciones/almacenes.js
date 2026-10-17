import { prisma } from "../../config/prisma.js";
import { getDiseno, upsertClave } from "../../services/tienda-diseno.service.js";
import { ETIQUETA_GRUPO } from "../idiomas/grupos.js";
import { clavesDeTienda, invalidarTextos, textoBase } from "../idiomas/textos.service.js";
import { escribirTextosDeTienda } from "../idiomas/textos.repository.js";
import { guardarTraduccionesOpciones, leerTraduccionesOpciones, palabrasDeTienda } from "./opciones.js";

/**
 * Dónde guarda sus traducciones cada fuente (docs/specs/idiomas D5, diseno.md B4).
 * Todos los almacenes tienen la misma forma, así el servicio de traducciones
 * los recorre sin preguntar cuál es cuál:
 *
 *   leer(tiendaId)            → filas con `traducciones` ({ <codigo>: {...} })
 *   leerUna(tiendaId, id)     → la fila, o null si no es de la tienda
 *   idDe(fila)                → su id
 *   guardar(tiendaId, id, codigo, cambiar, usuario)
 *       `cambiar(actual)` recibe las traducciones del idioma y devuelve las
 *       nuevas. Solo reemplaza ese idioma: los demás quedan como estaban.
 */

/** La fila tiene su propia columna JSONB `traducciones` (productos, categorías, extras…). */
export function almacenColumna({ tabla, pk = "id", where, select }) {
  const seleccion = { [pk]: true, traducciones: true, ...select };
  const deLaTienda = (tiendaId, id) => ({ ...where(tiendaId), [pk]: id });
  return {
    leer: (tiendaId) => prisma[tabla].findMany({ where: where(tiendaId), select: seleccion }),
    leerUna: (tiendaId, id) => prisma[tabla].findFirst({ where: deLaTienda(tiendaId, id), select: seleccion }),
    idDe: (fila) => fila[pk],
    async guardar(tiendaId, id, codigo, cambiar) {
      const fila = await prisma[tabla].findFirst({ where: deLaTienda(tiendaId, id), select: { traducciones: true } });
      if (!fila) return false;
      const todas = fila.traducciones ?? {};
      await prisma[tabla].update({ where: { [pk]: id }, data: { traducciones: { ...todas, [codigo]: cambiar(todas[codigo] ?? {}) } } });
      return true;
    }
  };
}

/**
 * El diseño de la tienda: una sola "fila" por tienda (id = tiendaId) con la
 * estructura de la home y la descripción; las traducciones van en la clave
 * "traducciones" de la configuración de diseño.
 */
export function almacenDiseno() {
  async function leerUna(tiendaId, id = tiendaId) {
    if (id !== tiendaId) return null;
    const [tienda, diseno] = await Promise.all([
      prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { nombre: true, descripcion: true } }),
      getDiseno(tiendaId)
    ]);
    if (!tienda) return null;
    return { id: tiendaId, nombre: tienda.nombre, descripcion: tienda.descripcion, estructura: diseno.estructura, traducciones: diseno.traducciones };
  }
  return {
    leerUna,
    leer: async (tiendaId) => [await leerUna(tiendaId)].filter(Boolean),
    idDe: (fila) => fila.id,
    async guardar(tiendaId, id, codigo, cambiar, usuario) {
      if (id !== tiendaId) return false;
      const todas = (await getDiseno(tiendaId)).traducciones ?? {};
      await upsertClave(tiendaId, "traducciones", { ...todas, [codigo]: cambiar(todas[codigo] ?? {}) }, usuario);
      return true;
    }
  };
}

/**
 * Opciones de las variantes de la tienda (opciones.js): una sola "fila" por
 * tienda (id = tiendaId) con las palabras distintas de las opciones de sus
 * productos; sin opciones, ninguna fila. Las traducciones van en la
 * configuración de la tienda.
 */
export function almacenOpciones() {
  async function leerUna(tiendaId, id = tiendaId) {
    if (id !== tiendaId) return null;
    const [palabras, traducciones] = await Promise.all([palabrasDeTienda(tiendaId), leerTraduccionesOpciones(tiendaId)]);
    return palabras.length ? { id: tiendaId, palabras, traducciones } : null;
  }
  return {
    leerUna,
    leer: async (tiendaId) => [await leerUna(tiendaId)].filter(Boolean),
    idDe: (fila) => fila.id,
    async guardar(tiendaId, id, codigo, cambiar, usuario) {
      if (id !== tiendaId) return false;
      const todas = await leerTraduccionesOpciones(tiendaId);
      await guardarTraduccionesOpciones(tiendaId, { ...todas, [codigo]: cambiar(todas[codigo] ?? {}) }, usuario);
      return true;
    }
  };
}

/**
 * Textos fijos de la tienda (docs/specs/idiomas D7): una "fila" por grupo del
 * rubro (id = grupo), con sus claves. Las traducciones salen de
 * `tienda_textos` y, si la tienda no tiene la suya, de `textos_plataforma`
 * (cuenta como al día: el dueño la ve y puede reemplazarla; si borra la suya,
 * vuelve la de la plataforma). `o` es el texto base, que es la propia clave:
 * un texto fijo nunca queda desactualizado, si cambia es otra clave.
 */
export function almacenTextosFijos() {
  async function leer(tiendaId) {
    const [claves, propias, plataforma] = await Promise.all([
      clavesDeTienda(tiendaId),
      prisma.tienda_textos.findMany({ where: { tiendaId }, select: { idioma: true, clave: true, texto: true, origen: true } }),
      prisma.textos_plataforma.findMany({ select: { idioma: true, clave: true, texto: true } })
    ]);
    const porGrupo = new Map();
    for (const { clave, grupo } of claves) {
      if (!porGrupo.has(grupo)) porGrupo.set(grupo, { id: grupo, nombre: ETIQUETA_GRUPO[grupo] ?? grupo, claves: [], propias: {}, traducciones: {} });
      porGrupo.get(grupo).claves.push(clave);
    }
    const grupoDe = new Map(claves.map((c) => [c.clave, c.grupo]));
    const poner = (idioma, clave, valor, propia) => {
      const fila = porGrupo.get(grupoDe.get(clave));
      if (!fila) return;
      (fila.traducciones[idioma] ??= {})[clave] = valor;
      if (propia) (fila.propias[idioma] ??= new Set()).add(clave);
    };
    for (const t of plataforma) poner(t.idioma, t.clave, { t: t.texto, o: textoBase(t.clave), m: false }, false);
    for (const t of propias) poner(t.idioma, t.clave, { t: t.texto, o: textoBase(t.clave), m: t.origen === "manual" }, true);
    return [...porGrupo.values()];
  }
  return {
    leer,
    leerUna: async (tiendaId, id) => (await leer(tiendaId)).find((f) => f.id === id) ?? null,
    idDe: (fila) => fila.id,
    async guardar(tiendaId, id, codigo, cambiar, usuario) {
      const fila = (await leer(tiendaId)).find((f) => f.id === id);
      if (!fila) return false;
      const antes = fila.traducciones[codigo] ?? {};
      const despues = cambiar(antes);
      const propias = fila.propias[codigo] ?? new Set();
      const guardar = [];
      const borrar = [];
      for (const clave of fila.claves) {
        const a = antes[clave];
        const d = despues[clave];
        if (!d) { if (propias.has(clave)) borrar.push(clave); continue; }
        if (!a || a.t !== d.t || Boolean(a.m) !== Boolean(d.m)) guardar.push({ clave, texto: d.t, origen: d.m ? "manual" : "ia" });
      }
      if (guardar.length || borrar.length) {
        await escribirTextosDeTienda(tiendaId, codigo, { guardar, borrar }, usuario);
        invalidarTextos();
      }
      return true;
    }
  };
}
