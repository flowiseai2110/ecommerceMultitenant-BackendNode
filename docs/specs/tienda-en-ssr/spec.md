# Spec: la tienda se conoce en el servidor (SSR con tienda)

> Estado: **deuda técnica** (2026-10-11). Propuesta sin implementar, en pausa mientras se siguen agregando funcionalidades. Al retomarla, revisar primero si las piezas, rutas o páginas nuevas cambian la tabla de D3 o la lista de D7.
> Origen: trade-off del Abstract Factory por rubro ([layout-por-rubro](../layout-por-rubro/spec.md)). El costo más grande del patrón no está en el patrón: está en que el SSR no conoce la tienda. Esta spec responde la pregunta abierta de layout-por-rubro: "¿conviene cargar la tienda en el SSR?".
> Repos: FrontendStore (todo). BackendNode no cambia.

## Problema

El 2026-06-11 (commit `22dea7b`) `storeResolver` dejó de pedir la tienda en el servidor y pasó a devolver `{}`. El objetivo era que el HTML llegara en menos de 50 ms aunque Railway estuviera dormido (ver "Cold start" en Riesgos). Funcionó para eso, pero hoy el servidor entrega un cascarón vacío:

| Qué | Hoy en el HTML del servidor |
|---|---|
| `<title>` y meta | `tienda virtual`, sin `og:title`, `og:image` ni `description` de la tienda |
| Contenido | Capa "Cargando tienda…" encima del armazón (`store()?.id` vacío) |
| Piezas del rubro | `<app-slot-rubro>` vacío (`ngSkipHydration`): header, home, pie y menú inferior se dibujan después |
| Datos de página | Queries con `enabled: isPlatformBrowser(...)`: producto, home, categoría y vitrinas no se piden |
| Rutas por rubro | `rutaDelRubro` deja pasar todo en el servidor: `/carrito` de un hotel se renderiza y luego el navegador lo cambia a no encontrado |

Además, **la home de una tienda con subdominio no pasa por el SSR**. `routes.txt` prerenderiza `/`, `/productos`, `/rastrear` y `/not-found` sin tienda, y tanto `express.static(..., { index: 'index.html' })` como el estático de Vercel sirven ese HTML a **todos** los subdominios.

Consecuencias:

- **Vista previa al compartir:** WhatsApp, Facebook e Instagram no ejecutan JS. Un link de tienda, producto o tour compartido muestra "tienda virtual" sin imagen. Es el canal principal de venta de las tiendas.
- **SEO:** Google renderiza JS, pero tarde y con presupuesto. Bing y los demás indexan el cascarón.
- **LCP y CLS:** el contenido aparece después de tres pasos en cadena (hidratar → pedir tienda → bajar el chunk de la pieza), y el header cambia de forma cuando llegan sus piezas.

## Decisión

**El servidor pide la tienda una vez, antes de renderizar, con un tiempo máximo. Si la consigue, renderiza la tienda completa. Si no, entrega el cascarón CSR (`index.csr.html`) como hoy.**

No hay estado intermedio. En ningún caso el servidor renderiza un HTML "sin tienda" que el navegador tenga que hidratar con tienda. Eso es lo que obliga hoy a usar `ngSkipHydration`, y al eliminar ese caso los slots pueden hidratarse.

```
request ─► server.ts: slug (subdominio o 1er segmento)
             │
             ├─ ruta CSR (/carrito, /checkout) ───────────────► index.csr.html (como hoy)
             │
             ├─ GET /store/tiendas?slug= (máx. 1.5 s, caché 60 s)
             │     ├─ activa ──► CommonEngine.render + TIENDA_SSR ─► HTML con tienda (cacheable en CDN)
             │     ├─ no existe / inactiva ───────────────────► index.csr.html, status 404
             │     └─ timeout / 5xx / red ────────────────────► index.csr.html, no-store
             │                                                  (la petición sigue y despierta a Railway)
             └─ sin slug (/not-found, /mantenimiento…) ──────► render normal
```

### Alternativas descartadas

