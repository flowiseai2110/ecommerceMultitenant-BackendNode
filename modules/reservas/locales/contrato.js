import { createHash } from "node:crypto";

/**
 * Contrato de alquiler (docs/specs/alquiler-locales R8): plantilla con
 * variables `{{titular.nombre}}` que el negocio edita, render al aceptar la
 * solicitud y copia con versión y hash. El cliente acepta ESE texto: si el
 * hash que envía no coincide con el guardado, 409 CONTRATO_DESACTUALIZADO.
 *
 * Una variable desconocida es un error al GUARDAR la plantilla
 * (validarPlantilla), no al aceptar una reserva.
 */

export const VARIABLES_CONTRATO = {
  "codigo": "Código de la reserva",
  "negocio.nombre": "Nombre del local",
  "negocio.razon_social": "Razón social",
  "negocio.ruc": "RUC",
  "negocio.direccion": "Dirección del local",
  "titular.nombre": "Nombre completo del titular",
  "titular.documento": "Documento del titular (tipo y número)",
  "salon": "Salón",
  "fecha": "Fecha del evento",
  "turno": "Turno",
  "horario": "Hora de inicio y fin",
  "aforo": "Aforo máximo del salón",
  "invitados": "Número de invitados",
  "tipo_evento": "Tipo de evento",
  "agasajado": "Agasajado o promoción",
  "paquete": "Paquete y lo que incluye",
  "total": "Total del alquiler",
  "separacion": "Monto de la separación",
  "plan_pagos": "Plan de pagos (una línea por cuota)",
  "garantia": "Garantía por daños",
  "politica_cancelacion": "Política de cancelación por tramos",
  "politica_reprogramacion": "Reglas de reprogramación",
  "proveedores": "Reglas de proveedores externos",
  "hora_tope": "Hora tope de fin del evento"
};

const PATRON = /\{\{\s*([a-z_.]+)\s*\}\}/g;

/** Variables que la plantilla usa y no existen. */
export function variablesDesconocidas(plantilla) {
  const desconocidas = new Set();
  for (const [, nombre] of plantilla.matchAll(PATRON)) if (!(nombre in VARIABLES_CONTRATO)) desconocidas.add(nombre);
  return [...desconocidas];
}

/** @throws {Error} con `variables` si hay alguna desconocida */
export function renderContrato(plantilla, datos) {
  const desconocidas = variablesDesconocidas(plantilla);
  if (desconocidas.length) {
    const e = new Error(`Variables desconocidas en el contrato: ${desconocidas.join(", ")}`);
    e.variables = desconocidas;
    throw e;
  }
  return plantilla.replace(PATRON, (_, nombre) => datos[nombre] ?? "—");
}

export const hashContrato = (texto) => createHash("sha256").update(texto, "utf8").digest("hex");

// ---------- Datos del contrato ----------

