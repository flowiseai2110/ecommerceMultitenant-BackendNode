# Impacto: campañas en tres pasos y promoción de precios (productos)

> Spec: [spec.md](spec.md) (aprobada, Q1–Q11 según recomendación) · Diseño: [diseno.md](diseno.md) (v1 aprobado, A–I y propuestas 1–11) · Decisiones: [ADR-0001](../../adr/ADR-0001-precio-calculado-en-servidor.md), [ADR-0002](../../adr/ADR-0002-campana-en-tres-pasos.md) · Estado: **borrador (por aprobar)** · 2026-10-20
> Se apoya en [precio-en-servidor](../precio-en-servidor/impacto.md) (P1–P4, en desarrollo) y en [campanas-cuando](../campanas-cuando/impacto.md) (horas exactas, `proximoCambio`, caché que vence en el próximo cambio, R3.9). No duplica nada de los dos.

## Resumen en una frase
El dueño arma su campaña en una sola pantalla de tres pasos (cuándo, cómo se ve y, en tiendas que venden productos, un descuento por porcentaje que confirma antes de activar), y durante la campaña el servidor baja los precios solo, sin tocar los precios guardados, los muestra tachados igual en toda la tienda, los respeta 15 minutos mientras el cliente paga y guarda en cada pedido de qué campaña vino el descuento.

## De qué parte (lo que ya existe y se reutiliza)

| Pieza existente | Dónde | Cómo la usa esta spec |
|---|---|---|
| Ventanas con hora exacta de Lima, una lista por año y ediciones | `modules/campanas/calendario.js:81` (`ventanas`), `:165` (`vigente`), `:192` (`proximaVentana`), `:213` (`proximoCambio`) | La promoción rige en la **ventana de la campaña** (R5.2): se calcula con estas mismas funciones. No hay un segundo calendario |
| Campaña efectiva (preset + lo de la tienda) y "solo activas" | `modules/campanas/resolver.js:22` (`efectiva`), `:96` (`campanasAplicables`, ya con el hueco de `_contexto` para la sede) | La vigencia de la promoción parte de las mismas campañas activas |
| Caché que vence en el próximo cambio | `utils/cache.js` (`cache(segundos, { hasta })`), `routes/store/index.js:41` (`/tiendas`), TTL en memoria `min(60 s, proximoCambio)` en `tiendas.store.routes.js` | Se aplica igual a `/store/productos` y a las cachés en memoria del catálogo (`productos.cache.js:16-17`) |
| Validación de campañas al guardar | `modules/campanas/campanas.validacion.js` (`validarCampanasDeTienda`), llamada en `PUT /admin/tiendas/:id/diseno` (`tiendas.admin.routes.js:198`) | Se agrega la guarda "una campaña con promoción confirmada no cambia sus fechas por este camino" |
| `precioVigente(producto, variante, contexto)`, `redondearCentimos`, `evaluarCupon`, `cotizarCompra`, cargador, `crear-pedido`, snapshot `precio_regular`/`precio_origen`, capacidad `carrito`, `POST /store/pedidos/cotizar` | precio-en-servidor P1–P4 (`modules/precios/`, `modules/cupones/regla-cupon.js`, `modules/ordenes/crear-pedido.js`) | La promoción **entra por `contexto.promociones`** (R5.6, R12.2). Esta spec cambia esas funciones; no crea otras |
| Envío gratis por mínimo | `modules/envios/cotizacion.js:41,75` (`cotizarMetodo(…, { envioGratisMinimo })`) | Sin cambios en la regla: cuando una promoción lo prohíbe, la cotización le pasa `envioGratisMinimo: null` |
| Token firmado con `aud` propio | `modules/reservas/locales/cotizacion.token.js`, `reservas.token.js` (con `jose`) | Mismo patrón para el "precio asegurado" de 15 minutos (R8.4) |
| Trigger de BD para un registro legal | `docs/sql/libro_reclamaciones_setup.sql:134-146` | Mismo criterio para el historial de precios (Indecopi) y para que las confirmaciones no se editen |

## Decisión central: dónde vive la promoción

**En tablas propias, no en el JSON de diseño.** La campaña (fechas, horas, aspecto, `activa`) sigue en `tienda_configuraciones`, clave `campanas` (sin migrar nada); la promoción se guarda en `campana_promociones` ligada por el `id` UUID que la campaña ya tiene (`campanas.schema.js:97`). Es la decisión que campanas-cuando dejó abierta para R5 ("Modelo de datos", impacto de campanas-cuando).

Por qué (lo que pesa a 2 años):
1. **El servidor la lee en cada listado y en cada pedido.** Con tablas, una tienda sin promociones se descarta con una consulta mínima (`EXISTS` por `tienda_id`), y el alcance por categoría o producto se resuelve con índices. En el JSON habría que leer y recorrer todo el diseño de la tienda (`getDiseno` no tiene caché, `tienda-diseno.service.js:22`).
2. **El editor de Diseño guarda el arreglo `campanas` completo** (`saveDiseno`, `tienda-diseno.service.js:35`). Una pestaña vieja del editor pisaría una promoción confirmada. Lo que cambia lo que se cobra no puede viajar en un guardado de aspecto.
3. **Integridad:** "productos seleccionados" puede tener cientos de ids; con claves foráneas un producto o categoría borrado sale solo del alcance (`ON DELETE CASCADE`). El cupón de la campaña es una fila de `cupones` con FK a su promoción.
4. **Auditoría (R9.4) y regla de Indecopi (R10.5):** la confirmación es un registro que solo se agrega; "¿este producto está en una promoción en curso?" se responde con una consulta indexada desde el formulario de producto.

Lo que **no** se hace: pasar todas las campañas a tabla. Cuesta migrar el JSON de todas las tiendas, el guardado del Admin y la vista previa del editor, y la promoción no lo necesita. El `id` de la campaña es estable, así que ese paso sigue siendo posible.

### Cuándo aplica una promoción (regla pura, `modules/campanas/promocion.js`)
Una promoción **aplica en `ahora`** si y solo si:
1. su campaña existe en el JSON de la tienda y está `activa` (apagarla corta la promoción en el siguiente cálculo, R8.6);
2. `ahora` cae en una ventana `v` de la campaña (`ventanas()` de `calendario.js`, años `a−1..a+1`, con ediciones);
3. existe una **confirmación** con la misma `version` de la promoción y **exactamente** esa ventana (`ventana_inicio = v.inicio` y `ventana_fin = v.fin`).

De (3) salen solos: R5.7 (sin confirmar no cambia precios), R9.5 (cambiar porcentaje, alcance, permisos o cupón sube la `version`; cambiar fechas u horas cambia la ventana) y **R9.6** (cada edición de una campaña que se repite es otra ventana, así que pide su propia confirmación). Cada campaña se evalúa **por separado** (no se usa el `vigente()` que elige una sola): dos campañas cruzadas pueden aplicar a la vez y, por producto, gana el mayor descuento (R5.4).

La función devuelve, por promoción vigente: `{ campanaId, nombre, porcentaje, alcance: { tipo, categoriaIds: Set, productoIds: Set }, permitirCupones, permitirEnvioGratis, hasta, orden }`, donde `categoriaIds` ya incluye las subcategorías (Q6, el árbol se lee de `categorias.categoria_padre_id`) y `orden` es el desempate del resolver de campañas (prioridad, luego ventana más corta; R3.10 de campanas-cuando).

Estado para el Admin (misma regla, `estadoPromocion`): `sin-promocion` · `sin-confirmar` (nunca confirmada para su ventana en curso o próxima) · `por-confirmar-edicion` (confirmada para una edición anterior, no para la próxima, R9.6; con `recordar = true` desde **30 días antes** del inicio, propuesta 6 del diseño) · `confirmada` · `termino`.

