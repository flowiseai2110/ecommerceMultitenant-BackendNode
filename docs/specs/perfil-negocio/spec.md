# Spec: perfil de negocio (Strategy por tipo de negocio)

> Estado: **propuesta aprobada** (2026-10-11), por implementar en una sesión nueva. Tareas: al final de este archivo.
> Origen: sesión de [hotel-inventario](../hotel-inventario/spec.md) (R1.7: hoteles sin categorías, formulario del tipo de habitación).
> Repos: FrontendAdmin (pasos 1 y 2), FrontendStore (paso 3), BackendNode (paso 4).

## Problema

Cada tipo de negocio (productos, hotel, tours, eventos, locales) tiene sus reglas, pero el frontend las resuelve preguntando por la identidad del negocio en cada pantalla:

```ts
// FrontendAdmin, diseno.component.ts (hoy)
vitrinaTexto = computed(() => (this.esHotel() ? 'Ver habitaciones' : this.esTours() ? 'Buscar tours'
  : this.esEventos() ? 'Ver eventos' : this.esLocales() ? 'Ver salones' : ...));
```

Medición del 2026-10-11 (`esHotel()`, `esTours()`, `esEventos()`, `esLocales()`, `esReservas()`, `tipoNegocio === '…'`, `esNegocioReservas`, `vitrinaDe(`):

| Repo | Condiciones | Archivos con más |
|---|---|---|
| FrontendAdmin | **114** | `diseno.component` (33: 20 ts + 13 html), `reservas-config` (32), `producto-detail` (22), `layout.component.html` (12) |
| FrontendStore | **49** | `hero-banner` (9), `bottom-nav` (8), `store-footer` (7), `policies-section` (7), `reservas.util` (6) |
| BackendNode | pocas | Ya usa Strategy en reservas (`VERTICALES` en `modules/reservas/reservas.service.js`) |

Cada vertical nueva obliga a recorrer todos esos archivos, y los cambios de hotel-inventario R1.7 (ocultar categoría, precio, stock y variantes; "Código" en vez de SKU; migas `breadcrumbHotel`/`breadcrumbHotelUrl`) sumaron más ternarios del mismo tipo.

## Qué ya está bien (no tocar)

- **Backend `VERTICALES`** (reservas.service.js): cada vertical aporta `cotizar`, `estadoInicial`, `enTransaccion`, `whereAbiertas`… y `crearSolicitud` no pregunta "¿es hotel?". Es el modelo a seguir.
- **Mini-strategies existentes** que se absorben en el perfil: `textosCategoria(esHotel)` (admin), `vitrinaDe(tipoNegocio)`, `voz(...)`, `vozAlojamiento(...)` (tienda).
- **Módulos propios de una vertical** (ficha de hotel, calendario de locales, cotización de tours): ya están separados; no van al perfil.

## Decisión

**Strategy declarativo**: un objeto `PerfilNegocio` por tipo de negocio, elegido una vez (`tenantService.perfil()`), en lugar de una jerarquía de clases. En el frontend el ~90 % de las diferencias son datos (textos, campos visibles, rutas), no comportamiento.

```ts
// FrontendAdmin: src/app/negocio/perfiles.ts (propuesta)
export type TipoNegocio = 'productos' | 'hotel' | 'tours' | 'eventos' | 'locales';

export interface PerfilNegocio {
  /** Cómo se llama lo que se vende. */
  vocab: { item: string; items: string; nuevo: string; editar: string; codigo: string; seccionInfo: string };
  /** Formulario y lista del catálogo (producto-detail, producto-list). */
  catalogo: {
    rutaLista: string;          // '/productos' | '/habitaciones' | '/tours' | …
    usaCategorias: boolean;     // hotel: false (hotel-inventario R1.7)
    usaPrecio: boolean;         // hotel: false (lo fija la estadía)
    usaStock: boolean;
    usaVariantes: boolean;
    maxNombre: number;          // productos 60, hotel 100
  };
  /** Entradas del menú lateral propias del negocio. */
  menu: ItemMenu[];
  /** Textos de la vitrina que el admin muestra (diseño, ayudas). */
  vitrina: { ruta: string; boton: string };
}

const HOTEL: PerfilNegocio = {
  vocab: { item: 'Tipo de habitación', items: 'Tipos de habitación', nuevo: 'Nuevo tipo de habitación',
           editar: 'Editar tipo de habitación', codigo: 'Código', seccionInfo: 'Información del tipo de habitación' },
  catalogo: { rutaLista: '/habitaciones', usaCategorias: false, usaPrecio: false, usaStock: false, usaVariantes: false, maxNombre: 100 },
  menu: [/* Tipos de habitación, Tarifas y extras, Config. de reservas… */],
  vitrina: { ruta: 'habitaciones', boton: 'Ver habitaciones' }
};

export const PERFILES: Record<TipoNegocio, PerfilNegocio> = { productos: PRODUCTOS, hotel: HOTEL, tours: TOURS, eventos: EVENTOS, locales: LOCALES };

// tenant.service.ts
readonly perfil = computed(() => PERFILES[this.tipoNegocio() as TipoNegocio] ?? PRODUCTOS);
```

