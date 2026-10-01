# Plan técnico: consulta de RUC para autocompletar la factura

> Implementa [spec.md](spec.md). Tareas y estado: [tasks.md](tasks.md).

## Flujo

```
FrontendStore · checkout paso 2 · Factura
  (ngModelChange) RUC → esRucValido() (módulo 11)        ✗ → error de formato, sin red
    ✓ → RucService.consultar() → GET /api/v1/store/sunat/ruc/:ruc
          │
BackendNode · modules/sunat/ruc.service.js
  esRucValido()                                           ✗ → 400
  obtenerTrozo(ruc.slice(0,5))
    MemoryCache (max 8 trozos, TTL 6 h) ── hit ──┐
    enVuelo (Map de promesas, dedupe) ───────────┤
    fetch `${SUNAT_PADRON_URL}/${prefijo}.json`  │  timeout 8 s → 503 · 404 → trozo vacío
      → Map(ruc → fila)                          │
  registros.get(ruc) ◄───────────────────────────┘        ✗ → 404
  → { razonSocial, estado, condicion, ubigeo, direccion, activo, habido, ... }
          │
FrontendStore
  razonSocial ← data.razonSocial
  direccionFiscal ← direccion + UbigeoService.buscarDistritoPorCodigo(ubigeo)
  errorComprobante('ruc') → bloquea si !activo
```

## Formato del trozo (tribio-padron-ruc)

```json
{ "prefix": "20100", "updated_at": "2026-10-01T17:28:07Z",
  "columns": ["ruc","razon_social","estado","condicion","tipo_contribuyente","ubigeo","direccion","departamento","provincia","distrito"],
  "records": [["20100047218","BANCO DE CREDITO DEL PERU","ACTIVO","HABIDO","PERSONA JURIDICA","150114","JR. CENTENARIO Nro. 156 ...",null,null,null], ...] }
```

Las filas se leen por el nombre de columna (`columns`), no por la posición, para tolerar que se agreguen columnas.

## Decisiones

| Decisión | Por qué | Alternativa descartada |
|---|---|---|
| Padrón partido por CDN (tribio) | Costo cero, sin BD ni almacenamiento; cada consulta baja 1–2 MB | Padrón completo en Postgres (1–2 GB, no entra en el free tier) · API comercial (costo o cuota baja) |
| Consulta **vía backend**, no desde el navegador | El trozo pesa 1,36 MB, demasiado para el móvil en el checkout. El backend lo cachea y responde menos de 1 KB | `fetch` directo al CDN desde la tienda |
| Caché en memoria por trozo (`MemoryCache`, max 8, TTL 6 h) | El padrón cambia una vez al día. Cada trozo indexado ocupa varios MB, por eso son pocos | Cachear por RUC (la mayoría de las consultas de una tienda repiten pocos prefijos) |
| Dedupe de descargas en vuelo (`enVuelo`) | Dos compradores con el mismo prefijo no bajan el trozo dos veces | — |
| 404 del CDN → trozo vacío cacheado | Ningún RUC usa ese prefijo; evita volver a pedirlo | Propagar el 404 como 503 |
| `Cache-Control` en la ruta y solo en 200 | El middleware `cache()` lo pone antes de saber si hay error, y cachearía un 503 por 1 h | `router.use("/sunat", cache(3600), ...)` |
| Nombres de ubigeo en el **frontend** (`peru-utils`) | La tabla `ubigeos` de la BD tiene 35 filas y otro formato de código (`01150101`). El storefront ya trae el dataset INEI completo | Resolverlos en el backend con Prisma |
| URL base configurable (`SUNAT_PADRON_URL`) | Permite pasar a un fork propio sin tocar código | URL fija |
| Bloquear solo un RUC no ACTIVO; avisar si no se encuentra | Un RUC nuevo puede no figurar hasta el siguiente corte diario, y una caída del CDN no debe costar ventas | Bloquear también 404/503 |

## Riesgos

- **Dependencia de un repo de terceros sin licencia.** Si el dueño lo borra o deja de actualizarlo, la consulta responde 503/404 y el checkout pasa a ingreso manual: no se rompe. Mitigación: hacer un fork (la GitHub Action corre gratis en el fork) y apuntar `SUNAT_PADRON_URL` a `https://cdn.jsdelivr.net/gh/<usuario>/tribio-padron-ruc@latest/chunks`.
- **Caché de `@latest` en jsDelivr.** Puede servir el trozo del día anterior durante unas horas. Para facturar es aceptable.
- **Memoria.** Con 8 trozos en caché son decenas de MB como máximo. En Railway, si hace falta, se puede bajar `max`.
- **Latencia de la primera consulta** de un prefijo: 2–5 s (medido: 4,5 s sin caché y 0,17 s con caché). El checkout muestra "Buscando en SUNAT…".

## Archivos

**BackendNode**
- `modules/sunat/ruc.service.js`: `esRucValido`, `consultarRuc`, caché y descarga.
- `modules/sunat/ruc.store.routes.js`: `GET /ruc/:ruc`.
- `modules/sunat/__tests__/ruc.service.test.js`: 7 tests (fetch simulado).
- `routes/store/index.js`: monta `/sunat`.
- `config/index.js`: `config.sunat.padron` (`SUNAT_PADRON_URL`, `SUNAT_PADRON_TIMEOUT_MS`).

**FrontendStore**
- `src/app/models/pedido.model.ts`: `esRucValido`, `ConsultaRuc`.
- `src/app/features/checkout/services/ruc.service.ts`: `RucService.consultar`.
- `src/app/core/services/ubigeo.service.ts`: `buscarDistritoPorCodigo`.
- `src/app/features/checkout/checkout-page/checkout-page.component.ts`: `onRucChange`, `direccionFiscalSunat`, estado bajo el input, regla de `errorComprobante('ruc')`, consulta al precargar desde la cuenta.
