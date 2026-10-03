# Tareas: agente de ventas IA

> Implementa [spec.md](spec.md) según [plan.md](plan.md). Marcar `[x]` al cerrar cada tarea.
> Cada tarea es independiente dentro de su fase salvo que diga «depende de».

## Cómo retomar

1. **T6.2 + T7.7 + T8.8 + T9.6:** prueba manual de las fases 1–4.
2. Commit de las fases 3 y 4 (escritas y con tests, **sin commit** en BackendNode y FrontendStore). Ojo: en BackendNode hay cambios ajenos sin commit (Sentry: `instrument.js`, `config/logger.js`, middlewares); separarlos con `git add -p`.
3. Siguiente: Fase 5.

## Fase 1 — Seguridad (P0)

### 1A · Historial en el servidor (R1)

- [x] **T1.1** Modelos `agente_conversaciones` y `agente_mensajes` en `prisma/schema.prisma` + `npx prisma generate`.
- [x] **T1.2** Script `docs/sql/agente_conversaciones.sql` (DDL idéntico al de Prisma + RLS sin políticas).
- [x] **T1.3** Agregar ambas tablas a `TENANT_SCOPED_MODELS` en `config/prisma.js`.
- [x] **T1.4** `modules/agente/agente.conversaciones.js`: `obtenerConversacion`, `cargarHistorial`, `guardarTurno` y la función pura `recortarHistorial`.
- [x] **T1.5** Controller: cargar el historial de la BD, guardar el turno solo si el LLM respondió. Depende de T1.4.
- [x] **T1.6** Tests de `recortarHistorial` (máx. 10, empieza por `user`, orden cronológico).
- [x] **T1.7** ⚠️ **Manual:** correr `docs/sql/agente_conversaciones.sql` en el SQL Editor de Supabase.
  - Verificado: ambas tablas existen (`to_regclass`).

### 1B · Límites de entrada (R2)

- [x] **T2.1** Config: `AGENTE_IA_MAX_CARACTERES=500`, `AGENTE_IA_MAX_HISTORIAL=10`, `AGENTE_IA_MAX_TURNOS=30`, `AGENTE_IA_INACTIVIDAD_MIN=30`.
- [x] **T2.2** Schema: mensaje ≤ 500, `sessionToken` `[A-Za-z0-9_-]{16,64}`, sin `historial`.
- [x] **T2.3** Plantilla de límite de turnos en el controller, sin LLM ni consulta. Depende de T1.4.
- [x] **T2.4** Tests del schema (500 caracteres, token inválido, `historial` descartado).

### 1C · Rate limit (R3)

- [x] **T3.1** Limiter por IP (30/min) antes de `validate`, y por `tienda:sessionToken` (10/min) después — `agente.store.routes.js`.
- [x] **T3.2** Config `AGENTE_IA_RATE_LIMIT_IP_MIN` y `AGENTE_IA_RATE_LIMIT_SESION_MIN` (reemplaza `AGENTE_IA_RATE_LIMIT_MAX`).

### 1D · Seguimiento de pedido en dos niveles (R4)

- [x] **T4.1** `modules/ordenes/rastreo.js` (puro): `ultimos4Digitos`, `nivelDeAcceso`, `serializarRastreo`.
- [x] **T4.2** `pedidosService.rastrear` con `{ verificacion, authUserId }`; selecciona `clienteWhatsapp` y `authUserId` sin exponerlos. Depende de T4.1.
- [x] **T4.3** Ruta: `optionalAuth`, limiter por IP, limiter de verificaciones fallidas por pedido, `verificacion` en el schema.
- [x] **T4.4** Tests de `rastreo.js` (público sin PII, dueño con sesión, 4 dígitos correctos/incorrectos, pedido sin WhatsApp).
- [x] **T4.5** Storefront: modelo `PedidoRastreo`, servicio con `verificacion`, campo de 4 dígitos en la página de seguimiento cuando `detalleCompleto` es `false`.

### 1E · Storefront del chat

- [x] **T5.1** `chat-widget`: `maxlength="500"`, deja de enviar `historial`.
- [x] **T5.2** `agente.service.ts`: firma sin `historial`.

### 1F · Cierre

