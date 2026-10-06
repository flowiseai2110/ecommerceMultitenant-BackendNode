// Checkout: crea pedidos REALES (descuentan stock, crean cliente e historial)
// en las tiendas de carga. Pocos usuarios: el objetivo es medir la escritura
// en transacción mientras store-visita.js genera el tráfico de lectura.
//
//   node load-tests/run.mjs store-checkout.js -e PEDIDOS_POR_MIN=6 -e DURACION=5m
//
// Los pedidos se borran con: npm run seed:carga -- --limpiar --confirmar-db <ref>

import http from "k6/http";
import { group } from "k6";
import { cargarTiendas } from "./lib/tiendas.js";
import { checkoutVista } from "./lib/store.js";
import { datos, elegir, pensar, qs, verificar } from "./lib/util.js";
import { BASE_URL, HEADERS, TIENDAS, UMBRALES, ESTADISTICAS, env } from "./lib/config.js";

const PEDIDOS_POR_MIN = Number(env("PEDIDOS_POR_MIN", 6));
const DURACION = env("DURACION", "5m");
const PRODUCTOS_POR_TIENDA = 8; // fichas que se consultan en setup para tener variantes con stock

export const options = {
  scenarios: {
    checkout: {
      executor: "constant-arrival-rate",
      rate: PEDIDOS_POR_MIN,
      timeUnit: "1m",
      duration: DURACION,
      preAllocatedVUs: 5,
      maxVUs: 30
    }
  },
  thresholds: {
    "http_req_duration{tipo:checkout}": UMBRALES["http_req_duration{tipo:checkout}"],
    http_req_failed: UMBRALES.http_req_failed,
    checks: UMBRALES.checks
  },
  summaryTrendStats: ESTADISTICAS
};

export function setup() {
  const tiendas = cargarTiendas(TIENDAS).map((t) => {
    const items = [];
    for (const p of t.productos.slice(0, PRODUCTOS_POR_TIENDA)) {
      const r = http.get(`${BASE_URL}/store/productos/${p.id}?${qs({ tiendaId: t.id })}`, { headers: HEADERS, tags: { name: "setup:producto" } });
      const ficha = datos(r);
      const variantes = (ficha.variantes ?? []).filter(v => v.activo !== false && v.stock > 2);
      if (variantes.length) {
        for (const v of variantes.slice(0, 3)) items.push({ productoId: p.id, nombre: p.nombre, precio: v.precio ?? p.precio, varianteId: v.id, varianteNombre: v.nombre });
      } else if ((ficha.stock ?? 0) > 2) {
        items.push({ productoId: p.id, nombre: p.nombre, precio: p.precio, varianteId: null, varianteNombre: null });
      }
    }
    return { ...t, items };
  }).filter(t => t.items.length);
  console.log(`setup checkout: ${tiendas.length} tiendas con stock`);
  return { tiendas };
}

export default function ({ tiendas }) {
  const t = elegir(tiendas);
  const item = elegir(t.items);

  checkoutVista(t);
  pensar(5, 15); // llenando el formulario

  group("crear-pedido", () => {
    const body = {
      tiendaId: t.id,
      cliente: { nombre: "Cliente Carga k6", whatsappNumero: `9${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}` },
      detalles: [{
        productoId: item.productoId,
        varianteId: item.varianteId,
        productoNombre: item.nombre,
        varianteNombre: item.varianteNombre,
        cantidad: 1,
        precioUnitario: item.precio
      }],
      metodoPago: "Pago contra entrega",
      metodoEnvio: "Recojo en tienda",
      comprobante: { tipo: "boleta" },
      notas: "Pedido de prueba de carga (k6)"
    };
    const r = http.post(`${BASE_URL}/store/pedidos`, JSON.stringify(body), {
      headers: { ...HEADERS, "Content-Type": "application/json" },
      tags: { name: "checkout:crear-pedido", tipo: "checkout" }
    });
    verificar(r, "checkout:crear-pedido", 201);
  });
}
