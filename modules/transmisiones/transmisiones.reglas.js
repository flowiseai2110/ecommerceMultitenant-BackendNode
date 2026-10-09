/**
 * Reglas puras de la transmisión (sin BD): en qué etapa está, hasta cuándo vale
 * el enlace, cuándo acepta señal, cuándo se corta, cuánto descuenta y el mensaje
 * de WhatsApp. Ver docs/specs/transmision-eventos/spec.md, R3, R4 y R7.
 */

const MS_MIN = 60 * 1000;
const MS_DIA = 24 * 60 * MS_MIN;

/** La sala de espera abre 1 h antes del inicio (R3.2). */
export const SALA_ABRE_MIN = 60;
/** El enlace sigue mostrando la página (y en Básico la grabación de YouTube) 30 días. */
export const DIAS_GRABACION_BASICO = 30;
/** Sin extensión confirmada, la señal se corta 5 min después del fin (R7.8). */
export const MARGEN_CORTE_MIN = 5;
/** Transmisión de prueba (R5.4): la entrada acepta señal 10 min, sin consumir horas. */
export const PRUEBA_MIN = 10;
/** Tope de invitados del plan Privado y su factor de descuento (decisión 2026-10-06, Cloudflare). */
export const FACTORES = { 25: 0.5, 50: 1, 100: 2, 200: 4 };
export const TOPES_PRIVADO = Object.keys(FACTORES).map(Number);
/** Tope de invitaciones activas del Básico (R3.3). En Privado es el tope elegido. */
export const TOPE_BASICO = 300;

export const topeInvitaciones = (t) => (t.plan === "basico" ? TOPE_BASICO : t.maxInvitados);
export const esVideoPropio = (t) => t.plan === "privado" || t.plan === "premium";

/**
 * Fin de la transmisión: el de la función o, si no tiene, inicio + la duración
 * indicada (R1.2), más los minutos extra confirmados (R7.5).
 */
export function finTransmision(transmision, funcion) {
  const base = funcion.fin ?? new Date(funcion.inicio.getTime() + transmision.duracionMin * MS_MIN);
  return new Date(base.getTime() + (transmision.extensionMin ?? 0) * MS_MIN);
}

/** Minutos contratados (la duración efectiva de la función). */
export const duracionEfectiva = (transmision, funcion) =>
  Math.round((finTransmision(transmision, funcion).getTime() - funcion.inicio.getTime()) / MS_MIN);

export const salaAbreEn = (funcion) => new Date(funcion.inicio.getTime() - SALA_ABRE_MIN * MS_MIN);

/** Corte automático: fin (con las extensiones) + 5 min (R7.8). */
export const corteEn = (transmision, funcion) => new Date(finTransmision(transmision, funcion).getTime() + MARGEN_CORTE_MIN * MS_MIN);

/** Hasta cuándo se ve video en vivo: Básico, el fin; Privado, el corte o "Terminar". */
export function finEnVivo(transmision, funcion) {
  if (!esVideoPropio(transmision)) return finTransmision(transmision, funcion);
  return transmision.terminadaEn ?? corteEn(transmision, funcion);
}

/** Premium (Fase 5): la grabación se ve 90 días en línea (Básico y Privado: 30). */
export const DIAS_EN_LINEA_PREMIUM = 90;

/** Hasta cuándo vale el enlace del invitado (y se ve la grabación). */
export function grabacionHasta(transmision, funcion) {
  const dias = transmision.plan === "premium" ? DIAS_EN_LINEA_PREMIUM : DIAS_GRABACION_BASICO;
  return new Date(finTransmision(transmision, funcion).getTime() + dias * MS_DIA);
}

/**
 * proxima   → falta más de 1 h: datos del evento y cuenta regresiva, sin video.
 * espera    → sala de espera abierta (1 h antes): cuenta regresiva y el reproductor listo.
 * en_vivo   → entre el inicio y el fin (Privado: hasta el corte o "Terminar").
 * terminada → terminó. Básico: se ve la grabación de YouTube. Privado: "Solo en vivo" (Fase 2).
 * vencida   → pasaron 30 días: ya no hay nada que ver.
 * cancelada → el negocio la canceló.
 */
