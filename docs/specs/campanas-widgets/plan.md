# Plan técnico: campañas de temporada y widgets del storefront

> Implementa [spec.md](spec.md). Tareas y estado: [tasks.md](tasks.md).

## Flujo

```
Admin · Diseño > Campañas
  GET  /admin/tiendas/:id/campanas/calendario?anio=2027   → presets con ventana calculada + estado (activa, sugerida)
  PUT  /admin/tiendas/:id/diseno { campanas, widgets }     → valida (Zod) y guarda en tienda_configuraciones
  GET  /admin/tiendas/:id/diseno/vista-previa?fecha=...    → diseno resuelto ese día
  POST /uploads/image { folder: "widgets" }                → PNG/WebP → WebP 512 px

Storefront
  GET /store/tiendas?slug=x  → data[0].diseno = { anuncio, hero, widgets, campana: CampanaResuelta | null }
    DisenoState: config = base + campana.paleta; secciones + cinta/oferta; widgets por ancla
    ThemeService: cache con hasta = campana.fin
```

## Decisiones

| Decisión | Por qué | Alternativa descartada |
|---|---|---|
| Presets como **código** (`modules/campanas/presets.js`), no como tabla | Son de la plataforma, cambian con un deploy y llevan reglas de fecha; no hay que editarlos en caliente | Tabla `campana_presets` con CRUD de superadmin |
| Config de la tienda en `tienda_configuraciones` (claves `campanas` y `widgets`, JSONB) | Mismo patrón que `anuncio` y `hero`: sin migración, solo se agregan claves a `DISENO_CLAVES` | Tabla `tienda_campanas`; conviene recién si llegan métricas por campaña |
| La tienda guarda **personalizaciones**, no copias del preset | Si mejoramos el texto o la paleta de un preset, las tiendas que no lo tocaron reciben la mejora | Copiar el preset entero al activarlo |
| Resolución en el servidor, en `America/Lima` | Un reloj del cliente adelantado o mal configurado no debe cambiar la tienda; además es una sola fuente de verdad para tienda y admin | Resolver en el navegador (lo que hace hoy la simulación) |
| `calendario.js` como **funciones puras** con `ahora` inyectado | Testeable con Jest sin BD ni fake timers; la misma función sirve para la tienda, la vista previa y el calendario | Lógica en el servicio con `new Date()` adentro |
| Opt-in por campaña | Cambiar los colores de una tienda sin aviso genera reclamos; el admin sugiere las campañas según `tiendas.rubro` | Todas activas por defecto |
| Widgets en **anclas** finitas, máximo uno por ancla | Coordenadas libres se rompen entre desktop y móvil y entre variantes de hero, y pueden tapar el CTA | Posición x/y en % por breakpoint |
| Contenido del widget como **unión discriminada** (`tipo`) | Se guarda como JSON; el polimorfismo lo resuelve el componente del storefront (`@switch`), igual que `SeccionHome` | Jerarquía de clases (no sobrevive a la serialización) |
| Imagen solo del bucket propio, PNG/WebP, sin SVG | Evita XSS (SVG con script), hotlinking y rastreo de terceros | Aceptar cualquier URL https |
| `tiendas.rubro` como columna nueva con lista cerrada | Sugiere campañas (R2.5) y luego la estructura inicial; `tipo_negocio` ya significa otra cosa (productos/servicios/ambos) | Reutilizar `tipo_negocio` |
| Cada clave (`campanas`, `widgets`) se reemplaza entera en el PUT | El editor del admin trabaja la lista completa, igual que `PUT /zonas`; sin CRUD por campaña ni estados intermedios | Endpoints CRUD por campaña |
| Un preset se activa una sola vez por tienda | Dos "Día de la Madre" competirían por la misma ventana; para otra fecha está la campaña propia | Varias activaciones con prioridad |
| Campaña propia de máximo 90 días | Más larga es un rediseño, no una campaña; además acota la ventana que hay que revisar | Sin límite |
| URL de imagen validada en el servicio, no en el schema | Necesita el `tiendaId` y `SUPABASE_URL`; la función es pura y testeable igual | `superRefine` con contexto global |
| TTL de 60 s de la caché pública sin cambios | El cambio de campaña llega con hasta 1 min de demora, aceptable; no hace falta invalidar a la hora exacta | Programar la invalidación en cada límite de ventana |

