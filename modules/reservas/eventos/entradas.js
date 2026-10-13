import { randomInt } from "node:crypto";
import { prisma } from "../../../config/prisma.js";
import { ConflictError, NotFoundError } from "../../../utils/errors.js";

/**
 * Entradas con QR por persona (docs/specs/plantillas-por-rubro E6; mini-booking R9.3):
 * al confirmarse una compra se emite una entrada con un código único por cada
 * persona. En la puerta se escanea (o se escribe) el código y queda usada:
 * una entrada no entra dos veces. La lista de asistentes sigue igual.
 */

// Sin 0/O, 1/I/L: se dicta y se escribe sin confusiones.
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LARGO = 10;

export function generarCodigo() {
  let codigo = "";
  for (let i = 0; i < LARGO; i++) codigo += ALFABETO[randomInt(ALFABETO.length)];
  return codigo;
}

/** Normaliza lo que se escribe o escanea: sin espacios ni guiones, en mayúsculas. */
export const normalizarCodigo = (codigo) => String(codigo ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Emite las entradas de una compra confirmada, una por persona. Idempotente:
 * si ya se emitieron, no hace nada (la confirmación puede llegar dos veces).
 */
export async function emitirEntradas(tx, { tiendaId, pedidoId }) {
  if (await tx.evento_entradas.count({ where: { pedidoId } })) return;
  const [items, reserva] = await Promise.all([
    tx.evento_compra_items.findMany({ where: { pedidoId }, orderBy: [{ precio: "desc" }, { nombre: "asc" }] }),
    tx.reservas.findUnique({ where: { pedidoId }, select: { funcionId: true } })
  ]);
  let numero = 0;
  const data = items.flatMap(i => Array.from({ length: i.cantidad }, () => ({
    tiendaId, pedidoId, funcionId: reserva?.funcionId ?? null, tipoEntradaId: i.tipoEntradaId,
    tipoNombre: i.nombre, numero: ++numero, codigo: generarCodigo()
  })));
  if (data.length) await tx.evento_entradas.createMany({ data });
}

/** Compra cancelada: sus entradas dejan de valer (las ya usadas quedan como registro). */
export async function anularEntradas(tx, pedidoId) {
  await tx.evento_entradas.updateMany({ where: { pedidoId, usadaEn: null }, data: { anulada: true } });
}

/** Forma pública de una entrada (seguimiento del comprador). */
export const serializarEntrada = (e) => ({
  codigo: e.codigo, numero: e.numero, tipo: e.tipoNombre, usada: Boolean(e.usadaEn), anulada: e.anulada
});

const conflicto = (motivo, message, extra = {}) => new ConflictError(message, { message, motivo, ...extra });

/**
 * Admin, en la puerta: valida el código y marca la entrada como usada. Un
 * código ya usado responde 409 YA_USADA con la hora en que entró; uno de otra
 * función se avisa (puede ser un error del asistente), pero no se marca.
 * @param {{ funcionId?: string|null }} [opciones] - la función que se está controlando
 */
export async function validarEntrada(tiendaId, codigoLeido, user, { funcionId = null } = {}, ahora = new Date()) {
  const codigo = normalizarCodigo(codigoLeido);
  const entrada = await prisma.evento_entradas.findFirst({
    where: { tiendaId, codigo },
    include: {
      pedido: {
        select: {
          numeroPedido: true, estado: true,
          reserva: {
            select: {
              titularNombres: true, titularApellidos: true,
              producto: { select: { nombre: true } },
              funcion: { select: { id: true, nombre: true, inicio: true } }
            }
          }
        }
      }
    }
  });
  if (!entrada) throw new NotFoundError("Entrada", "No existe una entrada con ese código");

  const r = entrada.pedido.reserva;
  const datos = {
    codigo: entrada.codigo,
    numero: entrada.numero,
    tipo: entrada.tipoNombre,
    compra: entrada.pedido.numeroPedido,
    titular: [r?.titularNombres, r?.titularApellidos].filter(Boolean).join(" "),
    evento: r?.producto?.nombre ?? null,
    funcion: r?.funcion ? { id: r.funcion.id, nombre: r.funcion.nombre, inicio: r.funcion.inicio } : null,
    usadaEn: entrada.usadaEn
  };

  if (entrada.anulada || !["confirmada", "completada"].includes(entrada.pedido.estado)) {
    throw conflicto("ANULADA", "Esta entrada no es válida: la compra fue cancelada o no está pagada", { entrada: datos });
  }
  if (funcionId && entrada.funcionId && entrada.funcionId !== funcionId) {
    throw conflicto("OTRA_FUNCION", "Esta entrada es de otra función", { entrada: datos });
  }
  if (entrada.usadaEn) {
    throw conflicto("YA_USADA", "Esta entrada ya se usó", { entrada: datos });
  }

  // Condicionado: dos puertas escaneando la misma entrada a la vez → solo una la marca.
  const { count } = await prisma.evento_entradas.updateMany({
    where: { id: entrada.id, usadaEn: null },
    data: { usadaEn: ahora, usadaPor: user?.email ?? user?.id ?? null }
  });
  if (count === 0) throw conflicto("YA_USADA", "Esta entrada ya se usó", { entrada: { ...datos, usadaEn: ahora } });
  return { ...datos, usadaEn: ahora };
}

/** Cuántas entradas de una función ya ingresaron (para el control de ingreso). */
export async function resumenIngreso(tiendaId, funcionId) {
  const [total, ingresaron] = await Promise.all([
    prisma.evento_entradas.count({ where: { tiendaId, funcionId, anulada: false } }),
    prisma.evento_entradas.count({ where: { tiendaId, funcionId, anulada: false, usadaEn: { not: null } } })
  ]);
  return { total, ingresaron };
}
