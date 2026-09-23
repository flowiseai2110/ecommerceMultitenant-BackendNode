# Culqi — Integración Técnica (endpoints y payloads)

> Detalle técnico de la API v2 de Culqi para implementar en nuestro backend Node/Express/Prisma.
> Complementa a [`00-analisis-general.md`](./00-analisis-general.md).
> Investigación: septiembre 2026. **Verificar siempre contra la doc oficial** (`apidocs.culqi.com`) antes de codificar, ya que los payloads pueden cambiar.

---

## 1. Fundamentos

### URL base y versión
- **Base:** `https://api.culqi.com/v2`
- **Frontend (tokenización):** `https://secure.culqi.com` (Culqi.js / Checkout).
- La tarjeta se tokeniza **en el navegador** contra Culqi → nuestro backend nunca ve el PAN/CVV.

### Llaves (por tienda, en `tienda_pasarela_config`)
| Llave | Prefijo | Dónde se usa | Secreta |
|---|---|---|---|
| Pública | `pk_test_...` / `pk_live_...` | Frontend (Culqi.js/Checkout) | No |
| Privada (secret) | `sk_test_...` / `sk_live_...` | **Backend** (crear cargos, refunds) | **Sí — cifrar en reposo** |
| RSA id + RSA key | — | Cifrado opcional del payload (recomendado prod) | Sí |

### Autenticación (backend)
Header Bearer con la llave secreta:
```
Authorization: Bearer sk_test_xxxxxxxxxxxxxxxx
Content-Type: application/json
```

### Ambientes
- **Test/Integración:** llaves `_test_`. Tarjetas de prueba (ej. Visa `4111 1111 1111 1111`).
- **Producción:** llaves `_live_`.
- Separar por variable de entorno / modo en la config de la tienda. **Nunca mezclar.**

---

## 2. Recursos de la API v2

`tokens` · `charges` (cargos) · `orders` (órdenes) · `refunds` (devoluciones) · `customers` (clientes) · `cards` (tarjetas) · `plans` (planes) · `subscriptions` (suscripciones) · `events`/webhooks.

Prefijos de ID por recurso: `tkn_`, `chr_`, `ord_`, `ref_`, `cus_`, `crd_`, `pln_`, `sub_` (más `_test_` o `_live_`).

---

## 3. Flujo tarjeta (crédito/débito)

```
Frontend (Culqi.js, pk_)          Backend (sk_)                Culqi
      │  datos tarjeta                  │                        │
      ├───── tokeniza ──────────────────┼──────────────────────► │
      │◄──── token_id (tkn_...) ─────────────────────────────────┤
      ├──── POST /pagos/cargo {token} ─►│                        │
      │                                 ├── POST /v2/charges ───► │
      │                                 │◄── charge (paid) ───────┤
      │◄──── respuesta ─────────────────┤                        │
                                        │◄═══ Webhook (S2S) ══════┤  ← fuente de verdad
```

### 3.1 Crear Token — `POST /v2/tokens`
> **En producción esto ocurre en el FRONTEND con la llave pública** (Culqi.js). Aquí solo como referencia; el backend recibe el `token_id` ya generado.

```json
{
  "card_number": "4111111111111111",
  "cvv": "123",
  "expiration_month": "9",
  "expiration_year": "2028",
  "email": "cliente@example.com",
  "metadata": { "dni": "71702935" }
}
```
**Respuesta:** objeto token con `id: "tkn_test_xxxx"` (válido para un solo cargo, expira en minutos).

### 3.2 Crear Cargo — `POST /v2/charges`
```json
{
  "amount": 1000,
  "currency_code": "PEN",
  "email": "cliente@example.com",
  "source_id": "tkn_test_xxxx",
  "capture": true,
  "description": "Pedido #pedido-9999",
  "installments": 0,
  "antifraud_details": {
    "first_name": "Diego",
    "last_name": "Armando",
    "address": "Av. Lima 123",
    "address_city": "LIMA",
    "country_code": "PE",
    "phone_number": "999888777"
  },
  "metadata": {
    "tiendaId": "uuid-de-la-tienda",
    "pedidoId": "uuid-del-pedido"
  }
}
```

**Notas críticas de `amount`:**
- Está **en céntimos** (enteros). `1000` = **S/ 10.00**. `2000` = S/ 20.00.
- Monto mínimo suele ser S/ 3.00 (`300`). Verificar en panel.

**`capture`:**
- `true` → cobro inmediato (autoriza + captura).
- `false` → solo autoriza; se captura después con un endpoint de captura (útil para reservar fondos).

**`source_id`:** el `token_id` (pago único) o un `card_id` (`crd_...`, tarjeta guardada de un cliente).

**`metadata`:** clave para multi-tenant → guardar `tiendaId` y `pedidoId` para reconciliar en el webhook.

