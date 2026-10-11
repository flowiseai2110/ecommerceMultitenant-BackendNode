# Spec: lógica por rubro (Strategy por tipo de negocio)

> Estado: **implementado y verificado** (2026-10-11), salvo la excepción por tienda (4.4, cuando haya un caso real). Tareas: al final.
> Origen: sesión de [hotel-inventario](../hotel-inventario/spec.md) (R1.7: hoteles sin categorías, formulario del tipo de habitación).
> Repos: BackendNode, FrontendAdmin, FrontendStore.

## Problema

Cada rubro (productos, hotel, tours, eventos, locales) tiene sus reglas, pero el frontend las resuelve preguntando por la identidad del negocio en cada pantalla:

```ts
// FrontendAdmin, diseno.component.ts (hoy)
vitrinaTexto = computed(() => (this.esHotel() ? 'Ver habitaciones' : this.esTours() ? 'Buscar tours'
  : this.esEventos() ? 'Ver eventos' : this.esLocales() ? 'Ver salones' : ...));
```

Medición del 2026-10-11 (`esHotel()`, `esTours()`, `esEventos()`, `esLocales()`, `esReservas()`, `tipoNegocio === '…'`, `esNegocioReservas`, `vitrinaDe(`):

| Repo | Condiciones | Archivos con más |
|---|---|---|
| FrontendAdmin | **114** | `diseno.component` (33), `reservas-config` (32), `producto-detail` (22), `layout.component.html` (12) |
| FrontendStore | **49** | `hero-banner` (9), `bottom-nav` (8), `store-footer` (7), `policies-section` (7), `reservas.util` (6) |
| BackendNode | pocas | Reservas ya usa Strategy (`VERTICALES` en `modules/reservas/reservas.service.js`) |

Cada rubro nuevo obliga a recorrer todos esos archivos. Además hay reglas de negocio que viven en el front y no en el backend: p. ej. el admin manda S/ 1 de precio "provisional" al crear un tipo de habitación (hotel-inventario 1.7b) porque el backend exige `precioBase` a todos los rubros.

## Principios

1. **Una carpeta por rubro, en los tres repos, con el mismo nombre** (`productos`, `hotel`, `tours`, `eventos`, `locales`). Ahí vive todo lo que distingue al rubro.
2. **Un contrato por repo** (lo que todo rubro debe definir) y **un registro** que elige la estrategia en tiempo de ejecución. Si a un rubro le falta algo del contrato, no compila (front) o falla un test de contrato (backend).
3. **El código compartido pregunta por capacidades, no por identidad**: `perfil().catalogo.usaStock`, nunca `esHotel()`. `esHotel()` solo es válido dentro de código que ya es de un solo rubro.
4. **El backend es la verdad de las reglas; el front, de la pantalla.** El front refleja las reglas para la UX, pero el backend valida aunque el front se equivoque.
5. **El rubro sale de la base, no del request.** El front manda el tenant (`tiendaId`) como hoy; el backend lee `tiendas.tipo_negocio` (cacheado). Nunca se confía en un `tipoNegocio` enviado por el cliente: permitiría saltarse reglas (p. ej. crear un producto sin precio en una tienda de productos).
6. **No se crea un rubro ni una copia por cliente** (ver "Variaciones por cliente").

## Backend

```
modules/negocio/
  contrato.js        ← lo que todo rubro implementa (validarProducto, prepararProducto, …) + test de contrato
  registro.js        ← estrategiaDe(tienda): excepción por tienda ?? rubro
  productos/  hotel/  tours/  eventos/  locales/
```

- **Lo exclusivo de un rubro** (estadía, disponibilidad, tarifas, salones, funciones) ya vive en `modules/reservas/<rubro>/` con sus rutas y servicios: se mantiene ahí o se mueve a `modules/negocio/<rubro>/` en un paso posterior; lo que importa es que no se mezcle con otros rubros.
- **Lo común** (CRUD de productos, pedidos, pagos) sigue en su módulo, con su Repository → Service → Controller, y le pregunta a la estrategia **solo en los puntos donde el rubro cambia la regla**:

```js
// Controller/servicio genérico: no sabe de rubros
const tienda = await tiendaDe(req.tiendaId);                 // rubro desde la BD (cacheado)
const datos = estrategiaDe(tienda).prepararProducto(req.body); // hotel: el precio lo fija la estadía
```

- `VERTICALES` de reservas es el modelo: se integra al registro (cotizar, estadoInicial, enTransaccion pasan a ser parte del contrato de los rubros de reservas).
- Los repositorios siguen genéricos (Prisma); el acceso a datos propio de un rubro va en su carpeta.

## FrontendAdmin y FrontendStore

```
src/app/negocio/
  perfil-negocio.ts   ← contrato: interface PerfilNegocio (+ type TipoNegocio)
  perfiles.ts         ← registro: Record<TipoNegocio, PerfilNegocio>, solo importa
  productos/perfil.ts
  hotel/
    perfil.ts         ← vocabulario, capacidades, menú, migas, vitrina
    reglas.ts         ← comportamiento de pantalla del rubro (validaciones de UX, armado del guardado)
  tours/  eventos/  locales/
```

