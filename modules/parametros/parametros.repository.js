import { prisma } from "../../config/prisma.js";

/** Acceso a parametros_plataforma, sin reglas (las pone parametros.service.js). */

export const listarFilas = () => prisma.parametros_plataforma.findMany();

export function guardarFila(clave, valor, usuario, ahora = new Date()) {
  return prisma.parametros_plataforma.upsert({
    where: { clave },
    create: { clave, valor, usuarioRegistro: usuario, usuarioActualizacion: usuario, fechaActualizacion: ahora },
    update: { valor, usuarioActualizacion: usuario, fechaActualizacion: ahora }
  });
}