- **Pedir la tienda dentro de Angular (resolver en el servidor) sin cascarón de respaldo:** si Railway tarda, el render espera o se corta a medias. Un render a medias deja otra vez un HTML "sin tienda" que hay que hidratar con tienda.
- **Migrar ya a `AngularNodeAppEngine` con `RenderMode` por ruta:** ordenaría `CSR_ONLY_PATHS`, el prerender y los status codes (`RESPONSE_INIT`). Es un cambio aparte. Esta spec funciona con `CommonEngine` y no lo bloquea.
- **Prerender por tienda (SSG):** las tiendas cambian desde el admin en cualquier momento y son N subdominios. La caché de CDN con `stale-while-revalidate` da casi lo mismo sin un build por tienda.

## Diseño (FrontendStore)

### D1. `server.ts` pide la tienda

- `slugDeRequest(req)`: `extractSubdomain(host)`; si viene vacío, el primer segmento del path salvo las rutas raíz (`not-found`, `mantenimiento`, `test-map` y archivos con extensión). `extractSubdomain` ya es una función pura en `core/utils/subdomain.util.ts` y se importa tal cual.
- `tiendaParaSsr(slug)`: `fetch` a `${apiBaseUrl}/store/tiendas?slug=…` con `SSR_API_HEADERS`. Usa `Promise.race` contra 1.5 s, **sin abortar**: si gana el timeout, la petición sigue y despierta a Railway para el navegador. En Vercel se mantiene viva con `waitUntil` de `@vercel/functions`.
- Caché en memoria por instancia: `Map<slug, { tienda, vence }>` de 60 s. Las instancias calientes de Vercel la reutilizan. Los errores no se cachean.
- Con tienda: `commonEngine.render({ ..., providers: [..., { provide: TIENDA_SSR, useValue: tienda }] })`.

### D2. La tienda pasa al navegador sin otra petición

- Token `TIENDA_SSR` (`core/ssr/tienda-ssr.token.ts`), opcional, como `SSR_API_HEADERS`.
- `storeResolver` en el servidor: con `TIENDA_SSR` hace lo mismo que en el navegador (`setStore`, `cartState.setStoreSlug`, meta, `og:*`, schema de organización con el origin del request, favicon). También siembra la query `QueryKeys.store(slug)` y guarda la tienda en `TransferState` (`makeStateKey<Tienda>('tienda')`).
- `storeResolver` en el navegador: si `TransferState` trae la tienda del mismo slug, siembra la query (`setQueryData`) y resuelve **síncrono**. Sin petición, el primer render del navegador coincide con el del servidor.
- La petición del servidor sale de `server.ts` (fetch), no de `HttpClient`, así que la caché de transferencia HTTP no la cubre. Por eso se usa `TransferState` a mano.

### D3. Las piezas del rubro se hidratan

- `precargarUi(tipo)` devuelve `Promise<void>` y `storeResolver` la **espera** en los dos lados. Cuando la ruta se dibuja, todas las piezas del rubro ya están en `cargadas`.
- `SlotRubroComponent` resuelve el componente con `computed(() => piezaCargada(cargador))`, sin `effect` ni promesa cuando la pieza está cargada. El camino asíncrono queda solo para el cambio de tienda en el navegador.
- El slot deja de llevar `ngSkipHydration` en el `host`. Cada uso lo pone en la plantilla solo si su pieza depende de estado del navegador:

| Slot | Hidrata | Por qué |
|---|---|---|
| `home` | sí | El banner de carrito abandonado ya alterna con `[style.display]` (`home-comercio`) |
| `pieAyuda`, `navMovil`, `headerBeneficios` | sí | Solo dependen de la tienda |
| `headerAcciones` | **no** (`ngSkipHydration`) | Contador del carrito desde `localStorage` |
| `headerCapas` | **no** | Mini carrito |
| `cuentaHistorial`, `cuentaInvitacion` | **no** | Sesión de Supabase, solo en el navegador |

  La tabla se revisa en la tarea 2.3 pieza por pieza: si una pieza puede alternar con clase o `[style.display]`, se hidrata.

