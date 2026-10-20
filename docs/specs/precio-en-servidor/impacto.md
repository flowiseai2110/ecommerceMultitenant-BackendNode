# Impacto: precio y descuento calculados en el servidor (productos)

> Decisión: [ADR-0001](../../adr/ADR-0001-precio-calculado-en-servidor.md) (aceptada) · Origen: [campanas-cuando](../campanas-cuando/spec.md) Q5 / P-b, CA-5.5 · Rubro: [productos.md](../../rubros/productos.md) ("Riesgos de reglas") · Estado: aprobado 2026-10-20 (D1–D6) 
>
> Flujo corto aprobado por Diego (bug crítico): sin spec propia. Este documento hace de spec y de impacto.

## Resumen en una frase
Hoy la tienda en línea le dice al servidor cuánto cuesta cada producto y cuánto descuento aplicar, y el servidor le cree; después del cambio el servidor calcula él mismo precios, oferta, cupón y envío con sus datos, y si el cliente vio un total menor al real se le avisa antes de crear el pedido.

## Qué confía hoy el servidor (flujo actual de punta a punta)

Un solo camino crea pedidos de compra: `POST /api/v1/store/pedidos` (`modules/ordenes/pedidos.store.routes.js:32-49`) → `PedidosService.create` (`modules/ordenes/pedidos.service.js:128-318`). El admin no crea pedidos (solo `PUT` de estado, pago y detalles logísticos en `pedidos.admin.routes.js:97,113,129`, que no tocan montos). El asesor IA no crea pedidos. Las reservas usan otro camino (ver Hallazgos).

| # | Dato que manda el navegador | Dónde se acepta | Qué permite |
|---|---|---|---|
| C1 | `detalles[].precioUnitario` | `pedidos.schema.js:12`; se usa en `pedidos.service.js:163` y se guarda en `:276` | **Pagar cualquier precio** por cualquier producto |
| C2 | `detalles[].descuento` por línea | `pedidos.schema.js:13`; `pedidos.service.js:163,277` | Descontar lo que quiera; sin tope, una línea puede quedar **negativa** |
| C3 | `descuentoMonto` del pedido | `pedidos.schema.js:85`; `pedidos.service.js:134,187,248` | Descuento libre **aunque no haya cupón**; el total puede quedar **negativo** (nada lo limita) |
| C4 | Cupón: el código se valida (activo, fechas, usos, máximo por cliente: `pedidos.service.js:199-229`) pero **el monto del descuento no se calcula** (sale de C3) y **no se revisa la compra mínima** (sí lo hace `cupones.service.js:114`, que solo usa el checkout para mostrar) | `pedidos.service.js:199-229` | Usar un cupón bajo el mínimo y con el monto que uno quiera |
| C5 | `usoActual` del cupón se lee y luego se incrementa sin condición | `pedidos.service.js:211-212` y `:224-227` | Dos pedidos simultáneos pasan el tope `usoMaximo` |
| C6 | `detalles[].productoId` opcional | `pedidos.schema.js:5`; `inventario.service.js:36` (`if (!item.productoId) continue`) | **Líneas inventadas**: sin producto, sin control de stock, con nombre y precio libres |
| C7 | `varianteId` no se cruza con `productoId` | `inventario.service.js:55-65` (solo verifica que la variante sea de la tienda) | Declarar el producto barato A con la variante del producto caro B |
| C8 | `productoNombre` / `varianteNombre` | `pedidos.schema.js:7-8`; `pedidos.service.js:273-274` | El pedido muestra lo que el atacante escriba (engaña al dueño al despachar) |
| C9 | Envío sin `metodoEnvioId`: costo 0 y **nombre del método tomado del body** | `pedidos.service.js:172-185` | Pedir "Delivery" sin pagarlo omitiendo el id |
| C10 | Tienda de un rubro de reserva (hotel, tours…) | Ningún control de rubro en el camino de compra | Crear pedidos de compra con productos de precio 0 (el hotel guarda `precioBase: 0`, `negocio/hotel/estrategia.js:9-12`) |

