import { ESTADOS_ABIERTOS, estadoEfectivo, etiquetaEstado } from "./estados.js";
import { localizar } from "../traducciones/localizar.js";
import { FUENTES } from "../traducciones/fuentes.js";
import { IDIOMA_BASE } from "../idiomas/idioma.js";
import { num } from "./dto.comun.js";
import { dtoHotel } from "./hotel/dto.js";
import { dtoTour } from "./tours/dto.js";
import { dtoEvento } from "./eventos/dto.js";
import { dtoLocal, dtoAdminLocal } from "./locales/dto.js";
import { dtoCancha } from "./canchas/dto.js";

/**
 * Contrato de salida del mini booking. La reserva se construye campo por campo
 * desde `pedidos` + `reservas`: nunca se devuelve la fila cruda.
 *
 * Audiencias:
 *   - store (titular, con el token de seguimiento): sin documento completo;
 *   - admin (negocio): registro de huésped completo.
 */

/**
 * Lo propio de cada tipo de reserva en el DTO, de reservas/<rubro>/dto.js
 * (docs/specs/antipatrones 3b). Un registro, no un if por tipo; un tipo sin
 * entrada aquí falla el test de contrato (una por máquina de estados).
 */
export const DTO_POR_TIPO = {
  hotel: { base: dtoHotel },
  tour: { base: dtoTour },
  evento: { base: dtoEvento },
  local: { base: dtoLocal, admin: dtoAdminLocal },
  cancha: { base: dtoCancha }
};

/** Bloques de los demás tipos: vacíos (cada dto.js pone los suyos). */
const SIN_BLOQUES = { modalidad: null, pasajeros: null, tour: null, evento: null, entradas: null, entradasEmitidas: [], local: null, cancha: null };

/** "44836469" → "•••••469": el titular reconoce su documento sin exponerlo entero. */
const enmascarar = (doc) => (doc ? `${"•".repeat(Math.max(doc.length - 3, 0))}${doc.slice(-3)}` : null);
/** "ana@correo.com" → "a••@correo.com": a dónde llegó la confirmación, sin exponer el correo entero. */
export const enmascararCorreo = (correo) => {
  const [usuario, dominio] = String(correo ?? "").split("@");
  if (!usuario || !dominio) return null;
  return `${usuario[0]}${"•".repeat(Math.max(usuario.length - 1, 2))}@${dominio}`;
};

const imagenPrincipal = (producto) => {
  const img = producto?.imagenes?.find(i => i.esPrincipal) ?? producto?.imagenes?.[0];
  return img?.url ?? null;
};

/** Último pago manual (captura) del pedido. */
function ultimoPagoManual(pagos = []) {
  return [...pagos].filter(p => p.proveedor === "manual")
    .sort((a, b) => new Date(b.fechaRegistro) - new Date(a.fechaRegistro))[0] ?? null;
}

function base(pedido, ahora) {
  const r = pedido.reserva;
  const estado = estadoEfectivo({ estado: pedido.estado, inicio: r.inicio, fin: r.fin, apartadoHasta: r.apartadoHasta, tipo: r.tipo }, ahora);
  return {
    // Lo propio de cada tipo (modalidad, pasajeros, evento, local, cancha, personas), de su dto.js.
    ...SIN_BLOQUES,
    ...(DTO_POR_TIPO[r.tipo] ?? DTO_POR_TIPO.hotel).base(pedido, { estado, ahora }),
    id: pedido.id,
    codigo: pedido.numeroPedido,
    tipo: r.tipo,
    estado,
    estadoEtiqueta: etiquetaEstado(estado),
    producto: {
      id: r.productoId,
      nombre: r.producto?.nombre ?? pedido.detalles?.[0]?.productoNombre ?? null,
      slug: r.producto?.slug ?? null,
      imagenUrl: imagenPrincipal(r.producto)
    },
    inicio: r.inicio,
    fin: r.fin,
    noches: r.noches,
    horas: r.horas,
    adultos: r.adultos,
    ninos: r.ninos,
    // Hotel (hospedaje-completo, fase B): extras con el dato del huésped
    // (vuelo, hora de llegada), edades de los niños e IGV exonerado.
    extras: Array.isArray(r.extras) ? r.extras.map(x => ({
      id: x.id ?? null, nombre: x.nombre, cantidad: x.cantidad, total: x.total, datoPedido: x.datoPedido ?? null, dato: x.dato ?? null,
      // Early/late (ciclo-reserva-hotel C7): hora pedida y si el hotel lo aprobó; origen "mostrador" si lo dio recepción.
      horario: x.horario ?? null, hora: x.hora ?? null, estado: x.estado ?? null, origen: x.origen ?? null
    })) : [],
    edadesNinos: r.edadesNinos ?? [],
    exoneradoIgv: r.exoneradoIgv ?? false,
    // reserva-hotel-mejoras H2: con o sin impuestos al reservar, y el desglose.
    impuestos: r.impuestos ?? null,
    // Fase C: habitaciones del mismo tipo, plan de tarifa e idioma del huésped.
    habitaciones: r.habitaciones ?? 1,
    plan: r.plan ?? null,
    idiomaHuesped: r.idiomaHuesped ?? IDIOMA_BASE,
    idioma: r.idioma ?? null,
    // Hotel (plantillas-por-rubro E8): check-in en línea y cambio de fechas pedido.
    checkin: r.checkinOnline ?? null,
    cambioSolicitado: r.cambioSolicitado ?? null,
    total: num(pedido.total),
    montoAPagar: num(r.montoAPagar),
    saldoDestino: num(r.saldoDestino),
    montoPagado: num(pedido.montoPagado),
    fechaSolicitud: pedido.fechaRegistro
  };
}

