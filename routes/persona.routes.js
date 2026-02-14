import { Router } from "express";
import GenericController from "../controllers/generic.controller.js";
import GenericService from "../services/generic.service.js";
import GenericRepository from "../repositories/generic.repository.js";
import { prisma } from "../config/prisma.js";
import { validate } from "../middlewares/validation.middleware.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
  createPersonaSchema,
  updatePersonaSchema,
  idParamSchema,
  paginationSchema
} from "../validators/persona.validator.js";

// Crear instancias de las capas
const personaRepository = new GenericRepository(prisma.persona, "Persona");
const personaService = new GenericService(personaRepository, { enableAudit: true });
const personaController = new GenericController(personaService, "Persona");

const router = Router();

/**
 * @swagger
 * /personas:
 *   get:
 *     summary: Obtiene todas las personas con paginación
 *     tags: [Personas]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Registros por página
 *       - in: query
 *         name: orderBy
 *         schema:
 *           type: string
 *           example: "id:desc"
 *         description: "Ordenamiento (campo:asc o campo:desc)"
 *     responses:
 *       200:
 *         description: Lista de personas paginada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 type:
 *                   type: string
 *                   example: SUCCESS
 *                 code:
 *                   type: string
 *                   example: PERSONA_LIST
 *                 data:
 *                   type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Persona'
 *                     meta:
 *                       $ref: '#/components/schemas/PaginationMeta'
 */
router.get(
  "/",
  validate({ query: paginationSchema }),
  personaController.findAll
);

/**
 * @swagger
 * /personas/{id}:
 *   get:
 *     summary: Obtiene una persona por ID
 *     tags: [Personas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la persona
 *     responses:
 *       200:
 *         description: Persona encontrada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 type:
 *                   type: string
 *                   example: SUCCESS
 *                 code:
 *                   type: string
 *                   example: PERSONA_FOUND
 *                 data:
 *                   $ref: '#/components/schemas/Persona'
 *       404:
 *         description: Persona no encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 */
router.get(
  "/:id",
  validate({ params: idParamSchema }),
  personaController.findById
);

/**
 * @swagger
 * /personas:
 *   post:
 *     summary: Crea una nueva persona
 *     tags: [Personas]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePersona'
 *     responses:
 *       201:
 *         description: Persona creada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 201
 *                 type:
 *                   type: string
 *                   example: SUCCESS
 *                 code:
 *                   type: string
 *                   example: PERSONA_CREATED
 *                 data:
 *                   $ref: '#/components/schemas/Persona'
 *       400:
 *         description: Error de validación
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: No autorizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 */
router.post(
  "/",
  authMiddleware,
  validate({ body: createPersonaSchema }),
  personaController.create
);

/**
 * @swagger
 * /personas/{id}:
 *   put:
 *     summary: Actualiza una persona existente
 *     tags: [Personas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la persona
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdatePersona'
 *     responses:
 *       200:
 *         description: Persona actualizada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 type:
 *                   type: string
 *                   example: SUCCESS
 *                 code:
 *                   type: string
 *                   example: PERSONA_UPDATED
 *                 data:
 *                   $ref: '#/components/schemas/Persona'
 *       400:
 *         description: Error de validación
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: No autorizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       404:
 *         description: Persona no encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 */
router.put(
  "/:id",
  authMiddleware,
  validate({ params: idParamSchema, body: updatePersonaSchema }),
  personaController.update
);

/**
 * @swagger
 * /personas/{id}:
 *   delete:
 *     summary: Elimina una persona
 *     tags: [Personas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la persona
 *     responses:
 *       200:
 *         description: Persona eliminada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 type:
 *                   type: string
 *                   example: SUCCESS
 *                 code:
 *                   type: string
 *                   example: PERSONA_DELETED
 *                 data:
 *                   type: object
 *                   nullable: true
 *       401:
 *         description: No autorizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       404:
 *         description: Persona no encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 */
router.delete(
  "/:id",
  authMiddleware,
  validate({ params: idParamSchema }),
  personaController.delete
);

export default router;
