import { prisma } from "../../config/prisma.js";
import { listaAdmin, prepararLista, vigentesPublicos } from "./comunicados.logic.js";

// Una sola fila por tienda en tienda_configuraciones (sin DDL), con la lista
// completa en JsonB. La categoría propia evita que getDiseno la levante.
export const CATEGORIA = "comunicacion";
export const CLAVE = "comunicados";

export async function leerLista(tiendaId) {
  const row = await prisma.tienda_configuraciones.findUnique({
    where: { uq_tienda_clave: { tiendaId, clave: CLAVE } },
    select: { valor: true }
  });
  return Array.isArray(row?.valor) ? row.valor : [];
}

export async function guardarLista(tiendaId, lista, usuario) {
  await prisma.tienda_configuraciones.upsert({
    where: { uq_tienda_clave: { tiendaId, clave: CLAVE } },
    create: { tiendaId, clave: CLAVE, valor: lista, categoria: CATEGORIA, usuarioRegistro: usuario },
    update: { valor: lista, fechaActualizacion: new Date(), usuarioActualizacion: usuario }
  });
}

export async function getComunicadosAdmin(tiendaId, ahora = new Date()) {
  return listaAdmin(await leerLista(tiendaId), ahora);
}

export async function saveComunicados(tiendaId, nueva, user, ahora = new Date()) {
  const usuario = user?.email || user?.id || "system";
  const lista = prepararLista(nueva, await leerLista(tiendaId), ahora, usuario);
  await guardarLista(tiendaId, lista, usuario);
  return listaAdmin(lista, ahora);
}

/** Para GET /store/tiendas?slug=: solo los vigentes, ya ordenados. */
export async function getComunicadosPublicos(tiendaId, ahora = new Date()) {
  return vigentesPublicos(await leerLista(tiendaId), ahora);
}