export function etapaTransmision(transmision, funcion, ahora = new Date()) {
  if (transmision.estado === "cancelada") return "cancelada";
  const t = ahora.getTime();
  if (t >= grabacionHasta(transmision, funcion).getTime()) return "vencida";
  if (transmision.terminadaEn && t >= transmision.terminadaEn.getTime()) return "terminada";
  if (t < salaAbreEn(funcion).getTime()) return "proxima";
  if (t < funcion.inicio.getTime()) return "espera";
  if (t < finEnVivo(transmision, funcion).getTime()) return "en_vivo";
  return "terminada";
}

/**
 * ¿La página del invitado muestra el reproductor en esta etapa? En Privado,
 * al terminar solo si hay grabación lista (Fase 4).
 * @param {{ hayGrabacion?: boolean }} [opts]
 */
export function hayVideo(transmision, etapa, { hayGrabacion = false } = {}) {
  if (!esVideoPropio(transmision)) return ["espera", "en_vivo", "terminada"].includes(etapa);
  if (etapa === "terminada") return hayGrabacion;
  return ["espera", "en_vivo"].includes(etapa);
}

/**
 * La entrada del proveedor acepta señal solo en la prueba (10 min) y desde que
 * abre la sala hasta el corte. Fuera de eso está deshabilitada: nadie puede
 * transmitir (ni consumir) con la clave.
 */
export function debeEstarHabilitada(transmision, funcion, ahora = new Date()) {
  if (!esVideoPropio(transmision) || transmision.estado === "cancelada" || transmision.terminadaEn) return false;
  const t = ahora.getTime();
  if (transmision.pruebaHasta && t < transmision.pruebaHasta.getTime()) return true;
  return t >= salaAbreEn(funcion).getTime() && t < corteEn(transmision, funcion).getTime();
}

/** Minutos que descuenta del paquete una duración con el factor del tope (R7.1). */
export const minutosADescontar = (minutos, factor) => Math.ceil(minutos * Number(factor));

/**
 * Minutos realmente transmitidos (R7.1): desde la primera señal (no antes del
 * inicio: conectarse en la sala de espera no consume) hasta el fin real, con
 * tope en lo contratado más el margen de corte.
 */
export function minutosConsumidos(transmision, funcion, finReal) {
  if (!transmision.inicioRealEn) return 0;
  const desde = Math.max(transmision.inicioRealEn.getTime(), funcion.inicio.getTime());
  const minutos = Math.ceil(Math.max(0, finReal.getTime() - desde) / MS_MIN);
  return Math.min(minutos, duracionEfectiva(transmision, funcion) + MARGEN_CORTE_MIN);
}

/** Mes ("YYYY-MM", hora de Lima) al que se cargan las horas: el del inicio de la función. */
export function periodoTransmision(funcion) {
  return new Date(funcion.inicio.getTime() - 5 * 60 * MS_MIN).toISOString().slice(0, 7);
}

/** Una sesión de invitado cuenta como conectada si dio señal de vida hace menos de 75 s. */
export const SESION_VIVA_MS = 75 * 1000;
export const sesionViva = (inv, ahora = new Date()) =>
  !!inv.sesionVistaEn && ahora.getTime() - inv.sesionVistaEn.getTime() < SESION_VIVA_MS;

/** Número para wa.me: 9 dígitos peruanos → con 51 delante. Sin teléfono → null. */
export function numeroWhatsapp(telefono) {
  const digitos = String(telefono ?? "").replace(/\D/g, "");
  if (!digitos) return null;
  return digitos.length === 9 ? `51${digitos}` : digitos;
}

const formatoFecha = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", weekday: "long", day: "numeric", month: "long" });
const formatoHora = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "numeric", minute: "2-digit", hour12: true });

/**
 * "Hola Tía Rosa, te invitamos a ver en vivo el Cumpleaños de Mateo el sábado
 * 18 de octubre a las 4:00 p. m. Entra aquí: {enlace}" (R3.5). Sin teléfono, el
 * enlace de wa.me deja elegir el contacto en WhatsApp.
 */
export function mensajeInvitacion({ nombre, evento, inicio, enlace }) {
  return `Hola ${nombre}, te invitamos a ver en vivo "${evento}" el ${formatoFecha.format(inicio).replace(",", "")} ` +
    `a las ${formatoHora.format(inicio)} (hora de Perú). Entra aquí: ${enlace}`;
}