```html
<!-- producto-detail (después) -->
@if (perfil().catalogo.usaPrecio) { …precio, oferta, stock… }
<label>{{ perfil().vocab.codigo }}</label>
```

### Reglas

1. **Preguntar por capacidades, no por identidad**: `perfil().catalogo.usaStock`, no `esHotel()`. Si un negocio cambia, se cambia un dato y no N archivos.
2. **El tipo obliga a completar**: `Record<TipoNegocio, PerfilNegocio>` hace que agregar un campo al perfil no compile hasta que las 5 verticales lo definan. Una vertical nueva = un objeto.
3. **El perfil es para lo compartido que varía** (formulario de producto, menú, migas, diseño, textos). Lo exclusivo de una vertical se queda en su módulo. Agrupar la interfaz (`vocab`, `catalogo`, `menu`, `vitrina`) para que no crezca a 50 flags sueltos.
4. **`esHotel()` sigue siendo válido dentro de pantallas que ya son de una sola vertical** (p. ej. la sección hotel de `reservas-config`). No se elimina a ciegas.
5. Admin y tienda son repos distintos: cada uno tiene su perfil con lo que necesita; no se comparte código entre ellos por esto.

### Riesgos

- Refactor con poca red: el admin tiene 50 tests y casi ninguno cubre estas pantallas. Migrar **un archivo por vez**, compilar y revisar el diff; comparar antes/después en el navegador con una tienda de cada tipo (`demobooking` hotel, `tour-test` tours, una de eventos, una de locales y una de productos).
- No cambiar comportamiento en el mismo commit que la migración: el refactor debe ser neutro (mismos textos y campos visibles por vertical).

## Pasos

1. **Admin, núcleo**: `src/app/negocio/perfiles.ts` + `tenantService.perfil()`. Migrar `producto-detail` (ts + html), `layout.component.html` (menú), `breadcrumb` (reemplazar `breadcrumbHotel`/`breadcrumbHotelUrl` de `app.routes.ts` por el perfil) y `categoria-textos.ts`.
2. **Admin, diseño**: `diseno.component` (ts + html) y `seccion-form`.
3. **Tienda**: perfil de vitrina que absorba `vitrinaDe`, `voz`, `vozAlojamiento` y las condiciones de `store-footer`, `bottom-nav`, `hero-banner`, `policies-section`, `testimonials-section`, `home-page`, `store-header`, `store-layout`.
4. **Backend (solo si hace falta)**: p. ej. `precioBase` opcional cuando la vertical lo calcula (hoy el admin manda S/ 1 provisional para un tipo de habitación nuevo; ver hotel-inventario 1.7b).
5. Convención en el `CLAUDE.md` de cada repo: "lo que varía por tipo de negocio va en el perfil; preguntar por capacidades, no por `esX()`".

## Tareas

- [ ] 1.1 `perfiles.ts` con las 5 verticales y `tenantService.perfil()`.
- [ ] 1.2 `producto-detail` sin `esHotel()` (vocabulario, categoría, precio/stock, variantes, código, máximo del nombre, ruta de vuelta).
- [ ] 1.3 Menú lateral desde `perfil().menu`.
- [ ] 1.4 Migas desde el perfil; quitar `breadcrumbHotel` y `breadcrumbHotelUrl` de las rutas.
- [ ] 1.5 `categoria-textos.ts` dentro del perfil.
- [ ] 1.6 Verificación: build, 50 tests, navegador con una tienda por vertical.
- [ ] 2.1 `diseno.component` y `seccion-form`.
- [ ] 3.1 Perfil de vitrina en la tienda y migración de los 11 archivos.
- [ ] 4.1 Backend: `precioBase` según la vertical (si se confirma necesario).
- [ ] 5.1 Convención en los `CLAUDE.md`.
