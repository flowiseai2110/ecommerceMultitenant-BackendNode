# Análisis de Integración — Pasarela de Pagos

> Documento base para la integración de pagos en el SaaS ecommerce multi-tenant.
> Foco: mercado peruano (Yape, tarjetas crédito/débito, wallets) + estándares de la industria.
> Fecha de investigación: septiembre 2026.

---

## 1. Objetivo

Definir la arquitectura y el proveedor (o proveedores) para procesar pagos en la plataforma, cubriendo:

- **Tarjetas** de crédito y débito (Visa, Mastercard).
- **Yape** (billetera móvil líder en Perú).
- Medios secundarios/futuros: PagoEfectivo, Plin, cuotas (BNPL), pagos A2A.

Como somos un **SaaS multi-tenant**, cada tienda (`tiendaId`) debe poder conectar sus **propias credenciales de pasarela** y recibir el dinero en **su propia cuenta** (modelo de "connected accounts" / sub-comercios). Esto es una decisión de arquitectura crítica — ver sección 6.

---

## 2. Panorama del mercado peruano (2025–2026)

### Adopción de Yape
- **+17 millones de usuarios** y **+2 millones de negocios** aceptando Yape (2025).
- Yape + Plin juntos superan los **20 millones de usuarios activos**.
- Es el medio **preferido para tickets menores a S/ 500**.
- Límites de Yape para cobros online: **máximo S/ 2,000 por transacción**, solo en **soles (PEN)**.
- El "código de aprobación" Yape tiene validez de **~2 minutos**.

> **Conclusión:** Soportar Yape no es opcional en Perú. Es tan importante como las tarjetas.

### Pasarelas disponibles

| Aspecto | **Culqi** | **Izipay** | **Niubiz** | **Mercado Pago** | **Stripe** |
|---|---|---|---|---|---|
| Ideal para | PyMEs peruanas | Retail + físico | Enterprise | Marketplaces / regional | SaaS internacional |
| Onboarding | 1–7 días | 7–15 días | 15–30 días | Rápido | 7–21 días (en Perú) |
| Yape | ✅ Sí | ✅ Sí | ✅ Sí | ✅ Sí (Checkout API) | ❌ No |
| Plin | ❌ | ✅ | ✅ | Parcial | ❌ |
| POS físico | ✅ | ✅ | ✅ | ✅ | ❌ |
| Tokenización PCI | ✅ (client-side) | ✅ | ✅ (CyberSource) | ✅ | ✅ (líder) |
| Cuotas / BNPL | ✅ Cuotéalo (BCP) | — | — | ✅ | ❌ (en Perú) |
| Soporte en español | Total (Lima) | Sí | Sí | Sí | Parcial |
| Grupo | Credicorp / Krealo | — | Visanet Perú | Mercado Libre | — |

> El costo por transacción es solo **1 de ~10 factores**. También pesan: comisión por contracargo (chargeback), tasa real de aprobación de tarjetas peruanas, velocidad de liquidación (settlement), calidad de la API/webhooks, y penalidades de contrato.

### Recomendación preliminar de proveedor

**Culqi** como pasarela principal para el MVP:
- Activación más rápida (1–3 días).
- Soporta tarjetas + Yape + PagoEfectivo + Cuotéalo en una sola API REST v2.
- Tokenización client-side (reduce alcance PCI — ver sección 4).
- Es de Credicorp (mismo grupo que BCP/Yape), buena integración nativa con Yape.
- Documentación en español y SDKs oficiales (incluye Node).

Mantener la **capa de abstracción** (sección 5) para poder añadir Izipay/Niubiz/Mercado Pago después sin reescribir la lógica de negocio.

---

## 3. Estándar de la industria (cómo se hace bien)

### Flujo canónico de pago (4 fases)

```
┌─────────────┐   1. Crear token/sesión    ┌──────────────┐
│  Frontend   │ ─────────────────────────► │   Backend    │
│  (Angular)  │                            │  (Node/API)  │
└─────────────┘                            └──────┬───────┘
      │                                           │ auth con API key secreta
      │ 2. Render form seguro (iframe/JS)         ▼
      │    — la tarjeta NUNCA toca tu server ┌──────────────┐
      │◄──────────────────────────────────► │   Pasarela   │
      │ 3. Usuario confirma → tokeniza       │   (Culqi)    │
      │                                      └──────┬───────┘
      │                                            │
      │ 4. Backend crea el "cargo" con el token    │
      │                                            ▼
      │                                  ┌──────────────────┐
      └──────── 5. Webhook (S2S) ◄────── │  Banco emisor /  │
               estado definitivo del pago│  red de tarjetas │
                                         └──────────────────┘
```

**Fases:**
1. **Token de sesión (backend):** el server autentica con la pasarela y pide un token temporal para la transacción (amount, currency, order).
2. **Render del formulario (frontend):** se carga el form seguro de la pasarela como **iframe o componente JS embebido**. Los datos de tarjeta **nunca llegan a tu servidor**.
3. **Procesamiento:** la pasarela habla con el banco emisor, valida fondos, corre antifraude y autoriza.
4. **Webhook / IPN (server-to-server):** la pasarela notifica el **estado definitivo** a una URL configurada. **Esta notificación —no la respuesta del frontend— es la que debe disparar** la actualización del pedido, generación de comprobante y lógica posterior.

