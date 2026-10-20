import { ValidationError } from "../../utils/errors.js";
import { errorConClave } from "../idiomas/errores.js";
import { cotizarMetodo } from "../envios/cotizacion.js";
import { evaluarCupon } from "../cupones/regla-cupon.js";
import { precioVigente, aCentimos, aSoles } from "./precio-vigente.js";

/**
 * Cotización de una compra (docs/specs/precio-en-servidor): núcleo puro. Las
 * líneas, el cupón y el método de envío llegan ya cargados de la BD
 * (cotizacion-compra.service.js); nada sale del navegador.
 *
 * @param {Array<{ producto: object, variante: object|null, cantidad: number }>} lineasCargadas
 * @param {object} opciones
 * @param {object|null} [opciones.cupon] - Fila de `cupones`, o null sin cupón.
 * @param {number|null} [opciones.usosCliente] - Pedidos del cliente con ese cupón.
 * @param {{ metodo: object, envioGratisMinimo: number|null, ubigeo: string|null }|null} [opciones.envio]
 * @param {Date} [opciones.ahora]
 * @param {"lanzar"|"omitir"} [opciones.cuponInvalido] - Crear el pedido lanza; cotizar el carrito
 *   cotiza sin el cupón y lo cuenta en `cuponRechazado` (`{ clave, params }`).
 * @returns {{ lineas: object[], subtotal: number, descuentoCupon: number, costoEnvio: number, total: number, envio: object|null, cuponRechazado?: object }}
 *   montos en soles; `envio` es la cotización del método (nombre, modo, disponible…).
 * @throws {ValidationError} si el cupón no aplica y `cuponInvalido` es "lanzar".
 */
export function cotizarCompra(lineasCargadas, { cupon = null, usosCliente = null, envio = null, ahora = new Date(), cuponInvalido = "lanzar" } = {}) {
  const lineas = lineasCargadas.map(({ producto, variante, cantidad }) => {
    const precio = precioVigente(producto, variante, { ahora });
    return {
      productoId: producto.id,
      varianteId: variante?.id ?? null,
      nombre: producto.nombre,
      varianteNombre: variante?.nombre ?? null,
      cantidad,
      precio,
      total: precio.unitario * cantidad
    };
  });
  const subtotal = lineas.reduce((s, l) => s + l.total, 0);

  let descuentoCupon = 0;
  let cuponRechazado = null;
  if (cupon) {
    const r = evaluarCupon(cupon, { subtotal, ahora, usosCliente });
    if (r.valido) descuentoCupon = r.descuento;
    else if (cuponInvalido === "omitir") cuponRechazado = { clave: r.clave, params: r.params ?? {} };
    else throw errorConClave(ValidationError, r.clave, r.params);
  }

  // El envío gratis desde un monto se mide con el subtotal y el descuento del servidor.
  const cotizacionEnvio = envio
    ? { nombre: envio.metodo.nombre, ...cotizarMetodo(envio.metodo, envio.metodo.zonas, {
        ubigeo: envio.ubigeo ?? null,
        subtotal: aSoles(subtotal - descuentoCupon),
        envioGratisMinimo: envio.envioGratisMinimo
      }) }
    : null;
  const costoEnvio = cotizacionEnvio?.disponible && cotizacionEnvio.modo === "fijo" ? aCentimos(cotizacionEnvio.costo) : 0;

  return {
    lineas: lineas.map(({ precio, total, ...l }) => ({
      ...l,
      precioUnitario: aSoles(precio.unitario),
      precioRegular: aSoles(precio.regular),
      precioOrigen: precio.origen,
      total: aSoles(total)
    })),
    subtotal: aSoles(subtotal),
    descuentoCupon: aSoles(descuentoCupon),
    costoEnvio: aSoles(costoEnvio),
    total: aSoles(Math.max(0, subtotal - descuentoCupon + costoEnvio)),
    envio: cotizacionEnvio,
    ...(cuponRechazado && { cuponRechazado })
  };
}
