import { ValidationError } from "../../utils/errors.js";
import { errorConClave } from "../idiomas/errores.js";
import { cotizarMetodo } from "../envios/cotizacion.js";
import { CUPON_CAMPANA_NO_VIGENTE, evaluarCupon } from "../cupones/regla-cupon.js";
import { cuponDeCampanaVigente } from "../campanas/promocion.js";
import { clave } from "../idiomas/clave.js";
import { precioVigente, aCentimos, aSoles } from "./precio-vigente.js";

/**
 * Cotización de una compra (docs/specs/precio-en-servidor): núcleo puro. Las
 * líneas, el cupón y el método de envío llegan ya cargados de la BD
 * (cotizacion-compra.service.js); nada sale del navegador.
 *
 * @param {Array<{ producto: object, variante: object|null, cantidad: number }>} lineasCargadas
 * @param {object} opciones
 * @param {object|null} [opciones.cupon] - Fila de `cupones`, o null sin cupón. El de una campaña
 *   (`campanaPromocionId`) trae `campanaNombre` para el mensaje si ya no está vigente (R4.8).
 * @param {number|null} [opciones.usosCliente] - Pedidos del cliente con ese cupón.
 * @param {{ metodo: object, envioGratisMinimo: number|null, ubigeo: string|null }|null} [opciones.envio]
 * @param {Date} [opciones.ahora]
 * @param {{ promociones?: object[] }} [opciones.contexto] - De contextoDePrecios con
 *   `conCache: false` (campanas-descuento C3a): las promociones vigentes en `ahora`.
 * @param {Array<{ productoId, varianteId, unitario, regular, origen, campana }>|null} [opciones.congelado]
 *   Líneas del precio asegurado ya verificado (precio-congelado.token.js, R8.4): cada línea
 *   cobra el menor entre lo asegurado y el precio de ahora (R8.6). null = sin precio asegurado.
 * @param {"lanzar"|"omitir"} [opciones.cuponInvalido] - Crear el pedido lanza; cotizar el carrito
 *   cotiza sin el cupón y lo cuenta en `cuponRechazado` (`{ clave, params }`).
 * @returns {{ lineas: object[], subtotal: number, descuentoCupon: number, costoEnvio: number, total: number, envio: object|null, cuponRechazado?: object, avisos: object, precios: object[] }}
 *   montos en soles; `envio` es la cotización del método (nombre, modo, disponible…). Cada línea trae
 *   `campana: { id, nombre, porcentaje } | null` (campanas-descuento C6). `precios` (interno, en céntimos
 *   y con los permisos de la campaña) es lo que se firma al asegurar el precio: no sale en la respuesta.
 *   `avisos` (C7, R7.6): `cuponSoloSinPromocion: { productos } | null` (el cupón se aplicó solo a
 *   esas líneas) y `envioGratisNoAplica` (un producto en promoción quita el envío gratis por monto).
 * @throws {ValidationError} si el cupón no aplica y `cuponInvalido` es "lanzar".
 */
