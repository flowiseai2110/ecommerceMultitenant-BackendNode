/**
 * Hotel / hostal (hotel-inventario R1.7): el tipo de habitación no lleva precio en
 * su formulario. Lo fija "Estadía y precios" (habitaciones.service guardarFicha):
 * el más bajo de sus modalidades. Hasta entonces queda en 0 y la tienda no lo
 * muestra (listarHabitacionesStore exige modalidades).
 */
export const hotel = {
  prepararProducto(datos, { modo }) {
    const { precioBase, precioOferta, ...resto } = datos;
    // Al crear arranca en 0, sin oferta. Al editar no se toca: lo maneja la estadía,
    // y un precio enviado desde el formulario pisaría el "desde" real.
    return modo === "crear" ? { ...resto, precioBase: 0, precioOferta: null } : resto;
  }
};