Lo que **ya está bien** y se conserva: el costo del envío con `metodoEnvioId` lo cotiza el servidor (`cotizacion.service.js:40-51`, regla pura en `envios/cotizacion.js:41`; PRO-09 a PRO-13); el stock se valida y bloquea (`inventario.service.js:30`); la pasarela cobra `pedido.total` del servidor (`pagos/pasarela/destinos.js:63`); el tope de S/ 700 de la boleta se mide sobre el total del servidor (`pedidos.service.js:191`).

En la Tienda: el precio se fija al **agregar al carrito** y vive en `localStorage` (`state/cart.state.ts:22,35`); la regla está repetida en `product-page.component.ts:575-581` y `product-card.component.ts:236` (`precioOferta || precioBase`, **sin** exigir que la oferta sea menor); el checkout manda `precioUnitario`, `descuento: 0`, `costoEnvio` y `descuentoMonto` (`checkout/services/checkout.service.ts:45-53,73-75`; `estado/pedido.store.ts:175-177`); el cupón se valida con el total del carrito (`estado/cupon.store.ts:274`). Un carrito guardado con un precio viejo hoy "se honra" por accidente.

## Cómo lo calcula el servidor (regla)

### `precioVigente(producto, variante, contexto)` — una sola función pura (ADR-0001 punto 1)
Nuevo `modules/precios/precio-vigente.js`, sin Prisma ni red. Trabaja en **céntimos enteros** para no arrastrar errores de coma flotante; convierte en el borde.

```
regular  = variante?.precio > 0 ? variante.precio : producto.precioBase      // precio de referencia (ADR-0001 punto 6)
unitario = variante?.precio > 0 ? variante.precio                            // la oferta es del producto (productos.md, "Lo que NO es")
         : (0 < producto.precioOferta < producto.precioBase ? producto.precioOferta : producto.precioBase)
origen   = unitario < regular ? "oferta" : "regular"
→ { unitario, regular, origen }
```
- `contexto` = `{ ahora }` hoy; es el punto donde `campanas-descuento` agrega `promociones` y la regla "gana el mayor descuento, sin sumar sobre el mismo producto" (ADR-0001 punto 4). Hoy no se lee nada más.
- Es la misma regla que ya usa el asesor IA (`modules/agente/precios.js:11-15`, `precioEfectivo`), que pasa a delegar en esta función: **una sola forma**.
- Precio vigente `<= 0` → la línea se rechaza ("Producto sin precio"); en productos el precio es obligatorio y > 0 (PRO-01).
- **Redondeo único del sistema** (lo pide `campanas-descuento` R5.5): todo se calcula en céntimos enteros y cada resultado intermedio (descuento de un cupón por porcentaje; mañana, precio de campaña) se redondea **al céntimo más cercano, mitad hacia arriba**, en una sola función (`redondearCentimos`) dentro de `modules/precios/`. Ejemplo que fija el test: 19,99 con 20 % = 15,99 (CA-5.6 de `campanas-descuento`).

### Cotización del pedido (núcleo puro + cargador, como `envios/cotizacion.js` + `cotizacion.service.js`)
- `modules/precios/cotizacion-compra.js` (pura): recibe líneas `{ producto, variante, cantidad }` ya cargadas, el cupón (o null) con sus usos, la cotización de envío y `ahora`; devuelve `{ lineas: [{ productoId, varianteId, nombre, varianteNombre, cantidad, precioUnitario, precioRegular, precioOrigen, total }], subtotal, descuentoCupon, costoEnvio, total }`.
- `modules/precios/cotizacion-compra.service.js` (cargador): una consulta por tabla (productos y variantes de la tienda, `WHERE tienda_id = … AND id = ANY(…)`), sin N+1. Exige: producto activo y de la tienda; variante activa, de la tienda **y del mismo producto** (C7); `productoId` obligatorio (C6).
- **Cupón**: regla pura nueva `modules/cupones/regla-cupon.js` (`evaluarCupon(cupon, { subtotal, ahora, usosCliente })`) que usan **los dos**: `validarCupon` (lo que muestra el checkout) y la cotización del pedido. Reglas: activo, `fechaInicio <= ahora <= fechaFin`, usos disponibles, **compra mínima** (C4), máximo por cliente; `porcentaje` sobre el subtotal ya con oferta, `monto_fijo` hasta el subtotal; el descuento **nunca supera el subtotal**. El incremento de uso pasa a ser condicional (`UPDATE … WHERE uso_actual < uso_maximo`, 0 filas = "Cupón agotado") (C5).
- **Envío**: el de hoy (`cotizarMetodoEnvio`) con el subtotal y el descuento **del servidor**. Si la tienda tiene métodos de envío activos, `metodoEnvioId` es obligatorio; si no tiene ninguno, el pedido va "Por coordinar" con costo 0 y el nombre no sale del body (C9).
- **Total** = `max(0, subtotal − descuentoCupon + costoEnvio)`, redondeado a céntimos.
- **Rubro**: antes de cotizar, la tienda debe tener la capacidad `carrito` (rubro desde la BD con `tiendaDe`, nunca del body) (C10).

