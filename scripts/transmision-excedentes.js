// Excedentes, cargos ("Guardar 1 año") y costos de las transmisiones (docs/specs/transmision-eventos, Fases 3 y 4).
// El excedente se cobra a MANO con el siguiente pago de la tienda.
//
//   node scripts/transmision-excedentes.js listar [--estado por_cobrar|cobrado|autorizado|anulado]
//   node scripts/transmision-excedentes.js cobrar --id <excedenteId|cargoId> --referencia "Yape 123456" [--aplicar]
//   node scripts/transmision-excedentes.js reporte [--mes 2026-10]
//
// "reporte" compara, por tienda, lo descontado (plan, paquetes, excedente) con
// el costo estimado de Cloudflare (R10.3): minutos vistos × $1 / 1,000.

import "dotenv/config";
import { prisma } from "../config/prisma.js";
import { textoMinutos } from "../modules/transmisiones/transmisiones.horas.js";

const [, , comando, ...args] = process.argv;
const valor = (nombre) => { const i = args.indexOf(`--${nombre}`); return i >= 0 ? args[i + 1] : undefined; };
const APLICAR = args.includes("--aplicar");
const USD_POR_MIN_VISTO = 1 / 1000;
const fecha = (d) => d.toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "short", year: "numeric" });

function salir(mensaje) {
  console.error(`❌ ${mensaje}`);
  process.exit(1);
}

const INCLUDE = {
  transmision: {
    select: {
      tiendaId: true,
      funcion: { select: { inicio: true, evento: { select: { producto: { select: { nombre: true } } } } } }
    }
  }
};

/** Nombre y slug de las tiendas de una lista de excedentes. */
async function tiendasDe(filas) {
  const tiendas = await prisma.tiendas.findMany({ where: { id: { in: [...new Set(filas.map(e => e.tiendaId))] } }, select: { id: true, nombre: true, slug: true } });
  return new Map(tiendas.map(t => [t.id, t]));
}