export function enlaceWhatsapp({ telefono, ...datos }) {
  const numero = numeroWhatsapp(telefono);
  return `https://wa.me/${numero ?? ""}?text=${encodeURIComponent(mensajeInvitacion(datos))}`;
}

// ============================================
// Fase 3: paquetes, extensión y excedente (cobro manual)
// ============================================

/** Paquetes prepagados: horas → precio en soles (decisión 2026-10-06). Vencen a los 12 meses. */
export const PAQUETES = { 10: 250, 25: 550 };
export const MESES_VIGENCIA_PAQUETE = 12;
/** Excedente: S/ 20 por bloque de 30 min de paquete, con tope de 2 h por tienda al mes. */
export const PRECIO_BLOQUE_EXCEDENTE = 20;
export const BLOQUE_EXCEDENTE_MIN = 30;
export const TOPE_EXCEDENTE_MES_MIN = 120;
/** Aviso cuando quedan 15 min (R7.5) y extensiones posibles. */
export const AVISO_FIN_MIN = 15;
export const EXTENSIONES_MIN = [30, 60];
export const EXTENSION_MAX_MIN = 180;
export const EXTENSION_AUTO_OPCIONES = [0, 30, 60];

/** Monto del excedente: bloques de 30 min redondeados hacia arriba. */
export const montoExcedente = (minutos) =>
  minutos > 0 ? Math.ceil(minutos / BLOQUE_EXCEDENTE_MIN) * PRECIO_BLOQUE_EXCEDENTE : 0;

/** ¿Ya toca el aviso de los 15 minutos? */
export function tocaAvisoFin(transmision, funcion, ahora = new Date()) {
  if (!esVideoPropio(transmision) || transmision.terminadaEn || transmision.estado === "cancelada" || transmision.avisoFinEn) return false;
  const fin = finTransmision(transmision, funcion).getTime();
  return ahora.getTime() >= fin - AVISO_FIN_MIN * MS_MIN && ahora.getTime() < fin + MARGEN_CORTE_MIN * MS_MIN;
}

/** ¿Toca extender sola 30 min? Al llegar al fin, con señal y si se autorizó al activar (R7.6). */
export function tocaExtensionAuto(transmision, funcion, ahora = new Date()) {
  if (!esVideoPropio(transmision) || transmision.terminadaEn || transmision.estado === "cancelada" || transmision.noExtender) return false;
  if ((transmision.extensionMin ?? 0) + 30 > (transmision.extensionAutoMaxMin ?? 0)) return false;
  return transmision.senal === "conectada" && ahora >= finTransmision(transmision, funcion) && ahora < corteEn(transmision, funcion);
}

/**
 * Reparte los minutos descontados de una transmisión (R7.3): primero el plan
 * del mes, luego los paquetes (el que vence primero) y al final el excedente
 * confirmado. Lo que no alcance ni esté confirmado queda "absorbido": nunca se
 * cobra sin confirmación (R7.6).
 * @param {{ minutos: number, planRestante: number, paquetes: {id: string, restante: number}[], excedenteAutorizado: number }} p
 */
export function asignarConsumo({ minutos, planRestante, paquetes, excedenteAutorizado }) {
  let resto = Math.max(0, minutos);
  const plan = Math.min(resto, Math.max(0, planRestante));
  resto -= plan;
  const dePaquetes = [];
  for (const p of paquetes) {
    if (!resto) break;
    const usar = Math.min(resto, Math.max(0, p.restante));
    if (usar) dePaquetes.push({ id: p.id, minutos: usar });
    resto -= usar;
  }
  const excedente = Math.min(resto, Math.max(0, excedenteAutorizado));
  return { plan, paquetes: dePaquetes, excedente, absorbido: resto - excedente };
}

/**
 * Saldo del mes `periodo` contando lo reservado por las transmisiones que
 * todavía no terminan: cada una usa primero el plan de SU mes y luego la bolsa
 * común de paquetes. Devuelve lo que queda para una transmisión nueva de ese mes.
 * @param {{ periodo: string, planRestantePorMes: Record<string, number>, planIncluido: number,
 *           paquetesRestante: number, reservas: {periodo: string, minutos: number}[] }} p
 */
