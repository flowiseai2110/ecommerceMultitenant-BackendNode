# PC.NODE.ADMIN — CLAUDE.md

## Descripción del proyecto

API REST multi-tenant para un SaaS de ecommerce. Permite gestionar múltiples tiendas, cada una con su catálogo, clientes, pedidos, métodos de pago y zonas de envío. La autenticación se delega a Supabase Auth (JWT).

**Stack:**
- **Runtime:** Node.js con ES Modules (`"type": "module"`)
- **Framework:** Express 5
- **ORM:** Prisma 6 + PostgreSQL (Supabase)
- **Auth:** Supabase Auth — tokens JWT verificados con JOSE (JWKS)
- **Validación:** Zod
- **Email:** Resend
- **Logger:** Winston
- **Documentación:** Swagger (swagger-jsdoc + swagger-ui-express)
- **Seguridad:** Helmet, express-rate-limit, CORS configurable

## Comandos

```bash
npm run dev          # Desarrollo con nodemon
npm start            # Producción
npm run prisma:generate   # Regenerar cliente Prisma
npm run prisma:migrate    # Ejecutar migraciones
npm run prisma:studio     # Abrir Prisma Studio
npm test             # Ejecutar tests con Jest
```

## Estructura del proyecto

```
server.js                  # Entry point
config/
  index.js                 # Configuración centralizada (lee .env)
  logger.js                # Winston logger
  prisma.js                # Instancia singleton de PrismaClient
  swagger.js               # Configuración de Swagger
routes/
  index.js                 # Router raíz — monta todos los módulos en /api/v1
  *.routes.js              # Rutas por módulo
controllers/
  generic.controller.js    # Controlador base reutilizable
middlewares/
  auth.middleware.js        # Verificación JWT con Supabase JWKS
  error.middleware.js       # Handler global de errores y 404
  validation.middleware.js  # Middleware de validación Zod
repositories/
  generic.repository.js    # Repositorio base (CRUD genérico con Prisma)
services/
  generic.service.js       # Servicio base reutilizable
  email.service.js         # Envío de emails con Resend
  roles.service.js         # Lógica de roles multi-tenant
validators/
  *.validator.js           # Esquemas Zod por módulo
prisma/
  schema.prisma            # Modelos de datos
```

## Variables de entorno requeridas

```env
DATABASE_URL=             # URL de conexión pooled (Supabase)
DIRECT_URL=               # URL directa para migraciones
SUPABASE_URL=             # URL del proyecto Supabase
SUPABASE_JWKS_URL=        # JWKS endpoint de Supabase Auth
SUPABASE_SERVICE_KEY=     # Service role key (para operaciones admin)
JWT_AUDIENCE=authenticated

RESEND_API_KEY=           # API key de Resend para emails
RESEND_FROM_EMAIL=        # Email remitente
RESEND_DEV_TO_EMAIL=      # Redirección de emails en desarrollo (free tier)

FRONTEND_URL=             # URL del frontend (para links en emails)
CORS_ORIGIN=              # Orígenes permitidos, separados por coma. "*" para todos
CORS_CREDENTIALS=false
PORT=3000
NODE_ENV=development
```

## Arquitectura y convenciones

### Patrón Repository → Service → Controller
- **Repository:** acceso a datos con Prisma, sin lógica de negocio.
- **Service:** lógica de negocio, llama al repository.
- **Controller:** recibe la request, llama al service, devuelve la response.

### Multi-tenant
- Cada recurso pertenece a una `tiendaId` (UUID).
- El middleware de auth extrae el `userId` del JWT.
- Los roles se verifican en `usuario_tiendas`: `owner`, `admin`, `editor`, `viewer`.
- **Todas las queries deben filtrar por `tiendaId`.**

### Formato de respuesta estándar
```json
{
  "status": 200,
  "type": "SUCCESS",
  "code": "RESOURCE_ACTION",
  "data": { ... }
}
```
Para errores:
```json
{
  "status": 400,
  "type": "ERROR",
  "code": "VALIDATION_ERROR",
  "data": { "message": "..." }
}
```

### Rutas
- Prefijo global: `/api/v1`
- Documentación Swagger: `/api/v1/swagger`
- JSON OpenAPI: `/api/v1/swagger.json`

### Modelos Prisma
- Nombres en **español** y **snake_case** en DB (mapeados con `@map`)
- Todos los modelos incluyen campos de auditoría: `fechaRegistro`, `usuarioRegistro`, `fechaActualizacion`, `usuarioActualizacion`
- IDs: `String @id @default(uuid()) @db.Uuid` (excepto `persona` que usa `BigInt`)
- `BigInt` se serializa a string via `BigInt.prototype.toJSON` en server.js

### Módulos del sistema
| Módulo | Tabla(s) Prisma |
|--------|-----------------|
| Tiendas | `tiendas`, `tienda_configuraciones` |
| Usuarios | `usuario_tiendas`, `invitaciones` |
| Catálogo | `categorias`, `productos`, `producto_variantes`, `producto_imagenes`, `producto_atributos` |
| Clientes | `clientes` |
| Pedidos | `pedidos`, `pedido_detalles`, `pedido_historial_estados` |
| Configuración | `metodos_pago`, `zonas_envio`, `zona_envio_ubigeos` |
| Datos maestros | `enumerados`, `ubigeos`, `persona` |

### Importaciones
Usar siempre extensión `.js` en imports (ESM):
```js
import { algo } from "./ruta/archivo.js";
```

### Seguridad
- Rate limit: 100 req / 15 min (configurable)
- Helmet activo en todas las rutas
- JWT verificado con JWKS público de Supabase (sin secreto compartido)
- Validación de input con Zod antes de llegar al controller
