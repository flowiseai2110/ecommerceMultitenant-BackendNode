import sharp from "sharp";
import { normalizarImagenWidget, LADO_MAXIMO_WIDGET } from "../widget-imagen.js";
import { validateFile } from "../../../validators/uploads.validator.js";

// Imagen real generada en memoria: un círculo rojo sobre fondo transparente.
const sticker = (ancho, alto, formato = "png") =>
  sharp({ create: { width: ancho, height: alto, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{
      input: Buffer.from(`<svg width="${ancho}" height="${alto}"><circle cx="${ancho / 2}" cy="${alto / 2}" r="${Math.min(ancho, alto) / 3}" fill="red"/></svg>`),
      top: 0,
      left: 0
    }])
    [formato]()
    .toBuffer();

describe("normalizarImagenWidget (R5.2, R5.3)", () => {
  it("PNG grande → WebP de máx. 512 px por lado, conservando la transparencia", async () => {
    const salida = await normalizarImagenWidget(await sticker(1200, 800));
    const meta = await sharp(salida).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width, meta.height)).toBe(LADO_MAXIMO_WIDGET);
    expect(meta.width / meta.height).toBeCloseTo(1.5, 1);
    expect(meta.hasAlpha).toBe(true);
  });

  it("no agranda imágenes chicas", async () => {
    const meta = await sharp(await normalizarImagenWidget(await sticker(120, 120, "webp"))).metadata();
    expect(meta.width).toBe(120);
  });

  it("rechaza JPEG aunque el navegador diga image/png (se mira el contenido)", async () => {
    const jpeg = await sharp({ create: { width: 50, height: 50, channels: 3, background: "white" } }).jpeg().toBuffer();
    await expect(normalizarImagenWidget(jpeg)).rejects.toThrow("PNG o WebP");
  });

  it("rechaza SVG y archivos que no son imágenes", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await expect(normalizarImagenWidget(svg)).rejects.toMatchObject({ statusCode: 400 });
    await expect(normalizarImagenWidget(Buffer.from("hola"))).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("validateFile para la carpeta widgets", () => {
  const archivo = (mimetype, size = 1000) => ({ mimetype, size });

  it("solo PNG/WebP", () => {
    expect(validateFile(archivo("image/png"), "widgets").isValid).toBe(true);
    expect(validateFile(archivo("image/webp"), "widgets").isValid).toBe(true);
    expect(validateFile(archivo("image/svg+xml"), "widgets").isValid).toBe(false);
    expect(validateFile(archivo("image/jpeg"), "widgets").isValid).toBe(false);
  });

  it("máximo 1 MB (las demás carpetas siguen en 5 MB)", () => {
    expect(validateFile(archivo("image/png", 2 * 1024 * 1024), "widgets").isValid).toBe(false);
    expect(validateFile(archivo("image/png", 2 * 1024 * 1024), "productos").isValid).toBe(true);
  });
});
