// Promoción de una campaña — lógica pura (sin BD ni reloj) para poder testearla.
// Ver docs/specs/campanas-descuento (R4, R5, R9) e impacto.md "Cuándo aplica una promoción".
//
// La promoción vive en tablas propias (campana_promociones y sus hijas) ligada
// por el id de la campaña, que sigue en el JSON de la tienda. Aquí se decide,
// con el mismo calendario de las campañas, qué promociones cambian precios en
// `ahora`. El precio en sí lo calcula solo precios/precio-vigente.js.

import { aIsoLima, fechaCivilLima, proximaVentana, proximoCambio, ventanas } from "./calendario.js";
import { campanasAplicables, efectiva } from "./resolver.js";
import { cubre } from "../precios/precio-vigente.js";

const DIA_MS = 86_400_000;
/** Desde cuántos días antes de una edición nueva se recuerda confirmarla (propuesta 6 del diseño). */
export const DIAS_RECORDAR = 30;
/** Porcentaje de una promoción (R4.2, Q7) y desde cuánto la confirmación lo marca como muy alto. */
export const PORCENTAJE_MINIMO = 1;
export const PORCENTAJE_MAXIMO = 90;
export const PORCENTAJE_MUY_ALTO = 50;
/** El formulario del producto avisa de las promociones que empiezan en estos días (R10.3). */
export const DIAS_PROXIMAS = 30;

/**
 * Ventanas de la campaña alrededor de `ahora`: años a−1..a+1 en las que se
 * repiten (por ventanas que cruzan el cambio de año), uno solo en las propias.
 * Mismo recorrido que `vigente()` de calendario.js.
 */
function ventanasCerca(campana, ahora, ediciones) {
  const { anio } = fechaCivilLima(ahora);
  const anios = campana.regla ? [anio - 1, anio, anio + 1] : [anio];
  return anios.flatMap((a) => ventanas(campana, a, ediciones));
}

const mismaVentana = (conf, v) =>
  new Date(conf.ventanaInicio).getTime() === v.inicio.getTime() &&
  new Date(conf.ventanaFin).getTime() === v.fin.getTime();

/** ¿Hay una confirmación de esta versión de la promoción para exactamente esa ventana? (R9.5, R9.6) */
export function confirmadaPara(promocion, confirmaciones, v) {
  return (confirmaciones ?? []).some(
    (c) => c.promocionId === promocion.id && c.promocionVersion === promocion.version && mismaVentana(c, v)
  );
}

/**
 * Ids de las categorías elegidas más todas sus subcategorías (Q6): elegir
 * "Zapatillas" también rebaja lo que está en "Zapatillas > Running".
 * @param {Iterable<string>} ids
 * @param {Array<{ id: string, categoriaPadreId: string|null }>} categorias - Árbol de la tienda.
 * @returns {Set<string>}
 */
export function conSubcategorias(ids, categorias = []) {
  const todas = new Set(ids);
  let agregado = todas.size > 0;
  while (agregado) {
    agregado = false;
    for (const c of categorias) {
      if (c.categoriaPadreId && todas.has(c.categoriaPadreId) && !todas.has(c.id)) {
        todas.add(c.id);
        agregado = true;
      }
    }
  }
  return todas;
}

/** Desempate del resolver de campañas (R3.10 de campanas-cuando): mayor prioridad, luego ventana más corta. */
function antes(a, b) {
  const pa = a.v.campana.prioridad ?? 1;
  const pb = b.v.campana.prioridad ?? 1;
  if (pa !== pb) return pb - pa;
  return (a.v.fin - a.v.inicio) - (b.v.fin - b.v.inicio);
}

