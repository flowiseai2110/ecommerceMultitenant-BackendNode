// Seed de carga: genera tiendas sintéticas (catálogo, pedidos, chat IA y
// reseñas) y MIDE cuánto ocupa cada cosa en la base de datos. Sirve para:
//   1. Saber cuántos KB reales cuesta un producto, un pedido, un mensaje de
//      chat y una reseña, y proyectar cuántas tiendas caben en el plan de
//      Supabase (500 MB Free / 8 GB Pro).
//   2. Tener datos realistas para las pruebas de carga con k6.
//
// SOLO para un proyecto de PRUEBA. Nunca contra la base de producción.
//
// Uso:
//   node scripts/seed-carga.mjs --confirmar <destino> [opciones]
//   node scripts/seed-carga.mjs --confirmar <destino> --limpiar
//   node scripts/seed-carga.mjs --confirmar <destino> --solo-medir
//
// <destino> es el project ref de Supabase que sale en DATABASE_URL
// (postgres.<ref>@... o db.<ref>.supabase.co). Ejecuta el script sin
// --confirmar y te dirá cuál es: así nunca se apunta a una base por error.
//
// Opciones (por defecto entre paréntesis):
//   --tiendas N        tiendas a crear (5)
//   --productos A-B    productos por tienda, rango (40-50)
//   --pedidos N        pedidos por tienda (300)
//   --mensajes N       mensajes de chat IA por tienda (1000)
//   --resenas F        fracción de pedidos entregados con reseña (0.3)
//   --meses N          meses de historial sobre los que se reparten las fechas (6)
//   --imagenes URLS    URLs de imagen separadas por coma, para producto_imagenes
//                      (por defecto SEED_IMAGENES del .env o un placeholder)
//   --base-mb N        tamaño actual de la base de PRODUCCIÓN en MB, para que la
//                      proyección parta de él (por defecto, el tamaño de esta
//                      base antes de sembrar)
//
// Protecciones:
//   - Exige --confirmar con el destino exacto de DATABASE_URL.
//   - Se niega si NODE_ENV=production o si el destino está en PROD_DB_REFS
//     (lista separada por comas en el .env; pon ahí el ref de producción).
//   - Todo lo creado lleva slug "carga-..." y usuario_registro "seed-carga";
//     --limpiar borra solo eso.

import "dotenv/config";
import { randomUUID } from "node:crypto";

const USUARIO_SEED = "seed-carga";
const PREFIJO_SLUG = "carga-";
const LOTE = 1000;

// Perfiles de actividad mensual por tienda para la proyección final.
const PERFILES = [
  { nombre: "Pequeña", pedidos: 30, mensajes: 100, resenas: 5 },
  { nombre: "Media", pedidos: 100, mensajes: 600, resenas: 20 },
  { nombre: "Alta", pedidos: 300, mensajes: 1500, resenas: 60 }
];

const PLANES = [
  { nombre: "Supabase Free", bytes: 500 * 1024 ** 2 },
  { nombre: "Supabase Pro", bytes: 8 * 1024 ** 3 }
];

// Margen de seguridad: no planificar con la base al 100 %.
const USO_MAXIMO = 0.8;

// Tablas que mide cada fase.
const GRUPOS = {
  catalogo: ["tiendas", "categorias", "productos", "producto_variantes", "producto_imagenes", "metodos_pago", "metodos_envio"],
  pedidos: ["clientes", "pedidos", "pedido_detalles", "pedido_historial_estados"],
  chat: ["agente_conversaciones", "agente_mensajes"],
  resenas: ["resenas"]
};

// ── Argumentos ───────────────────────────────────────────────────────────────

function leerArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const clave = a.slice(2);
    const siguiente = argv[i + 1];
    if (siguiente === undefined || siguiente.startsWith("--")) {
      args[clave] = true;
    } else {
      args[clave] = siguiente;
      i++;
    }
  }
  return args;
}

