import { Faker, es_MX, es, base } from "@faker-js/faker";
import { claveDe, nombreVariante, MAX_VARIANTES } from "../../modules/catalogo/producto-opciones.js";
import { calcularRatingScore, formatearNombreMostrado } from "../../modules/resenas/resenas.service.js";
import { PERFILES, DISTRITOS, COMENTARIOS_RESENA, imagenTienda } from "./perfiles.js";

/**
 * Generador puro del seed de carga: arma TODAS las filas de una tienda en
 * memoria (sin tocar la BD). Determinista: misma semilla → mismos datos, así
 * se puede crecer por escalones (--tiendas 10, luego 25...) sin que cambien
 * las tiendas ya creadas.
 */

export const MARCA_SEED = "seed-carga"; // usuarioRegistro de todas las filas: así se limpian

const DIA_MS = 24 * 60 * 60 * 1000;
const HORA_MS = 60 * 60 * 1000;

const FLUJO_ESTADOS = ["pendiente", "confirmado", "en_proceso", "enviado", "entregado"];
// Distribución del estado final de los pedidos históricos.
const PESOS_ESTADO = [
  ["entregado", 55], ["enviado", 8], ["en_proceso", 5], ["confirmado", 8], ["pendiente", 12], ["cancelado", 12]
];
const METODOS_PAGO = ["Pago contra entrega", "Yape", "Plin", "Transferencia bancaria"];
const METODOS_ENVIO = [
  { nombre: "Recojo en tienda", costo: 0 },
  { nombre: "Delivery propio", costo: 10 },
  { nombre: "Delivery propio", costo: 15 }
];

/** Utilidades de azar sobre una instancia de faker con semilla. */
function azar(faker) {
  const entre = (min, max) => faker.number.int({ min, max });
  const elegir = (arr) => arr[entre(0, arr.length - 1)];
  const muestra = (arr, n) => faker.helpers.arrayElements(arr, Math.min(n, arr.length));
  const prob = (p) => faker.number.float({ min: 0, max: 1 }) < p;
  const ponderado = (pares) => faker.helpers.weightedArrayElement(pares.map(([value, weight]) => ({ value, weight })));
  return { entre, elegir, muestra, prob, ponderado };
}

const dinero = (n) => Math.round(n * 100) / 100;

const slugify = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** "Ana Quispe" → "Ana Quispe"; sin prefijos tipo "Sra." de faker.person.fullName. */
const nombrePersona = (faker) => `${faker.person.firstName()} ${faker.person.lastName()}`;

/**
 * Producto cartesiano de las opciones elegidas → atributos de cada variante.
 * @param {Array<{nombre:string, tipo:string, valores:string[]}>} opciones
 */
function combinaciones(opciones) {
  return opciones.reduce(
    (acc, o) => acc.flatMap(attrs => o.valores.map(v => ({ ...attrs, [claveDe(o)]: v }))),
    [{}]
  );
}

/**
 * @param {object} p
 * @param {number} p.indice - Posición de la tienda (1..N): fija slug y semilla.
 * @param {string} p.perfil - Clave de PERFILES.
 * @param {string} p.prefijo - Prefijo del slug (ej. "carga").
 * @param {number} p.semilla - Semilla base.
 * @param {[number, number]} p.productos - Rango de productos.
 * @param {[number, number]} p.pedidos - Rango de pedidos históricos.
 * @param {number} p.dias - Antigüedad máxima de los pedidos.
 * @param {Date} [p.ahora]
 */
