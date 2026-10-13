// Prueba de concepto de transmisión — Paso 2: reproductor con reconexión.
// Sirve reproductor.html con un token de reproducción firmado para la entrada.
// El navegador consulta /lifecycle de Cloudflare con ese mismo token (CORS
// abierto), así que la vigilancia de la señal no pasa por el backend.
//
//   node poc/transmision/servidor.js <inputUid> [--puerto 4050]
//   → abrir http://localhost:4050

import "dotenv/config";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { SignJWT, importJWK } from "jose";

const env = process.env;
const args = process.argv.slice(2);
const i = args.indexOf("--puerto");
const puerto = Number(i >= 0 ? args[i + 1] : 4050);
const inputUid = args.find((a, j) => !a.startsWith("--") && args[j - 1] !== "--puerto");

if (!inputUid) {
  console.error("Uso: node poc/transmision/servidor.js <inputUid> [--puerto 4050]");
  process.exit(1);
}
const faltan = ["CF_STREAM_CUSTOMER_CODE", "CF_STREAM_SIGNING_KEY_ID", "CF_STREAM_SIGNING_KEY_JWK"].filter(n => !env[n]);
if (faltan.length) {
  console.error(`❌ Faltan en el .env: ${faltan.join(", ")}`);
  process.exit(1);
}

const llave = await importJWK(JSON.parse(Buffer.from(env.CF_STREAM_SIGNING_KEY_JWK, "base64").toString("utf8")), "RS256");

/** Mismo token que firma services/streaming/cloudflare.provider.js. */
async function firmar(horas = 4) {
  return new SignJWT({ kid: env.CF_STREAM_SIGNING_KEY_ID })
    .setProtectedHeader({ alg: "RS256", kid: env.CF_STREAM_SIGNING_KEY_ID })
    .setSubject(inputUid)
    .setNotBefore(Math.floor(Date.now() / 1000) - 60)
    .setExpirationTime(`${horas}h`)
    .sign(llave);
}

const dir = import.meta.dirname;

http.createServer(async (req, res) => {
  if (req.url !== "/" && !req.url.startsWith("/?")) {
    res.writeHead(404).end();
    return;
  }
  const base = `https://customer-${env.CF_STREAM_CUSTOMER_CODE}.cloudflarestream.com/${await firmar()}`;
  const config = JSON.stringify({ inputUid, base });
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  // Se lee en cada request: así un cambio en el HTML se ve con solo recargar.
  const html = fs.readFileSync(path.join(dir, "reproductor.html"), "utf8");
  res.end(html.replace("/*CONFIG*/null", config));
}).listen(puerto, () => {
  console.log(`Reproductor de prueba de ${inputUid}: http://localhost:${puerto}`);
});