/**
 * Promociones que cambian precios en `ahora` (R5.2, R5.7, R9.5, R9.6). Una
 * promoción aplica si y solo si:
 *  1. su campaña existe en el JSON de la tienda y está activa (`campanasAplicables`);
 *  2. `ahora` cae en una ventana de la campaña (`ventanas()`, con ediciones);
 *  3. hay una confirmación con su misma `version` y exactamente esa ventana.
 * Cada campaña se evalúa por separado: dos cruzadas pueden aplicar a la vez y,
 * por producto, gana el mayor descuento (eso lo decide precioVigente).
 *
 * @param {object[]} campanasTienda - Clave "campanas" de la tienda (sin resolver).
 * @param {Array<{ id, campanaId, porcentaje, alcance, permitirCupones, permitirEnvioGratis, version, categoriaIds?: string[], productoIds?: string[] }>} promociones
 * @param {Array<{ promocionId, promocionVersion, ventanaInicio, ventanaFin }>} confirmaciones
 * @param {Array<{ id: string, categoriaPadreId: string|null }>} categorias - Árbol de categorías de la tienda.
 * @param {Date} ahora
 * @param {object[]|null} [ediciones] - Fechas por año de la plataforma.
 * @returns {Array<{ campanaId, nombre, porcentaje, alcance: { tipo, elegidas: string[], categoriaIds: Set<string>, productoIds: Set<string> },
 *   permitirCupones, permitirEnvioGratis, hasta: Date, orden: number }>} ordenadas por `orden` (0 = gana el empate).
 */
export function promocionesVigentes(campanasTienda, promociones, confirmaciones, categorias, ahora, ediciones = null) {
  if (!promociones?.length) return [];
  const porCampana = new Map(promociones.map((p) => [p.campanaId, p]));

  const vigentes = [];
  for (const campana of campanasAplicables(campanasTienda)) {
    const promocion = porCampana.get(campana.id);
    if (!promocion) continue;
    const v = ventanasCerca(campana, ahora, ediciones).find((w) => ahora >= w.inicio && ahora < w.fin);
    if (!v || !confirmadaPara(promocion, confirmaciones, v)) continue;
    vigentes.push({ promocion, v });
  }

  return vigentes.sort(antes).map(({ promocion: p, v }, orden) => paraCalculo(p, categorias, { nombre: v.campana.nombre, hasta: v.fin, orden }));
}

/**
 * Una promoción en la forma que entiende `precioVigente` (la de
 * promocionesVigentes). La usan también la revisión del Admin, con el borrador
 * que el dueño todavía no guardó, y las guardas del precio regular.
 */
export function paraCalculo(p, categorias, { nombre = null, hasta = null, orden = 0 } = {}) {
  return {
    campanaId: p.campanaId ?? null,
    // Para reconocer el cupón de la campaña (cupones.campana_promocion_id, R4.8).
    promocionId: p.id ?? null,
    nombre,
    porcentaje: p.porcentaje,
    alcance: {
      tipo: p.alcance,
      // Las que eligió el dueño (para las condiciones); `categoriaIds` ya trae sus subcategorías.
      elegidas: p.alcance === "categorias" ? [...(p.categoriaIds ?? [])] : [],
      categoriaIds: p.alcance === "categorias" ? conSubcategorias(p.categoriaIds ?? [], categorias) : new Set(),
      productoIds: p.alcance === "productos" ? new Set(p.productoIds ?? []) : new Set()
    },
    permitirCupones: Boolean(p.permitirCupones),
    permitirEnvioGratis: Boolean(p.permitirEnvioGratis),
    hasta,
    orden
  };
}

/**
 * El cupón de una campaña (R4.8) vence con ella: vale solo si su promoción
 * aplica en `ahora`, es decir, si está entre las promociones vigentes. Un cupón
 * de la tienda (sin `campanaPromocionId`) no depende de ninguna campaña. Lo usan
 * validarCupon y la cotización, así el servidor lo rechaza aunque la tienda
 * muestre un dato viejo. Sus permisos (R7.5) los aplica la cotización, como a
 * cualquier cupón.
 * @param {{ campanaPromocionId?: string|null }|null} cupon - Fila de `cupones`.
 * @param {Array<{ promocionId: string|null }>} promocionesVigentes - De promocionesVigentes.
 * @returns {boolean}
 */
