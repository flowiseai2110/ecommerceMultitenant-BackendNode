# Integración con Yape y Plin

> Análisis de las opciones para cobrar con Yape y Plin en la plataforma.
> Complementa a [`00-analisis-general.md`](./00-analisis-general.md) y [`01-culqi-integracion-tecnica.md`](./01-culqi-integracion-tecnica.md).
> Investigación: septiembre 2026.

---

## 1. Idea clave: Yape ≠ Plin (arquitectónicamente)

| | **Yape** | **Plin** |
|---|---|---|
| Qué es | App/billetera propia (del BCP, grupo Credicorp) | **NO es una app**: es una función compartida **dentro** de las apps de BBVA, Interbank, Scotiabank, BanBif, Ligo y varias cajas |
| ¿Hay "API de Plin"? | Sí, existe integración (vía PSP o directa) | **No existe una "API de Plin" para integrar** directamente |
| Cómo se cobra online | Código de aprobación / token / One Shot / QR interoperable | **Solo vía QR interoperable** (o transferencia) |
| Usuarios | +17 M | Millones (7+ entidades financieras) |

> **Consecuencia de diseño:** no integramos "Yape" y "Plin" como dos APIs separadas. Integramos **(a)** Yape (vía pasarela) y **(b)** el **QR interoperable del BCRP**, que Plin *y* Yape *y* cualquier billetera pueden pagar. Modelar los medios de pago como **conceptos flexibles**, no como una lista fija (vendrán más rieles, ej. TAPP esperado a fines de 2026).

---

## 2. Las 4 vías reales de integración

### Vía A — Yape a través de pasarela (Culqi / Izipay / Niubiz / Mercado Pago) ⭐ recomendada para MVP
- El usuario paga con Yape mediante **código de aprobación** (OTP de 6 dígitos, válido ~2 min) o **One Shot** (redirección a la app, un toque).
- La pasarela tokeniza y nosotros creamos el cargo con el `token_id` (ver `01-culqi-integracion-tecnica.md` §4).
- **Límites Yape:** máx. **S/ 2,000** por operación, solo **PEN**.
- **Confirmación asíncrona:** el usuario confirma en su app → nos llega **webhook**, no respuesta del navegador.
- ✅ Rápido de implementar, un solo flujo unificado con tarjetas.
- ❌ No cubre Plin (Culqi solo soporta Yape).

### Vía B — QR interoperable del BCRP ⭐ recomendada para cubrir Plin
- Un **único QR** que pueden pagar Yape, Plin, Bim y cualquier billetera conectada a la **CCE (Cámara de Compensación Electrónica)** del BCRP.
- Obligatorio y regulado por el BCRP (Estrategia de Interoperabilidad, Circular 0005-2025-BCRP). +186 millones de transacciones interoperables/mes (jun 2025).
- **Para e-commerce se usa QR dinámico:** único por pedido, con **monto fijo, referencia de orden y expiración** (~15 min).
- **Confirmación por webhook:** cliente escanea → PSP verifica con la entidad financiera → webhook marca el pedido pagado → liquidación **T+1**.
- Se accede a través de un **PSP/pasarela** (ej. TAYPI) que opera sobre la CCE bajo supervisión SBS; el comercio **no** se conecta directo a la CCE.
- ✅ **Cubre Yape Y Plin (y todas las billeteras) con una sola integración.**
- ✅ Sin tope de S/ 2,000 (depende del PSP/entidad).
- ❌ UX de "escanear QR" (mejor en desktop; en mobile requiere QR + apertura de app).

### Vía C — Integración directa con Yape (Yape Empresa / One Shot / On File)
- Yape lanzó **Yape Empresa** y soluciones **Yape One Shot** (compra única sin códigos, redirección a la app) y **Yape On File** (pago recurrente "1 clic", guarda la billetera una vez).
- Se accede vía **PSP habilitados** (ej. OKTO Payments concretó conexión directa en 2026), no como conexión abierta para cualquier comercio.
- Ventajas: **+8–10% en tasa de aprobación** vs. métodos tradicionales, mejor conciliación, menos intermediarios, menor costo operativo.
- ❌ Requiere volumen / acuerdo con el PSP; overhead comercial. **No para el MVP.**

### Vía D — Conexión directa con BCP (API Yape propia)
- Solo para **operaciones de alto volumen** con acuerdo directo con BCP.
- ❌ Descartada para nuestra etapa.

---

## 3. Recomendación por etapas

```
MVP (ahora)          →  Vía A (Yape por Culqi)  +  tarjetas
                        Cubre el caso más común, un solo flujo de cargo.

Fase 2 (cubrir Plin) →  Vía B (QR interoperable por PSP: TAYPI u otro)
                        Con un QR atiendes Yape + Plin + toda billetera.

Fase 3 (escala)      →  Vía C (Yape directo One Shot/On File vía PSP)
                        Mejor conversión y recurrencia cuando haya volumen.
```

> Nuestra **capa de abstracción de proveedores** (`payment-provider.interface.js`) hace que pasar de A → B → C no reescriba la lógica de negocio, solo se agregan providers.

---

## 4. Flujos técnicos

