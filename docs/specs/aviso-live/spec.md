# Spec: aviso de live (transmisión en vivo)

> Estado: **backend implementado, FrontendAdmin implementado, FrontendStore sin empezar** (ver [tasks.md](tasks.md)).
> Diseño técnico: [plan.md](plan.md).
> Repos involucrados: BackendNode, FrontendAdmin, FrontendStore.
> Bloqueador actual: la tabla `avisos_live` no existe todavía en la base de datos real de Supabase (500 `DATABASE_ERROR` al abrir la pantalla en el admin). Ver [Riesgos y notas](#riesgos-y-notas) y T1 en tasks.md.

## Problema

Los emprendedores transmiten en vivo en TikTok, YouTube o Facebook para vender, pero la tienda no se entera: tienen que avisar por separado en redes, y un visitante que entra a la tienda mientras el live está ocurriendo no sabe que existe ni cómo verlo.

## Objetivo

Que el emprendedor guarde una vez los links de sus cuentas de live (persisten entre transmisiones) y pueda "prender" un aviso manual en su tienda cuando esté transmitiendo, eligiendo qué plataformas mostrar y por cuánto tiempo. El storefront debe mostrar el aviso con los botones a las plataformas elegidas y actualizarse solo cuando el emprendedor lo prende o lo apaga, sin que el visitante tenga que refrescar la página.

## Conceptos

- **Aviso de live:** una fila por tienda (`avisos_live`) con los links persistentes y el estado del live actual (activo/inactivo, título, plataformas mostradas, hora de inicio y de vencimiento).
- **Enlaces persistentes** (`tiktokUrl`, `youtubeUrl`, `facebookUrl`): se guardan una vez con `PUT /links` y se reutilizan en cada live; no se borran al apagar el live.
- **Plataformas mostradas** (`mostrarTiktok`, `mostrarYoutube`, `mostrarFacebook`): cuáles de los links persistentes se muestran en **el live actual**. Se eligen al iniciar (`POST /start`) y pueden ser un subconjunto de los links guardados.
- **Apagado 100% manual:** no hay cron ni job en background. El live queda activo hasta que el emprendedor pulsa "Detener" o hasta que se corrige de forma perezosa (ver R4.2). La UI debe dejar claro a qué hora vence (`expiraEn`) para que el emprendedor se acuerde de apagarlo.
- **Tiempo real:** el storefront no hace polling; recibe el encendido/apagado por Supabase Realtime (rol anon, solo lectura) sobre la misma fila.

## Alcance

**Incluye**
- CRUD de la fila única de live por tienda, con get-or-create implícito (el admin nunca ve un 404 "no existe", siempre hay una fila con valores por defecto).
- Normalización y validación de links de TikTok/YouTube/Facebook en el backend (acepta `@usuario`, `usuario` o URL completa para TikTok; watch/live/youtu.be/@canal/live para YouTube).
- Inicio con duración configurable (1–12 h, default 4h), validando que cada plataforma marcada tenga su link guardado.
- Extensión de 1h en 1h con tope de 12h desde el inicio.
- Apagado manual y expiración perezosa al leer.
- Pantalla de administración (FrontendAdmin) para gestionar enlaces y el live actual, respetando permisos por rol.
- Entrega al storefront: estado inicial por REST (público, cacheado 15s) + actualización en tiempo real por Supabase Realtime.

**No incluye (futuro)**
- Transmisión de video dentro de la propia plataforma: esto solo enlaza a la transmisión externa (TikTok/YouTube/Facebook), no la reproduce.
- Apagado automático por cron; la expiración perezosa (R4.2) no sustituye un job en background, solo evita mostrar un live vencido como activo.
- Historial de lives pasados o métricas (duración real, vistas, etc.).
- Más de un live simultáneo por tienda.

## Requisitos

Formato: *Cuando [condición], el sistema debe [comportamiento].*

### R1 — Enlaces persistentes
- **R1.1** `PUT /admin/live/links` debe aceptar `tiktokUrl`, `youtubeUrl`, `facebookUrl` de forma independiente; solo se tocan los campos presentes en el body.
- **R1.2** Cada link puede ser un string (se normaliza) o `null`/`""` para limpiarlo. Debe rechazar un body sin ningún campo.
- **R1.3** El backend normaliza cada link a su forma canónica (p. ej. TikTok → `https://www.tiktok.com/@usuario/live`) y valida dominio y `https`. Un link inválido responde 400 con `data.message` en español listo para mostrar y `data.campo` (`"tiktok"|"youtube"|"facebook"`).
  - Criterio: guardar `instagram.com/algo` como `tiktokUrl` responde 400, no 500, y el mensaje no es genérico.
- **R1.4** Los enlaces persisten aunque el live esté apagado; apagar o iniciar un live nunca los borra.

### R2 — Inicio del live
- **R2.1** `POST /admin/live/start` requiere al menos una plataforma marcada (`mostrarTiktok`/`mostrarYoutube`/`mostrarFacebook`).
- **R2.2** Una plataforma solo puede marcarse si ya tiene un link guardado. Si falta, responde 400 con `data.message` listando qué falta (p. ej. "Primero guarda el enlace de: TikTok").
- **R2.3** `duracionHoras` es un entero 1–12, con 4 como valor por defecto si no se envía.
- **R2.4** Al iniciar, el backend fija `iniciadoEn = ahora` y `expiraEn = ahora + duracionHoras`.

### R3 — Extensión
- **R3.1** `POST /admin/live/extend` suma 1 hora a `expiraEn`, sin superar `iniciadoEn + 12h`.
- **R3.2** Si no hay un live activo, responde 422 con un mensaje claro (no se puede extender algo que no existe).

### R4 — Apagado y expiración
- **R4.1** `POST /admin/live/stop` apaga el live de inmediato (`activo = false`), preservando los links persistentes.
- **R4.2** Al leer el estado (`GET /admin/live`, lectura pública, o antes de extender) con `expiraEn` ya vencido, el backend corrige `activo` a `false` dentro del propio request, sin esperar a un cron.
- **R4.3** El apagado es la única forma válida de "terminar" un live desde la perspectiva del usuario; no existe (ni se planea) un job en background que lo haga por su cuenta.

### R5 — Entrega al storefront (tiempo real)
- **R5.1** `GET /store/live?tiendaId=` (público, sin auth) devuelve `{ activo: false }` si no hay live, o `{ activo: true, titulo, tiktok, youtube, facebook, iniciadoEn, expiraEn }` si lo hay, con los links ya normalizados y **solo** los de las plataformas marcadas como mostradas (las demás llegan `null`).
- **R5.2** La fila `avisos_live` debe estar en la publicación de Supabase Realtime y con una policy de `SELECT` pública (`anon`, `authenticated`) para que el storefront reciba el cambio sin pasar por el backend. No debe haber policies de escritura para `anon`/`authenticated`: todas las escrituras pasan por el backend (rol `postgres`, bypass RLS).
- **R5.3** Cuando el emprendedor apaga el live manualmente, el evento de Realtime (`activo: false`) debe llegar al storefront para que oculte el aviso sin que el visitante recargue la página.

### R6 — Permisos (FrontendAdmin)
- **R6.1** Leer el estado del live (enlaces + live actual) está permitido desde el rol `viewer` hacia arriba.
- **R6.2** Guardar enlaces, iniciar, extender y detener requieren rol `editor` o superior. El rol `viewer` ve la pantalla pero no puede ejecutar ninguna de esas acciones.
- **R6.3** La UI debe prevenir, no solo reaccionar: un checkbox de plataforma sin link guardado se deshabilita antes de intentar iniciar, en vez de depender solo del 400 del backend.

## Riesgos y notas

- **Bloqueador activo:** la tabla `avisos_live` está en `schema.prisma` pero **no existe en la base de datos real** (verificado con `to_regclass('public.avisos_live')` → `null`). Cualquier llamada a `/admin/live` responde 500 `DATABASE_ERROR` hasta que se aplique el DDL. Hay dos caminos listos en `docs/sql/`: `npx prisma db push` o, si va lento, ejecutar `docs/sql/live_setup.sql` directo en el SQL Editor de Supabase (crea tabla + RLS + Realtime en un solo paso, generado con `prisma migrate diff` para no generar drift). Después de cualquiera de los dos, si se usó solo `db push`, falta correr `docs/sql/live_rls_realtime.sql` para habilitar RLS y Realtime.
- Este proyecto no usa el historial de migraciones de Prisma: los cambios de esquema se aplican a mano (`db push` o SQL directo) y hay que acordarse de sincronizar `schema.prisma` con la base real. Ver memoria `project_rls_no_aplicado` para el antecedente de este mismo patrón de riesgo (RLS de otras tablas que existe en los scripts pero no en la BD).
- El storefront (FrontendStore) necesita `@supabase/supabase-js` (no instalado aún ahí) y las variables `supabaseUrl`/`supabaseAnonKey` en sus tres `environments/*.ts`, copiadas del Admin.
- Si Supabase Realtime no conecta (red, RLS mal configurado), el storefront debe degradar con elegancia al estado del `GET` inicial, no romper la home.
