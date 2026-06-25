import { prisma } from "../config/prisma.js";
import { processAndUploadImage } from "../services/image.service.js";
import { createNanoBananaEditTask, getTaskStatus } from "../services/ai-image.service.js";
import { generarIaSchema, confirmarIaSchema } from "../validators/producto-imagenes.validator.js";
import { apiResponse } from "../utils/apiResponse.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import GenericRepository from "../repositories/generic.repository.js";
import GenericService from "../services/generic.service.js";

const repo = new GenericRepository(prisma.producto_imagenes, "ProductoImagen");
const service = new GenericService(repo, { enableAudit: true });

// POST /producto-imagenes/:id/generar-ia — :id = imagen origen ya subida (foto de cajón)
export async function generarImagenIA(req, res, next) {
  try {
    const { id } = req.params;

    const parsed = generarIaSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

    const imagenOrigen = await prisma.producto_imagenes.findUnique({ where: { id } });
    if (!imagenOrigen) throw new NotFoundError("Imagen");

    const { taskId } = await createNanoBananaEditTask({
      imageUrl: imagenOrigen.url,
      prompt: parsed.data.prompt
    });

    return apiResponse(res, { status: 202, type: "SUCCESS", code: "IA_TASK_CREATED", data: { taskId } });
  } catch (err) {
    next(err);
  }
}

// GET /producto-imagenes/generar-ia/:taskId — polling de estado, sin efectos secundarios
export async function consultarEstadoImagenIA(req, res, next) {
  try {
    const { taskId } = req.params;
    const status = await getTaskStatus(taskId);
    return apiResponse(res, { status: 200, type: "SUCCESS", code: "IA_TASK_STATUS", data: status });
  } catch (err) {
    next(err);
  }
}

// POST /producto-imagenes/generar-ia/:taskId/confirmar — descarga el resultado y lo persiste como imagen real
export async function confirmarImagenIA(req, res, next) {
  try {
    const { taskId } = req.params;

    const parsed = confirmarIaSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

    const status = await getTaskStatus(taskId);
    if (status.state !== "success") {
      throw new ValidationError(`La tarea de IA no está lista (estado: ${status.state})`);
    }

    const resultUrl = status.resultUrls[0];
    if (!resultUrl) throw new ValidationError("La IA no devolvió ninguna imagen");

    const downloaded = await fetch(resultUrl);
    if (!downloaded.ok) throw new ValidationError("No se pudo descargar la imagen generada por la IA");
    const buffer = Buffer.from(await downloaded.arrayBuffer());

    const { productoId, varianteId, textoAlternativo, orden, esPrincipal } = parsed.data;
    const folder = req.tiendaId ? `${req.tiendaId}/productos` : "productos";

    const { webp, jpeg } = await processAndUploadImage(buffer, `ia_${taskId}.png`, {
      fit: "cover",
      bucket: "tiendas",
      folder
    });

    const record = await service.create({
      productoId,
      varianteId: varianteId || null,
      url: webp.url,
      urlJpeg: jpeg.url,
      storagePath: webp.path,
      storagePathJpeg: jpeg.path,
      textoAlternativo: textoAlternativo || null,
      orden,
      esPrincipal
    }, req.user);

    return apiResponse(res, { status: 201, type: "SUCCESS", code: "PRODUCTOIMAGEN_CREATED", data: record });
  } catch (err) {
    next(err);
  }
}
