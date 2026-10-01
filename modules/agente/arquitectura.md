# Módulo Agente / Asesor de Ventas IA — Arquitectura

> Documento de arquitectura y decisiones de diseño del **Modo IA** (asesor de ventas
> conversacional). Consolida el análisis de factibilidad, las decisiones de modelo,
> el sistema de créditos y el plan de implementación por fases.
>
> **Estado actual: Fase 1 (en construcción).**

---

## 1. Objetivo

Un asesor de ventas conversacional embebido en el storefront que:

- Responde **solo** con productos de **su propia tienda** (aislamiento multi-tenant).
- Se comporta y escribe como un vendedor (cálido, útil, persuasivo).
- Busca productos por nombre / características y los **muestra como tarjetas** en el chat.
- **Nunca inventa** productos, precios ni stock.

## 2. Decisión central: tool-use, no "modelo libre" ni Managed Agents

El asesor **no** recibe el catálogo en el prompt. Recibe una **herramienta** (`buscar_productos`)
que el backend ejecuta contra Postgres con `WHERE tienda_id = :tiendaId`. Consecuencias:

- El modelo **no puede** mencionar un producto que la tool no devolvió → cero alucinación de catálogo.
- El aislamiento entre tiendas lo garantiza el **código** (el `tiendaId` viene de
  `resolveTienda`, server-side, nunca del prompt del usuario), no la "buena voluntad" del modelo.
- Precio y stock **siempre en vivo** (es la tabla real `productos`), nunca una copia desincronizada.

Se descartó:

- **Managed Agents / Sessions de Anthropic** — son para agentes con sandbox y ejecución de
  herramientas del lado del proveedor (coding/research agents). Sobra-dimensionado para un chat
  de atención. Usamos **Messages API + tool-use manual** (nuestro propio loop, nuestra persistencia).
- **Modelo pre-entrenado "de ventas" auto-alojado (HuggingFace)** — no existe hoy uno listo para
  producción; los candidatos (p. ej. `llama-3.2-1b-Ecommerce-ChatBot`) son de 1B, sin documentar
  y sin evaluación. El costo real no es la licencia sino la operación (GPU 24/7 ~$300-800/mes +
  MLOps). El **"estilo de vendedor" se logra con el system prompt**, no requiere un modelo especial.
- **RAG con embeddings para el catálogo** — el catálogo ya es dato estructurado en Postgres; la
  búsqueda vectorial no filtra por precio/stock exacto y se desincroniza. RAG queda **reservado**
  para la base de conocimiento no estructurada de la tienda (políticas, envíos, FAQs) en una fase
  posterior, no para el catálogo.

### Aislamiento por sesión + tenant

Cada conversación se ancla a `(tiendaId, sessionToken)` en **nuestra** base de datos. La API de
LLM es *stateless* — el modelo no tiene memoria propia entre llamadas. No hay forma de que se
"crucen pensamientos" entre tiendas salvo que nuestro código mezcle historiales, lo cual controlamos.
El mismo visitante navegando dos tiendas del SaaS tiene dos conversaciones separadas.

## 3. Elección de modelo (costo / beneficio)

Estrategia: **escalonar por complejidad**, no "el más barato de entrada".

| Modelo | Costo in/out (MTok) | Rol |
|---|---|---|
| **`claude-haiku-4-5`** ✅ **arranque** | $1 / $5 | Español excelente + tool-use confiable. Punto óptimo para el 80% de consultas de catálogo. |
| `claude-sonnet-5` | $2 / $10 (intro) | Upgrade si se necesita más persuasión/tono. |
| DeepSeek / Qwen / GLM (Flash) | ~$0.15 / $0.30-0.50 | Plan de **escalado** si el volumen se vuelve masivo (decenas de miles/mes). |

Razonamiento: el ahorro absoluto por consulta entre Haiku y los Flash chinos es de **fracciones de
centavo** (~$0.003 vs ~$0.003), mientras que el riesgo de peor español LATAM y tool-use frágil
impacta directo en **conversión**. No vale la pena de entrada. El modelo queda **aislado en
`agente.service.js`** para que migrar sea cambio de una constante.

