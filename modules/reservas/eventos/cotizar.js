import { fechaCorta, fechaLima, horaLima, horasEntre, sumarHoras } from "../tiempo.js";
import { textoAviso } from "../hotel/cotizar.js";

/**
 * Cotización de una compra de entradas: función pura (sin BD), como la del
 * hotel y la de tours (spec R4, R9).
 *
 * A diferencia de hotel y tours, el cupo es real: cada tipo de entrada tiene
 * `cupo`, `vendidos` (confirmadas) y lo `apartado` por compras que esperan el
 * pago. La compra se crea con su cupo apartado durante `apartadoManualMin`;
 * la verificación definitiva del cupo se repite dentro de la transacción con
 * las filas bloqueadas (eventos.service.js).
 */

/** Una función sin hora de fin se da por terminada 6 horas después de empezar. */
export const HORAS_FUNCION_POR_DEFECTO = 6;

const redondear = (n) => Math.round(n * 100) / 100;

export const finFuncion = (funcion) => funcion.fin ?? sumarHoras(funcion.inicio, HORAS_FUNCION_POR_DEFECTO);

/** Entradas que aún se pueden vender de un tipo. */
export const disponibles = (tipo, apartadas = 0) => Math.max(0, tipo.cupo - tipo.vendidos - apartadas);

/** Hasta cuándo se vende un tipo: su fecha límite o el inicio de la función. */
export const ventaHasta = (tipo, funcion) =>
  (tipo.ventaHasta && tipo.ventaHasta < funcion.inicio ? tipo.ventaHasta : funcion.inicio);

/**
 * Cierre de la venta en línea: con pago manual el organizador necesita tiempo
 * para verificar, así que puede cerrarla N horas antes de la función (R4.4).
 */
export function ventaEnLineaCerrada(funcion, config, ahora) {
  return Boolean(config.cierrePagoManualHoras) && horasEntre(ahora, funcion.inicio) < config.cierrePagoManualHoras;
}

/**
 * Estado de venta de un tipo para la vitrina (R4.2).
 * @returns {"disponible"|"ultimas"|"agotado"|"cerrado"}
 */
export function estadoVenta({ tipo, funcion, apartadas = 0, config, ahora }) {
  if (!tipo.activo || !funcion.activa || ventaHasta(tipo, funcion) <= ahora || ventaEnLineaCerrada(funcion, config, ahora)) return "cerrado";
  const quedan = disponibles(tipo, apartadas);
  if (quedan === 0) return "agotado";
  if (config.umbralUltimasEntradas && quedan <= config.umbralUltimasEntradas) return "ultimas";
  return "disponible";
}

const error = (codigo, mensaje, campo = null) => ({ codigo, mensaje, campo });

const etiquetaFuncion = (funcion) => `${fechaCorta(fechaLima(funcion.inicio))} ${horaLima(funcion.inicio)}`;

/**
 * Cotización completa.
 * @param {object} p
 * @param {object} p.funcion - evento_funciones (inicio, fin, activa)
 * @param {Array} p.tipos - evento_tipos_entrada de la función (cupo, vendidos, precio, activo, ventaHasta)
 * @param {Map<string, number>} p.apartadas - entradas apartadas por tipo (compras sin confirmar vigentes)
 * @param {Array<{ tipoId: string, cantidad: number }>} p.entradas - lo que pide el comprador
 * @param {object} p.config - configuración de reservas resuelta
 * @param {Date} [p.ahora]
 */
export function cotizarEvento({ funcion, tipos, apartadas = new Map(), entradas = [], config, ahora = new Date() }) {
  const errores = [];
  const porId = new Map(tipos.map(t => [t.id, t]));
  const lineas = [];
  const items = [];
  let personas = 0;

  const funcionCerrada = !funcion.activa || funcion.inicio <= ahora;
  if (funcionCerrada) {
    errores.push(error("FUNCION_CERRADA", "La venta para esta función ya cerró", "funcionId"));
  } else if (ventaEnLineaCerrada(funcion, config, ahora)) {
    errores.push(error("VENTA_CERRADA",
      `La venta en línea cierra ${config.cierrePagoManualHoras} ${config.cierrePagoManualHoras === 1 ? "hora" : "horas"} antes de la función. Consulta con el organizador por entradas en puerta`, "funcionId"));
  }

  for (const e of entradas) {
    if (!e.cantidad) continue;
    const tipo = porId.get(e.tipoId);
    if (!tipo) {
      errores.push(error("TIPO_ENTRADA_INVALIDO", "Uno de los tipos de entrada ya no está disponible. Actualiza la página", "entradas"));
      continue;
    }
    const estado = funcionCerrada ? "cerrado" : estadoVenta({ tipo, funcion, apartadas: apartadas.get(tipo.id) ?? 0, config, ahora });
    const quedan = disponibles(tipo, apartadas.get(tipo.id) ?? 0);
    if (estado === "cerrado" && !funcionCerrada) {
      errores.push(error("VENTA_CERRADA_TIPO", `La venta de "${tipo.nombre}" ya cerró`, "entradas"));
    } else if (estado === "agotado") {
      errores.push(error("AGOTADO", `"${tipo.nombre}" está agotada`, "entradas"));
    } else if (e.cantidad > quedan) {
      errores.push(error("SIN_CUPO", `Solo ${quedan === 1 ? "queda 1 entrada" : `quedan ${quedan} entradas`} "${tipo.nombre}"`, "entradas"));
    }
    const precio = Number(tipo.precio);
    personas += e.cantidad;
    lineas.push({
      descripcion: `${tipo.nombre} × ${e.cantidad} · ${etiquetaFuncion(funcion)}`,
      cantidad: e.cantidad,
      precioUnitario: precio,
      total: redondear(precio * e.cantidad)
    });
    items.push({ tipoEntradaId: tipo.id, nombre: tipo.nombre, cantidad: e.cantidad, precio });
  }

  if (personas < 1) {
    errores.push(error("SIN_ENTRADAS", "Elige al menos una entrada", "entradas"));
  } else if (personas > config.maxEntradasPorCompra) {
    errores.push(error("MAX_ENTRADAS", `Puedes comprar hasta ${config.maxEntradasPorCompra} entradas por compra`, "entradas"));
  }

  const total = redondear(lineas.reduce((s, l) => s + l.total, 0));
  const horasFaltan = horasEntre(ahora, funcion.inicio);
  const aviso = config.avisoProximoHoras && horasFaltan > 0 && horasFaltan < config.avisoProximoHoras
    ? { texto: textoAviso(config.avisoProximoTexto, funcion.inicio, ahora), hora: horaLima(funcion.inicio) }
    : null;

  // El apartado nunca pasa del inicio de la función.
  const limite = new Date(ahora.getTime() + config.apartadoManualMin * 60 * 1000);
  const apartadoHasta = limite < funcion.inicio ? limite : funcion.inicio;

  return {
    inicio: funcion.inicio,
    fin: finFuncion(funcion),
    noches: null,
    horas: null,
    personas,
    items,
    lineas,
    total,
    // Las entradas se pagan completas: no hay adelanto ni saldo en destino.
    montoAPagar: total,
    saldoDestino: 0,
    apartadoHasta,
    aviso,
    errores
  };
}