## Cómo entra la promoción en el precio (sin duplicar precio-en-servidor)

### `precioVigente(producto, variante, contexto)` (P1, `modules/precios/precio-vigente.js`)
Se extiende **la misma función**; nada más calcula precios (R5.6). En céntimos:
```
regular   = variante?.precio > 0 ? variante.precio : producto.precioBase           // P1, sin cambio
candidatos = [regular]
           + oferta del producto si aplica (regla P1: sin variante con precio propio, 0 < oferta < base)
           + por cada promoción de contexto.promociones que cubre al producto
               (tipo "tienda" | categoriaId ∈ categoriaIds | id ∈ productoIds):
               max(1, redondearCentimos(regular × (100 − porcentaje) / 100))      // R4.9: nunca menos de S/ 0,01
unitario  = el menor; empate oferta-promoción → gana la oferta; empate entre promociones → menor `orden`
origen    = regular | oferta | campana
→ { unitario, regular, origen, porcentaje (sobre el regular, entero más cercano, R6.3), campana: { id, nombre, hasta, permitirCupones, permitirEnvioGratis } | null }
```
- El porcentaje se aplica sobre el **precio regular de la variante** (R5.5) y el redondeo es el único del sistema (`redondearCentimos`, P1): 19,99 con 20 % = 15,99 (CA-5.6).
- Empate oferta = promoción → **oferta**: es el precio propio del dueño y conserva el comportamiento de hoy con cupones (D2 de precio-en-servidor). Decisión E8.
- `contexto.promociones` vacío = resultado idéntico al de P1 (los tests de P1 siguen verdes sin tocarlos).

### Cargador del contexto (`modules/precios/contexto.service.js`, nuevo)
`contextoDePrecios(tiendaId, { ahora, conCache })` → `{ ahora, promociones }`:
1. `EXISTS` de promociones de la tienda → si no hay, `promociones: []` (camino de casi todas las tiendas).
2. Si hay: campañas (una fila de `tienda_configuraciones`), promociones con sus categorías y productos, confirmaciones de cada `version` vigente, árbol de categorías; ediciones desde `edicionesParaResolver()` (ya con caché de 60 s). Una consulta por tabla, todas con `tienda_id`.
3. `conCache: true` (listados, ficha, home, asesor): caché en memoria por tienda con TTL `min(60 s, proximoCambio − ahora)` (`proximoCambio` de `calendario.js` sobre las campañas con promoción). Se limpia al guardar una campaña, una promoción o el diseño, y toda al cambiar una edición de la plataforma.
4. **Cotizar y crear pedido usan `conCache: false`**: el dinero lo decide una lectura fresca (R5.2, CA-5.8).

### Dónde se usa (R6.1: todos los lugares reales que muestran o usan un precio)

| Lugar | Hoy | Después |
|---|---|---|
| Listado, categorías, buscador de la Tienda | `GET /store/productos` (genérico, `productos.store.routes.js:110`); la Tienda calcula `precioOferta \|\| precioBase` (`product-card.component.ts:236`) | El serializer agrega `precio` (`{ vigente, regular, origen, porcentaje, campana }`) con `precioVigente`; la Tienda solo lo dibuja |
| Orden "Menor/Mayor precio" y filtro por rango | `orderBy=precioBase` y `min_/max_precioBase` en la BD (`catalog.service.ts:67-70,107-110`): **ya hoy ignora la oferta** | Camino "por precio vigente" (ver abajo): ordena y filtra por el precio que se cobra. Los mismos parámetros siguen valiendo (Tienda vieja) |
| Rango de precios del filtro | `getPriceRange()` lee `precioBase` del primero y del último (`catalog.service.ts:96-117`) | Lee `precio.vigente` |
| Home | `GET /store/productos/home` (SQL, `productos.store.routes.js:125-170`) + caché 60 s | Selecciona `categoria_id`; serializer con `precio`; caché con TTL hasta el próximo cambio |
| Ficha y variantes | `GET /store/productos/:id` (SQL, `:212-240`) + caché de detalle | `precio` del producto y de cada variante |
| Asesor IA | `precioEfectivo` (`agente/precios.js:11-15`, delega en `precioVigente` desde P1) y filtro de presupuesto **copiado en SQL** (`agente/tools/buscar-productos.js:276-282`, hallazgo H3 de precio-en-servidor) | El SQL deja de ser la regla: queda como **cota** (`precio_base × (100 − mayor % vigente) / 100 <= presupuesto` o `0 < precio_oferta <= presupuesto`, pide de más) y el filtro exacto se hace con `precioVigente`. Una sola regla |
| Carrito, mini carrito, checkout, pedido, WhatsApp, seguimiento | P2–P4: cotización y pedido en el servidor; WhatsApp con las líneas del pedido creado (P3 T3.4) | La cotización trae, por línea, regular, origen y campaña; el carrito se recalcula en cada cambio (R8.1) |
| Ficha del pedido del dueño y seguimiento del cliente | `precioUnitario` | + precio regular, descuento y de dónde vino (R8.3) |

**Orden y filtro por precio vigente** (`modules/catalogo/listado-por-precio.js`, puro, + uso en `productos.store.routes.js`): cuando la petición ordena o filtra por precio, el servicio arma el mismo `where` del genérico (`buildWhereClause` + `baseWhere` + tienda, `generic.service.js:95,320`), trae una **proyección liviana** de todos los que cumplen (`id, categoriaId, precioBase, precioOferta`), calcula `precioVigente` en memoria, filtra, ordena (desempate por `id`), pagina y luego lee la página con el `listSelect` de siempre. Tope de 5.000 filas por tienda (las pymes de hoy están muy por debajo; si se supera, se ordena por precio regular y se escribe en la bitácora). Por qué así y no en SQL: ver Alternativas (E4).

### Caché (reutiliza R3.9, no inventa otra)
| Capa | Hoy | Después |
|---|---|---|
| HTTP `/store/productos` | `cache(60)` (`routes/store/index.js:51`) | `cache(60, { hasta: body => body?.meta?.proximoCambioPrecio })` |
| Memoria home y detalle | 60 s fijos (`productos.cache.js:16-17`) | TTL `min(60 s, proximoCambio)` y `clear()` al guardar o confirmar una promoción |
| `/store/tiendas` | `proximoCambio` de las campañas activas | Agrega `promociones` (lo público de las vigentes, para las condiciones R6.5). Las fronteras ya están en `proximoCambio`; confirmar o guardar invalida con `invalidateTiendasListCache` |
| Contexto de precios | — | Memoria por tienda (arriba). Nunca en cotizar ni crear pedido |

Resultado: el listado puede mostrar un precio de hasta 60 s atrás (la spec tolera 5 min) y lo que se cobra es siempre el cálculo fresco (R6.6). No hace falta acortar la caché durante campañas (riesgo "Caché pública" de la spec).

## Carrito, pago y pedido (R7, R8)

