/**
 * Middleware que agrega Cache-Control a respuestas GET.
 * Solo aplica a GET — POST/PUT/DELETE no se tocan.
 * @param {number} seconds - Tiempo de vida en segundos
 * @param {object} [opts]
 * @param {(body: object) => (string|number|Date|null|undefined)} [opts.hasta] -
 *   Instante en que la respuesta deja de ser cierta (docs/specs/campanas-cuando
 *   R3.9.1). Se calcula AL RESPONDER (también cuando el cuerpo sale de una
 *   caché en memoria): `max-age = min(seconds, faltan)` y `stale-while-revalidate`
 *   solo si faltan >= 1,5 x seconds, para que nadie sirva algo pasado el cambio.
 */
export function cache(seconds, { hasta } = {}) {
  return (req, res, next) => {
    if (req.method === "GET") {
      res.set(
        "Cache-Control",
        `public, max-age=${seconds}, stale-while-revalidate=${Math.floor(seconds / 2)}`
      );

      if (hasta) {
        const json = res.json.bind(res);
        res.json = (body) => {
          const instante = res.statusCode === 200 ? hasta(body) : null;
          if (instante) {
            const faltan = Math.max(0, Math.floor((new Date(instante).getTime() - Date.now()) / 1000));
            const maxAge = Math.min(seconds, faltan);
            const swr = faltan >= seconds * 1.5 ? `, stale-while-revalidate=${Math.floor(seconds / 2)}` : "";
            res.set("Cache-Control", `public, max-age=${maxAge}${swr}`);
          }
          return json(body);
        };
      }
    }
    next();
  };
}
