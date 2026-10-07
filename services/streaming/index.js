import config from "../../config/index.js";
import CloudflareStreamProvider from "./cloudflare.provider.js";

/**
 * Proveedor de video en vivo según STREAMING_DRIVER (hoy: "cloudflare").
 * Agregar otro (ej. Mux) es registrar su instancia aquí.
 */
const PROVEEDORES = {
  cloudflare: new CloudflareStreamProvider()
};

/** @returns {import("./streaming-provider.js").StreamingProvider} */
export function getStreamingProvider(nombre = config.streaming.driver) {
  const provider = PROVEEDORES[nombre];
  if (!provider) throw new Error(`Proveedor de video no soportado: ${nombre}`);
  return provider;
}