**Respuesta (éxito):**
```json
{
  "object": "charge",
  "id": "chr_test_xxxx",
  "amount": 1000,
  "currency_code": "PEN",
  "email": "cliente@example.com",
  "outcome": { "type": "venta_exitosa", "code": "AUT0000", "merchant_message": "..." },
  "source": { "object": "token", "id": "tkn_test_xxxx" }
}
```

---

## 4. Flujo Yape

Recordar límites (ver `00-analisis-general.md`): **máx. S/ 2,000**, solo **PEN**, código de aprobación válido **~2 min**.

**Dos modos:**
1. **Checkout (low-code):** pop-up de Culqi donde el usuario ingresa nº de celular + código de aprobación → devuelve `token_id` → backend crea el cargo igual que tarjeta.
2. **API (full-code):** requiere **PCI DSS 3.2 (SAQ-D)**; nosotros generamos el token Yape vía API. **Más pesado en cumplimiento** → para el MVP preferir Checkout/Culqi.js.

### Crear Token Yape (frontend / Culqi.js)
El usuario abre Yape, genera un **código de aprobación** (OTP de 6 dígitos) y lo ingresa junto con su nº de celular. Culqi.js llama al endpoint de token Yape y devuelve un `token_id`.

### Crear el cargo con el token Yape — `POST /v2/charges`
Idéntico a tarjeta: se envía el `token_id` de Yape como `source_id`.
```json
{
  "amount": 5000,
  "currency_code": "PEN",
  "email": "cliente@example.com",
  "source_id": "tkn_test_yape_xxxx",
  "metadata": { "tiendaId": "...", "pedidoId": "..." }
}
```

> **Recomendación MVP:** integrar Yape vía **Culqi Checkout** (menor carga PCI) y unificar el cargo con el mismo `payment.service.createCharge()`.

---

## 5. Órdenes (PagoEfectivo / pago diferido) — `POST /v2/orders`

Para pagos **asíncronos** (el cliente paga después en un agente/banco/PagoEfectivo). Se crea la orden, el cliente paga, y **el webhook confirma**.

```json
{
  "amount": 5000,
  "currency_code": "PEN",
  "description": "Venta de prueba",
  "order_number": "pedido-9999",
  "client_details": {
    "first_name": "Brayan",
    "last_name": "Cruces",
    "email": "cliente@example.com",
    "phone_number": "51945145222"
  },
  "expiration_date": 1727000000,
  "metadata": { "tiendaId": "...", "pedidoId": "..." }
}
```
- `expiration_date`: timestamp UNIX (segundos). Ej. `now + 24h`.
- El estado real llega por **webhook** (`order.status.changed` / pago confirmado).

---

## 6. Otros recursos

### Reembolso — `POST /v2/refunds`
```json
{ "amount": 500, "charge_id": "chr_test_xxxx", "reason": "solicitud_comprador" }
```
- `amount` parcial permitido (≤ monto del cargo).
- `reason`: `duplicado` | `fraudulento` | `solicitud_comprador` (verificar valores válidos en doc).

### Cliente — `POST /v2/customers`
```json
{
  "first_name": "Will", "last_name": "Muro",
  "email": "customer@example.com",
  "address": "Av. Lima 123", "address_city": "LIMA",
  "country_code": "PE", "phone_number": "899898999",
  "metadata": { "tiendaId": "..." }
}
```

### Tarjeta guardada — `POST /v2/cards`
```json
{ "customer_id": "cus_test_xxxx", "token_id": "tkn_test_xxxx" }
```
→ devuelve `card_id` (`crd_...`) usable como `source_id` en cargos futuros (**tokenización para recurrencia** — no guardamos datos de tarjeta nosotros).

### Plan / Suscripción (recurrente)
`POST /v2/plans`:
```json
{
  "name": "Plan mensual", "short_name": "pln-code", "description": "...",
  "amount": 300, "currency": "PEN",
  "interval_unit_time": 1, "interval_count": 1,
  "initial_cycles": { "count": 0, "amount": 0, "has_initial_charge": false, "interval_unit_time": 1 }
}
```
`POST /v2/subscriptions`:
```json
{ "card_id": "crd_live_ID", "plan_id": "pln_live_ID", "tyc": true, "metadata": {} }
```
> Útil si el SaaS cobra la **suscripción de las tiendas** (mensualidad del plan), no solo las ventas de sus clientes.

---

## 7. Webhooks (eventos) — la fuente de verdad

### Eventos disponibles
Configurables en **CulqiPanel → Eventos → Webhooks**. Cubren: `tokens`, `charges`, `refunds`, `customers`, `cards`, `plans`, `subscriptions`, `orders`.

Ejemplos de tipos: `charge.creation.succeeded`, `charge.creation.failed`, `order.status.changed`, `subscription.charge.succeeded`, etc. (confirmar nombres exactos en el panel).

