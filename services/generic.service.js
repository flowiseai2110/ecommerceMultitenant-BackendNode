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
    // Include por defecto para relaciones (findById)
    this.defaultInclude = options.include || undefined;
    // Campos en los que buscar con ?search=texto
    this.searchFields = options.searchFields || ["nombre"];
    // Presets de include para ?include=nombrePreset
    this.includePresets = options.includePresets || {};
    // select para listados (findAll) — excluye campos innecesarios directo en DB
    // Si se proporciona listSelect, tiene prioridad sobre excludeFieldsInList
    this.listSelect = options.listSelect || null;
    // Campos a excluir en listados (fallback legacy — se ignora si listSelect está definido)
    this.excludeFieldsInList = options.excludeFieldsInList || [];
    // Orden por defecto cuando no se recibe ?orderBy en la query
    this.defaultOrderBy = options.defaultOrderBy || null;
    // Whitelist de campos permitidos para sparse fieldsets (?fields=a,b,c)
    // Si no se define, el parámetro "fields" se ignora (deny by default)
    this.allowedFields = options.allowedFields || null;
    // Read-policy por audiencia (ver docs/ARQUITECTURA.md):
    // - requireTiendaId: findAll exige un tiendaId en los filtros (cierra el
    //   listado cross-tenant). No sustituye a requireTiendaAccess en el admin
    //   (que además valida membresía); es la garantía de scope en la capa de negocio.
    this.requireTiendaId = options.requireTiendaId === true;
    // - allowedFilters: whitelist de campos filtrables (además de tiendaId y search).
    //   Si se define, cualquier otro filtro de la query se ignora (evita que el
    //   cliente filtre/enumere por columnas sensibles como precioCosto).
    this.allowedFilters = options.allowedFilters || null;
    // - allowedOrderBy: whitelist de campos ordenables. Si se define y el cliente
    //   pide otro, se cae al defaultOrderBy.
    this.allowedOrderBy = options.allowedOrderBy || null;
    // - tenantRelation: para modelos hijos SIN columna tiendaId propia (ej.
    //   producto_variantes, producto_imagenes), nombre de la relación al padre
    //   que sí la tiene. El filtro tiendaId se traduce a { <relación>: { tiendaId } }.
    this.tenantRelation = options.tenantRelation || null;
  }

  /**
   * Obtiene todos los registros con paginación
   * @param {Object} query - Parámetros de consulta (page, limit, filters)
   * @returns {Promise<{data: Array, meta: Object}>}
   */
  async findAll(query = {}) {
    const { page, limit, orderBy, include, fields, ...filters } = query;

    // Read-policy: el listado debe estar scopeado a una tienda. Cierra la fuga
    // cross-tenant (un cliente que omite tiendaId ya no obtiene todas las tiendas).
    if (this.requireTiendaId && !filters.tiendaId) {
      throw new ValidationError("Se requiere tiendaId para listar este recurso");
    }

    // Resolver include: si hay un preset configurado, usarlo; sino el default
    const resolvedInclude = (include && this.includePresets[include])
      ? this.includePresets[include]
      : this.defaultInclude;

    // Sparse fieldsets (?fields=a,b,c): solo aplica si el módulo definió un
    // whitelist (allowedFields). Tiene prioridad sobre listSelect porque es
    // una elección explícita del cliente para esa request puntual.
    // Si no hay listSelect definido, usarlo como select (más eficiente que stripFields)
    // select e include son mutuamente excluyentes — listSelect tiene prioridad
    const resolvedSelect = this.buildSparseSelect(fields) || this.listSelect || null;

    const queryOptions = {
      page: parseInt(page) || undefined,
      limit: parseInt(limit) || undefined,
      orderBy: this.parseOrderBy(orderBy) || this.defaultOrderBy || undefined,
      where: this.buildWhereClause(filters),
      ...(resolvedSelect ? { select: resolvedSelect } : { include: resolvedInclude })
    };

    const result = await this.repository.findAll(queryOptions);

    // Fallback: stripFields en memoria solo si no hay listSelect (compatibilidad)
    if (!resolvedSelect && this.excludeFieldsInList.length > 0) {
      result.data = result.data.map(record => this.stripFields(record, this.excludeFieldsInList));
    }

    return result;
  }

  /**
   * Construye un objeto "select" de Prisma a partir de ?fields=a,b,c,
   * filtrando contra el whitelist allowedFields del módulo.
   * @param {string} fields - Lista de campos separados por coma
   * @returns {Object|null}
   */
  buildSparseSelect(fields) {
    if (!fields || !this.allowedFields) return null;

    const requested = String(fields).split(",").map(f => f.trim()).filter(Boolean);
    const allowed = requested.filter(f => this.allowedFields.includes(f));

    if (allowed.length === 0) return null;

    const select = { id: true };
    for (const field of allowed) {
      select[field] = true;
    }
    return select;
  }

  /**
   * Elimina campos de un objeto y sus relaciones anidadas (arrays)
   * @param {Object} obj - Objeto a limpiar
   * @param {string[]} fields - Campos a eliminar
   * @returns {Object}
   */
  stripFields(obj, fields) {
    const cleaned = { ...obj };
    for (const field of fields) {
      delete cleaned[field];
    }
    // Limpiar también en relaciones anidadas (arrays de objetos)
    for (const key of Object.keys(cleaned)) {
      if (Array.isArray(cleaned[key]) && cleaned[key].length > 0 && typeof cleaned[key][0] === "object") {
        cleaned[key] = cleaned[key].map(item => this.stripFields(item, fields));
      }
    }
    return cleaned;
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
   * @param {string|null} tiendaId - Scope multi-tenant opcional
   * @param {Object} options - Opciones adicionales (ej. skipExistsCheck)
   * @returns {Promise<Object>}
   */
  async update(id, data, user = null, tiendaId = null, options = {}) {
    if (this.enableAudit) {
      data = this.addUpdateAuditFields(data, user);
    }

    return await this.repository.update(id, data, { tiendaId, ...options });
  }

  /**
   * Elimina un registro por ID
   * @param {number|string} id - ID del registro
   * @param {string|null} tiendaId - Scope multi-tenant opcional
   * @returns {Promise<Object>}
   */
  async delete(id, tiendaId = null) {
    return await this.repository.delete(id, tiendaId);
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

    // Read-policy: si hay whitelist de orden, un campo no permitido se ignora
    // (cae al defaultOrderBy). Evita ordenar por columnas no indexadas/sensibles.
    if (this.allowedOrderBy && !this.allowedOrderBy.includes(field)) {
      return undefined;
    }

    return { [field]: direction.toLowerCase() };
  }

  /**
   * Decide si un campo de filtro está permitido por la read-policy.
   * tiendaId y search siempre se permiten (scope y búsqueda general). Si no hay
   * allowedFilters definido, se permite todo (comportamiento legacy).
   * @param {string} field - Campo destino (ya sin prefijos like_/min_/max_).
   * @returns {boolean}
   */
  #isFilterAllowed(field) {
    if (!this.allowedFilters) return true;
    if (field === "tiendaId") return true;
    return this.allowedFilters.includes(field);
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

      // Scope de tienda en modelos hijos: tiendaId → filtro por relación padre
      if (key === "tiendaId" && this.tenantRelation) {
        where[this.tenantRelation] = { tiendaId: parsedValue };
        continue;
      }

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
        if (!this.#isFilterAllowed(field)) continue;
        where[field] = { contains: value, mode: "insensitive" };
      }
      // Soporte para rango con prefijos "min_" y "max_"
      else if (key.startsWith("min_")) {
        const field = key.replace("min_", "");
        if (!this.#isFilterAllowed(field)) continue;
        where[field] = { ...where[field], gte: parsedValue };
      }
      else if (key.startsWith("max_")) {
        const field = key.replace("max_", "");
        if (!this.#isFilterAllowed(field)) continue;
        where[field] = { ...where[field], lte: parsedValue };
      }
      // Búsqueda exacta por defecto
      else {
        if (!this.#isFilterAllowed(key)) continue;
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
