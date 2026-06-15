import multer from "multer";

const BLOCKED_MIME = new Set(["image/svg+xml", "image/svg"]);

const imageFileFilter = (_req, file, cb) => {
  if (!file.mimetype.startsWith("image/") || BLOCKED_MIME.has(file.mimetype)) {
    return cb(new Error("Formato no permitido. Use JPEG, PNG, WebP o GIF."));
  }
  cb(null, true);
};

export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});
