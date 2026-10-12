/**
 * Complejo de canchas (alquiler-canchas R1): la cancha no lleva precio en el
 * formulario de producto. Lo fija su ficha (precio por hora de día y de noche):
 * canchas.service guardarFichaCancha pone el más bajo como precio "desde".
 * Hasta entonces queda en 0 y la tienda no la muestra (sin ficha no se publica).
 */
export const canchas = {
  prepararProducto(datos, { modo }) {
    const { precioBase, precioOferta, ...resto } = datos;
    // Al editar no se toca: un precio enviado desde el formulario pisaría el de la ficha.
    return modo === "crear" ? { ...resto, precioBase: 0, precioOferta: null } : resto;
  }
};
