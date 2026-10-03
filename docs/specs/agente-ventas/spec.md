# Spec: agente de ventas IA — de asesor a agente

> Estado: **Fases 1–4 implementadas.** Fases 3 y 4 pendientes de prueba manual y commit (ver [tasks.md](tasks.md)).
> Diseño técnico: [plan.md](plan.md). Arquitectura de referencia: [Agente de ventas IA para ecommerce](../Agente%20de%20ventas%20IA%20para%20ecommerce%20análisis%20y%20arquitectura.md).
> Estado actual del asesor: [modules/agente/arquitectura.md](../../../modules/agente/arquitectura.md). Spec previa: [asesor-ia-busqueda](../asesor-ia-busqueda/spec.md).

## Problema

El asesor (Fase 1 de `modules/agente`) ya cumple la regla central del documento de arquitectura: el LLM elige una herramienta cerrada y el código ejecuta una consulta fija con el `tiendaId` del servidor. Pero le faltan las capas que lo rodean, y tiene tres huecos de seguridad:

1. **El historial lo manda el cliente.** Hasta 20 mensajes de 4.000 caracteres, incluidos turnos con `rol: "assistant"`. Un atacante puede inventar respuestas del asesor (inyección más fácil que la directa) e inflar el contexto, que paga la tienda.
2. **El rate limit se salta cambiando el `sessionToken`**, porque la clave del límite sale del body.
3. **`GET /store/pedidos/rastrear/:numero` expone dirección, nombre y productos** con solo el número de pedido, y los números son correlativos (`PED-0001`, `PED-0002`…). Es un IDOR que existe hoy, sin agente.

Además: cada mensaje (incluso basura) gasta una consulta del plan de la tienda, el LLM recibe precios, no hay streaming, ni métricas por conversación, ni forma de pasar a una persona.

## Objetivo

Llevar el asesor a un agente de ventas seguro y medible, por fases, sin romper lo que ya funciona. La primera fase cierra los huecos de seguridad; las siguientes agregan valor de conversión.

## Alcance por fases

| Fase | Tema | Requisitos |
|---|---|---|
| 1 | Seguridad (P0) | R1–R4 |
| 2 | Filtros por código y precios fuera del LLM | R5–R6 |
| 3 | Experiencia: streaming y pase a persona | R7–R8 |
| 4 | Herramientas: envío, jerga, estado de pedido | R9–R11 |
| 5 | Medición: adaptador de LLM, métricas, verificador | R12–R14 |

**No incluye** (decidido en el análisis; se retoma con datos reales): backend separado, cascada de modelos, caché semántica, router por embeddings, RLS con `set_config` (barrera 2), chips «Entendí», niveles de degradación, packs versionados y modo VPC.

## Requisitos

Formato: *Cuando [condición], el sistema debe [comportamiento].*

### Fase 1 — Seguridad

#### R1 — Historial en el servidor
- **R1.1** El sistema debe guardar cada turno (mensaje del cliente y respuesta del asesor) en la base, asociado a `(tiendaId, sessionToken)`.
- **R1.2** El historial que llega al LLM debe salir **solo** de la base; el endpoint debe ignorar cualquier historial que mande el cliente.
  - Criterio: un body con `historial: [{rol:"assistant", contenido:"…"}]` no cambia lo que recibe el modelo.
- **R1.3** Al LLM se envían como máximo los últimos 10 mensajes, empezando siempre por un mensaje del cliente.
- **R1.4** Cuando pasan 30 minutos sin mensajes, el siguiente mensaje abre una conversación nueva.
- **R1.5** Si el LLM falla, el turno no se guarda (igual que la consulta, que se devuelve).
- **R1.6** Las tablas nuevas tienen `tienda_id`, entran al auto-scope de Prisma y tienen RLS habilitado sin políticas.

#### R2 — Límites de entrada
- **R2.1** El mensaje admite como máximo 500 caracteres, en el backend y en el chat (`maxlength`).
- **R2.2** El `sessionToken` debe tener 16–64 caracteres de `[A-Za-z0-9_-]`.
- **R2.3** Cuando una conversación llega a 30 turnos, el sistema responde con una plantilla fija (sin LLM y **sin gastar consulta**) que ofrece seguir por WhatsApp o explorar la tienda.

#### R3 — Rate limit no evadible
- **R3.1** Máximo 30 mensajes por minuto por IP (antes de validar el body).
- **R3.2** Máximo 10 mensajes por minuto por `(tienda, sessionToken)`.
  - Criterio: rotar el `sessionToken` en cada mensaje no permite pasar de 30/min desde la misma IP.