## Modelo de datos

Un solo cambio de esquema: la columna `tiendas.rubro` (`docs/sql/tienda_rubro.sql`, valores en `modules/tenants/rubros.js`). Lo demás son claves nuevas en `tienda_configuraciones` (categoría `diseno`), validadas por `modules/campanas/campanas.schema.js`:

```jsonc
// clave "campanas": personalizaciones por campaña
[
  {
    "id": "c1b2...",               // uuid generado por el admin
    "presetId": "madre",           // null = campaña propia
    "activa": true,
    "inicio": null, "fin": null,   // solo campañas propias: "2026-11-10" / "2026-11-15" (fechas de Lima)
    "anticipacionDias": 20,        // opcionales (0-60): si faltan, se usan los del preset
    "despuesDias": 0,
    "nombre": null,                // obligatorio en campañas propias (máx. 60)
    "paleta": null,                // { primario: "#db2777", neutro: "stone", fondos: {...} }
    "topBar": "Pide hasta el jueves y llega para el domingo",   // máx. 200
    "hero": { "titulo": null, "subtitulo": null, "textoBoton": null },
    "cinta": null,                 // string[] (máx. 6 × 40 caracteres)
    "oferta": null,                // { titulo, texto, textoBoton } | false para quitarla
    "widgets": null                // Widget[]; null = los del preset, [] = ninguno
  }
]

// clave "widgets": widgets permanentes de la tienda
[
  { "contenido": { "tipo": "sello", "texto": "Envío gratis", "forma": "circulo" },
    "ancla": "junto-logo", "tamano": "chico", "animacion": "ninguna", "enMovil": false }
]
```

```ts
type ContenidoWidget =
  | { tipo: 'figura'; figura: 'sol' | 'sombrilla' | 'corazon' | 'flor' | 'globo' | 'regalo' | 'calabaza'
                            | 'murcielago' | 'estrella' | 'copo' | 'arbol' | 'escarapela' | 'corbata' | 'etiqueta' }
  | { tipo: 'imagen'; url: string }
  | { tipo: 'sello'; texto: string; forma: 'circulo' | 'estrella' };

type AnclaWidget = 'hero-arriba-derecha' | 'hero-abajo-derecha' | 'hero-arriba-izquierda'
                 | 'flotante-izquierda' | 'junto-logo';

interface Widget {
  contenido: ContenidoWidget;
  ancla: AnclaWidget;
  tamano: 'chico' | 'mediano' | 'grande';                        // default 'mediano'
  animacion: 'flotar' | 'latir' | 'balanceo' | 'girar' | 'ninguna'; // default 'ninguna'
  enMovil: boolean;                                              // default false
}
```

## Respuesta del calendario (admin)

```jsonc
// GET /admin/tiendas/:id/campanas/calendario?anio=2027
{ "anio": 2027, "rubro": "moda",
  "campanas": [
    { "presetId": "madre", "campanaId": "c1b2...", "nombre": "Día de la Madre",
      "activa": true, "personalizada": true, "sugerida": true,
      "inicio": "2027-04-29T00:00:00-05:00", "fechaClave": "2027-05-09T00:00:00-05:00", "fin": "2027-05-10T00:00:00-05:00" },
    { "presetId": null, "campanaId": "d4e5...", "nombre": "Aniversario", "activa": true, ... }   // campaña propia
  ] }   // ordenadas por inicio
```

## Respuesta al storefront

