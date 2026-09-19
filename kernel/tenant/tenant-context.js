import { ForbiddenError } from "../../utils/errors.js";

/**
 * Contexto de tenant normalizado del request.
 *
 * Hoy conviven tres formas de resolver la tienda (subdominio en el storefront,
 * membresía en el admin, dueño real del recurso). Este módulo las unifica en un
 * único objeto `req.tenant`, de modo que services y controllers dejen de leer
 * los campos sueltos (`req.tiendaId`, `req.tiendaMembership`, `req.tienda`) y
 * dependan de un solo contrato.
 *
 * En esta etapa (PR 1) es un ADAPTADOR de solo lectura: deriva el contexto de
 * los campos que los middlewares actuales ya dejan en el request, sin cambiar su
 * comportamiento. Los middlewares se migrarán para poblar `req.tenant`
 * directamente en PRs posteriores.
 *
 * @typedef {object} TenantContext
 * @property {string|null} id - tiendaId (UUID) resuelto, o null si no hay.
 * @property {"subdomain"|"membership"|"resource"|"client"|"unknown"} source
 *   Cómo se resolvió la tienda.
 * @property {object|null} membership - Fila de `usuario_tiendas` (flujo admin).
 * @property {string|null} rol - Código de rol del usuario en la tienda (admin).
 */

const TENANT_KEY = Symbol.for("app.tenantContext");

/**
 * Asigna explícitamente el contexto de tenant al request. Pensado para código
 * nuevo (middlewares migrados) que quiera poblar `req.tenant` de forma directa
 * en vez de depender de la derivación de compatibilidad.
 *
 * Mantiene `req.tiendaId` en sync para no romper a los consumidores legacy
 * mientras dure la migración.
 *
 * @param {import("express").Request} req
 * @param {Partial<TenantContext> & { id: string }} ctx
 * @returns {TenantContext}
 */
export function setTenant(req, ctx) {
  const tenant = {
    id: ctx.id,
    source: ctx.source ?? "unknown",
    membership: ctx.membership ?? null,
    rol: ctx.rol ?? null
  };
  req[TENANT_KEY] = tenant;
  // Sync legacy: consumidores viejos siguen leyendo req.tiendaId.
  req.tiendaId = tenant.id;
  return tenant;
}

/**
 * Devuelve el contexto de tenant del request. Si no fue asignado
 * explícitamente con {@link setTenant}, lo deriva (compatibilidad) de los
 * campos que los middlewares actuales ya dejan: `req.tiendaId`,
 * `req.tiendaMembership` y `req.tienda`.
 *
 * @param {import("express").Request} req
 * @returns {TenantContext}
 */
export function getTenant(req) {
  if (req[TENANT_KEY]) return req[TENANT_KEY];

  const id = req.tiendaId ?? req.tienda?.id ?? null;
  const membership = req.tiendaMembership ?? null;

  let source = "unknown";
  if (membership) source = "membership";
  else if (req.tienda) source = "subdomain";
  else if (id) source = "client";

  return {
    id,
    source,
    membership,
    rol: membership?.rol ?? null
  };
}

/**
 * Devuelve el tiendaId del request o lanza 403 si no se pudo resolver. Úsalo en
 * controllers/services donde el scope de tienda es obligatorio: convierte el
 * invariante "toda operación va contra una tienda" en una barrera explícita en
 * vez de un filtro opcional que alguien pueda olvidar.
 *
 * @param {import("express").Request} req
 * @returns {string} tiendaId (UUID)
 * @throws {ForbiddenError} si no hay tienda en el contexto.
 */
export function requireTenantId(req) {
  const { id } = getTenant(req);
  if (!id) {
    throw new ForbiddenError("Se requiere una tienda para esta operación");
  }
  return id;
}
