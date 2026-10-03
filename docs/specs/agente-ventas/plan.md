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

## Fase 2 — Filtros y precios

Las plantillas sin LLM se responden **antes** de `conConsulta` para no gastar consulta. Los indicadores de precio se calculan en `agente.service.js` al armar el `tool_result` (`precios.js`).

## Fase 3 — Streaming y pase a persona

### Flujo SSE

```
POST /store/agente/mensajes/stream     (mismos middlewares que /mensajes)
  → headers: text/event-stream, Cache-Control: no-cache, no-transform, X-Accel-Buffering: no
  atenderMensaje(…, emisor)                ← misma lógica que /mensajes
    plantilla (sin LLM)                    → event: fin
    responderTurno con streaming:
      vuelta con tool_use                  → event: reinicio (borra el preámbulo)
      buscar_productos terminó             → event: productos   (tarjetas antes que el texto)
      delta de texto                       → event: texto
      precio en el texto → reescribir      → event: reinicio
      sin primer token en 4 s              → abort; tarjetas + plantilla
    → event: fin { mensaje, productos, sugerencias, ofrecerPersona }   ← fuente de verdad
  error (402, 500…)                        → event: error { status, code, message }
```

### Decisiones

| Decisión | Por qué | Alternativa descartada |
|---|---|---|
| `POST` + `fetch` con lector de stream | `EventSource` solo hace GET; el mensaje va en el body | GET con el mensaje en la query |
| `fin` trae el mensaje completo y el frontend lo reemplaza | Si hubo reescritura por precio o degradación, lo que se mostró en vivo no es lo final | Confiar en la suma de deltas |
| `Cache-Control: no-transform` + `res.flush()` | `compression()` es global y acumularía el stream | Sacar `compression` del server |
| Timeout de primer token solo en streaming | En JSON el cliente ya espera la respuesta completa | Timeout en ambos |
| Degradar por lentitud con búsqueda directa (`query` = mensaje) | El cliente ve productos aunque el LLM no responda | Error |
| Fallos consecutivos en `agente_conversaciones.fallos` | Sobrevive entre requests; se reinicia con un turno con productos | Contador en memoria |
| Pase a persona por WhatsApp de la tienda, armado en el frontend | El storefront ya tiene `whatsappNumero`; sin tablas de asesores ni horarios | Tablas `asesores` y `horarios_atencion` (fuera de alcance) |
| «Quiero hablar con una persona» → plantilla sin LLM | Respuesta inmediata y gratis | Que el LLM lo detecte |

Qué cuenta como fallo: búsqueda sin resultados que deja el turno sin productos, error de herramienta, mensaje basura o «no me entiendes». Con 2 seguidos, la respuesta trae `ofrecerPersona: true`.

### Recuperar la conversación

`GET /store/agente/conversacion?sessionToken=…` devuelve los mensajes de la conversación activa (sin crearla). Las tarjetas no se guardan, así que al recargar solo vuelve el texto.

### Riesgo de despliegue

El storefront llama por el proxy de Vercel (`/api/v1`). Hay que verificar en producción que ni Vercel ni Railway acumulen el stream (el texto debe aparecer de a poco, no todo junto al final).

## Fase 4 — Herramientas

| Decisión | Por qué | Alternativa descartada |
|---|---|---|
| Distritos con `peru-utils` (offline, 1801 distritos) | Mismo dataset y códigos que el checkout; la tabla `ubigeos` tiene 35 filas y numeración propia | Tabla `ubigeos` / API externa |
| `tiendas.ubigeo` solo para desempatar por depto + provincia | Viene de la tabla `ubigeos` (8 dígitos, `01` + INEI): depto y provincia coinciden con el INEI, el distrito no | Usar el código completo |
| Envío: el modelo recibe tipo y plazo, la tarjeta los montos | Misma regla que los precios (R6): un costo en el texto sería inventado | Pasar el costo al modelo |
| Glosario que **agrega** términos, no reemplaza | El FTS combina con OR: si el catálogo usa la jerga, se sigue encontrando | Reemplazar / pgvector |
| `estado_pedido` con identidad del JWT, no del input | El modelo solo elige el número; un número ajeno es indistinguible de uno inexistente | Verificar con datos que da el cliente en el chat |
| Tools en paralelo con `Promise.all` | Envío y búsqueda no dependen entre sí: una sola vuelta extra al LLM | Secuencial |

## Fase 5

Se detalla al empezar. Puntos ya conocidos:

- El adaptador expone `crearMensaje({ system, tools, messages, maxTokens })` → `{ content, stopReason, usage }`; las métricas se guardan en `agente_conversaciones` o una tabla `agente_eventos`.
