# Plan técnico: aviso de live

> Implementa [spec.md](spec.md). Tareas y estado: [tasks.md](tasks.md).

## Flujo

```
Admin · Aviso de Live (FrontendAdmin)
  GET  /admin/live?tiendaId=           → fila actual (get-or-create, nunca 404)
  PUT  /admin/live/links?tiendaId=     → guarda/limpia tiktokUrl/youtubeUrl/facebookUrl (normalizados)
  POST /admin/live/start?tiendaId=     → activo=true, iniciadoEn=ahora, expiraEn=ahora+duracionHoras
  POST /admin/live/extend?tiendaId=    → expiraEn += 1h, tope iniciadoEn+12h
  POST /admin/live/stop?tiendaId=      → activo=false

Storefront (FrontendStore, pendiente)
  GET /store/live?tiendaId=            → estado inicial { activo, titulo, tiktok, youtube, facebook, iniciadoEn, expiraEn }
    (cache 15s en la ruta pública; no sustituye Realtime, solo cubre el primer render)
  Supabase Realtime (rol anon)
    channel('live-<tiendaId>').on('postgres_changes', { table: 'avisos_live', filter: 'tienda_id=eq.<id>' }, payload => ...)
    payload.new viene en snake_case y con TODOS los campos (incluye los no mostrados);
    el cliente debe aplicar mostrar_tiktok/mostrar_youtube/mostrar_facebook él mismo,
    igual que hace serializeLivePublic en el backend.
```

## Decisiones

| Decisión | Por qué | Alternativa descartada |
|---|---|---|
| Una fila por tienda (`@unique` en `tiendaId`), get-or-create en el `GET` | Simplifica el admin: nunca hay que manejar "todavía no existe la config", siempre hay algo que mostrar | Crear la fila explícitamente al activar la tienda |
| Apagado 100% manual, sin cron | El alcance pedido es deliberadamente simple: el emprendedor controla cuándo empieza y termina. Un cron agrega infraestructura (scheduler, locks, observabilidad) para un caso que el propio emprendedor puede resolver con un botón | Job periódico que apaga lives vencidos |
| Expiración perezosa dentro del request (`#aplicarExpiracion`) | Evita mostrar "EN VIVO" con una hora que ya pasó, sin necesitar el cron de todos modos; es una comprobación determinista, no un proceso en background | No corregir nada y dejar que el frontend compare fechas (duplica la lógica de vencimiento en dos lugares) |
| Enlaces persistentes separados de "plataformas mostradas en el live actual" | El emprendedor pega sus links una sola vez; cada live puede mostrar un subconjunto distinto sin re-escribir URLs | Un solo campo de "plataformas activas" que también borre el link al desmarcar |
| Normalización y validación de links en el backend (`live.url.js`), nunca en el front | Un link mal formado rompe el botón del storefront para todos los visitantes; centralizar la normalización evita que cada cliente (admin, tienda) reimplemente las reglas de cada plataforma | Guardar la URL tal cual la pega el usuario y validar solo en el front |
| `tiendaId` siempre por query param, nunca por body, y siempre el de `requireTiendaAccess` | Mismo patrón que el resto de endpoints admin (`metodos-pago`, etc.): el store_id efectivo nunca es un valor arbitrario del cliente | Aceptar `tiendaId` en el body de las mutaciones |
| GET permitido desde `viewer`, mutaciones desde `editor` | El live es una acción de marketing/operación, no una config estructural de la tienda; un `viewer` (ej. alguien de soporte) debe poder ver el estado sin poder prender/apagar nada | Exigir `editor` también para leer |
| Serializer distinto para admin (`serializeLive`) y público (`serializeLivePublic`) | El admin necesita ver los links guardados aunque no se muestren (para decidir qué marcar); el storefront solo debe recibir lo que el emprendedor decidió exponer, y solo si el live está activo | Un solo serializer con un flag `publico` |
| Realtime con rol `anon`, RLS de solo `SELECT`, backend escribe con `postgres` (bypass RLS) | El storefront es público y no tiene sesión; no hace falta autenticar lecturas de datos no sensibles (links de live), y cerrar la escritura evita que cualquiera manipule el aviso desde el navegador | Exponer un endpoint de polling en vez de Realtime |
| Caché de 15s en `GET /store/live` | Cubre el primer render sin pegarle a la BD en cada visita; el cambio en caliente (prender/apagar) no depende de este endpoint, llega por Realtime | Sin caché (carga directa a BD en cada home) o TTL largo (dejaría ver un live ya apagado en el primer render) |

## Modelo de datos

Tabla `avisos_live` (una fila por tienda, `schema.prisma:162`). DDL exacto en `docs/sql/live_setup.sql`:

