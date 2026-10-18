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

STORAGE_DRIVER=supabase   # Assets públicos: supabase | r2 (ver services/storage.service.js)
R2_ACCOUNT_ID=            # Solo con STORAGE_DRIVER=r2
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=                # tiendas-dev / tiendas-prod
R2_PUBLIC_URL=            # https://img-dev.ecompyme.com / https://img.ecompyme.com

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

### Parámetros de la plataforma
- Valores que el administrador de la plataforma (`PLATFORM_ADMIN_EMAILS`) cambia sin deploy: `modules/parametros/`, tabla `parametros_plataforma`, pantalla "Parámetros de la plataforma" en el admin.
- Parámetro nuevo: agregarlo a `parametros.registro.js` (validación Zod + valor por defecto; lo exige un test) y leerlo con `parametro(clave)`. Nunca leer la tabla directo. Una variable de entorno solo sirve como valor por defecto.

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
- Sin `try { … } catch (error) { next(error); }` en los handlers: con Express 5 una promesa rechazada llega sola a `errorHandler`. Un `catch` en una ruta solo si traduce el error o hace otra cosa (p. ej. un webhook que responde 200 al proveedor). Lo vigila `middlewares/__tests__/errores-async.test.js` (spec antipatrones A2).

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
| Catálogo | `categorias`, `marcas` (solo rubros con la capacidad `marcas`), `productos`, `producto_variantes`, `producto_imagenes`, `producto_atributos` |
| Clientes | `clientes` |
| Pedidos | `pedidos`, `pedido_detalles`, `pedido_historial_estados` |
| Configuración | `metodos_pago`, `metodos_envio` |
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


## Lógica por rubro (Strategy por tipo de negocio)

- Todo lo que distingue a un rubro (`productos`, `hotel`, `tours`, `eventos`, `locales`, `canchas`) va en `negocio/<rubro>/`, con el mismo nombre en los tres repos.
- El código compartido pregunta por **capacidades**, nunca por **identidad**: no se agrega `esHotel()`, `tipoNegocio === '…'` ni similares fuera de código que ya es de un solo rubro.
- Rubro nuevo: agregarlo al tipo/registro y crear su carpeta. Si le falta algo del contrato, no compila (front) o falla el test de contrato (backend).
- Variaciones por cliente, del más común al más raro: 1) configuración por tienda, 2) capacidad opcional del rubro activable por tienda, 3) excepción por tienda (`EXCEPCIONES` en el registro del backend), que hereda del rubro y reemplaza solo lo distinto. Nunca una copia del rubro por cliente.
- Spec completa: BackendNode `docs/specs/perfil-negocio/spec.md`.
- Backend: `modules/negocio/` tiene el contrato (`contrato.js`), el registro (`registro.js`: `estrategiaDe(tienda)`) y una carpeta por rubro con sus reglas (`estrategia.js`: `prepararProducto`) y sus datos (`datos.js`: capacidades como `recibeReservas`/`planDePagos`/`transmisiones`, plantilla y secciones de Diseño, config de reservas por defecto). Los módulos compartidos que solo necesitan datos usan `datosDe(tipoNegocio)` (`negocio/datos.js`, sin imports pesados: evita ciclos); el perfil del asistente es `estrategia.agente`. La vertical de reservas de cada rubro (`cotizar`, `estadoInicial`, `enTransaccion`…) vive en `modules/reservas/<rubro>/` y el registro la une como `estrategia.reservas`.
- **El rubro sale de la BD** (`tiendaDe(tiendaId)`, cacheado en `rubros.cache.js`), nunca de un `tipoNegocio` enviado por el cliente.
- Layout de Diseño por rubro (`docs/specs/layout-por-rubro`): `LAYOUT_POR_NEGOCIO` en `modules/diseno/secciones.schema.js` (`header` común + lo del rubro). Toda estructura que se entrega, se guarda o se copia pasa por `layoutDeNegocio(layout, tipoNegocio)`, que descarta lo de otro rubro y pone defaults; `estructuraSchema` solo valida el `header` porque no conoce el rubro. Rubro nuevo: agregar su entrada (lo exige un test).
- El backend es la verdad de las reglas; el front las refleja para la UX.
- Dashboard del admin (`docs/specs/dashboard-por-rubro`): cada rubro declara su lista de widgets en `negocio/<rubro>/dashboard.js` (`estrategia.dashboard`, parte del contrato) y las consultas propias van en `reservas/<rubro>/dashboard.js`. `modules/dashboard/` no sabe de rubros: corre los widgets y quita los montos al viewer (`sinMontos`); ningún widget pregunta por el rol. Tipo de widget nuevo: `TIPOS_WIDGET` aquí y su componente en el admin.
