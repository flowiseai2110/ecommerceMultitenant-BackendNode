import { estadoEfectivo, etiquetaEstado } from "./estados.js";

/**
 * Contrato de salida del mini booking. La reserva se construye campo por campo
 * desde `pedidos` + `reservas`: nunca se devuelve la fila cruda.
 *
 * Audiencias:
 *   - store (titular, con el token de seguimiento): sin documento completo;
 *   - admin (negocio): registro de huésped completo.
 */

const num = (v) => (v === null || v === undefined ? null : Number(v));

export function etiquetaModalidad(modalidad, reserva) {
  const horas = reserva?.horas ?? modalidad?.horas;
  if ((modalidad?.tipo ?? (horas ? "horas" : "noche")) === "horas") return `${horas} horas`;
  const noches = reserva?.noches;
  return noches ? `${noches} ${noches === 1 ? "noche" : "noches"}` : "Por noche";
}

/** "44836469" → "•••••469": el titular reconoce su documento sin exponerlo entero. */
const enmascarar = (doc) => (doc ? `${"•".repeat(Math.max(doc.length - 3, 0))}${doc.slice(-3)}` : null);

const imagenPrincipal = (producto) => {
  const img = producto?.imagenes?.find(i => i.esPrincipal) ?? producto?.imagenes?.[0];
  return img?.url ?? null;
};

/** Último pago manual (captura) del pedido. */
function ultimoPagoManual(pagos = []) {
  return [...pagos].filter(p => p.proveedor === "manual")
    .sort((a, b) => new Date(b.fechaRegistro) - new Date(a.fechaRegistro))[0] ?? null;
}

/** Pasajeros de un tour (snapshot guardado al solicitar). */
const pasajerosDe = (r) => (Array.isArray(r.pasajeros) ? r.pasajeros : []).map(p => ({
  tipoId: p.tipoId, nombre: p.nombre, cantidad: p.cantidad, precio: num(p.precio)
}));

/** Entradas de una compra de evento (snapshot guardado al comprar). */
const entradasDe = (pedido) => (pedido.itemsEvento ?? []).map(i => ({
  tipoId: i.tipoEntradaId, nombre: i.nombre, cantidad: i.cantidad, precio: num(i.precio)
}));

function base(pedido, ahora) {
  const r = pedido.reserva;
  const esTour = r.tipo === "tour";
  const esEvento = r.tipo === "evento";
  const pasajeros = esTour ? pasajerosDe(r) : null;
  const entradas = esEvento ? entradasDe(pedido) : null;
  const estado = estadoEfectivo({ estado: pedido.estado, inicio: r.inicio, fin: r.fin, apartadoHasta: r.apartadoHasta }, ahora);
  return {
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
    // Solo hotel: tours y eventos no tienen modalidad de estadía.
    modalidad: esTour || esEvento ? null : {
      id: r.modalidadId,
      tipo: r.modalidad?.tipo ?? (r.horas ? "horas" : "noche"),
      etiqueta: etiquetaModalidad(r.modalidad, r)
    },
    inicio: r.inicio,
    fin: r.fin,
    noches: r.noches,
    horas: r.horas,
    adultos: r.adultos,
    ninos: r.ninos,
    // Hotel (hospedaje-completo, fase B): extras con el dato del huésped
    // (vuelo, hora de llegada), edades de los niños e IGV exonerado.
    extras: Array.isArray(r.extras) ? r.extras.map(x => ({ nombre: x.nombre, cantidad: x.cantidad, total: x.total, datoPedido: x.datoPedido ?? null, dato: x.dato ?? null })) : [],
    edadesNinos: r.edadesNinos ?? [],
    exoneradoIgv: r.exoneradoIgv ?? false,
    // Fase C: habitaciones del mismo tipo, plan de tarifa e idioma del huésped.
    habitaciones: r.habitaciones ?? 1,
    plan: r.plan ?? null,
    idiomaHuesped: r.idiomaHuesped ?? "es",
    pasajeros,
    idioma: r.idioma ?? null,
    // Lo que el pasajero necesita para llegar a la salida (confirmación, R8.1).
    tour: esTour ? {
      duracion: r.producto?.tour?.duracion ?? null,
      puntoEncuentro: r.producto?.tour?.puntoEncuentro ?? null,
      recojo: r.producto?.tour?.recojo ?? null
    } : null,
    // Función y lugar del evento; hasta cuándo se guarda el cupo si falta pagar.
    evento: esEvento ? {
      funcionId: r.funcionId,
      funcion: r.funcion?.nombre ?? null,
      lugar: r.producto?.evento?.lugar ?? null,
      direccion: r.producto?.evento?.direccion ?? null,
      mapaUrl: r.producto?.evento?.mapaUrl ?? null,
      organizador: r.producto?.evento?.organizador ?? null,
      apartadoHasta: estado === "por_pagar" ? r.apartadoHasta : null
    } : null,
    entradas,
    personas: esTour ? pasajeros.reduce((s, p) => s + p.cantidad, 0)
      : esEvento ? entradas.reduce((s, e) => s + e.cantidad, 0)
        : (r.adultos ?? 0) + (r.ninos ?? 0),
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
  const esperaPago = dto.estado === "aceptada" || dto.estado === "por_pagar";
  return {
    ...dto,
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
    pago: {
      // Datos de pago solo cuando toca pagar (R6.2).
      metodos: esperaPago ? metodosPago : [],
      capturaSubida: Boolean(pago),
      rechazoMotivo: pago?.estado === "fallido" && esperaPago ? pago.metadata?.motivo ?? null : null
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
    instrucciones: config.instrucciones,
    // Con plan no reembolsable, la política que vale es la del plan (C5).
    politicaCancelacion: r.plan && !r.plan.reembolsable
      ? `Tarifa ${r.plan.nombre}: no se devuelve el pago si cancelas o no llegas.`
      : config.politicaCancelacion,
    comprobanteEn: config.comprobanteEn,
    puedeCancelar: ["solicitada", "aceptada", "por_pagar"].includes(dto.estado)
  };
}

/** Fila de la bandeja del admin (R11.1). */
export function serializeReservaLista(pedido, ahora = new Date()) {
  const r = pedido.reserva;
  return {
    ...base(pedido, ahora),
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
    estadoGuardado: pedido.estado,
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
    acompanantes: r.acompanantes ?? [],
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
      capturaUrl: urlsCaptura.get(p.id) ?? null,
      fechaRegistro: p.fechaRegistro
    })),
    historial: (pedido.historialEstados ?? []).map(h => ({ estado: h.estado, notas: h.notas, fecha: h.fechaRegistro }))
  };
}
