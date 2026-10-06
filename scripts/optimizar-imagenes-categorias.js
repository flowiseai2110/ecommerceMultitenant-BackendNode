// Reprocesa las imágenes de categoría que se subieron sin optimizar (antes de
// que /uploads/image las convirtiera a WebP): fotos de 3-5 MB que hacían pesar
// la portada del storefront 10 MB (Lighthouse, Fase 4).
//
//   node scripts/optimizar-imagenes-categorias.js            (simulación: solo informa)
//   node scripts/optimizar-imagenes-categorias.js --aplicar  (sube el WebP y actualiza la categoría)
//
// Solo toca imágenes de NUESTRO almacenamiento (Supabase Storage o R2), nunca
// URLs externas. Los originales no se borran: quedan como respaldo.

import "dotenv/config";
import crypto from "node:crypto";
import { prisma } from "../config/prisma.js";
import { optimizarImagenSubida, MIMES_OPTIMIZABLES } from "../services/image.service.js";
import { uploadPublicFile } from "../services/storage.service.js";
import config from "../config/index.js";

const APLICAR = process.argv.includes("--aplicar");

// Orígenes propios: bucket público de Supabase y CDN de R2.
const PROPIOS = [
  config.supabaseUrl && `${config.supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/`,
  config.storage.r2?.publicUrl && `${config.storage.r2.publicUrl}/`
].filter(Boolean);

const esPropia = (url) => PROPIOS.some(p => url.startsWith(p));
const kb = (n) => `${Math.round(n / 1024)} KB`;

const categorias = await prisma.categorias.findMany({
  where: { imagenUrl: { not: null } },
  select: { id: true, tiendaId: true, nombre: true, imagenUrl: true }
});
const candidatas = categorias.filter(c => esPropia(c.imagenUrl) && !/\.webp(\?|$)/i.test(c.imagenUrl));
console.log(`${categorias.length} categorías con imagen; ${candidatas.length} propias sin optimizar.${APLICAR ? "" : " (simulación: usa --aplicar para guardar)"}\n`);

let antes = 0;
let despues = 0;
let fallidas = 0;
for (const c of candidatas) {
  try {
    const res = await fetch(c.imagenUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const tipo = (res.headers.get("content-type") ?? "").split(";")[0];
    if (!MIMES_OPTIMIZABLES.has(tipo)) {
      console.log(`- ${c.nombre}: ${tipo || "tipo desconocido"}, se deja igual`);
      continue;
    }
    const original = Buffer.from(await res.arrayBuffer());
    const webp = await optimizarImagenSubida(original);
    antes += original.length;
    despues += webp.length;

    if (APLICAR) {
      const { url } = await uploadPublicFile(`${c.tiendaId}/categorias/${crypto.randomUUID()}.webp`, webp, "image/webp");
      await prisma.categorias.update({
        where: { id: c.id },
        data: { imagenUrl: url, fechaActualizacion: new Date(), usuarioActualizacion: "optimizar-imagenes" }
      });
    }
    console.log(`✓ ${c.nombre}: ${kb(original.length)} → ${kb(webp.length)}${APLICAR ? " (actualizada)" : ""}`);
  } catch (err) {
    fallidas++;
    console.log(`✗ ${c.nombre}: ${err.message}`);
  }
}

console.log(`\nTotal: ${kb(antes)} → ${kb(despues)}${fallidas ? ` | ${fallidas} con error` : ""}`);
await prisma.$disconnect();