function entero(valor, porDefecto, nombre) {
  if (valor === undefined) return porDefecto;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 0) throw new Error(`--${nombre} debe ser un entero >= 0`);
  return n;
}

function rango(valor, porDefecto) {
  const texto = valor === undefined ? porDefecto : String(valor);
  const [min, max = min] = texto.split("-").map(Number);
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) {
    throw new Error("--productos debe ser N o A-B (ej. 40-50)");
  }
  return { min, max };
}

function leerOpciones(args) {
  const resenas = args.resenas === undefined ? 0.3 : Number(args.resenas);
  if (!(resenas >= 0 && resenas <= 1)) throw new Error("--resenas debe estar entre 0 y 1");

  const imagenes = String(args.imagenes ?? process.env.SEED_IMAGENES ?? "https://placehold.co/800x800.webp")
    .split(",").map((s) => s.trim()).filter(Boolean);

  const baseMb = args["base-mb"] === undefined ? null : Number(args["base-mb"]);
  if (baseMb !== null && !(baseMb >= 0)) throw new Error("--base-mb debe ser un número >= 0");

  return {
    baseBytes: baseMb === null ? null : baseMb * 1024 ** 2,
    tiendas: entero(args.tiendas, 5, "tiendas"),
    productos: rango(args.productos, "40-50"),
    pedidos: entero(args.pedidos, 300, "pedidos"),
    mensajes: entero(args.mensajes, 1000, "mensajes"),
    resenas,
    meses: Math.max(1, entero(args.meses, 6, "meses")),
    imagenes
  };
}

// ── Protección contra producción ─────────────────────────────────────────────

/** Identificador del destino: el project ref de Supabase, o host/base si no es Supabase. */
function destinoDe(databaseUrl) {
  const url = new URL(databaseUrl);
  const usuario = decodeURIComponent(url.username);
  const refPooler = usuario.match(/^postgres\.([a-z0-9]+)$/i)?.[1];
  const refDirecto = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)?.[1];
  return refPooler || refDirecto || `${url.hostname}:${url.port || 5432}${url.pathname}`;
}

