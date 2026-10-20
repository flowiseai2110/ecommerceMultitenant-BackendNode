import { ValidationError } from "../../utils/errors.js";
import { GRUPOS_TEXTOS } from "../idiomas/grupos.js";

/**
 * Contrato de lo que todo rubro implementa (docs/specs/perfil-negocio).
 *
 * El código común (CRUD de productos, pedidos, reservas...) no sabe de rubros: le
 * pregunta a la estrategia de la tienda solo en los puntos donde el rubro cambia la
 * regla. El test de contrato (__tests__/negocio.test.js) falla si a un rubro le falta algo.
 *
 * - prepararProducto(datos, { modo }): recibe el body ya validado por Zod
 *   ("crear" | "editar") y devuelve los datos a guardar, o lanza ValidationError.
 * - Datos del rubro (negocio/<rubro>/datos.js): carrito (vende con carrito: solo
 *   ese rubro crea pedidos de compra; precio-en-servidor D4), recibeReservas, planDePagos,
 *   transmisiones, alquilerPorHoras y marcas (capacidades), diseno { plantillaPorDefecto,
 *   secciones, layoutPorDefecto (lo que toda plantilla del rubro trae en su layout),
 *   rubroEnPlantillas (si el rubro de la tienda distingue plantillas), temaPorDefecto? }, configReservas (defaults), textoAviso (string o null) y
 *   gruposTextos (grupos del catálogo de textos fijos que muestra su tienda; docs/specs/idiomas D8) y
 *   nombreCatalogo (cómo se llama su catálogo en Traducciones: "Habitaciones", "Tours"…; diseno.md A1).
 * - agente: perfil del asesor de ventas, o null (usa el de productos).
 * - dashboard: widgets del dashboard del admin, arreglo no vacío de funciones
 *   `(ctx) => Promise<Widget | null>` (docs/specs/dashboard-por-rubro).
 * - reservas: la vertical del mini booking, o null si el rubro no recibe reservas.
 *   Obligatorio: cotizar({ tiendaId, datos, config, ahora }), tipoPedido, este.
 *   Opcional: estadoInicial, apartadoInicial, whereAbiertas, enTransaccion,
 *   traducirError, extraCotizacion, alCambiarEstado(tx, { pedido, anterior, nuevo, ahora })
 *   (lo llama aplicarAccion en cada transición: la vertical mantiene su inventario),
 *   mensajeMaxAbiertas(abiertas, este), notasIniciales { estado: nota }, avisaAlNegocio
 *   (false: el negocio no recibe la reserva nueva por correo)
 *   y alAceptar({ tiendaId, pedido, ahora }) (revisa lo del rubro antes de aceptar;
 *   el hotel, el cupo; `forzar` lo salta; docs/specs/antipatrones A3.3).
 */
export const CONTRATO = ["prepararProducto"];
export const CONTRATO_RESERVAS = {
  funciones: ["cotizar"],
  textos: ["tipoPedido", "este"],
  opcionales: ["estadoInicial", "apartadoInicial", "whereAbiertas", "enTransaccion", "traducirError", "extraCotizacion", "alCambiarEstado", "alAceptar", "modoConfirmacion", "mensajeMaxAbiertas"],
  /** Opcionales que son datos: si están, con este tipo. */
  datosOpcionales: { avisaAlNegocio: "boolean", notasIniciales: "object" }
};
export const CAPACIDADES = ["carrito", "recibeReservas", "planDePagos", "transmisiones", "alquilerPorHoras", "marcas"];

/** Lo que le falta a los datos de un rubro (negocio/<rubro>/datos.js). */
export function faltantesDeDatos(d) {
  const faltan = CAPACIDADES.filter((c) => typeof d?.[c] !== "boolean");
  if (typeof d?.diseno?.plantillaPorDefecto !== "string") faltan.push("diseno.plantillaPorDefecto");
  if (!Array.isArray(d?.diseno?.secciones) || !d.diseno.secciones.length) faltan.push("diseno.secciones");
  const l = d?.diseno?.layoutPorDefecto;
  if (typeof l !== "object" || l === null || Array.isArray(l)) faltan.push("diseno.layoutPorDefecto");
  if (typeof d?.diseno?.rubroEnPlantillas !== "boolean") faltan.push("diseno.rubroEnPlantillas");
  if (typeof d?.configReservas !== "object" || d.configReservas === null) faltan.push("configReservas");
  if (d?.textoAviso !== null && typeof d?.textoAviso !== "string") faltan.push("textoAviso");
  const g = d?.gruposTextos;
  if (!Array.isArray(g) || !g.includes("comun") || !g.every((x) => GRUPOS_TEXTOS.includes(x))) faltan.push("gruposTextos");
  if (typeof d?.nombreCatalogo !== "string" || !d.nombreCatalogo.trim()) faltan.push("nombreCatalogo");
  return faltan;
}

/** Lista lo que le falta a una estrategia para cumplir el contrato. */
export function faltantesDelContrato(estrategia) {
  const faltan = CONTRATO.filter((m) => typeof estrategia?.[m] !== "function");
  faltan.push(...faltantesDeDatos(estrategia));
  if (estrategia && !("agente" in estrategia)) faltan.push("agente");
  const d = estrategia?.dashboard;
  if (!Array.isArray(d) || !d.length || !d.every((w) => typeof w === "function")) faltan.push("dashboard");
  if (!estrategia || !("reservas" in estrategia)) return [...faltan, "reservas"];
  const r = estrategia.reservas;
  if (r === null) return faltan;
  return [
    ...faltan,
    ...CONTRATO_RESERVAS.funciones.filter((m) => typeof r[m] !== "function").map((m) => `reservas.${m}`),
    ...CONTRATO_RESERVAS.textos.filter((m) => typeof r[m] !== "string").map((m) => `reservas.${m}`),
    // Un hook opcional, si está, es una función (un typo como `alAceptar: true` no pasa).
    ...CONTRATO_RESERVAS.opcionales.filter((m) => m in r && typeof r[m] !== "function").map((m) => `reservas.${m}`),
    ...Object.entries(CONTRATO_RESERVAS.datosOpcionales).filter(([m, t]) => m in r && typeof r[m] !== t).map(([m]) => `reservas.${m}`)
  ];
}

/** Error de validación con el mismo formato que validate() (details.body.<campo>). */
export function errorDeCampo(campo, mensaje) {
  return new ValidationError("Errores de validación", { body: { [campo]: [mensaje] } });
}
