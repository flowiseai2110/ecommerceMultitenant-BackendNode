# Spec: armazón de la tienda por rubro (Abstract Factory de componentes)

> Estado: **pasos 1, 2 y 3 implementados** (2026-10-11, FrontendStore y BackendNode; build y tests OK, verificado en el navegador con zapatillas, demobooking, tour-test y evento-test). Pendientes: pasos 4 y 5. Tareas: al final.
> Origen: análisis de patrones de diseño sobre el storefront. Todos los rubros comparten el armazón de una tienda de productos y los de reservas se adaptan apagando partes.
> Base: [perfil-negocio](../perfil-negocio/spec.md) (contrato y registro por rubro, Strategy con datos) y [diseno-por-rubro](../diseno-por-rubro/spec.md) (plantillas y secciones por rubro).
> Repos: FrontendStore (principal), BackendNode y FrontendAdmin (fase 4, modelo de diseño).

## Problema

`perfil-negocio` resolvió **textos y comportamiento** por rubro, pero no la **estructura visual**. La tienda tiene un único armazón (layout, header, top bar, footer, menú inferior, home y rutas) pensado para vender productos con carrito. Hotel, tours, eventos y locales entran en ese armazón apagando lo que no les sirve:

| Dónde | Qué hace hoy |
|---|---|
| `store-layout.component.ts` | Monta el mismo header, footer y menú inferior para todos los rubros |
| `store-header.component.ts` | "Envío coordinado / Pago seguro" escritos a mano, ocultos con `conCarrito()`; ícono de carrito condicionado a `perfil.carrito` |
| `store-footer.component.ts` | Rama `esReservas() ? vitrina().titulo : 'Tienda'`; columnas de envíos y carrito condicionadas |
| `bottom-nav.component.ts` | `@if (!perfil().carrito)` cambia el carrito por la vitrina |
| `home-page.component.ts` | Banner de carrito abandonado y carga de productos, apagados con `sinCarrito` en reservas |
| `testimonials-section`, `hero-banner` | Ramas por `carrito` / `vitrina` |
| `store.routes.ts` | Todas las rutas existen para todas las tiendas: un hotel tiene `/productos`, `/carrito` y `/checkout` |
| `diseno.model.ts` → `DisenoLayout` | `productCard` obligatorio y `habitacion?`, `tour?`, `evento?` opcionales: un modelo de productos con añadidos |

Consecuencias:

- **Cada rubro nuevo agrega ramas** en componentes compartidos. Alquiler de locales ya obligó a tocar header, footer, home y rutas.
- **El contrato del perfil crece con banderas de un solo rubro** (`pideAgasajado`, `exoneraIgv`, `consumosEnServicio`, `ventaEntradas`, `planDePagos`) que los demás declaran en `false`.
- **El diseño de un rubro de reservas queda limitado** por lo que el armazón de productos deja apagar. No hay forma de dar a un hotel un header con "Reservar" y fechas, o un menú inferior propio, sin otra rama.

## Patrón elegido

**Abstract Factory**: cada rubro entrega una **familia de componentes relacionados** (armazón, acciones del header, top bar, columna del pie, menú inferior, home y rutas) que se usan juntos y nunca se mezclan. Nunca debe aparecer un header de hotel con un checkout de productos.

En Angular no se implementa con clases fábrica (`HotelUiFactory.crearHeader()`). Se implementa igual que `PERFILES`:

- un **contrato** de componentes (`UiNegocio`);
- un **registro** `Record<TipoNegocio, UiNegocio>` que no compila si un rubro no define su familia;
- **slots** en el armazón compartido donde se dibuja la pieza del rubro activo.

Patrones descartados o complementarios:

- **Factory Method:** crea una sola pieza. El problema es un conjunto coherente de piezas.
- **Strategy (`PERFILES`):** se mantiene para comportamiento y textos. No sirve para estructura.
- **Template Method / composición:** se usa *dentro* de la solución. El armazón compartido es la plantilla con huecos, y el rubro solo aporta lo distinto.

## Principios

1. **Tres capas, cada una con su dueño:**
   - **Tema** (paleta, tipografía, radio, encabezados): compartido por todos los rubros, sin cambios.
   - **Armazón y rutas**: por familia y rubro (esta spec).
   - **Secciones de la home**: por rubro, ya resuelto en diseno-por-rubro.