export function cuponDeCampanaVigente(cupon, promocionesVigentes) {
  if (!cupon?.campanaPromocionId) return true;
  return (promocionesVigentes ?? []).some((p) => p.promocionId === cupon.campanaPromocionId);
}

/**
 * Próximo instante en que puede cambiar qué promociones aplican: inicio o fin
 * de una ventana de las campañas activas que tienen promoción (reusa
 * `proximoCambio` de calendario.js). Null si no hay ninguno. Las cachés de la
 * vitrina no pasan de aquí.
 */
export function proximoCambioPromociones(campanasTienda, promociones, ahora, ediciones = null) {
  const conPromocion = new Set((promociones ?? []).map((p) => p.campanaId));
  const campanas = campanasAplicables(campanasTienda).filter((c) => conPromocion.has(c.id));
  return campanas.length ? proximoCambio(campanas, ahora, ediciones) : null;
}

/**
 * Estado de la promoción de una campaña para el Admin (chips y paso 3):
 * - `sin-promocion`: la campaña no tiene promoción;
 * - `termino`: la campaña no tiene ventana en curso ni próxima;
 * - `confirmada`: confirmada con su versión para la ventana en curso o la próxima;
 * - `por-confirmar-edicion`: confirmada para una edición anterior pero no para
 *   la próxima (R9.6); `recordar` desde 30 días antes de su inicio;
 * - `sin-confirmar`: lo demás (nunca confirmada, o cambió la versión, CA-9.4).
 *
 * @param {object} campanaTienda - Campaña tal como está en el JSON de la tienda.
 * @param {object|null} promocion
 * @param {object[]} confirmaciones
 * @param {Date} ahora
 * @param {object[]|null} [ediciones]
 * @returns {{ estado: string, ventana: { inicio: Date, fin: Date } | null, recordar: boolean }}
 */
export function estadoPromocion(campanaTienda, promocion, confirmaciones, ahora, ediciones = null) {
  if (!promocion) return { estado: "sin-promocion", ventana: null, recordar: false };
  const campana = efectiva(campanaTienda);
  const v = campana ? proximaVentana(campana, ahora, ediciones) : null;
  if (!v) return { estado: "termino", ventana: null, recordar: false };

  const ventana = { inicio: v.inicio, fin: v.fin };
  if (confirmadaPara(promocion, confirmaciones, v)) return { estado: "confirmada", ventana, recordar: false };

  const deOtraEdicion = (confirmaciones ?? []).some(
    (c) => c.promocionId === promocion.id && new Date(c.ventanaFin).getTime() <= v.inicio.getTime()
  );
  if (deOtraEdicion) {
    const recordar = ahora.getTime() >= v.inicio.getTime() - DIAS_RECORDAR * DIA_MS;
    return { estado: "por-confirmar-edicion", ventana, recordar };
  }
  return { estado: "sin-confirmar", ventana, recordar: false };
}

/**
 * Resumen de una línea para el Admin: "−20 % en Zapatillas", "−20 % en 3
 * categorías", "−20 % en 12 productos", "−15 % en toda la tienda".
 * @param {{ porcentaje: number, alcance: string, categoriaIds?: string[], productoIds?: string[] }} promocion
 * @param {(id: string) => string|null} [nombreCategoria] - Nombre de una categoría (para la de una sola).
 * @returns {string}
 */
export function resumenPromocion(promocion, nombreCategoria = () => null) {
  const pct = `−${promocion.porcentaje} %`;
  if (promocion.alcance === "categorias") {
    const ids = promocion.categoriaIds ?? [];
    const nombre = ids.length === 1 ? nombreCategoria(ids[0]) : null;
    if (nombre) return `${pct} en ${nombre}`;
    return `${pct} en ${ids.length} ${ids.length === 1 ? "categoría" : "categorías"}`;
  }
  if (promocion.alcance === "productos") {
    const n = (promocion.productoIds ?? []).length;
    return `${pct} en ${n} ${n === 1 ? "producto" : "productos"}`;
  }
  return `${pct} en toda la tienda`;
}