function lineas(pedido) {
  return (pedido.detalles ?? []).map(d => ({
    descripcion: d.varianteNombre ? `${d.productoNombre} · ${d.varianteNombre}` : d.productoNombre,
    cantidad: d.cantidad,
    precioUnitario: num(d.precioUnitario),
    total: num(d.total)
  }));
}

const ajuste = (r) => (r.ajusteMotivo ? { motivo: r.ajusteMotivo, monto: num(r.ajusteMonto) } : null);

/**
 * Página de seguimiento / confirmación del titular (spec R5.3, R6.2, R8).
 * @param {object} pedido - con reserva (+producto, modalidad), detalles y pagos
 * @param {{ tienda: object, config: object, metodosPago: Array, ahora?: Date }} ctx
 */
export function serializeReservaStore(pedido, { tienda, config, metodosPago = [], ahora = new Date() }) {
  const r = pedido.reserva;
  const dto = base(pedido, ahora);
  const pago = ultimoPagoManual(pedido.pagos);
  // Locales: se paga por cuotas, con el contrato aceptado, mientras quede algo pendiente.
  const esperaPago = dto.local
    ? Boolean(r.contrato?.aceptadoEn) && ["aceptada", "pago_en_revision", "confirmada"].includes(dto.estado) && dto.local.plan.some(c => c.estado === "pendiente")
    : dto.estado === "aceptada" || dto.estado === "por_pagar";
  return {
    ...dto,
    // El cliente lee el contrato antes de aceptarlo (R8.3) y lo imprime después (R8.4).
    ...(dto.local && r.contrato ? { local: { ...dto.local, contrato: { ...dto.local.contrato, texto: r.contrato.texto } } } : {}),
    lineas: lineas(pedido),
    ajuste: ajuste(r),
    motivoRechazo: dto.estado === "rechazada" ? r.motivoRechazo : null,
    titular: {
      nombres: r.titularNombres,
      apellidos: r.titularApellidos,
      docTipo: r.titularDocTipo,
      docNumero: enmascarar(r.titularDocNumero),
      nacionalidad: r.titularNacionalidad
    },
    // Hotel: hora estimada de llegada que dio al reservar (parte 4).
    horaLlegada: r.horaLlegada ?? null,
    // "Confirmación enviada a a••@correo.com" (plantillas-por-rubro, parte 5).
    correo: enmascararCorreo(pedido.clienteEmail),
    pago: {
      // Datos de pago solo cuando toca pagar (R6.2).
      metodos: esperaPago ? metodosPago : [],
      capturaSubida: Boolean(pago),
      rechazoMotivo: pago?.estado === "fallido" && esperaPago ? pago.metadata?.motivo ?? null : null,
      // Locales: por qué se rechazó la captura de cada cuota que volvió a pendiente.
      ...(dto.local ? { rechazosCuota: rechazosPorCuota(pedido) } : {})
    },
    factura: pedido.comprobante === "factura" ? { ruc: pedido.comprobanteDocNumero, razonSocial: pedido.razonSocial } : null,
    negocio: {
      nombre: tienda.nombre,
      slug: tienda.slug,
      whatsapp: tienda.whatsappNumero,
      direccion: tienda.direccion,
      logoUrl: tienda.logoUrl,
      // Cómo se nombra el negocio ("el hostal", "la casa"): hospedaje-completo B1.
      alojamiento: config.tipoAlojamiento ?? "hotel"
    },
    // En el idioma en que reservó (docs/specs/idiomas D11).
    instrucciones: localizar(FUENTES.config, config, r.idiomaHuesped).instrucciones,
    // Con plan no reembolsable, la política que vale es la del plan (C5).
    politicaCancelacion: r.plan && !r.plan.reembolsable
      ? `Tarifa ${r.plan.nombre}: no se devuelve el pago si cancelas o no llegas.`
      : localizar(FUENTES.config, config, r.idiomaHuesped).politicaCancelacion,
    comprobanteEn: config.comprobanteEn,
    puedeCancelar: ["solicitada", "aceptada", "por_pagar"].includes(dto.estado)
  };
}

