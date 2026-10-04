import { prisma } from "../config/prisma.js";
import { processAndUploadImage } from "../services/image.service.js";
import { deletePublicFiles } from "../services/storage.service.js";
import { uploadImagenSchema, uploadImagenForProductoSchema } from "../modules/catalogo/producto-imagenes.schema.js";
import { apiResponse } from "../utils/apiResponse.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import GenericRepository from "../repositories/generic.repository.js";
import GenericService from "../services/generic.service.js";

const repo = new GenericRepository(prisma.producto_imagenes, "ProductoImagen");
const service = new GenericService(repo, { enableAudit: true });

// POST /producto-imagenes/upload — productoId en el body
export function makeUploadImagen(subfolder = "productos") {
  return async function uploadImagen(req, res, next) {
    try {
      if (!req.file) throw new ValidationError("Se requiere un archivo de imagen");

      const parsed = uploadImagenSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

      const { productoId, varianteId, valorOpcion, textoAlternativo, orden, esPrincipal, fit } = parsed.data;

      const folder = req.tiendaId ? `${req.tiendaId}/${subfolder}` : subfolder;
      const { webp } = await processAndUploadImage(req.file.buffer, req.file.originalname, { fit, folder });

      const record = await service.create({
        productoId,
        varianteId: varianteId || null,
        valorOpcion: valorOpcion || null,
        url: webp.url,
        storagePath: webp.path,
        textoAlternativo: textoAlternativo || null,
        orden,
        esPrincipal,
      }, req.user);

      return apiResponse(res, { status: 201, type: "SUCCESS", code: "PRODUCTOIMAGEN_CREATED", data: record });
    } catch (err) {
      next(err);
    }
  };
}

// POST /productos/:id/imagen — productoId en el path param
export function makeUploadImagenForProducto(subfolder = "productos") {
  return async function uploadImagenForProducto(req, res, next) {
    try {
      if (!req.file) throw new ValidationError("Se requiere un archivo de imagen");

      const parsed = uploadImagenForProductoSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

      const productoId = req.params.id;
      const { varianteId, valorOpcion, textoAlternativo, orden, esPrincipal, fit } = parsed.data;

      const folder = req.tiendaId ? `${req.tiendaId}/${subfolder}` : subfolder;
      const { webp } = await processAndUploadImage(req.file.buffer, req.file.originalname, { fit, folder });

      const record = await service.create({
        productoId,
        varianteId: varianteId || null,
        valorOpcion: valorOpcion || null,
        url: webp.url,
        storagePath: webp.path,
        textoAlternativo: textoAlternativo || null,
        orden,
        esPrincipal,
      }, req.user);

      return apiResponse(res, { status: 201, type: "SUCCESS", code: "PRODUCTOIMAGEN_CREATED", data: record });
    } catch (err) {
      next(err);
    }
  };
}

export async function deleteImagenWithCleanup(req, res, next) {
  try {
    const { id } = req.params;

    const imagen = await prisma.producto_imagenes.findUnique({
      where: { id },
      select: { storagePath: true, storagePathJpeg: true },
    });

    if (!imagen) throw new NotFoundError("Imagen");

    await service.delete(id, null);

    await deletePublicFiles([imagen.storagePath, imagen.storagePathJpeg]);

    return apiResponse(res, { status: 200, type: "SUCCESS", code: "PRODUCTOIMAGEN_DELETED", data: null });
  } catch (err) {
    next(err);
  }
}
