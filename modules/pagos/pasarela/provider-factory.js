import CulqiProvider from "./culqi.provider.js";

/**
 * Registro de proveedores de pago soportados. Agregar un PSP nuevo es registrar
 * su instancia aquí; el resto del sistema lo consume vía getProvider().
 */
const PROVEEDORES = {
  culqi: new CulqiProvider()
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

export default { getProvider, PROVEEDORES_SOPORTADOS };
