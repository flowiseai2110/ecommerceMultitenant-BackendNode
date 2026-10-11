import { ValidationError } from "../../utils/errors.js";

/**
 * Contrato de lo que todo rubro implementa (docs/specs/perfil-negocio).
 *
 * El código común (CRUD de productos, pedidos, reservas...) no sabe de rubros: le
 * pregunta a la estrategia de la tienda solo en los puntos donde el rubro cambia la
 * regla. El test de contrato (__tests__/negocio.test.js) falla si a un rubro le falta algo.
 *
 * - prepararProducto(datos, { modo }): recibe el body ya validado por Zod
 *   ("crear" | "editar") y devuelve los datos a guardar, o lanza ValidationError.
 * - Datos del rubro (negocio/<rubro>/datos.js): recibeReservas, planDePagos y
 *   transmisiones (capacidades), diseno { plantillaPorDefecto, secciones },
 *   configReservas (defaults) y textoAviso (string o null).
 * - agente: perfil del asesor de ventas, o null (usa el de productos).
 * - reservas: la vertical del mini booking, o null si el rubro no recibe reservas.
 *   Obligatorio: cotizar({ tiendaId, datos, config, ahora }), tipoPedido, este.
 *   Opcional: estadoInicial, apartadoInicial, whereAbiertas, enTransaccion,
 *   traducirError, extraCotizacion.
 */
export const CONTRATO = ["prepararProducto"];
export const CONTRATO_RESERVAS = { funciones: ["cotizar"], textos: ["tipoPedido", "este"] };
export const CAPACIDADES = ["recibeReservas", "planDePagos", "transmisiones"];

/** Lo que le falta a los datos de un rubro (negocio/<rubro>/datos.js). */
export function faltantesDeDatos(d) {
  const faltan = CAPACIDADES.filter((c) => typeof d?.[c] !== "boolean");
  if (typeof d?.diseno?.plantillaPorDefecto !== "string") faltan.push("diseno.plantillaPorDefecto");
  if (!Array.isArray(d?.diseno?.secciones) || !d.diseno.secciones.length) faltan.push("diseno.secciones");
  if (typeof d?.configReservas !== "object" || d.configReservas === null) faltan.push("configReservas");
  if (d?.textoAviso !== null && typeof d?.textoAviso !== "string") faltan.push("textoAviso");
  return faltan;
}

/** Lista lo que le falta a una estrategia para cumplir el contrato. */
export function faltantesDelContrato(estrategia) {
  const faltan = CONTRATO.filter((m) => typeof estrategia?.[m] !== "function");
  faltan.push(...faltantesDeDatos(estrategia));
  if (estrategia && !("agente" in estrategia)) faltan.push("agente");
  if (!estrategia || !("reservas" in estrategia)) return [...faltan, "reservas"];
  const r = estrategia.reservas;
  if (r === null) return faltan;
  return [
    ...faltan,
    ...CONTRATO_RESERVAS.funciones.filter((m) => typeof r[m] !== "function").map((m) => `reservas.${m}`),
    ...CONTRATO_RESERVAS.textos.filter((m) => typeof r[m] !== "string").map((m) => `reservas.${m}`)
  ];
}

/** Error de validación con el mismo formato que validate() (details.body.<campo>). */
export function errorDeCampo(campo, mensaje) {
  return new ValidationError("Errores de validación", { body: { [campo]: [mensaje] } });
}
