import { prisma } from "../../config/prisma.js";
import { ConflictError, ValidationError } from "../../utils/errors.js";
import { invalidatePendientesCount } from "./pedidos-pendientes-cache.js";
import { validarYBloquearStock, descontarStock } from "../inventario/inventario.service.js";
import { cargarMetodoEnvio, hayMetodosEnvio } from "../envios/cotizacion.service.js";
import { cargarLineas } from "../precios/cotizacion-compra.service.js";
import { cotizarCompra } from "../precios/cotizacion-compra.js";
import { aCentimos } from "../precios/precio-vigente.js";
import { datosFactura } from "../sunat/ruc.service.js";
import { tiendaDe } from "../negocio/rubros.cache.js";
import { datosDe } from "../negocio/datos.js";
import { clave } from "../idiomas/clave.js";
import { errorConClave } from "../idiomas/errores.js";
import { IDIOMA_BASE } from "../idiomas/idioma.js";
import { CAMPOS_DESTINO, generarNumeroPedido, upsertCliente } from "./pedidos.service.js";

// Desde este total (S/) SUNAT exige DNI/CE del adquiriente en la boleta.
const MONTO_BOLETA_CON_DOCUMENTO = 700;

// Tienda sin métodos de envío configurados: el envío se coordina por WhatsApp.
const ENVIO_POR_COORDINAR = "Por coordinar";

/**
 * Crea un pedido de compra (docs/specs/precio-en-servidor, ADR-0001). El navegador
 * dice qué compra y cuánto; el servidor calcula precios, oferta, cupón y envío con
 * sus datos (cotizacion-compra.js) y nunca usa un monto del body.
 *
 * Todo en una sola transacción:
 * 1. Carga las líneas (producto y variante de la tienda) y el método de envío
 * 2. Cupón y usos del cliente; cotiza
 * 3. Si el cliente vio un total menor al real (`totalEsperado`): 409 PRECIO_CAMBIO,
 *    antes de escribir nada (D1). Si vio uno igual o mayor, o no lo manda, sigue.
 * 4. Comprobante (boleta desde S/ 700, factura solo si la tienda la emite)
 * 5. Valida y bloquea stock (Inventario); upsert del cliente
 * 6. Uso del cupón condicional al tope (dos pedidos con el último uso: uno falla)
 * 7. Número de pedido, pedido con snapshot por línea, stock y estadísticas del cliente
 *
 * `authUserId` viene del JWT verificado (nunca del body): si el comprador
 * inició sesión en el storefront, el pedido queda en su "Mis pedidos".
 */
