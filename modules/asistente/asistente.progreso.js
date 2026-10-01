/**
 * Checklist "primeros pasos" de una tienda: qué le falta para empezar a vender.
 *
 * Solo lectura y scoped por `tiendaId` (que viene de requireTiendaAccess, nunca
 * del modelo). Lo consumen el endpoint GET /progreso y la tool
 * `consultar_progreso_tienda` del asistente.
 */

import { prisma } from "../../config/prisma.js";

// Imágenes por defecto (config.defaultImages): no cuentan como "subida".
const esImagenReal = (url) => Boolean(url) && !/placehold\.co/i.test(url);

/**
 * Arma los pasos a partir de los conteos. Función pura (testeable sin DB).
 * El orden es el recomendado para empezar a vender.
 * @param {object} d
 * @returns {Array<{ id: string, titulo: string, descripcion: string, completado: boolean, ruta: string, tourId: string|null }>}
 */
export function calcularPasos(d) {
  return [
    {
      id: "whatsapp",
      titulo: "Agrega tu WhatsApp",
      descripcion: "Los pedidos y consultas te llegan por ahí.",
      completado: Boolean(d.whatsappNumero),
      ruta: "/tiendas",
      tourId: "configurar-tienda"
    },
    {
      id: "logo",
      titulo: "Sube tu logo",
      descripcion: "Aparece en la cabecera de tu tienda.",
      completado: esImagenReal(d.logoUrl),
      ruta: "/tiendas",
      tourId: "configurar-tienda"
    },
    {
      id: "banner",
      titulo: "Sube tu banner",
      descripcion: "Es la imagen grande de la portada.",
      completado: esImagenReal(d.bannerUrl),
      ruta: "/tiendas",
      tourId: "configurar-tienda"
    },
    {
      id: "categoria",
      titulo: "Crea una categoría",
      descripcion: "Ordena tus productos para que se encuentren fácil.",
      completado: d.categorias > 0,
      ruta: "/categorias",
      tourId: "crear-categoria"
    },
    {
      id: "producto",
      titulo: "Publica tu primer producto",
      descripcion: "Con foto, precio y descripción.",
      completado: d.productos > 0,
      ruta: "/productos",
      tourId: "crear-producto"
    },
    {
      id: "pago",
      titulo: "Configura un método de pago",
      descripcion: "Yape, Plin, transferencia o QR.",
      completado: d.metodosPago > 0,
      ruta: "/metodos-pago",
      tourId: "metodos-pago"
    },
    {
      id: "envio",
      titulo: "Configura un método de envío",
      descripcion: "Courier, delivery propio o recojo en tienda.",
      completado: d.metodosEnvio > 0,
      ruta: "/metodos-envio",
      tourId: "metodos-envio"
    },
    {
      id: "pedido",
      titulo: "Recibe tu primer pedido",
      descripcion: "Comparte el link de tu tienda en tus redes.",
      completado: d.pedidos > 0,
      ruta: "/pedidos",
      tourId: "gestionar-pedidos"
    }
  ];
}

/**
 * @param {string} tiendaId - Server-side (requireTiendaAccess).
 * @returns {Promise<{ completados: number, total: number, pasos: Array }>}
 */
export async function obtenerProgreso(tiendaId) {
  const [tienda, categorias, productos, metodosPago, metodosEnvio, pedidos] = await Promise.all([
    prisma.tiendas.findUnique({
      where: { id: tiendaId },
      select: { whatsappNumero: true, logoUrl: true, bannerUrl: true }
    }),
    prisma.categorias.count({ where: { tiendaId, activo: true } }),
    prisma.productos.count({ where: { tiendaId, activo: true } }),
    prisma.metodos_pago.count({ where: { tiendaId, activo: true } }),
    prisma.metodos_envio.count({ where: { tiendaId, activo: true } }),
    prisma.pedidos.count({ where: { tiendaId } })
  ]);

  const pasos = calcularPasos({
    ...(tienda || {}),
    categorias,
    productos,
    metodosPago,
    metodosEnvio,
    pedidos
  });

  return {
    completados: pasos.filter(p => p.completado).length,
    total: pasos.length,
    pasos
  };
}
