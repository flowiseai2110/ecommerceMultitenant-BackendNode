/**
 * Middleware que agrega Cache-Control a respuestas GET.
 * Solo aplica a GET — POST/PUT/DELETE no se tocan.
 * @param {number} seconds - Tiempo de vida en segundos
 */
export function cache(seconds) {
  return (req, res, next) => {
    if (req.method === "GET") {
      res.set(
        "Cache-Control",
        `public, max-age=${seconds}, stale-while-revalidate=${Math.floor(seconds / 2)}`
      );
    }
    next();
  };
}
