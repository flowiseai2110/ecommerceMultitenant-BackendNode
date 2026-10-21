import { prisma } from "../../config/prisma.js";
import { ConflictError, NotFoundError, ValidationError } from "../../utils/errors.js";
import { getDiseno } from "../../services/tienda-diseno.service.js";
import { datosDe } from "../negocio/datos.js";
import { invalidateTiendasCaches } from "../tenants/tiendas.cache.js";
import { invalidarContexto } from "../precios/contexto.cache.js";
import { leerPromociones } from "../precios/contexto.service.js";
import { aCentimos, aSoles, precioVigente } from "../precios/precio-vigente.js";
import { clear as limpiarCatalogo } from "../catalogo/productos.cache.js";
import { precioHistorialRepository } from "../catalogo/precio-historial.repository.js";
import { restarDias, subidasEnVentana, tieneHistorial } from "../catalogo/precio-historial.js";
import { aIsoLima, proximaVentana } from "./calendario.js";
import { efectiva } from "./resolver.js";
import { listaCampanasSchema } from "./campanas.schema.js";
import { validarCampanasDeTienda } from "./campanas.validacion.js";
import { edicionesParaResolver } from "./ediciones.service.js";
import {
  PORCENTAJE_MUY_ALTO, cambiaLoQueSeCobra, conSubcategorias, estadoPromocion, paraCalculo,
  promocionEnCalendario, promocionesDelProducto, requiereConfirmacion, resumenPromocion, textoFechaHora
} from "./promocion.js";
import * as repo from "./promocion.repository.js";

/**
 * Paso 3 de una campaña en el Admin (docs/specs/campanas-descuento, impacto
 * "Admin: guardar la campaña completa en una sola operación", decisión E2).
 * Lee y escribe con promocion.repository.js; las reglas son de promocion.js.
 * Los textos son del Admin (en español): no van al catálogo de traducciones.
 */

export const MENSAJES = {
  sinCarrito: "Esta tienda no usa promociones de precio",
  confirmar: "Confirma la promoción para guardar este cambio",
  cambio: "La promoción cambió desde que la revisaste. Vuelve a revisarla y confirma de nuevo",
  idsAjenos: "Hay categorías o productos que no son de esta tienda",
  sinVentana: "Esta campaña ya terminó: no hay fechas que confirmar",
  sinPromocion: "No hay una promoción que confirmar",
  otraCampana: "La campaña no coincide con la de la dirección",
  cuponOcupado: "Ya existe un cupón con ese código"
};

const MUESTRA = 5;

/**
 * El paso 3 existe por lo que la tienda hace (vende con carrito), no por su
 * rubro (R11.1, decisión E6). Único lugar del backend que lo decide: cuando la
 * promoción llegue a los rubros con reserva, se cambia aquí.
 */
export const admitePromociones = (tipoNegocio) => Boolean(datosDe(tipoNegocio)?.carrito);

const rechazar = (message, campo = "promocion") => {
  throw new ValidationError(message, { message, body: { [campo]: [message] } });
};
const conflicto = (message, motivo, extra = {}) => {
  throw new ConflictError(message, { message, motivo, ...extra });
};

const tiempo = (fecha) => new Date(fecha).getTime();

function exigirCarrito(tipoNegocio) {
  if (tipoNegocio === undefined) throw new NotFoundError("Tienda");
  if (!admitePromociones(tipoNegocio)) rechazar(MENSAJES.sinCarrito);
}

/** Ventana en curso o próxima de la campaña (la que se confirma), o null. */
function ventanaDe(campana, ahora, ediciones) {
  const ef = efectiva(campana);
  const v = ef ? proximaVentana(ef, ahora, ediciones) : null;
  return v ? { inicio: v.inicio, fin: v.fin } : null;
}

/** Ventana para el Admin: instantes en hora de Lima y el texto con día de la semana (R9.2). */
const ventanaAdmin = (v) => v && {
  inicio: aIsoLima(v.inicio),
  fin: aIsoLima(v.fin),
  desde: textoFechaHora(v.inicio),
  hasta: textoFechaHora(v.fin, { fin: true })
};

/**
 * Guarda una campaña con su promoción en **una transacción** (T3b.3):
 * 1. bloquea la fila "campanas" de la tienda y reemplaza solo esta campaña;
 * 2. valida lo de siempre (`listaCampanasSchema`, `validarCampanasDeTienda`, R8);
 * 3. con promoción: tienda con carrito (R11.1), ids de la tienda, cupón libre;
 * 4. sube la `version` si cambia lo que se cobra (R9.5);
 * 5. 409 CONFIRMACION_REQUERIDA si toca una promoción confirmada sin confirmar
 *    (CA-9.4) y 409 PROMOCION_CAMBIO si lo confirmado no es lo que hay (E2);
 * 6. con `confirmar`, registra la confirmación de esa versión y esa ventana (R9.4, R9.6).
 * Si algo falla, nada cambia (CA-9.1).
 */
