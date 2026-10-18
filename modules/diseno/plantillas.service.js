import { prisma } from "../../config/prisma.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";
import { datosDe } from "../negocio/datos.js";
import { buscarPlantilla, siguienteOrden, tipoNegocioDe, todasLasPlantillas } from "./plantillas.js";
import { contenidoDePlantilla, idDePlantilla } from "./copia.js";
import { guardarFilaPlantilla } from "./plantillas.repo.js";
import { validarEstructuraDeTienda } from "./diseno.service.js";

// Plantillas de la plataforma creadas y editadas desde el editor de Diseño
// (docs/specs/editor-diseno-en-vivo, fase 2). Solo para el administrador de
// la plataforma: las rutas lo exigen con requirePlatformAdmin.

const error400 = (message) => new ValidationError(message, { message });

/** Todas las del tipo de negocio, también las ocultas (P8). */
export function listarPlantillas(tipoNegocio) {
  return todasLasPlantillas().filter((p) => tipoNegocioDe(p) === tipoNegocio);
}

/** El diseño de una tienda, validado como al publicar (P4). */
async function disenoDeTienda(tiendaId, estructura, tema) {
  const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { tipoNegocio: true, rubro: true } });
  if (!tienda) throw new NotFoundError("Tienda no encontrada");
  const validada = await validarEstructuraDeTienda(tiendaId, estructura);
  const tipoNegocio = tipoNegocioDe(buscarPlantilla(datosDe(tienda.tipoNegocio).diseno.plantillaPorDefecto));
  return { tienda, tipoNegocio, contenido: contenidoDePlantilla(validada, tema) };
}

/** Plantilla nueva con el diseño de una tienda (P4, P5). */
export async function crearPlantilla({ tiendaId, nombre, descripcion, estructura, tema }, user) {
  const { tienda, tipoNegocio, contenido } = await disenoDeTienda(tiendaId, estructura, tema);
  const id = idDePlantilla(nombre, (candidato) => buscarPlantilla(candidato) !== null);
  await guardarFilaPlantilla({
    id,
    tipoNegocio,
    // El rubro (moda, alimentos…) distingue plantillas solo donde el tipo de negocio lo pide.
    rubro: datosDe(tipoNegocio).diseno.rubroEnPlantillas ? tienda.rubro ?? "general" : "general",
    nombre: nombre.trim(),
    descripcion: descripcion.trim(),
    version: 1,
    orden: siguienteOrden(tipoNegocio),
    activa: true,
    contenido
  }, usuarioDe(user));
  return buscarPlantilla(id);
}

/**
 * Cambia datos, orden o visibilidad, o reemplaza el diseño con el de una
 * tienda (P6). Una del código se edita guardando su reemplazo en la base.
 */
export async function actualizarPlantilla(id, cambios, user) {
  const actual = buscarPlantilla(id);
  if (!actual) throw new NotFoundError("Plantilla inexistente");

  const tipoNegocio = tipoNegocioDe(actual);
  if (cambios.activa === false && datosDe(tipoNegocio).diseno.plantillaPorDefecto === id) {
    throw error400("Es la plantilla por defecto de este tipo de negocio: no se puede ocultar");
  }

  let contenido = {
    radio: actual.radio, encabezados: actual.encabezados, layout: actual.layout, secciones: actual.secciones, tema: actual.tema ?? null
  };
  let version = actual.version;
  if (cambios.estructura) {
    const diseno = await disenoDeTienda(cambios.tiendaId, cambios.estructura, cambios.tema ?? null);
    if (diseno.tipoNegocio !== tipoNegocio) throw error400("El diseño es de una tienda de otro tipo de negocio");
    contenido = diseno.contenido;
    version += 1;
  }

  await guardarFilaPlantilla({
    id,
    tipoNegocio,
    rubro: actual.rubro ?? "general",
    nombre: cambios.nombre?.trim() ?? actual.nombre,
    descripcion: cambios.descripcion?.trim() ?? actual.descripcion,
    version,
    orden: cambios.orden ?? actual.orden,
    activa: cambios.activa ?? actual.activa,
    contenido
  }, usuarioDe(user));
  return buscarPlantilla(id);
}

function usuarioDe(user) {
  return user?.email || user?.id || "system";
}
