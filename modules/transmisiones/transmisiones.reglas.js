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

/** Fin de la transmisión: el de la función o, si no tiene, inicio + la duración indicada (R1.2). */
export function finTransmision(transmision, funcion) {
  return funcion.fin ?? new Date(funcion.inicio.getTime() + transmision.duracionMin * MS_MIN);
}

/** Minutos contratados (la duración efectiva de la función). */
export const duracionEfectiva = (transmision, funcion) =>
  Math.round((finTransmision(transmision, funcion).getTime() - funcion.inicio.getTime()) / MS_MIN);

export const salaAbreEn = (funcion) => new Date(funcion.inicio.getTime() - SALA_ABRE_MIN * MS_MIN);

/** Corte automático: fin + 5 min (R7.8). La extensión confirmada llega en la Fase 3. */
export const corteEn = (transmision, funcion) => new Date(finTransmision(transmision, funcion).getTime() + MARGEN_CORTE_MIN * MS_MIN);

/** Hasta cuándo se ve video en vivo: Básico, el fin; Privado, el corte o "Terminar". */
export function finEnVivo(transmision, funcion) {
  if (!esVideoPropio(transmision)) return finTransmision(transmision, funcion);
  return transmision.terminadaEn ?? corteEn(transmision, funcion);
}

/** Hasta cuándo vale el enlace del invitado. */
export function grabacionHasta(transmision, funcion) {
  return new Date(finTransmision(transmision, funcion).getTime() + DIAS_GRABACION_BASICO * MS_DIA);
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

/** ¿La página del invitado muestra el reproductor en esta etapa? */
export function hayVideo(transmision, etapa) {
  return esVideoPropio(transmision)
    ? ["espera", "en_vivo"].includes(etapa)
    : ["espera", "en_vivo", "terminada"].includes(etapa);
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