- **Recalcular en cada cambio (R8.1):** la cotización de P4 (`POST /store/pedidos/cotizar`) se llama también desde el carrito y el mini carrito (sin destino: sin envío), con espera de 300 ms entre cambios. La Tienda guarda en cada línea `precio`, `regular`, `origen` y `campana`; si la cotización trae otro origen, arma el aviso de R6.6 ("la promoción terminó / empezó") sin estado en el servidor.
- **Precio asegurado 15 minutos (R8.4, Q4):** al entrar al paso de pago, la Tienda cotiza con `congelar: true` y recibe un **token firmado** (`aud: "precio-congelado"`, `tid`, vence en 15 min) con, por línea, `{ productoId, varianteId, unitario, regular, origen, campana }`. Al crear el pedido con un token válido de la misma tienda, cada línea cobra **el menor** entre el precio del token y el calculado en ese momento: si la campaña terminó o la apagaron (R8.6), se respeta lo que vio; si un precio bajó, paga menos. Sin token o vencido: se recalcula y, si sube, 409 de P2 (R6.6, CA-8.3). No hay tabla ni limpieza. Llave nueva `PRECIOS_TOKEN_SECRET` (cada uso firmado tiene la suya, como `RESENAS_`, `LIBRO_`, `RESERVAS_`, `TRANSMISIONES_LINK_SECRET` en `config/index.js:212-289`).
- **Snapshot por línea (R8.3):** a `precio_regular` y `precio_origen` de P2 se suman `campana_id`, `campana_nombre` y `promocion_porcentaje`; `precio_origen` admite `campana`. El descuento de la línea se deriva (`(regular − unitario) × cantidad`): no se guarda dos veces. Un pedido creado no cambia nunca (R8.5); la pasarela sigue cobrando `pedido.total` (R8.7, `pagos/pasarela/destinos.js:63`).
- **Cupones y envío gratis (R7):** en `cotizarCompra` (P1):
  - el cupón se evalúa con `evaluarCupon` **sin cambiarla**, pasándole como `subtotal` solo el de las líneas **elegibles** (sin campaña, o de una campaña con `permitirCupones`); mínimos y tope se miden ahí (R7.3); sin líneas elegibles se rechaza con "Los productos en promoción no admiten cupones" (mismo texto en carrito y pago, R7.6);
  - si alguna línea es de una campaña sin `permitirEnvioGratis`, se cotiza el envío con `envioGratisMinimo: null` (R7.3); `recojo_tienda` sigue gratis;
  - con el permiso encendido, todo se calcula sobre lo ya rebajado, como hoy (R7.4).
- **Cupón de la campaña (R4.8, R7.5):** fila de `cupones` con `campana_promocion_id`. Vale **solo si su promoción aplica en `ahora`** (regla pura `cuponDeCampanaVigente`, usada por `validarCupon` y por la cotización): fuera de la ventana el servidor lo rechaza aunque la Tienda tenga datos viejos (CA-4.7). Se rige por el mismo permiso de cupones.

## Admin: guardar la campaña completa en una sola operación

Hoy la campaña se guarda con `PUT /admin/tiendas/:id/diseno`, que reemplaza el arreglo entero. Para que **activar y confirmar** sean una sola cosa (CA-2.4, CA-2.5, CA-9.1: si el dueño cancela, nada cambia; CA-9.4: sin confirmar, el cambio no se guarda), se agrega un endpoint por campaña:

| Endpoint (todos `requireTiendaAccess("admin")`, como el PUT de diseño) | Qué hace |
|---|---|
| `PUT /admin/tiendas/:id/campanas/:campanaId` `{ campana, promocion \| null, confirmar? }` | En **una transacción**: bloquea la fila `campanas` de la tienda (`SELECT … FOR UPDATE`), reemplaza solo esa campaña, valida con `validarCampanasDeTienda`, guarda la promoción (sube `version` si cambia lo que se cobra) y, con `confirmar: { version, ventanaInicio, ventanaFin }`, inserta la confirmación. Si la campaña está activa con una promoción confirmada para su ventana en curso o próxima y el cambio toca porcentaje, alcance, permisos, cupón o fechas **sin** `confirmar` → 409 `CONFIRMACION_REQUERIDA`, sin guardar nada. Si lo que el dueño vio ya no coincide (`version` o ventana) → 409 `PROMOCION_CAMBIO`. Rechaza en tiendas sin `carrito` (R11.1, CA-11.1) |
| `GET /admin/tiendas/:id/campanas/:campanaId/promocion` | Promoción con sus ids, cupón y estado |
| `POST /admin/tiendas/:id/campanas/:campanaId/promocion/revision` `{ promocion, campana?, completa? }` | Solo lectura. Sin `completa`: cuántos productos entran hoy y el ejemplo (R4.6, paso 3). Con `completa`: todo lo del diálogo (R9.2): ventana, conteo, ejemplo, `muyAlto` (≥ 50 %), bajo costo (R4.9), con oferta propia (R10.7), subidas del precio regular en los 30 días previos con muestra y total (R10.2) y sin 30 días de historial (R10.4). Lee `precioCosto`: solo Admin |
| `GET /admin/tiendas/:id/campanas/calendario` (existe) | Cada campaña trae `promocion: { resumen, estado, confirmacion: { por, en }, recordar }` para chips y estado del paso 3 |
| `GET /admin/productos/ids?search=&categoriaId=` | Ids de todos los resultados para "Seleccionar los 40 resultados" (A5b), con tope de 2.000 |
| `GET /admin/productos/:id/promociones` | Promociones confirmadas que cubren el producto, en curso o que empiezan en los próximos 30 días (para el aviso R10.3 y el bloqueo R10.5 del formulario) |

Guardas en caminos existentes:
- `PUT /admin/tiendas/:id/diseno` (`validarCampanasDeTienda`): si cambia la ventana (fechas, horas, días antes/después, preset) de una campaña con promoción confirmada vigente o próxima → 409 "Esta campaña tiene una promoción confirmada: cambia sus fechas desde Campañas". Si el arreglo ya no trae una campaña, su promoción se borra en la misma transacción.
- `PUT /admin/productos/:id`, `PUT /admin/productos/:id/variantes`, `PUT` de variante (`productos.admin.routes.js:218,234`, `producto-variantes.admin.routes.js:93`): **subir** el precio regular de un producto cubierto por una promoción **en curso** → 409 `PRECIO_EN_PROMOCION` con campaña y fecha de fin (R10.5, CA-10.6). Bajarlo o editar otra cosa, permitido.

## Historial del precio regular (R10.4) — por trigger de BD

Tabla `producto_precio_historial`, llenada por **triggers** en `productos.precio_base` y `producto_variantes.precio` (alta y cambio), con una **línea base** para todo lo que ya existe el día del SQL. Así ningún camino se lo salta: formulario, sincronizar variantes, estrategias de rubro, SQL a mano. "Quién" sale de `usuario_actualizacion` (el genérico lo pone en cada edición, `generic.service.js:271`). "Hay 30 días de historial" = el primer registro del producto es anterior a `inicio − 30 días`. Se registran todos los rubros (en reserva el precio cambia poco y la tabla es chica); el aviso solo se usa en productos.

No depende de precio-en-servidor (el historial es del precio **regular** guardado, no del calculado): por eso C2 va ya, para que el reloj de 30 días empiece a correr (corrige la columna "Depende de" de la spec, R12.3 lo permite).

## Mapa de cambios