- [x] **T6.1** `npm test` en verde (30 suites, 386 tests). Storefront: `ng build` sin errores.
- [ ] **T6.2** Prueba manual: chat (3 turnos con contexto, mensaje de 501 caracteres → 400, 11 mensajes en 1 min → 429) y seguimiento (público, con 4 dígitos, con sesión, código errado ×6 → 429).
- [x] **T6.3** Actualizar `modules/agente/arquitectura.md` (§6: historial en servidor) y el estado de [spec.md](spec.md).
- [ ] **T6.4** Commits separados: backend y storefront. Desplegar en el orden de [plan.md](plan.md#orden-de-despliegue).

## Fase 2 — Filtros por código y precios (R5–R6)

- [x] **T7.1** `modules/agente/filtros.js` (puro): `esBasura`, `esSaludo`, `enmascararPagos` (Luhn), `clasificarMensaje`. Con tests.
- [x] **T7.2** Responder plantillas antes de `conConsulta` (no gastan consulta); el turno se guarda con el texto enmascarado.
- [x] **T7.3** `tool_result` con indicadores (`dentro_de_presupuesto`, `tiene_oferta`, `es_la_mas_economica`) en vez de precios — `modules/agente/precios.js`.
- [x] **T7.4** Prompt: regla «nunca escribas precios»; detector de moneda en el texto con 1 regeneración y plantilla de respaldo. Test del loop con el SDK simulado.
- [x] **T7.5** Filtro de presupuesto de `buscar_productos` contra el precio efectivo (oferta si es menor). Probado contra la BD.
- [x] **T7.6** `sugerencias` en la respuesta (categorías raíz tras el saludo) y botones de respuesta rápida en el chat del storefront.
- [ ] **T7.7** Prueba manual: «hola» → saludo con botones y sin gastar consulta (revisar `tienda_uso_recursos`); «$$$» → plantilla; una tarjeta de prueba `4111 1111 1111 1111` → plantilla y en `agente_mensajes` queda `[tarjeta oculta]`; «zapatillas hasta 100» → el texto no trae montos.

## Fase 3 — Experiencia (R7–R8)

- [x] **T8.1** Endpoint SSE (`/mensajes/stream`): eventos `texto`, `reinicio`, `productos`, `fin`, `error`. Misma lógica que `/mensajes` (`atenderMensaje`) y mismos rate limits. Verificado que `compression()` no lo acumula (`no-transform`).
- [x] **T8.2** Storefront: `fetch` + lector SSE; «Escribiendo…» inmediato; tarjetas antes que el texto; `fin` reemplaza lo mostrado; respaldo a JSON si la ruta da 404.
- [x] **T8.3** Timeout de primer token (`AGENTE_IA_PRIMER_TOKEN_MS`, 4 s) → abort; búsqueda directa con el mensaje y tarjetas + plantilla.
- [x] **T8.4** `GET /store/agente/conversacion` para recuperar los mensajes al reabrir el chat (solo texto).
- [x] **T8.5** Barra fija «¿Prefieres hablar con una persona?» → WhatsApp de la tienda con los últimos 3 mensajes del cliente. «Quiero hablar con una persona» / «no me entiendes» → plantilla sin LLM.
- [x] **T8.6** Columna `fallos` (consecutivos) → `ofrecerPersona` tras `AGENTE_IA_MAX_FALLOS` (2). Suman: búsqueda sin resultados que deja el turno sin productos, error de herramienta, basura, pedir persona. Reinicia: turno con productos.
- [x] **T8.7** ⚠️ **Manual, bloqueante:** correr `docs/sql/agente_conversaciones_fallos.sql` en Supabase.
  - Verificado: la columna existe (`information_schema`).
- [ ] **T8.8** Prueba manual:
  - El texto aparece de a poco (no todo al final) **en producción**, a través del proxy de Vercel y Railway.
  - Las tarjetas aparecen antes que el texto.
  - Recargar la página y reabrir el chat → vuelven los mensajes.
  - «polos rojos» dos veces en una tienda de zapatillas → aparece «Hablar con una persona».
  - La barra de WhatsApp abre el chat de la tienda con el resumen.

## Fase 4 — Herramientas (R9–R11)

- [x] **T9.1** `modules/agente/distritos.js`: distrito en texto → UBIGEO INEI con `peru-utils` (mismo dataset que el checkout; la tabla `ubigeos` está incompleta). Alias de Lima (Surco, SJL, SMP…), «distrito, provincia», desempate por cercanía a la tienda. Con tests.
- [x] **T9.2** Tool `calcular_envio` sobre `cotizarEnvios` (ahora devuelve también `nombre`). El modelo recibe tipo y plazo, sin montos; el frontend muestra una tarjeta de envío con los costos. Distrito ambiguo → botones.
- [x] **T9.3** `modules/agente/glosario.js`: jerga por rubro (+ común) que se agrega a la consulta antes del FTS, y quita muletillas («pe», «causa»…). Probado contra la BD: «zapas pa correr pe» encuentra zapatillas.
- [x] **T9.4** Tool `estado_pedido`: identidad del JWT (`optionalAuth` en `/mensajes` y `/mensajes/stream`), filtro tienda + `authUserId`; número ajeno = `NO_ENCONTRADO`. El chat manda el token del comprador (fetch del stream y `authInterceptor`) y muestra accesos al seguimiento.
- [x] **T9.5** Las tools de una misma vuelta se ejecutan en paralelo (`Promise.all`), con una sola vuelta extra al LLM.
- [ ] **T9.6** Prueba manual:
  - «¿hacen delivery a Surco?» → tarjeta de envío con los costos de la tienda; el texto no trae montos.
  - «envío a miraflores» en una tienda de Lima → Miraflores, Lima. Sin ubigeo de tienda → botones con opciones.
  - «zapas negras» en una tienda de moda → zapatillas.
  - «¿cómo va mi pedido?» sin sesión → pide iniciar sesión. Con sesión → estado y acceso al seguimiento.
  - Pedir por un número de pedido de otra persona → «no lo encuentro».

## Fase 5 — Medición (R12–R14)

- [ ] **T10.1** Adaptador de LLM compartido por asesor y Guía.
- [ ] **T10.2** Métricas por conversación (tokens, herramientas, modelo).
- [ ] **T10.3** Unión conversación → pedido (id de conversación en el checkout).
- [ ] **T10.4** Verificador de tallas y plazos antes de enviar.