```sql
CREATE TABLE "avisos_live" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,                 -- @unique
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "titulo" VARCHAR(100),
    "tiktok_url" TEXT,
    "youtube_url" TEXT,
    "facebook_url" TEXT,
    "mostrar_tiktok" BOOLEAN NOT NULL DEFAULT false,
    "mostrar_youtube" BOOLEAN NOT NULL DEFAULT false,
    "mostrar_facebook" BOOLEAN NOT NULL DEFAULT false,
    "iniciado_en" TIMESTAMPTZ,
    "expira_en" TIMESTAMPTZ,
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),
    CONSTRAINT "avisos_live_pkey" PRIMARY KEY ("id")
);
-- + índice único en tienda_id, índice (activo, expira_en), FK a tiendas ON DELETE CASCADE
```

RLS + Realtime (mismo script o `docs/sql/live_rls_realtime.sql` por separado):
- `SELECT` público (`anon`, `authenticated`) sobre toda la tabla.
- Sin policies de escritura (denegado por defecto para `anon`/`authenticated`).
- Tabla agregada a `supabase_realtime`.

## Endpoints

### Admin (`/admin/live`, JWT + `requireTiendaAccess`)

| Método | Ruta | Rol mínimo | Body |
|---|---|---|---|
| GET | `/admin/live?tiendaId=` | viewer | — |
| PUT | `/admin/live/links?tiendaId=` | editor | `{ tiktokUrl?, youtubeUrl?, facebookUrl? }` (string o null) |
| POST | `/admin/live/start?tiendaId=` | editor | `{ titulo?, mostrarTiktok, mostrarYoutube, mostrarFacebook, duracionHoras? }` |
| POST | `/admin/live/extend?tiendaId=` | editor | — |
| POST | `/admin/live/stop?tiendaId=` | editor | — |

Todas responden `{ status, type, code, data }` con `data` = fila completa serializada (`live.serializer.js#serializeLive`).

### Store (`/store/live`, público, cache 15s)

| Método | Ruta | Body |
|---|---|---|
| GET | `/store/live?tiendaId=` (o resuelto por subdominio) | — |

Respuesta: `serializeLivePublic` — `{ activo: false }` o `{ activo: true, titulo, tiktok, youtube, facebook, iniciadoEn, expiraEn }`.

## Normalización de links (`modules/live/live.url.js`)

- **TikTok:** acepta `@usuario`, `usuario` o URL completa → normaliza a `https://www.tiktok.com/@usuario/live`.
- **YouTube:** acepta `watch?v=`, `/live/`, `youtu.be/`, `@canal/live` → conserva la forma que identifica el live, valida dominio `youtube.com`/`youtu.be`.
- **Facebook:** valida dominio `facebook.com` y `https`.
- Cualquier link que no matchee su patrón de plataforma lanza `ValidationError` con `{ message, campo }`, capturado por el middleware de errores y devuelto como 400 con `data.message`/`data.campo`.
- Cubierto por `modules/live/__tests__/live.url.test.js`.

## FrontendAdmin (implementado en esta sesión)

- `models/live.model.ts` — `Live`, `LiveLinksUpdate`, `LiveStart`.
- `services/live.service.ts` — mismo patrón que `metodos-pago.service.ts`: `tiendaId` desde `TenantService.currentTiendaId()` como query param, `ApiSingleResponse<T>` desenvuelto con `map`. Métodos `get/updateLinks/start/extend/stop`. Specs en `live.service.spec.ts`.
- `pages/live/live.component.ts` (+ `.html`) — standalone, **señales locales** (no NgRx: es una sola fila de config, no una colección paginada). `effect()` recarga el `GET` cuando cambia `TenantService.currentTiendaId()`, igual que `plantillas-whatsapp.component.ts`. `canEdit` deriva de `TenantService.currentRol()` (bloquea `viewer`). Checkboxes de plataforma deshabilitados si no hay link guardado. Confirmación de "Detener" vía `ConfirmDialogService` (promesa). Mensajes de error del backend mostrados tal cual (`error.error?.data?.message`) vía `ToastService`.
- Ruta `/live` (lazy, `tenantGuard`) y entrada de navegación en `shared/layout`, gateada con `canConfigurarTienda()`.

## FrontendStore (pendiente, ver tasks.md Fase 3)

- Instalar `@supabase/supabase-js`; agregar `supabaseUrl`/`supabaseAnonKey` a los tres `environments/*.ts` (copiar del Admin).
- Cliente Supabase `anon` singleton + servicio que expone `getInitial(tiendaId)` (REST) y `subscribe(tiendaId, cb)`/`unsubscribe()` (Realtime).
- Estado con señales (`state/live.state.ts`, mismo estilo que `store.state.ts`): normaliza REST (camelCase) y Realtime (snake_case, con `mostrar_*` aplicado en el cliente) a una sola forma interna; `activo === false` oculta el aviso.
- Componente `live-banner` (standalone, visible en home y/o barra global): badge "🔴 EN VIVO", título opcional, un botón por plataforma con link (solo las que tengan URL), `aria-live="polite"`, limpia la suscripción en `ngOnDestroy`.
- Degradación: si Realtime no conecta, se queda con el estado del `GET` inicial; nunca rompe la home.