### Qué se ignora del navegador
Se quitan del `createPedidoSchema`: `precioUnitario`, `descuento`, `productoNombre`, `varianteNombre` (por línea), `costoEnvio`, `descuentoMonto`. El middleware valida con `safeParse` (`middlewares/validation.middleware.js:15`), que **descarta las llaves desconocidas**: una Tienda vieja que los siga mandando no falla, simplemente el servidor no los ve.

### Si el navegador vio un total distinto (ADR-0001 punto 2 y "el pago avisa si el total cambió")
- Campo nuevo opcional `totalEsperado` (lo que el cliente vio). **No se usa para calcular**: solo para saber si el cliente aceptó un monto menor al real.
- Si `total del servidor > totalEsperado` (diferencia ≥ S/ 0.01): **409** `PRECIO_CAMBIO`, **no se crea el pedido** ni se toca stock ni cupón; `data` trae la cotización del servidor (líneas con precio nuevo y anterior, subtotal, descuento, envío, total). La Tienda actualiza el carrito y pide confirmar.
- Si es igual o menor: se crea con el total del servidor (el cliente paga lo mismo o menos, y la confirmación muestra el monto real).
- Sin `totalEsperado` (Tienda vieja durante el despliegue): se recalcula y se crea. Nunca se usa el precio del navegador.
- Decisión D1 abajo.

### Precio congelado y snapshot por línea (ADR-0001 punto 5)
- En productos "empezar a pagar" = **crear el pedido**: el cobro manual y la pasarela usan `pedido.total` (`destinos.js:63`). Lo que cambie después en el catálogo no toca un pedido ya creado.
- Cada `pedido_detalles` guarda: `precio_unitario` (lo que pagó por unidad, como hoy), **`precio_regular`** (referencia/tachado) y **`precio_origen`** (`regular` | `oferta`; `campanas-descuento` agregará `campana` y la promoción aplicada), más nombre y variante **desde la BD** en el idioma base de la tienda (D6).
- El descuento del cupón sigue a nivel de pedido (`pedidos.descuento_monto` + `codigo_cupon`), ahora calculado por el servidor. El `descuento` por línea queda en 0 para compras (no se reparte el cupón por línea en esta pieza).

## Mapa de cambios

