import { prisma } from "../../../config/prisma.js";
import { NotFoundError } from "../../../utils/errors.js";
import { encryptSecret, decryptSecret } from "../../../utils/crypto.js";

/**
 * Gestiona las credenciales de pasarela de cada tienda (tienda_pasarela_config).
 *
 * Regla de seguridad: la llave secreta (sk_) y el webhook secret se guardan
 * CIFRADOS (AES-256-GCM). Solo se descifran en memoria justo antes de llamar al
 * proveedor (getCredentials); nunca se exponen al frontend ni se loggean.
 */
class PasarelaConfigService {
  /**
   * Crea o actualiza la configuración de un proveedor para una tienda.
   * Cifra la llave secreta y el webhook secret antes de persistir.
   * @param {string} tiendaId
   * @param {object} data - { proveedor, modo, llavePublica, llaveSecreta, webhookSecret, activo }
   * @param {object} [user] - usuario autenticado (auditoría)
   * @returns {Promise<object>} config pública (sin secretos)
   */
  async upsert(tiendaId, data, user = null) {
    const { proveedor, modo, llavePublica, llaveSecreta, webhookSecret, activo } = data;
    const usuario = user?.email || user?.id || "system";
    const now = new Date();

    // Solo re-cifrar los secretos que vinieron en la request (permite editar la
    // llave pública o el modo sin re-enviar la secreta).
    const secretFields = {};
    if (llaveSecreta !== undefined) {
      secretFields.llaveSecretaCifrada = encryptSecret(llaveSecreta);
    }
    if (webhookSecret !== undefined) {
      secretFields.webhookSecretCifrado = encryptSecret(webhookSecret);
    }

    const config = await prisma.tienda_pasarela_config.upsert({
      where: { uq_pasarela_tienda_proveedor: { tiendaId, proveedor } },
      create: {
        tiendaId,
        proveedor,
        modo: modo || "test",
        llavePublica: llavePublica ?? null,
        activo: activo ?? false,
        ...secretFields,
        fechaRegistro: now,
        usuarioRegistro: usuario
      },
      update: {
        ...(modo !== undefined ? { modo } : {}),
        ...(llavePublica !== undefined ? { llavePublica } : {}),
        ...(activo !== undefined ? { activo } : {}),
        ...secretFields,
        fechaActualizacion: now,
        usuarioActualizacion: usuario
      }
    });

    return this.#toPublic(config);
  }

  /**
   * Devuelve la config pública de un proveedor (sin secretos) para el admin.
   * @param {string} tiendaId
   * @param {string} proveedor
   * @returns {Promise<object>}
   */
  async getPublic(tiendaId, proveedor) {
    const config = await prisma.tienda_pasarela_config.findUnique({
      where: { uq_pasarela_tienda_proveedor: { tiendaId, proveedor } }
    });
    if (!config) throw new NotFoundError("Configuración de pasarela");
    return this.#toPublic(config);
  }

  /**
   * Lista las configs de pasarela de una tienda (sin secretos).
   * @param {string} tiendaId
   * @returns {Promise<object[]>}
   */
  async list(tiendaId) {
    const configs = await prisma.tienda_pasarela_config.findMany({
      where: { tiendaId },
      orderBy: { proveedor: "asc" }
    });
    return configs.map((c) => this.#toPublic(c));
  }

  /**
   * Devuelve las credenciales DESCIFRADAS de un proveedor activo de la tienda.
   * Uso interno del servicio de pagos — jamás exponer el resultado al cliente.
   * @param {string} tiendaId
   * @param {string} proveedor
   * @returns {Promise<{proveedor: string, modo: string, llavePublica: string|null, secretKey: string, webhookSecret: string|null}>}
   * @throws {NotFoundError} si no hay config activa para ese proveedor/tienda.
   */
  async getCredentials(tiendaId, proveedor) {
    const config = await prisma.tienda_pasarela_config.findUnique({
      where: { uq_pasarela_tienda_proveedor: { tiendaId, proveedor } }
    });

    if (!config || !config.activo || !config.llaveSecretaCifrada) {
      throw new NotFoundError(
        "Pasarela de pago",
        `La tienda no tiene configurado y activo el proveedor ${proveedor}`
      );
    }

    return {
      proveedor: config.proveedor,
      modo: config.modo,
      llavePublica: config.llavePublica,
      secretKey: decryptSecret(config.llaveSecretaCifrada),
      webhookSecret: decryptSecret(config.webhookSecretCifrado)
    };
  }

  /**
   * Proyección pública: elimina todo campo sensible.
   * llaveSecretaConfigurada indica si hay secreto guardado, sin revelarlo.
   */
  #toPublic(config) {
    return {
      id: config.id,
      tiendaId: config.tiendaId,
      proveedor: config.proveedor,
      modo: config.modo,
      llavePublica: config.llavePublica,
      llaveSecretaConfigurada: Boolean(config.llaveSecretaCifrada),
      webhookSecretConfigurado: Boolean(config.webhookSecretCifrado),
      activo: config.activo,
      fechaActualizacion: config.fechaActualizacion
    };
  }
}

export default PasarelaConfigService;