export async function guardarCampana(tiendaId, campanaId, { campana, promocion, confirmar }, user, ahora = new Date()) {
  if (campana.id !== campanaId) rechazar(MENSAJES.otraCampana, "campana");
  const usuario = user?.email || user?.id || "system";
  const ediciones = await edicionesParaResolver();

  await prisma.$transaction(async (tx) => {
    const anteriores = await repo.bloquearCampanas(tx, tiendaId);
    const tipoNegocio = await repo.tipoNegocioDe(tx, tiendaId);
    if (promocion || confirmar) exigirCarrito(tipoNegocio);

    const anterior = anteriores.find((c) => c.id === campanaId) ?? null;
    const nuevas = anterior ? anteriores.map((c) => (c.id === campanaId ? campana : c)) : [...anteriores, campana];
    const lista = listaCampanasSchema.safeParse(nuevas);
    if (!lista.success) rechazar(lista.error.issues[0]?.message ?? "Campañas inválidas", "campanas");
    await validarCampanasDeTienda(tiendaId, nuevas);

    const existente = await repo.leerPromocion(tx, tiendaId, campanaId);
    const confirmaciones = existente ? await repo.confirmacionesDe(tx, tiendaId, existente.id) : [];

    if (!promocion) {
      if (confirmar) rechazar(MENSAJES.sinPromocion);
      await repo.guardarCampanas(tx, tiendaId, nuevas, usuario);
      // Quitar la promoción no cobra de más: no pide confirmación.
      if (existente) await repo.borrarPromociones(tx, tiendaId, [campanaId]);
      return;
    }

    if (!(await repo.idsSonDeLaTienda(tx, tiendaId, promocion))) rechazar(MENSAJES.idsAjenos);
    if (promocion.cupon && (await repo.codigoCuponOcupado(tx, tiendaId, promocion.cupon.codigo, existente?.id))) {
      rechazar(MENSAJES.cuponOcupado, "cupon");
    }

    const cambiaCobro = cambiaLoQueSeCobra(existente, promocion);
    const version = !existente ? 1 : cambiaCobro ? existente.version + 1 : existente.version;
    const ventana = ventanaDe(campana, ahora, ediciones);

    if (!confirmar && requiereConfirmacion({ anterior, nueva: campana, existente, confirmaciones, cambiaCobro, ahora, ediciones })) {
      conflicto(MENSAJES.confirmar, "CONFIRMACION_REQUERIDA");
    }
    if (confirmar) {
      if (!ventana) rechazar(MENSAJES.sinVentana, "confirmar");
      const vista = existente?.version ?? 0;
      const mismaVentana = tiempo(confirmar.ventanaInicio) === ventana.inicio.getTime() && tiempo(confirmar.ventanaFin) === ventana.fin.getTime();
      if (confirmar.version !== vista || !mismaVentana) {
        conflicto(MENSAJES.cambio, "PROMOCION_CAMBIO", { version: vista, ventana: ventanaAdmin(ventana) });
      }
    }

    await repo.guardarCampanas(tx, tiendaId, nuevas, usuario);
    const promocionId = await repo.guardarPromocion(tx, tiendaId, campanaId, promocion, { version, usuario, ventana });
    if (confirmar) {
      await repo.insertarConfirmacion(tx, {
        tiendaId,
        promocionId,
        campanaId,
        promocionVersion: version,
        ventanaInicio: ventana.inicio,
        ventanaFin: ventana.fin,
        // Qué confirmó (R9.4): porcentaje, alcance con sus ids, permisos y cupón.
        detalle: {
          porcentaje: promocion.porcentaje,
          alcance: promocion.alcance,
          categoriaIds: promocion.categoriaIds,
          productoIds: promocion.productoIds,
          permitirCupones: promocion.permitirCupones,
          permitirEnvioGratis: promocion.permitirEnvioGratis,
          cupon: promocion.cupon
        },
        confirmadoPor: usuario
      });
    }
  });

  // Cambia lo que se cobra: la vitrina y el contexto de precios no esperan al TTL.
  invalidarContexto(tiendaId);
  limpiarCatalogo();
  invalidateTiendasCaches();
  return obtenerPromocion(tiendaId, campanaId, ahora);
}

/**
 * La campaña guardada y su promoción para el paso 3 (GET): ids, cupón, estado,
 * ventana que se confirmaría, resumen y la última confirmación (R9.4).
 */