2. **Familias antes que rubros.** Hay dos familias: `comercio` (productos) y `reserva` (hotel, tours, eventos, locales). Un rubro reutiliza las piezas de su familia y reemplaza solo lo distinto (`{ ...UI_RESERVA, rutas: RUTAS_HOTEL }`). Se evita escribir cinco headers. Si un rubro diverge mucho, recibe su propia pieza sin tocar a los demás.
3. **Solo el registro conoce la identidad del rubro.** Los componentes compartidos piden "la pieza X del rubro activo" (`uiDe(tienda.tipoNegocio).header.acciones`), nunca `tipoNegocio === '…'`. Se respeta la regla del `CLAUDE.md`.
4. **Lo que solo usa un rubro va en sus componentes, no en el contrato.** Una capacidad pasa a `PerfilNegocio` solo si la consulta código compartido. Si la consulta un componente que ya es del rubro, vive ahí.
5. **Mismo DOM en servidor y navegador al hidratar.** El servidor no conoce la tienda (ver "SSR"), así que todo lo que depende del rubro se dibuja en slots que no se hidratan.

## SSR (restricción que define el diseño)

- El SSR usa `CommonEngine`. En el servidor, `storeResolver` devuelve `{}` y no pide la tienda, para evitar los cold starts de Railway en cada render. El servidor dibuja el armazón con la capa "Cargando tienda…" encima.
- Por lo tanto, **el servidor no puede elegir el armazón del rubro**. Si el servidor dibuja un componente y el navegador otro en el mismo lugar, la hidratación falla (NG05xx) o quedan nodos huérfanos, el mismo problema que ya describe el comentario del ícono del carrito en `store-header`.
- Decisión:
  1. El **armazón compartido** (`StoreLayoutComponent`) se mantiene como única ruta padre y se hidrata como hoy. Contiene: carga y overlay, tema, comunicados, chat, `<main>` y `<router-outlet>`.
  2. Las piezas del rubro se dibujan dentro de **`<app-slot-rubro>`**, un componente con `ngSkipHydration` que resuelve el componente del registro con `NgComponentOutlet`. El servidor deja el slot vacío y el navegador lo llena al conocer la tienda. Ya se hace así con `app-home-sections`.
  3. Los slots que se ven al cargar (header) reservan su alto con un esqueleto, para no empeorar el CLS que ya se cuidó (ver comentario de `<main class="min-h-screen">`).
  4. Las rutas propias de un rubro llevan un guard `canMatch`. **En el servidor el guard deja pasar** (como hoy, todas las rutas existen) y **en el navegador compara el rubro** (ver RU3).
- Cargar la tienda en el SSR (por SEO o para elegir el armazón en el servidor) queda **fuera de alcance**. Si se hace después, el diseño sirve igual: el slot puede dejar de saltarse la hidratación.

## Diseño (FrontendStore)

```
src/app/negocio/
  perfil-negocio.ts      ← contrato de datos (sin cambios, salvo lo que salga por el principio 4)
  ui-negocio.ts          ← contrato de componentes: interface UiNegocio
  perfiles.ts            ← registro de datos (sin cambios)
  uis.ts                 ← registro de componentes: Record<TipoNegocio, UiNegocio>, uiDe(tipo)
  familias/
    comercio/            ← piezas de la tienda con carrito (lo que hoy está en header/footer/nav/home)
      ui.ts              ← UI_COMERCIO
      rutas.ts           ← productos, producto/:id, categorias/:slug, carrito, checkout, rastrear…
    reserva/             ← piezas comunes de los rubros de reservas
      ui.ts              ← UI_RESERVA
      rutas.ts           ← reservar, reserva/:token
  productos/  ui.ts      ← UI_PRODUCTOS = UI_COMERCIO
  hotel/      ui.ts      ← { ...UI_RESERVA, rutas: [...RUTAS_RESERVA, habitaciones, habitaciones/:slug] }
  tours/  eventos/  locales/   (locales suma cotizacion/:token)
src/app/shared/components/slot-rubro/   ← <app-slot-rubro>, con ngSkipHydration
```

Contrato propuesto. Los nombres son indicativos y se ajustan al implementar, siempre agrupados para que no crezca a banderas sueltas:

```ts
// negocio/ui-negocio.ts
type Pieza = () => Promise<Type<unknown>>;   // carga diferida: cada rubro baja solo su código

export interface UiNegocio {
  familia: 'comercio' | 'reserva';
  /** Rutas propias del rubro (hijas de la tienda). Se montan con canMatch del rubro. */
  rutas: Routes;
  header: {
    /** Lado derecho: carrito y cuenta (comercio), "Reservar" o buscador compacto (reserva). */
    acciones: Pieza;
    /** Beneficios de la top bar: envío y pago seguro (comercio); null = el rubro no tiene. */
    beneficios: Pieza | null;
  };
  /** Columna del pie con el catálogo, la vitrina y las políticas. */
  pieCatalogo: Pieza;
  /** Menú inferior del celular. */
  navMovil: Pieza;
  /** Contenido de la home alrededor de las secciones (p. ej. carrito abandonado en comercio). */
  home: Pieza;
}
```

