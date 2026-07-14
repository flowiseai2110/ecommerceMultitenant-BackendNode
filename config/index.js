import "dotenv/config";

export const config = {
  // Server
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || "development",

  // Database
  databaseUrl: process.env.DATABASE_URL,

  // JWT / Supabase
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseJwksUrl: process.env.SUPABASE_JWKS_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,
  jwtAudience: process.env.JWT_AUDIENCE || "authenticated",

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutos
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100 // máximo 100 requests por ventana
  },

  // CORS - soporta múltiples orígenes separados por coma
  cors: {
    origin: !process.env.CORS_ORIGIN || process.env.CORS_ORIGIN.trim() === "*"
      ? "*"
      : process.env.CORS_ORIGIN.split(",").map(o => o.trim()),
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

  // Plataforma — dominio base para resolución de tienda por subdominio
  // Ej: PLATFORM_BASE_DOMAIN=ecompyme.com → zapateriaalonso.ecompyme.com
  platform: {
    baseDomain: process.env.PLATFORM_BASE_DOMAIN || null,
    reservedSubdomains: ["www", "api", "admin", "tiendas", "store", "app"]
  },

  // Email - Resend
  resend: {
    apiKey: process.env.RESEND_API_KEY,
    fromEmail: process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
    devToEmail: process.env.RESEND_DEV_TO_EMAIL // email de redirección en desarrollo (free tier)
  },

  // Kie.ai — solo lo sigue usando Studio (services/ai-studio.service.js).
  // El flujo principal de producto-imagenes migró a la API directa de Google (ver config.gemini).
  kie: {
    apiKey: process.env.KIE_API_KEY,
    baseUrl: "https://api.kie.ai/api/v1"
  },

  // Google Gemini — edición de imágenes con Nano Banana (gemini-2.5-flash-image) via API directa.
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    imageModel: process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image",
    // Circuit breaker de plataforma, independiente de la cuota por tienda. null = sin tope.
    maxCallsDia: process.env.GEMINI_MAX_CALLS_DIA ? parseInt(process.env.GEMINI_MAX_CALLS_DIA) : null,
    maxCallsMes: process.env.GEMINI_MAX_CALLS_MES ? parseInt(process.env.GEMINI_MAX_CALLS_MES) : null
  },

  // Studio — generador de imágenes IA sin persistencia permanente.
  // Bucket separado del de assets de tienda, con limpieza automática por TTL.
  studio: {
    scratchBucket: process.env.STUDIO_SCRATCH_BUCKET || "studio-scratch"
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
const requiredEnvVars = ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_JWKS_URL", "SUPABASE_SERVICE_KEY"];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error(`❌ Variables de entorno faltantes: ${missingVars.join(", ")}`);
  process.exit(1);
}

export default config;
