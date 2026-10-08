// Alta de un cliente nuevo: tienda + dueño ("owner") + catálogos precargados.
//
// POST /api/v1/tiendas solo crea la fila de la tienda — no crea el vínculo
// en usuario_tiendas, y las políticas RLS exigen que ya exista una membresía
// "owner" para poder insertar otras (huevo y gallina). Acá se hacen ambos
// pasos en una sola transacción para no dejar tiendas huérfanas.
//
// Lo usan scripts/onboard-cliente.mjs (CLI) y scripts/onboard-form.mjs
// (formulario local). No se expone en la API pública a propósito.

import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { supabase } from "../config/supabase.js";
import { config } from "../config/index.js";
import { getIdRolByCodigo } from "./roles.service.js";
import { seedMetodosPagoParaTienda } from "./metodos-pago-seed.service.js";
import { seedMetodosEnvioParaTienda } from "./metodos-envio-seed.service.js";
import { TIPOS_NEGOCIO } from "../modules/tenants/tiendas.schema.js";
import { RUBROS } from "../modules/tenants/rubros.js";

const vacioANull = (v) => (typeof v === "string" && v.trim() === "" ? null : v);
const opcional = (max) => z.preprocess(vacioANull, z.string().trim().max(max).nullable().optional());

export const onboardingSchema = z.object({
  owner: z.object({
    email: z.string().trim().toLowerCase().email("Email del dueño inválido"),
    // Solo se usa si el usuario aún no existe en Supabase Auth. Vacío = se le
    // envía una invitación por email para que defina su contraseña.
    password: z.preprocess(vacioANull, z.string().min(8, "La contraseña debe tener al menos 8 caracteres").nullable().optional())
  }),
  tienda: z.object({
    nombre: z.string().trim().min(1, "El nombre es requerido").max(100),
    slug: z.string().trim().toLowerCase()
      .regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/, "Slug inválido: solo minúsculas, números y guiones (será el subdominio)")
      .refine((s) => !config.platform.reservedSubdomains.includes(s), "Ese slug está reservado"),
    whatsappNumero: z.string().trim().regex(/^\+?\d{6,15}$/, "WhatsApp inválido (solo dígitos)"),
    email: opcional(100),
    ruc: z.string().trim().regex(/^\d{11}$/, "El RUC debe tener 11 dígitos"),
    razonSocial: z.string().trim().min(1, "La razón social es requerida").max(200),
    razonComercial: z.string().trim().min(1, "La razón comercial es requerida").max(200),
    direccionFiscal: z.string().trim().min(1, "La dirección fiscal es requerida"),
    tipoNegocio: z.enum(TIPOS_NEGOCIO).default("productos"),
    rubro: z.preprocess(vacioANull, z.enum(RUBROS).nullable().optional()),
    emiteFactura: z.boolean().default(true),
    activo: z.boolean().default(true)
  })
});

export class OnboardingError extends Error {}

/**
 * Busca el usuario en Supabase Auth por email; si no existe lo crea (con
 * contraseña) o lo invita por email (sin contraseña).
 * @returns {Promise<{ userId: string, creado: boolean, invitado: boolean }>}
 */
async function resolverOwner({ email, password }) {
  const [existente] = await prisma.$queryRaw`SELECT id::text AS id FROM auth.users WHERE lower(email) = ${email} LIMIT 1`;
  if (existente) return { userId: existente.id, creado: false, invitado: false };

  if (password) {
    const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new OnboardingError(`No se pudo crear el usuario en Supabase Auth: ${error.message}`);
    return { userId: data.user.id, creado: true, invitado: false };
  }

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo: config.frontendUrl });
  if (error) throw new OnboardingError(`No se pudo invitar al usuario en Supabase Auth: ${error.message}`);
  return { userId: data.user.id, creado: true, invitado: true };
}

/**
 * Registra la tienda y vincula al dueño como "owner" en una transacción.
 * @param {z.input<typeof onboardingSchema>} input
 */
export async function onboardCliente(input) {
  const { owner, tienda: datosTienda } = onboardingSchema.parse(input);

  // usuario_tiendas.rol guarda el UUID del enumerado (no el código en texto)
  const ownerRolId = await getIdRolByCodigo("owner");
  if (!ownerRolId) {
    throw new OnboardingError('No se encontró el rol "owner" en enumerados (tipo: rol_usuario)');
  }

  const slugEnUso = await prisma.tiendas.findUnique({ where: { slug: datosTienda.slug } });
  if (slugEnUso) {
    throw new OnboardingError(`El slug "${datosTienda.slug}" ya está en uso por la tienda "${slugEnUso.nombre}"`);
  }

  // Se valida antes de crear/invitar en Supabase Auth para no dejar usuarios
  // sueltos si el alta va a fallar de todos modos.
  const [existente] = await prisma.$queryRaw`SELECT id::text AS id FROM auth.users WHERE lower(email) = ${owner.email} LIMIT 1`;
  if (existente) {
    const membresia = await prisma.usuario_tiendas.findFirst({ where: { userId: existente.id } });
    if (membresia) {
      throw new OnboardingError(`El usuario ${owner.email} ya tiene una membresía registrada (tiendaId: ${membresia.tiendaId})`);
    }
  }

  const ownerAuth = await resolverOwner(owner);

  const { tienda, metodosPrecargados, enviosPrecargados } = await prisma.$transaction(async (tx) => {
    const tienda = await tx.tiendas.create({
      data: {
        ...datosTienda,
        fechaRegistro: new Date(),
        usuarioRegistro: owner.email
      }
    });

    await tx.usuario_tiendas.create({
      data: {
        userId: ownerAuth.userId,
        tiendaId: tienda.id,
        rol: ownerRolId,
        activo: true,
        fechaRegistro: new Date(),
        usuarioRegistro: owner.email
      }
    });

    // Hotel, tours y eventos no envían nada ni cobran contra entrega
    // (docs/specs/hospedaje-completo A2).
    const esReservas = datosTienda.tipoNegocio !== "productos";
    const metodosPrecargados = await seedMetodosPagoParaTienda(tienda.id, { excluirTipos: esReservas ? ["contra_entrega"] : [] }, tx);
    const enviosPrecargados = esReservas ? 0 : await seedMetodosEnvioParaTienda(tienda.id, {}, tx);

    return { tienda, metodosPrecargados, enviosPrecargados };
  });

  return {
    tienda: { id: tienda.id, nombre: tienda.nombre, slug: tienda.slug },
    url: config.platform.baseDomain
      ? `https://${tienda.slug}.${config.platform.baseDomain}`
      : `${config.platform.storefrontUrl}/${tienda.slug}`,
    owner: { email: owner.email, userId: ownerAuth.userId, creado: ownerAuth.creado, invitado: ownerAuth.invitado },
    metodosPrecargados,
    enviosPrecargados
  };
}
