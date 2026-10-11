import { z } from "zod";
import { MAX_NOCHES_MOSTRADOR } from "./recepcion.js";

// Recepción (docs/specs/recepcion): validación de las rutas del mostrador.

const uuid = (campo) => z.string({ required_error: `${campo} es requerido` }).uuid(`${campo} inválido`);
const tiendaId = uuid("tiendaId");
const monto = z.coerce.number().min(0, "El monto no puede ser negativo").max(99999.99);

export const FORMAS_PAGO = ["efectivo", "yape", "plin", "tarjeta"];
const formaPago = z.enum(FORMAS_PAGO, { message: "Elige cómo pagó" });

export const tiendaQuerySchema = z.object({ tiendaId });
export const idParamSchema = z.object({ id: uuid("id") });

export const habitacionCrearSchema = z.object({
  tiendaId,
  productoId: uuid("Tipo de habitación"),
  numero: z.string().trim().min(1, "Indica el número o nombre").max(20, "Hasta 20 caracteres"),
  piso: z.string().trim().max(20).nullish().transform(v => v || null),
  orden: z.coerce.number().int().min(0).max(9999).optional(),
  estado: z.enum(["activa", "mantenimiento"]).optional()
});

export const habitacionEditarSchema = habitacionCrearSchema.partial().extend({ tiendaId });

// Documento opcional (pasajero libre); si viene, con formato válido.
const huesped = z.object({
  docTipo: z.enum(["DNI", "CE", "PASAPORTE"]).optional().default("DNI"),
  docNumero: z.string().trim().max(20).optional().transform(v => v || null),
  nombre: z.string().trim().max(150).optional().transform(v => v || null)
}).superRefine((h, ctx) => {
  if (h.docNumero && h.docTipo === "DNI" && !/^\d{8}$/.test(h.docNumero)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["docNumero"], message: "El DNI tiene 8 dígitos" });
  }
  if (h.docNumero && h.docTipo !== "DNI" && !/^[A-Za-z0-9]{6,20}$/.test(h.docNumero)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["docNumero"], message: "Documento inválido" });
  }
}).optional();

// Cobro: con cobrarAhora hace falta la forma de pago.
const conCobro = (s) => s.superRefine((d, ctx) => {
  if (d.cobrarAhora && !d.formaPago) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["formaPago"], message: "Elige cómo pagó" });
});

export const entradaSchema = conCobro(z.object({
  tiendaId,
  habitacionId: uuid("Habitación"),
  modalidadId: uuid("Tarifa"),
  noches: z.coerce.number().int().min(1).max(MAX_NOCHES_MOSTRADOR).optional(),
  // Sin monto rige el precio de lista; con monto, el ajustado (queda el de lista al lado).
  monto: monto.optional(),
  cobrarAhora: z.boolean().optional().default(true),
  formaPago: formaPago.optional(),
  personas: z.coerce.number().int().min(1).max(20).optional(),
  huesped,
  forzar: z.boolean().optional().default(false)
}));

export const extenderSchema = conCobro(z.object({
  tiendaId,
  modalidadId: uuid("Tarifa"),
  monto: monto.optional(),
  cobrarAhora: z.boolean().optional().default(true),
  formaPago: formaPago.optional(),
  forzar: z.boolean().optional().default(false)
}));

export const cobrarSchema = z.object({ tiendaId, formaPago });
export const salidaSchema = z.object({ tiendaId, formaPago: formaPago.optional() });
export const cambiarSchema = z.object({ tiendaId, habitacionId: uuid("Habitación") });
export const anularSchema = z.object({ tiendaId, motivo: z.string().trim().min(3, "Indica el motivo").max(200) });

// ---------- Caja (R5) e incidencias ----------

const montoPositivo = z.coerce.number().positive("El monto debe ser mayor a 0").max(99999.99);

export const abrirCajaSchema = z.object({ tiendaId, montoInicial: monto });
export const cerrarCajaSchema = z.object({
  tiendaId,
  efectivoContado: monto,
  nota: z.string().trim().max(300).optional().transform(v => v || null)
});
export const movimientoSchema = z.object({
  tiendaId,
  tipo: z.enum(["ingreso", "egreso"]),
  monto: montoPositivo,
  motivo: z.string().trim().min(3, "Indica el motivo").max(150)
});
export const usadaSchema = z.object({ tiendaId, nota: z.string().trim().max(200).optional().transform(v => v || null) });
export const incidenciasQuerySchema = z.object({ tiendaId, pendientes: z.enum(["true", "false"]).optional().transform(v => v === "true") });

// ---------- Fase 3: llegadas web (R3.5) y consumos (R4.4) ----------

export const llegadaSchema = conCobro(z.object({
  tiendaId,
  habitacionIds: z.array(uuid("Habitación")).min(1, "Elige la habitación").max(10),
  cobrarAhora: z.boolean().optional().default(false),
  formaPago: formaPago.optional()
}));

// Un extra del catálogo, o concepto y precio escritos a mano.
export const consumoSchema = conCobro(z.object({
  tiendaId,
  extraId: uuid("Extra").optional(),
  concepto: z.string().trim().min(2, "Indica qué se vendió").max(60).optional(),
  precio: montoPositivo.optional(),
  cantidad: z.coerce.number().int().min(1).max(50).optional().default(1),
  cobrarAhora: z.boolean().optional().default(true),
  formaPago: formaPago.optional()
})).superRefine((d, ctx) => {
  if (!d.extraId && (!d.concepto || !d.precio)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["concepto"], message: "Elige un extra o escribe qué se vendió y su precio" });
  }
});