Config recomendada: `thinking` desactivado (no hace falta razonamiento extendido para recomendar
productos) + `effort: "low"`/`"medium"` (prioriza latencia baja, importa en un chat) + **streaming**
de la respuesta + **prompt caching** del system prompt y definición de tools.

Estimación: ~$0.003/turno con Haiku → conversación de 4-6 turnos ≈ $0.01-0.02.

## 4. Frontera tool-use vs. agente

Buscar por nombre y mostrar es **tool-use** (un salto: pregunta → tool → respuesta), **no un agente**.

| | Tool-use (Fase 1-2) | Agente (Fase 3) |
|---|---|---|
| Qué hace | Llama a UNA función, recibe datos, responde | Decide por sí solo una secuencia multi-paso |
| Controla el flujo | Nuestro código (loop simple) | El modelo elige su trayectoria |
| Acciones | Solo lectura | Puede modificar estado (carrito, pedido) |

Se vuelve "agéntico" al encadenar varias tools autónomamente y/o al **escribir** datos. Aun así se
implementa con el mismo Messages API + tool-use; es una gradación, no otra tecnología.

## 5. "Mostrar el producto"

La tool devuelve **datos estructurados**, no texto. El **frontend (Angular)** renderiza las
tarjetas. El modelo genera el texto persuasivo y decide qué recomendar; quien "muestra" es el
frontend. Esto refuerza el grounding: solo se muestran productos que la tool devolvió (reales).

El backend responde al frontend con **dos cosas**: el texto del asesor y el array de productos.

---

## 6. Fase 1 — Alcance (en construcción)

**Meta:** asesor con una única tool de **solo-lectura** `buscar_productos` que busca en el catálogo
de la tienda y devuelve tarjetas. Cubre ~90% del valor.

### Componentes

```
modules/agente/
  arquitectura.md              # este documento
  agente.store.routes.js       # POST /store/agente/mensajes
  agente.controller.js         # recibe request, arma respuesta { mensaje, productos }
  agente.service.js            # loop de tool-use, system prompt, llamada al LLM (aislado aquí)
  agente.schema.js             # validación Zod del body (mensaje, sessionToken)
  agente.serializer.js         # contrato de salida (texto + tarjetas de producto)
  agente.repository.js         # persistencia de conversaciones/mensajes
  tools/
    buscar-productos.js        # ejecuta prisma.productos.findMany({ where: { tiendaId, activo, ... } })
```

### Contrato de la tool `buscar_productos` (borrador)

Entrada (la decide el modelo):
```jsonc
{
  "query": "zapatillas rojas",     // texto libre de búsqueda
  "precioMax": 100,                // opcional
  "categoriaId": "uuid",           // opcional
  "soloConStock": true             // opcional
}
```

Salida (al modelo Y al frontend) — reutiliza el `select` público de `productos.store.routes.js`:
```jsonc
{
  "productos": [
    { "id", "nombre", "slug", "precioBase", "precioOferta", "stock", "imagenUrl" }
  ]
}
```

El backend ejecuta contra Postgres con `tiendaId` **inyectado server-side** (vía `resolveTienda` /
`scopeQueryToTienda`, como el resto del store). Nunca confía en un `tiendaId` que venga del prompt.

### Flujo del endpoint

```
POST /store/agente/mensajes
  [resolveTienda]     → req.tiendaId
  [rateLimitAgente]   → límite por sessionToken (anti-abuso/costo)
  [validate(schema)]
  → agente.controller.responder
       → agente.service: arma historial (tiendaId, sessionToken)
          loop tool-use:
            1. messages.create(system, tools:[buscar_productos], messages, stream)
            2. si stop_reason == "tool_use" → ejecutar buscar-productos.js (WHERE tiendaId)
               → devolver tool_result → repetir
            3. si "end_turn" → responder { mensaje, productos }
       → persistir turno (agente.repository)
  → serializer → { status, type, code:"AGENTE_RESPUESTA", data:{ mensaje, productos } }
```

### Guardrails Fase 1

