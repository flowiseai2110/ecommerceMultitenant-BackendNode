import { prisma } from "../config/prisma.js";
import { processAndUploadImage, deleteFromStorage } from "../services/image.service.js";
import { uploadImagenSchema, uploadImagenForProductoSchema } from "../validators/producto-imagenes.validator.js";
import { apiResponse } from "../utils/apiResponse.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import GenericRepository from "../repositories/generic.repository.js";
import GenericService from "../services/generic.service.js";

const BUCKET = "productos";

const repo = new GenericRepository(prisma.producto_imagenes, "ProductoImagen");
const service = new GenericService(repo, { enableAudit: true });

export async function uploadImagen(req, res, next) {
  try {
    if (!req.file) {
      throw new ValidationError("Se requiere un archivo de imagen");
    }

    const parsed = uploadImagenSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0].message);
    }

    const { productoId, varianteId, textoAlternativo, orden, esPrincipal, fit } = parsed.data;

    const { webp, jpeg } = await processAndUploadImage(req.file.buffer, req.file.originalname, {
      fit,
      bucket: BUCKET,
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
      esPrincipal,
    }, req.user);

    return apiResponse(res, {
      status: 201,
      type: "SUCCESS",
      code: "PRODUCTOIMAGEN_CREATED",
      data: record,
    });
  } catch (err) {
    next(err);
  }
}

// POST /productos/:id/imagen — productoId viene del path param
export async function uploadImagenForProducto(req, res, next) {
  try {
    if (!req.file) throw new ValidationError("Se requiere un archivo de imagen");

    const parsed = uploadImagenForProductoSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

    const productoId = req.params.id;

    const producto = await prisma.productos.findUnique({
      where: { id: productoId },
      select: { id: true },
    });
    if (!producto) throw new NotFoundError("Producto");

    const { varianteId, textoAlternativo, orden, esPrincipal, fit } = parsed.data;

    const { webp, jpeg } = await processAndUploadImage(req.file.buffer, req.file.originalname, {
      fit,
      bucket: BUCKET,
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
      esPrincipal,
    }, req.user);

    return apiResponse(res, {
      status: 201,
      type: "SUCCESS",
      code: "PRODUCTOIMAGEN_CREATED",
      data: record,
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteImagenWithCleanup(req, res, next) {
  try {
    const { id } = req.params;

    const imagen = await prisma.producto_imagenes.findUnique({
      where: { id },
      select: { storagePath: true, storagePathJpeg: true },
    });

    if (!imagen) throw new NotFoundError("Imagen");

    // Eliminar DB primero — si Storage falla quedan archivos huérfanos (tolerable)
    // pero no referencias rotas en la DB
    await service.delete(id, null);

    const paths = [imagen.storagePath, imagen.storagePathJpeg].filter(Boolean);
    if (paths.length > 0) {
      await deleteFromStorage(paths, BUCKET);
    }

    return apiResponse(res, {
      status: 200,
      type: "SUCCESS",
      code: "PRODUCTOIMAGEN_DELETED",
      data: null,
    });
  } catch (err) {
    next(err);
  }
}
