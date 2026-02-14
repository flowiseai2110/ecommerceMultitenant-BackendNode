import "dotenv/config";

export const config = {
  // Server
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || "development",

  // Database
  databaseUrl: process.env.DATABASE_URL,

  // JWT / Supabase
  supabaseUrl: process.env.SUPABASE_URL || "https://tknrjrghvvfryachibsy.supabase.co",
  supabaseJwksUrl: process.env.SUPABASE_JWKS_URL || "https://tknrjrghvvfryachibsy.supabase.co/auth/v1/.well-known/jwks.json",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY, // Para crear usuarios desde el servidor
  jwtAudience: process.env.JWT_AUDIENCE || "authenticated",

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutos
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100 // máximo 100 requests por ventana
  },

  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    credentials: process.env.CORS_CREDENTIALS === "true"
  },

  // Pagination defaults
  pagination: {
    defaultPage: 1,
    defaultLimit: 10,
    maxLimit: 100
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || "info",
    format: process.env.LOG_FORMAT || "combined"
  },

  // Frontend URL (para links en emails)
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:4200",

  // AWS SES (para emails en producción)
  aws: {
    region: process.env.AWS_REGION || "us-east-1",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sesFromEmail: process.env.AWS_SES_FROM_EMAIL || "noreply@tudominio.com"
  },

  // Imágenes por defecto por folder
  defaultImages: {
    logos: "https://placehold.co/200x200/e2e8f0/64748b?text=Logo",
    banners: "https://placehold.co/1200x300/e2e8f0/64748b?text=Banner",
    productos: "https://placehold.co/400x400/e2e8f0/64748b?text=Producto",
    categorias: "https://placehold.co/100x100/e2e8f0/64748b?text=Categoria",
    otros: "https://placehold.co/400x400/e2e8f0/64748b?text=Imagen"
  }
};

// Validar configuración crítica
const requiredEnvVars = ["DATABASE_URL"];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error(`❌ Variables de entorno faltantes: ${missingVars.join(", ")}`);
  process.exit(1);
}

export default config;