| Repo | Módulo / archivo | Tipo | Por qué |
|---|---|---|---|
| Backend | `modules/precios/precio-vigente.js` (+ test) | nuevo | La función única de precio (ADR-0001.1) |
| Backend | `modules/precios/cotizacion-compra.js` y `.service.js` (+ tests) | nuevo | Cotización pura + cargador con tienda, producto, variante |
| Backend | `modules/cupones/regla-cupon.js` (+ test); `cupones.service.js:99-151` delega; `cupones.schema.js:167-168,179-180` `porcentaje <= 100` | nuevo / cambia | Una regla de cupón para validar y para cobrar (C4); un 150 % hoy deja el total negativo |
| Backend | `modules/ordenes/crear-pedido.js` (+ test) ; `pedidos.service.js:128-318` delega | nuevo / cambia | El caso de uso sale del archivo de 892 líneas (antipatrones A6); usa la cotización; 409; cupón condicional |
| Backend | `modules/ordenes/pedidos.schema.js:4-14,84-85` | cambia | Quita los montos y nombres del navegador; `productoId` obligatorio; `totalEsperado` opcional |
| Backend | `modules/negocio/contrato.js:40` + los 6 `negocio/<rubro>/datos.js` | cambia | Capacidad nueva `carrito` (D4) |
| Backend | `modules/agente/precios.js:11-15` | cambia | `precioEfectivo` delega en `precioVigente` |
| Backend | `prisma/schema.prisma:804-820` (`pedido_detalles`) | cambia | `precioRegular`, `precioOrigen` |
| Backend | `docs/sql/precio_en_servidor.sql` y `_reversa.sql` | nuevo | Columnas del snapshot |
| Tienda | `features/checkout/services/checkout.service.ts:45-53,73-75` | cambia | Deja de mandar montos y nombres; manda `totalEsperado` |
| Tienda | `features/checkout/estado/pedido.store.ts:148-198,203-206` | cambia | Maneja el 409 (aviso, actualizar carrito, confirmar); WhatsApp con las líneas del pedido creado, no las del carrito |
| Tienda | `state/cart.state.ts` | cambia | `actualizarPrecios(lineas)` desde la cotización del servidor |
| Tienda | `negocio/productos/precio.ts` (nuevo) ← `product-page.component.ts:575-581`, `product-card.component.ts:236` | nuevo / cambia | Espejo de `precioVigente` en un solo lugar (exige oferta < base, como el servidor) |
| Admin | — | sin cambios | Los pedidos siguen mostrando `precioUnitario`. Mostrar el precio regular tachado queda para `campanas-descuento` |

## Contrato por rubro
- **Capacidad nueva `carrito`** en `CAPACIDADES` (`contrato.js:40`): `true` en productos, `false` en hotel, tours, eventos, locales y canchas. Es el mismo nombre que ya usa el perfil de la Tienda (`negocio/perfil-negocio.ts:27`, `carrito: true` solo en `productos/vitrina.ts:18`). El test de contrato (`negocio/__tests__/negocio.test.js:31`, vía `faltantesDelContrato` → `faltantesDeDatos`) falla si un rubro no la declara: cambio intencional.
- `crear-pedido` pregunta `datosDe(tienda.tipoNegocio).carrito`, no la identidad del rubro (`anti-identidad.test.js` no cambia).
- Regresión posible en otros rubros: ninguna en reservas (no usan este camino). `agente/precios.js` cambia de implementación, no de resultado: su test actual debe seguir verde.

## Patrones

| Patrón | Dónde se aplica | Por qué |
|---|---|---|
| **Función pura + cargador** (núcleo funcional) | `precios/precio-vigente.js`, `precios/cotizacion-compra.js` + `.service.js`, `cupones/regla-cupon.js` | Ya es como está hecho el envío (`envios/cotizacion.js` + `cotizacion.service.js`), el rastreo (`ordenes/rastreo.js`) y las campañas (`campanas/resolver.js`): la regla se prueba sin BD y es el único lugar donde entrará el descuento de campaña. **No está en el catálogo**: propuesta D5 |
| **Registry + contrato** / **Capacidades, no identidad** | `carrito` en `CAPACIDADES` y en cada `datos.js` | Una regla nueva que depende del rubro (solo vende con carrito quien tiene carrito); el test de contrato obliga a declararla en un rubro nuevo |
| **Repository → Service → Controller** | `crear-pedido.js` (caso de uso) llamado por la ruta existente | Sin endpoints nuevos en las piezas 1-3 |
| **Serializer** | La respuesta 409 expone solo la cotización (precios, nombres, totales), nunca costo (`precioCosto`) ni stock | Lo que sale de la API |
| **Fitness function** | Test que falla si `crear-pedido.js` o `pedidos.schema.js` vuelven a leer `precioUnitario`, `descuentoMonto` o `costoEnvio` del body | La regla "el navegador no fija montos" se rompería en silencio |
| Strategy por rubro | **No aplica** | El precio de compra es igual para el único rubro con carrito. Las reservas ya tienen su `cotizar` por vertical. Si una promoción llega a reservas, se decide en `campanas-descuento` |
| Parámetro de plataforma | **No aplica** | No hay valores que cambien sin deploy (la tolerancia del 409 es de un céntimo, fija) |
| Idempotencia | **No en esta spec** | El 409 no crea nada, así que reintentar tras el aviso no duplica. El doble clic sin `idempotencyKey` en compras queda como hallazgo H2 |