Lo que **no** cambia: tema, `home-sections` y sus `@case` (las secciones ya son por rubro), `StoreRouterService`, páginas de vitrina y detalle de cada rubro (ya son de un solo rubro), solicitud y seguimiento de reserva.

## Requisitos

- **RU1** `negocio/ui-negocio.ts` define el contrato y `negocio/uis.ts` el registro `Record<TipoNegocio, UiNegocio>`. Un rubro sin familia completa no compila.
- **RU2** `store-header`, `store-footer`, `bottom-nav` y `home-page` no consultan `perfil().carrito`, `esReservas()` ni `sinCarrito`. Lo distinto se dibuja con `<app-slot-rubro>`. Criterio: el grep de `carrito\b|esReservas|sinCarrito|conCarrito` en `features/store/components`, `shared/components/bottom-nav` y `features/home/home-page` da 0.
- **RU3** Las rutas propias de cada rubro salen del registro (`rutas` de su `UiNegocio`) con un guard `canMatch` generado a partir del registro:
  - **en el navegador**, el guard pide la tienda con el mismo `QueryKeys.store(slug)` que el resolver (sin segunda llamada) y deja pasar solo si la ruta es del rubro activo;
  - **en el servidor**, deja pasar.

  Ejemplo: un hotel en `/carrito` muestra la página de no encontrado. Una tienda de productos en `/habitaciones` también.
- **RU4** Las rutas comunes siguen montadas para todos: home, cuenta, libro de reclamaciones, `resenar/:token` (también lo mandan las reservas), `t/:token` y `grabacion/:token`. `categorias/:categorySlug` es de cada rubro con categorías: misma URL, otra página (comercio: catálogo; tours, eventos y locales: su vitrina filtrada).
- **RU5** `<app-slot-rubro>` no se hidrata (`ngSkipHydration`). En el servidor queda vacío o con el esqueleto de su alto. No hay errores de hidratación en consola en ningún rubro.
- **RU6** Sin cambio visible en el primer paso: las piezas de las familias reproducen lo que hoy se ve en cada rubro. Los cambios de diseño (header de reserva con "Reservar", nav propio) van en commits aparte.
- **RU7** `negocio/perfiles.spec.ts` (o un `uis.spec.ts` hermano) fija qué familia y qué rutas tiene cada rubro. Un cambio ahí debe ser intencional, como con los perfiles.
- **RU8** (fase 4) `DisenoLayout` pasa a una unión por rubro (`LayoutProductos | LayoutHotel | LayoutTour | LayoutEvento | LayoutLocal`), igual que `SeccionHome`. `productCard` solo existe en productos. Se sube `EstructuraTienda.formato` y el backend normaliza las estructuras guardadas en formato viejo al resolver el tema. El admin muestra solo las opciones del rubro de la tienda.

## Backend y admin (solo fase 4)

- `modules/negocio/<rubro>/datos.js` declara el esquema del `layout` del rubro, junto a la plantilla y las secciones que ya declara. La validación de la estructura rechaza un `layout` de otro rubro (como H3 de diseno-por-rubro con las secciones).
- Migración de lectura: estructuras con `formato` anterior se convierten al resolver `Tienda.diseno.tema`. `layout.habitacion` / `tour` / `evento` pasan a la raíz del layout del rubro y `productCard` se descarta fuera de productos. No hace falta SQL: se reescribe al próximo guardado.
- FrontendAdmin: el editor de Diseño toma las opciones de layout del rubro (desde `perfil()` o desde el catálogo de plantillas). Se detalla al llegar a esta fase.

## Riesgos

- **Hidratación y CLS:** los slots se dibujan después de la hidratación. Mitigación: esqueleto con el alto del header y verificación con Lighthouse en producto y en hotel.
- **Duplicación entre rubros:** se evita con familias y slots chicos. No se copia un header entero por rubro: se reemplaza solo la pieza que cambia.
- **Carga diferida:** cada pieza es un chunk. Mitigación: precargar las piezas de la familia apenas se conoce la tienda (en el resolver), no al dibujar cada slot.
- **El guard y el resolver piden la tienda dos veces:** se evita usando la misma query y `staleTime` de TanStack, con un solo origen de verdad.
- **Refactor y cambio de diseño juntos:** prohibido en el mismo commit (RU6).