| Repo | Módulo / archivo | Tipo | Pieza | Por qué |
|---|---|---|---|---|
| Admin | `src/app/pages/campanas/campanas.component.ts` (633 líneas) / `.html` | se parte | C1 | La fila abierta pasa a `campana-pasos.component` (A2); el archivo baja de 400 líneas (antipatrones A6) |
| Admin | `src/app/pages/campanas/pasos/` (nuevo): `paso-campana.component.ts` (cabecera, `aria-expanded`), `paso-cuando.component.ts` (A3), `paso-aspecto.component.ts` (A4, con "Cuándo se ve el efecto"), `campana-pasos.component.ts` (CTA único, "Guardar sin activar", "Guardar y editar aspecto"), `estado-pasos.ts` (+ spec) | nuevo | C1 | R1, R2, decisiones A, B, D, E, F |
| Admin | `src/app/pages/diseno/diseno.component.ts` | cambia | C1 | Barra "← Volver a {campaña}" con `?volver=` (propuesta 8) |
| Backend | `docs/sql/campanas_descuento_historial.sql` (+ `_reversa`), `prisma/schema.prisma` (`producto_precio_historial`), `kernel/tenant/alcance.js` | nuevo / cambia | C2 | R10.4 |
| Backend | `modules/catalogo/precio-historial.repository.js` + `precio-historial.js` (puro: subidas en 30 días, cobertura) | nuevo | C2 | Lo leen la revisión (C3b) y el formulario (C4) |
| Backend | `docs/sql/campanas_descuento_promociones.sql` (+ `_reversa`), `prisma/schema.prisma` (4 modelos + `cupones.campanaPromocionId`), `kernel/tenant/alcance.js` | nuevo / cambia | C3a | Modelo de la promoción |
| Backend | `modules/campanas/promocion.js` (puro) + tests | nuevo | C3a | Cuándo aplica, estado, resumen ("−20 % en Zapatillas") |
| Backend | `modules/precios/precio-vigente.js` (P1) + tests | cambia | C3a | La promoción entra por `contexto.promociones` |
| Backend | `modules/precios/contexto.service.js`, `contexto.cache.js` | nuevo | C3a | Cargador y caché del contexto |
| Backend | `modules/catalogo/productos.serializer.js`, `productos.store.routes.js`, `productos.cache.js`, `listado-por-precio.js` (nuevo, puro) | cambia / nuevo | C3a | `precio` en listado, home, ficha y variantes; orden y filtro por precio vigente; caché hasta el próximo cambio |
| Backend | `routes/store/index.js:51` | cambia | C3a | `cache(60, { hasta })` en productos |
| Backend | `modules/tenants/tiendas.store.routes.js` | cambia | C3a | `promociones` públicas para las condiciones |
| Backend | `modules/agente/tools/buscar-productos.js:276-282`, `agente.serializer.js` | cambia | C3a | Cota en SQL + filtro exacto con `precioVigente` (H3) |
| Backend | `modules/precios/cotizacion-compra.service.js`, `modules/ordenes/crear-pedido.js` (P2) | cambia | C3a | Contexto fresco con promociones al cotizar y crear |
| Backend | `modules/campanas/promocion.repository.js`, `promocion.service.js`, `promocion.schema.js`, `promocion.admin.routes.js`; montaje en `routes/admin/index.js` | nuevo | C3b | Endpoints de la tabla de arriba |
| Backend | `modules/campanas/campanas.validacion.js`, `services/tienda-diseno.service.js:35-49`, `modules/campanas/campanas.service.js` (`getCalendario`) | cambia | C3b | Guarda de fechas, borrar promoción huérfana, estado en el calendario |
| Backend | `modules/catalogo/productos.admin.routes.js:218,234`, `producto-variantes.admin.routes.js:93`, `modules/campanas/promocion.guardas.js` (nuevo) | cambia / nuevo | C3b | R10.5 |
| Backend | `modules/idiomas/claves/` | cambia | C3b, C6, C7 | Mensajes nuevos con `clave(…)` |
| Tienda | `src/app/shared/components/precio-con-descuento/` (nuevo) | nuevo | C5 | Vigente + tachado + "−N %", único en tarjeta, ficha, carrito, mini carrito y pago (R6.2) |
| Tienda | `src/app/features/promocion/condiciones.ts` (puro: arma las condiciones desde la configuración; frases legales en un solo lugar, Q8) + `condiciones-promocion.component.ts` (franja y detalle) | nuevo | C5 | R6.5, decisión I |
| Tienda | `models/producto.model.ts`, `models/tienda.model.ts` | cambia | C5 | `PrecioVigente`, `Tienda.promociones?` (opcionales: backend anterior) |
| Tienda | `shared/components/product-card/product-card.component.ts:205-243`, `features/product/product-page/product-page.component.ts:575-600`, `features/home/sections/home-sections.component.ts`, `shared/components/search-overlay/search-overlay.component.ts`, `shared/components/chat-widget/chat-widget.component.ts`, `features/catalog/catalog-page/catalog-page.component.ts`, `features/category/category-page/category-page.component.ts`, `features/catalog/services/catalog.service.ts:96-117` | cambia | C5 | Dejan de calcular: leen `precio`. Franja de condiciones en categoría y catálogo |
| Tienda | `src/app/negocio/productos/precio.ts` (de P3 T3.1) | se borra | C5 | Era el espejo provisional "hasta que el API entregue el precio" (precio-en-servidor, escalonado (a)) |
| Backend | `docs/sql/campanas_descuento_pedidos.sql` (+ `_reversa`), `prisma/schema.prisma:804-820` | cambia | C6 | Snapshot de campaña por línea |
| Backend | `modules/precios/precio-congelado.token.js` (nuevo), `cotizacion-compra.js`, `crear-pedido.js`, `pedidos.schema.js` (`congelar`, `tokenPrecio`), `config/index.js` (`precios.tokenSecret`) | nuevo / cambia | C6 | R8.4, R8.3 |
| Backend | serializers del pedido (store y admin) en `modules/ordenes/` | cambia | C6 | Regular, descuento y origen por línea |
| Tienda | `state/cart.state.ts`, `features/cart/cart-page/cart-page.component.ts`, `shared/components/mini-cart/mini-cart.component.ts`, `features/checkout/estado/pedido.store.ts`, `checkout.store.ts`, `features/checkout/pasos/paso-pago/`, `features/order-tracking/order-tracking-page/order-tracking-page.component.ts` | cambia | C6 | Recalcular, avisos de cambio, precio asegurado, seguimiento |
| Admin | `src/app/pages/pedidos/pedido-detail/` | cambia | C6 | Líneas con regular, descuento y origen (A8, R8.3) |
| Backend | `modules/precios/cotizacion-compra.js`, `modules/campanas/promocion.js` (`cuponDeCampanaVigente`), `modules/cupones/cupones.service.js:99-151` | cambia | C7 | R7 |
| Tienda | `features/checkout/estado/cupon.store.ts`, `features/checkout/components/bloque-cupon/`, `desglose-total/`, carrito | cambia | C7 | Mensajes iguales en carrito y pago (R7.6) |
| Admin | `src/app/negocio/perfil-negocio.ts` + los 6 `negocio/<rubro>/perfil.ts` + `perfiles.spec.ts` | cambia | C4 | Capacidad `carrito` en el Admin (hoy no existe) |
| Admin | `src/app/pages/campanas/promocion/` (nuevo): `paso-promocion.component.ts` (A5), `selector-productos.component.ts` (A5b), `confirmar-promocion.component.ts` (A6), `textos-legales.ts` | nuevo | C4 | R4, R7.2, R9, R10 |
| Admin | `services/campanas.service.ts`, `models/campana.model.ts`, chips de la fila (A1), avisos R3.2/R3.3 en `pages/diseno/campana-edicion.ts:251-283` | cambia | C4 | Guardar por campaña; avisos cruzados |
| Admin | `pages/cupones/cupon-list/` | cambia | C4 | Chip "De la campaña…" y "Editar en la campaña →" |
| Admin | `pages/productos/producto-detail/` | cambia | C4 | Aviso R10.3 y bloqueo R10.5 (A8) |

