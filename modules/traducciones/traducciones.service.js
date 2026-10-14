import { prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";
import { idiomaBase } from "../idiomas/idiomas.service.js";
import { idiomasElegidos } from "../idiomas/idiomas-tienda.js";
import { FUENTES } from "./fuentes.js";
import { estadoCampo, traduccionesDe, vacio } from "./texto-local.js";
import { iaDisponible, traducirTextos } from "./traducir-ia.js";
import { publicarCompletos } from "../idiomas/publicacion.service.js";
import { conConsulta } from "../consumo-ia/consumo-ia.service.js";
import { invalidateProductoDetailCache, invalidateProductosHome } from "../catalogo/productos.cache.js";
import { invalidarCacheStore } from "../../utils/store-cache.js";
import { invalidateTiendasStoreCache } from "../tenants/tiendas.cache.js";

/**
 * Pantalla Traducciones del admin (docs/specs/idiomas D3, diseno.md B4).
 *
 * Recorre FUENTES sin saber cómo guarda cada una (eso lo resuelve su almacén)
 * y trabaja con un idioma a la vez. Estados de cada texto: falta, al_dia (la
 * traducción salió del texto base actual), desactualizada (cambió el texto
 * base). Lo que el dueño escribe queda "manual" y la IA no lo pisa.
 *
 * La IA solo traduce cuando el dueño pulsa "Traducir con IA": nada aquí se
 * dispara al guardar (decisión 7 de la spec).
 */

const usuarioDe = (user) => user?.email ?? user?.id ?? null;

/**
 * Cachés de la tienda que muestran una fuente: al guardar una traducción se
 * limpian, para que la tienda la muestre enseguida y no al vencer la caché.
 */
const AL_GUARDAR = {
  productos: (id) => { invalidateProductoDetailCache(id); invalidateProductosHome(); },
  categorias: () => invalidarCacheStore("categorias"),
  diseno: () => invalidateTiendasStoreCache()
};
const alGuardar = (fuente, id) => AL_GUARDAR[fuente]?.(id);
const error = (message) => new ValidationError(message, { message });

async function tiendaDe(tiendaId) {
  const t = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { id: true, nombre: true, tipoNegocio: true } });
  if (!t) throw new NotFoundError("Tienda");
  return t;
}

/**
 * Idioma en que trabaja la pantalla: el pedido, si la tienda lo eligió y no es
 * el base; si no, el primero que eligió. null si la tienda solo tiene el base.
 */
export async function idiomaDeTrabajo(tiendaId, codigo) {
  const otros = (await idiomasElegidos(tiendaId)).filter((i) => !i.esBase);
  return otros.find((i) => i.codigo === codigo) ?? otros[0] ?? null;
}

/** Recorre los textos de todas las fuentes de la tienda en un idioma. */
async function* textosDeTienda(tiendaId, codigo) {
  for (const [nombre, fuente] of Object.entries(FUENTES)) {
    for (const fila of await fuente.almacen.leer(tiendaId)) {
      const tr = traduccionesDe(fila.traducciones, codigo);
      const campos = Object.entries(fuente.textos(fila))
        .map(([campo, base]) => ({ campo, base, tr: tr[campo], estado: estadoCampo(base, tr[campo]) }))
        .filter((c) => c.estado);
      yield { nombre, fuente, fila, campos };
    }
  }
}

/**
 * Todos los textos traducibles de la tienda en un idioma, agrupados por de
 * dónde salen, con su estado.
 */
export async function listarTextos(tiendaId, codigo) {
  await tiendaDe(tiendaId);
  const elegidos = await idiomasElegidos(tiendaId);
  const idioma = await idiomaDeTrabajo(tiendaId, codigo);
  const grupos = [];
  if (idioma) {
    for await (const { nombre, fuente, fila, campos } of textosDeTienda(tiendaId, idioma.codigo)) {
      if (!campos.length) continue;
      grupos.push({
        fuente: nombre, id: fuente.almacen.idDe(fila), etiqueta: fuente.etiqueta, nombre: fuente.nombre(fila) ?? "",
        campos: campos.map((c) => ({ campo: c.campo, base: c.base, traduccion: c.tr?.t ?? null, manual: !!c.tr?.m, estado: c.estado }))
      });
    }
  }
  const todos = grupos.flatMap((g) => g.campos);
  return {
    idioma,
    idiomas: elegidos.filter((i) => !i.esBase),
    iaDisponible: iaDisponible() && Boolean(idioma?.ia),
    resumen: {
      total: todos.length,
      faltan: todos.filter((c) => c.estado === "falta").length,
      desactualizadas: todos.filter((c) => c.estado === "desactualizada").length
    },
    grupos
  };
}

