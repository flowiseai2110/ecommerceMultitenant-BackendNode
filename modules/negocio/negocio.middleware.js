import { estrategiaDe, tiendaDe } from "./registro.js";

/**
 * Aplica la regla del rubro al producto que se crea o edita. Va después de
 * requireTiendaAccess (que fija req.tiendaId desde la tienda dueña) y de validate().
 * @param {"crear" | "editar"} modo
 */
export function prepararProductoDelRubro(modo) {
  return async (req, res, next) => {
    try {
      const tienda = await tiendaDe(req.tiendaId);
      req.body = estrategiaDe(tienda).prepararProducto(req.body, { modo });
      next();
    } catch (error) {
      next(error);
    }
  };
}