export async function obtenerPromocion(tiendaId, campanaId, ahora = new Date()) {
  const [{ campanas = [] }, promocion, ediciones] = await Promise.all([
    getDiseno(tiendaId),
    repo.leerPromocion(prisma, tiendaId, campanaId),
    edicionesParaResolver()
  ]);
  const campana = (Array.isArray(campanas) ? campanas : []).find((c) => c.id === campanaId) ?? null;
  if (!campana && !promocion) throw new NotFoundError("Campaña");

  const confirmaciones = promocion ? await repo.confirmacionesDe(prisma, tiendaId, promocion.id) : [];
  const { estado, ventana, recordar } = campana
    ? estadoPromocion(campana, promocion, confirmaciones, ahora, ediciones)
    : { estado: "sin-promocion", ventana: null, recordar: false };
  const categorias = promocion?.alcance === "categorias" ? await repo.arbolCategorias(prisma, tiendaId) : [];
  const nombres = new Map(categorias.map((c) => [c.id, c.nombre]));
  const ultima = confirmaciones.at(-1) ?? null;

  return {
    campana,
    promocion,
    estado,
    recordar,
    ventana: ventanaAdmin(ventana),
    resumen: promocion ? resumenPromocion(promocion, (id) => nombres.get(id) ?? null) : null,
    ultimaConfirmacion: ultima && {
      por: ultima.confirmadoPor,
      en: ultima.confirmadoEn,
      version: ultima.promocionVersion,
      ventana: ventanaAdmin({ inicio: ultima.ventanaInicio, fin: ultima.ventanaFin }),
      detalle: ultima.detalle
    }
  };
}

const muestra = (lista) => ({ total: lista.length, muestra: lista.slice(0, MUESTRA) });

/**
 * Revisión de un borrador de promoción (T3b.4), solo lectura:
 * - siempre: cuántos productos entran hoy (activos con stock, R4.5) y un
 *   ejemplo calculado con la regla única de precio (R4.6, CA-4.6);
 * - con `completa` (el diálogo de confirmación, R9.2): la ventana con día de
 *   la semana, `muyAlto` (≥ 50 %, R4.2), los que quedarían bajo su costo
 *   (R4.9, CA-4.8), los que ya tienen oferta propia (R10.7, CA-10.7), los que
 *   subieron de precio regular en los 30 días previos al inicio (R10.2,
 *   CA-10.2) y los que aún no tienen 30 días de historial (R10.4, CA-10.5).
 * Lee `precioCosto`: solo para el Admin.
 */
