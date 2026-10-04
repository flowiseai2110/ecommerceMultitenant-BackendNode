import { ETIQUETAS } from "./textos-legales.js";
import { diasHabilesRestantes, fechaISO, hoyLima, semaforo } from "./plazos.js";

/**
 * DTOs de la hoja. La forma anidada (proveedor / consumidor / bien / respuesta)
 * sigue las secciones del Anexo I y es la misma en tienda, admin y correos.
 */

const numeroODecimal = (v) => (v === null || v === undefined ? null : Number(v));

/** Cabecera del libro en la tienda (R1.4). */
export function serializeProveedor(tienda) {
  const direccion = tienda.direccionFiscal || tienda.direccion || null;
  return {
    nombre: tienda.nombre,
    razonSocial: tienda.razonSocial || null,
    ruc: tienda.ruc || null,
    direccion,
    email: tienda.email || null,
    moneda: tienda.moneda || "PEN",
    // false → el admin avisa que faltan datos legales (R7.1).
    completo: Boolean(tienda.razonSocial && tienda.ruc && direccion)
  };
}

/**
 * Lo que ve el consumidor (constancia): sin ipHash, authUserId, eventos ni
 * quién respondió.
 */
export function serializeHojaStore(h) {
  return {
    id: h.id,
    numero: h.numero,
    tipo: h.tipo,
    estado: h.estado,
    fechaRegistro: h.fechaRegistro,
    fechaLimite: fechaISO(h.fechaLimite),
    proveedor: {
      nombre: h.proveedorNombre,
      razonSocial: h.proveedorRazonSocial,
      ruc: h.proveedorRuc,
      direccion: h.proveedorDireccion
    },
    consumidor: {
      nombres: h.consumidorNombres,
      apellidos: h.consumidorApellidos,
      docTipo: h.consumidorDocTipo,
      docNumero: h.consumidorDocNumero,
      domicilio: h.consumidorDomicilio,
      telefono: h.consumidorTelefono,
      email: h.consumidorEmail,
      esMenor: h.esMenor,
      apoderado: h.esMenor
        ? { nombre: h.apoderadoNombre, docTipo: h.apoderadoDocTipo, docNumero: h.apoderadoDocNumero }
        : null
    },
    bien: {
      tipo: h.bienTipo,
      descripcion: h.bienDescripcion,
      montoReclamado: numeroODecimal(h.montoReclamado),
      moneda: h.moneda,
      numeroPedido: h.numeroPedidoTexto
    },
    detalle: h.detalle,
    pedidoConsumidor: h.pedidoConsumidor,
    medioRespuesta: h.medioRespuesta,
    respuesta: h.estado === "respondida"
      ? { texto: h.respuesta, accionAdoptada: h.accionAdoptada, fecha: h.fechaRespuesta }
      : null
  };
}

/**
 * ¿Se respondió dentro del plazo? Compara el día de Lima de la respuesta con
 * la fecha límite (vence al final de ese día).
 */
function respondidaATiempo(h) {
  if (h.estado !== "respondida" || !h.fechaRespuesta) return null;
  return hoyLima(new Date(h.fechaRespuesta)) <= fechaISO(h.fechaLimite);
}

/** Lo que ve la tienda: semáforo, días restantes, pedido enlazado y eventos. */
export function serializeHojaAdmin(h, hoy = hoyLima()) {
  const base = serializeHojaStore(h);
  const fechaLimite = base.fechaLimite;
  return {
    ...base,
    bien: { ...base.bien, pedidoId: h.pedidoId },
    pedido: h.pedido
      ? { id: h.pedido.id, numeroPedido: h.pedido.numeroPedido, estado: h.pedido.estado, total: numeroODecimal(h.pedido.total) }
      : null,
    respuesta: base.respuesta ? { ...base.respuesta, respondidoPor: h.respondidoPor } : null,
    semaforo: semaforo({ estado: h.estado, fechaLimite }, hoy),
    diasRestantes: h.estado === "respondida" ? null : diasHabilesRestantes(fechaLimite, hoy),
    respondidaATiempo: respondidaATiempo(h),
    eventos: h.eventos?.map(ev => ({
      tipo: ev.tipo,
      detalle: ev.detalle,
      usuario: ev.usuario,
      fecha: ev.fechaRegistro
    })),
    fechaActualizacion: h.fechaActualizacion
  };
}

