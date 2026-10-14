import { ValidationError } from "../../utils/errors.js";
import { datosDe } from "../negocio/datos.js";

/**
 * Formulario de la reserva configurable por tienda (docs/specs/plantillas-por-rubro,
 * parte 4 · nivel 1). Nombres, apellidos, correo y celular son fijos: el sistema
 * los necesita para confirmar, avisar y limitar las reservas abiertas. El resto
 * lo decide el negocio: obligatorio, opcional o no pedir.
 *
 * El rubro declara qué campos tiene y cómo vienen (`formularioReserva` en
 * negocio/<rubro>/datos.js); un campo que su rubro no declara no existe para él.
 * La tienda guarda solo lo que cambia (`config_reservas.campos_formulario`).
 */
export const CAMPOS_FORMULARIO = ["documento", "nacionalidad", "nacimiento", "horaLlegada", "comentarios"];
export const MODOS_CAMPO = ["obligatorio", "opcional", "oculto"];

/** Lo de hoy en los rubros sin formulario propio: documento y nacionalidad obligatorios, comentarios opcionales. */
const POR_DEFECTO = { documento: "obligatorio", nacionalidad: "obligatorio", comentarios: "opcional" };

/**
 * Campos del rubro con el modo que eligió la tienda.
 * @param {string} tipoNegocio
 * @param {Record<string, string>|null|undefined} guardado
 * @returns {Record<string, "obligatorio"|"opcional"|"oculto">}
 */
export function formularioDe(tipoNegocio, guardado) {
  const base = datosDe(tipoNegocio).formularioReserva ?? POR_DEFECTO;
  const resultado = {};
  for (const campo of CAMPOS_FORMULARIO) {
    if (!(campo in base)) continue;
    const elegido = guardado?.[campo];
    resultado[campo] = MODOS_CAMPO.includes(elegido) ? elegido : base[campo];
  }
  return resultado;
}

const vacio = (v) => v === null || v === undefined || (typeof v === "string" && !v.trim());

/** Lo que el formulario pide de cada campo en los datos de la solicitud. */
const VALOR = {
  documento: (d) => (vacio(d.titular.docTipo) || vacio(d.titular.docNumero) ? null : d.titular.docNumero),
  nacionalidad: (d) => d.titular.nacionalidad,
  nacimiento: (d) => d.titular.nacimiento,
  horaLlegada: (d) => d.horaLlegada,
  comentarios: (d) => d.comentarios
};
const LIMPIAR = {
  documento: (d) => { d.titular.docTipo = null; d.titular.docNumero = null; },
  nacionalidad: (d) => { d.titular.nacionalidad = null; },
  nacimiento: (d) => { d.titular.nacimiento = null; },
  horaLlegada: (d) => { d.horaLlegada = null; },
  comentarios: (d) => { d.comentarios = null; }
};
const MENSAJE = {
  documento: "Ingresa tu documento", nacionalidad: "Elige tu nacionalidad", nacimiento: "Ingresa tu fecha de nacimiento",
  horaLlegada: "Indica tu hora estimada de llegada", comentarios: "Escribe tus comentarios"
};

/**
 * Exige lo obligatorio y descarta lo que la tienda no pide (no se guarda un dato
 * que el negocio decidió no pedir). Muta y devuelve `datos`.
 * @throws {ValidationError} 400 con el primer campo que falta
 */
export function aplicarFormulario(datos, formulario) {
  for (const campo of CAMPOS_FORMULARIO) {
    const modo = formulario[campo] ?? "oculto";
    if (modo === "oculto") LIMPIAR[campo](datos);
    else if (modo === "obligatorio" && vacio(VALOR[campo](datos))) {
      throw new ValidationError(MENSAJE[campo], { message: MENSAJE[campo], motivo: "CAMPO_REQUERIDO", campo });
    }
  }
  return datos;
}