/** El dueño escribe (o borra, con texto vacío) una traducción: queda como manual. */
export async function guardarManual(tiendaId, { fuente: nombre, id, campo, texto, idioma: codigo }, user) {
  const idioma = await idiomaDeTrabajo(tiendaId, codigo);
  if (!idioma) throw error("La tienda no ofrece otros idiomas");
  const fuente = FUENTES[nombre];
  if (!fuente) throw error("Campo no traducible");
  const fila = await fuente.almacen.leerUna(tiendaId, id);
  if (!fila) throw new NotFoundError("Texto");
  const textos = fuente.textos(fila);
  if (!Object.hasOwn(textos, campo)) throw error("Campo no traducible");

  const limpio = Array.isArray(texto) ? texto.map((t) => String(t).trim()).filter(Boolean) : String(texto ?? "").trim();
  await fuente.almacen.guardar(tiendaId, id, idioma.codigo, (actual) => {
    const nuevo = { ...actual };
    if (vacio(limpio)) delete nuevo[campo];
    else nuevo[campo] = { t: limpio, o: textos[campo], m: true };
    return nuevo;
  }, usuarioDe(user));
  alGuardar(nombre, id);
  // Con este texto puede haber llegado al 100 %: se publica (P5).
  await publicarCompletos(tiendaId);
  return idioma;
}

/** Clave plana de un texto pendiente; las listas se traducen elemento por elemento. */
const claveDe = (fuente, id, campo, i = null) => `${fuente}|${id}|${campo}${i === null ? "" : `#${i}`}`;

/**
 * "Traducir con IA": traduce lo que falta y lo automático desactualizado de un
 * idioma (no toca lo manual). Solo para idiomas con `ia`. Devuelve cuántos
 * textos tradujo.
 */
export async function traducirPendientes(tiendaId, codigo) {
  const tienda = await tiendaDe(tiendaId);
  const idioma = await idiomaDeTrabajo(tiendaId, codigo);
  if (!idioma?.ia || !iaDisponible()) return 0;

  const pendientes = {};   // clave plana → texto base
  const destinos = [];     // { nombre, id, campo, base, lista }
  for await (const { nombre, fuente, fila, campos } of textosDeTienda(tiendaId, idioma.codigo)) {
    const id = fuente.almacen.idDe(fila);
    for (const c of campos) {
      if (c.estado === "al_dia" || c.tr?.m) continue;
      const lista = Array.isArray(c.base);
      if (lista) c.base.forEach((v, i) => { pendientes[claveDe(nombre, id, c.campo, i)] = v; });
      else pendientes[claveDe(nombre, id, c.campo)] = c.base;
      destinos.push({ nombre, id, campo: c.campo, base: c.base, lista });
    }
  }
  if (!destinos.length) return 0;

  // Una pulsación de "Traducir con IA" = 1 consulta de consumo-ia (con sus tokens):
  // respeta el tope de la tienda y se devuelve si la IA falla.
  const origen = await idiomaBase();
  const { resultado: { traducciones: traduccion } } = await conConsulta(tiendaId, "traducciones", () =>
    traducirTextos(pendientes, { origen, destino: idioma, contexto: `${tienda.nombre} (${tienda.tipoNegocio})` }));

  // Agrupa por fila lo que volvió completo (una lista, con todos sus elementos).
  let traducidos = 0;
  const porFila = new Map();
  for (const d of destinos) {
    const t = d.lista ? d.base.map((_, i) => traduccion[claveDe(d.nombre, d.id, d.campo, i)]) : traduccion[claveDe(d.nombre, d.id, d.campo)];
    if (d.lista ? t.some((x) => !x) : !t) continue;
    const k = `${d.nombre}|${d.id}`;
    if (!porFila.has(k)) porFila.set(k, { nombre: d.nombre, id: d.id, campos: {} });
    porFila.get(k).campos[d.campo] = { t, o: d.base, m: false };
    traducidos++;
  }
  for (const { nombre, id, campos } of porFila.values()) {
    await FUENTES[nombre].almacen.guardar(tiendaId, id, idioma.codigo, (actual) => ({
      ...actual,
      // Una corrección manual hecha mientras traducía la IA gana.
      ...Object.fromEntries(Object.entries(campos).filter(([c]) => !actual[c]?.m))
    }), "traducciones-ia");
    alGuardar(nombre, id);
  }
  logger.info(`🌐 Traducciones: ${traducidos} textos traducidos a ${idioma.codigo} en ${tienda.nombre}`);
  await publicarCompletos(tiendaId);
  return traducidos;
}
