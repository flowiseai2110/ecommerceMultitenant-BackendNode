import { jest } from "@jest/globals";
import sharp from "sharp";

// Optimización de imágenes subidas por /uploads/image (Fase 4: fotos de
// categoría de 3-5 MB hacían pesar la portada del storefront 10 MB).

jest.unstable_mockModule("../../config/supabase.js", () => ({ supabase: {}, default: {} }));
jest.unstable_mockModule("../storage.service.js", () => ({ uploadPublicFile: jest.fn() }));

const { optimizarImagenSubida, MIMES_OPTIMIZABLES } = await import("../image.service.js");

/** JPEG con ruido (no se comprime bien, como una foto real). */
const foto = (width, height, extra = (s) => s) =>
  extra(sharp({ create: { width, height, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 40 } } }))
    .jpeg({ quality: 95 })
    .toBuffer();

describe("optimizarImagenSubida", () => {
  it("una foto grande queda en WebP de ≤1200 px y mucho más liviana", async () => {
    const original = await foto(4000, 3000);
    const salida = await optimizarImagenSubida(original);
    const meta = await sharp(salida).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(900); // conserva la proporción
    expect(salida.length).toBeLessThan(original.length / 5);
  });

  it("corrige la orientación EXIF de fotos de celular", async () => {
    const original = await foto(300, 200, (s) => s.withMetadata({ orientation: 6 })); // rotada 90°
    const meta = await sharp(await optimizarImagenSubida(original)).metadata();
    expect([meta.width, meta.height]).toEqual([200, 300]);
    expect(meta.orientation ?? 1).toBe(1);
  });

  it("no agranda imágenes chicas", async () => {
    const meta = await sharp(await optimizarImagenSubida(await foto(400, 300))).metadata();
    expect([meta.width, meta.height]).toEqual([400, 300]);
  });

  it("respeta un lado máximo distinto", async () => {
    const meta = await sharp(await optimizarImagenSubida(await foto(2000, 1000), 500)).metadata();
    expect([meta.width, meta.height]).toEqual([500, 250]);
  });

  it("rechaza un archivo que no es imagen", async () => {
    await expect(optimizarImagenSubida(Buffer.from("no soy una imagen"))).rejects.toThrow();
  });

  it("no re-codifica GIF ni SVG", () => {
    expect(MIMES_OPTIMIZABLES.has("image/gif")).toBe(false);
    expect(MIMES_OPTIMIZABLES.has("image/svg+xml")).toBe(false);
    expect(MIMES_OPTIMIZABLES.has("image/jpeg")).toBe(true);
  });
});
