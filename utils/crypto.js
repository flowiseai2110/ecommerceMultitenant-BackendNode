import crypto from "node:crypto";
import config from "../config/index.js";

/**
 * Cifrado simétrico para secretos en reposo (credenciales de pasarela por tienda).
 *
 * Usamos AES-256-GCM: cifra + autentica (detecta manipulación). El formato de
 * salida es un string compacto `v1:<iv>:<authTag>:<ciphertext>` (todo base64),
 * versionado para poder rotar el esquema en el futuro sin romper lo ya guardado.
 *
 * La clave maestra sale de PAGOS_ENCRYPTION_KEY (env), que debe ser 32 bytes en
 * base64 o hex (256 bits). Generar una con:
 *   node -e "console.log(crypto.randomBytes(32).toString('base64'))"
 *
 * IMPORTANTE: si se pierde/rota la clave maestra, los secretos ya cifrados dejan
 * de poder descifrarse — habría que re-ingresar las credenciales de cada tienda.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits, recomendado para GCM
const VERSION = "v1";

/**
 * Deriva y valida la clave maestra de 32 bytes desde la config.
 * Se resuelve de forma perezosa (no al importar el módulo) para no reventar el
 * arranque de features que no usan pagos si la env var no está configurada.
 * @returns {Buffer} clave de 32 bytes
 * @throws {Error} si la clave no está definida o no mide 32 bytes
 */
function getMasterKey() {
  const raw = config.pagos?.encryptionKey;
  if (!raw) {
    throw new Error(
      "PAGOS_ENCRYPTION_KEY no está configurada — requerida para cifrar credenciales de pasarela"
    );
  }

  // Aceptar base64 o hex; validar que resulte en exactamente 32 bytes.
  let key;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }

  if (key.length !== 32) {
    throw new Error(
      "PAGOS_ENCRYPTION_KEY debe ser de 32 bytes (256 bits) en base64 o hex"
    );
  }
  return key;
}

/**
 * Cifra un texto plano. Devuelve null si la entrada es null/undefined/"".
 * @param {string|null|undefined} plaintext
 * @returns {string|null} `v1:<iv>:<authTag>:<ciphertext>` (base64) o null
 */
export function encryptSecret(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === "") {
    return null;
  }

  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(String(plaintext), "utf8"),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64")
  ].join(":");
}

/**
 * Descifra un valor producido por encryptSecret. Devuelve null si la entrada es
 * null/vacía.
 * @param {string|null|undefined} payload
 * @returns {string|null} texto plano o null
 * @throws {Error} si el formato es inválido, la versión no se reconoce, o la
 *   autenticación GCM falla (dato manipulado o clave incorrecta)
 */
export function decryptSecret(payload) {
  if (payload === null || payload === undefined || payload === "") {
    return null;
  }

  const parts = String(payload).split(":");
  if (parts.length !== 4) {
    throw new Error("Formato de secreto cifrado inválido");
  }

  const [version, ivB64, authTagB64, ciphertextB64] = parts;
  if (version !== VERSION) {
    throw new Error(`Versión de cifrado no soportada: ${version}`);
  }

  const key = getMasterKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);
  return plaintext.toString("utf8");
}

export default { encryptSecret, decryptSecret };
