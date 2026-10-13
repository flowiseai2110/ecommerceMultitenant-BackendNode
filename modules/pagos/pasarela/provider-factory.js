import config from "../../../config/index.js";
import CulqiProvider from "./culqi.provider.js";
import SimuladoProvider from "./simulado.provider.js";

/**
 * Registro de proveedores de pago soportados. Agregar un PSP nuevo es registrar
 * su instancia aquí; el resto del sistema lo consume vía getProvider().
 * El simulador solo existe con PAGOS_SIMULADOR=true fuera de producción.
 */
const PROVEEDORES = {
  culqi: new CulqiProvider(),
  ...(config.pagos.simulador.activo ? { simulado: new SimuladoProvider({ url: config.pagos.simulador.url }) } : {})
};

/** Lista de proveedores soportados (para validaciones/schemas). */
export const PROVEEDORES_SOPORTADOS = Object.keys(PROVEEDORES);

/**
 * Devuelve la instancia del proveedor por su nombre.
 * @param {string} nombre - "culqi" | ...
 * @returns {import("./payment-provider.js").PaymentProvider}
 * @throws {Error} si el proveedor no está soportado.
 */
export function getProvider(nombre) {
  const provider = PROVEEDORES[nombre];
  if (!provider) {
    throw new Error(`Proveedor de pago no soportado: ${nombre}`);
  }
  return provider;
}

/**
 * Proveedor que usa la plataforma para el pago automático (docs/specs/pago-automatico R2.1).
 * null si el configurado no está disponible (p. ej. "simulado" sin el simulador activo).
 * @returns {string|null}
 */
export function proveedorPlataforma() {
  const nombre = config.pagos.proveedor;
  return PROVEEDORES[nombre] ? nombre : null;
}

export default { getProvider, proveedorPlataforma, PROVEEDORES_SOPORTADOS };
