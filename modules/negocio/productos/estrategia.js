import { errorDeCampo } from "../contrato.js";

/**
 * Tienda de productos: el precio se fija en el formulario y es obligatorio.
 * Tours, eventos y locales también lo piden en el formulario (luego su ficha
 * lo reemplaza por el precio "desde"), así que usan esta misma regla.
 */
export const productos = {
  prepararProducto(datos, { modo }) {
    if (modo === "crear" && datos.precioBase == null) {
      throw errorDeCampo("precioBase", "El precio base es requerido");
    }
    if (datos.precioBase != null && datos.precioBase <= 0) {
      throw errorDeCampo("precioBase", "El precio base debe ser positivo");
    }
    return datos;
  }
};
