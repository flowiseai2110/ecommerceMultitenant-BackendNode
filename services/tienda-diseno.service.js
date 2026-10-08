import { prisma } from "../config/prisma.js";
import { ValidationError } from "../utils/errors.js";
import { prefijoWidgets, urlsDeWidgetsAjenas } from "../modules/campanas/campanas.schema.js";
import { migrarEstructura } from "../modules/diseno/migrar.js";
import { publicBaseUrl } from "./storage.service.js";

// Personalización visual del storefront que el dueño edita desde el admin
// (página "Diseño"). Cada clave vive como una fila en tienda_configuraciones
// (categoria "diseno", valor JsonB), así agregar una sección nueva no
// requiere migración de esquema.
export const DISENO_CATEGORIA = "diseno";
// "campanas" es privada: el storefront recibe solo la campaña vigente ya
// resuelta (ver tiendas.store.routes.js), nunca las futuras.
// "tema", "estructura" y "estructura_anterior": docs/specs/estructura-tienda.
// El storefront las recibe resueltas en `tema`; "estructura_anterior" (para
// "Deshacer") solo la escribe el servicio de diseño, nunca un PUT.
// "traducciones": textos del diseño en inglés (docs/specs/hospedaje-completo C3); la
// escribe el servicio de traducciones, nunca un PUT de diseño.
export const DISENO_CLAVES = ["anuncio", "hero", "campanas", "widgets", "tema", "estructura", "estructura_anterior", "traducciones"];

export async function getDiseno(tiendaId) {
  const rows = await prisma.tienda_configuraciones.findMany({
    where: { tiendaId, categoria: DISENO_CATEGORIA, clave: { in: DISENO_CLAVES } },
    select: { clave: true, valor: true }
  });

  const diseno = {};
  for (const row of rows) {
    diseno[row.clave] = row.valor;
  }
  return diseno;
}

export async function saveDiseno(tiendaId, data, user) {
  const usuario = user?.email || user?.id || "system";
  const claves = DISENO_CLAVES.filter((clave) => data[clave] !== undefined);

  // Imágenes de widgets solo desde la carpeta widgets/ de la propia tienda
  // (R4.5): evita hotlinking, rastreo de terceros y contenido no moderado.
  const ajenas = urlsDeWidgetsAjenas(data, prefijoWidgets(publicBaseUrl(), tiendaId));
  if (ajenas.length > 0) {
    // El mensaje va también en details: el error middleware responde data = details.
    const message = "Las imágenes de los widgets deben subirse desde el panel de la tienda";
    throw new ValidationError(message, { message });
  }

  await prisma.$transaction(claves.map((clave) => upsertClave(tiendaId, clave, data[clave], usuario)));

  return getDiseno(tiendaId);
}

/** Upsert de una clave de diseño (sin ejecutar: para usar en $transaction). */
export function upsertClave(tiendaId, clave, valor, usuario) {
  return prisma.tienda_configuraciones.upsert({
    where: { uq_tienda_clave: { tiendaId, clave } },
    create: {
      tiendaId,
      clave,
      valor,
      categoria: DISENO_CATEGORIA,
      usuarioRegistro: usuario
    },
    update: {
      valor,
      fechaActualizacion: new Date(),
      usuarioActualizacion: usuario
    }
  });
}

/** Borra claves de diseño (sin ejecutar: para usar en $transaction). */
export function borrarClaves(tiendaId, claves) {
  return prisma.tienda_configuraciones.deleteMany({
    where: { tiendaId, categoria: DISENO_CATEGORIA, clave: { in: claves } }
  });
}

/**
 * Diseño para el admin: la estructura migrada al formato actual (R1.4) y,
 * en vez de la estructura anterior, solo si se puede deshacer (R3.6).
 */
export function disenoAdmin({ estructura_anterior, ...diseno }) {
  const estructura = diseno.estructura ? migrarEstructura(diseno.estructura) : null;
  return { ...diseno, estructura, puedeDeshacer: Boolean(estructura_anterior) };
}