```ts
// perfil-negocio.ts (propuesta; se agrupa para no crecer a 50 flags sueltos)
export type TipoNegocio = 'productos' | 'hotel' | 'tours' | 'eventos' | 'locales';
export interface PerfilNegocio {
  vocab: { item: string; items: string; nuevo: string; editar: string; codigo: string; seccionInfo: string };
  catalogo: { rutaLista: string; usaCategorias: boolean; usaPrecio: boolean; usaStock: boolean; usaVariantes: boolean; maxNombre: number };
  menu: ItemMenu[];
  vitrina: { ruta: string; boton: string };
}

// tenant.service.ts
readonly perfil = computed(() => PERFILES[this.tipoNegocio() as TipoNegocio] ?? PERFILES.productos);
```

```html
<!-- producto-detail (después) -->
@if (perfil().catalogo.usaPrecio) { …precio, oferta, stock… }
<label>{{ perfil().vocab.codigo }}</label>
```

- Admin: pantallas compartidas (formulario de producto, menú, migas, diseño) leen el perfil. Las pantallas exclusivas de un rubro (ficha de estadía, Tarifas y extras, Salones…) pueden mudarse a `negocio/<rubro>/` en un paso posterior (mueve rutas).
- Tienda: `negocio/<rubro>/vitrina.ts` absorbe `vitrinaDe`, `voz`, `vozAlojamiento` y las condiciones de pie, navegación inferior, hero, políticas, testimonios, home y layout.
- Admin y tienda son repos distintos: cada uno tiene su contrato con lo que necesita; no se comparte código entre ellos por esto.

### Reparto front / back (ejemplo)

"Un tipo de habitación no lleva precio en su formulario":

| | Dónde | Qué |
|---|---|---|
| Regla | Backend `negocio/hotel/` (`prepararProducto`) | El precio no se exige; lo calcula la estadía (el más bajo de sus modalidades). Se elimina el S/ 1 provisional del admin |
| Pantalla | Admin `negocio/hotel/perfil.ts` | `catalogo.usaPrecio: false`: el formulario no muestra el campo |

## Variaciones por cliente (p. ej. una cadena como Casa Andina)

Un cliente grande **no es un rubro nuevo ni una copia del rubro**. Una copia (`servicioHospedajeCasaAndina`) obliga a repetir cada arreglo y cada mejora en cada cliente: el costo crece con cada cliente y se pierde la ventaja de un SaaS, donde una mejora llega a todos.

Se resuelve en tres niveles, del más común al más raro:

1. **Configuración por tienda** (cubre la mayoría): políticas, horarios, cobro, IGV, planes de tarifa. Ya existe (`config_reservas`).
2. **Capacidades opcionales del rubro**, activables por tienda: lo que pide un cliente grande suele servir a otros (varias sedes en una cuenta, tarifas corporativas, integración con PMS o channel manager). Se construye una vez en `negocio/hotel/` y se vende al siguiente cliente.
3. **Excepción por tienda** (último recurso, para algo de verdad único): un objeto que **hereda del rubro y reemplaza solo lo distinto**. Todo lo demás (disponibilidad, anulación, fases futuras) le llega del rubro, y los tests del rubro corren también contra la excepción.

```js
// negocio/registro.js
const EXCEPCIONES = { [CASA_ANDINA_ID]: { ...hotel, cotizar: cotizarCasaAndina } };
export const estrategiaDe = (tienda) => EXCEPCIONES[tienda.id] ?? ESTRATEGIAS[tienda.tipoNegocio];
```

Regla: **el rubro define la lógica, la configuración la ajusta por cliente, la excepción por tienda es el último recurso y nunca una copia.**

## Riesgos

- Refactor con poca red: el admin tiene 50 tests y casi ninguno cubre estas pantallas. Migrar **un archivo por vez**, compilar, revisar el diff y comparar en el navegador con una tienda de cada rubro (`demobooking` hotel, `tour-test` tours, una de eventos, una de locales y una de productos).
- Refactor neutro: no cambiar comportamiento en el mismo commit que la migración (mismos textos y campos por rubro). Cambios de regla (p. ej. quitar el S/ 1 provisional) en commits aparte.
- Que el contrato crezca sin orden: agrupar (vocab / catálogo / menú / vitrina) y dejar lo exclusivo en el módulo del rubro.

## Pasos