export function cotizarCompra(lineasCargadas, { cupon = null, usosCliente = null, envio = null, ahora = new Date(), cuponInvalido = "lanzar", contexto = {}, congelado = null } = {}) {
  const asegurado = new Map((congelado ?? []).map(({ productoId, varianteId, ...precio }) => [claveLinea(productoId, varianteId), precio]));
  const lineas = lineasCargadas.map(({ producto, variante, cantidad }) => {
    const actual = precioVigente(producto, variante, { ...contexto, ahora });
    const fijo = asegurado.get(claveLinea(producto.id, variante?.id));
    // El menor: la promoción que terminó se respeta; el precio que bajó, también (R8.6).
    const precio = fijo && fijo.unitario < actual.unitario ? fijo : actual;
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

  // R7.3: el cupón (también el de la campaña, R7.5) se mide solo sobre las líneas que lo admiten.
  const elegibles = lineas.filter(admiteCupon);
  let descuentoCupon = 0;
  let cuponRechazado = null;
  if (cupon) {
    const r = evaluarConPromociones(cupon, { elegibles, ahora, usosCliente, promociones: contexto.promociones });
    if (r.valido) descuentoCupon = r.descuento;
    else if (cuponInvalido === "omitir") cuponRechazado = { clave: r.clave, params: r.params ?? {} };
    else throw errorConClave(ValidationError, r.clave, r.params);
  }
  const cuponAplicado = Boolean(cupon) && !cuponRechazado;

  // R7.3: una línea de una campaña sin el permiso quita el envío gratis por monto (no el recojo).
  // Con el permiso, el mínimo se mide con el subtotal y el descuento del servidor (R7.4).
  const sinEnvioGratis = lineas.some((l) => l.precio.campana && !l.precio.campana.permitirEnvioGratis);
  const cotizacionEnvio = envio
    ? { nombre: envio.metodo.nombre, ...cotizarMetodo(envio.metodo, envio.metodo.zonas, {
        ubigeo: envio.ubigeo ?? null,
        subtotal: aSoles(subtotal - descuentoCupon),
        envioGratisMinimo: sinEnvioGratis ? null : envio.envioGratisMinimo
      }) }
    : null;
  const costoEnvio = cotizacionEnvio?.disponible && cotizacionEnvio.modo === "fijo" ? aCentimos(cotizacionEnvio.costo) : 0;
  // Sin método elegido (el carrito) solo se sabe que hay una línea que lo quita: la tienda
  // lo dice si tiene envío gratis por monto. Con método, si la tienda lo tiene y no es recojo.
  const envioGratisNoAplica = sinEnvioGratis &&
    (!envio || (Number(envio.envioGratisMinimo) > 0 && cotizacionEnvio.modo !== "gratis"));

  return {
    lineas: lineas.map(({ precio, total, ...l }) => ({
      ...l,
      precioUnitario: aSoles(precio.unitario),
      precioRegular: aSoles(precio.regular),
      precioOrigen: precio.origen,
      campana: precio.campana ? { id: precio.campana.id, nombre: precio.campana.nombre, porcentaje: precio.campana.porcentaje } : null,
      total: aSoles(total)
    })),
    subtotal: aSoles(subtotal),
    descuentoCupon: aSoles(descuentoCupon),
    costoEnvio: aSoles(costoEnvio),
    total: aSoles(Math.max(0, subtotal - descuentoCupon + costoEnvio)),
    envio: cotizacionEnvio,
    ...(cuponRechazado && { cuponRechazado }),
    avisos: {
      cuponSoloSinPromocion: cuponAplicado && elegibles.length < lineas.length
        ? { productos: [...new Set(elegibles.map((l) => l.nombre))] }
        : null,
      envioGratisNoAplica
    },
    precios: lineas.map(({ productoId, varianteId, precio: { unitario, regular, origen, campana } }) => ({
      productoId, varianteId, unitario, regular, origen, campana: campana ? sinVigencia(campana) : null
    }))
  };
}

/** Mensaje de un cupón en un pedido sin líneas que lo admitan (R7.3; mismo texto en carrito y pago, R7.6). */
export const CUPON_SOLO_SIN_PROMOCION = clave("Los productos en promoción no admiten cupones.");

/** Una línea admite cupón si no tiene descuento de campaña o su campaña lo permite (R7.3, R7.4). */
const admiteCupon = (l) => !l.precio.campana || l.precio.campana.permitirCupones;

/**
 * La regla del cupón con las promociones (R4.8, R7.3, R7.5): el cupón de una campaña
 * vence con ella; sin líneas que lo admitan se rechaza; si no, `evaluarCupon` sin
 * cambios, con el subtotal de esas líneas (ahí se miden su mínimo y su tope).
 */
function evaluarConPromociones(cupon, { elegibles, ahora, usosCliente, promociones }) {
  if (!cuponDeCampanaVigente(cupon, promociones)) {
    return { valido: false, clave: CUPON_CAMPANA_NO_VIGENTE, params: { nombre: cupon.campanaNombre ?? "" } };
  }
  if (!elegibles.length) return { valido: false, clave: CUPON_SOLO_SIN_PROMOCION };
  const subtotal = elegibles.reduce((s, l) => s + l.total, 0);
  return evaluarCupon(cupon, { subtotal, ahora, usosCliente });
}

/** Clave de una línea: el mismo producto con otra variante es otra línea. */
const claveLinea = (productoId, varianteId) => `${productoId}:${varianteId ?? ""}`;

/** La campaña tal como se asegura: sin `hasta` (el token ya vence solo). */
const sinVigencia = ({ hasta, ...campana }) => campana;
