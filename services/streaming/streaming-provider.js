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
 * - Si el proveedor limita las llamadas a su API y se llega al tope, lanza
 *   LimiteApiError y deja de llamar hasta `hasta`, salvo las llamadas urgentes
 *   (el corte, R7.8), que se intentan igual.
 */

/** El proveedor rechazó por exceso de llamadas: no se le llama hasta `hasta`. */
export class LimiteApiError extends Error {
  constructor(hasta) {
    super(`Límite de llamadas del proveedor de video: en pausa hasta ${hasta.toISOString()}`);
    this.name = "LimiteApiError";
    this.hasta = hasta;
  }
}

export class StreamingProvider {
  /** Identificador corto del proveedor (ej. "cloudflare"). */
  get nombre() {
    throw new Error("StreamingProvider.nombre no implementado");
  }

  /**
   * Crea una entrada que graba (para poder ver en vivo) y exige reproducción firmada.
   * `ajustes` sale de los parámetros de la plataforma (modules/parametros):
   * `bajaLatencia` (LL-HLS) y `timeoutSegundos` (corte que abre otra grabación).
   * @param {{ nombre: string, meta: object, habilitada: boolean,
   *           ajustes?: { bajaLatencia?: boolean, timeoutSegundos?: number } }} params
   * @returns {Promise<{ entradaId: string, conexion: object }>}
   */
  async crearEntrada(params) { throw new Error("crearEntrada no implementado"); }

  /**
   * Acepta o rechaza la señal (cortar = deshabilitar). Conserva la configuración
   * de la entrada, salvo los `ajustes` que se le pasen (al habilitar).
   * @param {{ urgente?: boolean, ajustes?: { bajaLatencia?: boolean, timeoutSegundos?: number } }} [opts]
   *   urgente: el corte se intenta aunque el proveedor esté en pausa.
   */
  async habilitarEntrada(entradaId, habilitada, opts) { throw new Error("habilitarEntrada no implementado"); }

  /** @returns {Promise<{ senal: "conectada" | "desconectada" }>} */
  async estadoEntrada(entradaId) { throw new Error("estadoEntrada no implementado"); }

  /** Borra los videos grabados de la entrada y luego la entrada. Idempotente. */
  async borrarEntrada(entradaId) { throw new Error("borrarEntrada no implementado"); }

  /** Borra solo los videos grabados (ej. los de una prueba). Idempotente. */
  async borrarVideos(entradaId) { throw new Error("borrarVideos no implementado"); }

  /**
   * URL de reproducción firmada.
   *
   * Con `enVivo`, el reproductor arranca solo (en silencio: los navegadores no
   * permiten autoplay con sonido) y se entrega `estadoUrl`, que el navegador
   * consulta para saber si hay señal: `{ live: boolean, videoUID: string|null }`.
   * El reproductor no salta solo a la señal nueva tras un corte; el front lo
   * recarga cuando `live` vuelve a true o cambia `videoUID` (POC 2026-10-12).
   * @param {string} id - entrada (en vivo) o video (grabación)
   * @param {{ expiraEn: Date, enVivo?: boolean }} opts
   * @returns {Promise<{ iframeUrl: string, hlsUrl: string, estadoUrl: string|null, expiraEn: Date }>}
   */
  async urlReproduccion(id, opts) { throw new Error("urlReproduccion no implementado"); }

  // ---------- Grabaciones (Fase 4) ----------

  /** Borra solo la entrada: sus grabaciones se conservan. */
  async borrarSoloEntrada(entradaId) { throw new Error("borrarSoloEntrada no implementado"); }

  /** @returns {Promise<{ id: string, estado: "procesando"|"lista"|"error", duracionSeg: number|null, creadoEn: Date|null }[]>} */
  async listarVideos(entradaId) { throw new Error("listarVideos no implementado"); }

  async estadoVideo(videoId) { throw new Error("estadoVideo no implementado"); }

  async borrarVideo(videoId) { throw new Error("borrarVideo no implementado"); }

  /** Genera el MP4 descargable. @returns {Promise<"pendiente"|"lista"|"error">} */
  async pedirDescarga(videoId) { throw new Error("pedirDescarga no implementado"); }

  async estadoDescarga(videoId) { throw new Error("estadoDescarga no implementado"); }

  /** URL firmada del MP4. @param {{ expiraEn: Date, nombreArchivo?: string }} opts */
  async urlDescarga(videoId, opts) { throw new Error("urlDescarga no implementado"); }

  // ---------- Retransmisión y subtítulos (Fase 5, Premium) ----------

  /** @returns {Promise<string>} id de la salida */
  async crearSalida(entradaId, { url, streamKey, habilitada }) { throw new Error("crearSalida no implementado"); }

  async habilitarSalida(entradaId, salidaId, habilitada) { throw new Error("habilitarSalida no implementado"); }

  async borrarSalida(entradaId, salidaId) { throw new Error("borrarSalida no implementado"); }

  async pedirSubtitulos(videoId, idioma) { throw new Error("pedirSubtitulos no implementado"); }

  /** @returns {Promise<"pendiente"|"listo"|"error">} */
  async estadoSubtitulos(videoId, idioma) { throw new Error("estadoSubtitulos no implementado"); }

  /** @returns {Promise<string>} WebVTT */
  async leerSubtitulos(videoId, idioma) { throw new Error("leerSubtitulos no implementado"); }

  // ---------- Operación de la plataforma ----------

  /**
   * Almacenamiento usado y contratado. Si se llena, el proveedor rechaza los lives
   * nuevos de TODAS las tiendas (el job avisa a la plataforma antes).
   * @returns {Promise<{ usadoMin: number, limiteMin: number|null }>}
   */
  async usoAlmacenamiento() { throw new Error("usoAlmacenamiento no implementado"); }

  /**
   * Llamadas hechas a la API desde que arrancó el proceso y pausa por límite.
   * Un proveedor sin límite de llamadas no necesita sobrescribirlo.
   * @returns {{ llamadas: number, pausadaHasta: Date|null }}
   */
  consumoApi() { return { llamadas: 0, pausadaHasta: null }; }

  /**
   * Verifica un webhook y lo traduce a un evento normalizado, o null si no es válido.
   * `error` viene cuando la señal llegó con un problema: `codigo` es el del
   * proveedor (ej. "ERR_GOP_OUT_OF_RANGE") y el mensaje para el usuario sale de
   * MENSAJES_ERROR_SENAL en transmisiones.reglas.js.
   * @param {{ tipo: "videos" | "notificaciones", headers: object, rawBody: Buffer }} req
   * @returns {{ eventoId: string, tipo: string, entradaId: string|null, senal?: string,
   *             error?: { codigo: string, mensaje: string|null } | null, payload: object } | null}
   */
  verificarWebhook(req) { throw new Error("verificarWebhook no implementado"); }
}
