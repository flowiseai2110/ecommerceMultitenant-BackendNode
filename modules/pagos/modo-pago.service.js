import { prisma } from "../../config/prisma.js";
import { ConflictError, NotFoundError, UnprocessableError } from "../../utils/errors.js";
import { getProvider, proveedorPlataforma } from "./pasarela/provider-factory.js";
import PasarelaConfigService from "./pasarela/pasarela-config.service.js";

const configService = new PasarelaConfigService();

/**
 * Cómo cobra la tienda (docs/specs/pago-automatico R1, R2):
 *   manual     → el cliente sube la captura y el negocio verifica
 *   automatico → pasarela de la plataforma, confirmación inmediata
 *
 * La tienda no elige proveedor: usa el de la plataforma (PAGOS_PROVEEDOR).
 * "automatico" solo rige si la pasarela está lista; si deja de estarlo (le
 * borraron la llave), la tienda cobra en manual hasta que se complete.
 */

export const MODOS_PAGO = ["manual", "automatico"];
export const METODOS_AUTOMATICOS = ["tarjeta", "yape"];

/**
 * Lo que le falta a la tienda para cobrar en automático (pura).
 * @param {{ proveedor: string|null, requiereCredenciales: boolean, configTienda: object|null }} estado
 * @returns {string[]} "proveedor" | "llavePublica" | "llaveSecreta" | "activo"
 */
export function faltantesPasarela({ proveedor, requiereCredenciales, configTienda }) {
  if (!proveedor) return ["proveedor"];
  if (!requiereCredenciales) return [];
  const faltan = [];
  if (!configTienda?.llavePublica) faltan.push("llavePublica");
  if (!configTienda?.llaveSecretaCifrada) faltan.push("llaveSecreta");
  if (!configTienda?.activo) faltan.push("activo");
  return faltan;
}

async function estadoPasarela(tiendaId) {
  const proveedor = proveedorPlataforma();
  const requiereCredenciales = proveedor ? getProvider(proveedor).requiereCredenciales : true;
  const configTienda = proveedor && requiereCredenciales
    ? await prisma.tienda_pasarela_config.findUnique({ where: { uq_pasarela_tienda_proveedor: { tiendaId, proveedor } } })
    : null;
  const faltan = faltantesPasarela({ proveedor, requiereCredenciales, configTienda });
  return {
    proveedor, faltan, listo: faltan.length === 0, requiereCredenciales,
    llavePublica: configTienda?.llavePublica ?? null,
    llaveSecretaConfigurada: Boolean(configTienda?.llaveSecretaCifrada),
    modoPrueba: proveedor === "simulado" || configTienda?.modo === "test"
  };
}

async function modoGuardado(tiendaId) {
  const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { modoPago: true } });
  if (!tienda) throw new NotFoundError("Tienda");
  return tienda.modoPago;
}

/**
 * Admin (R1.2): el modo elegido, si la pasarela está lista y qué credenciales
 * pide (sin decir de qué proveedor: la tienda solo ve "pago automático").
 */
export async function obtenerModo(tiendaId) {
  const [modo, pasarela] = await Promise.all([modoGuardado(tiendaId), estadoPasarela(tiendaId)]);
  return {
    modo,
    listo: pasarela.listo,
    faltan: pasarela.faltan,
    modoPrueba: pasarela.modoPrueba,
    credenciales: {
      requeridas: pasarela.requiereCredenciales,
      llavePublica: pasarela.llavePublica,
      llaveSecretaConfigurada: pasarela.llaveSecretaConfigurada
    }
  };
}

/**
 * Admin: guarda las llaves del pago automático en la pasarela de la plataforma
 * (cifradas, ver PasarelaConfigService) y las deja activas. La llave secreta
 * es opcional al editar: sin ella se conserva la guardada.
 */
export async function guardarCredenciales(tiendaId, { llavePublica, llaveSecreta }, user = null) {
  const proveedor = proveedorPlataforma();
  if (!proveedor) {
    const message = "El pago automático no está disponible por ahora";
    throw new UnprocessableError(message, { message, motivo: "PASARELA_NO_DISPONIBLE" });
  }
  await configService.upsert(tiendaId, {
    proveedor,
    llavePublica,
    ...(llaveSecreta ? { llaveSecreta } : {}),
    modo: String(llavePublica ?? "").startsWith("pk_live") ? "live" : "test",
    activo: true
  }, user);
  return obtenerModo(tiendaId);
}

/** Admin (R1.3, R1.4): cambia el modo; "automatico" exige la pasarela lista. */
export async function cambiarModo(tiendaId, modo, user = null) {
  if (modo === "automatico") {
    const pasarela = await estadoPasarela(tiendaId);
    if (!pasarela.listo) {
      const message = "Completa la configuración del pago automático antes de activarlo";
      throw new UnprocessableError(message, { message, motivo: "PASARELA_NO_LISTA", faltan: pasarela.faltan });
    }
  }
  await prisma.tiendas.update({
    where: { id: tiendaId },
    data: { modoPago: modo, fechaActualizacion: new Date(), usuarioActualizacion: user?.email ?? user?.id ?? null }
  });
  return obtenerModo(tiendaId);
}

/**
 * Modo que rige de verdad: "automatico" solo con la pasarela lista.
 * @returns {Promise<{ modo: "manual"|"automatico", proveedor: string|null, llavePublica: string|null }>}
 */
export async function modoEfectivo(tiendaId) {
  const modo = await modoGuardado(tiendaId);
  if (modo !== "automatico") return { modo: "manual", proveedor: null, llavePublica: null, modoPrueba: false };
  const pasarela = await estadoPasarela(tiendaId);
  return pasarela.listo
    ? { modo: "automatico", proveedor: pasarela.proveedor, llavePublica: pasarela.llavePublica, modoPrueba: pasarela.modoPrueba }
    : { modo: "manual", proveedor: null, llavePublica: null, modoPrueba: false };
}

/**
 * Store (R2.3): lo que el front necesita para pedir el token. `proveedor` solo
 * sirve para elegir cómo tokenizar; la tienda no lo muestra.
 */
export async function configPublica(tiendaId) {
  const { modo, proveedor, llavePublica, modoPrueba } = await modoEfectivo(tiendaId);
  if (modo === "manual") return { modo, proveedor: null, llavePublica: null, metodos: [] };
  return {
    modo,
    proveedor,
    llavePublica,
    metodos: METODOS_AUTOMATICOS,
    // En prueba la tienda muestra las tarjetas de prueba; nunca se cobra de verdad.
    modoPrueba,
    // El simulador tokeniza en la misma API (ruta relativa a /api/v1).
    ...(proveedor === "simulado" ? { urlTokens: "/simulador-pagos/tokens" } : {})
  };
}

/** Para cobrar con pasarela (R3.1): la tienda debe estar en automático. */
export async function exigirAutomatico(tiendaId) {
  const efectivo = await modoEfectivo(tiendaId);
  if (efectivo.modo !== "automatico") {
    const message = "Esta tienda no cobra con pago en línea";
    throw new ConflictError(message, { message, motivo: "PAGO_MANUAL" });
  }
  return efectivo;
}

/** Para subir una captura (R3.7): en automático no hay pago manual. */
export async function exigirManual(tiendaId) {
  const efectivo = await modoEfectivo(tiendaId);
  if (efectivo.modo === "automatico") {
    const message = "Esta tienda cobra en línea: paga con tarjeta o Yape desde aquí";
    throw new ConflictError(message, { message, motivo: "PAGO_AUTOMATICO" });
  }
}