const soles = (n) => `S/ ${Number(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** "2026-12-05" → "sábado 5 de diciembre de 2026". */
export function fechaLarga(fecha) {
  const [a, m, d] = fecha.split("-").map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return `${DIAS[dia]} ${d} de ${MESES[m - 1]} de ${a}`;
}

const CONCEPTOS = {
  separacion: "Separación", cuota: "Cuota", saldo: "Saldo", garantia: "Garantía", hora_extra: "Horas extra", descorche: "Descorche",
  danos: "Daños", penalidad: "Penalidad", diferencia: "Diferencia", cargo_reprogramacion: "Cargo por reprogramación"
};
export const etiquetaConcepto = (c) => CONCEPTOS[c] ?? c;

/** "1. Separación — S/ 500.00 — vence el 12/10/2026" */
export function textoPlan(cuotas) {
  return cuotas.map(c => {
    const [a, m, d] = String(c.venceEn).slice(0, 10).split("-");
    return `${c.numero}. ${etiquetaConcepto(c.concepto)} — ${soles(c.monto)} — vence el ${d}/${m}/${a}`;
  }).join("\n");
}

/** Política por tramos en texto (R10.2). Tramos ordenados de más a menos días. */
export function textoTramos(tramos) {
  if (!Array.isArray(tramos) || !tramos.length) return "Según lo acordado con el local.";
  const orden = [...tramos].sort((a, b) => b.desdeDias - a.desdeDias);
  const lineas = orden.map((t, i) => {
    const rango = i === 0 ? `${t.desdeDias} días o más antes del evento`
      : t.desdeDias === 0 ? `Menos de ${orden[i - 1].desdeDias} días antes del evento`
        : `De ${t.desdeDias} a ${orden[i - 1].desdeDias - 1} días antes del evento`;
    return `- ${rango}: se devuelve el ${t.separacionPct} % de la separación y el ${t.restoPct} % del resto de lo pagado.`;
  });
  return [...lineas, "- La garantía se devuelve completa si el evento no se realiza."].join("\n");
}

/**
 * Valores de las variables a partir de la reserva.
 * @param {object} p
 * @param {object} p.tienda - nombre, razonSocial, ruc, direccion
 * @param {object} p.config - configuración de reservas resuelta
 * @param {object} p.reserva - { codigo, titular, docTipo, docNumero, fecha, horaInicio, horaFin, invitados, tipoEvento, agasajado, total, local (snapshot) }
 * @param {Array} p.cuotas - plan de pagos
 * @param {(tipo: string) => string} p.etiquetaEvento
 */
export function datosContrato({ tienda, config, reserva, cuotas, etiquetaEvento }) {
  const l = reserva.local ?? {};
  const separacion = cuotas.find(c => c.concepto === "separacion");
  const proveedores = config.proveedoresExternos
    ? [
      "Se permiten proveedores externos (catering, DJ, decoración).",
      config.tarifaCoordinacion ? `Tarifa de coordinación: ${soles(config.tarifaCoordinacion)}.` : null,
      config.descorcheBotella ? `Descorche: ${soles(config.descorcheBotella)} por botella.` : null
    ].filter(Boolean).join(" ")
    : "No se permiten proveedores externos.";
  const reprogramacion = config.reprogramacionesMax > 0
    ? `Se puede reprogramar hasta ${config.reprogramacionesMax} ${config.reprogramacionesMax === 1 ? "vez" : "veces"}, con al menos ${config.reprogramacionMinDias} días de anticipación${Number(config.cargoReprogramacion) > 0 ? `, con un cargo de ${soles(config.cargoReprogramacion)}` : ", sin cargo"}. La diferencia de precio de la fecha nueva se suma o se descuenta del saldo.`
    : "La reserva no se puede reprogramar.";
  return {
    "codigo": reserva.codigo,
    "negocio.nombre": tienda.nombre,
    "negocio.razon_social": tienda.razonSocial ?? tienda.nombre,
    "negocio.ruc": tienda.ruc ?? "—",
    "negocio.direccion": tienda.direccion ?? "—",
    "titular.nombre": reserva.titular,
    "titular.documento": `${reserva.docTipo} ${reserva.docNumero}`,
    "salon": l.salon?.nombre ?? "—",
    "fecha": fechaLarga(reserva.fecha),
    "turno": l.turno?.nombre ?? "Por horas",
    "horario": `de ${reserva.horaInicio} a ${reserva.horaFin}`,
    "aforo": `${l.salon?.aforoMaximo ?? "—"} personas`,
    "invitados": `${reserva.invitados} personas`,
    "tipo_evento": etiquetaEvento(reserva.tipoEvento),
    "agasajado": reserva.agasajado ?? "—",
    "paquete": l.paquete ? `${l.paquete.nombre}${l.paquete.incluye?.length ? ` (incluye: ${l.paquete.incluye.join(", ")})` : ""}` : "—",
    "total": soles(reserva.total),
    "separacion": separacion ? soles(separacion.monto) : soles(0),
    "plan_pagos": textoPlan(cuotas),
    "garantia": Number(l.garantia) > 0 ? soles(l.garantia) : "Sin garantía",
    "politica_cancelacion": textoTramos(l.tramos ?? config.politicaTramos),
    "politica_reprogramacion": reprogramacion,
    "proveedores": proveedores,
    "hora_tope": config.horaTope
  };
}

/** Plantilla base del seed (L1.14): el negocio la adapta. */
export const PLANTILLA_BASE = `CONTRATO DE ALQUILER DE LOCAL — Reserva {{codigo}}

Conste por el presente documento el contrato de alquiler que celebran {{negocio.razon_social}} (RUC {{negocio.ruc}}), en adelante EL LOCAL, con domicilio en {{negocio.direccion}}, y {{titular.nombre}} ({{titular.documento}}), en adelante EL CLIENTE.

1. OBJETO. EL LOCAL alquila a EL CLIENTE el salón {{salon}} para un evento de tipo {{tipo_evento}} ({{agasajado}}), el {{fecha}}, turno {{turno}}, {{horario}}.

2. AFORO. EL CLIENTE declara {{invitados}}. El aforo máximo autorizado del salón es de {{aforo}} y no podrá superarse.

3. PAQUETE. {{paquete}}.

4. PRECIO Y FORMA DE PAGO. El precio total es de {{total}}. La fecha queda separada con el pago de {{separacion}}. El resto se paga según el siguiente plan:
{{plan_pagos}}

5. GARANTÍA. {{garantia}}. Se devuelve después del evento, descontando horas extra, descorche, daños y penalidades, si los hubiera.

6. CANCELACIÓN.
{{politica_cancelacion}}

7. REPROGRAMACIÓN. {{politica_reprogramacion}}

8. PROVEEDORES. {{proveedores}}

9. HORARIO Y RUIDO. El evento termina como máximo a las {{hora_tope}}, según la ordenanza municipal. Las horas extra se cobran según la tarifa del paquete.

EL CLIENTE declara haber leído y aceptado este contrato.`;
