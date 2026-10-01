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
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100, // máximo 100 requests por ventana
    // Límite específico para creación de pedidos (OWASP OAT-021 Denial of Inventory):
    // los pedidos descuentan stock al crearse, así que este endpoint necesita un
    // tope mucho más agresivo que el global
    checkoutMax: parseInt(process.env.RATE_LIMIT_CHECKOUT_MAX) || 5
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
    // Sin baseDomain (dev local) los links a una tienda usan el modo por ruta:
    // <storefrontUrl>/<slug>/... (ej. link "califica tu compra").
    storefrontUrl: process.env.STOREFRONT_URL || "http://localhost:4200",
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

  // Padrón Reducido del RUC partido en JSON por prefijo (ver modules/sunat/ruc.service.js).
  // Apuntar SUNAT_PADRON_URL a un fork propio para no depender del repo original.
  sunat: {
    padron: {
      baseUrl: process.env.SUNAT_PADRON_URL || "https://cdn.jsdelivr.net/gh/alb3rt0ru1z/tribio-padron-ruc@latest/chunks",
      timeoutMs: parseInt(process.env.SUNAT_PADRON_TIMEOUT_MS) || 8000,
      // El padrón se publica una vez al día.
      ttlMs: 6 * 60 * 60 * 1000
    }
  },

  // Pasarela de pagos (PSP) — ver pasarela-de-pagos/ para el análisis completo.
  pagos: {
    // Clave maestra (32 bytes en base64/hex) para cifrar credenciales de pasarela
    // por tienda en reposo (AES-256-GCM). Ver utils/crypto.js.
    encryptionKey: process.env.PAGOS_ENCRYPTION_KEY,
    // Culqi — pasarela principal (tarjetas + Yape). Cada tienda usa sus propias
    // llaves; acá solo va lo global del proveedor.
    culqi: {
      apiBaseUrl: process.env.CULQI_API_BASE_URL || "https://api.culqi.com/v2",
      // Timeout de las llamadas HTTP a Culqi (ms). La doc sugiere 5-10s.
      timeoutMs: parseInt(process.env.CULQI_TIMEOUT_MS) || 10000
    }
  },

  // Studio — generador de imágenes IA sin persistencia permanente.
  // Bucket separado del de assets de tienda, con limpieza automática por TTL.
  studio: {
    scratchBucket: process.env.STUDIO_SCRATCH_BUCKET || "studio-scratch"
  },

  // Reseñas de productos. El link de WhatsApp ("califica tu compra") lleva un
  // token firmado con este secreto: prueba que quien reseña recibió el pedido,
  // aunque haya comprado sin cuenta.
  resenas: {
    linkSecret: process.env.RESENAS_LINK_SECRET,
    linkTtlDias: parseInt(process.env.RESENAS_LINK_TTL_DIAS) || 60,
    // Máximo de reseñas enviadas por IP en la ventana del rate limit global.
    rateLimitMax: parseInt(process.env.RESENAS_RATE_LIMIT_MAX) || 20
  },

  // Agente / Asesor de ventas IA. Ver modules/agente/arquitectura.md.
  // El modelo se aísla acá para poder migrar a otro proveedor sin tocar el servicio.
  agente: {
    apiKey: process.env.AGENTE_IA_API_KEY,
    modelo: process.env.AGENTE_IA_MODELO || "claude-haiku-4-5",
    // Tope de tokens de salida por turno. Respaldo duro del "responde corto" del
    // prompt: 1-2 frases en español caben de sobra en ~200.
    maxTokens: parseInt(process.env.AGENTE_IA_MAX_TOKENS) || 200,
    // Tope de vueltas del loop de tool-use por turno (anti-loop infinito).
    maxToolLoops: parseInt(process.env.AGENTE_IA_MAX_TOOL_LOOPS) || 4,
    // Máximo de mensajes de historial que el cliente puede enviar (anti-abuso de contexto).
    maxHistorial: parseInt(process.env.AGENTE_IA_MAX_HISTORIAL) || 20,
    // Rate limit específico del asesor por ventana (por sessionToken).
    rateLimitMax: parseInt(process.env.AGENTE_IA_RATE_LIMIT_MAX) || 20
  },

  // Asistente "Guía" del panel admin. Ver modules/asistente/. Reusa la API key del
  // agente; las explicaciones paso a paso necesitan más tokens que el asesor.
  asistente: {
    apiKey: process.env.ASISTENTE_IA_API_KEY || process.env.AGENTE_IA_API_KEY,
    modelo: process.env.ASISTENTE_IA_MODELO || "claude-haiku-4-5",
    maxTokens: parseInt(process.env.ASISTENTE_IA_MAX_TOKENS) || 600,
    maxToolLoops: parseInt(process.env.ASISTENTE_IA_MAX_TOOL_LOOPS) || 4,
    maxHistorial: parseInt(process.env.ASISTENTE_IA_MAX_HISTORIAL) || 20,
    // Mensajes por usuario por ventana de rateLimit.windowMs (15 min por defecto).
    rateLimitMax: parseInt(process.env.ASISTENTE_IA_RATE_LIMIT_MAX) || 30
  },

  // Tope mensual de consultas IA para tiendas SIN plan asignado (con plan, manda
  // planes.limite_consultas_*_mes). Ver modules/consumo-ia/.
  consumoIa: {
    limiteAsesorSinPlan: parseInt(process.env.CONSUMO_IA_LIMITE_ASESOR_SIN_PLAN) || 100,
    limiteAsistenteSinPlan: parseInt(process.env.CONSUMO_IA_LIMITE_ASISTENTE_SIN_PLAN) || 50,
    // Tope DIARIO de la Guía sin plan (con plan: planes.limite_consultas_asistente_dia).
    limiteAsistenteDiaSinPlan: parseInt(process.env.CONSUMO_IA_LIMITE_ASISTENTE_DIA_SIN_PLAN) || 40
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
