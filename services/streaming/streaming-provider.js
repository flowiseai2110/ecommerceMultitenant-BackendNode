/**
 * Contrato común de un proveedor de video en vivo (docs/specs/transmision-eventos).
 *
 * El módulo de transmisiones habla SOLO contra esta interfaz, nunca contra un
 * proveedor concreto (mismo patrón que storage.service y payment-provider).
 * Cambiar Cloudflare Stream por Mux u otro es escribir una clase nueva.
 *
 * Convenciones:
 * - Una "entrada" es el punto al que transmite la app del celular (live input).
 * - `conexion` son los datos para la app: { rtmpsUrl, streamKey, srtUrl, srtStreamId, srtPassphrase }.
 *   Son secretos: el servicio los guarda cifrados.
 * - La señal se normaliza a: "conectada" | "desconectada".
 */

export class StreamingProvider {
  /** Identificador corto del proveedor (ej. "cloudflare"). */
  get nombre() {
    throw new Error("StreamingProvider.nombre no implementado");
  }

  /**
   * Crea una entrada que graba (para poder ver en vivo) y exige reproducción firmada.
   * @param {{ nombre: string, meta: object, habilitada: boolean }} params
   * @returns {Promise<{ entradaId: string, conexion: object }>}
   */
  async crearEntrada(params) { throw new Error("crearEntrada no implementado"); }

  /** Acepta o rechaza la señal (cortar = deshabilitar). */
  async habilitarEntrada(entradaId, habilitada) { throw new Error("habilitarEntrada no implementado"); }

  /** @returns {Promise<{ senal: "conectada" | "desconectada" }>} */
  async estadoEntrada(entradaId) { throw new Error("estadoEntrada no implementado"); }

  /** Borra los videos grabados de la entrada y luego la entrada. Idempotente. */
  async borrarEntrada(entradaId) { throw new Error("borrarEntrada no implementado"); }

  /** Borra solo los videos grabados (ej. los de una prueba). Idempotente. */
  async borrarVideos(entradaId) { throw new Error("borrarVideos no implementado"); }

  /**
   * URL de reproducción firmada.
   * @param {string} id - entrada (en vivo) o video (grabación)
   * @param {{ expiraEn: Date }} opts
   * @returns {Promise<{ iframeUrl: string, hlsUrl: string, expiraEn: Date }>}
   */
  async urlReproduccion(id, opts) { throw new Error("urlReproduccion no implementado"); }

  /**
   * Verifica un webhook y lo traduce a un evento normalizado, o null si no es válido.
   * @param {{ tipo: "videos" | "notificaciones", headers: object, rawBody: Buffer }} req
   * @returns {{ eventoId: string, tipo: string, entradaId: string|null, senal?: string, payload: object } | null}
   */
  verificarWebhook(req) { throw new Error("verificarWebhook no implementado"); }
}
