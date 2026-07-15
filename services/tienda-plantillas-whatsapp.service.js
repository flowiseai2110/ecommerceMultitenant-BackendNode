import { prisma } from "../config/prisma.js";
import { PLANTILLAS_WHATSAPP_KEYS } from "../validators/tienda-plantillas-whatsapp.validator.js";

// Plantillas de mensajes WhatsApp que el dueño personaliza desde el admin
// (página "Mensajes"). Se guardan como una sola fila en tienda_configuraciones
// (clave "plantillas_whatsapp", valor JsonB) con SOLO las claves que la tienda
// cambió; las ausentes usan los defaults hardcodeados en el frontend admin.
const CATEGORIA = "whatsapp";
const CLAVE = "plantillas_whatsapp";

export async function getPlantillasWhatsapp(tiendaId) {
  const row = await prisma.tienda_configuraciones.findUnique({
    where: { uq_tienda_clave: { tiendaId, clave: CLAVE } },
    select: { valor: true }
  });
  return row?.valor ?? {};
}

export async function savePlantillasWhatsapp(tiendaId, data, user) {
  const usuario = user?.email || user?.id || "system";

  // Solo se persisten las plantillas con contenido: vacío = volver al default
  const overrides = {};
  for (const key of PLANTILLAS_WHATSAPP_KEYS) {
    const valor = typeof data[key] === "string" ? data[key].trim() : "";
    if (valor) overrides[key] = valor;
  }

  await prisma.tienda_configuraciones.upsert({
    where: { uq_tienda_clave: { tiendaId, clave: CLAVE } },
    create: {
      tiendaId,
      clave: CLAVE,
      valor: overrides,
      categoria: CATEGORIA,
      usuarioRegistro: usuario
    },
    update: {
      valor: overrides,
      fechaActualizacion: new Date(),
      usuarioActualizacion: usuario
    }
  });

  return overrides;
}
