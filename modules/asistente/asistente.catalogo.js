/**
 * Catálogo cerrado de pantallas y tours que el asistente del panel puede ofrecer.
 *
 * Es el contrato compartido con el frontend admin: las rutas son las de
 * `app.routes.ts` y los ids de tour los de `shared/asistente/tours.ts`. Si se
 * agrega un tour allá, se agrega acá (y viceversa) — el modelo solo puede elegir
 * valores de estos enums, así que nunca propone una ruta o un tour inexistente.
 */

/** Ruta → para qué sirve (el modelo lo usa para decidir a dónde mandar). */
export const PANTALLAS = {
  "/dashboard": "Inicio: resumen de pedidos, categorías, equipo y accesos rápidos",
  "/productos": "Lista de productos; desde aquí se crean y editan",
  "/productos/new": "Formulario para crear un producto nuevo",
  "/categorias": "Categorías para agrupar productos",
  "/pedidos": "Pedidos recibidos, con filtros por estado y pago",
  "/cupones": "Cupones de descuento",
  "/resenas": "Reseñas de clientes: aprobar, ocultar y responder",
  "/tiendas": "Datos de la tienda: nombre, WhatsApp, facturación e integraciones",
  "/diseno": "Diseño del storefront: logo, banner, barra de anuncios y portada de inicio",
  "/live": "Aviso de live: avisar en la tienda que estás transmitiendo",
  "/mensajes-whatsapp": "Plantillas de mensajes de WhatsApp para cada estado del pedido",
  "/metodos-pago": "Métodos de pago (Yape/Plin, transferencia, QR)",
  "/metodos-envio": "Métodos de envío (courier, delivery propio, recojo en tienda) y zonas",
  "/studio": "Studio: genera logo, banner o foto de producto con IA",
  "/team": "Equipo: invitar personas y asignar roles (solo admin/owner)",
  "/consumo-ia": "Consumo IA: cuántas consultas del asesor de ventas y de la guía se usaron este mes, límite y aviso por correo",
  "/ayuda": "Página de ayuda con límites de cada campo y herramientas externas"
};

/** Id de tour → qué enseña. Los pasos viven en el frontend. */
export const TOURS = {
  "bienvenida": "Recorrido general del menú: qué hay en cada sección del panel",
  "configurar-tienda": "Cómo completar los datos de la tienda: contacto/WhatsApp",
  "crear-categoria": "Cómo crear una categoría",
  "crear-producto": "Cómo crear un producto: datos, precio, imágenes y guardar",
  "metodos-pago": "Cómo agregar un método de pago",
  "metodos-envio": "Cómo agregar un método de envío",
  "gestionar-pedidos": "Cómo revisar pedidos, filtrarlos y cambiar su estado",
  "diseno-tienda": "Cómo subir logo y banner y personalizar la barra de anuncios y la portada"
};

export const RUTAS_VALIDAS = Object.keys(PANTALLAS);
export const TOURS_VALIDOS = Object.keys(TOURS);