/**
 * Lo público de las promociones vigentes, para las condiciones de la tienda
 * (R6.5): nombre, porcentaje, hasta cuándo, sobre qué y con qué se combina.
 * Sin ids de productos, versión ni quién confirmó.
 * @param {object[]} vigentes - De promocionesVigentes.
 * @param {Map<string, { id: string, nombre: string, slug: string }>} categoriasPorId - Las elegidas.
 */
export function promocionesPublicas(vigentes, categoriasPorId = new Map()) {
  return vigentes.map((p) => ({
    campanaId: p.campanaId,
    nombre: p.nombre,
    porcentaje: p.porcentaje,
    hasta: aIsoLima(p.hasta),
    alcance: {
      tipo: p.alcance.tipo,
      categorias: p.alcance.tipo === "categorias"
        ? p.alcance.elegidas.map((id) => categoriasPorId.get(id)).filter(Boolean)
            .map(({ id, nombre, slug }) => ({ id, nombre, slug }))
        : null,
      productos: p.alcance.tipo === "productos" ? p.alcance.productoIds.size : null
    },
    combinaCupones: p.permitirCupones,
    combinaEnvioGratis: p.permitirEnvioGratis
  }));
}

// ── Admin: guardar, revisar y avisar (C3b) ────────────────────────────────

const ordenados = (ids) => [...(ids ?? [])].sort();
const cuponComparable = (c) => (c
  ? [String(c.codigo).toUpperCase(), c.tipo, Number(c.valor), Number(c.minimoCompra ?? 0), c.usoMaximo ?? null, c.usoMaximoPorCliente ?? null]
  : null);

/**
 * ¿Cambia lo que se cobra? (R9.5): porcentaje, alcance (con sus ids), los dos
 * permisos o el cupón. Si cambia, la promoción sube de `version` y la
 * confirmación anterior deja de valer. Las fechas no cuentan aquí: cambian la
 * ventana, que la confirmación también guarda.
 */
export function cambiaLoQueSeCobra(antes, despues) {
  if (!antes || !despues) return antes !== despues;
  const firma = (p) => JSON.stringify([
    p.porcentaje, p.alcance,
    p.alcance === "categorias" ? ordenados(p.categoriaIds) : [],
    p.alcance === "productos" ? ordenados(p.productoIds) : [],
    Boolean(p.permitirCupones), Boolean(p.permitirEnvioGratis),
    cuponComparable(p.cupon)
  ]);
  return firma(antes) !== firma(despues);
}

/**
 * CA-9.4: una campaña activa con su promoción confirmada para la ventana en
 * curso o la próxima no se guarda con otro porcentaje, alcance, permisos,
 * cupón o fechas sin una confirmación nueva. Apagarla o quitar la promoción
 * no lo pide (no cobra de menos sin que el dueño lo sepa).
 */
export function requiereConfirmacion({ anterior, nueva, existente, confirmaciones, cambiaCobro, ahora, ediciones = null }) {
  if (!existente || !anterior?.activa || !nueva?.activa) return false;
  if (estadoPromocion(anterior, existente, confirmaciones, ahora, ediciones).estado !== "confirmada") return false;
  return cambiaCobro || estadoPromocion(nueva, existente, confirmaciones, ahora, ediciones).estado !== "confirmada";
}

/**
 * Guarda del PUT de diseño (T3b.7): nombre de la primera campaña cuya
 * promoción estaba confirmada para su ventana en curso o próxima y que, con
 * las fechas nuevas, dejaría de estarlo. Null si ninguna. Las fechas de una
 * campaña con promoción se cambian desde Campañas, con su confirmación.
 */
