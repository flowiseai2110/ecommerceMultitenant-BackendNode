import { prisma } from "../config/prisma.js";
import { NotFoundError } from "../utils/errors.js";

/**
 * Servicio de zonas de envío.
 * Maneja la relación zona ↔ ubigeos en operaciones create/update.
 */
class ZonasEnvioService {
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * Lista zonas de envío con paginación y filtros.
   * Incluye conteo de ubigeos asociados.
   * Acepta tiendaId como filtro para scope multi-tenant.
   */
  async findAll(query = {}) {
    const { page = 1, limit = 50, orderBy, ...filters } = query;

    const take = Math.min(parseInt(limit) || 50, 100);
    const skip = ((parseInt(page) || 1) - 1) * take;

    const where = {};
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null || value === "") continue;
      if (value === "true") where[key] = true;
      else if (value === "false") where[key] = false;
      else where[key] = value;
    }

    let orderByClause = { nombre: "asc" };
    if (orderBy) {
      const [field, dir = "asc"] = orderBy.split(":");
      orderByClause = { [field]: dir.toLowerCase() };
    }

    const [data, total] = await Promise.all([
      prisma.zonas_envio.findMany({
        where,
        orderBy: orderByClause,
        select: {
          id: true,
          tiendaId: true,
          nombre: true,
          costoEnvio: true,
          envioGratisMinimo: true,
          diasEstimados: true,
          activo: true,
          _count: { select: { ubigeos: true } }
        },
        skip,
        take
      }),
      prisma.zonas_envio.count({ where })
    ]);

    return {
      data,
      meta: {
        total,
        page: parseInt(page) || 1,
        limit: take,
        totalPages: Math.ceil(total / take),
        hasNextPage: (parseInt(page) || 1) < Math.ceil(total / take),
        hasPrevPage: (parseInt(page) || 1) > 1
      }
    };
  }

  /**
   * Obtiene una zona de envío por ID con sus ubigeos.
   * Si se provee tiendaId, verifica pertenencia (retorna 404 si no coincide).
   */
  async findById(id, tiendaId = null) {
    const zona = await prisma.zonas_envio.findUnique({
      where: { id },
      include: { ubigeos: true }
    });

    if (!zona || (tiendaId && zona.tiendaId !== tiendaId)) {
      throw new NotFoundError("Zona de envío");
    }

    return zona;
  }

  /**
   * Crea una zona de envío con sus ubigeos asociados.
   */
  async create(data) {
    const { ubigeos = [], ...zonaData } = data;

    return await prisma.zonas_envio.create({
      data: {
        ...zonaData,
        ubigeos: ubigeos.length > 0
          ? { create: ubigeos.map(u => ({ ubigeo: u })) }
          : undefined
      },
      include: { ubigeos: true }
    });
  }

  /**
   * Actualiza una zona de envío.
   * Si se envían ubigeos, reemplaza todos los existentes.
   * Si se provee tiendaId, verifica pertenencia a la tienda.
   */
  async update(id, data, tiendaId = null) {
    const { ubigeos, ...zonaData } = data;

    const existe = await prisma.zonas_envio.findUnique({ where: { id } });

    if (!existe || (tiendaId && existe.tiendaId !== tiendaId)) {
      throw new NotFoundError("Zona de envío");
    }

    return await prisma.$transaction(async (tx) => {
      if (ubigeos !== undefined) {
        await tx.zona_envio_ubigeos.deleteMany({ where: { zonaEnvioId: id } });
        if (ubigeos.length > 0) {
          await tx.zona_envio_ubigeos.createMany({
            data: ubigeos.map(u => ({ zonaEnvioId: id, ubigeo: u }))
          });
        }
      }

      const hasZonaFields = Object.keys(zonaData).length > 0;
      if (hasZonaFields) {
        return await tx.zonas_envio.update({
          where: { id },
          data: zonaData,
          include: { ubigeos: true }
        });
      }

      return await tx.zonas_envio.findUnique({ where: { id }, include: { ubigeos: true } });
    });
  }

  /**
   * Elimina una zona de envío.
   * Si se provee tiendaId, verifica pertenencia a la tienda.
   */
  async delete(id, tiendaId = null) {
    const existe = await prisma.zonas_envio.findUnique({ where: { id } });

    if (!existe || (tiendaId && existe.tiendaId !== tiendaId)) {
      throw new NotFoundError("Zona de envío");
    }

    return await prisma.zonas_envio.delete({ where: { id } });
  }
}

export default ZonasEnvioService;
