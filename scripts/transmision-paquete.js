// Paquetes prepagados de horas de transmisión (docs/specs/transmision-eventos, Fase 3).
// El cobro es MANUAL: la tienda paga a la plataforma (Yape o transferencia) y
// aquí se da de alta su paquete. Vence a los 12 meses.
//
//   node scripts/transmision-paquete.js alta --tienda <slug> --horas 10|25 --referencia "Yape 123456" [--precio 250] [--aplicar]
//   node scripts/transmision-paquete.js listar --tienda <slug>
//   node scripts/transmision-paquete.js anular --id <paqueteId> [--aplicar]   (solo si no se usó)
//
// Sin --aplicar solo muestra lo que haría.

import "dotenv/config";
import { prisma } from "../config/prisma.js";
import { MESES_VIGENCIA_PAQUETE, PAQUETES } from "../modules/transmisiones/transmisiones.reglas.js";
import { textoMinutos } from "../modules/transmisiones/transmisiones.horas.js";

const [, , comando, ...args] = process.argv;
const valor = (nombre) => { const i = args.indexOf(`--${nombre}`); return i >= 0 ? args[i + 1] : undefined; };
const APLICAR = args.includes("--aplicar");
const fecha = (d) => d.toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "short", year: "numeric" });

function salir(mensaje) {
  console.error(`❌ ${mensaje}`);
  process.exit(1);
}

async function tiendaPorSlug(slug) {
  if (!slug) salir("Falta --tienda <slug>");
  const tienda = await prisma.tiendas.findUnique({ where: { slug }, select: { id: true, nombre: true, slug: true, tipoNegocio: true } });
  if (!tienda) salir(`No existe la tienda "${slug}"`);
  if (tienda.tipoNegocio !== "eventos") console.warn(`⚠️  ${tienda.nombre} no es un negocio de eventos (${tienda.tipoNegocio})`);
  return tienda;
}

const comandos = {
  async alta() {
    const tienda = await tiendaPorSlug(valor("tienda"));
    const horas = Number(valor("horas"));
    if (!PAQUETES[horas]) salir(`--horas debe ser ${Object.keys(PAQUETES).join(" o ")}`);
    const referencia = valor("referencia");
    if (!referencia) salir('Falta --referencia (ej. "Yape 123456" o "Transferencia BCP 0012")');
    const precio = valor("precio") !== undefined ? Number(valor("precio")) : PAQUETES[horas];
    if (!(precio >= 0)) salir("--precio inválido");

    const compradoEn = new Date();
    const venceEn = new Date(compradoEn);
    venceEn.setMonth(venceEn.getMonth() + MESES_VIGENCIA_PAQUETE);

    console.log(`${tienda.nombre} (${tienda.slug}): paquete de ${horas} h por S/ ${precio.toFixed(2)} · ${referencia} · vence el ${fecha(venceEn)}`);
    if (!APLICAR) return console.log("(simulación: agrega --aplicar para guardarlo)");
    const p = await prisma.transmision_paquetes.create({
      data: { tiendaId: tienda.id, minutos: horas * 60, precio, referenciaPago: referencia, compradoEn, venceEn, usuarioRegistro: "script" }
    });
    console.log(`✅ Paquete ${p.id} creado`);
  },

  async listar() {
    const tienda = await tiendaPorSlug(valor("tienda"));
    const paquetes = await prisma.transmision_paquetes.findMany({ where: { tiendaId: tienda.id }, orderBy: { compradoEn: "desc" } });
    if (!paquetes.length) return console.log(`${tienda.nombre} no tiene paquetes.`);
    const ahora = new Date();
    for (const p of paquetes) {
      const estado = p.estado !== "activo" ? p.estado : p.venceEn <= ahora ? "vencido" : "activo";
      console.log(`${p.id}  ${estado.padEnd(8)} ${textoMinutos(p.minutos).padEnd(8)} usado ${textoMinutos(p.minutosUsados).padEnd(10)} ` +
        `S/ ${Number(p.precio).toFixed(2).padStart(8)}  comprado ${fecha(p.compradoEn)}  vence ${fecha(p.venceEn)}  ${p.referenciaPago ?? ""}`);
    }
  },

  async anular() {
    const id = valor("id");
    if (!id) salir("Falta --id <paqueteId>");
    const p = await prisma.transmision_paquetes.findUnique({ where: { id } });
    if (!p) salir("No existe ese paquete");
    if (p.minutosUsados > 0) salir(`Ya se usaron ${textoMinutos(p.minutosUsados)}: no se puede anular`);
    console.log(`Anular paquete de ${textoMinutos(p.minutos)} (S/ ${Number(p.precio).toFixed(2)}, ${p.referenciaPago ?? "sin referencia"})`);
    if (!APLICAR) return console.log("(simulación: agrega --aplicar para anularlo)");
    await prisma.transmision_paquetes.update({ where: { id }, data: { estado: "anulado", fechaActualizacion: new Date(), usuarioActualizacion: "script" } });
    console.log("✅ Anulado");
  }
};

const fn = comandos[comando];
if (!fn) salir(`Comando desconocido. Usa: ${Object.keys(comandos).join(", ")} (detalle al inicio del archivo)`);
try {
  await fn();
} finally {
  await prisma.$disconnect();
}