function verificarDestino(args) {
  if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL en el entorno (.env).");
  if (process.env.NODE_ENV === "production") {
    throw new Error("NODE_ENV=production: este script no corre en producción.");
  }

  const destino = destinoDe(process.env.DATABASE_URL);
  const prohibidos = (process.env.PROD_DB_REFS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (prohibidos.includes(destino)) {
    throw new Error(`El destino "${destino}" está en PROD_DB_REFS: es producción. Abortado.`);
  }
  if (args.confirmar !== destino) {
    throw new Error(
      `DATABASE_URL apunta a "${destino}".\n` +
      `Si es tu proyecto de PRUEBA, vuelve a ejecutar con: --confirmar ${destino}`
    );
  }
  return destino;
}

// ── Datos aleatorios ─────────────────────────────────────────────────────────

const azar = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const elegir = (lista) => lista[Math.floor(Math.random() * lista.length)];
const sufijo = () => Math.random().toString(36).slice(2, 6);

function elegirPonderado(opciones) {
  const total = opciones.reduce((s, o) => s + o.peso, 0);
  let r = Math.random() * total;
  for (const o of opciones) {
    r -= o.peso;
    if (r <= 0) return o.valor;
  }
  return opciones[opciones.length - 1].valor;
}

const PALABRAS = (
  "calidad diseño cómodo resistente suave algodón transpirable ligero moderno clásico " +
  "elegante ideal uso diario temporada colección material premium acabado costura " +
  "talla color estilo envío garantía cuidado lavado tejido fresco durable original"
).split(" ");

function texto(min, max) {
  const largo = azar(min, max);
  let t = "";
  while (t.length < largo) t += (t ? " " : "") + elegir(PALABRAS);
  t = t.slice(0, largo);
  return t.charAt(0).toUpperCase() + t.slice(1) + ".";
}

const RUBROS = {
  medias: { categorias: ["Tobilleras", "Deportivas", "Ejecutivas", "Térmicas", "Infantiles", "Packs"], producto: "Medias", tallas: ["S", "M", "L"] },
  zapatillas: { categorias: ["Running", "Urbanas", "Trekking", "Básquet", "Niños", "Ofertas"], producto: "Zapatillas", tallas: ["38", "39", "40", "41", "42", "43"] },
  ropa: { categorias: ["Polos", "Pantalones", "Casacas", "Vestidos", "Shorts", "Accesorios"], producto: "Prenda", tallas: ["XS", "S", "M", "L", "XL"] },
  cosmetica: { categorias: ["Rostro", "Cabello", "Cuerpo", "Maquillaje", "Kits"], producto: "Crema", tallas: ["50 ml", "100 ml", "200 ml"] }
};

const COLORES = ["negro", "blanco", "azul", "rojo", "gris", "verde", "beige"];
const NOMBRES = ["María", "José", "Lucía", "Carlos", "Ana", "Luis", "Rosa", "Jorge", "Carmen", "Diego", "Sofía", "Miguel"];
const APELLIDOS = ["Quispe", "Flores", "García", "Rojas", "Mamani", "Torres", "Chávez", "Vargas", "Ramos", "Castillo"];
const DISTRITOS = [
  ["Lima", "Lima", "Miraflores"], ["Lima", "Lima", "San Juan de Lurigancho"], ["Lima", "Lima", "Surco"],
  ["Arequipa", "Arequipa", "Cayma"], ["La Libertad", "Trujillo", "Trujillo"], ["Cusco", "Cusco", "Wanchaq"]
];

const ESTADOS_FINALES = [
  { valor: "entregado", peso: 60 }, { valor: "enviado", peso: 8 }, { valor: "en_proceso", peso: 7 },
  { valor: "confirmado", peso: 8 }, { valor: "pendiente", peso: 7 }, { valor: "cancelado", peso: 10 }
];
const FLUJO = ["pendiente", "confirmado", "en_proceso", "enviado", "entregado"];

const PREGUNTAS = [
  "Hola, ¿tienen talla", "¿Cuánto cuesta el envío a", "¿Hacen delivery a", "¿Qué colores hay de",
  "Quiero saber si llega hoy a", "¿Aceptan Yape para", "¿Tienen stock de", "¿Cuál me recomiendas para"
];

function fechaEnHistorial(meses) {
  const ahora = Date.now();
  return new Date(ahora - Math.random() * meses * 30 * 24 * 3600 * 1000);
}

const masMinutos = (fecha, min) => new Date(fecha.getTime() + min * 60 * 1000);

// ── Generadores por tienda ───────────────────────────────────────────────────

function generarCatalogo(tiendaId, rubro, opciones) {
  const def = RUBROS[rubro];
  const categorias = def.categorias.map((nombre, i) => ({
    id: randomUUID(),
    tiendaId,
    nombre,
    slug: nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-"),
    orden: i,
    usuarioRegistro: USUARIO_SEED
  }));

  const productos = [];
  const variantes = [];
  const imagenes = [];
  const total = azar(opciones.productos.min, opciones.productos.max);

  for (let i = 1; i <= total; i++) {
    const id = randomUUID();
    const precio = azar(15, 400);
    const nombre = `${def.producto} ${elegir(PALABRAS)} ${elegir(COLORES)} ${i}`;
    productos.push({
      id,
      tiendaId,
      categoriaId: elegir(categorias).id,
      nombre,
      slug: `${nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-")}-${sufijo()}`,
      descripcion: texto(300, 900),
      descripcionCorta: texto(60, 160),
      sku: `SKU-${i.toString().padStart(4, "0")}`,
      precioBase: precio,
      precioOferta: Math.random() < 0.3 ? Math.round(precio * 0.85) : null,
      precioCosto: Math.round(precio * 0.55),
      stock: azar(0, 120),
      destacado: Math.random() < 0.15,
      etiquetas: [elegir(PALABRAS), elegir(PALABRAS)],
      colores: [elegir(COLORES), elegir(COLORES)],
      usuarioRegistro: USUARIO_SEED
    });

    const tallas = def.tallas.slice(0, azar(2, def.tallas.length));
    for (const talla of tallas) {
      variantes.push({
        id: randomUUID(),
        productoId: id,
        nombre: talla,
        sku: `SKU-${i.toString().padStart(4, "0")}-${talla.replace(/\s+/g, "")}`,
        stock: azar(0, 40),
        atributos: { talla },
        usuarioRegistro: USUARIO_SEED
      });
    }

    const cantidadImagenes = azar(2, 4);
    for (let o = 0; o < cantidadImagenes; o++) {
      imagenes.push({
        id: randomUUID(),
        productoId: id,
        url: opciones.imagenes[(i + o) % opciones.imagenes.length],
        textoAlternativo: nombre,
        orden: o,
        esPrincipal: o === 0,
        usuarioRegistro: USUARIO_SEED
      });
    }
  }

  return { categorias, productos, variantes, imagenes };
}

function generarPedidos(tiendaId, catalogo, opciones) {
  const variantesPorProducto = new Map();
  for (const v of catalogo.variantes) {
    if (!variantesPorProducto.has(v.productoId)) variantesPorProducto.set(v.productoId, []);
    variantesPorProducto.get(v.productoId).push(v);
  }

  // Clientes recurrentes: ~60 % de pedidos con cliente distinto.
  const cantidadClientes = Math.max(1, Math.ceil(opciones.pedidos * 0.6));
  const clientes = Array.from({ length: cantidadClientes }, (_, i) => {
    const [departamento, provincia, distrito] = elegir(DISTRITOS);
    return {
      id: randomUUID(),
      tiendaId,
      whatsappNumero: `9${(10000000 + i).toString()}`,
      nombre: `${elegir(NOMBRES)} ${elegir(APELLIDOS)}`,
      email: Math.random() < 0.6 ? `cliente${i}@ejemplo.com` : null,
      direccionPredeterminada: `Av. ${elegir(APELLIDOS)} ${azar(100, 2500)}, ${distrito}, ${provincia}, ${departamento}`,
      totalPedidos: 0,
      totalGastado: 0,
      ultimoPedidoFecha: null,
      usuarioRegistro: USUARIO_SEED
    };
  });

  const pedidos = [];
  const detalles = [];
  const historial = [];

  for (let n = 1; n <= opciones.pedidos; n++) {
    const id = randomUUID();
    const cliente = elegir(clientes);
    const fecha = fechaEnHistorial(opciones.meses);
    const estado = elegirPonderado(ESTADOS_FINALES);
    const [departamento, provincia, distrito] = elegir(DISTRITOS);

    let subtotal = 0;
    const items = azar(1, 3);
    for (let k = 0; k < items; k++) {
      const producto = elegir(catalogo.productos);
      const variante = elegir(variantesPorProducto.get(producto.id) ?? [null]);
      const cantidad = azar(1, 3);
      const precio = producto.precioOferta ?? producto.precioBase;
      subtotal += precio * cantidad;
      detalles.push({
        id: randomUUID(),
        pedidoId: id,
        productoId: producto.id,
        varianteId: variante?.id ?? null,
        productoNombre: producto.nombre,
        varianteNombre: variante?.nombre ?? null,
        cantidad,
        precioUnitario: precio,
        total: precio * cantidad
      });
    }

    const costoEnvio = elegir([0, 8, 10, 15]);
    const total = subtotal + costoEnvio;
    pedidos.push({
      id,
      tiendaId,
      clienteId: cliente.id,
      clienteNombre: cliente.nombre,
      clienteWhatsapp: cliente.whatsappNumero,
      clienteEmail: cliente.email,
      numeroPedido: `CG-${n.toString().padStart(6, "0")}`,
      estado,
      subtotal,
      costoEnvio,
      total,
      metodoPago: elegir(["Yape", "Plin", "Transferencia", "Contra entrega"]),
      estadoPago: estado === "entregado" || estado === "enviado" ? "pagado" : "pendiente",
      metodoEnvio: elegir(["Delivery", "Agencia", "Recojo en tienda"]),
      direccionEnvio: cliente.direccionPredeterminada,
      departamento,
      provincia,
      distrito,
      referencia: Math.random() < 0.5 ? texto(20, 80) : null,
      notas: Math.random() < 0.2 ? texto(20, 120) : null,
      fechaConfirmado: estado !== "pendiente" && estado !== "cancelado" ? masMinutos(fecha, 30) : null,
      fechaEntregado: estado === "entregado" ? masMinutos(fecha, 60 * 48) : null,
      fechaRegistro: fecha,
      usuarioRegistro: USUARIO_SEED
    });

    // Historial: el recorrido del flujo hasta el estado final.
    const pasos = estado === "cancelado" ? ["pendiente", "cancelado"] : FLUJO.slice(0, FLUJO.indexOf(estado) + 1);
    pasos.forEach((paso, i) => {
      historial.push({
        id: randomUUID(),
        pedidoId: id,
        estado: paso,
        notas: i === 0 ? "Pedido creado" : null,
        fechaRegistro: masMinutos(fecha, i * 60 * 12)
      });
    });

    cliente.totalPedidos += 1;
    cliente.totalGastado += total;
    if (!cliente.ultimoPedidoFecha || fecha > cliente.ultimoPedidoFecha) cliente.ultimoPedidoFecha = fecha;
  }

  return { clientes, pedidos, detalles, historial };
}

function generarChat(tiendaId, catalogo, opciones) {
  const conversaciones = [];
  const mensajes = [];
  let restantes = opciones.mensajes;

  while (restantes > 0) {
    const id = randomUUID();
    const turnos = Math.min(Math.ceil(restantes / 2), azar(1, 6));
    const inicio = fechaEnHistorial(opciones.meses);
    let fecha = inicio;

    for (let t = 0; t < turnos && restantes > 0; t++) {
      const producto = elegir(catalogo.productos);
      mensajes.push({
        id: randomUUID(), tiendaId, conversacionId: id, rol: "user",
        contenido: `${elegir(PREGUNTAS)} ${producto.nombre}? ${texto(0, 80)}`,
        fechaRegistro: fecha
      });
      restantes--;
      if (restantes === 0) break;
      fecha = masMinutos(fecha, 1);
      mensajes.push({
        id: randomUUID(), tiendaId, conversacionId: id, rol: "assistant",
        contenido: texto(200, 900),
        fechaRegistro: fecha
      });
      restantes--;
      fecha = masMinutos(fecha, 2);
    }

    conversaciones.push({
      id,
      tiendaId,
      sessionToken: randomUUID().replace(/-/g, ""),
      estado: Math.random() < 0.8 ? "cerrada" : "activa",
      turnos,
      ultimaActividad: fecha,
      fechaRegistro: inicio,
      usuarioRegistro: USUARIO_SEED
    });
  }

  return { conversaciones, mensajes };
}

function generarResenas(tiendaId, pedidosGen, opciones) {
  const detallesPorPedido = new Map();
  for (const d of pedidosGen.detalles) {
    if (!detallesPorPedido.has(d.pedidoId)) detallesPorPedido.set(d.pedidoId, []);
    detallesPorPedido.get(d.pedidoId).push(d);
  }

  const resenas = [];
  for (const p of pedidosGen.pedidos) {
    if (p.estado !== "entregado" || Math.random() >= opciones.resenas) continue;
    const detalle = elegir(detallesPorPedido.get(p.id));
    resenas.push({
      id: randomUUID(),
      tiendaId,
      productoId: detalle.productoId,
      pedidoId: p.id,
      estrellas: elegirPonderado([{ valor: 5, peso: 55 }, { valor: 4, peso: 25 }, { valor: 3, peso: 12 }, { valor: 2, peso: 5 }, { valor: 1, peso: 3 }]),
      comentario: Math.random() < 0.8 ? texto(20, 300) : null,
      nombreMostrado: p.clienteNombre ?? "Cliente",
      estado: elegir(["aprobada", "aprobada", "aprobada", "pendiente"]),
      respuestaTienda: Math.random() < 0.3 ? texto(30, 200) : null,
      fechaRegistro: masMinutos(p.fechaEntregado ?? p.fechaRegistro, 60 * 24 * 3),
      usuarioRegistro: USUARIO_SEED
    });
  }
  return resenas;
}

// ── Escritura y medición ─────────────────────────────────────────────────────

async function insertar(prisma, modelo, filas) {
  for (let i = 0; i < filas.length; i += LOTE) {
    await prisma[modelo].createMany({ data: filas.slice(i, i + LOTE) });
  }
}

async function medirTablas(prisma) {
  const filas = await prisma.$queryRaw`
    SELECT relname AS tabla, pg_total_relation_size(relid)::bigint AS bytes
    FROM pg_catalog.pg_statio_user_tables
    WHERE schemaname = 'public'`;
  const tamanos = Object.fromEntries(filas.map((f) => [f.tabla, Number(f.bytes)]));
  const [{ bytes }] = await prisma.$queryRaw`SELECT pg_database_size(current_database())::bigint AS bytes`;
  return { tablas: tamanos, total: Number(bytes) };
}

function deltaGrupo(antes, despues, grupo) {
  return GRUPOS[grupo].reduce((s, t) => s + ((despues.tablas[t] ?? 0) - (antes.tablas[t] ?? 0)), 0);
}

const mb = (b) => `${(b / 1024 ** 2).toFixed(2)} MB`;
const kb = (b) => `${(b / 1024).toFixed(2)} KB`;

function imprimirTablaTamanos(medicion) {
  const relevantes = Object.values(GRUPOS).flat();
  console.log("\nTamaño por tabla (incluye índices y TOAST):");
  for (const t of relevantes) {
    console.log(`  ${t.padEnd(26)} ${mb(medicion.tablas[t] ?? 0).padStart(12)}`);
  }
  console.log(`  ${"BASE DE DATOS TOTAL".padEnd(26)} ${mb(medicion.total).padStart(12)}`);
}

function imprimirProyeccion(costos, totalActual) {
  console.log(`\nProyección de capacidad partiendo de una base de ${mb(totalActual)} ` +
    `(con el ${USO_MAXIMO * 100} % del plan como techo):`);
  for (const plan of PLANES) {
    const disponible = plan.bytes * USO_MAXIMO - totalActual;
    console.log(`\n  ${plan.nombre} — disponible para tiendas nuevas: ${mb(Math.max(0, disponible))}`);
    console.log("    Perfil      MB/mes por tienda   Tiendas (12 meses)   Tiendas (24 meses)");
    for (const p of PERFILES) {
      const mensual = p.pedidos * costos.pedido + p.mensajes * costos.mensaje + p.resenas * costos.resena;
      const cabe = (meses) => Math.max(0, Math.floor(disponible / (costos.catalogo + mensual * meses)));
      console.log(
        `    ${p.nombre.padEnd(11)} ${mb(mensual).padStart(17)} ${String(cabe(12)).padStart(20)} ${String(cabe(24)).padStart(20)}`
      );
    }
  }
  console.log("\n  Perfiles (por tienda y mes): " +
    PERFILES.map((p) => `${p.nombre} = ${p.pedidos} pedidos, ${p.mensajes} mensajes, ${p.resenas} reseñas`).join("; "));
}

// ── Comandos ─────────────────────────────────────────────────────────────────

async function sembrar(prisma, opciones, servicios) {
  console.log(`Generando ${opciones.tiendas} tiendas: ${opciones.productos.min}-${opciones.productos.max} productos, ` +
    `${opciones.pedidos} pedidos, ${opciones.mensajes} mensajes de chat y ~${opciones.resenas * 100} % de reseñas ` +
    `en entregados, repartidos en ${opciones.meses} meses.`);

  const inicio = await medirTablas(prisma);
  const rubros = Object.keys(RUBROS);
  const tiendas = Array.from({ length: opciones.tiendas }, (_, i) => {
    const rubro = rubros[i % rubros.length];
    return {
      id: randomUUID(),
      rubro,
      fila: {
        nombre: `Carga ${rubro} ${i + 1}`,
        slug: `${PREFIJO_SLUG}${rubro}-${i + 1}-${sufijo()}`,
        descripcion: texto(80, 200),
        whatsappNumero: "999999999",
        email: `carga${i + 1}@ejemplo.com`,
        rubro,
        activo: true,
        usuarioRegistro: USUARIO_SEED
      }
    };
  });

  // Fase 1: catálogo
  const catalogos = new Map();
  let totalProductos = 0;
  for (const t of tiendas) {
    await prisma.tiendas.create({ data: { id: t.id, ...t.fila } });
    await servicios.seedMetodosPagoParaTienda(t.id);
    await servicios.seedMetodosEnvioParaTienda(t.id);
    const c = generarCatalogo(t.id, t.rubro, opciones);
    await insertar(prisma, "categorias", c.categorias);
    await insertar(prisma, "productos", c.productos);
    await insertar(prisma, "producto_variantes", c.variantes);
    await insertar(prisma, "producto_imagenes", c.imagenes);
    catalogos.set(t.id, c);
    totalProductos += c.productos.length;
  }
  const trasCatalogo = await medirTablas(prisma);
  console.log(`  ✔ catálogo: ${totalProductos} productos`);

  // Fase 2: pedidos
  const pedidosPorTienda = new Map();
  let totalPedidos = 0;
  for (const t of tiendas) {
    const p = generarPedidos(t.id, catalogos.get(t.id), opciones);
    await insertar(prisma, "clientes", p.clientes);
    await insertar(prisma, "pedidos", p.pedidos);
    await insertar(prisma, "pedido_detalles", p.detalles);
    await insertar(prisma, "pedido_historial_estados", p.historial);
    pedidosPorTienda.set(t.id, p);
    totalPedidos += p.pedidos.length;
  }
  const trasPedidos = await medirTablas(prisma);
  console.log(`  ✔ pedidos: ${totalPedidos}`);

  // Fase 3: chat IA
  let totalMensajes = 0;
  for (const t of tiendas) {
    const c = generarChat(t.id, catalogos.get(t.id), opciones);
    await insertar(prisma, "agente_conversaciones", c.conversaciones);
    await insertar(prisma, "agente_mensajes", c.mensajes);
    totalMensajes += c.mensajes.length;
  }
  const trasChat = await medirTablas(prisma);
  console.log(`  ✔ chat IA: ${totalMensajes} mensajes`);

  // Fase 4: reseñas
  let totalResenas = 0;
  for (const t of tiendas) {
    const r = generarResenas(t.id, pedidosPorTienda.get(t.id), opciones);
    await insertar(prisma, "resenas", r);
    totalResenas += r.length;
  }
  const fin = await medirTablas(prisma);
  console.log(`  ✔ reseñas: ${totalResenas}`);

  const bytesCatalogo = deltaGrupo(inicio, trasCatalogo, "catalogo");
  const bytesPedidos = deltaGrupo(trasCatalogo, trasPedidos, "pedidos");
  const bytesChat = deltaGrupo(trasPedidos, trasChat, "chat");
  const bytesResenas = deltaGrupo(trasChat, fin, "resenas");

  const costos = {
    catalogo: opciones.tiendas ? bytesCatalogo / opciones.tiendas : 0,
    pedido: totalPedidos ? bytesPedidos / totalPedidos : 0,
    mensaje: totalMensajes ? bytesChat / totalMensajes : 0,
    resena: totalResenas ? bytesResenas / totalResenas : 0
  };

  console.log("\nCosto medido en disco (incluye índices):");
  console.log(`  Catálogo por tienda (${Math.round(totalProductos / Math.max(1, opciones.tiendas))} productos): ${mb(costos.catalogo)}`);
  console.log(`  Por producto:        ${kb(totalProductos ? bytesCatalogo / totalProductos : 0)}`);
  console.log(`  Por pedido:          ${kb(costos.pedido)}  (con cliente, detalle e historial)`);
  console.log(`  Por mensaje de chat: ${kb(costos.mensaje)}`);
  console.log(`  Por reseña:          ${kb(costos.resena)}`);
  if (totalPedidos < 300 || totalMensajes < 1000) {
    console.log("  ⚠ Con pocos registros la medición es imprecisa (Postgres reserva páginas de 8 KB): usa más volumen.");
  }

  console.log(`\nBase de datos: ${mb(inicio.total)} → ${mb(fin.total)}`);
  imprimirTablaTamanos(fin);
  imprimirProyeccion(costos, opciones.baseBytes ?? inicio.total);
  console.log(`\nPara borrar estos datos: node scripts/seed-carga.mjs --confirmar <destino> --limpiar`);
}

async function limpiar(prisma) {
  const tiendas = await prisma.tiendas.findMany({
    where: { slug: { startsWith: PREFIJO_SLUG }, usuarioRegistro: USUARIO_SEED },
    select: { id: true, slug: true }
  });
  if (tiendas.length === 0) {
    console.log("No hay tiendas de carga que borrar.");
    return;
  }

  const ids = tiendas.map((t) => t.id);
  const where = { tiendaId: { in: ids } };
  // Orden: hijos antes que padres. Detalles, historial, variantes, imágenes y
  // mensajes caen en cascada desde pedidos, productos y conversaciones.
  await prisma.resenas.deleteMany({ where });
  await prisma.agente_conversaciones.deleteMany({ where });
  await prisma.pedidos.deleteMany({ where });
  await prisma.clientes.deleteMany({ where });
  await prisma.productos.deleteMany({ where });
  await prisma.categorias.deleteMany({ where });
  await prisma.metodos_pago.deleteMany({ where });
  await prisma.metodos_envio.deleteMany({ where });
  await prisma.tiendas.deleteMany({ where: { id: { in: ids } } });

  console.log(`Borradas ${tiendas.length} tiendas de carga y todos sus datos.`);
  console.log("El espacio en disco se libera cuando Postgres hace VACUUM (automático).");
}

async function main() {
  const args = leerArgs(process.argv.slice(2));
  const destino = verificarDestino(args);
  const opciones = args.limpiar || args["solo-medir"] ? null : leerOpciones(args);
  console.log(`Destino: ${destino}\n`);

  // Imports dinámicos: config/index.js valida el .env al cargarse, y la
  // verificación del destino debe correr antes de abrir ninguna conexión.
  const { prisma } = await import("../config/prisma.js");
  const { seedMetodosPagoParaTienda } = await import("../services/metodos-pago-seed.service.js");
  const { seedMetodosEnvioParaTienda } = await import("../services/metodos-envio-seed.service.js");

  try {
    if (args.limpiar) {
      await limpiar(prisma);
    } else if (args["solo-medir"]) {
      imprimirTablaTamanos(await medirTablas(prisma));
    } else {
      await sembrar(prisma, opciones, { seedMetodosPagoParaTienda, seedMetodosEnvioParaTienda });
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`\n✖ ${err.message}`);
  process.exitCode = 1;
});
