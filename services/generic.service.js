import { ValidationError } from "../utils/errors.js";

/**
 * Servicio genérico que encapsula la lógica de negocio
 * Actúa como intermediario entre el controlador y el repositorio
 * Soporta auditoría automática de registros
 */
class GenericService {
  constructor(repository, options = {}) {
    this.repository = repository;
    // Habilitar auditoría por defecto
    this.enableAudit = options.enableAudit !== false;
    // Include por defecto para relaciones
    this.defaultInclude = options.include || undefined;
    // Campos en los que buscar con ?search=texto
    this.searchFields = options.searchFields || ["nombre"];
  }

  /**
   * Obtiene todos los registros con paginación
   * @param {Object} query - Parámetros de consulta (page, limit, filters)
   * @returns {Promise<{data: Array, meta: Object}>}
   */
  async findAll(query = {}) {
    const { page, limit, orderBy, ...filters } = query;

    const options = {
      page: parseInt(page) || undefined,
      limit: parseInt(limit) || undefined,
      orderBy: this.parseOrderBy(orderBy),
      where: this.buildWhereClause(filters),
      include: this.defaultInclude
    };

    return await this.repository.findAll(options);
  }

  /**
   * Obtiene un registro por ID
   * @param {number|string} id - ID del registro
   * @returns {Promise<Object>}
   */
  async findById(id) {
    return await this.repository.findById(id, { include: this.defaultInclude });
  }

  /**
   * Busca un registro por criterios
   * @param {Object} criteria - Criterios de búsqueda
   * @returns {Promise<Object|null>}
   */
  async findOne(criteria) {
    return await this.repository.findOne(criteria);
  }

  /**
   * Crea un nuevo registro con auditoría automática
   * @param {Object} data - Datos validados del registro
   * @param {Object} user - Usuario autenticado (req.user)
   * @returns {Promise<Object>}
   */
  async create(data, user = null) {
    // Agregar campos de auditoría si está habilitado
    if (this.enableAudit) {
      data = this.addCreateAuditFields(data, user);
    }

    return await this.repository.create(data);
  }

  /**
   * Crea múltiples registros con auditoría
   * @param {Array<Object>} dataArray - Array de datos validados
   * @param {Object} user - Usuario autenticado
   * @returns {Promise<{count: number}>}
   */
  async createMany(dataArray, user = null) {
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
      throw new ValidationError("Se requiere un array de datos no vacío");
    }

    // Agregar campos de auditoría a cada registro
    if (this.enableAudit) {
      dataArray = dataArray.map(data => this.addCreateAuditFields(data, user));
    }

    return await this.repository.createMany(dataArray);
  }

  /**
   * Actualiza un registro por ID con auditoría automática
   * @param {number|string} id - ID del registro
   * @param {Object} data - Datos validados a actualizar
   * @param {Object} user - Usuario autenticado (req.user)
   * @returns {Promise<Object>}
   */
  async update(id, data, user = null) {
     
    // Agregar campos de auditoría de actualización
    if (this.enableAudit) {
      data = this.addUpdateAuditFields(data, user);
    }

    return await this.repository.update(id, data);
  }

  /**
   * Elimina un registro por ID
   * @param {number|string} id - ID del registro
   * @returns {Promise<Object>}
   */
  async delete(id) {
    
    return await this.repository.delete(id);
  }

  /**
   * Cuenta registros según criterios
   * @param {Object} criteria - Criterios de búsqueda
   * @returns {Promise<number>}
   */
  async count(criteria = {}) {
    return await this.repository.count(criteria);
  }

  /**
   * Verifica si existe un registro
   * @param {Object} criteria - Criterios de búsqueda
   * @returns {Promise<boolean>}
   */
  async exists(criteria) {
    return await this.repository.exists(criteria);
  }

  /**
   * Agrega campos de auditoría para creación
   * @param {Object} data - Datos del registro
   * @param {Object} user - Usuario autenticado
   * @returns {Object}
   */
  addCreateAuditFields(data, user) {
    return {
      ...data,
      fechaRegistro: new Date(),
      usuarioRegistro: user?.email || user?.id || "system"
    };
  }

  /**
   * Agrega campos de auditoría para actualización
   * @param {Object} data - Datos del registro
   * @param {Object} user - Usuario autenticado
   * @returns {Object}
   */
  addUpdateAuditFields(data, user) {
    return {
      ...data,
      fechaActualizacion: new Date(),
      usuarioActualizacion: user?.email || user?.id || "system"
    };
  }
 

  /**
   * Parsea el parámetro orderBy
   * @param {string} orderBy - Formato: "field:asc" o "field:desc"
   * @returns {Object|undefined}
   */
  parseOrderBy(orderBy) {
    if (!orderBy) return undefined;

    const [field, direction = "asc"] = orderBy.split(":");
    const validDirections = ["asc", "desc"];

    if (!validDirections.includes(direction.toLowerCase())) {
      return undefined;
    }

    return { [field]: direction.toLowerCase() };
  }

  /**
   * Construye la cláusula WHERE a partir de filtros
   * @param {Object} filters - Filtros de búsqueda
   * @returns {Object}
   */
  buildWhereClause(filters) {
    const where = {};

    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null || value === "") {
        continue;
      }

      // Convertir tipos de query params (siempre llegan como string)
      const parsedValue = this.parseQueryValue(value);

      // Soporte para búsqueda general con "search"
      // Busca en los campos configurados en searchFields
      if (key === "search") {
        where.OR = this.searchFields.map(field => ({
          [field]: { contains: value, mode: "insensitive" }
        }));
      }
      // Soporte para búsqueda parcial con prefijo "like_"
      else if (key.startsWith("like_")) {
        const field = key.replace("like_", "");
        where[field] = { contains: value, mode: "insensitive" };
      }
      // Soporte para rango con prefijos "min_" y "max_"
      else if (key.startsWith("min_")) {
        const field = key.replace("min_", "");
        where[field] = { ...where[field], gte: parsedValue };
      }
      else if (key.startsWith("max_")) {
        const field = key.replace("max_", "");
        where[field] = { ...where[field], lte: parsedValue };
      }
      // Búsqueda exacta por defecto
      else {
        where[key] = parsedValue;
      }
    }

    return where;
  }

  /**
   * Convierte valores de query params a sus tipos correctos
   * Los query params siempre llegan como string, pero Prisma necesita tipos reales
   * @param {string} value - Valor del query param
   * @returns {*} Valor convertido
   */
  parseQueryValue(value) {
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === "null") return null;
    return value;
  }
}

export default GenericService;
