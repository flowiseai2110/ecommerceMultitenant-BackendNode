import { z } from "zod";
import { TOPES_PRIVADO } from "./transmisiones.reglas.js";

/**
 * Schemas Zod de la transmisión de eventos (docs/specs/transmision-eventos).
 * El schema ES el contrato de entrada (docs/ARQUITECTURA.md).
 */

export const PLANES = ["basico", "privado", "premium"];
// Fase 2: Básico (YouTube) y Privado (Cloudflare). Premium llega en la Fase 5.
export const PLANES_DISPONIBLES = ["basico", "privado"];

const uuid = (campo) => z.string({ required_error: `${campo} es requerido` }).uuid(`${campo} inválido`);

const texto = (campo, min, max) => z.string({ required_error: `${campo} es requerido` })
  .trim()
  .min(min, min > 1 ? `${campo} debe tener al menos ${min} caracteres` : `${campo} es requerido`)
  .max(max, `${campo} no puede exceder ${max} caracteres`);

const email = z.string().trim().max(150).email("Correo inválido").nullish().or(z.literal("")).transform(v => v || null);

// Duración cuando la función no tiene hora de fin (R1.2): de 15 min a 12 h.
const duracionMin = z.coerce.number().int("La duración debe ser en minutos")
  .min(15, "La transmisión debe durar al menos 15 minutos")
  .max(720, "La transmisión no puede durar más de 12 horas");

// Teléfono opcional del invitado: solo se usa para el enlace de WhatsApp.
const telefono = z.string().trim()
  .regex(/^\+?[\d\s-]{6,20}$/, "Teléfono inválido (solo números, de 6 a 20)")
  .nullish().or(z.literal("")).transform(v => (v ? v.replace(/[\s-]/g, "") : null));

export const tiendaQuerySchema = z.object({ tiendaId: uuid("tiendaId") });
export const funcionParamSchema = z.object({ funcionId: uuid("funcionId") });
export const idParamSchema = z.object({ id: uuid("id") });
export const invitacionParamSchema = z.object({ id: uuid("id"), invitacionId: uuid("invitacionId") });
export const tokenParamSchema = z.object({ token: z.string().min(10).max(2000) });

export const activarSchema = z.object({
  tiendaId: uuid("tiendaId"),
  plan: z.enum(PLANES, { message: "Elige un plan" }).refine(p => PLANES_DISPONIBLES.includes(p), {
    message: "Ese plan estará disponible pronto"
  }),
  // Privado: tope de invitados (25 | 50 | 100 | 200), que define cuánto descuenta cada hora.
  maxInvitados: z.coerce.number().int().nullish().transform(v => v ?? null),
  youtubeUrl: z.string().trim().max(500).nullish().transform(v => v || null),
  duracionMin: duracionMin.nullish().transform(v => v ?? null),
  anfitrionNombre: texto("El nombre del anfitrión", 2, 150),
  anfitrionEmail: email,
  consentimiento: z.literal(true, {
    errorMap: () => ({ message: "Confirma que el anfitrión autorizó la transmisión" })
  })
}).superRefine((d, ctx) => {
  if (d.plan === "basico" && !d.youtubeUrl) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["youtubeUrl"], message: "Pega el enlace del live de YouTube" });
  }
  if (d.plan !== "basico" && !TOPES_PRIVADO.includes(d.maxInvitados)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["maxInvitados"], message: `Elige para cuántos invitados: ${TOPES_PRIVADO.join(", ")}` });
  }
});

// Ausente = no tocar.
export const editarSchema = z.object({
  tiendaId: uuid("tiendaId"),
  youtubeUrl: z.string().trim().min(1, "Pega el enlace del live de YouTube").max(500).optional(),
  duracionMin: duracionMin.optional(),
  anfitrionNombre: texto("El nombre del anfitrión", 2, 150).optional(),
  anfitrionEmail: email.optional()
});

export const invitadosSchema = z.object({
  tiendaId: uuid("tiendaId"),
  invitados: z.array(z.object({
    nombre: texto("El nombre del invitado", 1, 100),
    telefono
  })).min(1, "Agrega al menos un invitado").max(300, "Puedes agregar hasta 300 invitados a la vez")
});

// Latido de la página del invitado (R4.3): id de la pestaña y si reclama la sesión.
export const latidoSchema = z.object({
  sesionId: z.string().regex(/^[A-Za-z0-9_-]{8,40}$/, "Sesión inválida"),
  reclamar: z.boolean().optional().default(false)
});

// App Transmitir (R11.1): código del QR.
export const vincularSchema = z.object({
  codigo: z.string().trim().min(20, "Código inválido").max(100, "Código inválido")
});