## Contrato por rubro
- **Sin capacidad nueva en el backend ni en la Tienda.** El paso 3, la API de promociones y las condiciones preguntan por `carrito` (backend: lo agrega P2 en `contrato.js:40`; Tienda: ya existe, `perfil-negocio.ts:27`). En el backend se lee en un solo lugar, `admitePromociones(tipoNegocio)` en `promocion.service.js`. No se crea `promocionPrecios`: hoy no hay variación real (el único rubro con promoción es el único con carrito) y la promoción de reservas será otro mecanismo (precio por noche, código promocional H3) que pedirá su propia estrategia. Cuando llegue, se cambia esa función. Decisión E6.
- **Admin: capacidad `carrito` nueva en `PerfilNegocio`** (`true` solo en productos), con el mismo nombre que backend y Tienda. Hoy el Admin solo puede deducirlo de `reservas === null`, que es justo el acople que precio-en-servidor descartó (D4). `perfiles.spec.ts` del Admin cambia a propósito.
- **Textos:** la spec y el diseño piden textos por rubro en el perfil; aquí **no hay variación** (solo un rubro tiene paso 3 y condiciones), así que van como claves comunes del diccionario, mostradas por la capacidad. Agregar un campo `promocion` al perfil sería un segundo indicador equivalente a `carrito`, `null` en cinco rubros. Desvío menor del diseño ("Textos"), decisión E9. `PiezasUi`, `uis.spec.ts` y `LAYOUT_POR_NEGOCIO` no cambian.
- **Regresión posible:** los cinco rubros con reserva en C1 (el panel de Campañas se rearma; las fechas de uso pasan al paso 1). En el backend, el serializer de productos agrega `precio` a todos los rubros (sin promociones = regular u oferta, igual que hoy). `scripts/anti-identidad.mjs` y `anti-identidad.test.js` deben seguir verdes (CA-12.2).

## Patrones

| Patrón | Dónde se aplica | Por qué |
|---|---|---|
| **Función pura + cargador** (aprobado en precio-en-servidor D5; falta anotarlo en `patrones.md`) | `campanas/promocion.js` + `promocion.service.js`; `precios/precio-vigente.js` + `contexto.service.js`; `catalogo/listado-por-precio.js`; `catalogo/precio-historial.js` | Es como ya están hechos el calendario, el envío y la cotización. Las reglas de dinero se prueban sin BD con los casos de la spec |
| **Capacidades, no identidad** / **Registry + contrato** | `carrito` en el backend (de P2) y en el Admin (nuevo); `perfilDe(...).carrito` en la Tienda | El paso 3 existe por lo que la tienda hace, no por su nombre (R11.1, CA-12.2) |
| **Repository → Service → Controller** | `promocion.repository.js` / `.service.js` / `.admin.routes.js` | Endpoints nuevos |
| **Contexto ambiental + interceptor** y **Seguro por defecto** | 5 modelos nuevos con `tienda_id` en `ALCANCE` (falla `alcance.test.js` si falta), RLS en todas las tablas | Multi-tenant automático; las consultas SQL a mano llevan `tienda_id` explícito |
| **Fitness function** | (1) test que falla si `precioOferta` o `precioBase` se comparan para decidir un precio fuera de `modules/precios/` (backend) o si la Tienda vuelve a calcular `precioOferta \|\| precioBase`; (2) test de que `cotizar`/`crear-pedido` piden el contexto con `conCache: false` | "Una sola función de precio" se rompería en silencio (R6.1, ADR-0001.1) |
| **Serializer** | `precio` y `promociones` públicos sin `precioCosto`; la revisión del Admin sí lo usa | Lo que sale de la API |
| **Idempotencia** | Confirmación única por `(promocion_id, promocion_version, ventana_inicio)` (`ON CONFLICT DO NOTHING`) | Un doble clic en "Sí, aplicar" no duplica el registro |
| **Token firmado con `aud` propio** (práctica existente: `reservas.token.js`, `cotizacion.token.js`; no está en el catálogo) | `precios/precio-congelado.token.js` | Precio asegurado sin tabla. Se reutiliza la forma, no se inventa otra |
| Strategy por rubro | **No aplica** | Un solo rubro con promoción. La promoción en reservas sí la necesitará (`cotizar` por vertical) |
| Abstract Factory de UI / slot | **No aplica** | No cambia la estructura por rubro: el precio con descuento depende de datos; el paso 3 de una capacidad. El SSR no tiene tienda (`storeResolver` devuelve `{}`), así que tampoco hay productos ni precios en el HTML del servidor: no hay diferencia de hidratación (responde la duda de T1 del diseño) |
| Parámetro de plataforma | **No aplica** | 15 min, 30 días, 1–90 %, marca desde 50 % y aviso 30 días antes son reglas de la spec (mismo criterio que campanas-cuando). Candidato futuro: los 15 minutos |
| Concurrencia optimista (`version` esperada) | `campana_promociones.version` + `confirmar.version` | **No está en el catálogo** (decisión E2): la confirmación debe referirse exactamente a lo que el dueño vio. Alternativa descartada: comparar el contenido completo (más frágil) |

## Base de datos

Tres archivos, uno por pieza que los necesita, en transacción e idempotentes. **Nunca los corre el agente**: Diego en el SQL Editor de Supabase, antes del backend de su pieza, y luego `npx prisma generate`.

### `docs/sql/campanas_descuento_historial.sql` (C2)
```sql
-- ============================================================================
-- campanas-descuento C2 (R10.4): historial del precio regular de productos y variantes.
-- Lo llenan triggers: ningún camino de escritura se lo salta (admin, variantes,
-- estrategias de rubro, SQL a mano). Base del aviso de Indecopi (R10.2).
-- Correr ANTES del backend de C2. Idempotente.
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.producto_precio_historial (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id       uuid NOT NULL REFERENCES public.tiendas(id) ON DELETE CASCADE,
  producto_id     uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  variante_id     uuid NULL REFERENCES public.producto_variantes(id) ON DELETE CASCADE,
  precio_anterior numeric(10,2) NULL,              -- NULL en 'alta' y 'linea_base'
  precio_nuevo    numeric(10,2) NULL,              -- variante: NULL = usa el precio del producto
  motivo          varchar(20) NOT NULL CHECK (motivo IN ('alta','cambio','linea_base')),
  usuario         varchar(100) NULL,
  fecha           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_precio_historial_producto
  ON public.producto_precio_historial (tienda_id, producto_id, fecha DESC);

CREATE OR REPLACE FUNCTION public.precio_historial_producto() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO producto_precio_historial (tienda_id, producto_id, precio_nuevo, motivo, usuario)
    VALUES (NEW.tienda_id, NEW.id, NEW.precio_base, 'alta', NEW.usuario_registro);
  ELSIF NEW.precio_base IS DISTINCT FROM OLD.precio_base THEN
    INSERT INTO producto_precio_historial (tienda_id, producto_id, precio_anterior, precio_nuevo, motivo, usuario)
    VALUES (NEW.tienda_id, NEW.id, OLD.precio_base, NEW.precio_base, 'cambio',
            COALESCE(NEW.usuario_actualizacion, NEW.usuario_registro));
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.precio_historial_variante() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_tienda uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.precio IS NOT DISTINCT FROM OLD.precio THEN RETURN NEW; END IF;
  SELECT tienda_id INTO v_tienda FROM productos WHERE id = NEW.producto_id;
  INSERT INTO producto_precio_historial (tienda_id, producto_id, variante_id, precio_anterior, precio_nuevo, motivo, usuario)
  VALUES (v_tienda, NEW.producto_id, NEW.id,
          CASE WHEN TG_OP = 'UPDATE' THEN OLD.precio END, NEW.precio,
          CASE WHEN TG_OP = 'INSERT' THEN 'alta' ELSE 'cambio' END,
          COALESCE(NEW.usuario_actualizacion, NEW.usuario_registro));
  RETURN NEW;
END $$;

-- Solo se agrega: un registro de Indecopi no se edita. (DELETE sí: llega por cascada al borrar el producto.)
CREATE OR REPLACE FUNCTION public.precio_historial_inmutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'El historial de precios no se puede modificar';
END $$;

DROP TRIGGER IF EXISTS trg_productos_precio_historial ON public.productos;
CREATE TRIGGER trg_productos_precio_historial
  AFTER INSERT OR UPDATE OF precio_base ON public.productos
  FOR EACH ROW EXECUTE FUNCTION public.precio_historial_producto();

DROP TRIGGER IF EXISTS trg_variantes_precio_historial ON public.producto_variantes;
CREATE TRIGGER trg_variantes_precio_historial
  AFTER INSERT OR UPDATE OF precio ON public.producto_variantes
  FOR EACH ROW EXECUTE FUNCTION public.precio_historial_variante();

DROP TRIGGER IF EXISTS trg_precio_historial_inmutable ON public.producto_precio_historial;
CREATE TRIGGER trg_precio_historial_inmutable
  BEFORE UPDATE ON public.producto_precio_historial
  FOR EACH ROW EXECUTE FUNCTION public.precio_historial_inmutable();

-- Línea base: el precio de hoy de lo que ya existe (desde aquí corren los 30 días).
INSERT INTO public.producto_precio_historial (tienda_id, producto_id, precio_nuevo, motivo, usuario)
SELECT p.tienda_id, p.id, p.precio_base, 'linea_base', 'sistema'
FROM public.productos p
WHERE NOT EXISTS (SELECT 1 FROM public.producto_precio_historial h
                  WHERE h.producto_id = p.id AND h.variante_id IS NULL);

INSERT INTO public.producto_precio_historial (tienda_id, producto_id, variante_id, precio_nuevo, motivo, usuario)
SELECT p.tienda_id, v.producto_id, v.id, v.precio, 'linea_base', 'sistema'
FROM public.producto_variantes v JOIN public.productos p ON p.id = v.producto_id
WHERE NOT EXISTS (SELECT 1 FROM public.producto_precio_historial h WHERE h.variante_id = v.id);

-- RLS sin políticas: solo el backend (service role) la lee y escribe.
ALTER TABLE public.producto_precio_historial ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Verificación (solo lectura): una fila por producto y variante.
-- SELECT motivo, count(*) FROM public.producto_precio_historial GROUP BY motivo;
```