### D4. Prerender fuera de las rutas de tienda

- `routes.txt`: solo `/not-found`. `/`, `/productos` y `/rastrear` dependen de la tienda.
- `express.static(browserDistFolder, { maxAge: '1y', index: false })`: `/` ya no cae en un `index.html` estático.
- Verificar que el build no deje `browser/index.html` ni `browser/productos/index.html`. Vercel sirve el `outputDirectory` antes del rewrite a `/api/index`.

### D5. Rutas por rubro también en el servidor

- `rutaDelRubro` en el servidor lee `TIENDA_SSR` y decide igual que el navegador. Ya no hace falta el "en el servidor deja pasar", porque sin tienda no se renderiza (D1).
- `/carrito` de un hotel responde con no encontrado desde el primer HTML. El status 404 en esas rutas queda para la migración a `AngularNodeAppEngine`.

### D6. Caché de CDN

- HTML renderizado con tienda: `Cache-Control: public, s-maxage=60, stale-while-revalidate=600`. El HTML del SSR no depende del visitante (no hay cookies ni `localStorage` en el servidor), así que es cacheable.
- Cascarón de respaldo (timeout/5xx): `no-store`, para no cachear un fallo.
- Efecto: Railway recibe como mucho una petición por URL por minuto desde el SSR, y el cold start lo paga un visitante cada tanto, no cada uno.
- Un cambio en el admin tarda hasta 60 s en verse en el primer HTML. El navegador igual vuelve a pedir la tienda al vencer el `staleTime` (2 min).

### D7. Datos de página en el servidor (fase 2)

Con la tienda conocida, las páginas que se comparten habilitan sus queries en el servidor y ponen sus `og:*`: producto, tour, habitación, salón y evento; después, categoría y vitrinas. Van por `HttpClient`, así que la caché de transferencia HTTP evita la segunda petición. Cada página es una tarea aparte con su verificación de hidratación.

## Requisitos

- **SS1** Con Railway despierto, el HTML de `/<slug>`, `<slug>.ecompyme.com/` y `/<slug>/producto/:id` trae el `<title>`, la `description` y el `og:image` de la tienda, sin la capa "Cargando tienda…".
- **SS2** Con Railway dormido (o API caída), el HTML llega en ≤ 1.6 s y es `index.csr.html`. La tienda carga en el navegador como hoy, incluida la redirección a mantenimiento (R14.4).
- **SS3** El navegador no vuelve a pedir `/store/tiendas` en la primera carga cuando el servidor la mandó (D2). Criterio: una sola petición en la pestaña Network, la del servidor.
- **SS4** Sin errores de hidratación (NG05xx) ni NG0506 en ningún rubro: zapatillas, demobooking, tour-test, evento-test y casa-alborada, en home, ficha y cuenta.
- **SS5** Ningún subdominio recibe HTML prerenderizado de otra tienda o sin tienda (D4).
- **SS6** Una ruta de otro rubro (`/demobooking/carrito`) muestra no encontrado desde el HTML del servidor (D5).
- **SS7** Medición antes y después (Lighthouse móvil, home de zapatillas y de demobooking): LCP y CLS no empeoran con Railway despierto. Se anotan en "Decisiones tomadas al implementar".

## Riesgos

