# Tareas: aviso de live

> Implementa [spec.md](spec.md) según [plan.md](plan.md). Marcar `[x]` al cerrar cada tarea.

## Cómo retomar

1. **Lo primero, antes de tocar nada más**: T1 (aplicar el DDL a la BD real). Sin eso, `/admin/live` responde 500 y ninguna otra tarea se puede probar de punta a punta.
2. Backend y FrontendAdmin ya tienen código funcionando (Fases 0 y 2); lo que falta es infraestructura (T1) y el storefront (Fase 3).
3. Orden de despliegue sugerido: T1 (BD) → verificar Fase 0 en caliente → Fase 3 (FrontendStore).

## Fase 0 — Backend (hecho)

- [x] **T0.1** Modelo `avisos_live` en `schema.prisma` (una fila por tienda, FK a `tiendas` con `ON DELETE CASCADE`).
- [x] **T0.2** `live.service.js`: get-or-create (`#ensure`), expiración perezosa (`#aplicarExpiracion`), `updateLinks`, `start` (valida plataformas con link), `extend` (tope 12h), `stop`.
- [x] **T0.3** `live.schema.js` (Zod): `liveQuerySchema`, `updateLinksSchema` (al menos un campo), `startLiveSchema` (al menos una plataforma marcada, `duracionHoras` 1–12 default 4).
- [x] **T0.4** `live.url.js` + `__tests__/live.url.test.js`: normalización/validación de links de TikTok, YouTube y Facebook.
- [x] **T0.5** `live.serializer.js`: `serializeLive` (admin, todos los campos) y `serializeLivePublic` (storefront, solo plataformas mostradas y solo si `activo`).
- [x] **T0.6** `live.admin.routes.js` montado en `/admin/live` (JWT + `requireTiendaAccess`, GET=viewer, mutaciones=editor).
- [x] **T0.7** `live.store.routes.js` montado en `/store/live` (público, `cache(15)`).
- [x] **T0.8** `docs/sql/live_rls_realtime.sql` y `docs/sql/live_setup.sql` (tabla + RLS + Realtime en un solo script, generado con `prisma migrate diff` para no generar drift contra `schema.prisma`).

## Fase 1 — Infraestructura de BD (BLOQUEANTE, pendiente)

- [ ] **T1.1** Confirmar que `avisos_live` no existe en la BD real: `select to_regclass('public.avisos_live')` → hoy devuelve `null` (verificado 2026-10-01).
- [ ] **T1.2** Aplicar el DDL: `npx prisma db push`, o si va lento, correr `docs/sql/live_setup.sql` en el SQL Editor de Supabase (crea tabla + RLS + Realtime en un paso).
- [ ] **T1.3** Si se usó solo `db push` (sin el script combinado), correr además `docs/sql/live_rls_realtime.sql` para habilitar RLS y agregar la tabla a `supabase_realtime`.
- [ ] **T1.4** Verificar en el SQL Editor: `select * from pg_policies where tablename = 'avisos_live'` (debe haber `avisos_live_select_publico` para `anon, authenticated`) y que la tabla aparezca en `supabase_realtime` (`select * from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'avisos_live'`).
- [ ] **T1.5** Repetir la prueba de T1.1 y confirmar que ya no da `null`; abrir `/live` en el admin y confirmar que el 500 `DATABASE_ERROR` desapareció.

## Fase 2 — FrontendAdmin (hecho en esta sesión)

- [x] **T2.1** `models/live.model.ts` (`Live`, `LiveLinksUpdate`, `LiveStart`).
- [x] **T2.2** `services/live.service.ts` + `live.service.spec.ts` (5 specs: get/updateLinks/start/extend/stop, todos con `tiendaId` en query).
- [x] **T2.3** `pages/live/live.component.ts` + `.html`: señales locales, sección Enlaces (PUT /links), sección Transmitir ahora (estado activo/inactivo, start/extend/stop), checkboxes deshabilitados sin link, aviso de vencimiento (`expiraEn`), permisos `canEdit` (bloquea `viewer`).
- [x] **T2.4** Ruta `/live` (lazy, `tenantGuard`) en `app.routes.ts` y entrada en `shared/layout` (ícono + link, gateado por `canConfigurarTienda()`).
- [x] **T2.5** `npm run build` sin errores; specs del servicio en verde.

## Fase 3 — FrontendStore (pendiente)

- [ ] **T3.1** `npm i @supabase/supabase-js`; agregar `supabaseUrl`/`supabaseAnonKey` a los tres `environments/*.ts` (copiar los valores del Admin — mismo proyecto Supabase).
- [ ] **T3.2** `core/services/live.service.ts`: `getInitial(tiendaId)` (REST a `GET /store/live?tiendaId=`) y `subscribe(tiendaId, cb)`/`unsubscribe()` sobre un canal `live-<tiendaId>` sobre `postgres_changes` sobre `avisos_live` filtrado por `tienda_id`.
- [ ] **T3.3** `state/live.state.ts` (señales, mismo estilo que `store.state.ts`): normaliza la forma REST (camelCase, ya filtrada por el backend) y la forma Realtime (snake_case, con TODOS los campos — hay que aplicar `mostrar_tiktok/mostrar_youtube/mostrar_facebook` en el cliente, igual que hace `serializeLivePublic` en el backend) a una sola forma interna. `activo === false` oculta el aviso.
- [ ] **T3.4** Componente `live-banner` (standalone): badge "🔴 EN VIVO" + título opcional + un botón por plataforma con link (`target="_blank" rel="noopener"`), solo las que tengan URL. `aria-live="polite"`, responsive, animación suave de entrada/salida.
- [ ] **T3.5** Montarlo en la home y/o en `app.component.html` como barra global.
- [ ] **T3.6** Limpieza de la suscripción en `ngOnDestroy` (`channel.unsubscribe()` + `supabase.removeChannel(channel)`) para no fugar canales al navegar.
- [ ] **T3.7** Degradación: si Realtime no conecta (red, RLS), el aviso se queda con el estado del `GET` inicial y no rompe la home.

## Fase 4 — Verificación de punta a punta

- [ ] **T4.1** Guardar un link inválido (ej. `instagram.com/algo` como TikTok) → toast con el mensaje del backend, no un error genérico ni un crash.
- [ ] **T4.2** Intentar iniciar sin ninguna plataforma marcada, y marcando una sin link guardado → ambos casos los previene la UI (checkbox deshabilitado) y, si se fuerza por API, el backend responde 400 con el mensaje de qué falta.
- [ ] **T4.3** Iniciar un live → badge "EN VIVO" + hora de vencimiento visible en el admin; el storefront muestra el aviso con los botones de las plataformas elegidas, sin recargar la página.
- [ ] **T4.4** Extender repetidamente hasta tocar el tope de 12h desde el inicio → el botón "Extender" se deshabilita al llegar al tope.
- [ ] **T4.5** Detener → el admin vuelve a "Inactivo" y el storefront oculta el aviso vía Realtime, sin recargar.
- [ ] **T4.6** Cambiar de tienda en el admin (selector de tenant) → la pantalla de Live recarga el estado de la tienda nueva.
