import config from "../../config/index.js";
import logger from "../../config/logger.js";
import MemoryCache from "../../utils/memory-cache.js";
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

// Trozo del padrón ya indexado por RUC. Pocos trozos: cada uno ocupa varios MB
// en memoria y la mayoría de tiendas solo ve unos cuantos prefijos.
const trozos = new MemoryCache({ max: 8 });
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

async function descargarTrozo(prefijo) {
  const { baseUrl, timeoutMs, ttlMs } = config.sunat.padron;
  let response;
  try {
    response = await fetch(`${baseUrl}/${prefijo}.json`, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    logger.warn(`Padrón RUC: fallo al descargar ${prefijo}: ${error.message}`);
    throw new AppError("No pudimos consultar SUNAT en este momento", 503, "SUNAT_NO_DISPONIBLE");
  }
  // Sin trozo para el prefijo = ningún RUC lo usa.
  if (response.status === 404) {
    const vacio = { columnas: [], registros: new Map() };
    trozos.set(prefijo, vacio, ttlMs);
    return vacio;
  }
  if (!response.ok) {
    logger.warn(`Padrón RUC: ${prefijo} respondió ${response.status}`);
    throw new AppError("No pudimos consultar SUNAT en este momento", 503, "SUNAT_NO_DISPONIBLE");
  }

  const { columns, records } = await response.json();
  const trozo = { columnas: columns, registros: new Map(records.map(r => [r[0], r])) };
  trozos.set(prefijo, trozo, ttlMs);
  return trozo;
}

// El padrón casi nunca trae los nombres de distrito/provincia/departamento,
// solo el ubigeo: el storefront los resuelve con su dataset INEI.
export async function consultarRuc(ruc) {
  if (!esRucValido(ruc)) throw new ValidationError("RUC inválido");

  const { columnas, registros } = await obtenerTrozo(ruc.slice(0, 5));
  const fila = registros.get(ruc);
  if (!fila) throw new NotFoundError("RUC", "El RUC no figura en el padrón de SUNAT");

  const r = Object.fromEntries(columnas.map((col, i) => [col, fila[i] ?? null]));
  // El padrón usa "-" cuando no hay domicilio declarado.
  const direccion = r.direccion && r.direccion.trim() !== "-" ? r.direccion.trim() : null;

  return {
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
}
