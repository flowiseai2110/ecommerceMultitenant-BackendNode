import { apiResponse } from "../utils/apiResponse.js";

/**
 * Controlador genérico que maneja las peticiones HTTP
 * Delega la lógica de negocio al servicio correspondiente
 */
class GenericController {
  constructor(service, resourceName = "Registro") {
    this.service = service;
    this.resourceName = resourceName;

    // Bind de métodos para mantener el contexto
    this.findAll = this.findAll.bind(this);
    this.findById = this.findById.bind(this);
    this.create = this.create.bind(this);
    this.update = this.update.bind(this);
    this.delete = this.delete.bind(this);
  }

  /**
   * GET / - Obtiene todos los registros con paginación
   */
  async findAll(req, res, next) {
    try {
      // Usar validatedQuery si existe (Express 5), sino req.query
      const query = req.validatedQuery || req.query;
      const { data, meta } = await this.service.findAll(query);

      return apiResponse(res, {
        status: 200,
        type: "SUCCESS",
        code: `${this.resourceName.toUpperCase()}_LIST`,
        data,
        meta
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /:id - Obtiene un registro por ID
   */
  async findById(req, res, next) {
    try {
      const { id } = req.params;
      const record = await this.service.findById(id);

      return apiResponse(res, {
        status: 200,
        type: "SUCCESS",
        code: `${this.resourceName.toUpperCase()}_FOUND`,
        data: record
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST / - Crea un nuevo registro
   */
  async create(req, res, next) {
    try {
      // Pasar el usuario autenticado para auditoría
      const record = await this.service.create(req.body, req.user);

      return apiResponse(res, {
        status: 201,
        type: "SUCCESS",
        code: `${this.resourceName.toUpperCase()}_CREATED`,
        data: record
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /:id - Actualiza un registro
   */
  async update(req, res, next) {
    try {
      const { id } = req.params;
      const record = await this.service.update(id, req.body, req.user, req.tiendaId, {
        skipExistsCheck: req.skipExistsCheck
      });

      return apiResponse(res, {
        status: 200,
        type: "SUCCESS",
        code: `${this.resourceName.toUpperCase()}_UPDATED`,
        data: record
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /:id - Elimina un registro
   */
  async delete(req, res, next) {
    try {
      const { id } = req.params;
      await this.service.delete(id, req.tiendaId);

      return apiResponse(res, {
        status: 200,
        type: "SUCCESS",
        code: `${this.resourceName.toUpperCase()}_DELETED`,
        data: null
      });
    } catch (error) {
      next(error);
    }
  }
}

export default GenericController;
