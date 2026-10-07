import config from "../../config/index.js";
import logger from "../../config/logger.js";
import MemoryCache from "../../utils/memory-cache.js";
import { ubigeoINEI } from "peru-utils";
import { AppError, NotFoundError, ValidationError } from "../../utils/errors.js";

// Consulta de RUC sobre el Padrón Reducido de SUNAT (datos abiertos, se
// publica a diario). No bajamos el txt completo (~11M filas): un repo de
// GitHub lo parte en JSON por los 5 primeros dígitos del RUC y jsDelivr los
// sirve por CDN. Cada consulta baja un solo trozo (~1-2 MB) y lo cachea en
// memoria. La URL base es configurable para apuntar a un fork propio.

const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

// Formato + dígito verificador (módulo 11 de SUNAT).
export function esRucValido(ruc) {
  if (!/^(10|15|17|20)\d{9}$/.test(ruc)) return false;
  const suma = PESOS.reduce((acc, peso, i) => acc + peso * Number(ruc[i]), 0);
  const digito = (11 - (suma % 11)) % 10;
  return digito === Number(ruc[10]);
}

// Trozo del padrón ya indexado por RUC. Solo 2: los grandes (~15 MB de JSON)
// ocupan ~40 MB de heap cada uno, y con 8 el free tier de Railway podía
// quedarse sin memoria. Lo que se repite de verdad son los RUC consultados,
// así que esos se cachean aparte: pesan nada y sobreviven a que su trozo salga.
const trozos = new MemoryCache({ max: 2 });
const rucs = new MemoryCache({ max: 2000 });
const enVuelo = new Map();

async function obtenerTrozo(prefijo) {
  const cacheado = trozos.get(prefijo);
  if (cacheado) return cacheado;
  // Dos consultas simultáneas del mismo prefijo comparten la descarga.
  if (enVuelo.has(prefijo)) return enVuelo.get(prefijo);

  const promesa = descargarTrozo(prefijo).finally(() => enVuelo.delete(prefijo));
  enVuelo.set(prefijo, promesa);
  return promesa;
}

const noDisponible = () => new AppError("No pudimos consultar SUNAT en este momento", 503, "SUNAT_NO_DISPONIBLE");

// jsDelivr primero (CDN, suele estar caliente); si falla o tarda, GitHub directo.
async function descargarTrozo(prefijo) {
  const { baseUrl, fallbackUrl, ttlMs } = config.sunat.padron;
  const fuentes = [baseUrl, fallbackUrl].filter(Boolean);

  for (const base of fuentes) {
    let trozo;
    try {
      trozo = await descargarDe(base, prefijo);
    } catch (error) {
      logger.warn(`Padrón RUC: fallo al descargar ${prefijo} de ${base}: ${error.message}`);
      continue;
    }
    trozos.set(prefijo, trozo, ttlMs);
    return trozo;
  }
  throw noDisponible();
}

async function descargarDe(base, prefijo) {
  // El timeout cubre también el cuerpo: si se corta a medias, el json() lanza
  // y se prueba la siguiente fuente en vez de escaparse como un 500.
  const response = await fetch(`${base}/${prefijo}.json`, {
    signal: AbortSignal.timeout(config.sunat.padron.timeoutMs)
  });
  // Sin trozo para el prefijo = ningún RUC lo usa.
  if (response.status === 404) return { columnas: [], registros: new Map() };
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const { columns, records } = await response.json();
  return { columnas: columns, registros: new Map(records.map(r => [r[0], r])) };
}

// El padrón casi nunca trae los nombres de distrito/provincia/departamento,
// solo el ubigeo: el storefront los resuelve con su dataset INEI.
export async function consultarRuc(ruc) {
  if (!esRucValido(ruc)) throw new ValidationError("RUC inválido");

  const cacheado = rucs.get(ruc);
  if (cacheado) return cacheado;

  const { columnas, registros } = await obtenerTrozo(ruc.slice(0, 5));
  const fila = registros.get(ruc);
  if (!fila) throw new NotFoundError("RUC", "El RUC no figura en el padrón de SUNAT");

  const r = Object.fromEntries(columnas.map((col, i) => [col, fila[i] ?? null]));
  // El padrón usa "-" cuando no hay domicilio declarado.
  const direccion = r.direccion && r.direccion.trim() !== "-" ? r.direccion.trim() : null;

  const datos = {
    ruc,
    razonSocial: r.razon_social,
    estado: r.estado,
    condicion: r.condicion,
    tipoContribuyente: r.tipo_contribuyente,
    ubigeo: r.ubigeo,
    direccion,
    departamento: r.departamento,
    provincia: r.provincia,
    distrito: r.distrito,
    activo: r.estado === "ACTIVO",
    habido: r.condicion === "HABIDO"
  };
  rucs.set(ruc, datos, config.sunat.padron.ttlMs);
  return datos;
}

// "JR. CENTENARIO 156, La Molina - Lima - Lima": mismo formato que muestra el
// checkout. Los nombres salen del dataset INEI a partir del ubigeo.
function direccionCompleta(r) {
  if (!r.direccion) return null;
  let lugar = [r.distrito, r.provincia, r.departamento].filter(Boolean);
  try {
    const u = r.ubigeo ? ubigeoINEI.getUbigeoFullDetails(r.ubigeo) : null;
    if (u?.district) lugar = [u.district, u.province, u.department];
  } catch { /* ubigeo desconocido: se usa lo que traiga el padrón */ }
  return lugar.length ? `${r.direccion}, ${lugar.join(" - ")}` : r.direccion;
}

/**
 * Datos de factura tomados del padrón, no de lo que mande el navegador: así la
 * razón social no se puede alterar ni llegar con errores de tipeo.
 *
 * - RUC que no figura o no está ACTIVO → ValidationError (no se puede facturar).
 * - Padrón caído → se acepta con razón social null y `verificado: false`. Una
 *   caída del CDN no debe costar una venta: el dígito verificador ya descarta
 *   los RUC mal escritos y el vendedor completa la razón social al emitir.
 * - Sin domicilio en el padrón (frecuente en RUC 10) → dirección null. La
 *   dirección del adquiriente no es obligatoria en la factura electrónica.
 */
export async function datosFactura(ruc) {
  if (!esRucValido(ruc)) throw new ValidationError("RUC inválido");
  let r;
  try {
    r = await consultarRuc(ruc);
  } catch (error) {
    if (error.statusCode === 404) {
      throw new ValidationError("El RUC no figura en el padrón de SUNAT. Revisa el número o pide boleta.");
    }
    if (error.statusCode === 503) {
      logger.warn(`Factura con RUC ${ruc} sin verificar: padrón no disponible`);
      return { razonSocial: null, direccionFiscal: null, verificado: false };
    }
    throw error;
  }
  if (!r.activo) {
    throw new ValidationError(`El RUC figura como ${r.estado} en SUNAT. Usa otro RUC o pide boleta.`);
  }
  return { razonSocial: r.razonSocial, direccionFiscal: direccionCompleta(r), verificado: true };
}
