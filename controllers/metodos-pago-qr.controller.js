import { prisma } from "../config/prisma.js";
import { processAndUploadImage, deleteFromStorage } from "../services/image.service.js";
import { apiResponse } from "../utils/apiResponse.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";

const BUCKET = "tiendas";

// El QR vive dentro de cuentaInfo (JsonB) como qrUrl/qrStoragePath:
// no requiere cambio de schema (el DDL de esta base se aplica a mano).

// POST /:id/qr — Subir o reemplazar el QR de pago (Yape/Plin/etc.)
// 600×600 inside: nunca recortar ni ampliar un QR, se vuelve inescaneable.
export async function uploadQr(req, res, next) {
  try {
    if (!req.file) throw new ValidationError("Se requiere un archivo de imagen");

    const { id } = req.params;
    const metodo = await prisma.metodos_pago.findUnique({
      where: { id },
      select: { id: true, tiendaId: true, cuentaInfo: true }
    });
    if (!metodo) throw new NotFoundError("Método de pago");

    const { webp } = await processAndUploadImage(req.file.buffer, req.file.originalname, {
      fit: "inside",
      bucket: BUCKET,
      folder: `${metodo.tiendaId}/qr-pagos`,
      width: 600,
      height: 600
    });

    const cuentaInfo = {
      ...(metodo.cuentaInfo ?? {}),
      qrUrl: webp.url,
      qrStoragePath: webp.path
    };

    const updated = await prisma.metodos_pago.update({
      where: { id },
      data: { cuentaInfo }
    });

    // Limpia el QR anterior (best-effort)
    const oldWebpPath = metodo.cuentaInfo?.qrStoragePath;
    if (oldWebpPath) {
      const oldJpegPath = oldWebpPath.slice(0, -5) + ".jpg";
      await deleteFromStorage([oldWebpPath, oldJpegPath], BUCKET);
    }

    return apiResponse(res, {
      status: 200,
      type: "SUCCESS",
      code: "METODO_PAGO_QR_UPDATED",
      data: updated
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /:id/qr — Quitar el QR de pago del método
export async function deleteQr(req, res, next) {
  try {
    const { id } = req.params;
    const metodo = await prisma.metodos_pago.findUnique({
      where: { id },
      select: { id: true, cuentaInfo: true }
    });
    if (!metodo) throw new NotFoundError("Método de pago");

    const { qrUrl, qrStoragePath, ...restoInfo } = metodo.cuentaInfo ?? {};

    const updated = await prisma.metodos_pago.update({
      where: { id },
      data: { cuentaInfo: restoInfo }
    });

    if (qrStoragePath) {
      const oldJpegPath = qrStoragePath.slice(0, -5) + ".jpg";
      await deleteFromStorage([qrStoragePath, oldJpegPath], BUCKET);
    }

    return apiResponse(res, {
      status: 200,
      type: "SUCCESS",
      code: "METODO_PAGO_QR_DELETED",
      data: updated
    });
  } catch (err) {
    next(err);
  }
}