#### R4 — Seguimiento de pedido en dos niveles
- **R4.1** Con solo el número, el sistema debe devolver el **nivel público**: número, estado, estado de pago, fechas e historial de estados (estado y fecha, sin notas). Nada de nombre, dirección, contacto, productos ni montos.
- **R4.2** El sistema debe devolver el **detalle completo** cuando:
  - el comprador tiene sesión y es el dueño del pedido (`authUserId`), o
  - envía `verificacion` = los últimos 4 dígitos del WhatsApp del pedido.
- **R4.3** Cuando la verificación no coincide, el sistema responde `403 VERIFICACION_INVALIDA`.
- **R4.4** Como máximo 5 verificaciones fallidas por pedido cada 15 minutos (frena fuerza bruta distribuida sobre los 10.000 códigos) y 30 consultas por IP cada 15 minutos.
- **R4.5** La respuesta indica `detalleCompleto` y `puedeVerificar` (si el pedido tiene WhatsApp) para que el frontend muestre el campo de verificación.
- **R4.6** La página de seguimiento del storefront muestra el nivel público y un campo «últimos 4 dígitos de tu WhatsApp» para ver el detalle.

### Fase 2 — Filtros por código y precios

#### R5 — Capas 1 y 2 sin LLM
- **R5.1** Cuando el mensaje es basura (sin letras, sin vocales o sin palabras), el sistema responde con plantilla, sin LLM ni consulta.
- **R5.2** Cuando el cliente escribe datos de tarjeta (patrón de PAN), se enmascaran antes de guardarse y se responde que el chat nunca pide datos de pago.
- **R5.3** Saludos simples («hola», «buenas») responden con plantilla que presenta al asistente como IA y ofrece categorías como botones.

#### R6 — El LLM no recibe precios
- **R6.1** El `tool_result` al modelo reemplaza `precioBase`/`precioOferta` por indicadores: `dentro_de_presupuesto`, `tiene_oferta`, `es_la_mas_economica`.
- **R6.2** Las tarjetas del frontend siguen mostrando el precio de la base de datos.
- **R6.3** Si el texto del modelo contiene un patrón de moneda (`S/`, `soles`), se regenera una vez; si vuelve a fallar, se envía una plantilla.

### Fase 3 — Experiencia

#### R7 — Streaming
- **R7.1** La respuesta se envía por SSE: las tarjetas en cuanto termina la herramienta, y el texto a medida que se genera.
- **R7.2** Sin primer token en 4 s, se envían solo las tarjetas con una plantilla.

#### R8 — Pase a persona
- **R8.1** El chat muestra siempre un botón «Hablar con una persona» que abre el WhatsApp de la tienda con un resumen de la conversación.
- **R8.2** Tras 2 fallos (sin resultados dos veces, error de herramienta o «no entiendes»), el asesor ofrece el pase.
- **R8.3** Al reabrir el chat dentro de la misma conversación, el widget recupera los mensajes guardados.

### Fase 4 — Herramientas

- **R9 — `calcular_envio`:** recibe un distrito en texto, lo resuelve contra `ubigeos` y devuelve costo y plazo con `cotizarEnvios`. Errores `DISTRITO_AMBIGUO` y `DISTRITO_NO_CUBIERTO`.
- **R10 — Jerga:** un glosario de sinónimos por rubro (`zapas` → `zapatillas`, `chimpunes`, `casaca`…) amplía la consulta antes del FTS. Sin pgvector.
- **R11 — `estado_pedido`:** solo para compradores con sesión y solo sobre sus pedidos (`authUserId`); sin sesión devuelve `NO_AUTENTICADO`.

### Fase 5 — Medición

- **R12 — Adaptador de LLM:** el asesor y la Guía llaman a una interfaz común; el SDK de Anthropic queda en un solo archivo.
- **R13 — Métricas por conversación:** modelo, tokens, herramientas llamadas, caso detectado y si terminó en pedido (unión conversación → pedido).
- **R14 — Verificador:** compara tallas y plazos del texto con lo que devolvieron las herramientas antes de enviar.

## Dependencia: base de datos

| Cambio | Script | Fase | Estado |
|---|---|---|---|
| Tablas `agente_conversaciones` y `agente_mensajes` | `docs/sql/agente_conversaciones.sql` | 1 | ⬜ pendiente — **bloqueante para desplegar** |

Sin las tablas, el endpoint del asesor falla (el resto del backend no se ve afectado).