1. **Admin, núcleo**: `negocio/` (contrato, registro, carpeta por rubro) + `tenantService.perfil()`. Migrar `producto-detail`, menú lateral, migas (quitar `breadcrumbHotel`/`breadcrumbHotelUrl` de `app.routes.ts`) y `categoria-textos.ts`.
2. **Admin, diseño**: `diseno.component` y `seccion-form`.
3. **Tienda**: `negocio/<rubro>/vitrina.ts` y migración de los 11 archivos.
4. **Backend**: `modules/negocio/` (contrato, registro con rubro desde la BD, test de contrato); primera regla: `prepararProducto` (hotel sin precio en el formulario) y quitar el S/ 1 provisional del admin; integrar `VERTICALES`.
5. **Convención** en el `CLAUDE.md` de cada repo: "lo que varía por rubro va en `negocio/<rubro>/`; el código compartido pregunta por capacidades; no se agrega `esX()` fuera de código de un solo rubro; variaciones por cliente según los tres niveles".

## Tareas

- [x] 1.1 Admin: `negocio/perfil-negocio.ts`, `negocio/perfiles.ts`, `negocio/<rubro>/perfil.ts` (5) y `tenantService.perfil()`.
- [x] 1.2 `producto-detail` sin `esHotel()` (vocabulario, categoría, precio/stock, variantes, código, máximo del nombre, ruta de vuelta).
- [x] 1.3 Menú lateral desde `perfil().menu`.
- [x] 1.4 Migas desde el perfil; quitar `breadcrumbHotel` y `breadcrumbHotelUrl`.
- [x] 1.5 `categoria-textos.ts` dentro de los perfiles.
- [x] 1.6 Verificación en el navegador con una tienda por rubro (admin y tienda), con Playwright, 2026-10-11: demobooking, tour-test, evento-test, casa-alborada, zapatillas. Encontró y corrigió las migas de las rutas hijas (heredaban la `miga` del padre).
- [x] 2.1 `diseno.component` y `seccion-form`. Además (decisión 2026-10-11): `reservas-config`, `reservas-list`, alertas y comunicados; el admin ya no tiene `esHotel()`/`esTours()`/`esEventos()`/`esLocales()` (`tenantService.tieneReservas()` reemplaza a `esReservas`).
- [x] 3.1 Tienda: `negocio/<rubro>/vitrina.ts` y migración de los 11 archivos. Además (decisión 2026-10-11): solicitud y seguimiento de reserva; `voz()` pasó a los perfiles y `vozAlojamiento` a `negocio/hotel/alojamiento.ts`.
- [x] 4.1 Backend: `modules/negocio/` con contrato, registro (rubro desde la BD, cacheado) y test de contrato.
- [x] 4.2 Backend: `prepararProducto` por rubro; hotel sin precio exigido; quitar el S/ 1 provisional del admin. (Hotel: crea con 0 y al editar ignora el precio; la tienda no lo muestra hasta tener modalidades.)
- [x] 4.3 Backend: integrar `VERTICALES` de reservas al registro. Cada vertical vive en `modules/reservas/<rubro>/vertical.js` (locales: `verticalLocal`) y el registro la une como `estrategia.reservas`; `extraCotizacion` reemplaza el `vertical === verticalLocal`.
- [x] 4.5 Backend (decisión 2026-10-11): los datos de cada rubro en `modules/negocio/<rubro>/datos.js` (capacidades `recibeReservas`, `planDePagos`, `transmisiones`; plantilla y secciones de Diseño; config de reservas por defecto y texto de aviso), reunidos en `negocio/datos.js` (liviano, sin ciclos) y sumados a cada estrategia; el perfil del asistente pasa a `estrategia.agente`, y locales tiene su propio asesor (`modules/agente/perfiles/locales.js`: `ver_salones`, `info_local`; antes usaba el de productos). Reemplaza `TIPOS_POR_NEGOCIO`, `DEFAULT_POR_NEGOCIO`, `POR_VERTICAL`, `TEXTOS_AVISO`, `PERFILES` del agente y los `tipoNegocio === …` de config de reservas, onboarding y transmisiones.
- [ ] 4.4 Backend: soporte de excepción por tienda (`EXCEPCIONES`) con test que corre la suite del rubro contra ella (solo cuando haya un caso real).
- [x] 5.1 Convención en los `CLAUDE.md` de los tres repos (la tienda no tenía: se creó).

## Decisiones tomadas al implementar (2026-10-11)

- Hotel: el tipo de habitación se crea sin precio (queda en 0 hasta guardar la estadía) y la tienda no lo muestra hasta entonces: listado, home, detalle y buscador del asistente excluyen "precio 0 y no servicio" (`modules/catalogo/productos.vitrina.js`).
- Migas y vuelta del formulario: tours → `/tours`, eventos → `/eventos`, locales → `/salones` (locales volvía a `/productos`).
- Vocabulario propio en el formulario de producto: tour, evento y salón (antes, el de productos).
- Textos de otro rubro corregidos en locales/eventos: "Banda baja", reseñas "al terminar cada evento", instrucciones del día del evento / del ingreso, pie "Salones / Todos los salones", título "Para el día del evento". Botón por defecto de tours: "Ver tours" en admin y tienda.
- Seguimiento de reserva: las ramas por `tipo` de la reserva se mantienen (eligen qué campos del registro listar; no preguntan por el rubro de la tienda).
