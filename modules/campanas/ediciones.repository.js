import { prisma } from "../../config/prisma.js";
import { runUnscoped } from "../../kernel/tenant/index.js";

/**
 * Acceso a campana_ediciones y su historial (docs/specs/campanas-cuando R2).
 * Son datos de la plataforma, sin tienda_id; sin reglas (las pone
 * ediciones.service.js). DATE y TIME de la BD se traducen a "YYYY-MM-DD" y
 * "HH:mm" aquí, para que el resto del módulo trabaje con el mismo formato que
 * las campañas de la tienda.
 */

const aFecha = (d) => d.toISOString().slice(0, 10);
const aHora = (d) => (d ? d.toISOString().slice(11, 16) : null);
const deFecha = (f) => new Date(`${f}T00:00:00.000Z`);
const deHora = (h) => (h ? new Date(`1970-01-01T${h}:00.000Z`) : null);

/** Fila de la BD → forma del dominio (la que lee calendario.js). */
export function aEdicion(fila) {
  return {
    id: fila.id,
    presetId: fila.presetId,
    anio: fila.anio,
    clave: fila.clave,
    nombre: fila.nombre,
    inicio: aFecha(fila.fechaInicio),
    horaInicio: aHora(fila.horaInicio),
    fin: aFecha(fila.fechaFin),
    horaFin: aHora(fila.horaFin),
    fuente: fila.fuente ?? null,
    registradaPor: fila.usuarioActualizacion ?? fila.usuarioRegistro ?? null,
    registradaEn: fila.fechaActualizacion ?? fila.fechaRegistro ?? null
  };
}

const datos = (e) => ({
  nombre: e.nombre,
  fechaInicio: deFecha(e.inicio),
  horaInicio: deHora(e.horaInicio),
  fechaFin: deFecha(e.fin),
  horaFin: deHora(e.horaFin),
  fuente: e.fuente ?? null
});

/** Todas las ediciones (la tabla tiene unas pocas filas por año). */
export async function listarEdiciones() {
  const filas = await prisma.campana_ediciones.findMany({ orderBy: [{ anio: "asc" }, { fechaInicio: "asc" }] });
  return filas.map(aEdicion);
}

export async function listarHistorial(presetId, anio) {
  return prisma.campana_ediciones_historial.findMany({
    where: { presetId, anio },
    orderBy: { fecha: "desc" }
  });
}

/**
 * Crea o cambia una edición y anota el antes y el después en la misma
 * transacción (R2.7). `antes` es la edición actual (o null si es nueva).
 */
export async function guardarEdicion({ presetId, anio, clave }, nueva, antes, usuario, ahora = new Date()) {
  return prisma.$transaction(async (tx) => {
    const fila = antes
      ? await tx.campana_ediciones.update({
          where: { id: antes.id },
          data: { ...datos(nueva), usuarioActualizacion: usuario, fechaActualizacion: ahora }
        })
      : await tx.campana_ediciones.create({
          data: { presetId, anio, clave, ...datos(nueva), usuarioRegistro: usuario }
        });
    await tx.campana_ediciones_historial.create({
      data: {
        edicionId: fila.id, presetId, anio, clave,
        accion: antes ? "cambiar" : "crear",
        antes: antes ? instantanea(antes) : null,
        despues: instantanea(nueva),
        usuario,
        fecha: ahora
      }
    });
    return aEdicion(fila);
  });
}

export async function borrarEdicion(antes, usuario, ahora = new Date()) {
  await prisma.$transaction(async (tx) => {
    // El historial conserva la fila (edicion_id pasa a null al borrar).
    await tx.campana_ediciones_historial.create({
      data: {
        edicionId: antes.id, presetId: antes.presetId, anio: antes.anio, clave: antes.clave,
        accion: "borrar", antes: instantanea(antes), despues: null, usuario, fecha: ahora
      }
    });
    await tx.campana_ediciones.delete({ where: { id: antes.id } });
  });
}

/** Lo que se guarda en el historial: solo los datos de la edición. */
function instantanea(e) {
  return { nombre: e.nombre, inicio: e.inicio, horaInicio: e.horaInicio, fin: e.fin, horaFin: e.horaFin, fuente: e.fuente ?? null };
}

/**
 * Cuántas tiendas tienen activada la campaña (R7.7). Lee la configuración de
 * TODAS las tiendas a propósito (sin el auto-scope) y devuelve solo el
 * número: nunca ids ni nombres.
 */
export async function contarTiendasConCampana(presetId) {
  const filas = await runUnscoped(() => prisma.$queryRaw`
    SELECT COUNT(*)::int AS total
      FROM tienda_configuraciones
     WHERE categoria = 'diseno' AND clave = 'campanas'
       AND valor @> jsonb_build_array(jsonb_build_object('presetId', ${presetId}::text, 'activa', true))`);
  return Number(filas?.[0]?.total ?? 0);
}
