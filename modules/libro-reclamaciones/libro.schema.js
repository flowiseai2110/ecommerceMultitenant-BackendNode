import { z } from "zod";

export const TIPOS_HOJA = ["reclamo", "queja"];
export const ESTADOS_HOJA = ["pendiente", "en_atencion", "respondida"];
export const TIPOS_DOCUMENTO = ["DNI", "CE", "PASAPORTE"];
export const TIPOS_BIEN = ["producto", "servicio"];
export const MEDIOS_RESPUESTA = ["email", "domicilio"];
export const SEMAFOROS = ["verde", "ambar", "rojo"];

const uuid = (campo) => z.string({ required_error: `${campo} es requerido` }).uuid(`${campo} inválido`);

const texto = (campo, min, max) => z.string({ required_error: `${campo} es requerido` })
  .trim()
  .min(min, min > 1 ? `${campo} debe tener al menos ${min} caracteres` : `${campo} es requerido`)
  .max(max, `${campo} no puede exceder ${max} caracteres`);

// "" o solo espacios cuentan como "sin texto" (null).
const textoOpcional = (max, mensaje) => z.string().trim().max(max, mensaje).nullish()
  .transform(v => v || null);

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)");

/** Formato del número de documento según su tipo. */
export function documentoValido(tipo, numero) {
  if (!numero) return false;
  if (tipo === "DNI") return /^\d{8}$/.test(numero);
  return /^[A-Za-z0-9]{6,12}$/.test(numero);
}

// ============================================
// STORE
// ============================================

export const crearHojaSchema = z.object({
  tiendaId: uuid("tiendaId"),
  tipo: z.enum(TIPOS_HOJA, { message: "Elige si es un reclamo o una queja" }),

  consumidorNombres: texto("Nombres", 1, 100),
  consumidorApellidos: texto("Apellidos", 1, 100),
  consumidorDocTipo: z.enum(TIPOS_DOCUMENTO, { message: "Tipo de documento inválido" }),
  consumidorDocNumero: z.string().trim().max(20),
  consumidorDomicilio: texto("Domicilio", 5, 300),
  consumidorTelefono: z.string().trim().regex(/^[0-9+\s-]{6,20}$/, "Teléfono inválido").nullish()
    .or(z.literal("")).transform(v => v || null),
  consumidorEmail: z.string({ required_error: "Correo es requerido" }).trim().toLowerCase()
    .email("Correo inválido").max(100),

  esMenor: z.boolean().optional().default(false),
  apoderadoNombre: textoOpcional(200, "Nombre del apoderado demasiado largo"),
  apoderadoDocTipo: z.enum(TIPOS_DOCUMENTO).nullish().transform(v => v || null),
  apoderadoDocNumero: textoOpcional(20, "Documento del apoderado inválido"),

  bienTipo: z.enum(TIPOS_BIEN, { message: "Elige producto o servicio" }),
  bienDescripcion: texto("Descripción del bien", 3, 500),
  montoReclamado: z.coerce.number().min(0, "El monto no puede ser negativo").max(99999999.99).nullish()
    .transform(v => (v === undefined ? null : v)),
  pedidoId: uuid("pedidoId").nullish().transform(v => v || null),
  numeroPedidoTexto: textoOpcional(30, "Número de pedido demasiado largo"),

  detalle: texto("Detalle", 20, 3000),
  pedidoConsumidor: texto("Pedido", 10, 1000),
  medioRespuesta: z.enum(MEDIOS_RESPUESTA).optional().default("email"),
  aceptaDeclaracion: z.literal(true, {
    errorMap: () => ({ message: "Debes aceptar la declaración para registrar la hoja" })
  }),

  // Honeypot: un campo oculto que una persona nunca llena. Se valida en la ruta.
  sitioWeb: z.string().max(500).optional()
}).superRefine((d, ctx) => {
  if (!documentoValido(d.consumidorDocTipo, d.consumidorDocNumero)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["consumidorDocNumero"],
      message: d.consumidorDocTipo === "DNI" ? "El DNI debe tener 8 dígitos" : "Documento inválido (6 a 12 letras o números)"
    });
  }
  if (d.esMenor) {
    if (!d.apoderadoNombre) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["apoderadoNombre"], message: "Ingresa el nombre del padre, madre o apoderado" });
    }
    if (!d.apoderadoDocTipo || !documentoValido(d.apoderadoDocTipo, d.apoderadoDocNumero)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["apoderadoDocNumero"], message: "Documento del apoderado inválido" });
    }
  }
});

export const tiendaQuerySchema = z.object({ tiendaId: uuid("tiendaId") });

export const tokenParamSchema = z.object({ token: z.string().min(10).max(2000) });

// ============================================
// ADMIN
// ============================================

export const idParamSchema = z.object({ id: uuid("id") });

export const listarAdminQuerySchema = z.object({
  tiendaId: uuid("tiendaId"),
  // "abiertas" = pendiente + en_atencion (vista por defecto del admin).
  estado: z.enum([...ESTADOS_HOJA, "abiertas"]).optional(),
  tipo: z.enum(TIPOS_HOJA).optional(),
  semaforo: z.enum(SEMAFOROS).optional(),
  desde: fecha.optional(),
  hasta: fecha.optional(),
  q: z.string().trim().max(100).optional().transform(v => v || undefined),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20)
});

export const exportarQuerySchema = z.object({
  tiendaId: uuid("tiendaId"),
  desde: fecha.optional(),
  hasta: fecha.optional()
});

export const cambiarEstadoSchema = z.object({
  tiendaId: uuid("tiendaId"),
  // "pendiente" lo pone el sistema y "respondida" solo se llega respondiendo.
  estado: z.literal("en_atencion", { errorMap: () => ({ message: "estado debe ser en_atencion" }) })
});

export const responderSchema = z.object({
  tiendaId: uuid("tiendaId"),
  respuesta: texto("La respuesta", 20, 5000),
  accionAdoptada: textoOpcional(2000, "La acción adoptada no puede exceder 2000 caracteres"),
  // Solo cuando el consumidor pidió la respuesta en su domicilio.
  fechaEntregaCarta: fecha.optional()
});

// La vista previa se pide mientras se escribe: no exige el mínimo de caracteres.
export const vistaPreviaSchema = z.object({
  tiendaId: uuid("tiendaId"),
  respuesta: z.string().max(5000).optional().default(""),
  accionAdoptada: textoOpcional(2000, "La acción adoptada no puede exceder 2000 caracteres")
});
