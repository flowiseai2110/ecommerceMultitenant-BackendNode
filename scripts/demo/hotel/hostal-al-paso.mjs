// Hostal al paso de demo (docs/specs/recepcion): crea la tienda para un usuario
// que ya existe, carga sus tipos de habitación (por horas y por noche), activa
// la vitrina "Disponibilidad ahora", crea las habitaciones físicas de Recepción
// y precarga los métodos de pago.
//
// Uso (desde la raíz del backend, con recepcion_fase_1..4.sql ya corridos):
//   node scripts/demo/hotel/hostal-al-paso.mjs --owner tu@correo.com
//   node scripts/demo/hotel/hostal-al-paso.mjs --owner tu@correo.com --slug hostal-las-palmeras --whatsapp 987654321
//
// Se puede correr varias veces: si la tienda ya existe, la completa sin duplicar.

import "dotenv/config";
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import { prisma } from "../../../config/prisma.js";
import { getIdRolByCodigo } from "../../../services/roles.service.js";
import { seedMetodosPagoParaTienda } from "../../../services/metodos-pago-seed.service.js";
import { generarHabitaciones } from "../../../modules/reservas/hotel/recepcion.service.js";

const { values: args } = parseArgs({
  options: {
    owner: { type: "string" },
    slug: { type: "string", default: "hostal-las-palmeras" },
    nombre: { type: "string", default: "Hostal Las Palmeras" },
    whatsapp: { type: "string", default: "" },
    datos: { type: "string", default: "scripts/demo/hotel/hostal-las-palmeras.json" }
  }
});

const USUARIO = "demo-hostal-al-paso";

async function main() {
  if (!args.owner) throw new Error("Falta --owner con el correo de tu usuario del admin");
  const email = args.owner.trim().toLowerCase();
  const [owner] = await prisma.$queryRaw`SELECT id::text AS id FROM auth.users WHERE lower(email) = ${email} LIMIT 1`;
  if (!owner) throw new Error(`No existe un usuario con el correo ${email}. Usa el correo con el que entras al admin.`);

  // 1) Tienda y dueño
  let tienda = await prisma.tiendas.findUnique({ where: { slug: args.slug }, select: { id: true, nombre: true, tipoNegocio: true } });
  if (tienda && tienda.tipoNegocio !== "hotel") throw new Error(`La tienda "${args.slug}" existe y no es de hotel`);
  if (!tienda) {
    tienda = await prisma.tiendas.create({
      data: {
        nombre: args.nombre, slug: args.slug, tipoNegocio: "hotel", activo: true,
        descripcion: "Hostal en Lima: habitaciones por horas y por noche, limpias y con agua caliente. Atendemos las 24 horas.",
        ...(args.whatsapp ? { whatsappNumero: args.whatsapp } : {}),
        fechaRegistro: new Date(), usuarioRegistro: USUARIO
      },
      select: { id: true, nombre: true, tipoNegocio: true }
    });
    console.log(`Tienda creada: ${tienda.nombre} (${args.slug})`);
  } else {
    console.log(`La tienda ${tienda.nombre} ya existía: se completa`);
  }
  const rolOwner = await getIdRolByCodigo("owner");
  await prisma.usuario_tiendas.upsert({
    where: { uq_usuario_tienda: { userId: owner.id, tiendaId: tienda.id } },
    create: { userId: owner.id, tiendaId: tienda.id, rol: rolOwner, activo: true, usuarioRegistro: USUARIO },
    update: { activo: true }
  });
  if (!(await prisma.metodos_pago.count({ where: { tiendaId: tienda.id } }))) {
    const n = await seedMetodosPagoParaTienda(tienda.id, { excluirTipos: ["contra_entrega"] });
    console.log(`Métodos de pago precargados: ${n}`);
  }

  // 2) Reservas: hostal al paso, DNI solo por noche, vitrina "Disponibilidad ahora"
  const config = {
    tipoAlojamiento: "hostal", vitrinaAlPaso: true, recepcionDocumento: "noche",
    horaCheckin: "12:00", horaCheckout: "12:00", modoConfirmacion: "solicitud", cobro: "en_destino",
    resenasExternas: [{ fuente: "google", puntaje: 4.0, cantidad: 74, url: `https://www.google.com/maps/search/${encodeURIComponent(args.nombre)}` }]
  };
  await prisma.config_reservas.upsert({
    where: { tiendaId: tienda.id },
    create: { tiendaId: tienda.id, ...config, usuarioRegistro: USUARIO },
    update: config
  });
  console.log("Configuración de reservas: hostal al paso");

  // 3) Tipos de habitación (mismo script que el resto de demos)
  const seed = spawnSync(process.execPath, ["scripts/seed-habitaciones.mjs", "--tienda", args.slug, "--datos", args.datos], { stdio: "inherit" });
  if (seed.status !== 0) throw new Error("No se pudieron cargar los tipos de habitación");

  // 4) Habitaciones físicas de Recepción (1, 2, 3…)
  if (!(await prisma.hotel_habitaciones.count({ where: { tiendaId: tienda.id } }))) {
    const hs = await generarHabitaciones(tienda.id, { email: USUARIO });
    console.log(`Recepción: ${hs.length} habitaciones creadas`);
  }

  console.log(`\nListo. En el admin elige la tienda "${tienda.nombre}" y entra a Recepción.`);
  console.log(`Vitrina: /${args.slug} (portada) y /${args.slug}/ahora`);
  if (!args.whatsapp) console.log("Sin WhatsApp: ponlo en Mi Tienda para que aparezcan los botones de la vitrina.");
}

main()
  .catch((err) => {
    console.error("Error:", err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
