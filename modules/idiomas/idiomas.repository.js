import { prisma } from "../../config/prisma.js";

/** Acceso a la tabla `idiomas` (docs/specs/idiomas D1). Sin reglas de negocio. */

const ORDEN = [{ orden: "asc" }, { codigo: "asc" }];

export const listarIdiomas = (where = {}) => prisma.idiomas.findMany({ where, orderBy: ORDEN });

export const buscarIdioma = (codigo) => prisma.idiomas.findUnique({ where: { codigo } });

export const crearFilaIdioma = (data) => prisma.idiomas.create({ data });

export const actualizarFilaIdioma = (codigo, data) => prisma.idiomas.update({ where: { codigo }, data });