### Reglas de oro
- **El estado de verdad es el webhook.** Nunca confíes en el `success` del frontend para dar por pagado un pedido.
- **Idempotencia:** los webhooks pueden llegar varias veces. Usar el ID de transacción como clave única para no procesar dos veces.
- **Verificar firma del webhook:** HMAC-SHA256 o secret key. Rechazar notificaciones no firmadas → previene fraude.
- **Nunca almacenar** PAN (número completo), CVV ni fecha de expiración. Para pagos recurrentes usar **tokens** de la pasarela.
- **HTTPS/TLS obligatorio** en toda comunicación.
- **Retry con backoff exponencial** en llamadas a la API (timeout 5–10s).
- Separar credenciales **sandbox** y **producción** por variables de entorno; nunca mezclarlas.

---

## 4. Seguridad y cumplimiento (PCI DSS)

- **PCI DSS 4.0** es el estándar vigente, **obligatorio desde marzo 2025**. Añade: monitoreo continuo, control de scripts en la página de pago (integridad de scripts e-commerce), y MFA ampliado.
- **Tokenización** = reemplazar el número de tarjeta por un token sin valor fuera de su contexto. Reduce drásticamente el **alcance PCI (PCI scope)** de tu aplicación.
  - **Gateway tokenization:** token válido solo dentro de ese procesador (ej. Culqi). Simple.
  - **Network tokenization:** emitido por Visa/Mastercard, viaja con la tarjeta, mayor tasa de aprobación y portabilidad entre procesadores. Es el estándar hacia el que va la industria.
- **Estrategia para minimizar alcance PCI:** usar **hosted payment pages / hosted fields** (iframe de la pasarela). Así los campos sensibles quedan fuera de nuestra app y solo manejamos tokens internamente → normalmente califica para **SAQ A** (el nivel de cumplimiento más ligero).

> **Decisión:** usar tokenización client-side + hosted fields. Nuestro backend Node **jamás** ve datos de tarjeta en crudo.

---

## 5. Diseño de arquitectura para NUESTRO backend

Nuestro stack: Node ESM + Express 5 + Prisma + PostgreSQL (Supabase), patrón **Repository → Service → Controller**, multi-tenant por `tiendaId`.

### Capa de abstracción (Payment Provider interface)
Para no acoplarnos a Culqi, definir una interfaz común:

```
services/payments/
  payment-provider.interface.js   # contrato: createCharge, createYapeCharge, refund, verifyWebhook
  providers/
    culqi.provider.js             # implementación Culqi
    izipay.provider.js            # (futuro)
    mercadopago.provider.js       # (futuro)
  payment.service.js              # lógica de negocio, elige provider según config de la tienda
repositories/
  pago.repository.js
controllers/
  pago.controller.js
  webhook.controller.js           # endpoint público firmado
routes/
  pagos.routes.js
  webhooks.routes.js
```

### Modelos Prisma sugeridos (en español, snake_case como el resto)
- `pagos` — un intento/transacción de pago (ligado a `pedidoId` y `tiendaId`).
  - campos clave: `proveedor`, `proveedorTransaccionId`, `token`, `monto`, `moneda`, `estado` (`pendiente|autorizado|pagado|fallido|reembolsado`), `metodo` (`tarjeta|yape|pago_efectivo`), auditoría estándar.
- `pago_eventos` — bitácora de webhooks recibidos (para idempotencia y trazabilidad).
- `tienda_pasarela_config` — credenciales por tienda (API keys **cifradas**), proveedor activo, modo (sandbox/prod).

### Multi-tenant + pagos
- Cada tienda configura su propia pasarela → guardar credenciales cifradas en `tienda_pasarela_config`.
- **Toda** operación de pago filtra y usa las credenciales de la `tiendaId` correspondiente.
- El webhook debe resolver a qué `tiendaId` pertenece (por el ID de comercio o metadata en el payload).

### Endpoints propuestos (bajo `/api/v1`)
- `POST /tiendas/:tiendaId/pagos/token` — crea token/sesión para el frontend.
- `POST /tiendas/:tiendaId/pagos/cargo` — crea el cargo con el token (tarjeta).
- `POST /tiendas/:tiendaId/pagos/yape` — cargo con token Yape.
- `POST /webhooks/:proveedor` — recepción de webhooks (público, verifica firma).
- `POST /tiendas/:tiendaId/pagos/:id/reembolso` — reembolso.

---

## 6. Modelo de negocio: ¿cómo recibe el dinero cada tienda?

Al ser SaaS multi-tenant, hay dos modelos:

| Modelo | Descripción | Pros | Contras |
|---|---|---|---|
| **A) Credenciales propias por tienda** | Cada tienda crea su cuenta en Culqi y conecta sus API keys en nuestro panel. El dinero va directo a su cuenta. | Simple legalmente; nosotros no manejamos dinero de terceros; cada quien asume su PCI/KYC. | Onboarding más fricción; no cobramos comisión sobre transacciones fácilmente. |
| **B) Marketplace / split payments** | Nosotros somos el comercio maestro y hacemos "split" hacia sub-comercios. | Podemos cobrar comisión (fee) por transacción; onboarding unificado. | Requiere capacidades de marketplace de la pasarela; más responsabilidad regulatoria/KYC; más complejo. |

> **Recomendación MVP:** empezar con el **Modelo A** (credenciales propias por tienda). Migrar a marketplace (Modelo B) cuando el volumen lo justifique y la pasarela lo soporte. **Confirmar con negocio antes de implementar.**

---

## 7. Medios de pago del futuro (tendencias 2025–2026)

Priorizar en el roadmap según relevancia para Perú:

1. **Billeteras digitales (digital wallets)** — ya son el presente en Perú (Yape/Plin). Global: se espera **5.2 mil millones de usuarios (>60% población) para 2026**. → **Prioridad máxima**.
2. **Pagos en tiempo real (real-time payments)** — ~428 mil millones de transacciones/año para 2026 (>25% de pagos electrónicos globales). Yape ya es RTP de facto. → **Alta**.
3. **Pagos cuenta-a-cuenta (A2A) vía open banking** — evitan las redes de tarjetas, comisiones más bajas. Creciente. → **Media** (seguir de cerca).
4. **BNPL (Buy Now, Pay Later)** — mercado de **US$ 560 mil millones en 2025**, hacia US$ 911 mil millones en 2030. En Perú disponible vía **Cuotéalo (Culqi/BCP)**. Ojo: creciente regulación (checks de solvencia, transparencia). → **Media**.
5. **Pagos con IA / agentic payments** y **embedded finance** — emergente, aún no crítico para el MVP. → **Baja / observar**.
6. **Payment orchestration** — nuestra capa de abstracción (sección 5) es precisamente el primer paso hacia esto: enrutar transacciones al mejor proveedor. → **Ya contemplado**.

---

## 8. Próximos pasos sugeridos

1. [ ] Confirmar con negocio el **modelo de recepción de dinero** (sección 6).
2. [ ] Crear cuenta sandbox en **Culqi** y obtener API keys de integración.
3. [ ] Definir modelos Prisma `pagos`, `pago_eventos`, `tienda_pasarela_config`.
4. [ ] Implementar la **interfaz de proveedor** + `culqi.provider.js`.
5. [ ] Implementar endpoint de **token** y de **cargo** (tarjeta + Yape).
6. [ ] Implementar **webhook** con verificación de firma e idempotencia.
7. [ ] Documentar en Swagger y probar el flujo end-to-end en sandbox.
8. [ ] Cifrado de credenciales de tienda en reposo.

---

## Fuentes

- [Culqi — Pagos Online (documentación)](https://docs.culqi.com/es/documentacion/pagos-online/)
- [Culqi — Cargos Únicos con Yape (tokens Yape)](https://docs.culqi.com/es/documentacion/pagos-online/cargo-unico/tokens-yape)
- [Culqi — Pasarela de pagos online](https://culqi.com/productos/online-pasarela-de-pagos/)
- [Perfil API de Culqi (API Evangelist)](https://github.com/api-evangelist/culqi)
- [Alaz — Culqi vs Izipay vs Niubiz 2026](https://alaz.pe/blog/pasarela-de-pago-peru-como-elegir-culqi-stripe-izipay-niubiz)
- [DevSprinters — Integrar Pasarelas de Pago en Perú: Guía Técnica 2026](https://devsprinters.site/blog/integrar-pasarelas-de-pago-peru)
- [Lain-DS — Cómo cobrar con Yape y Plin desde tu propio sistema](https://www.lainds.com/perspectivas/como-cobrar-con-yape-y-plin-desde-tu-sistema)
- [Mercado Pago — Integrar Yape en Checkout API](https://www.mercadopago.com.pe/developers/es/docs/prestashop/payment-configuration/checkout-api/yape)
- [Yape (Wikipedia)](https://en.wikipedia.org/wiki/Yape_(payment))
- [Bluefin — Tokenización y cumplimiento PCI](https://www.bluefin.com/bluefin-news/tokenization-cardholder-data-pci-compliance/)
- [Solidgate — Requisitos PCI DSS 4.0](https://solidgate.com/blog/pci-dss-requirements/)
- [SISA — Qué es la tokenización PCI DSS](https://www.sisainfosec.com/blogs/what-is-pci-dss-tokenization-its-guidelines-explained/)
- [J.P. Morgan — Payments Outlook: Trends 2026](https://www.jpmorgan.com/insights/payments/trends-innovation/payments-outlook-trends-2026)
- [GR4VY — 112 payment industry statistics for 2026](https://gr4vy.com/posts/112-payment-industry-statistics-for-2026-trends-costs-methods-and-more/)
- [DigiPay.Guru — Digital Payment Trends 2026](https://www.digipay.guru/blog/top-digital-payment-trends/)