export function ventanaConfirmadaCambiada(anteriores, nuevas, promociones, confirmaciones, ahora, ediciones = null) {
  const antes = new Map((anteriores ?? []).map((c) => [c.id, c]));
  const despues = new Map((nuevas ?? []).map((c) => [c.id, c]));
  for (const p of promociones ?? []) {
    const a = antes.get(p.campanaId);
    const n = despues.get(p.campanaId);
    if (!a || !n) continue;
    if (estadoPromocion(a, p, confirmaciones, ahora, ediciones).estado !== "confirmada") continue;
    if (estadoPromocion(n, p, confirmaciones, ahora, ediciones).estado !== "confirmada") return efectiva(n)?.nombre ?? "La campaña";
  }
  return null;
}

/**
 * Promociones confirmadas de campañas activas que cubren al producto, en curso
 * o que empiezan en los próximos `dias` (R10.3 y R10.5): las lee el formulario
 * del producto y la guarda que impide subir el precio regular durante una
 * promoción en curso.
 * @param {{ id: string, categoriaId: string|null }} producto
 * @returns {Array<{ campanaId, nombre, porcentaje, inicio: Date, fin: Date, enCurso: boolean }>}
 */
export function promocionesDelProducto(campanasTienda, promociones, confirmaciones, categorias, producto, ahora, ediciones = null, dias = DIAS_PROXIMAS) {
  const porCampana = new Map((promociones ?? []).map((p) => [p.campanaId, p]));
  const limite = ahora.getTime() + dias * DIA_MS;
  const resultado = [];
  for (const campana of campanasAplicables(campanasTienda)) {
    const promocion = porCampana.get(campana.id);
    if (!promocion) continue;
    const v = proximaVentana(campana, ahora, ediciones);
    if (!v || v.inicio.getTime() > limite || !confirmadaPara(promocion, confirmaciones, v)) continue;
    if (!cubre(paraCalculo(promocion, categorias), producto)) continue;
    resultado.push({
      campanaId: campana.id, nombre: campana.nombre, porcentaje: promocion.porcentaje,
      inicio: v.inicio, fin: v.fin, enCurso: ahora >= v.inicio
    });
  }
  return resultado.sort((a, b) => a.inicio - b.inicio);
}

/**
 * Lo que el calendario del Admin muestra de la promoción de una campaña
 * (T3b.6): resumen, estado, quién y cuándo confirmó la ventana actual, y si
 * hay que recordarle confirmar la próxima edición (R9.6). Null sin promoción.
 */
export function promocionEnCalendario(campanaTienda, promocion, confirmaciones, ahora, ediciones = null, nombreCategoria = () => null) {
  if (!promocion) return null;
  const { estado, ventana, recordar } = estadoPromocion(campanaTienda, promocion, confirmaciones, ahora, ediciones);
  const confirmacion = estado === "confirmada"
    ? (confirmaciones ?? [])
        .filter((c) => c.promocionId === promocion.id && c.promocionVersion === promocion.version && mismaVentana(c, ventana))
        .at(-1)
    : null;
  return {
    resumen: resumenPromocion(promocion, nombreCategoria),
    // El paso 2 y Diseño comparan el texto de la portada con este número (R3.3).
    porcentaje: promocion.porcentaje,
    estado,
    confirmacion: confirmacion ? { por: confirmacion.confirmadoPor, en: confirmacion.confirmadoEn } : null,
    recordar
  };
}

const FECHA_HORA = new Intl.DateTimeFormat("es-PE", {
  weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Lima"
});

/**
 * "lun 30 nov, 23:59" en hora de Lima. Con `fin`, el último minuto de una
 * ventana (que termina, exclusiva, a las 00:00 del día siguiente).
 */
export function textoFechaHora(instante, { fin = false } = {}) {
  const d = new Date(new Date(instante).getTime() - (fin ? 1 : 0));
  const p = Object.fromEntries(FECHA_HORA.formatToParts(d).map((x) => [x.type, x.value.replace(/\./g, "")]));
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute}`;
}