### 4.1 Yape vía pasarela (Vía A) — código de aprobación
```
Cliente                Frontend            Backend           Culqi         Yape app
  │  elige Yape           │                  │                 │              │
  │──────────────────────►│                  │                 │              │
  │  abre Yape, copia     │                  │                 │              │
  │  "código aprobación" ─┼── nº cel + OTP ──►│ (Culqi.js, pk_) │              │
  │                       │                  │── tokeniza ─────►│              │
  │                       │◄─ token_id ──────┤                 │              │
  │                       │── POST /pagos/cargo {token} ───────►│ crea charge  │
  │                       │                  │                 │── push ─────►│ confirma
  │                       │                  │◄════ WEBHOOK charge.succeeded ══┤
  │                       │                  │  → marca pedido PAGADO          │
```

### 4.2 QR interoperable (Vía B) — cubre Plin y Yape
```
Backend                         PSP (CCE/BCRP)             Cliente (Yape/Plin)
  │  POST crear QR dinámico        │                          │
  │  {monto, ref pedido, exp} ────►│                          │
  │◄── payload QR / imagen ────────┤                          │
  │  muestra QR al cliente ────────┼─────────────────────────►│ escanea con su
  │                                │                          │ app bancaria/Yape
  │                                │◄── paga ─────────────────┤
  │◄════ WEBHOOK pago confirmado ══┤                          │
  │  → marca pedido PAGADO         │  liquidación T+1         │
```

---

## 5. Impacto en nuestro modelo de datos

Reafirma el diseño de [`00-analisis-general.md`](./00-analisis-general.md) §5. Ajustes:

- `pagos.metodo`: enum flexible → `tarjeta | yape | plin | qr_interoperable | pago_efectivo`.
  - Para QR interoperable, `metodo` puede quedar como `qr_interoperable` y guardar en metadata la billetera real si el PSP la reporta (yape/plin/otra).
- `pagos.proveedor`: `culqi | taypi | izipay | niubiz | ...` (el PSP que procesó).
- Guardar **referencia del QR** y su **expiración** cuando aplique (Vía B).
- **Todo se confirma por webhook** → `pago_eventos` + idempotencia siguen siendo obligatorios (ver §7 del doc Culqi).
- Modelar medios como datos configurables por tienda (`tienda_pasarela_config`), no hardcodeados: cada tienda activa los métodos que su PSP soporte.

---

## 6. Consideraciones y pendientes

1. **Plin no tiene API directa** → la única forma "programática" de cobrar Plin online es el **QR interoperable** vía un PSP que opere sobre la CCE. Confirmar qué PSP usaremos (TAYPI aparece como opción con SDK JS/TS, API REST y webhooks).
2. Culqi (recomendado en MVP) **solo cubre Yape**, no Plin. Si el negocio exige Plin desde el día 1, hay que sumar un PSP de QR interoperable en paralelo.
3. **Costos QR interoperable (referencia TAYPI):** ~**2.50% + S/ 0.20** por transacción + IGV. Comparar con comisiones de Culqi para Yape.
4. Verificar **tope por operación** y **liquidación (T+1)** con cada PSP.
5. Tendencia a vigilar: el BCRP avanza en un esquema tipo **UPI** (pagos en tiempo real); nuestra capa de abstracción debe poder incorporar nuevos rieles (TAPP a fines de 2026).
6. Confirmar si vamos por **Yape One Shot/On File** (Vía C) en fase 3 y con qué PSP (OKTO u otro), especialmente para **suscripciones/recurrencia**.

---

## Fuentes

- [Lain-DS — Cómo cobrar con Yape y Plin desde tu propio sistema](https://www.lainds.com/perspectivas/como-cobrar-con-yape-y-plin-desde-tu-sistema)
- [Yape — Compras por internet (código de aprobación)](https://www.yape.com.pe/preguntas-frecuentes/compras-por-internet/como-puedo-tener-la-opcion-de-compras-por-internet-codigo-de-aprobacion-yape-en-l)
- [Credicorp — Yape lanza Yape Empresa](https://grupocredicorp.com/en/yape-launches-yape-empresa-exclusively-for-businesses/)
- [Comunidaria — OKTO Payments integración directa con Yape (One Shot / On File)](https://comunidaria.com/okto-payments-integracion-directa-yape-peru/)
- [BBVA — Plin para Negocios/Empresas](https://www.bbva.pe/empresas/servicios-digitales/cobra-con-plin-persona-negocio.html)
- [Scotiabank — Plin: paga y cobra con QR](https://www.scotiabank.com.pe/Personas/Canales-digitales/pagos/transferencias-interbancarias-plin)
- [BCRP — Estrategia de interoperabilidad de pagos minoristas](https://www.bcrp.gob.pe/sistema-de-pagos/interoperabilidad/estrategia-de-interoperabilidad-de-los-pagos-minoristas.html)
- [TAYPI — QR interoperable para e-commerce en Perú](https://taypi.pe/blog/qr-interoperable-ecommerce-peru/)
- [TAYPI — Cómo funciona la interoperabilidad QR del BCRP](https://taypi.pe/blog/como-funciona-interoperabilidad-qr-bcrp/)
- [Infobae — BCRP avanza en replicar UPI en Perú](https://www.infobae.com/peru/2025/11/20/bcrp-avanza-en-peru-el-plan-para-replicar-upi-el-sistema-de-pagos-en-tiempo-real-mas-grande-del-mundo/)
