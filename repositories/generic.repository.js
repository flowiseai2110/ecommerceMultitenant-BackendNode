import { NotFoundError } from "../utils/errors.js";
import config from "../config/index.js";

class GenericRepository {
  constructor(model, modelName = "Registro") {
    this.model = model;
    this.modelName = modelName;
  }

  /**
   * Obtiene todos los registros con paginación opcional
   * @param {Object} options - Opciones de consulta
   * @param {number} options.page - Número de página (default: 1)
   * @param {number} options.limit - Registros por página (default: 10)
   * @param {Object} options.where - Filtros de búsqueda
   * @param {Object} options.orderBy - Ordenamiento
   * @param {Object} options.include - Relaciones a incluir
   * @returns {Promise<{data: Array, meta: Object}>}
   */
  async findAll(options = {}) {
    const {
      page = config.pagination.defaultPage,
      limit = config.pagination.defaultLimit,
      where = {},
      orderBy = { id: "desc" },
      include = undefined
    } = options;

    // Limitar el máximo de registros por página
    const take = Math.min(limit, config.pagination.maxLimit);
    const skip = (page - 1) * take;

    const [data, total] = await Promise.all([
      this.model.findMany({
        where,
        orderBy,
        include,
        skip,
        take
      }),
      this.model.count({ where })
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit: take,
        totalPages: Math.ceil(total / take),
        hasNextPage: page < Math.ceil(total / take),
        hasPrevPage: page > 1
      }
    };
  }

  /**
   * Obtiene un registro por ID
   * @param {number} id - ID del registro
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object>}
   */
  async findById(id, options = {}) {
    const { include = undefined } = options;

    const record = await this.model.findUnique({
      where: { id },
      include
    });

    if (!record) {
      throw new NotFoundError(this.modelName);
    }

    return record;
  }

  /**
   * Busca un registro único por criterios
   * @param {Object} where - Criterios de búsqueda
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object|null>}
   */
  async findOne(where, options = {}) {
    const { include = undefined } = options;

    return await this.model.findFirst({
      where,
      include
    });
  }

  /**
   * Crea un nuevo registro
   * @param {Object} data - Datos del registro
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object>}
   */
  async create(data, options = {}) {
    const { include = undefined } = options;

    return await this.model.create({
      data,
      include
    });
  }

  /**
   * Crea múltiples registros
   * @param {Array<Object>} data - Array de datos
   * @returns {Promise<{count: number}>}
   */
  async createMany(data) {
    return await this.model.createMany({
      data,
      skipDuplicates: true
    });
  }

  /**
   * Actualiza un registro por ID
   * @param {number} id - ID del registro
   * @param {Object} data - Datos a actualizar
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object>}
   */
  async update(id, data, options = {}) {
    const { include = undefined } = options;

    // Verificar que existe
    await this.findById(id);

    return await this.model.update({
      where: { id },
      data,
      include
    });
  }

  /**
   * Actualiza múltiples registros
   * @param {Object} where - Criterios de búsqueda
   * @param {Object} data - Datos a actualizar
   * @returns {Promise<{count: number}>}
   */
  async updateMany(where, data) {
    return await this.model.updateMany({
      where,
      data
    });
  }

  /**
   * Elimina un registro por ID
   * @param {number} id - ID del registro
   * @returns {Promise<Object>}
   */
  async delete(id) {
    // Verificar que existe
    await this.findById(id);

    return await this.model.delete({
      where: { id }
    });
  }

  /**
   * Elimina múltiples registros
   * @param {Object} where - Criterios de búsqueda
   * @returns {Promise<{count: number}>}
   */
  async deleteMany(where) {
    return await this.model.deleteMany({
      where
    });
  }

  /**
   * Cuenta registros
   * @param {Object} where - Criterios de búsqueda
   * @returns {Promise<number>}
   */
  async count(where = {}) {
    return await this.model.count({ where });
  }

  /**
   * Verifica si existe un registro
   * @param {Object} where - Criterios de búsqueda
   * @returns {Promise<boolean>}
   */
  async exists(where) {
    const count = await this.model.count({ where });
    return count > 0;
  }

  /**
   * Upsert - Crea o actualiza un registro
   * @param {Object} options - Opciones de upsert
   * @returns {Promise<Object>}
   */
  async upsert({ where, create, update }) {
    return await this.model.upsert({
      where,
      create,
      update
    });
  }
}

export default GenericRepository;