## Pasos

1. **Núcleo:** contrato `UiNegocio`, registro `uis.ts`, `<app-slot-rubro>` y test del registro. Las familias aún devuelven lo de hoy.
2. **Familia reserva y comercio en el armazón:** extraer acciones del header, beneficios de la top bar, columna del pie, menú inferior y extras de la home a `familias/<familia>/`. Quitar las ramas por `carrito` de los componentes compartidos (RU2).
3. **Rutas por rubro:** `rutas.ts` por familia y rubro, guard `canMatch` generado y `store.routes.ts` con solo las comunes más las del registro (RU3, RU4).
4. **Modelo de diseño por rubro:** `DisenoLayout` como unión, `formato` nuevo, normalización en el backend y opciones por rubro en el admin (RU8).
5. **Convención:** sumar al `CLAUDE.md` de la tienda que la estructura visual del rubro va en `negocio/<rubro>/ui.ts` (o en su familia), y que los componentes compartidos usan `<app-slot-rubro>`, no ramas.

## Tareas

- [x] 1.1 `negocio/ui-negocio.ts`, `negocio/uis.ts` (`uiDe`, caché de piezas cargadas, `precargarUi`), `negocio/familias/{comercio,reserva}/ui.ts`, `negocio/<rubro>/ui.ts` (5).
- [x] 1.2 `<app-slot-rubro>` (`shared/components/slot-rubro`) con `ngSkipHydration` y `display: contents`. Sin esqueleto: el header no cambia de alto (el carrito es un ícono dentro de la barra).
- [x] 1.3 `negocio/uis.spec.ts`: familia por rubro, coincide con `carrito` del perfil, piezas del header solo en comercio, las piezas obligatorias cargan.
- [x] 2.1 Header: `headerBeneficios`, `headerAcciones` (ícono del carrito) y `headerCapas` (mini carrito, fuera del `<header>`); se conectan con `MiniCarritoState`. Sin `conCarrito()`.
- [x] 2.2 Footer: columna "Ayuda" por familia (`pieAyuda`). El título del catálogo es `vitrina().titulo` (productos ya decía "Tienda").
- [x] 2.3 Menú inferior: centro por familia (`navMovil`); "Contacto" fijo en la columna 4 para que no salte mientras llega la pieza.
- [x] 2.4 Home: `home-page` es solo `<app-slot-rubro pieza="home" />`; carrito abandonado y productos en `HomeComercioComponent`, `HomeReservaComponent` solo con las secciones.
- [x] 2.5 `hero-banner` y `testimonials-section`: se quedan, leen textos y capacidades (vitrina, buscador, "Reserva verificada"), no estructura.
- [x] 2.6 `storeResolver` llama a `precargarUi(tipoNegocio)` al conocer la tienda.
- [x] 3.1 `rutas` en `UiNegocio`: comercio (`carrito`, `checkout`, `rastrear`, `rastrear/:numeroPedido`), reserva (`reservar`, `reserva/:token`) y la vitrina de cada rubro (locales suma `cotizacion/:token`), declaradas en `negocio/<familia|rubro>/ui.ts`. Guard `rutaDelRubro` (`core/guards/rubro.guard.ts`): servidor pasa; navegador usa `pedirTienda`, la misma consulta y caché que `storeResolver` (una sola petición de la tienda); si la tienda no carga, pasa y el resolver redirige.
- [x] 3.2 `store.routes.ts`: rutas comunes más `rutasDeLosRubros()` (cada ruta una vez aunque la compartan los rubros de reserva).
- [x] 3.3 Enlaces compartidos a la vitrina del rubro: "Todo" del header, primer link de `store-nav` (móvil y escritorio), "Ver productos" de la cuenta, "Seguir comprando" de la reseña. La cuenta oculta "Rastrea tu pedido" sin carrito (con clase, por la hidratación).
- [x] 3.4 Catálogo de reservas. `productos` y `producto/:productId` son de comercio. `categorias/:categorySlug` la declara cada rubro con categorías: comercio con `CategoryPageComponent`, tours/eventos/locales con su página de vitrina, que lee la categoría con `categoriaDeLaRuta()` (`features/reservas/categoria-de-ruta.ts`: misma consulta que el layout, incluye subcategorías, slug inexistente → vitrina completa) y filtra la grilla (`categorias`, `esperando`). Hotel no la tiene (no usa categorías). El backend agrega `categoriaId` a la vitrina de tours, eventos y salones. Buscador: `UiNegocio.buscador` dice a dónde lleva un resultado (comercio: `producto/:id` y "Ver todos" → `productos?search=`; reserva: la ficha `<vitrina>/:slug`, sin "Ver todos"; Enter abre el primero). Textos del buscador genéricos ("Buscar en {tienda}…", "No encontramos resultados…").
- [x] 3.5 Mi cuenta por familia. Piezas `cuentaHistorial` (comercio: "Califica tus compras" + "Mis pedidos"; reserva: "Mis reservas", cada una abre su link de seguimiento) y `cuentaInvitacion` (sin sesión: texto, botón de Google y, en comercio, "Rastrea tu pedido"). La página de cuenta queda con perfil, cerrar sesión y libro de reclamaciones (texto neutro: "¿Tuviste un problema con la tienda o con la atención?"). Backend: `GET /store/cuenta/reservas` (`listarReservasCuenta` en reservas.service: reservas del usuario en la tienda con estado efectivo y token de seguimiento firmado) y "Mis pedidos" (`listByAuthUser`) solo con compras (`reserva: { is: null }`). Tests backend reservas + órdenes: 224 OK. Sin verificación en el navegador (requiere sesión de Google y la extensión se desconectó): falta probar con una cuenta real.
- [ ] 4.1 Backend: esquema de `layout` por rubro en `modules/negocio/<rubro>/datos.js`, validación y normalización por `formato`.
- [ ] 4.2 Tienda: `DisenoLayout` como unión por rubro; ajustar fichas de habitación, tour y evento.
- [ ] 4.3 Admin: opciones de layout por rubro en el editor de Diseño.
- [ ] 5.1 Convención en el `CLAUDE.md` de la tienda.
- [ ] 6.1 Verificación en el navegador por rubro (demobooking, tour-test, evento-test, casa-alborada, zapatillas): sin errores de hidratación, mismas pantallas que antes del paso 2 y rutas de otro rubro en no encontrado.