`docs/sql/campanas_descuento_historial_reversa.sql`:
```sql
BEGIN;
DROP TRIGGER IF EXISTS trg_productos_precio_historial ON public.productos;
DROP TRIGGER IF EXISTS trg_variantes_precio_historial ON public.producto_variantes;
DROP TABLE IF EXISTS public.producto_precio_historial;
DROP FUNCTION IF EXISTS public.precio_historial_producto();
DROP FUNCTION IF EXISTS public.precio_historial_variante();
DROP FUNCTION IF EXISTS public.precio_historial_inmutable();
COMMIT;
```

### `docs/sql/campanas_descuento_promociones.sql` (C3a)
```sql
-- ============================================================================
-- campanas-descuento C3 (R4, R5, R9): promoción por porcentaje de una campaña.
-- La campaña sigue en tienda_configuraciones (clave "campanas"); se liga por su id
-- UUID (sin FK: vive en JSON). Si la campaña se borra, el backend borra su promoción.
-- Correr ANTES del backend de C3a. Idempotente. Tablas vacías: no afecta a nadie.
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.campana_promociones (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id             uuid NOT NULL REFERENCES public.tiendas(id) ON DELETE CASCADE,
  campana_id            uuid NOT NULL,
  porcentaje            smallint NOT NULL CHECK (porcentaje BETWEEN 1 AND 90),
  alcance               varchar(12) NOT NULL CHECK (alcance IN ('tienda','categorias','productos')),
  permitir_cupones      boolean NOT NULL DEFAULT false,
  permitir_envio_gratis boolean NOT NULL DEFAULT false,
  version               integer NOT NULL DEFAULT 1,   -- sube con cada cambio de lo que se cobra (R9.5)
  fecha_registro        timestamptz DEFAULT now(),
  usuario_registro      varchar(100),
  fecha_actualizacion   timestamptz,
  usuario_actualizacion varchar(100),
  CONSTRAINT uq_promocion_campana UNIQUE (tienda_id, campana_id)   -- una promoción por campaña (R4.7)
);

CREATE TABLE IF NOT EXISTS public.campana_promocion_categorias (
  promocion_id uuid NOT NULL REFERENCES public.campana_promociones(id) ON DELETE CASCADE,
  tienda_id    uuid NOT NULL REFERENCES public.tiendas(id) ON DELETE CASCADE,
  categoria_id uuid NOT NULL REFERENCES public.categorias(id) ON DELETE CASCADE,
  PRIMARY KEY (promocion_id, categoria_id)
);
CREATE INDEX IF NOT EXISTS idx_promocion_categorias_tienda
  ON public.campana_promocion_categorias (tienda_id, categoria_id);

CREATE TABLE IF NOT EXISTS public.campana_promocion_productos (
  promocion_id uuid NOT NULL REFERENCES public.campana_promociones(id) ON DELETE CASCADE,
  tienda_id    uuid NOT NULL REFERENCES public.tiendas(id) ON DELETE CASCADE,
  producto_id  uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  PRIMARY KEY (promocion_id, producto_id)
);
CREATE INDEX IF NOT EXISTS idx_promocion_productos_tienda
  ON public.campana_promocion_productos (tienda_id, producto_id);

-- Quién confirmó, cuándo y qué (R9.4), para una versión y una ventana exactas (R9.5, R9.6).
CREATE TABLE IF NOT EXISTS public.campana_promocion_confirmaciones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id         uuid NOT NULL REFERENCES public.tiendas(id) ON DELETE CASCADE,
  promocion_id      uuid NULL REFERENCES public.campana_promociones(id) ON DELETE SET NULL,
  campana_id        uuid NOT NULL,
  promocion_version integer NOT NULL,
  ventana_inicio    timestamptz NOT NULL,
  ventana_fin       timestamptz NOT NULL CHECK (ventana_fin > ventana_inicio),
  detalle           jsonb NOT NULL,         -- porcentaje, alcance e ids, permisos, cupón, avisos mostrados
  confirmado_por    varchar(100) NOT NULL,
  confirmado_en     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_confirmacion_version_ventana
  ON public.campana_promocion_confirmaciones (promocion_id, promocion_version, ventana_inicio, ventana_fin);
CREATE INDEX IF NOT EXISTS idx_confirmaciones_tienda
  ON public.campana_promocion_confirmaciones (tienda_id, campana_id, confirmado_en DESC);

-- Registro de auditoría: no se edita. Única excepción: el SET NULL al borrar la promoción.
CREATE OR REPLACE FUNCTION public.confirmaciones_inmutables() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.promocion_id IS NULL
     AND (OLD.id, OLD.tienda_id, OLD.campana_id, OLD.promocion_version, OLD.ventana_inicio,
          OLD.ventana_fin, OLD.detalle, OLD.confirmado_por, OLD.confirmado_en)
         IS NOT DISTINCT FROM
         (NEW.id, NEW.tienda_id, NEW.campana_id, NEW.promocion_version, NEW.ventana_inicio,
          NEW.ventana_fin, NEW.detalle, NEW.confirmado_por, NEW.confirmado_en) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Una confirmación de promoción no se puede modificar';
END $$;
DROP TRIGGER IF EXISTS trg_confirmaciones_inmutables ON public.campana_promocion_confirmaciones;
CREATE TRIGGER trg_confirmaciones_inmutables
  BEFORE UPDATE ON public.campana_promocion_confirmaciones
  FOR EACH ROW EXECUTE FUNCTION public.confirmaciones_inmutables();

-- Cupón de la campaña (R4.8): vence con su promoción; uno por promoción.
ALTER TABLE public.cupones
  ADD COLUMN IF NOT EXISTS campana_promocion_id uuid NULL
  REFERENCES public.campana_promociones(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cupon_promocion
  ON public.cupones (campana_promocion_id) WHERE campana_promocion_id IS NOT NULL;

-- RLS sin políticas: solo el backend (service role).
ALTER TABLE public.campana_promociones              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campana_promocion_categorias     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campana_promocion_productos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campana_promocion_confirmaciones ENABLE ROW LEVEL SECURITY;

COMMIT;
```