## Base de datos

- `pedido_detalles`: dos columnas nullable. Tabla existente con RLS ya activa; no hay tabla nueva. Sin índices (no se filtra por ellas).
- Datos existentes: los pedidos anteriores quedan con `NULL` = "pedido anterior al cambio, sin dato de referencia". No se rellena: inventar el precio regular de un pedido viejo sería falso.
- Cupones con porcentaje mayor a 100 (si existen): la regla los limita al subtotal; se listan con la consulta de abajo para que el dueño los corrija.

`docs/sql/precio_en_servidor.sql` (idempotente):
```sql
-- precio-en-servidor (ADR-0001 punto 5): snapshot del precio por línea del pedido.
ALTER TABLE public.pedido_detalles
  ADD COLUMN IF NOT EXISTS precio_regular numeric(10,2),
  ADD COLUMN IF NOT EXISTS precio_origen  varchar(20);

COMMENT ON COLUMN public.pedido_detalles.precio_regular IS
  'Precio regular (referencia/tachado) al crear el pedido. NULL = pedido anterior a precio-en-servidor.';
COMMENT ON COLUMN public.pedido_detalles.precio_origen IS
  'De dónde salió precio_unitario: regular | oferta (campanas-descuento agrega campana). NULL = pedido anterior.';

-- Verificación (solo lectura): cupones de porcentaje mayores a 100 %.
SELECT t.slug, c.codigo, c.valor
FROM public.cupones c JOIN public.tiendas t ON t.id = c.tienda_id
WHERE c.tipo = 'porcentaje' AND c.valor > 100;
```

`docs/sql/precio_en_servidor_reversa.sql`:
```sql
ALTER TABLE public.pedido_detalles
  DROP COLUMN IF EXISTS precio_origen,
  DROP COLUMN IF EXISTS precio_regular;
```

## Configuración

| Llave | Repo / plataforma | Nueva / cambia / se quita | Valor de ejemplo / cómo generarla |
|---|---|---|---|
| — | — | — | Ninguna llave ni parámetro nuevo, cambiado ni quitado |

## Alternativas consideradas

| Opción | A favor | En contra | Elegida |
|---|---|---|---|
| Recalcular siempre e **ignorar** todo monto del navegador, sin aviso | Lo más simple | El cliente que vio S/ 80 recibe un pedido de S/ 100 sin enterarse; reclamo seguro (Indecopi) | No |
| Comparar y **rechazar con 409 siempre** que el total difiera | Transparente en ambos sentidos | Frena una venta cuando el precio **bajó** | No (D1) |
| **Recalcular; 409 solo si el total real es mayor que el que vio** | Seguro, el cliente nunca paga más de lo que aceptó, sin fricción si baja | Un campo más (`totalEsperado`) | **Sí** |
| Validar el `precioUnitario` del navegador contra la BD | Cambio mínimo | Igual hay que calcular el precio en el servidor y quedan dos caminos (ADR-0001, descartada) | No |
| Leer los precios en el mismo `SELECT … FOR UPDATE` de `inventario.service.js` | Un viaje menos a la BD | Mezcla precio con stock; `campanas-descuento` tendría que entrar al inventario | No: cargador propio en `modules/precios/` |
| Endpoint `POST /store/pedidos/cotizar` desde ya, y el checkout muestra siempre la cotización del servidor | El carrito nunca muestra un precio viejo; base para campañas | Más trabajo ahora; con el 409 el bug ya queda cerrado | **Pieza 4**: no hace falta para cerrar el bug; es requisito de `campanas-descuento` R8.1 |
| Usar `!recibeReservas` como "vende con carrito" | Sin tocar el contrato | Acopla dos capacidades distintas; una tienda que reserve **y** venda quedaría mal | No (D4) |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Desplegar el backend **antes** del SQL: Prisma inserta columnas que no existen y **ningún pedido se crea** | Media | Orden fijo: SQL primero (columnas nullable, inofensivas para el código actual). Lo dice `tasks.md` y lo repetirá el `deployer` |
| Carritos guardados con un precio viejo: tras el cambio el cliente ve un total que ya no vale | Alta (los carritos viven en `localStorage`) | Con la Tienda nueva, 409 y aviso; con la vieja, la pantalla de confirmación ya muestra `pedido.total` del servidor (`pedido.store.ts:62-64`). La pieza 4 lo elimina del todo |
| Datos raros en tiendas reales: oferta ≥ precio base, variantes con precio 0, cupones > 100 % | Media | La regla los trata (oferta ignorada, precio de la variante 0 = usa el del producto, cupón limitado al subtotal); consulta de verificación en el SQL. Precio vigente 0 rechaza la línea con mensaje claro |
| Choque con antipatrones pieza 4 (A5.3, un componente por paso), que reescribe el mismo checkout de la Tienda y tiene cambios sin commit | Alta | La pieza 3 de aquí va **después** de cerrar A5.3, o toca solo `pedido.store.ts`, `checkout.service.ts` y `cart.state.ts` (no los componentes de paso). El e2e `FrontendStore/e2e/checkout/` debe seguir en verde |

