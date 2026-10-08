import { z } from "zod";

// Bucket único en Supabase Storage
const BUCKET_NAME = "tiendas";

// Folders permitidos dentro de cada tienda
const ALLOWED_FOLDERS = ["productos", "categorias", "logos", "banners", "otros", "widgets", "diseno"];

// Widgets de campaña (docs/specs/campanas-widgets, R5): solo PNG/WebP de
// hasta 1 MB. Es un primer filtro por el mimetype que manda el navegador; el
// contenido real lo verifica sharp en modules/campanas/widget-imagen.js.
const WIDGET_MIME_TYPES = ["image/png", "image/webp"];
const WIDGET_MAX_FILE_SIZE = 1024 * 1024;

// Tipos MIME permitidos para imágenes
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml"
];

// Tamaño máximo de archivo (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Schema para validar el body del upload
export const uploadImageSchema = z.object({
  folder: z.enum(ALLOWED_FOLDERS, {
    required_error: "El folder es requerido",
    invalid_type_error: `El folder debe ser uno de: ${ALLOWED_FOLDERS.join(", ")}`
  }),
  tiendaId: z.string({ required_error: "El ID de tienda es requerido" }).uuid("ID de tienda inválido")
});

// Validador de archivo. `folder` ajusta las reglas (widgets es más estricto).
export const validateFile = (file, folder) => {
  const errors = [];

  if (!file) {
    errors.push("El archivo es requerido");
    return { isValid: false, errors };
  }

  const mimes = folder === "widgets" ? WIDGET_MIME_TYPES : ALLOWED_MIME_TYPES;
  const maxSize = folder === "widgets" ? WIDGET_MAX_FILE_SIZE : MAX_FILE_SIZE;

  if (!mimes.includes(file.mimetype)) {
    errors.push(`Tipo de archivo no permitido. Tipos permitidos: ${mimes.join(", ")}`);
  }

  if (file.size > maxSize) {
    errors.push(`El archivo excede el tamaño máximo permitido (${maxSize / 1024 / 1024}MB)`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export default {
  uploadImageSchema,
  validateFile,
  BUCKET_NAME,
  ALLOWED_FOLDERS,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE
};
