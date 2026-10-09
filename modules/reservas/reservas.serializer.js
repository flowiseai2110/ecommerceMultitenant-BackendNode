import { estadoEfectivo, etiquetaEstado } from "./estados.js";
import { textoEn, traducirTour } from "../traducciones/traducciones.service.js";
import { fechaLima } from "./tiempo.js";
import { resumenPlan } from "./locales/plan-pagos.js";
import { etiquetaTipoEvento } from "./locales/cotizar.js";
import { etiquetaConcepto } from "./locales/contrato.js";

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

function fichaTour(r) {
  const t = traducirTour(r.producto?.tour ?? {}, r.producto?.traducciones, r.idiomaHuesped === "en" ? "en" : "es");
  return { duracion: t.duracion ?? null, puntoEncuentro: t.puntoEncuentro ?? null, recojo: t.recojo ?? null };
}

const serializarCuota = (c) => ({
  id: c.id,
  numero: c.numero,
  concepto: c.concepto,
  conceptoEtiqueta: etiquetaConcepto(c.concepto),
  monto: num(c.monto),
  // Columna DATE (medianoche UTC): se lee tal cual, sin pasar a hora de Lima.
  venceEn: (c.venceEn instanceof Date ? c.venceEn.toISOString() : String(c.venceEn)).slice(0, 10),
  estado: c.estado,
  pagadaEn: c.pagadaEn ?? null
});

/**
 * Alquiler de locales (alquiler-locales R7.5): salón, turno, paquete, plan de
 * pagos con su resumen (pagado, saldo, próxima cuota, mora, garantía) y el
 * estado del contrato. El texto del contrato lo agrega cada audiencia.
 */
function bloqueLocal(pedido, estado, ahora) {
  const r = pedido.reserva;
  const l = r.local ?? {};
  const cuotas = (pedido.cuotas ?? []).filter(c => c.estado !== "anulada");
  return {
    salon: l.salon?.nombre ?? null,
    aforoMaximo: l.salon?.aforoMaximo ?? null,
    turno: l.turno ?? null,
    paquete: l.paquete ?? null,
    tipoEvento: r.tipoEvento,
    tipoEventoEtiqueta: etiquetaTipoEvento(r.tipoEvento),
    invitados: r.invitados,
    agasajado: r.agasajado,
    fecha: l.fecha ?? fechaLima(r.inicio),
    horaInicio: l.horaInicio ?? null,
    horaFin: l.horaFin ?? null,
    proveedoresExternos: l.proveedoresExternos ?? false,
    garantia: num(l.garantia) ?? 0,
    // Hasta cuándo la fecha queda apartada sin respuesta o sin pago (R6.4).
    apartadoHasta: ["solicitada", "aceptada"].includes(estado) ? r.apartadoHasta : null,
    plan: cuotas.map(serializarCuota),
    resumen: resumenPlan(cuotas, fechaLima(ahora)),
    contrato: r.contrato ? { version: r.contrato.version, hash: r.contrato.hash, generadoEn: r.contrato.generadoEn, aceptadoEn: r.contrato.aceptadoEn ?? null } : null,
    reprogramaciones: r.reprogramaciones ?? 0
  };
}

function base(pedido, ahora) {
  const r = pedido.reserva;
  const esTour = r.tipo === "tour";
  const esEvento = r.tipo === "evento";
  const esLocal = r.tipo === "local";
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
    // Solo hotel: tours, eventos y locales no tienen modalidad de estadía.
    modalidad: esTour || esEvento || esLocal ? null : {
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
    // Lo que el pasajero necesita para llegar a la salida (confirmación, R8.1);
    // en inglés si reservó en inglés (C3).
    tour: esTour ? fichaTour(r) : null,
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
    local: esLocal ? bloqueLocal(pedido, estado, ahora) : null,
    personas: esTour ? pasajeros.reduce((s, p) => s + p.cantidad, 0)
      : esEvento ? entradas.reduce((s, e) => s + e.cantidad, 0)
        : esLocal ? r.invitados ?? 0
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
    // El huésped que reservó en inglés ve las instrucciones en inglés (C3).
    instrucciones: r.idiomaHuesped === "en" ? textoEn(config.instrucciones, config.traducciones?.en?.instrucciones) : config.instrucciones,
    // Con plan no reembolsable, la política que vale es la del plan (C5).
    politicaCancelacion: r.plan && !r.plan.reembolsable
      ? `Tarifa ${r.plan.nombre}: no se devuelve el pago si cancelas o no llegas.`
      : r.idiomaHuesped === "en" ? textoEn(config.politicaCancelacion, config.traducciones?.en?.politicaCancelacion) : config.politicaCancelacion,
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
      cuotaId: p.cuotaId ?? null,
      capturaUrl: urlsCaptura.get(p.id) ?? null,
      fechaRegistro: p.fechaRegistro
    })),
    historial: (pedido.historialEstados ?? []).map(h => ({ estado: h.estado, notas: h.notas, fecha: h.fechaRegistro })),
    // Locales: contrato completo y cambios (ajustes de monto y de plan).
    ...(r.tipo === "local" ? {
      contratoTexto: r.contrato?.texto ?? null,
      contratoAceptadoPor: r.contrato?.aceptadoPor ?? null,
      cambios: (pedido.cambios ?? []).map(c => ({
        tipo: c.tipo, actor: c.actor, motivo: c.motivo, nota: c.nota, diferencia: num(c.diferencia), antes: c.antes, despues: c.despues, fecha: c.fechaRegistro
      }))
    } : {})
  };
}