### Estructura del payload (server-to-server)
Culqi hace `POST` a tu URL con el objeto del evento, p. ej.:
```json
{
  "object": "event",
  "type": "charge.creation.succeeded",
  "data": {
    "object": "charge",
    "id": "chr_test_xxxx",
    "amount": 1000,
    "currency_code": "PEN",
    "metadata": { "tiendaId": "...", "pedidoId": "..." }
  }
}
```

### Reglas de implementación (obligatorias)
1. **Idempotencia:** guardar cada evento en `pago_eventos` usando el `id` del cargo/evento como clave única. Si ya se procesó → responder `200` y salir.
2. **Verificar autenticidad:** validar la firma del webhook (HMAC / secret configurado en el panel). Culqi también permite listar IPs de origen para allowlist. **Rechazar** lo no verificado.
3. **Resolver tenant:** obtener `tiendaId`/`pedidoId` desde `data.metadata` para actualizar el pedido correcto.
4. **Actualizar estado del pedido SOLO desde el webhook**, no desde la respuesta del frontend.
5. **Responder rápido `2xx`.** Trabajo pesado (emails, etc.) → cola/async. Si respondes error, Culqi reintenta.

> ⚠️ El método exacto de verificación de firma de Culqi debe confirmarse en `apidocs.culqi.com` / panel antes de implementar — la doc pública no lo detalla completamente.

---

## 8. Mapa de implementación en NUESTRO backend

### Librería
`culqi-node` (npm, TypeScript, cero dependencias) o llamadas directas con `fetch`. Para control total y evitar dependencias, **cliente propio con `fetch`** encaja bien con nuestro stack ESM.

### Interfaz de proveedor
```
services/payments/payment-provider.interface.js
  - createCardCharge({ tokenId, amount, currency, email, metadata })
  - createYapeCharge({ tokenId, amount, email, metadata })
  - createOrder({ ... })            // PagoEfectivo
  - refund({ chargeId, amount, reason })
  - verifyWebhook({ headers, rawBody, secret }) -> { valid, event }

services/payments/providers/culqi.provider.js  // implementa lo anterior
```

### Endpoints (bajo `/api/v1`)
| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/tiendas/:tiendaId/pagos/cargo` | Crea cargo con `token_id` (tarjeta o Yape) |
| `POST` | `/tiendas/:tiendaId/pagos/orden` | Crea orden PagoEfectivo |
| `POST` | `/tiendas/:tiendaId/pagos/:id/reembolso` | Reembolso |
| `POST` | `/webhooks/culqi` | Recepción de eventos (público, verifica firma) |

### Mapeo de estados Culqi → nuestro `estado` de `pagos`
| Evento/estado Culqi | `pagos.estado` |
|---|---|
| token creado (frontend) | `pendiente` |
| `charge.creation.succeeded` / `outcome=venta_exitosa` | `pagado` |
| `charge.creation.failed` | `fallido` |
| orden creada, esperando pago | `pendiente` |
| `refund` exitoso | `reembolsado` |

### Checklist de seguridad
- [ ] `sk_` cifrada en reposo (nunca en logs, nunca al frontend).
- [ ] Solo el `pk_` viaja al frontend.
- [ ] Webhook con verificación de firma + allowlist de IP + idempotencia.
- [ ] `amount` siempre en céntimos y validado contra el total del pedido en backend (no confiar en el monto que manda el cliente).
- [ ] Validar que la moneda sea `PEN` para Yape y respetar el tope de S/ 2,000.
- [ ] Rate limit y HTTPS (ya presentes en el proyecto).

---

## 9. Pendientes por confirmar antes de codificar

1. Nombres **exactos** de los tipos de evento de webhook y **método de verificación de firma** (panel + `apidocs.culqi.com`).
2. Endpoint/flujo exacto del **token Yape** vía Culqi.js (modo Checkout vs API).
3. Comisiones vigentes y monto mínimo por transacción.
4. Si usaremos **cifrado RSA** del payload en producción (recomendado por Culqi).
5. Modelo de recepción de dinero (credenciales propias por tienda vs marketplace) — decisión de `00-analisis-general.md` §6.

---

## Fuentes

- [Culqi — Documentación Pagos Online](https://docs.culqi.com/es/documentacion/pagos-online/)
- [Culqi — Tokens Yape](https://docs.culqi.com/es/documentacion/pagos-online/cargo-unico/tokens-yape)
- [Culqi — Webhooks](https://docs.culqi.com/es/documentacion/pagos-online/webhooks/)
- [Referencia API Culqi](https://apidocs.culqi.com/)
- [SDK oficial PHP (payloads de referencia)](https://github.com/culqi/culqi-php)
- [culqi-node (npm)](https://www.npmjs.com/package/culqi-node)
- [culqi-nodejs (SDK sin dependencias)](https://github.com/mytheondev/culqi-nodejs)
- [El nuevo API v2 de Culqi (Medium/Team Culqi)](https://medium.com/team-culqi/el-nuevo-api-v2-de-culqi-eb68c835bdcd)