export function saldoConReservas({ periodo, planRestantePorMes, planIncluido, paquetesRestante, reservas }) {
  const plan = { ...planRestantePorMes };
  const restoPlan = (m) => (m in plan ? plan[m] : planIncluido);
  let bolsa = Math.max(0, paquetesRestante);
  let reservadas = 0;
  for (const r of reservas) {
    reservadas += r.minutos;
    const delPlan = Math.min(r.minutos, Math.max(0, restoPlan(r.periodo)));
    plan[r.periodo] = restoPlan(r.periodo) - delPlan;
    bolsa = Math.max(0, bolsa - (r.minutos - delPlan));
  }
  const planDisponible = Math.max(0, restoPlan(periodo));
  return { reservadas, planDisponible, paquetesDisponible: bolsa, disponibles: planDisponible + bolsa };
}

// ============================================
// Fase 4: grabación (R8.1)
// ============================================

/** Privado: la grabación se ve y se descarga 30 días (el plazo del enlace). "Guardar 1 año" alarga solo la descarga. */
export const DIAS_GUARDAR_ANIO = 365;
export const PRECIO_GUARDAR_ANIO = 50;
/** Aviso al anfitrión 7 días antes de cada borrado (R8.1.2). */
export const AVISO_BORRADO_DIAS = 7;
/** Una "parte" más corta que esto es un parpadeo de la señal: se descarta. */
export const PARTE_MIN_SEG = 10;

/** Hasta cuándo se puede descargar el MP4: el plazo en línea o, con "Guardar 1 año", un año desde el fin. */
export function descargaHasta(transmision, funcion) {
  // Premium incluye la descarga de 1 año (al crearla se activa guardarAnio).
  if (!transmision.guardarAnio && transmision.plan !== "premium") return grabacionHasta(transmision, funcion);
  return new Date(finTransmision(transmision, funcion).getTime() + DIAS_GUARDAR_ANIO * MS_DIA);
}

/** ¿La transmisión tiene (o tendrá) grabación? Solo Privado/Premium con "grabar" y sin borrar. */
export const conGrabacion = (t) => esVideoPropio(t) && t.grabar && !t.grabacionBorradaEn && t.estado !== "cancelada";

/** Aviso "tu grabación se borra en 7 días" (en línea). */
export function tocaAvisoBorrado(transmision, funcion, ahora = new Date()) {
  if (!conGrabacion(transmision) || !transmision.terminadaEn || transmision.avisoBorradoEn) return false;
  const limite = grabacionHasta(transmision, funcion).getTime();
  return ahora.getTime() >= limite - AVISO_BORRADO_DIAS * MS_DIA && ahora.getTime() < limite;
}

/** Aviso "la descarga de 1 año vence en 7 días". */
export function tocaAvisoDescarga(transmision, funcion, ahora = new Date()) {
  if (!conGrabacion(transmision) || !transmision.guardarAnio || transmision.avisoDescargaEn) return false;
  const limite = descargaHasta(transmision, funcion).getTime();
  return ahora.getTime() >= limite - AVISO_BORRADO_DIAS * MS_DIA && ahora.getTime() < limite;
}

/** Nombre de archivo para la descarga: "cumpleanos-de-mateo-parte-1.mp4". */
export function nombreArchivo(evento, orden, total) {
  const base = String(evento).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "grabacion";
  return total > 1 ? `${base}-parte-${orden}.mp4` : `${base}.mp4`;
}

// ============================================
// Fase 5: Premium (retransmisión y resumen con IA)
// ============================================

/** Premium: S/ 40 por evento, cargo manual (decisión 2026-10-09). La retransmisión va incluida. */
export const PRECIO_PREMIUM = 40;
/** Hasta 2 destinos de retransmisión (Facebook, YouTube) por transmisión (R8.2). */
export const MAX_DESTINOS = 2;
/** Intentos para generar el resumen con IA antes de rendirse. */
export const MAX_INTENTOS_RESUMEN = 3;

/**
 * La retransmisión emite desde que abre la sala hasta el corte, nunca en la
 * prueba antes de la sala: así un ensayo no sale en el Facebook del anfitrión.
 */
export function debeRetransmitir(transmision, funcion, ahora = new Date()) {
  if (transmision.plan !== "premium" || transmision.estado === "cancelada" || transmision.terminadaEn) return false;
  const t = ahora.getTime();
  return t >= salaAbreEn(funcion).getTime() && t < corteEn(transmision, funcion).getTime();
}