## Orden de despliegue y reversa
1. **Supabase**: `docs/sql/precio_en_servidor.sql`.
2. **Backend** (Railway) con `npx prisma generate` en el build. Desde aquí el bug está cerrado, aun con la Tienda vieja.
3. **Tienda** (Vercel): aviso de precio cambiado y WhatsApp con las líneas del pedido.

Reversa: revertir el commit del backend (el código anterior ignora las columnas nuevas). Las columnas pueden quedarse; si se quieren quitar, `precio_en_servidor_reversa.sql` **después** de revertir el backend. Revertir la Tienda sola no rompe nada (deja de mandar `totalEsperado`).

## Decisiones para Diego
- **D1. Total distinto.** Recomendado: 409 solo si el total real **sube**; si baja, se crea con el menor. Alternativa: 409 en ambos sentidos. Coherente con ADR-0001 ("el pago avisa si el total cambió"): si baja, el aviso es la confirmación con el monto menor.
- **D2. Cupón sobre un producto con `precioOferta` (posible desvío del ADR-0001 punto 4).** El ADR dice que los cupones se combinan "solo si la tienda lo permite"; `campanas-descuento` R7 concreta ese permiso **por promoción de campaña** ("Permitir cupones sobre productos en promoción", apagado por defecto) y no dice nada de la oferta manual del producto. Recomendado: **mantener lo que pasa hoy** (el cupón se aplica sobre el subtotal ya con oferta), sin opción nueva; `precioVigente` ya devuelve `origen` por si luego quieres extender el permiso a la oferta manual. Si prefieres que la oferta manual tampoco se combine, es una regla para `campanas-descuento` R7, no para este arreglo: cambiarla aquí quitaría descuentos que las tiendas ya dan hoy.
- **D3. Variante con precio propio y producto en oferta.** Hoy la Tienda cobra el precio de la variante y no aplica la oferta. Recomendado: mantenerlo (la oferta es del producto, `productos.md`). Si no, una variante cara se vendería al precio de oferta del producto.
- **D4. Capacidad nueva `carrito` en el contrato del backend** para cerrar C10. Recomendado sí (alternativa en la tabla).
- **D5. Agregar al catálogo de patrones** "Función pura + cargador": regla sin BD en `<x>.js` y lectura en `<x>.service.js` (envío, rastreo, campañas, ahora precios). Es lo que ya hace el código; formalizarlo evita que `campanas-descuento` meta el cálculo en un servicio con Prisma.
- **D6. Nombre del producto en el pedido.** Hoy se guarda el que ve el cliente (puede ir traducido al inglés). Recomendado: el nombre de la BD en el idioma base de la tienda (lo que lee el dueño, el comprobante y un reclamo).
- **Escalonado respecto del ADR** (no es un desvío; queda para `campanas-descuento`): (a) el listado y la ficha de la Tienda siguen calculando el precio con un espejo de la regla (`negocio/productos/precio.ts`) hasta que el API entregue el precio vigente ya calculado, cuando exista la primera promoción que el front no pueda deducir; (b) el aviso "el precio regular subió en los 30 días previos" (ADR punto 6) necesita historial de precios, que hoy no existe: es la C2 de `campanas-descuento`. **Ojo con el reloj:** el aviso solo sirve con 30 días de datos, y R12.1 de esa spec bloquea desde C3, no C2. Recomiendo que C2 se planifique y construya apenas termine la pieza 2 de aquí, sin esperar el resto de `campanas-descuento`. No lo meto en este plan para no mezclar un arreglo de seguridad con una funcionalidad.
- **Lo que `campanas-descuento` agrega encima** (para que no se haga dos veces): R8.1 (recalcular en cada cambio del carrito) es la **pieza 4** de aquí; R8.3 (de dónde vino el descuento: campaña con id y nombre) suma columnas al mismo snapshot de `pedido_detalles` (`precio_origen = 'campana'` + la campaña); R5.6 y R12.2 enchufan la promoción en `precioVigente(…, contexto.promociones)`.