- **TTFB con Railway despierto:** el render espera la tienda (Vercel → Railway, ~100–300 ms) más el render. Mitigación: caché en memoria (D1) y en CDN (D6). Se acepta a cambio de SS1.
- **Cold start:** el peor caso pasa de ~50 ms a 1.5 s de espera antes del cascarón. Mitigación: el timeout no aborta la petición, que despierta a Railway, y la CDN sirve HTML viejo mientras revalida. Si molesta, la solución de fondo es evitar que Railway duerma (plan pago o un ping externo cada pocos minutos), no esta spec.
- **Hidratación:** al hidratar los slots aparecen diferencias que hoy esconde `ngSkipHydration`, por ejemplo `@if` sobre estado del navegador dentro de una pieza. Mitigación: la tabla de D3, revisión pieza por pieza y SS4.
- **Estabilidad de la app:** esperar las piezas en el resolver no debe dejar timers en la zona (ver la nota de NG0506 y el scroll del router). El timeout de D1 vive en `server.ts`, fuera de Angular.
- **Caché de CDN con host:** se asume que la clave de caché de Vercel incluye el host (cada subdominio con su HTML). **Verificar antes de activar D6** con dos subdominios y la cabecera `x-vercel-cache`. Si no lo incluye, se agrega `Vary: Host` o se omite D6.
- **Datos de la tienda en el HTML:** `TransferState` publica el objeto `Tienda` en la página. Es lo mismo que ya devuelve el endpoint público `/store/tiendas`, pero se revisa que no traiga campos internos.

## Pasos

1. **Medir** el estado actual (SS7) y guardar capturas de la vista previa en WhatsApp de una tienda y un producto.
2. **Tienda en el servidor:** D1, D2, D4. Los slots siguen con `ngSkipHydration`. Ya se gana SS1, SS2, SS3 y SS5.
3. **Slots hidratables y rutas en el servidor:** D3 y D5.
4. **Caché de CDN:** D6, después de verificar la clave de caché.
5. **Datos de página (fase 2):** D7, página por página.

## Tareas

- [ ] 1.1 Lighthouse móvil (home de zapatillas y demobooking) y vista previa en WhatsApp de `/zapatillas`, un producto y un tour. Anotar resultados.
- [ ] 2.1 `core/ssr/tienda-ssr.token.ts` y `slugDeRequest` / `tiendaParaSsr` en `server.ts`, con timeout de 1.5 s sin abortar, `waitUntil` y caché de 60 s.
- [ ] 2.2 `server.ts`: con tienda → render con `TIENDA_SSR`; no existe → `index.csr.html` con 404; fallo → `index.csr.html` con `no-store`.
- [ ] 2.3 `storeResolver`: rama del servidor con `TIENDA_SSR` (meta, `og:*`, schema y `TransferState`) y rama del navegador que lee `TransferState` y siembra `QueryKeys.store(slug)`.
- [ ] 2.4 `routes.txt` solo con `/not-found`, `index: false` en `express.static`, y revisar `dist/.../browser` tras el build.
- [ ] 3.1 `precargarUi` devuelve una promesa y el resolver la espera. `SlotRubroComponent` con `computed` síncrono.
- [ ] 3.2 Quitar `ngSkipHydration` del `host` del slot y ponerlo en las plantillas según la tabla de D3, revisando cada pieza.
- [ ] 3.3 `rutaDelRubro` en el servidor con `TIENDA_SSR`.
- [ ] 3.4 Actualizar la sección SSR de [layout-por-rubro](../layout-por-rubro/spec.md) (principio 5, RU5) y el `CLAUDE.md` de la tienda ("El slot no se hidrata…").
- [ ] 3.5 Verificación SS4 y SS6 en los cinco rubros (Playwright, consola sin NG05xx/NG0506, scroll al navegar).
- [ ] 4.1 Verificar la clave de caché de Vercel con dos subdominios y luego activar `s-maxage` / `stale-while-revalidate`.
- [ ] 5.x Una tarea por página en D7 (producto, tour, habitación, salón, evento, categoría).

## Preguntas abiertas

- ¿1.5 s es el timeout correcto? Depende de la latencia real Vercel → Railway, que se mide en 1.1. Si el p95 con Railway despierto es bajo (< 400 ms), se puede bajar a 1 s.
- ¿Se migra a `AngularNodeAppEngine` después del paso 3? Daría status 404 reales en rutas de otro rubro y reemplazaría `CSR_ONLY_PATHS` por `RenderMode.Client`.
- Dominio propio de una tienda (`NG_ALLOWED_HOSTS`): `slugDeRequest` no lo resuelve con `extractSubdomain`. Haría falta un mapeo dominio → slug en el backend. Queda fuera hasta que exista el primer dominio propio.
