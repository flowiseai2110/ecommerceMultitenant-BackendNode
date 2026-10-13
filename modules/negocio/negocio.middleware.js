import { estrategiaDe, tiendaDe } from "./registro.js";
import { errorDeCampo } from "./contrato.js";

/**
 * Aplica la regla del rubro al producto que se crea o edita. Va después de
 * requireTiendaAccess (que fija req.tiendaId desde la tienda dueña) y de validate().
 * @param {"crear" | "editar"} modo
 */
export function prepararProductoDelRubro(modo) {
  return async (req, res, next) => {
    try {
      const tienda = await tiendaDe(req.tiendaId);
      const estrategia = estrategiaDe(tienda);
      req.body = sinMarcaSiNoAplica(estrategia.prepararProducto(req.body, { modo }), estrategia);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Un rubro sin la capacidad `marcas` no guarda marca: quitarla se acepta, ponerla no. */
function sinMarcaSiNoAplica(datos, estrategia) {
  if (estrategia.marcas || !("marcaId" in datos)) return datos;
  if (datos.marcaId != null) throw errorDeCampo("marcaId", "Este tipo de negocio no maneja marcas");
  const { marcaId, ...resto } = datos;
  return resto;
}

/**
 * Corta la ruta si el rubro de la tienda no tiene la capacidad (p. ej. el CRUD de
 * marcas en un hotel). Va después de requireTiendaAccess.
 * @param {string} capacidad - Una de CAPACIDADES (contrato.js).
 */
export function requiereCapacidad(capacidad) {
  return async (req, res, next) => {
    try {
      const tienda = await tiendaDe(req.tiendaId);
      if (!estrategiaDe(tienda)[capacidad]) {
        throw errorDeCampo("tiendaId", "Este tipo de negocio no tiene esta función");
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