`docs/sql/campanas_descuento_promociones_reversa.sql` (después de revertir el backend; borra promociones, confirmaciones y cupones de campaña):
```sql
BEGIN;
DROP INDEX IF EXISTS public.uq_cupon_promocion;
DELETE FROM public.cupones WHERE campana_promocion_id IS NOT NULL;
ALTER TABLE public.cupones DROP COLUMN IF EXISTS campana_promocion_id;
DROP TABLE IF EXISTS public.campana_promocion_confirmaciones;
DROP TABLE IF EXISTS public.campana_promocion_productos;
DROP TABLE IF EXISTS public.campana_promocion_categorias;
DROP TABLE IF EXISTS public.campana_promociones;
DROP FUNCTION IF EXISTS public.confirmaciones_inmutables();
COMMIT;
```

### `docs/sql/campanas_descuento_pedidos.sql` (C6)
```sql
-- campanas-descuento C6 (R8.3): de qué campaña vino el descuento de cada línea.
-- Se suma al snapshot de precio-en-servidor (precio_regular, precio_origen). Sin FK: es una foto.
BEGIN;
ALTER TABLE public.pedido_detalles
  ADD COLUMN IF NOT EXISTS campana_id           uuid,
  ADD COLUMN IF NOT EXISTS campana_nombre       varchar(120),
  ADD COLUMN IF NOT EXISTS promocion_porcentaje smallint;
COMMENT ON COLUMN public.pedido_detalles.precio_origen IS
  'De dónde salió precio_unitario: regular | oferta | campana. NULL = pedido anterior a precio-en-servidor.';
COMMENT ON COLUMN public.pedido_detalles.campana_id IS
  'Campaña cuya promoción fijó el precio (origen campana). NULL en los demás casos.';
COMMIT;
```
Reversa (`_reversa.sql`): `ALTER TABLE public.pedido_detalles DROP COLUMN IF EXISTS promocion_porcentaje, DROP COLUMN IF EXISTS campana_nombre, DROP COLUMN IF EXISTS campana_id;` (después de revertir el backend).

**Datos existentes.** Ninguna tienda cambia: el JSON de campañas no se migra, las tablas de promoción nacen vacías, los pedidos viejos quedan con `NULL` ("anterior al cambio"). El historial arranca con una línea base por producto y variante: el aviso de 30 días será parcial durante el primer mes (lo dice la confirmación, R10.4).

## Configuración

| Llave | Repo / plataforma | Nueva / cambia / se quita | Valor de ejemplo / cómo generarla |
|---|---|---|---|
| `PRECIOS_TOKEN_SECRET` | Backend (Railway) | **Nueva** (C6) | `openssl rand -hex 32`. Firma el "precio asegurado" de 15 min. Obligatoria en producción: el backend la valida al arrancar y se niega a iniciar sin ella (mejor que descubrirlo en el paso de pago). Cambiarla solo invalida precios asegurados en curso (el cliente ve el recálculo) |

Ningún parámetro de plataforma nuevo, cambiado ni quitado (ver "Patrones").

## Alternativas consideradas

| Opción | A favor | En contra | Elegida |
|---|---|---|---|
| Promoción **dentro del JSON** de la campaña | Un solo lugar; sin SQL | Se lee el diseño entero en cada listado y pedido; el editor de Diseño la pisaría al guardar; sin FK para cientos de ids; auditoría y consulta "¿producto en promoción?" incómodas | No (E1) |
| **Tablas propias** ligadas por `campana_id` | Lectura barata e indexada; integridad; nadie la pisa desde Diseño | 4 tablas y un SQL | **Sí** (E1) |
| Pasar **todas las campañas** a tabla ahora | Integridad total | Migrar el JSON de todas las tiendas, guardado y vista previa del editor, sin que la promoción lo necesite | No |
| Guardar campaña (PUT diseño) y confirmar (otro POST) en **dos llamadas** | Sin endpoint nuevo | Estados intermedios: fechas guardadas sin confirmar, o activa sin confirmar si falla la segunda; CA-9.4 no se cumple | No (E2) |
| **Un endpoint por campaña** que guarda campaña + promoción + confirmación en una transacción | Atómico; además deja de reescribir el arreglo entero desde Campañas | Un endpoint más y una guarda en el PUT de diseño | **Sí** (E2) |
| Historial desde el **código** (al guardar producto) | Testeable en JS | Hay al menos 4 caminos que escriben precios; uno olvidado deja el aviso de Indecopi ciego | No (E3) |
| Historial por **trigger** | Ningún camino se lo salta; precedente en el Libro de Reclamaciones | Lógica en la BD (se prueba con la consulta de verificación) | **Sí** (E3) |
| Orden por precio con una **expresión SQL** de la promoción | Rápido con muchos productos | Segunda implementación de la regla (como H3 del asesor), sin tests sin BD | No (E4) |
| Columna **materializada** `precio_vigente` actualizada por un job en cada frontera | Orden en la BD | Es reescribir precios por otra puerta (ADR-0001 descarta reescribir); falla a mitad = precios rotos | No |
| Orden y filtro **en memoria** con `precioVigente` sobre una proyección liviana | Una sola regla; corrige el bug de hoy (ordena sin la oferta) | O(n) por petición de orden; tope de 5.000 productos | **Sí** (E4) |
| Precio asegurado en una **tabla** de cotizaciones | Consultable | Tabla, limpieza y una escritura por visita al pago | No (E5) |
| Token firmado reutilizando `RESERVAS_LINK_SECRET` | Sin llave nueva | Rompe la convención de una llave por uso firmado; rotarla afectaría links de reservas de 120 días | No (E5) |
| **Token firmado con llave propia** | Sin estado; patrón existente; vence solo | Una llave más al desplegar | **Sí** (E5) |
| Capacidad nueva `promocionPrecios` | Lista para reservas | Hoy equivale a `carrito`: segundo indicador sin variación real | No (E6) |
| Publicar el paso 3 del Admin **antes** que carrito, pago y cupones (orden de la spec "C4 antes de C7") | Diego lo ve antes | Los dueños podrían crear promociones con el carrito sin recálculo, sin snapshot y con cupones combinándose por defecto (contra R7.1) | No: C4 va al final (E7) |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| **Cobrar distinto de lo anunciado** | Media | Una sola función (`precioVigente`), fitness function, contexto fresco al cobrar, precio asegurado y aviso antes de pagar (R6.6). Ningún dueño puede crear promociones hasta que C3a–C7 estén en producción (E7) |
| **Trabajo sin commit en los mismos archivos**: campanas-cuando (Admin `campanas.component.*`, `diseno/*`, `perfil-negocio.ts`; backend `modules/campanas/*`, `tiendas.store.routes.js`, `utils/cache.js`, `routes/*/index.js`) y antipatrones A5.3 (checkout de la Tienda, `pasos/` sin commit) | Alta | Requisito antes de C1: commit de campanas-cuando. Antes de C6: A5.3 y precio-en-servidor P3/P4 con commit. Cada pieza lo dice en `tasks.md` |
| **Una edición de la plataforma corregida** (Cyber Wow) cambia la ventana y deja sin confirmar promociones ya confirmadas | Baja | Falla hacia lo seguro (sin descuento). El chip "Confirma tu promoción" aparece solo en Campañas. C3b agrega al conteo de R7.7 (diálogo de ediciones) cuántas tiendas tienen promoción confirmada en esa edición |
| **Rendimiento del listado** con promociones (contexto + orden en memoria) | Baja | Camino rápido sin promociones (`EXISTS`); contexto en caché por tienda; orden en memoria solo al ordenar o filtrar por precio; tope y bitácora. Verificar con la tienda demo más grande |
| **Varias instancias del backend** (la caché en memoria no se limpia entre instancias) | Baja hoy (una instancia en Railway) | El dinero no usa caché; las cachés de vitrina vencen en ≤ 60 s y en el próximo cambio. Ya está anotado en `productos.cache.js:12-13` (Redis cuando haya multi-instancia) |
| **Indecopi**: aviso de 30 días parcial el primer mes; textos legales sin revisión | Alta el primer mes | C2 va primero; la confirmación dice "Aún no tenemos 30 días de historial". Q8: textos en un solo archivo por front (`textos-legales.ts`, `condiciones.ts`) para la revisión legal antes de desplegar C4 |
| Choque con multi-sede pieza 4 en `tiendas.store.routes.js` | Media | Campos distintos (`promociones` vs sedes). Si una promoción por sede llega algún día, entra por el mismo `contexto` (`campanasAplicables(_contexto)` ya tiene el hueco) |

