// Registra una tienda nueva y vincula a su dueño como "owner" (versión CLI).
// Para hacerlo desde un formulario: node scripts/onboard-form.mjs
//
// La lógica vive en services/onboarding.service.js. Si el email del dueño no
// existe en Supabase Auth, se crea con ownerPassword o, si va vacío, se le
// envía una invitación por email.
//
// Uso:
//   1. Edita el objeto CLIENTE de abajo con los datos del nuevo cliente.
//   2. Ejecuta: node scripts/onboard-cliente.mjs

import { prisma } from "../config/prisma.js";
import { onboardCliente } from "../services/onboarding.service.js";

const CLIENTE = {
  owner: {
    email: "maggy302023@gmail.com",
    password: "" // vacío = invitación por email (solo aplica si el usuario no existe)
  },

  tienda: {
    nombre: "M&G", // nombre comercial de la tienda
    slug: "myg", // será su subdominio: myg.ecompyme.com
    whatsappNumero: "999999999",
    ruc: "99999999998",
    razonSocial: "myg E.I.R.L.",
    razonComercial: "myg E.I.R.L.",
    direccionFiscal: "Lima, Lima, Peru",
    activo: true
  }
};

async function main() {
  const r = await onboardCliente(CLIENTE);

  console.log("Cliente registrado correctamente:");
  console.log(`  tienda:  ${r.tienda.nombre} (${r.tienda.id})`);
  console.log(`  slug:    ${r.tienda.slug}`);
  console.log(`  url:     ${r.url}`);
  console.log(`  owner:   ${r.owner.email} (${r.owner.userId})${r.owner.invitado ? " — invitación enviada" : ""}`);
  console.log(`  pagos:   ${r.metodosPrecargados} métodos de pago precargados (activar en el admin)`);
  console.log(`  envios:  ${r.enviosPrecargados} métodos de envío precargados (Recojo en tienda activo)`);
}

main()
  .catch((err) => {
    console.error("Error registrando cliente:", err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
