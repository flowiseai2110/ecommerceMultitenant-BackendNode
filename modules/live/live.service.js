import { prisma } from "../../config/prisma.js";
import { ValidationError, UnprocessableError } from "../../utils/errors.js";
import { normalizarLinks } from "./live.url.js";

const HORA_MS = 60 * 60 * 1000;
const DURACION_DEFAULT = 4;
const DURACION_MAX = 12;

/**
 * Gestiona el aviso de live de cada tienda (avisos_live, una fila por tienda).
 *
 * Apagado 100% MANUAL: el emprendedor detiene el live con POST /stop. No hay
 * cron ni jobs en background.
 *
 * Única salvaguarda (NO es un proceso automático): expiría perezosa. Al leer
 * (get / getPublic / antes de extend), si `expiraEn` ya pasó, se corrige el
 * estado a inactivo dentro del propio request. Así una pantalla que se abre no
 * muestra como activo un live cuya hora ya venció aunque nadie haya pulsado
 * "Detener". Es una comprobación determinista dentro del handler, no un timer.
 */
class LiveService {
  #usuario(user) {
    return user?.email || user?.id || "system";
  }

  /** get-or-create: garantiza que exista la fila de la tienda. */
  async #ensure(tiendaId, user) {
    return prisma.avisos_live.upsert({
      where: { tiendaId },
      create: { tiendaId, usuarioRegistro: this.#usuario(user) },
      update: {}
    });
  }

  /** Apaga en BD un live cuyo expiraEn ya pasó (defensa ante retraso del cron). */
  async #aplicarExpiracion(row) {
    if (row.activo && row.expiraEn && row.expiraEn.getTime() <= Date.now()) {
      return prisma.avisos_live.update({
        where: { tiendaId: row.tiendaId },
        data: { activo: false, fechaActualizacion: new Date(), usuarioActualizacion: "system" }
      });
    }
    return row;
  }

  /** GET — configuración actual de la tienda (crea la fila si no existe). */
  async get(tiendaId, user) {
    const row = await this.#ensure(tiendaId, user);
    return this.#aplicarExpiracion(row);
  }

  /** Lectura pública (storefront): NO crea la fila. Devuelve null si no existe. */
  async getPublic(tiendaId) {
    const row = await prisma.avisos_live.findUnique({ where: { tiendaId } });
    if (!row) return null;
    return this.#aplicarExpiracion(row);
  }

  /** PUT /links — guarda/actualiza los enlaces sin activar el live. */
  async updateLinks(tiendaId, links, user) {
    await this.#ensure(tiendaId, user);
    const normalizados = normalizarLinks(links); // lanza ValidationError si un link es inválido
    return prisma.avisos_live.update({
      where: { tiendaId },
      data: {
        ...normalizados,
        fechaActualizacion: new Date(),
        usuarioActualizacion: this.#usuario(user)
      }
    });
  }

  /** POST /start — activa el live. */
  async start(tiendaId, data, user) {
    const row = await this.#ensure(tiendaId, user);

    // Cada plataforma marcada debe tener un link guardado.
    const faltantes = [];
    if (data.mostrarTiktok && !row.tiktokUrl) faltantes.push("TikTok");
    if (data.mostrarYoutube && !row.youtubeUrl) faltantes.push("YouTube");
    if (data.mostrarFacebook && !row.facebookUrl) faltantes.push("Facebook");
    if (faltantes.length) {
      const msg = `Primero guarda el enlace de: ${faltantes.join(", ")}`;
      throw new ValidationError(msg, { campo: "links", message: msg });
    }

    const horas = Math.min(Math.max(data.duracionHoras ?? DURACION_DEFAULT, 1), DURACION_MAX);
    const now = new Date();
    const expira = new Date(now.getTime() + horas * HORA_MS);

    return prisma.avisos_live.update({
      where: { tiendaId },
      data: {
        activo: true,
        titulo: data.titulo ?? null,
        mostrarTiktok: data.mostrarTiktok,
        mostrarYoutube: data.mostrarYoutube,
        mostrarFacebook: data.mostrarFacebook,
        iniciadoEn: now,
        expiraEn: expira,
        fechaActualizacion: now,
        usuarioActualizacion: this.#usuario(user)
      }
    });
  }

  /** POST /extend — suma 1 hora sin superar 12h desde el inicio. Solo si activo. */
  async extend(tiendaId, user) {
    const row = await this.#aplicarExpiracion(await this.#ensure(tiendaId, user));
    if (!row.activo) {
      throw new UnprocessableError("No hay un live activo para extender");
    }

    const tope = new Date(new Date(row.iniciadoEn).getTime() + DURACION_MAX * HORA_MS);
    let nueva = new Date(new Date(row.expiraEn).getTime() + HORA_MS);
    if (nueva > tope) nueva = tope;

    return prisma.avisos_live.update({
      where: { tiendaId },
      data: {
        expiraEn: nueva,
        fechaActualizacion: new Date(),
        usuarioActualizacion: this.#usuario(user)
      }
    });
  }

  /** POST /stop — apaga el live (activo=false, expiraEn=now). */
  async stop(tiendaId, user) {
    await this.#ensure(tiendaId, user);
    const now = new Date();
    return prisma.avisos_live.update({
      where: { tiendaId },
      data: {
        activo: false,
        expiraEn: now,
        fechaActualizacion: now,
        usuarioActualizacion: this.#usuario(user)
      }
    });
  }
}

export default LiveService;