## Orden de despliegue y reversa

**Dependencias con precio-en-servidor (P1–P4) y orden de las piezas:**

| Pieza | Repos | Depende de | Se puede publicar |
|---|---|---|---|
| C1 Pasos 1 y 2 en el Admin | Admin | campanas-cuando con commit | Ya |
| C2 Historial de precios | Supabase + Backend | nada | **Ya** (empieza el reloj de 30 días) |
| C3a Promoción en el servidor | Supabase + Backend | **P1 y P2 en producción** (`precioVigente`, cotización, `crear-pedido`, `carrito`) y P3 (aviso 409 en la Tienda) — R12.1 | Sí: inerte, nadie puede crear una promoción |
| C3b API de la promoción para el Admin | Backend | C2, C3a | Sí: inerte sin el paso 3 |
| C5 Tienda: precio tachado y condiciones | Tienda | C3a | Sí: sin promociones se ve igual (o con la oferta tachada, como hoy) |
| C6 Carrito, pago y pedido | Supabase + Backend + Tienda + Admin | **P4** (`/store/pedidos/cotizar`), C3a, C5; antipatrones A5.3 con commit | Sí |
| C7 Cupones y envío gratis con promoción | Backend + Tienda | C6 | Sí |
| C4 Paso 3 en el Admin | Admin (+ backend ya listo) | C1, C3b y **C5–C7 en producción** | **Al final**: es el interruptor que da la promoción a los dueños |

Para probar C5–C7 antes de C4, el desarrollador crea una promoción en la tienda demo con el endpoint de C3b y deja la llamada en `cambios.md`.

**Orden dentro de cada pieza:** SQL en Supabase → `npx prisma generate` → backend → Tienda → Admin. En C6, la llave `PRECIOS_TOKEN_SECRET` en Railway antes del backend.

**Reversa:**
- C1, C4, C5: revertir el commit del front.
- C2: revertir el backend y, si se quiere, `campanas_descuento_historial_reversa.sql` (pierde el historial: preferible dejarlo).
- C3a/C3b: revertir el backend → los precios vuelven a los de P1 al instante (la promoción solo existe si el código la lee). Las tablas pueden quedarse.
- C6: revertir backend y Tienda; las columnas nuevas son opcionales y pueden quedarse. Pedidos creados con campaña conservan su foto.
- C7: revertir el backend → cupones y envío gratis como en P2 (se combinan).
- **Apagado de emergencia sin deploy:** apagar la campaña en Campañas corta la promoción en el siguiente cálculo (R8.6).

## Decisiones para Diego

- **E1. La promoción en tablas propias** (no en el JSON de diseño), ligada por el `id` de la campaña. Recomendado.
- **E2. Guardar la campaña completa en un solo paso** (`PUT /admin/tiendas/:id/campanas/:campanaId`, con confirmación en la misma operación y `version` esperada). Recomendado.
- **E3. Historial de precios con triggers** de la base de datos y línea base el día del SQL. Recomendado.
- **E4. Ordenar y filtrar por el precio que se cobra** calculándolo en memoria (tope 5.000 productos por tienda). Corrige además que hoy "Menor precio" ignora la oferta. Recomendado.
- **E5. Precio asegurado de 15 min con token firmado** y llave nueva `PRECIOS_TOKEN_SECRET`. Recomendado.
- **E6. Sin capacidad nueva:** el paso 3 sale de `carrito`; el Admin recibe `carrito` en su perfil. Recomendado.
- **E7. El paso 3 del Admin se publica al final** (después de carrito, pago y cupones). Cambia el orden sugerido por la spec (C4 antes de C7). Recomendado.
- **E8. Empate entre la oferta del producto y la promoción: gana la oferta** (mismo precio para el cliente; conserva el comportamiento de cupones de hoy). Recomendado.
- **E9. Textos de la promoción como claves comunes, no en el perfil del rubro** (desvío menor del diseño, "Textos"): un solo rubro los usa. Recomendado.
- **E10. C2 no depende de precio-en-servidor** (corrige la tabla "Cómo dividirlo" de la spec). Recomendado: construirla ya.

## Para Diego

**Qué se construye.** En Campañas abres una campaña y ves tres pasos con su estado: cuándo, cómo se verá y (solo tiendas de productos) la promoción. En el paso 3 eliges a qué productos llega y el porcentaje; al activar, confirmas en un diálogo que te muestra fechas, ejemplo y avisos de Indecopi. Durante la campaña el servidor baja los precios solo, sin tocar los que tú cargaste; la tienda los muestra tachados igual en todas partes, el carrito se recalcula, el cliente tiene su precio asegurado 15 minutos mientras paga y cada pedido guarda de qué campaña vino el descuento.

**Piezas: 8.**
1. **C1** Campañas en tres pasos (sin promoción): ves los pasos con su estado y un solo botón "Activar campaña", en todos los rubros.
2. **C2** Historial de precios: nada visible; desde ese día se registra cada cambio de precio (cuenta los 30 días de Indecopi).
3. **C3a** El servidor sabe aplicar promociones: nada visible.
4. **C3b** La API del paso 3 y el bloqueo de subir precios en promoción: nada visible.
5. **C5** La tienda muestra precio tachado, "−20 %" y condiciones (con una promoción de prueba).
6. **C6** Carrito, pago y pedido: avisos de cambio de precio, "Precio asegurado (15 min)" y la campaña en cada línea del pedido.
7. **C7** Cupones y envío gratis respetan los permisos de la promoción.
8. **C4** El paso 3 en el Admin: armas, confirmas y activas tu promoción. Va al final a propósito.

**3 riesgos.** (1) Cobrar distinto de lo anunciado: una sola calculadora en el servidor y el paso 3 sale solo cuando todo lo demás está publicado. (2) Hay trabajo sin commit de campanas-cuando y del checkout en los mismos archivos: se hace commit antes de empezar. (3) El aviso de Indecopi necesita 30 días de historial: por eso C2 va ya.

**Al desplegar.** Correr en Supabase, cada uno antes del backend de su pieza: `campanas_descuento_historial.sql` (C2), `campanas_descuento_promociones.sql` (C3a), `campanas_descuento_pedidos.sql` (C6). Poner `PRECIOS_TOKEN_SECRET` en Railway antes del backend de C6. Antes de publicar C4: que alguien de lo legal lea los textos de condiciones y del aviso de 30 días (Q8).
