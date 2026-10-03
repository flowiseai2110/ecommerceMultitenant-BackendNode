# Tareas: agente de ventas IA

> Implementa [spec.md](spec.md) según [plan.md](plan.md). Marcar `[x]` al cerrar cada tarea.
> Cada tarea es independiente dentro de su fase salvo que diga «depende de».

## Cómo retomar

1. **T6.2 + T7.7:** prueba manual de las fases 1 y 2 con backend y storefront levantados.
2. **T6.4:** commits (fases 1 y 2 escritas y con tests, **sin commit** en BackendNode y FrontendStore).
3. Siguiente: Fase 3.

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

- [ ] **T8.1** Endpoint SSE (`/mensajes/stream`): eventos `productos`, `texto`, `fin`, `error`.
- [ ] **T8.2** Storefront: consumir el stream; «Escribiendo…» inmediato; tarjetas antes que el texto.
- [ ] **T8.3** Timeout de primer token (4 s) → solo tarjetas + plantilla.
- [ ] **T8.4** `GET /store/agente/conversacion` para recuperar los mensajes al reabrir el chat.
- [ ] **T8.5** Botón fijo «Hablar con una persona» (WhatsApp de la tienda con resumen).
- [ ] **T8.6** Contador de fallos por conversación → ofrecer el pase tras 2.

## Fase 4 — Herramientas (R9–R11)

- [ ] **T9.1** Resolver distrito → ubigeo (puro, con tests de ambigüedad y tildes).
- [ ] **T9.2** Tool `calcular_envio` sobre `cotizarEnvios`.
- [ ] **T9.3** Glosario de sinónimos por rubro y expansión de la consulta antes del FTS.
- [ ] **T9.4** Tool `estado_pedido` solo con sesión (`authUserId`). El chat debe mandar el token del comprador.

## Fase 5 — Medición (R12–R14)

- [ ] **T10.1** Adaptador de LLM compartido por asesor y Guía.
- [ ] **T10.2** Métricas por conversación (tokens, herramientas, modelo).
- [ ] **T10.3** Unión conversación → pedido (id de conversación en el checkout).
- [ ] **T10.4** Verificador de tallas y plazos antes de enviar.