export function generarTienda({ indice, perfil: clavePerfil, prefijo, semilla, productos: rangoProductos, pedidos: rangoPedidos, dias, ahora = new Date() }) {
  const perfil = PERFILES[clavePerfil];
  if (!perfil) throw new Error(`Perfil desconocido: ${clavePerfil}`);

  const faker = new Faker({ locale: [es_MX, es, base] });
  faker.seed(semilla * 100003 + indice);
  const { entre, elegir, muestra, prob, ponderado } = azar(faker);
  const uuid = () => faker.string.uuid();
  // Nada en el futuro: el historial y las reseñas de pedidos recientes se topan en "ahora".
  const hasta = (ms) => new Date(Math.min(ms, ahora.getTime()));
  const auditoria = (fecha) => ({ fechaRegistro: fecha, usuarioRegistro: MARCA_SEED });

  // ── Tienda ────────────────────────────────────────────────────────────
  const slug = `${prefijo}-${String(indice).padStart(3, "0")}`;
  const tiendaId = uuid();
  const apellido = faker.person.lastName();
  const fechaAlta = new Date(ahora.getTime() - (dias + 30) * DIA_MS);
  const tienda = {
    id: tiendaId,
    nombre: `${elegir(perfil.marcas)} ${apellido}`.slice(0, 100),
    slug,
    descripcion: `Tienda de prueba de carga (${clavePerfil}).`,
    ...imagenTienda(slug),
    whatsappNumero: `9${faker.string.numeric(8)}`,
    email: `${slug}@example.com`,
    direccion: `${faker.location.streetAddress()}, Lima`,
    ruc: `20${faker.string.numeric(9)}`,
    razonSocial: `${apellido.toUpperCase()} ${clavePerfil.toUpperCase()} S.A.C.`.slice(0, 200),
    razonComercial: `${elegir(perfil.marcas)} ${apellido}`.slice(0, 200),
    direccionFiscal: "Lima, Lima, Perú",
    ubigeo: elegir(DISTRITOS).ubigeo,
    envioGratisMinimo: prob(0.5) ? dinero(entre(100, 250)) : null,
    moneda: "PEN",
    tipoNegocio: "productos",
    rubro: perfil.rubro,
    activo: true,
    ...auditoria(fechaAlta)
  };

  // ── Categorías ───────────────────────────────────────────────────────
  const categorias = perfil.categorias.map((nombre, i) => ({
    id: uuid(),
    tiendaId,
    nombre,
    slug: slugify(nombre),
    imagenUrl: elegir(perfil.imagenes),
    orden: i,
    activo: true,
    ...auditoria(fechaAlta)
  }));

  // ── Productos, variantes e imágenes ──────────────────────────────────
  const productos = [];
  const variantes = [];
  const imagenes = [];
  const nProductos = entre(...rangoProductos);
  for (let i = 1; i <= nProductos; i++) {
    const nombre = `${elegir(perfil.bases)} ${elegir(perfil.adjetivos)} ${faker.string.alpha({ length: 2, casing: "upper" })}${i}`.slice(0, 200);
    const precioBase = dinero(entre(perfil.precio[0], perfil.precio[1]) - (prob(0.6) ? 0.1 : 0));
    const productoId = uuid();

    // Opciones de este producto: subconjunto de valores de cada opción del perfil.
    const opciones = prob(perfil.sinVariantes) ? [] : perfil.opciones.map(o => ({
      nombre: o.nombre,
      tipo: o.tipo,
      valores: muestra(o.valores, entre(...o.elegir))
    }));
    // Respeta el orden original de los valores (tallas S, M, L) al mostrarlos.
    for (const o of opciones) {
      const original = perfil.opciones.find(po => po.nombre === o.nombre).valores;
      o.valores.sort((a, b) => original.indexOf(a) - original.indexOf(b));
    }

    let stockTotal = 0;
    if (opciones.length) {
      for (const atributos of combinaciones(opciones).slice(0, MAX_VARIANTES)) {
        const stock = prob(0.12) ? 0 : entre(1, 40);
        stockTotal += stock;
        variantes.push({
          id: uuid(),
          productoId,
          nombre: nombreVariante(opciones, atributos),
          sku: null,
          precio: null,
          stock,
          atributos,
          activo: true,
          ...auditoria(fechaAlta)
        });
      }
    } else {
      stockTotal = prob(0.1) ? 0 : entre(1, 80);
    }

    const conOferta = prob(0.25);
    const colores = opciones.find(o => o.tipo === "color")?.valores ?? [];
    productos.push({
      id: productoId,
      tiendaId,
      categoriaId: elegir(categorias).id,
      nombre,
      slug: `${slugify(nombre)}-${i}`.slice(0, 200),
      descripcion: `${nombre}. ${faker.lorem.sentences(2)}`,
      descripcionCorta: `${nombre} de calidad, ideal para el día a día.`.slice(0, 500),
      sku: `${clavePerfil.slice(0, 3).toUpperCase()}-${String(i).padStart(4, "0")}`,
      precioBase,
      precioOferta: conOferta ? dinero(precioBase * (1 - entre(10, 30) / 100)) : null,
      precioCosto: dinero(precioBase * entre(45, 70) / 100),
      stock: stockTotal,
      stockAlerta: 5,
      unidad: "pieza",
      activo: prob(0.95),
      destacado: prob(0.15),
      esServicio: false,
      etiquetas: muestra(perfil.adjetivos, 2),
      colores,
      // Sin opciones se omite: Prisma no acepta null literal en una columna Json.
      ...(opciones.length && { metadata: { opciones: opciones.map(({ nombre: n, tipo, valores }) => ({ nombre: n, tipo, valores })) } }),
      ...auditoria(fechaAlta)
    });

    muestra(perfil.imagenes, entre(1, 3)).forEach((url, orden) => {
      imagenes.push({
        id: uuid(),
        productoId,
        url,
        textoAlternativo: nombre.slice(0, 200),
        orden,
        esPrincipal: orden === 0,
        ...auditoria(fechaAlta)
      });
    });
  }

  // ── Clientes y pedidos históricos ────────────────────────────────────
  const nPedidos = entre(...rangoPedidos);
  const clientes = Array.from({ length: Math.max(1, Math.round(nPedidos * 0.6)) }, () => {
    const lugar = elegir(DISTRITOS);
    return {
      id: uuid(),
      tiendaId,
      whatsappNumero: `9${faker.string.numeric(8)}`,
      nombre: nombrePersona(faker),
      email: prob(0.5) ? faker.internet.email().toLowerCase() : null,
      ubigeo: lugar.ubigeo,
      direccionPredeterminada: `${faker.location.streetAddress()}, ${lugar.distrito}`,
      totalPedidos: 0,
      totalGastado: 0,
      ultimoPedidoFecha: null,
      ...auditoria(fechaAlta)
    };
  });
  // WhatsApp único por tienda (uq_cliente_whatsapp).
  const vistos = new Set();
  for (const c of clientes) {
    while (vistos.has(c.whatsappNumero)) c.whatsappNumero = `9${faker.string.numeric(8)}`;
    vistos.add(c.whatsappNumero);
  }

  const vendibles = productos.filter(p => p.activo);
  const variantesDe = Map.groupBy(variantes, v => v.productoId);
  const fechas = Array.from({ length: nPedidos }, () => ahora.getTime() - entre(0, dias * 24) * HORA_MS).sort((a, b) => a - b);

  const pedidos = [];
  const detalles = [];
  const historial = [];
  const resenas = [];

  fechas.forEach((ts, idx) => {
    const fecha = new Date(ts);
    const cliente = elegir(clientes);
    const estado = ponderado(PESOS_ESTADO);
    const envio = elegir(METODOS_ENVIO);
    const pedidoId = uuid();

    // Detalle: 1-3 productos distintos.
    let subtotal = 0;
    const lineas = muestra(vendibles, entre(1, 3)).map(p => {
      const variante = variantesDe.get(p.id) ? elegir(variantesDe.get(p.id)) : null;
      const precioUnitario = p.precioOferta ?? p.precioBase;
      const cantidad = prob(0.8) ? 1 : entre(2, 3);
      const total = dinero(precioUnitario * cantidad);
      subtotal += total;
      return {
        id: uuid(),
        pedidoId,
        productoId: p.id,
        varianteId: variante?.id ?? null,
        productoNombre: p.nombre,
        varianteNombre: variante?.nombre ?? null,
        cantidad,
        precioUnitario,
        descuento: 0,
        total
      };
    });
    subtotal = dinero(subtotal);
    const costoEnvio = tienda.envioGratisMinimo && subtotal >= tienda.envioGratisMinimo ? 0 : envio.costo;
    const total = dinero(subtotal + costoEnvio);

    // Historial: recorre el flujo hasta el estado final (cancelado corta antes).
    const pasos = estado === "cancelado"
      ? [...FLUJO_ESTADOS.slice(0, entre(1, 2)), "cancelado"]
      : FLUJO_ESTADOS.slice(0, FLUJO_ESTADOS.indexOf(estado) + 1);
    let t = ts;
    const fechaDe = {};
    for (const paso of pasos) {
      fechaDe[paso] = hasta(t);
      historial.push({ id: uuid(), pedidoId, estado: paso, notas: null, fechaRegistro: hasta(t) });
      t += entre(2, 30) * HORA_MS;
    }

    const pagado = ["entregado", "enviado"].includes(estado) || (["confirmado", "en_proceso"].includes(estado) && prob(0.7));
    const lugar = elegir(DISTRITOS);
    pedidos.push({
      id: pedidoId,
      tiendaId,
      clienteId: cliente.id,
      clienteNombre: cliente.nombre,
      clienteWhatsapp: cliente.whatsappNumero,
      clienteEmail: cliente.email,
      numeroPedido: `PED-${String(idx + 1).padStart(4, "0")}`,
      estado,
      subtotal,
      descuentoMonto: 0,
      costoEnvio,
      total,
      metodoPago: elegir(METODOS_PAGO),
      estadoPago: pagado ? "pagado" : (estado === "cancelado" && prob(0.2) ? "reembolsado" : "pendiente"),
      metodoEnvio: envio.nombre,
      direccionEnvio: envio.costo ? cliente.direccionPredeterminada : null,
      departamento: envio.costo ? "Lima" : null,
      provincia: envio.costo ? "Lima" : null,
      distrito: envio.costo ? lugar.distrito : null,
      ubigeoCode: envio.costo ? lugar.ubigeo : null,
      comprobante: "boleta",
      origen: "web",
      tipo: "compra",
      montoPagado: pagado ? total : 0,
      fechaConfirmado: fechaDe.confirmado ?? null,
      fechaEntregado: fechaDe.entregado ?? null,
      ...auditoria(fecha)
    });
    detalles.push(...lineas);

    if (estado !== "cancelado") {
      cliente.totalPedidos += 1;
      cliente.totalGastado = dinero(cliente.totalGastado + total);
      if (!cliente.ultimoPedidoFecha || fecha > cliente.ultimoPedidoFecha) cliente.ultimoPedidoFecha = fecha;
    }

    // Reseñas: solo de pedidos entregados (compra verificada), una por producto.
    if (estado === "entregado") {
      for (const linea of lineas) {
        if (!prob(0.35)) continue;
        const estrellas = ponderado([[5, 55], [4, 28], [3, 10], [2, 4], [1, 3]]);
        resenas.push({
          id: uuid(),
          tiendaId,
          productoId: linea.productoId,
          pedidoId,
          estrellas,
          comentario: prob(0.8) ? elegir(COMENTARIOS_RESENA[estrellas]) : null,
          nombreMostrado: formatearNombreMostrado(cliente.nombre),
          estado: ponderado([["aprobada", 85], ["pendiente", 10], ["rechazada", 5]]),
          ...auditoria(hasta(fechaDe.entregado.getTime() + entre(1, 10) * DIA_MS))
        });
      }
    }
  });

  // Resumen de rating desnormalizado (solo reseñas aprobadas), como resenas.service.
  const aprobadas = Map.groupBy(resenas.filter(r => r.estado === "aprobada"), r => r.productoId);
  for (const p of productos) {
    const lista = aprobadas.get(p.id) ?? [];
    const suma = lista.reduce((s, r) => s + r.estrellas, 0);
    p.ratingCantidad = lista.length;
    p.ratingPromedio = lista.length ? Math.round((suma / lista.length) * 100) / 100 : 0;
    p.ratingScore = calcularRatingScore(suma, lista.length);
  }

  return { tienda, categorias, productos, variantes, imagenes, clientes, pedidos, detalles, historial, resenas };
}

/**
 * "40-50" → [40, 50]; "45" → [45, 45].
 * @param {string} texto
 * @param {string} nombre - Para el mensaje de error.
 * @returns {[number, number]}
 */
export function parsearRango(texto, nombre) {
  const m = String(texto).trim().match(/^(\d+)(?:-(\d+))?$/);
  if (!m) throw new Error(`--${nombre} inválido: usa N o MIN-MAX (ej. 40-50)`);
  const min = Number(m[1]);
  const max = Number(m[2] ?? m[1]);
  if (min > max) throw new Error(`--${nombre}: el mínimo no puede ser mayor que el máximo`);
  return [min, max];
}
