import { randomUUID } from "node:crypto";
import { ValidationError } from "../../utils/errors.js";

/**
 * Reglas puras de los comunicados de la tienda (docs/specs/comunicados).
 * Sin Prisma: el servicio lee y guarda la lista; aquí se decide estado,
 * versión, vigencia e historial, para poder probarlo sin base de datos.
 *
 * Perú no tiene horario de verano: la hora de Lima es siempre UTC-5.
 */

export const NIVELES = ["informativo", "importante", "urgente"];
export const MAX_EN_CURSO = 10; // activos + programados + pausados (Shopify: 12 anuncios)
export const MAX_HISTORIAL = 30; // vencidos que se conservan; el resto se borra solo
export const MAX_VIGENCIA_DIAS = 180;

const PESO_NIVEL = { urgente: 3, importante: 2, informativo: 1 };
const OFFSET_LIMA_MS = 5 * 3_600_000;
const DIA_MS = 86_400_000;

// Cambiar estos campos vuelve a mostrar el comunicado a quien ya lo cerró (R1.5).
const CAMPOS_CONTENIDO = ["titulo", "mensaje", "nivel", "boton"];
// Lo que el cliente nunca decide: lo pone el servidor.
const CAMPOS_SERVIDOR = ["version", "actualizadoEn", "actualizadoPor", "emailEnvio", "estado"];

/** Instante → ISO con offset de Lima ("2026-10-10T00:00:00-05:00"). */
export function isoLima(instante) {
  const local = new Date(new Date(instante).getTime() - OFFSET_LIMA_MS);
  return `${local.toISOString().slice(0, 19)}-05:00`;
}

/** programado | activo | pausado | vencido. Vencido gana a pausado. */
export function estadoDe(comunicado, ahora = new Date()) {
  const t = ahora.getTime();
  if (new Date(comunicado.fin).getTime() <= t) return "vencido";
  if (comunicado.pausado) return "pausado";
  if (new Date(comunicado.inicio).getTime() > t) return "programado";
  return "activo";
}

const igual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function sinCamposServidor(c) {
  const copia = { ...c };
  for (const campo of CAMPOS_SERVIDOR) delete copia[campo];
  return copia;
}

/**
 * Lista que llega del admin → lista a guardar: ids, inicio por defecto,
 * versión, auditoría, envío de email preservado, límites e historial.
 * Lanza ValidationError con `data.message` en español.
 */
export function prepararLista(nueva, anterior = [], ahora = new Date(), usuario = "system") {
  const previos = new Map(anterior.map((c) => [c.id, c]));

  const lista = nueva.map((entrada, indice) => {
    const limpio = sinCamposServidor(entrada);
    const previo = limpio.id ? previos.get(limpio.id) : undefined;
    const c = {
      ...limpio,
      id: limpio.id ?? randomUUID(),
      inicio: isoLima(limpio.inicio ?? previo?.inicio ?? ahora),
      fin: isoLima(limpio.fin),
      boton: limpio.boton ?? null
    };

    const inicioMs = new Date(c.inicio).getTime();
    const finMs = new Date(c.fin).getTime();
    if (finMs <= inicioMs) fallar(indice, "La fecha de fin debe ser posterior al inicio");
    if (finMs - inicioMs > MAX_VIGENCIA_DIAS * DIA_MS) {
      fallar(indice, `Un comunicado puede estar vigente como máximo ${MAX_VIGENCIA_DIAS} días`);
    }

    if (!previo) {
      return { ...c, version: 1, actualizadoEn: isoLima(ahora), actualizadoPor: usuario };
    }
    const contenidoCambio = CAMPOS_CONTENIDO.some((campo) => !igual(c[campo], previo[campo]));
    const algoCambio = contenidoCambio || !igual(c, sinCamposServidor(previo));
    return {
      ...c,
      version: contenidoCambio ? (previo.version ?? 1) + 1 : (previo.version ?? 1),
      actualizadoEn: algoCambio ? isoLima(ahora) : previo.actualizadoEn,
      actualizadoPor: algoCambio ? usuario : previo.actualizadoPor,
      ...(previo.emailEnvio ? { emailEnvio: previo.emailEnvio } : {})
    };
  });

  const enCurso = lista.filter((c) => estadoDe(c, ahora) !== "vencido");
  if (enCurso.length > MAX_EN_CURSO) {
    throw mensaje(`Puedes tener como máximo ${MAX_EN_CURSO} comunicados activos, programados o pausados`);
  }

  // Historial: solo los MAX_HISTORIAL vencidos más recientes (por fin).
  const vencidos = lista
    .filter((c) => estadoDe(c, ahora) === "vencido")
    .sort((a, b) => new Date(b.fin) - new Date(a.fin));
  const conservar = new Set(vencidos.slice(0, MAX_HISTORIAL).map((c) => c.id));
  return lista.filter((c) => estadoDe(c, ahora) !== "vencido" || conservar.has(c.id));
}

/** Orden de muestra: nivel (urgente primero) y luego el inicio más reciente. */
export function compararPrioridad(a, b) {
  return (PESO_NIVEL[b.nivel] ?? 0) - (PESO_NIVEL[a.nivel] ?? 0) || new Date(b.inicio) - new Date(a.inicio);
}

/** Lo que ve el admin: todos, con su estado, los en curso primero. */
export function listaAdmin(lista = [], ahora = new Date()) {
  const orden = { activo: 0, programado: 1, pausado: 2, vencido: 3 };
  return lista
    .map((c) => ({ ...c, estado: estadoDe(c, ahora) }))
    .sort((a, b) => orden[a.estado] - orden[b.estado] || compararPrioridad(a, b));
}

/** Lo que recibe el storefront: solo los vigentes, sin datos internos (R2.1). */
export function vigentesPublicos(lista = [], ahora = new Date()) {
  return lista
    .filter((c) => estadoDe(c, ahora) === "activo")
    .sort(compararPrioridad)
    .map(({ actualizadoPor: _p, actualizadoEn: _e, emailEnvio: _m, pausado: _z, ...publico }) => publico);
}

function mensaje(texto) {
  return new ValidationError(texto, { message: texto });
}

function fallar(indice, texto) {
  throw new ValidationError(texto, { message: texto, indice });
}
