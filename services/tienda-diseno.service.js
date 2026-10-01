import { prisma } from "../config/prisma.js";
import config from "../config/index.js";
import { ValidationError } from "../utils/errors.js";
import { prefijoWidgets, urlsDeWidgetsAjenas } from "../modules/campanas/campanas.schema.js";

// Personalización visual del storefront que el dueño edita desde el admin
// (página "Diseño"). Cada clave vive como una fila en tienda_configuraciones
// (categoria "diseno", valor JsonB), así agregar una sección nueva no
// requiere migración de esquema.
export const DISENO_CATEGORIA = "diseno";
// "campanas" es privada: el storefront recibe solo la campaña vigente ya
// resuelta (ver tiendas.store.routes.js), nunca las futuras.
export const DISENO_CLAVES = ["anuncio", "hero", "campanas", "widgets"];

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
  const ajenas = urlsDeWidgetsAjenas(data, prefijoWidgets(config.supabaseUrl, tiendaId));
  if (ajenas.length > 0) {
    throw new ValidationError("Las imágenes de los widgets deben subirse desde el panel de la tienda");
  }

  await prisma.$transaction(
    claves.map((clave) =>
      prisma.tienda_configuraciones.upsert({
        where: { uq_tienda_clave: { tiendaId, clave } },
        create: {
          tiendaId,
          clave,
          valor: data[clave],
          categoria: DISENO_CATEGORIA,
          usuarioRegistro: usuario
        },
        update: {
          valor: data[clave],
          fechaActualizacion: new Date(),
          usuarioActualizacion: usuario
        }
      })
    )
  );

  return getDiseno(tiendaId);
}