/** Último motivo de rechazo de las cuotas pendientes: { cuotaId: motivo }. */
function rechazosPorCuota(pedido) {
  const pendientes = new Set((pedido.cuotas ?? []).filter(c => c.estado === "pendiente").map(c => c.id));
  const out = {};
  for (const p of [...(pedido.pagos ?? [])].sort((a, b) => new Date(a.fechaRegistro) - new Date(b.fechaRegistro))) {
    if (p.cuotaId && pendientes.has(p.cuotaId)) out[p.cuotaId] = p.estado === "fallido" ? p.metadata?.motivo ?? null : null;
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v));
}

/** Fila de la bandeja del admin (R11.1). */
/**
 * Lo que lleva recepción (ciclo-reserva-hotel): código del PMS, entrada y salida
 * reales, notas para el siguiente turno, cancelación y lo retenido. Solo para el
 * negocio: la tienda no lo ve.
 */
const recepcion = (r) => ({
  codigoPms: r.codigoPms ?? null,
  checkinEn: r.checkinEn ?? null,
  checkoutEn: r.checkoutEn ?? null,
  notas: Array.isArray(r.notas) ? r.notas : [],
  cancelacion: r.cancelacion ?? null,
  retenido: r.retenido == null ? null : Number(r.retenido)
});

export function serializeReservaLista(pedido, ahora = new Date()) {
  const r = pedido.reserva;
  const b = base(pedido, ahora);
  return {
    ...b,
    // Sin atender, cuándo se anula sola: al terminar su plazo o, sin plazo, a la hora de inicio.
    venceEn: ESTADOS_ABIERTOS.includes(b.estado) ? (r.apartadoHasta ?? r.inicio) : null,
    ...recepcion(r),
    titular: `${r.titularNombres} ${r.titularApellidos}`,
    whatsapp: pedido.clienteWhatsapp,
    capturaSubida: Boolean(ultimoPagoManual(pedido.pagos))
  };
}

/**
 * Detalle completo para el negocio: registro de huésped, pagos con la URL
 * firmada de cada captura e historial.
 * @param {object} pedido
 * @param {{ urlsCaptura: Map<string,string|null>, ahora?: Date }} ctx
 */
export function serializeReservaAdmin(pedido, { urlsCaptura = new Map(), ahora = new Date() } = {}) {
  const r = pedido.reserva;
  return {
    ...base(pedido, ahora),
    ...recepcion(r),
    estadoGuardado: pedido.estado,
    // H4: aceptó términos y quiere recibir promociones (solo a quien aceptó).
    aceptaTerminos: r.aceptaTerminos ?? false,
    aceptaPromociones: r.aceptaPromociones ?? false,
    lineas: lineas(pedido),
    ajuste: ajuste(r),
    motivoRechazo: r.motivoRechazo,
    respondidaEn: r.respondidaEn,
    titular: {
      nombres: r.titularNombres,
      apellidos: r.titularApellidos,
      docTipo: r.titularDocTipo,
      docNumero: r.titularDocNumero,
      nacionalidad: r.titularNacionalidad,
      nacimiento: r.titularNacimiento ? r.titularNacimiento.toISOString().slice(0, 10) : null
    },
    horaLlegada: r.horaLlegada ?? null,
    acompanantes: r.acompanantes ?? [],
    // Hotel (plantillas-por-rubro E8): lo que el huésped mandó antes de llegar.
    checkin: r.checkinOnline ?? null,
    cambioSolicitado: r.cambioSolicitado ?? null,
    comentarios: r.comentarios,
    contacto: { whatsapp: pedido.clienteWhatsapp, email: pedido.clienteEmail },
    factura: pedido.comprobante === "factura"
      ? { ruc: pedido.comprobanteDocNumero, razonSocial: pedido.razonSocial, direccionFiscal: pedido.direccionFiscal }
      : null,
    pagos: (pedido.pagos ?? []).map(p => ({
      id: p.id,
      proveedor: p.proveedor,
      metodo: p.metodo,
      monto: num(p.monto),
      estado: p.estado,
      numeroOperacion: p.metadata?.numeroOperacion ?? null,
      motivo: p.metadata?.motivo ?? null,
      cuotaId: p.cuotaId ?? null,
      capturaUrl: urlsCaptura.get(p.id) ?? null,
      fechaRegistro: p.fechaRegistro
    })),
    historial: (pedido.historialEstados ?? []).map(h => ({ estado: h.estado, notas: h.notas, fecha: h.fechaRegistro })),
    ...(DTO_POR_TIPO[r.tipo]?.admin?.(pedido) ?? {})
  };
}
