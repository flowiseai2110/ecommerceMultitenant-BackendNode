import { isIP } from "node:net";
import config from "../../config/index.js";
import { secretoIgual } from "./secretos.js";

/**
 * IP real del visitante, para rate limiting y registros legales.
 *
 * Por dónde llega cada request del storefront:
 *  - Navegador → rewrite de Vercel → edge de Railway → app. req.ip depende de
 *    "trust proxy" (TRUST_PROXY_HOPS): con un salto de menos, req.ip es la IP
 *    de Vercel y todos los visitantes comparten contador.
 *  - SSR (función de Vercel) → Railway directo. La request la origina Vercel:
 *    la IP del visitante no viaja en ningún header estándar. El SSR la manda
 *    en X-Visitor-IP firmada con X-SSR-Key (secreto compartido SSR_API_KEY);
 *    sin la firma ese header se ignora, si no cualquiera elegiría su IP.
 */

export const HEADER_SSR_KEY = "x-ssr-key";
export const HEADER_VISITOR_IP = "x-visitor-ip";

const CACHE = Symbol("clientIp");

/**
 * @param {import("express").Request} req
 * @returns {{ ip: string, source: "ssr" | "proxy" }}
 */
export function resolveClientIp(req) {
  if (req[CACHE]) return req[CACHE];

  let resultado = { ip: req.ip, source: "proxy" };
  if (secretoIgual(req.get(HEADER_SSR_KEY), config.ssr.apiKey)) {
    const visitante = req.get(HEADER_VISITOR_IP)?.trim();
    if (visitante && isIP(visitante)) resultado = { ip: visitante, source: "ssr" };
  }

  req[CACHE] = resultado;
  return resultado;
}

/** IP del visitante (ver resolveClientIp). */
export const clientIp = (req) => resolveClientIp(req).ip;