const comandos = {
  async listar() {
    const estado = valor("estado") ?? "por_cobrar";
    const filas = await prisma.transmision_excedentes.findMany({ where: { estado }, include: INCLUDE, orderBy: { autorizadoEn: "asc" } });
    if (!filas.length) return console.log(`No hay excedentes "${estado}".`);
    const tiendas = await tiendasDe(filas);
    let total = 0;
    for (const e of filas) {
      const f = e.transmision.funcion;
      total += Number(e.monto);
      console.log(`${e.id}  ${tiendas.get(e.tiendaId).slug.padEnd(20)} ${fecha(f.inicio)}  ${f.evento.producto.nombre.slice(0, 30).padEnd(30)} ` +
        `${textoMinutos(e.estado === "autorizado" ? e.minutosAutorizados : e.minutos).padEnd(10)} S/ ${Number(e.monto).toFixed(2).padStart(7)}  ` +
        `autorizó ${e.autorizadoPor}`);
    }
    console.log(`\n${filas.length} excedente(s) "${estado}" · total S/ ${total.toFixed(2)}`);

    // Otros cargos (Fase 4: "Guardar 1 año").
    if (!["por_cobrar", "cobrado", "anulado"].includes(estado)) return;
    const cargos = await prisma.transmision_cargos.findMany({ where: { estado }, include: INCLUDE, orderBy: { autorizadoEn: "asc" } });
    if (!cargos.length) return;
    const tiendasC = await tiendasDe(cargos);
    console.log(`\nCargos "${estado}":`);
    let totalC = 0;
    for (const c of cargos) {
      const f = c.transmision.funcion;
      totalC += Number(c.monto);
      console.log(`${c.id}  ${tiendasC.get(c.tiendaId).slug.padEnd(20)} ${fecha(f.inicio)}  ${f.evento.producto.nombre.slice(0, 30).padEnd(30)} ` +
        `${c.tipo.padEnd(12)} S/ ${Number(c.monto).toFixed(2).padStart(7)}  autorizó ${c.autorizadoPor}`);
    }
    console.log(`\n${cargos.length} cargo(s) "${estado}" · total S/ ${totalC.toFixed(2)}`);
  },

  /** Marca cobrado un excedente o un cargo (el id puede ser de cualquiera de los dos). */
  async cobrar() {
    const id = valor("id");
    const referencia = valor("referencia");
    if (!id || !referencia) salir('Usa: cobrar --id <excedenteId|cargoId> --referencia "Yape 123456"');
    const e = await prisma.transmision_excedentes.findUnique({ where: { id }, include: INCLUDE });
    const c = e ? null : await prisma.transmision_cargos.findUnique({ where: { id }, include: INCLUDE });
    const fila = e ?? c;
    if (!fila) salir("No existe ese excedente ni cargo");
    if (fila.estado !== "por_cobrar") salir(`Está "${fila.estado}": solo se cobra uno "por_cobrar"`);
    const tienda = (await tiendasDe([fila])).get(fila.tiendaId);
    console.log(`${tienda.nombre}: S/ ${Number(fila.monto).toFixed(2)} (${e ? textoMinutos(e.minutos) + " de excedente" : c.tipo}) · ${referencia}`);
    if (!APLICAR) return console.log("(simulación: agrega --aplicar para marcarlo cobrado)");
    const data = { estado: "cobrado", cobradoEn: new Date(), referenciaCobro: referencia, fechaActualizacion: new Date(), usuarioActualizacion: "script" };
    if (e) await prisma.transmision_excedentes.update({ where: { id }, data });
    else await prisma.transmision_cargos.update({ where: { id }, data });
    console.log("✅ Marcado como cobrado");
  },

  async reporte() {
    const mes = valor("mes") ?? new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 7);
    const [movimientos, transmisiones] = await Promise.all([
      prisma.transmision_movimientos.groupBy({ by: ["tiendaId", "fuente"], where: { periodo: mes }, _sum: { minutos: true } }),
      prisma.evento_transmisiones.findMany({
        where: { plan: { not: "basico" }, terminadaEn: { not: null } },
        select: { tiendaId: true, minutosVistos: true, minutosUsados: true, funcion: { select: { inicio: true } } }
      })
    ]);
    const delMes = transmisiones.filter(t => new Date(t.funcion.inicio.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 7) === mes);
    const tiendas = await prisma.tiendas.findMany({
      where: { id: { in: [...new Set([...movimientos.map(m => m.tiendaId), ...delMes.map(t => t.tiendaId)])] } },
      select: { id: true, slug: true }
    });
    if (!tiendas.length) return console.log(`Sin transmisiones Privadas terminadas en ${mes}.`);

    console.log(`Transmisiones Privadas de ${mes} (minutos de paquete; costo estimado de Cloudflare por minutos vistos)\n`);
    console.log("tienda               plan      paquete   excedente absorbido  transmitido  vistos    costo USD");
    for (const t of tiendas) {
      const suma = (fuente) => movimientos.find(m => m.tiendaId === t.id && m.fuente === fuente)?._sum.minutos ?? 0;
      const propias = delMes.filter(x => x.tiendaId === t.id);
      const vistos = propias.reduce((s, x) => s + Number(x.minutosVistos), 0);
      const transmitido = propias.reduce((s, x) => s + (x.minutosUsados ?? 0), 0);
      console.log(`${t.slug.padEnd(20)} ${String(suma("plan")).padStart(6)} ${String(suma("paquete")).padStart(9)} ${String(suma("excedente")).padStart(11)} ` +
        `${String(suma("absorbido")).padStart(9)} ${String(transmitido).padStart(12)} ${vistos.toFixed(0).padStart(7)}  ${(vistos * USD_POR_MIN_VISTO).toFixed(2).padStart(9)}`);
    }
    console.log("\nCosto de entrega estimado con el latido de los invitados (≈ 30 s de video por latido). No incluye almacenamiento.");
  }
};

const fn = comandos[comando];
if (!fn) salir(`Comando desconocido. Usa: ${Object.keys(comandos).join(", ")} (detalle al inicio del archivo)`);
try {
  await fn();
} finally {
  await prisma.$disconnect();
}
