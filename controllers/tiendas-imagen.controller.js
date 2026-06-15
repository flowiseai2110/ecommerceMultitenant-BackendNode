import { prisma } from "../config/prisma.js";
import { processAndUploadImage, deleteFromStorage } from "../services/image.service.js";
import { apiResponse } from "../utils/apiResponse.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";

const BUCKET = "tiendas";

// Logo: 400×400, inside — preserva proporciones sin recortar ni agregar fondo
export const uploadLogo = makeUploadTiendaImagen({
  urlField:         "logoUrl",
  storagePathField: "logoStoragePath",
  subfolder:        "logos",
  width:            400,
  height:           400,
  fit:              "inside",
});

// Banner: 1200×400, cover — rellena el área sin distorsionar
export const uploadBanner = makeUploadTiendaImagen({
  urlField:         "bannerUrl",
  storagePathField: "bannerStoragePath",
  subfolder:        "banners",
  width:            1200,
  height:           400,
  fit:              "cover",
});

function makeUploadTiendaImagen({ urlField, storagePathField, subfolder, width, height, fit }) {
  return async function (req, res, next) {
    try {
      if (!req.file) throw new ValidationError("Se requiere un archivo de imagen");

      const tiendaId = req.params.id;

      const tienda = await prisma.tiendas.findUnique({
        where: { id: tiendaId },
        select: { id: true, [storagePathField]: true },
      });
      if (!tienda) throw new NotFoundError("Tienda");

      const { webp, jpeg } = await processAndUploadImage(req.file.buffer, req.file.originalname, {
        fit,
        bucket: BUCKET,
        folder: `${tiendaId}/${subfolder}`,
        width,
        height,
      });

      const updated = await prisma.tiendas.update({
        where: { id: tiendaId },
        data: {
          [urlField]:         webp.url,
          [storagePathField]: webp.path,
          fechaActualizacion:   new Date(),
          usuarioActualizacion: req.user?.email || req.user?.id,
        },
      });

      // Limpia el logo/banner anterior (best-effort)
      const oldWebpPath = tienda[storagePathField];
      if (oldWebpPath) {
        const oldJpegPath = oldWebpPath.slice(0, -5) + ".jpg";
        await deleteFromStorage([oldWebpPath, oldJpegPath], BUCKET);
      }

      return apiResponse(res, {
        status: 200,
        type: "SUCCESS",
        code: "TIENDAS_UPDATED",
        data: { id: updated.id, [urlField]: updated[urlField] },
      });
    } catch (err) {
      next(err);
    }
  };
}