/** Fila de la bandeja: lo justo para la tabla. */
export function serializeHojaLista(h, hoy = hoyLima()) {
  const fechaLimite = fechaISO(h.fechaLimite);
  return {
    id: h.id,
    numero: h.numero,
    tipo: h.tipo,
    estado: h.estado,
    consumidor: `${h.consumidorNombres} ${h.consumidorApellidos}`,
    consumidorDocNumero: h.consumidorDocNumero,
    numeroPedido: h.numeroPedidoTexto,
    medioRespuesta: h.medioRespuesta,
    fechaRegistro: h.fechaRegistro,
    fechaLimite,
    fechaRespuesta: h.fechaRespuesta,
    semaforo: semaforo({ estado: h.estado, fechaLimite }, hoy),
    diasRestantes: h.estado === "respondida" ? null : diasHabilesRestantes(fechaLimite, hoy),
    respondidaATiempo: respondidaATiempo(h)
  };
}

// ============================================
// CSV (R6.8)
// ============================================

const COLUMNAS_CSV = [
  ["N° hoja", h => h.numero],
  ["Fecha de registro", h => fechaHora(h.fechaRegistro)],
  ["Tipo", h => ETIQUETAS.tipo[h.tipo]],
  ["Estado", h => ETIQUETAS.estado[h.estado]],
  ["Fecha límite", h => fechaISO(h.fechaLimite)],
  ["Fecha de respuesta", h => fechaHora(h.fechaRespuesta)],
  ["A tiempo", h => { const t = respondidaATiempo(h); return t === null ? "" : t ? "Sí" : "No"; }],
  ["Nombres", h => h.consumidorNombres],
  ["Apellidos", h => h.consumidorApellidos],
  ["Tipo doc.", h => h.consumidorDocTipo],
  ["N° doc.", h => h.consumidorDocNumero],
  ["Domicilio", h => h.consumidorDomicilio],
  ["Teléfono", h => h.consumidorTelefono],
  ["Correo", h => h.consumidorEmail],
  ["Menor de edad", h => (h.esMenor ? "Sí" : "No")],
  ["Apoderado", h => h.apoderadoNombre],
  ["Doc. apoderado", h => (h.apoderadoDocNumero ? `${h.apoderadoDocTipo || ""} ${h.apoderadoDocNumero}`.trim() : "")],
  ["Bien", h => ETIQUETAS.bienTipo[h.bienTipo]],
  ["Descripción del bien", h => h.bienDescripcion],
  ["Monto reclamado", h => (h.montoReclamado === null ? "" : Number(h.montoReclamado).toFixed(2))],
  ["Moneda", h => h.moneda],
  ["N° pedido", h => h.numeroPedidoTexto],
  ["Detalle", h => h.detalle],
  ["Pedido del consumidor", h => h.pedidoConsumidor],
  ["Medio de respuesta", h => ETIQUETAS.medioRespuesta[h.medioRespuesta]],
  ["Respuesta", h => h.respuesta],
  ["Acción adoptada", h => h.accionAdoptada],
  ["Respondido por", h => h.respondidoPor]
];

function fechaHora(valor) {
  if (!valor) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
  }).format(new Date(valor));
}

function celda(valor) {
  if (valor === null || valor === undefined) return "";
  let s = String(valor);
  // Evita inyección de fórmulas al abrir el CSV en Excel (=, +, -, @).
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV con BOM y separador ";" (Excel en español lo abre en columnas).
 * @param {object[]} hojas - filas de Prisma
 */
export function hojasACsv(hojas) {
  const lineas = [COLUMNAS_CSV.map(([titulo]) => celda(titulo)).join(";")];
  for (const h of hojas) {
    lineas.push(COLUMNAS_CSV.map(([, valor]) => celda(valor(h))).join(";"));
  }
  return `﻿${lineas.join("\r\n")}\r\n`;
}
