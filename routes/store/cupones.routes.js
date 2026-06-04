import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { codigoParamSchema, validarCuponQuerySchema } from "../../validators/cupones.validator.js";

const router = Router();

// GET /validar/:codigo?tiendaId=X&subtotal=Y&whatsappNumero=Z — Validar cupón (público)
router.get(
  "/validar/:codigo",
  validate({ params: codigoParamSchema, query: validarCuponQuerySchema }),
  async (req, res, next) => {
    try {
      const { codigo } = req.params;
      const { tiendaId, subtotal, whatsappNumero } = req.query;
      const now = new Date();

      const cupon = await prisma.cupones.findFirst({
        where: { tiendaId, codigo: codigo.toUpperCase() }
      });

      const invalido = (mensaje) =>
        apiResponse(res, {
          status: 200,
          type: "SUCCESS",
          code: "CUPON_VALIDADO",
          data: { valido: false, mensaje }
        });

      if (!cupon) return invalido("Cupón no válido");
      if (!cupon.activo) return invalido("Cupón inactivo");
      if (cupon.fechaInicio && cupon.fechaInicio > now) return invalido("Cupón aún no vigente");
      if (cupon.fechaFin && cupon.fechaFin < now) return invalido("Cupón expirado");
      if (cupon.usoMaximo !== null && cupon.usoActual >= cupon.usoMaximo)
        return invalido("Cupón agotado");
      if (Number(cupon.minimoCompra) > 0 && subtotal < Number(cupon.minimoCompra))
        return invalido(`Compra mínima requerida: ${cupon.minimoCompra}`);

      // Verificar límite por cliente si se envía el WhatsApp y el cupón tiene límite
      if (whatsappNumero && cupon.usoMaximoPorCliente !== null) {
        const cliente = await prisma.clientes.findFirst({
          where: { tiendaId, whatsappNumero },
          select: { id: true }
        });
        if (cliente) {
          const usosCliente = await prisma.pedidos.count({
            where: { tiendaId, clienteId: cliente.id, codigoCupon: cupon.codigo }
          });
          if (usosCliente >= cupon.usoMaximoPorCliente) {
            return invalido("Ya usaste este cupón el máximo de veces permitido");
          }
        }
      }

      const descuento =
        cupon.tipo === "porcentaje"
          ? Math.round(subtotal * (Number(cupon.valor) / 100) * 100) / 100
          : Math.min(Number(cupon.valor), subtotal);

      return apiResponse(res, {
        status: 200,
        type: "SUCCESS",
        code: "CUPON_VALIDADO",
        data: {
          valido: true,
          cupon: {
            id: cupon.id,
            codigo: cupon.codigo,
            tipo: cupon.tipo,
            valor: Number(cupon.valor),
            minimoCompra: Number(cupon.minimoCompra),
            usoMaximoPorCliente: cupon.usoMaximoPorCliente
          },
          descuento,
          mensaje: null
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