```jsonc
"diseno": {
  "anuncio": { ... }, "hero": { ... },
  "widgets": [ ... ],
  "campana": {
    "id": "c1b2...", "presetId": "madre", "nombre": "Día de la Madre",
    "inicio": "2027-04-19T00:00:00-05:00",
    "fechaClave": "2027-05-09T00:00:00-05:00",
    "fin": "2027-05-10T00:00:00-05:00",          // exclusivo
    "paleta": { "primario": "#db2777", "neutro": "stone", "fondos": { ... } },
    "topBar": "...", "hero": { "titulo": "...", "subtitulo": "...", "textoBoton": "..." },
    "cinta": ["..."], "oferta": { "titulo": "...", "texto": "...", "textoBoton": "..." } | null,
    "widgets": [ ... ]                              // ya mezclados con los permanentes
  } | null
}
```

## Módulo `modules/campanas/`

```
presets.js          // CAMPANA_PRESETS: catálogo (misma forma que FrontendStore core/theme/campanas.ts)
calendario.js       // puras: fechaClave, ventana, vigente, proximaVentana, aIsoLima, parsearFecha
resolver.js         // puras: efectiva, mezclarWidgets, resolverCampana, disenoPublico, calendarioAnual
campanas.schema.js  // Zod: widgets, campañas, query del calendario y la vista previa; urlsDeWidgetsAjenas
campanas.service.js // getCalendario(tiendaId, anio), getVistaPrevia(tiendaId, fecha): BD + funciones puras
                    // rutas: en tenants/tiendas.admin.routes.js (comparten auth y resolveTiendaIdFromId)
__tests__/calendario.test.js · campanas.schema.test.js · resolver.test.js
```

- **Fechas en Lima:** Perú no tiene horario de verano, así que es UTC−5 fijo. `calendario.js` trabaja con fechas "civiles" (año, mes, día) y convierte al instante con un offset de −5 h. Así no hace falta una librería de zonas horarias.
- **Mezcla del preset:** campo por campo, `personalizacion ?? preset`. `widgets: null` usa los del preset; `oferta: false` la quita.
- **Mezcla de widgets (R4.6):** se parte de los permanentes, cada widget de la campaña reemplaza al de su misma ancla y se aplica el límite de 5.
- **`tiendas.store.routes.js`** responde `diseno = disenoPublico(await getDiseno(id), new Date())`: sin la lista de campañas (no se publican las futuras) y con la vigente resuelta.
- **Vista previa al mediodía de Lima:** las ventanas cambian a las 00:00, así que evaluar a las 12:00 evita ambigüedades en el día pedido.
- **Rutas en `tiendas.admin.routes.js`** y no en un router propio: cuelgan de `/admin/tiendas/:id/...` y reutilizan `resolveTiendaIdFromId` y `requireTiendaAccess`. Calendario con rol `viewer` (solo lectura, igual que `GET /diseno`); vista previa con `editor` (R6).
- **Validación en dos capas:** el schema Zod (en el middleware `validate`) cubre forma, catálogos, límites y reglas entre campos. `saveDiseno` agrega lo que necesita contexto: que las URLs de imagen sean de `tiendas/{tiendaId}/widgets/` (`urlsDeWidgetsAjenas`).

## Storefront (FrontendStore)

- `Tienda.diseno.campana: CampanaResuelta | null` (fechas ISO) → `desdeApi()` → `CampanaVigente` (fechas `Date`; null si ya terminó). La simulación del selector de desarrollo produce la misma forma con `desdePreset()`, así hero, top bar, widgets, tema y home no distinguen el origen.
- `DisenoState.campanaModo`: `tienda` (producción, y valor por defecto en desarrollo), `auto` (simular por fecha), `ninguna` o el id de un preset forzado.
- `config.paleta` = paleta de la campaña si trae; `secciones` = las de la estructura con la cinta y la cuenta regresiva de la campaña tras el hero (reemplazan a las de la estructura solo si la campaña las trae).
- Widgets: `widgetsPorAncla(Tienda.diseno.widgets, campana.widgets)`; `app-widget-slot` en cada ancla y `app-widget` dibuja el contenido según su `tipo`.
- `ThemeService.apply(..., campana.fin)`: el tema cacheado en `localStorage` deja de aplicarse al terminar la campaña.
- `core/theme/campanas.ts` (catálogo + fechas) queda solo para la simulación; es copia de `modules/campanas/presets.js`.