## Decisiones tomadas al implementar (2026-10-11)

- El contrato quedó como `UiNegocio { familia, piezas }`, con las piezas planas (`headerBeneficios`, `headerAcciones`, `headerCapas`, `pieAyuda`, `navMovil`, `home`) para que el slot se elija con un nombre (`<app-slot-rubro pieza="…">`). `rutas` se suma en el paso 3.
- El mini carrito es una pieza aparte (`headerCapas`) y no va dentro del ícono: el `<header>` es sticky con `z-40`, y una capa fija dentro de él quedaba debajo del menú inferior.
- Fuera de alcance, ya existía en HEAD: la app no se estabiliza (NG0506 en consola) y el scroll al navegar no sube (probado en tour-test en HEAD y con este cambio, mismo resultado). Ver la nota de estabilidad (LiveService / TanStack fuera de la zona): hay otro timer en la zona.
- Paso 3: el catálogo genérico quedó común hasta tener el de reservas (3.4, hecho el mismo día). La categoría de reservas no es una pieza en un slot sino otra ruta con la misma URL: el guard de rubro elige cuál entra.
- 3.4 verificado: `/tour-test/categorias/aventura` (5 tours, título "Aventura", una sola petición de categorías), cambio de categoría desde la barra, `/tour-test/categorias/no-existe` → `/tour-test/tours`, `/evento-test/categorias/teatro-y-comedia` (2 eventos), buscador de tour-test → `/tour-test/tours/machu-picchu-full-day-en-tren`; `/tour-test/productos` y `/demobooking/categorias/hombre` en no encontrado; zapatillas sin cambios (categoría con tarjetas de producto, buscador con "Ver todos" → `producto/:id`). Tests del backend de reservas: 190 OK.
- Verificado (2026-10-11, carga directa de 12 URLs): `/demobooking/carrito`, `/demobooking/checkout`, `/tour-test/carrito`, `/tour-test/habitaciones`, `/zapatillas/habitaciones` y `/zapatillas/reservar` dan no encontrado; `/zapatillas/carrito`, `/zapatillas/rastrear`, `/demobooking/habitaciones`, `/demobooking/reservar` y `/tour-test/tours` abren su página.

## Preguntas abiertas

- ¿`eventos` (venta de entradas, con compra y pago) sigue en la familia `reserva` o necesita su propia familia más cercana a un checkout? Propuesta: `reserva` por ahora. Si sus piezas divergen, se le da una propia sin tocar a los demás.
- ¿Conviene cargar la tienda en el SSR más adelante (SEO de hoteles y tours)? Si se hace, los slots pueden hidratarse y el servidor elige el armazón. Queda fuera de esta spec.
