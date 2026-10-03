# Plan técnico: agente de ventas IA

> Implementa [spec.md](spec.md). Tareas y estado: [tasks.md](tasks.md).

## Fase 1 — Seguridad

### Flujo del mensaje (después)

```
POST /store/agente/mensajes
  requireTienda                      → req.tiendaId
  limiteIp            (30/min IP)    → antes de validar: la basura también cuenta
  validate(schema)                   → mensaje ≤ 500, sessionToken [A-Za-z0-9_-]{16,64}; historial se descarta
  limiteSesion        (10/min tienda:sessionToken)
  controller.responder
    obtenerConversacion(tiendaId, sessionToken)   ← activa y con actividad < 30 min, o nueva
    si turnos ≥ 30 → plantilla fija (sin LLM, sin consulta)
    historial = cargarHistorial(conversacion, 10) ← de la BD, empieza por "user"
    conConsulta(tiendaId, "asesor", responderTurno({ …, historial }))
    guardarTurno(conversacion, mensaje, respuesta) ← solo si el LLM respondió
```

### Decisiones

| Decisión | Por qué | Alternativa descartada |
|---|---|---|
| Conversación = `(tienda, sessionToken)` + 30 min de inactividad | El token vive en localStorage; sin vencimiento, una charla de ayer contaminaría la de hoy. Corta como una sesión de analítica | Una conversación eterna por token (único compuesto) |
| `tienda_id` también en `agente_mensajes` | Entra al auto-scope de Prisma y deja lista la RLS por tenant sin JOIN | Scope solo por relación |
| Guardar el turno solo si el LLM respondió | Coherente con el reverso de la consulta: un fallo no deja medio turno | Guardar el mensaje del cliente siempre |
| `historial` del body se ignora (Zod lo descarta) | El frontend viejo sigue funcionando durante el despliegue | Rechazar con 400 si viene |
| Límite de turnos responde 200 con plantilla | Para el cliente no es un error; no gasta consulta | 429 |
| Dos limiters con ventana de 1 min | IP frena la rotación de tokens; sesión frena el spam de una conversación | Uno solo por token (evadible) |
| Tablas por SQL manual + `schema.prisma` | Convención del proyecto (ver `docs/sql/`); `db push` puede borrar índices creados a mano | `prisma db push` |

### Modelo de datos

```prisma
model agente_conversaciones {
  id                   String    @id @default(uuid()) @db.Uuid
  tiendaId             String    @map("tienda_id") @db.Uuid
  sessionToken         String    @map("session_token") @db.VarChar(64)
  estado               String    @default("activa") @db.VarChar(20)
  turnos               Int       @default(0)
  ultimaActividad      DateTime  @default(now()) @map("ultima_actividad") @db.Timestamptz
  // auditoría estándar
  mensajes             agente_mensajes[]
  @@index([tiendaId, sessionToken, ultimaActividad(sort: Desc)])
}

model agente_mensajes {
  id              String   @id @default(uuid()) @db.Uuid
  tiendaId        String   @map("tienda_id") @db.Uuid
  conversacionId  String   @map("conversacion_id") @db.Uuid
  rol             String   @db.VarChar(20)      // "user" | "assistant"
  contenido       String   @db.Text
  fechaRegistro   DateTime? @default(now()) @map("fecha_registro") @db.Timestamptz
  @@index([conversacionId, fechaRegistro])
}
```

Retención (Ley 29733): las conversaciones no guardan identidad del cliente en esta fase. La política de borrado entra con la memoria del cliente (fuera de alcance).

### Seguimiento de pedido en dos niveles

```
GET /store/pedidos/rastrear/:numero?tiendaId=X[&verificacion=1234]
  optionalAuth                       → req.user si hay sesión (el interceptor del storefront ya manda el token a /store/pedidos)
  limiteRastreoIp      (30 / 15 min por IP)
  limiteVerificacion   (5 fallos / 15 min por tienda:numero; solo si viene verificacion)
  validate             → verificacion = 4 dígitos
  pedidosService.rastrear(tiendaId, numero, { verificacion, authUserId })
    nivelDeAcceso(pedido, …) → "completo" | "publico" | lanza 403 VERIFICACION_INVALIDA
```

- La lógica de nivel y el recorte viven en `modules/ordenes/rastreo.js` (puro, testeado).
- Comparación de los 4 dígitos con `timingSafeEqual`.
- `clienteWhatsapp` y `authUserId` se leen para decidir, pero **nunca** salen en la respuesta.
- El limiter de verificación cuenta solo respuestas fallidas (`skipSuccessfulRequests`): un atacante puede bloquear la verificación de un pedido 15 min, pero el nivel público y el acceso por sesión siguen funcionando.

### Orden de despliegue

1. Correr `docs/sql/agente_conversaciones.sql` en Supabase.
2. Desplegar el backend (Railway corre `prisma generate` en `postinstall`).
3. Desplegar el storefront (deja de enviar `historial`, `maxlength` 500, verificación en seguimiento).

El backend nuevo es compatible con el storefront viejo: ignora `historial` y un mensaje > 500 caracteres recibe un 400 legible.

## Fases 2–5

Se detallan al empezar cada fase. Puntos ya conocidos:

- **F2:** las plantillas sin LLM se responden **antes** de `conConsulta` para no gastar consulta. Los indicadores de precio se calculan en `agente.service.js` al armar el `tool_result`.
- **F3:** SSE con `res.flushHeaders()` y `X-Accel-Buffering: no`; revisar que Railway no bufferice. El botón de WhatsApp reutiliza `tienda-plantillas-whatsapp.service.js`.
- **F4:** `calcular_envio` reutiliza `cotizarEnvios(tiendaId, { ubigeo })`; la resolución distrito → ubigeo es una función pura testeable.
- **F5:** el adaptador expone `crearMensaje({ system, tools, messages, maxTokens })` → `{ content, stopReason, usage }`; las métricas se guardan en `agente_conversaciones` o una tabla `agente_eventos`.
