import { z } from "zod";

// Claves de plantillas de mensajes WhatsApp editables por tienda.
// Deben coincidir con PlantillaWhatsappKey del admin
// (src/app/shared/pedido-whatsapp.util.ts).
export const PLANTILLAS_WHATSAPP_KEYS = [
  "estado_pendiente",
  "estado_en_proceso",
  "estado_enviado",
  "estado_enviado_recojo",
  "estado_entregado",
  "estado_cancelado",
  "pago_pendiente",
  "pago_pagado",
  "pago_rechazado",
  "pago_reembolsado"
];

// Cada clave es opcional: string vacío o ausente = usar la plantilla default.
const plantillaField = z.string().max(1000, "La plantilla no puede exceder 1000 caracteres").optional();

export const updatePlantillasWhatsappSchema = z
  .object(Object.fromEntries(PLANTILLAS_WHATSAPP_KEYS.map((key) => [key, plantillaField])))
  .strict();

export default { updatePlantillasWhatsappSchema, PLANTILLAS_WHATSAPP_KEYS };