export async function crearPedido(data, { authUserId = null, idioma = IDIOMA_BASE } = {}) {
  const {
    tiendaId,
    cliente: clienteData,
    notas,
    metodoPago,
    direccionEnvio,
    origen = "web",
    comprobante = null,
    totalEsperado = null
  } = data;

  await exigirCarrito(tiendaId);

  // Destino de entrega: ya viene normalizado por createPedidoSchema.
  const destino = {};
  for (const campo of CAMPOS_DESTINO) destino[campo] = data[campo] ?? null;

  // Factura: los datos salen del padrón de SUNAT, nunca del body. Se consulta
  // fuera de la transacción para no tener filas bloqueadas esperando la red
  // (casi siempre es un acierto de caché: el checkout lo acaba de consultar).
  const factura = comprobante?.tipo === "factura" ? await datosFactura(comprobante.docNumero) : null;

  return await prisma.$transaction(async (tx) => {
    const ahora = new Date();

    // 1 y 2. Líneas, envío y cupón desde la BD, y la cotización (solo lecturas).
    const { cotizacion, cupon, codigoNorm } = await cargarYCotizar(tx, data, { paraCrear: true, ahora });
    const { total } = cotizacion;

    // 3. El cliente nunca paga más de lo que vio (D1): nada se escribió todavía.
    if (totalEsperado != null && aCentimos(total) > aCentimos(totalEsperado)) {
      const error = errorConClave(ConflictError, clave("El precio cambió"), {}, { cotizacion: cotizacionPublica(cotizacion) });
      error.code = "PRECIO_CAMBIO";
      throw error;
    }

    // 4. Comprobante: SUNAT exige identificar al adquiriente de una boleta
    // desde S/ 700, y la factura solo si el régimen de la tienda la permite.
    if (comprobante?.tipo === "boleta" && total >= MONTO_BOLETA_CON_DOCUMENTO && !comprobante.docNumero) {
      throw errorConClave(ValidationError, clave("Para boletas desde S/ {monto} se requiere DNI o CE"), { monto: MONTO_BOLETA_CON_DOCUMENTO });
    }
    if (comprobante?.tipo === "factura") {
      const emisora = await tx.tiendas.findUnique({ where: { id: tiendaId }, select: { emiteFactura: true } });
      if (!emisora?.emiteFactura) throw errorConClave(ValidationError, clave("Esta tienda solo emite boletas"));
    }

    // 5. Validar stock y bloquear las filas involucradas (FOR UPDATE), con los nombres de la BD.
    const { variantesADescontar, productosADescontar } = await validarYBloquearStock(tx, tiendaId,
      cotizacion.lineas.map((l) => ({
        productoId: l.productoId, varianteId: l.varianteId, cantidad: l.cantidad,
        productoNombre: l.nombre, varianteNombre: l.varianteNombre
      })));
    const cliente = await upsertCliente(tiendaId, clienteData, tx);

    // 6. Uso del cupón condicional al tope (C5): bajo concurrencia el segundo
    // UPDATE espera al primero y vuelve a evaluar el WHERE; 0 filas = agotado.
    if (cupon) {
      const { count } = await tx.cupones.updateMany({
        where: { id: cupon.id, ...(cupon.usoMaximo != null && { usoActual: { lt: cupon.usoMaximo } }) },
        data: { usoActual: { increment: 1 } }
      });
      if (count === 0) throw errorConClave(ValidationError, clave("Cupón agotado"));
    }

    // 7. Número de pedido con advisory lock (sin race condition)
    const numeroPedido = await generarNumeroPedido(tiendaId, tx);

    const pedido = await tx.pedidos.create({
      data: {
        tiendaId,
        clienteId: cliente.id,
        clienteNombre: clienteData.nombre,
        clienteWhatsapp: clienteData.whatsappNumero,
        clienteEmail: clienteData.email || null,
        authUserId,
        // Idioma en que compró (docs/specs/idiomas D11).
        idioma,
        numeroPedido,
        estado: "pendiente",
        subtotal: cotizacion.subtotal,
        descuentoMonto: cotizacion.descuentoCupon,
        costoEnvio: cotizacion.costoEnvio,
        total,
        metodoPago: metodoPago || null,
        estadoPago: "pendiente",
        metodoEnvio: cotizacion.envio?.nombre ?? ENVIO_POR_COORDINAR,
        direccionEnvio: direccionEnvio || null,
        ...destino,
        notas: notas || null,
        origen,
        codigoCupon: cupon ? codigoNorm : null,
        comprobante: comprobante?.tipo ?? null,
        comprobanteDocTipo: comprobante?.docNumero ? comprobante.docTipo : null,
        comprobanteDocNumero: comprobante?.docNumero || null,
        razonSocial: factura?.razonSocial ?? null,
        direccionFiscal: factura?.direccionFiscal ?? null,
        fechaRegistro: new Date(),
        usuarioRegistro: "storefront",
        detalles: {
          // createMany garantiza UN solo INSERT para todos los items,
          // sin importar cuántas líneas tenga el pedido.
          // Snapshot por línea (ADR-0001 punto 5): lo cobrado, el regular y de dónde salió.
          createMany: {
            data: cotizacion.lineas.map((l) => ({
              productoId: l.productoId,
              varianteId: l.varianteId,
              productoNombre: l.nombre,
              varianteNombre: l.varianteNombre,
              cantidad: l.cantidad,
              precioUnitario: l.precioUnitario,
              precioRegular: l.precioRegular,
              precioOrigen: l.precioOrigen,
              // El cupón va a nivel de pedido (descuentoMonto), no se reparte por línea.
              descuento: 0,
              total: l.total
            }))
          }
        },
        historialEstados: {
          create: { estado: "pendiente", notas: "Pedido creado desde storefront" }
        }
      },
      include: {
        detalles: true,
        historialEstados: true,
        cliente: true
      }
    });

    // Descontar stock en batch (filas ya bloqueadas y validadas en el paso 5)
    await descontarStock(tx, variantesADescontar, productosADescontar);

    // Estadísticas del cliente
    await tx.clientes.update({
      where: { id: cliente.id },
      data: {
        totalPedidos: { increment: 1 },
        totalGastado: { increment: total },
        ultimoPedidoFecha: new Date()
      }
    });

    return pedido;
  }, {
    // Red de seguridad, NO el fix principal: la transacción hace un número fijo
    // de round-trips sin importar el tamaño del carrito. El margen extra cubre
    // latencia de red/pooler hacia Supabase.
    maxWait: 5000,
    timeout: 15000
  }).then((pedido) => {
    // Todo pedido nuevo nace "pendiente": el conteo cacheado del badge cambió
    invalidatePendientesCount(tiendaId);
    return pedido;
  });
}