## Hallazgos aparte (no planificados)
- **H1. Reservas: no se encontró el mismo bug.** `reservas.service.js:238,307` calculan con `vertical.cotizar` en el servidor; la cotización de locales se respeta con un token del servidor (`reservas/locales/locales.service.js:393-394`, `cotizacion.token.js`); `nuevoTotal` (`reservas.schema.js:222`) es del admin.
- **H2. Doble envío del pedido de compra.** No usa `idempotencyKey` (la columna y el índice único ya existen, `schema.prisma:722,752`); solo lo evita el botón deshabilitado (`pedido.store.ts:145-146`). Un reintento de red crea dos pedidos y descuenta stock dos veces.
- **H3. La regla de oferta está copiada en SQL** para el filtro de presupuesto del asesor (`agente/tools/buscar-productos.js:280-281`). Con campañas se desalinea; `campanas-descuento` debe resolverlo.
- **H4. Límite de cupón por cliente** se cuenta por WhatsApp (`pedidos.service.js:215-221`): cambiando de número se evade. Es el diseño actual, no un bug de esta spec.

## Para Diego
**Qué se construye.** Hoy la tienda le dice al servidor "este producto cuesta S/ 1" y el servidor le cree. Después, el servidor ignora los precios y descuentos que manda el navegador: los calcula con lo que tú cargaste (precio, oferta, cupón con sus reglas, envío) y guarda en cada línea del pedido el precio cobrado, el precio regular y si fue oferta. Si el cliente vio un total menor al real, antes de crear el pedido se le muestra "el precio cambió" y confirma.

**Piezas: 3 (+1 opcional).**
1. Backend, nada visible: la calculadora de precios y la del cupón, con sus pruebas.
2. Backend: el pedido se calcula en el servidor. Ves que un pedido hecho "a mano" con precio falso sale con el precio real, y que un cupón bajo el mínimo se rechaza. **Desde aquí el agujero está cerrado.**
3. Tienda: si un precio cambió (por ejemplo, terminó una oferta con el producto en el carrito), aparece el aviso con el total nuevo y el botón para confirmar; el mensaje de WhatsApp sale con los precios reales.
4. (Opcional, antes de las campañas con descuento) El carrito y el checkout muestran siempre el precio que calcula el servidor.

**3 riesgos.** (1) Si el backend se publica antes del SQL, no se crea ningún pedido: el SQL va primero. (2) Clientes con carritos viejos verán un aviso de precio la primera vez. (3) El checkout de la Tienda se está reordenando en antipatrones; la pieza 3 va después de ese paso.

**Al desplegar.** Correr `docs/sql/precio_en_servidor.sql` en Supabase **antes** del backend y revisar la consulta de cupones de más de 100 %. No hay llaves nuevas.

**Te toca ahora.** Aprobar el plan y responder D1 a D6 (las recomendaciones van marcadas).
