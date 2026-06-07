// Registra una tienda nueva y vincula a su dueño como "owner".
//
// POST /api/v1/tiendas solo crea la fila de la tienda — no crea el vínculo
// en usuario_tiendas, y las políticas RLS exigen que ya exista una membresía
// "owner" para poder insertar otras (huevo y gallina). Este script hace
// ambos pasos en una sola transacción para no dejar tiendas huérfanas.
//
// Uso:
//   1. Edita el objeto CLIENTE de abajo con los datos del nuevo cliente.
//   2. El cliente debe tener ya una cuenta en Supabase Auth — copia su UUID
//      desde el Dashboard de Supabase (Authentication > Users) en ownerUserId.
//   3. Ejecuta: node scripts/onboard-cliente.mjs

import { prisma } from "../config/prisma.js";
import { getIdRolByCodigo } from "../services/roles.service.js";

const CLIENTE = {
  ownerUserId: "1165ce55-baa1-4d89-86c6-5961deafcbed",
  ownerEmail: "test_zapatillas@yopmail.com", // solo para auditoría (usuarioRegistro)

  tienda: {
    nombre: "Zapatillas Fitness",
    slug: "zapatillasfitness", // será su subdominio: zapateriaalonso.ecompyme.com
    whatsappNumero: "957625308",
    ruc: "99999999998",
    razonSocial: "Zapatilla Fitness E.I.R.L.",
    razonComercial: "Zapatilla Fitness E.I.R.L.",
    direccionFiscal: "Av. Bolivar 123, Lima",
    activo: true
  }
};

async function main() {
  // usuario_tiendas.rol guarda el UUID del enumerado (no el código en texto)
  const ownerRolId = await getIdRolByCodigo("owner");
  if (!ownerRolId) {
    throw new Error('No se encontró el rol "owner" en enumerados (tipo: rol_usuario)');
  }

  const slugEnUso = await prisma.tiendas.findUnique({ where: { slug: CLIENTE.tienda.slug } });
  if (slugEnUso) {
    throw new Error(`El slug "${CLIENTE.tienda.slug}" ya está en uso por la tienda "${slugEnUso.nombre}" (${slugEnUso.id})`);
  }

  const membresiaExistente = await prisma.usuario_tiendas.findFirst({
    where: { userId: CLIENTE.ownerUserId }
  });
  if (membresiaExistente) {
    throw new Error(`El usuario ${CLIENTE.ownerUserId} ya tiene una membresía registrada (tiendaId: ${membresiaExistente.tiendaId})`);
  }

  const { tienda } = await prisma.$transaction(async (tx) => {
    const tienda = await tx.tiendas.create({
      data: {
        ...CLIENTE.tienda,
        fechaRegistro: new Date(),
        usuarioRegistro: CLIENTE.ownerEmail
      }
    });

    const membresia = await tx.usuario_tiendas.create({
      data: {
        userId: CLIENTE.ownerUserId,
        tiendaId: tienda.id,
        rol: ownerRolId,
        activo: true,
        fechaRegistro: new Date(),
        usuarioRegistro: CLIENTE.ownerEmail
      }
    });

    return { tienda, membresia };
  });

  console.log("Cliente registrado correctamente:");
  console.log(`  tienda:  ${tienda.nombre} (${tienda.id})`);
  console.log(`  slug:    ${tienda.slug}`);
  console.log(`  url:     https://${tienda.slug}.ecompyme.com`);
  console.log(`  owner:   ${CLIENTE.ownerEmail} (${CLIENTE.ownerUserId})`);
}

main()
  .catch((err) => {
    console.error("Error registrando cliente:", err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
