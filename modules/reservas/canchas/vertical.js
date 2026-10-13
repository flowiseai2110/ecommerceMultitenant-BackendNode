import { obtenerConfig } from "../reservas.config.service.js";
import { cierresDeProducto } from "../cierres.service.js";
import { instanteLima, sumarDias } from "../tiempo.js";
import { cotizarCancha, textoDuracion } from "./cotizar.js";
import { extrasDeTienda } from "../hotel/tarifas.service.js";
import { lineasExtras, montoACuenta } from "../hotel/cotizar.js";

const redondear = (n) => Math.round(n * 100) / 100;

/**
 * Extras del complejo (pelota, chalecos…; plantillas-por-rubro E5): el mismo
 * catálogo de extras de la tienda, cobrados por reserva y por la cantidad elegida.
 */
function sumarExtras(c, catalogo, elegidos, config) {
  const porReserva = catalogo.map(x => ({ ...x, cobro: "estadia" }));
  const extras = lineasExtras({ catalogo: porReserva, elegidos, noches: 1, personas: 1, esHoras: true });
  if (!extras.lineas.length && !extras.errores.length) return { ...c, extras: [] };
  const total = redondear(c.total + extras.lineas.reduce((s, l) => s + l.total, 0));
  const montoAPagar = montoACuenta(total, config);
  return {
    ...c,
    lineas: [...c.lineas, ...extras.lineas],
    errores: [...c.errores, ...extras.errores],
    total, montoAPagar, saldoDestino: redondear(total - montoAPagar),
    extras: extras.snapshot
  };
}
import { cargarCanchaParaReserva } from "./canchas.service.js";
import { actualizarOcupacion, liberar, ocupacionesVigentes, ocupar } from "./ocupaciones.js";

/**
 * Reservas de canchas (Strategy de reservas, modules/negocio/registro.js;
 * docs/specs/alquiler-canchas R4, R5).
 *
 * La reserva aparta el horario apenas se crea: con pago directo nace
 * `aceptada` y la cancha queda apartada `apartadoManualMin` minutos para subir
 * la captura. `alCambiarEstado` mantiene la ocupación en sincronía con cada
 * transición (la llama aplicarAccion dentro de su transacción).
 */

/** Hasta cuándo queda apartada la cancha esperando el pago (nunca después del inicio). */
const plazoDePago = (inicio, config, ahora) => {
  const limite = new Date(ahora.getTime() + config.apartadoManualMin * 60 * 1000);
  return limite < inicio ? limite : inicio;
};

/** Vuelve a ocupar el horario de una reserva cuya fila ya no está (venció y otra transacción la limpió). */
const reocupar = (tx, pedido, tipo, expiraEn) => ocupar(tx, {
  tiendaId: pedido.tiendaId, productoId: pedido.reserva.productoId, pedidoId: pedido.id,
  tipo, inicio: pedido.reserva.inicio, fin: pedido.reserva.fin, expiraEn
});

export const verticalCanchas = {
  tipoPedido: "cancha",
  este: "esta cancha",

  async cotizar({ tiendaId, datos, config, ahora }) {
    const { producto, cancha } = await cargarCanchaParaReserva(tiendaId, datos.productoId);
    const [ocupadas, cierres] = await Promise.all([
      ocupacionesVigentes(tiendaId, [producto.id], instanteLima(datos.fecha), instanteLima(sumarDias(datos.fecha, 1)), { ahora }),
      cierresDeProducto(tiendaId, producto.id, datos.fecha, datos.fecha)
    ]);
    const base = cotizarCancha({ cancha, config, fecha: datos.fecha, hora: datos.hora, duracionMin: datos.duracionMin, ocupadas, cierres, ahora });
    const c = datos.extras?.length ? sumarExtras(base, await extrasDeTienda(tiendaId, datos.lang), datos.extras, config) : base;
    return {
      producto, c,
      detalle: {
        // Foto de la reserva: los precios o la ficha pueden cambiar después.
        cancha: {
          nombre: cancha.nombre, formato: cancha.formato, techada: cancha.techada, jugadoresMax: cancha.jugadoresMax,
          duracionMin: c.duracionMin, tramos: c.tramos
        },
        ...(c.extras?.length ? { extras: c.extras } : {})
      },
      log: `${cancha.formato} ${textoDuracion(c.duracionMin)}, inicio ${c.inicio.toISOString()}`
    };
  },

  // La reserva por pagar aparta el horario mientras se paga; una solicitud, mientras el
  // negocio responde (modo "solicitud", R5). Nunca después del inicio.
  apartadoInicial: (estadoInicial, c, config, ahora) => {
    if (estadoInicial === "aceptada") return plazoDePago(c.inicio, config, ahora);
    if (estadoInicial !== "solicitada") return null;
    const limite = new Date(ahora.getTime() + config.respuestaHoras * 60 * 60 * 1000);
    return limite < c.inicio ? limite : c.inicio;
  },

  /** Dentro de la transacción que crea la reserva: la BD decide si el horario sigue libre (R4). */
  async enTransaccion(tx, { tiendaId, pedidoId, c, estadoInicial, cotizado, apartadoHasta }) {
    await ocupar(tx, {
      tiendaId, productoId: cotizado.producto.id, pedidoId,
      tipo: estadoInicial === "confirmada" ? "reserva" : "apartado",
      inicio: c.inicio, fin: c.fin, expiraEn: apartadoHasta, usuario: "storefront"
    });
  },

  /** La ocupación sigue al estado de la reserva (R5). */
  async alCambiarEstado(tx, { pedido, nuevo, ahora }) {
    switch (nuevo) {
      case "pago_en_revision":
      case "confirmada": {
        // Con la captura subida el apartado deja de vencer; al verificar, es una reserva.
        const tipo = nuevo === "confirmada" ? "reserva" : "apartado";
        const { count } = await actualizarOcupacion(tx, pedido.id, { tipo, expiraEn: null });
        if (count === 0) await reocupar(tx, pedido, tipo, null);
        return;
      }
      case "aceptada": {
        // El negocio aceptó la solicitud o rechazó el pago: nuevo plazo para pagar.
        const expira = plazoDePago(pedido.reserva.inicio, await obtenerConfig(pedido.tiendaId), ahora);
        const { count } = await actualizarOcupacion(tx, pedido.id, { tipo: "apartado", expiraEn: expira });
        if (count === 0) await reocupar(tx, pedido, "apartado", expira);
        await tx.reservas.update({ where: { pedidoId: pedido.id }, data: { apartadoHasta: expira } });
        return;
      }
      case "rechazada":
      case "cancelada":
      case "vencida":
        await liberar(tx, pedido.id);
        return;
      default:
        // completada y no_show: el horario ya pasó.
    }
  }
};