/**
 * Cotiza un carrito sin escribir nada (`POST /store/pedidos/cotizar`, pieza 4):
 * la misma carga y la misma regla que crear el pedido, así el carrito y el pago
 * muestran lo que se va a cobrar. A diferencia de crear: sin método de envío
 * cotiza sin envío, y un cupón que ya no aplica (p. ej. bajó el subtotal) no
 * corta la cotización: se cotiza sin él y se avisa en `cuponRechazado`.
 */
export async function cotizarPedido(data) {
  await exigirCarrito(data.tiendaId);
  const { cotizacion, cuponRechazado } = await cargarYCotizar(prisma, data, { paraCrear: false, ahora: new Date() });
  return {
    ...cotizacionPublica(cotizacion),
    envio: cotizacion.envio,
    cuponRechazado: cuponRechazado ?? null
  };
}

/** Solo un rubro que vende con carrito cotiza y crea pedidos de compra (C10). El rubro sale de la BD. */
async function exigirCarrito(tiendaId) {
  const tienda = await tiendaDe(tiendaId);
  if (!datosDe(tienda.tipoNegocio).carrito) throw errorConClave(ValidationError, clave("Esta tienda no vende con carrito"));
}

/**
 * Pasos 1 y 2, comunes a crear y cotizar (solo lecturas): líneas y método de
 * envío desde la BD, cupón con la misma regla que muestra el checkout
 * (regla-cupon.js, con la compra mínima, C4) y la cotización.
 *
 * `paraCrear`: con métodos de envío activos hay que elegir uno (C9), el método
 * tiene que llegar al destino y el cupón tiene que aplicar. Sin él (cotizar),
 * nada de eso corta: el cupón que no aplica vuelve en `cuponRechazado`.
 *
 * @param {object} db - Cliente Prisma (transaccional al crear).
 */
async function cargarYCotizar(db, data, { paraCrear, ahora }) {
  const { tiendaId, detalles, metodoEnvioId = null, codigoCupon = null } = data;

  const lineas = await cargarLineas(db, tiendaId, detalles);
  let envio = null;
  if (metodoEnvioId) {
    const cargado = await cargarMetodoEnvio(db, tiendaId, metodoEnvioId);
    if (!cargado) throw errorConClave(ValidationError, clave("El método de envío ya no está disponible"));
    envio = { ...cargado, ubigeo: data.ubigeoCode ?? null };
  } else if (paraCrear && await hayMetodosEnvio(db, tiendaId)) {
    throw errorConClave(ValidationError, clave("Elige un método de envío"));
  }

  const codigoNorm = codigoCupon ? codigoCupon.toUpperCase() : null;
  let cupon = null;
  let usosCliente = null;
  if (codigoNorm) {
    cupon = await db.cupones.findFirst({ where: { tiendaId, codigo: codigoNorm } });
    if (!cupon) {
      if (paraCrear) throw errorConClave(ValidationError, clave("Cupón no válido"));
      return conCuponRechazado(lineas, envio, ahora, { clave: clave("Cupón no válido") });
    }
    // Los usos por cliente se cuentan solo al crear: al cotizar todavía no se sabe quién compra.
    const whatsapp = data.cliente?.whatsappNumero;
    if (cupon.usoMaximoPorCliente != null && whatsapp) {
      const existente = await db.clientes.findFirst({
        where: { tiendaId, whatsappNumero: whatsapp },
        select: { id: true }
      });
      usosCliente = existente
        ? await db.pedidos.count({ where: { tiendaId, clienteId: existente.id, codigoCupon: codigoNorm } })
        : 0;
    }
  }

  const cotizacion = cotizarCompra(lineas, { cupon, usosCliente, envio, ahora, cuponInvalido: paraCrear ? "lanzar" : "omitir" });
  if (paraCrear && cotizacion.envio && !cotizacion.envio.disponible) {
    throw errorConClave(ValidationError, clave("{metodo} no llega a tu distrito. Elige otro método de envío."), { metodo: cotizacion.envio.nombre });
  }
  return {
    cotizacion,
    cupon: cotizacion.cuponRechazado ? null : cupon,
    codigoNorm,
    cuponRechazado: cotizacion.cuponRechazado ?? null
  };
}

function conCuponRechazado(lineas, envio, ahora, cuponRechazado) {
  return { cotizacion: cotizarCompra(lineas, { envio, ahora }), cupon: null, codigoNorm: null, cuponRechazado };
}

/** Lo que el 409 y la cotización le cuentan a la tienda: precios, nombres y totales; nunca costo ni stock. */
function cotizacionPublica({ lineas, subtotal, descuentoCupon, costoEnvio, total }) {
  return { lineas, subtotal, descuentoCupon, costoEnvio, total };
}