export async function revision(tiendaId, campanaId, { promocion, campana = null }, { completa = false } = {}, ahora = new Date()) {
  exigirCarrito(await repo.tipoNegocioDe(prisma, tiendaId));
  if (!(await repo.idsSonDeLaTienda(prisma, tiendaId, promocion))) rechazar(MENSAJES.idsAjenos);

  const arbol = await repo.arbolCategorias(prisma, tiendaId);
  const calculo = paraCalculo({ ...promocion, campanaId }, arbol);
  const productos = await repo.productosDelAlcance(prisma, tiendaId, {
    alcance: promocion.alcance,
    categoriaIds: conSubcategorias(promocion.categoriaIds, arbol),
    productoIds: promocion.productoIds
  });

  // El ejemplo sale de la regla única (precioVigente), con el precio del primer producto o S/ 100.
  const base = productos[0] ?? null;
  const ejemplo = precioVigente({ precioBase: base?.precioBase ?? 100 }, null, {
    promociones: [{ ...calculo, alcance: { ...calculo.alcance, tipo: "tienda" } }]
  });
  const resultado = {
    productos: productos.length,
    ejemplo: {
      regular: aSoles(ejemplo.regular),
      vigente: aSoles(ejemplo.unitario),
      producto: base ? { id: base.id, nombre: base.nombre } : null
    }
  };
  if (!completa) return resultado;

  const ediciones = await edicionesParaResolver();
  let fuente = campana;
  if (!fuente) {
    const { campanas = [] } = await getDiseno(tiendaId);
    fuente = (Array.isArray(campanas) ? campanas : []).find((c) => c.id === campanaId) ?? null;
    if (!fuente) throw new NotFoundError("Campaña");
  }
  const ventana = ventanaDe(fuente, ahora, ediciones);
  if (!ventana) rechazar(MENSAJES.sinVentana, "campana");

  const bajoCosto = [];
  const conOferta = [];
  for (const p of productos) {
    const sinPromocion = precioVigente(p, null, {});
    const conPromocion = precioVigente(p, null, { promociones: [calculo] });
    if (sinPromocion.origen === "oferta") conOferta.push({ id: p.id, nombre: p.nombre });
    const costo = aCentimos(p.precioCosto);
    if (costo > 0 && conPromocion.unitario < costo) {
      bajoCosto.push({ id: p.id, nombre: p.nombre, precio: aSoles(conPromocion.unitario), costo: aSoles(costo) });
    }
  }

  const ids = productos.map((p) => p.id);
  const desde = restarDias(ventana.inicio);
  const [historial, primeros] = await Promise.all([
    precioHistorialRepository.historialDe(tiendaId, ids, desde),
    precioHistorialRepository.primerRegistro(tiendaId, ids)
  ]);
  const porProducto = new Map();
  for (const fila of historial) {
    if (!porProducto.has(fila.productoId)) porProducto.set(fila.productoId, []);
    porProducto.get(fila.productoId).push(fila);
  }
  const subidas = [];
  const sinHistorial = [];
  for (const p of productos) {
    const ultima = subidasEnVentana(porProducto.get(p.id), { desde, hasta: ventana.inicio }).at(-1);
    if (ultima) {
      subidas.push({ id: p.id, nombre: p.nombre, antes: Number(ultima.precioAnterior), ahora: Number(ultima.precioNuevo), fecha: ultima.fecha });
    }
    const primero = primeros.get(p.id);
    if (!tieneHistorial(primero ? [{ fecha: primero }] : [], ventana.inicio)) sinHistorial.push({ id: p.id, nombre: p.nombre });
  }

  return {
    ...resultado,
    ventana: ventanaAdmin(ventana),
    porcentaje: promocion.porcentaje,
    muyAlto: promocion.porcentaje >= PORCENTAJE_MUY_ALTO,
    bajoCosto: muestra(bajoCosto),
    conOferta: muestra(conOferta),
    // La lista completa (para "Ver todos") va en `ids`.
    subidas: { ...muestra(subidas), ids: subidas.map((s) => s.id) },
    sinHistorial: muestra(sinHistorial)
  };
}

/**
 * Promociones confirmadas que cubren al producto, en curso o que empiezan en
 * los próximos 30 días (T3b.9): el aviso R10.3 y el bloqueo R10.5 del formulario.
 * @param {{ id: string, tiendaId: string, categoriaId: string|null }} producto
 */
export async function promocionesDeProducto(producto, ahora = new Date()) {
  const datos = await leerPromociones(prisma, producto.tiendaId);
  if (!datos) return [];
  const { campanas, promociones, confirmaciones, categorias, ediciones } = datos;
  return promocionesDelProducto(campanas, promociones, confirmaciones, categorias, producto, ahora, ediciones)
    .map((p) => ({ ...p, inicio: aIsoLima(p.inicio), fin: aIsoLima(p.fin), hasta: textoFechaHora(p.fin, { fin: true }) }));
}

/** Lo mismo desde el id del producto (GET /admin/productos/:id/promociones). */
export async function promocionesDeProductoId(productoId, ahora = new Date()) {
  const producto = await repo.productoParaGuarda(prisma, productoId);
  return producto ? promocionesDeProducto(producto, ahora) : [];
}

/**
 * Calendario del Admin con la promoción de cada campaña (T3b.6): resumen,
 * estado, quién confirmó y si hay que recordar la próxima edición. Tiendas sin
 * promociones: `promocion: null` sin más consultas que la del camino rápido.
 */
export async function conPromociones(tiendaId, filas, campanasTienda, ahora = new Date()) {
  const datos = await leerPromociones(prisma, tiendaId);
  if (!datos) return filas.map((f) => ({ ...f, promocion: null }));
  const { promociones, confirmaciones, categorias, ediciones } = datos;
  const porCampana = new Map(promociones.map((p) => [p.campanaId, p]));
  const campanas = new Map((campanasTienda ?? []).map((c) => [c.id, c]));
  const nombres = new Map(categorias.map((c) => [c.id, c.nombre]));
  return filas.map((f) => {
    const promocion = f.campanaId ? porCampana.get(f.campanaId) : null;
    const campana = f.campanaId ? campanas.get(f.campanaId) : null;
    return {
      ...f,
      promocion: promocion && campana
        ? promocionEnCalendario(campana, promocion, confirmaciones, ahora, ediciones, (id) => nombres.get(id) ?? null)
        : null
    };
  });
}

/** Ids para "Seleccionar los N resultados" del selector de productos (A5b, T3b.9). */
export const idsParaSeleccion = (tiendaId, filtros) => repo.idsDeProductos(prisma, tiendaId, filtros);