- System prompt por tienda (nombre, tono) **sin** el catálogo completo.
- Instrucción explícita: *"Solo puedes mencionar productos devueltos por `buscar_productos`. Si no
  hay resultados, dilo — no inventes."*
- Parseo de `tool_use.input` siempre con `JSON.parse` (nunca match de string sobre el serializado).
- Consumir crédito **antes** de llamar al LLM; **reverso** (+1) si el LLM falla (ver §7).
- Rate limit por `sessionToken` + límite de turnos por conversación.

### Variables de entorno nuevas

```env
AGENTE_IA_API_KEY=            # API key del proveedor LLM (Anthropic)
AGENTE_IA_MODELO=claude-haiku-4-5
AGENTE_IA_MAX_TURNOS=20       # tope de turnos por conversación
```

### Persistencia (Prisma) — Fase 1

```prisma
model agente_conversaciones {
  id            String   @id @default(uuid()) @db.Uuid
  tiendaId      String   @map("tienda_id") @db.Uuid
  clienteId     String?  @map("cliente_id") @db.Uuid
  sessionToken  String   @map("session_token") @db.VarChar(64)
  estado        String   @default("activa") @db.VarChar(20)
  // auditoría estándar (fechaRegistro, ...)
  @@index([tiendaId, sessionToken])
  @@map("agente_conversaciones")
}

model agente_mensajes {
  id              String   @id @default(uuid()) @db.Uuid
  conversacionId  String   @map("conversacion_id") @db.Uuid
  rol             String   @db.VarChar(20)   // "user" | "assistant"
  contenido       String   @db.Text
  fechaRegistro   DateTime? @default(now()) @map("fecha_registro") @db.Timestamptz
  @@index([conversacionId, fechaRegistro])
  @@map("agente_mensajes")
}
```

> Aplicar con `db push` (convención del proyecto: no `migrate`, no existe carpeta de migraciones).

---

## 7. Sistema de créditos IA (fase posterior — diseño reservado)

Cada tienda tiene un saldo de créditos (**1 crédito = 1 consulta**). Se consumen por mensaje y se
recargan comprando paquetes vía la pasarela de pago existente.

Puntos críticos del diseño (para cuando se implemente):

- **Decremento atómico:** `UPDATE ... SET saldo = saldo - 1 WHERE tienda_id = :id AND saldo > 0
  RETURNING saldo`. Si devuelve 0 filas → `402 SIN_CREDITOS_IA`. Imposible dejar el saldo negativo
  aunque haya consultas concurrentes.
- **Consumir antes de llamar al LLM; reverso (+1) si el LLM falla** (no cobrar consultas fallidas).
- **Ledger append-only** (`credito_ia_movimientos`) como fuente de verdad; el saldo es un cache.
- **Idempotencia del webhook de pago** — un webhook puede llegar dos veces; guardar `pagoId`
  procesado. Acreditar **solo tras confirmación real del webhook**, nunca al iniciar el checkout.
- **Free tier del plan** (`tiendas.planId`): asignación mensual; comprados no vencen, los del plan
  se reinician (decisión de negocio a confirmar).

Modelos: `tienda_creditos_ia`, `credito_ia_movimientos`, `paquete_creditos`. (Detalle completo se
desarrollará al abordar esta fase.)

---

## 8. Roadmap

> Specs en curso: [búsqueda confiable del asesor](../../docs/specs/asesor-ia-busqueda/spec.md)
> (FTS en español, filtros por categoría y color). Reemplaza la búsqueda `contains` de §6.

- **Fase 1 (actual):** `buscar_productos` de solo-lectura → busca y muestra tarjetas. Tool-use simple.
- **Fase 2:** tools de lectura extra (`consultar_envio`, `verificar_stock_variante`,
  `productos_relacionados`) + RAG opcional sobre `.md` de conocimiento de tienda (pgvector + RLS por
  `tienda_id`). Sistema de créditos.
- **Fase 3 (opcional):** tools que **escriben** (agregar al carrito, crear pedido) con confirmación
  del usuario antes de acciones irreversibles → territorio agente.
