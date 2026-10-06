// Primer import de seed-carga.js: se evalúa antes que config/ (y que dotenv),
// así el log de cada consulta de Prisma (nivel debug del .env de desarrollo)
// no inunda la salida del seed. LOG_LEVEL explícito en la terminal sigue mandando.
process.env.LOG_LEVEL ??= "warn";
