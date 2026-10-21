# Cambios: Campañas en tres pasos y promoción de precios

> Bitácora para humanos. Una entrada por pieza, la más reciente arriba.

## 2026-10-20 — Pieza C4: El paso 3 "Promoción" en el Admin (Admin + 2 cambios chicos del Backend, visible) — se publica al final
**En una frase:** en una tienda de productos, al abrir una campaña aparece **3. Promoción**: el dueño elige a qué se aplica (toda la tienda, categorías con sus subcategorías, o productos elegidos en lote), escribe el porcentaje, ve al instante cuántos productos entran y un ejemplo ("S/ 100 pasa a S/ 80"), decide si se combina con cupones y envío gratis (casillas apagadas), agrega si quiere un cupón de la campaña y, al pulsar **Activar campaña** (o **Guardar cambios**, o el interruptor de la fila), confirma en un solo diálogo con las fechas y los avisos de Indecopi, costo y ofertas propias. Los precios cambian solos en la ventana de la campaña. En hotel y los demás rubros con reserva el paso 3 no existe.

**Dónde:**
| Repo | Archivo | Qué hace |
|---|---|---|
| Admin | `negocio/perfil-negocio.ts`, los 6 `negocio/<rubro>/perfil.ts`, `perfiles.spec.ts` | Capacidad `carrito` (true solo en productos), mismo nombre que backend y Tienda. **`perfiles.spec.ts` cambia a propósito** (T4.1): un caso nuevo fija que solo productos tiene carrito |
| Admin | `pages/campanas/promocion/estado-promocion.ts` (+ spec) | Reglas puras: porcentaje entero 1–90, resumen ("−20 % en Zapatillas"), estado del paso 3, "cambia lo que se cobra" (misma firma que el servidor), cuándo el botón abre la confirmación, chips de la fila, bloqueo por alcance sin productos |
| Admin | `pages/campanas/promocion/paso-promocion.component.ts` (+ spec) | El paso 3 (A5): alcance en tarjetas, árbol de categorías (las hijas entran con el padre, marcadas y bloqueadas), porcentaje con error inline, conteo y ejemplo en vivo (`aria-live`), casillas de combinación, cupón de la campaña con el aviso R7.5 y "Permitirlo", "Así lo verá tu cliente", estados confirmada / por confirmar / terminó (solo lectura) |
| Admin | `pages/campanas/promocion/selector-productos.component.ts` | Elegir productos en lote (A5b): buscar, filtrar por categoría, "Seleccionar los N resultados" con los ids del API, quitar en lote, "Listo · N productos"; Cancelar/X/Esc conservan la selección |
| Admin | `pages/campanas/promocion/confirmar-promocion.component.ts` (+ spec), `textos-legales.ts` | Diálogo único (A6) con `<dialog>` nativo (foco atrapado, Esc = no confirmar, el foco vuelve al botón): qué, desde/hasta con día y hora, ejemplo, combinación, "los precios no se modifican", avisos solo si corresponden, casilla desde 50 %, "Sí, aplicar −N %". Todas las frases legales en `textos-legales.ts` (Q8) |
| Admin | `pages/campanas/promocion/promocion-abierta.ts`, `pages/campanas/guardado-campanas.ts` | Estado de la promoción de la campaña abierta (lo guardado y el borrador) y el guardado por campaña (`PUT /admin/tiendas/:id/campanas/:campanaId`) |
| Admin | `pages/campanas/campanas.component.ts` / `.html`, `pasos/campana-pasos.component.ts`, `pasos/paso-aspecto.component.ts`, `pasos/estado-pasos.ts`, `pasos/fila-campana.ts` | El panel guarda cada campaña con su PUT (deja el PUT de diseño salvo al eliminar una propia); el CTA, "Revisar y confirmar" y el interruptor abren la confirmación; chips de promoción en la fila; "Con su promoción…" en el resumen de hoy; aviso "No se aplicó la promoción. La campaña sigue como estaba." al cerrar el diálogo. `campanas.component.ts` queda en 399 líneas |
| Admin | `pages/diseno/campana-edicion.ts` (+ spec), `campana-panel.component.ts`, `diseno.component.*` | Avisos R3.2 ("promete un descuento pero esta campaña no tiene promoción", con "Ir al paso 3") y R3.3 ("dice 30 % pero la promoción es de 20 %") en el paso 2 y en Diseño modo campaña; sin carrito, el de siempre (R3.4) |
| Admin | `pages/cupones/cupon-list/*`, `models/cupon.model.ts` | Chip "De la campaña {nombre}" y "Editar en la campaña →" (abre la campaña en el paso 3); sin editar ni eliminar ahí |
| Admin | `pages/productos/producto-detail/*`, `services/productos.service.ts` | Aviso ámbar R10.3 al subir el precio con una promoción programada; error inline, "Guardar" deshabilitado e "Ir a la campaña →" con una en curso (R10.5); el 409 del servidor se muestra con su mensaje |
| Admin | `services/campanas.service.ts`, `models/campana.model.ts` | `guardarCampana`, `obtenerPromocion`, `revision`, `idsDeProductos`; tipos de la promoción |
| Backend | `modules/campanas/promocion.js` (+ test) | El calendario trae también `porcentaje` de la promoción (para comparar con el texto de la portada, R3.3) |
| Backend | `modules/campanas/cupon-campana.service.js`, `promocion.repository.js`, `modules/cupones/cupones.service.js` (+ `cupon-campana.test.js`) | `GET /admin/cupones` dice de qué campaña es cada cupón de campaña: `campana: { id, presetId, nombre }` o null |

**Decisiones que tomé y por qué:**
- **Cuándo abre la confirmación el botón (decisión B):** "Activar campaña" con una promoción que no está confirmada tal cual; "Guardar cambios" si cambió lo que se cobra o las fechas de una confirmada; "Guardar sin activar" nunca (queda sin confirmar, solo visual). Si el servidor igual responde `CONFIRMACION_REQUERIDA`, se abre el mismo diálogo; con `PROMOCION_CAMBIO` se vuelve a leer la promoción y el dueño confirma de nuevo.
- **Una promoción guardada sin confirmar en una campaña activa** (o de otra edición, R9.6) muestra "Revisar y confirmar" dentro del paso 3: es la forma de confirmarla sin inventar un segundo botón principal.
- **El interruptor** con promoción sin confirmar abre la fila y el diálogo; cerrarlo no toca nada (la campaña nunca se encendió en pantalla). Con promoción confirmada o sin promoción sigue siendo inmediato; al apagar una con promoción el toast dice "Los precios vuelven al regular en unos minutos". El PUT por campaña reemplaza también la promoción, así que el interruptor manda la promoción guardada tal cual (la lee antes).
- **Si no se pudo leer la promoción de la campaña abierta, no se deja guardar**: mandar "sin promoción" la borraría.
- **Textos (E9):** el Admin no tiene diccionario de traducciones (todo en español, como el resto de Campañas). Los textos de la promoción son comunes, en las plantillas y en `estado-promocion.ts`; las frases legales, en `textos-legales.ts`. Nada en el perfil del rubro.
- **Desvío T4.8 (Backend):** la lista de cupones no traía de qué campaña es cada cupón (`campanaPromocionId` sin nombre). Agregué `campana` en `listCupones` con una consulta extra solo si hay cupones de campaña.
- **Desvío menor (Backend):** `porcentaje` en la promoción del calendario, para el aviso R3.3 en Diseño sin otra llamada.
- **Campañas abre por `campanaId` además de por la clave de la fila**, para llegar desde un producto ("Ir a la campaña →") y desde Cupones al paso 3.
- `campanas.component.ts` crecía a 495 líneas: el guardado pasó a `guardado-campanas.ts`, el estado de la promoción a `promocion-abierta.ts` y el resumen de hoy y el rango a `fila-campana.ts` (399 líneas).

**Lo que quedó pendiente / deuda:**
- El selector de productos muestra los inactivos y sin stock con una marca ("Inactivo", "Sin stock") en vez de ocultarlos: el listado del Admin y `GET /admin/productos/ids` no filtran por eso y "Seleccionar los N resultados" debe coincidir con lo que se ve. Igual no entran en el conteo (R4.5). Tampoco muestra la foto, y el filtro por categoría no incluye sus subcategorías.
- El árbol de categorías no muestra cuántos productos tiene cada una (no hay ese conteo en el API); el conteo total sí sale en vivo.
- "Ver los N productos" del aviso de 30 días: el diálogo nombra hasta 5 y dice "y N más"; no hay lista completa.
- El formulario de cupones (`/cupones/edit/:id`) sigue abriendo un cupón de campaña si se escribe la dirección a mano; la lista ya no lleva ahí.
- La guarda R10.5 del formulario mira el precio del producto; las variantes con precio propio las sigue cuidando el 409 del servidor.
- Verificación de tasks.md sin hacer (sin navegador por pedido de Diego). Revisión legal de `textos-legales.ts` (Admin) y `condiciones.ts` (Tienda) antes de publicar (Q8).

**Afecta al despliegue:**
- Sin SQL nuevo ni llaves. Admin + Backend (los dos cambios chicos del backend son compatibles: campos nuevos en respuestas).
- **Va al final (E7):** después de C5, C6 y C7 en producción y de la revisión legal. Orden: Backend (con o después de C7) → Admin.
- Reversa: revertir el commit del Admin (el paso 3 desaparece; las promociones ya confirmadas siguen aplicando hasta apagar la campaña). El backend puede quedarse.

**Pruebas:** Admin `npm test` (anti-identidad + Karma): 265 OK (nuevos: `promocion/estado-promocion.spec.ts` con CA-4.1, CA-7.1, CA-2.2, CA-2.4, CA-2.5 y chips; `paso-promocion.component.spec.ts` con CA-7.1, CA-7.7, CA-4.1 y solo lectura; `confirmar-promocion.component.spec.ts` con CA-9.1, CA-9.2, casilla desde 50 % y avisos; `campana-edicion.spec.ts` con CA-3.2 a CA-3.5; un caso más en `campana-pasos.component.spec.ts` y en `perfiles.spec.ts`); `tsc --noEmit` (app y spec) y `ng build` OK (el aviso de presupuesto inicial, 788 kB frente a 700 kB, ya existía). Backend `npm test`: 141 suites, 2188 tests OK. Sin navegador.

**Commits:** sin commit todavía.

---

## 2026-10-20 — Pieza C7: Cupones y envío gratis con la promoción (Backend + Tienda, visible)
**En una frase:** por defecto una promoción de campaña ya no se combina con cupones ni con envío gratis por monto: un cupón del 10 % en un carrito con Zapatillas en Black Friday y una Camisa se aplica solo a la camisa ("−S/ 5,00, solo sobre Camisa"), en un carrito con solo productos en promoción se rechaza ("Los productos en promoción no admiten cupones."), y un pedido con un producto en promoción paga el envío aunque llegue al mínimo ("El envío gratis no aplica a pedidos con productos en promoción."); con los permisos de la campaña encendidos todo se combina como antes. El cupón de una campaña solo vale mientras su promoción aplica.

**Dónde:**
| Repo | Archivo | Qué hace |
|---|---|---|
| Backend | `modules/precios/cotizacion-compra.js` | `evaluarCupon` (sin cambios) recibe solo el subtotal de las líneas que admiten cupón (sin campaña o de una campaña con `permitirCupones`); sin ninguna se rechaza; `envioGratisMinimo: null` si una línea es de una campaña sin `permitirEnvioGratis`; `avisos: { cuponSoloSinPromocion: { productos } o null, envioGratisNoAplica }` |
| Backend | `modules/campanas/promocion.js` | `cuponDeCampanaVigente(cupon, promocionesVigentes)` (pura); las promociones vigentes traen `promocionId` para reconocer el cupón |
| Backend | `modules/campanas/cupon-campana.service.js` (nuevo), `promocion.repository.js` (`campanaDePromocion`) | Nombre de la campaña del cupón para "Este cupón es de la campaña {nombre} y ya no está vigente" |
| Backend | `modules/cupones/cupones.service.js` (`validarCupon`), `regla-cupon.js`, `modules/ordenes/crear-pedido.js` | El cupón de campaña fuera de su ventana se rechaza al validarlo, al cotizar y al crear el pedido; `avisos` sale en la cotización y en el 409 |
| Tienda | `features/promocion/avisos.ts` (nuevo) | Las frases de R7.6 en un solo lugar (carrito y pago), "Ya incluye −S/ 20,00 de {campaña}", y la tarifa "gratis por mínimo" que vuelve a su costo de zona |
| Tienda | `features/checkout/estado/cotizacion.store.ts`, `envio.store.ts`, `components/bloque-cupon`, `components/desglose-total` | `avisos` de la cotización; las tarifas de envío respetan el envío gratis quitado; "−S/ 5,00, solo sobre Camisa"; "Ya incluye…" y el aviso de envío en el desglose |
| Tienda | `state/cotizacion-carrito.state.ts`, `features/cart/cart-page/cart-page.component.ts` | El carrito guarda los `avisos` y muestra "Ya incluye…" y el aviso de envío gratis con el mismo texto que el pago |

También: `models/pedido.model.ts` (`AvisosCotizacion`), `lista` exportada de `features/promocion/condiciones.ts`; claves regeneradas (backend `claves-servidor.json`, Tienda y su copia en el backend) y 6 textos en `plataforma/en.json`.

**Decisiones que tomé y por qué:**
- **Orden del rechazo del cupón:** primero si el cupón de campaña sigue vigente, luego si hay líneas que lo admiten, y recién `evaluarCupon` con el subtotal de esas líneas (ahí se miden su mínimo y su tope, R7.3). Un cupón inactivo en un carrito solo con promoción dice "no admiten cupones" en vez de "inactivo": las dos razones son ciertas y la de la promoción es la que el cliente puede resolver.
- **El nombre del cupón de campaña se lee aparte** (`cupon-campana.service.js`, dos lecturas solo para cupones de campaña): la cotización recibe `cupon.campanaNombre`, porque las promociones vigentes no traen el nombre de una que ya terminó. Va en un módulo propio para que el checkout no cargue todo `promocion.service.js` (rompía el mock de `crear-pedido.test.js`).
- **`validarCupon` (GET del checkout) solo revisa la vigencia del cupón de campaña:** recibe el subtotal, no las líneas. Que el cupón valga solo sobre lo que no está en promoción lo decide la cotización del checkout, que lo ajusta o lo rechaza con el mismo mensaje (CA-7.8).
- **`envioGratisNoAplica`:** sin método elegido (el carrito) se marca por las líneas y la Tienda lo dice solo si la tienda tiene `envioGratisMinimo`; con método, solo si la tienda tiene mínimo y el método no es recojo (sigue gratis, R7.3).
- **Desvío necesario, solo en la Tienda: las tarifas del paso de envío** (`/store/envios/cotizar`) no conocen las líneas y habrían mostrado "Gratis" con un total que cobra el envío. Con `envioGratisNoAplica` de la cotización, la tarifa que salía gratis por el mínimo vuelve a su costo de zona (`costoReferencial`), como cobra el servidor; el recojo no cambia. No toqué el endpoint de envíos.
- **"Ya incluye −S/ X de {campaña}" se arma con las líneas del carrito** (`regular`, `precio`, `campana` de C6), una línea por campaña, en el carrito y en el desglose del pago. No se resta de nuevo.
- **El carrito no tiene campo de cupón** (está solo en el pago), así que el mensaje de cupón rechazado aparece en el pago, en sus dos lugares (paso 1 en móvil, resumen en desktop), con el texto del servidor. El aviso de envío sí aparece en carrito y pago con la misma función.
- Las condiciones de C5 ya decían si se combina; no cambiaron.

**Lo que quedó pendiente / deuda:**
- Al aplicar un cupón en un carrito solo con promoción, el bloque lo muestra aplicado un instante (lo aceptó `validarCupon`) hasta que llega la cotización y lo quita con el mensaje. Se arreglaría validando el cupón con la cotización en vez del GET; queda para otra pieza.
- El mini carrito no muestra "Ya incluye…" ni el aviso de envío (no tiene envío ni cupón).
- El aviso del paso 3 del Admin "Este cupón solo valdrá en productos sin promoción" (R7.5, CA-7.7) es de C4.
- Verificación de tasks.md sin hacer (sin navegador por pedido de Diego).

**Afecta al despliegue:**
- Sin SQL nuevo (usa `cupones.campana_promocion_id` de C3a) y sin llaves.
- Orden: Backend → Tienda, después de C6 en producción. La Tienda nueva funciona con el backend anterior (sin `avisos`: no dice nada y las tarifas no cambian); el backend nuevo con la Tienda anterior cobra bien, pero esa Tienda puede mostrar "Gratis" en la tarifa de envío con un total que lo cobra (el 409 de total lo corrige antes de pagar).
- Traducciones: `claves-servidor.json`, `claves-tienda.json` y `plataforma/en.json` del backend (se sincronizan al arrancar).
- Reversa: revertir el backend → cupones y envío gratis como en P2 (se combinan); la Tienda puede quedarse.

**Pruebas:** Backend `npm test`: 140 suites, 2185 tests OK (nuevos: 11 casos en `precios/__tests__/cotizacion-compra.test.js` con CA-7.2 a CA-7.6, dos campañas con permisos distintos, recojo, mínimo sobre las líneas elegibles y CA-4.7; 3 en `campanas/__tests__/promocion.test.js` con `cuponDeCampanaVigente` y CYBER10 el 1 dic; `cupones/__tests__/validar-cupon.test.js` nuevo, 3 casos). Tienda `npm test` completo (claves, node:test, textos, anti-identidad, anti-ramas, Karma): 374 OK (nuevos: `features/promocion/avisos.spec.ts` y 2 casos en `cupon.store.spec.ts` con CA-7.8 y CA-7.4); `npx tsc --noEmit` (app y spec) y `ng build` OK. Admin no se tocó. Sin navegador.

**Commits:** sin commit todavía.

---

## 2026-10-20 — Pieza C6: Carrito, pago y pedido con la promoción (SQL + Backend + Tienda + Admin, visible)
**En una frase:** el carrito y el mini carrito se recalculan con el servidor en cada cambio (S/ 80 con Black Friday, el regular tachado y "−20 %" por línea) y avisan "El precio de Zapatillas cambió: la promoción terminó. Antes S/ 80, ahora S/ 100"; al entrar al pago el precio queda asegurado 15 minutos ("Precio asegurado mientras pagas (15 min)"), así que si la campaña termina o se apaga mientras el cliente paga, el pedido sale al precio que vio; cada línea del pedido guarda de qué campaña vino el descuento y el dueño (Admin) y el cliente (seguimiento) lo ven.

**Dónde:**
| Repo | Archivo | Qué hace |
|---|---|---|
| Backend | `docs/sql/campanas_descuento_pedidos.sql` (+ `_reversa`), `prisma/schema.prisma` | `campana_id`, `campana_nombre`, `promocion_porcentaje` en `pedido_detalles` (foto, sin FK), tal cual `impacto.md` |
| Backend | `modules/precios/precio-congelado.token.js` (nuevo) | `firmar({ tiendaId, lineas })` → `{ token, vence }` (15 min, `aud: "precio-congelado"`) y `verificar(token, tiendaId)` → líneas o null (inválido, vencido o de otra tienda: se ignora) |
| Backend | `modules/precios/cotizacion-compra.js` | Opción `congelado`: cada línea cobra el menor entre lo asegurado y lo de ahora (R8.6); líneas con `campana`; `precios` interno (lo que se firma, no sale en la respuesta) |
| Backend | `modules/ordenes/crear-pedido.js`, `pedidos.schema.js` | `tokenPrecio` al cotizar y crear, `congelar` al cotizar (`precioAsegurado` en la respuesta); snapshot de la campaña por línea |
| Backend | `modules/ordenes/linea-pedido.js` (nuevo, puro), `pedidos.service.js` (`findById`), `rastreo.js` | Por línea: `descuentoPromocion` derivado y `origenDescuento` (campana / oferta / ninguno; null en pedidos viejos), para el dueño y el seguimiento |
| Backend | `config/index.js`, `.env.example` | Llave `PRECIOS_TOKEN_SECRET` (`config.precios.tokenSecret`); en producción el backend no arranca sin ella |
| Tienda | `state/cotizacion-carrito.state.ts` (nuevo), `state/cart.state.ts`, `models/cart.model.ts` | El carrito cotiza en cada cambio (300 ms, solo mientras el carrito o el mini carrito están en pantalla); cada línea guarda `regular`, `origen`, `campana` y deja su aviso si el precio cambió |
| Tienda | `shared/components/precio-carrito/` (nuevo), `features/cart/cart-page`, `shared/components/mini-cart` | Trío de precio por línea con el componente de C5, aviso `role="status"`, "No pudimos confirmar el precio. Reintentar", importes atenuados al recalcular |
| Tienda | `features/checkout/estado/cotizacion.store.ts`, `pedido.store.ts`, `checkout.store.ts`, `services/checkout.service.ts`, `pasos/paso-confirmar` | Precio asegurado en los pasos 2 y 3, `tokenPrecio` al crear, recotización al vencer y aviso del total (sube ámbar `alert`, baja azul `status`); el botón muestra su importe |
| Tienda | `features/order-tracking/`, `negocio/productos/precio.ts` | Seguimiento: regular tachado y "Black Friday · −S/ 20" por línea; `precioParaCarrito`, `precioDeLinea`, `precioDeDetalle` |
| Admin | `pages/pedidos/pedido-detail/`, `models/pedido.model.ts` | Ficha del pedido: "Regular S/ 100 · descuento −S/ 20 · Black Friday (−20 %)", "Oferta del producto" o "Descuento: Ninguno" |

También: Tienda `product-card` y `product-page` meten al carrito el precio con su origen (`precioParaCarrito`); `scripts/claves-tienda.mjs` (sección "Cambios de precio" en la pantalla Carrito); claves regeneradas (Tienda y copia en el backend) + 9 textos en `plataforma/en.json`; e2e `e2e/checkout/` con un caso de promoción que termina mientras se paga.

**Decisiones que tomé y por qué:**
- **El token lleva los precios**, por línea (`productoId`, `varianteId`, unitario y regular en céntimos, origen y la campaña con sus permisos de cupón y envío, que usará C7). Sin tabla, como pide E5.
- **Pedir un precio asegurado nuevo (`congelar`) ignora el anterior** y asegura el precio de ahora. Si no, un cliente podría renovar el de Black Friday cada 14 minutos para siempre.
- **1 minuto de gracia al verificar** (`clockTolerance`): quien confirma justo a los 15 minutos (CA-8.3, 21:50 → 22:05) no pierde el precio por el viaje del pedido. A las 22:07 ya no vale.
- **Sin la llave (desarrollo local) no se asegura nada** en vez de fallar: se cobra el precio del momento, como antes de C6. En producción el backend no arranca sin `PRECIOS_TOKEN_SECRET` (impacto, "Configuración").
- **Se asegura en los pasos 2 y 3** (pago y confirmación); al volver al 1 se cotiza sin asegurar. La línea "Precio asegurado mientras pagas (15 min)" va bajo "Confirmar pedido" (paso 3), el botón que paga; tasks.md nombraba `paso-pago/`.
- **Decisión H, como pidió Diego: el botón conserva su nombre ("Confirmar pedido") y muestra su importe**, en vez del "Pagar S/ X" de tasks.md. En el celular el importe ya está junto al botón, así que dentro del botón va solo en desktop (sin dato duplicado).
- **El aviso del total pasó a `CotizacionCheckout.cambio`** (`pedido.precioCambio` lo sigue exponiendo): lo producen el 409 y el vencimiento del precio asegurado. "Buenas noticias: el total bajó" no nombra la campaña (el aviso por línea del carrito sí dice si terminó o empezó).
- **El carrito avisa también un cambio de precio que no es de promoción** ("El precio de X cambió. Antes…, ahora…"), con el mismo componente.
- **El ahorro se lee una sola vez:** cada línea del carrito muestra el trío de C5 (vigente, tachado y "−N %"); en el seguimiento, vigente y tachado más el monto ahorrado (sin repetir el porcentaje). El "Ya incluye −S/ 20 de {campaña}" del resumen es de C7.
- **El seguimiento no dice "Ninguno"** en una línea sin descuento (el Admin sí, para soporte): para el cliente sería ruido.
- **"Confirmar pedido" ahora se traduce** (`| t`): al agregar el importe al botón, el chequeo de textos lo detectó como texto fijo.
- `pedidos.store.routes.js` no cambió: la ruta ya valida con `cotizarPedidoSchema`.

**Lo que quedó pendiente / deuda:**
- e2e `e2e/checkout/` escrito (caso "la promoción termina mientras paga") pero **no corrido**: sin navegador por pedido de Diego.
- Verificación de tasks.md (S/ 80 en carrito, mini carrito y pago; campaña apagada en el pago → S/ 80; Admin y seguimiento con regular, cobrado, descuento y "Black Friday") sin hacer: requiere el SQL y la llave.
- Cupones y envío gratis con promoción siguen combinándose como en P2: es C7.

**Afecta al despliegue:**
- **SQL** `docs/sql/campanas_descuento_pedidos.sql` en Supabase **antes** del backend (aditivo e idempotente; reversa `campanas_descuento_pedidos_reversa.sql`, después de revertir el backend). Luego `npx prisma generate`.
- **Llave nueva (secreta)** `PRECIOS_TOKEN_SECRET` en Railway, **antes** del backend: `openssl rand -hex 32`. Obligatoria en producción (sin ella el backend no arranca).
- Orden: SQL → llave → Backend → Tienda → Admin. Depende de P4 (`/store/pedidos/cotizar`), C3a y C5 en producción. La Tienda nueva funciona con el backend anterior (sin `precioAsegurado` ni `campana`); el backend nuevo con la Tienda anterior (sin token: precio del momento).
- Traducciones: `claves-tienda.json`, `pantallas-tienda.json` y `plataforma/en.json` del backend (se sincronizan al arrancar).
- Reversa: revertir Backend, Tienda y Admin; las columnas pueden quedarse.

**Pruebas:** Backend `npm test`: 139 suites, 2168 tests OK (nuevos: `precios/__tests__/precio-congelado.token.test.js`, `ordenes/__tests__/linea-pedido.test.js`, 8 casos en `crear-pedido.test.js` con CA-8.1, CA-8.3 22:05 → 80 y 22:30 → 409, R8.6, otra tienda / alterado, precio que baja, `congelar` que no renueva; 4 en `cotizacion-compra.test.js`). Tienda `npm test` completo (claves, node:test, textos, anti-identidad, anti-ramas, Karma): 368 OK (nuevos: `state/cart.state.spec.ts` con CA-6.5, `state/cotizacion-carrito.state.spec.ts`, 4 casos en `pedido.store.spec.ts`); `npx tsc --noEmit` y `ng build` OK. Admin `npx tsc --noEmit` y `npm test`: 238 OK. Sin navegador.

**Commits:** sin commit todavía.

---

## 2026-10-20 — Pieza C5: Precio tachado y condiciones en la tienda (Tienda + 1 archivo de datos del Backend, visible)
**En una frase:** la tienda ya dibuja el precio que decide el servidor: con una promoción en curso, la tarjeta, la ficha, el buscador, el asesor y la home muestran el precio rebajado en rojo, el regular tachado y "−20 %"; la ficha dice "Ahorras S/ 20,00 con {campaña}" y las condiciones (porcentaje sobre el regular, hasta cuándo, alcance, si se combina con cupones y envío gratis, "el precio que ves es el precio final") aparecen en una franja con "Ver condiciones" en el catálogo y la categoría, y ya abiertas en la ficha. Cuando el precio vence, la vitrina lo vuelve a pedir sola. Sin promociones se ve igual que hoy.

**Dónde:**
| Repo | Archivo | Qué hace |
|---|---|---|
| Tienda | `models/producto.model.ts`, `producto-variante.model.ts`, `tienda.model.ts`, `agente.model.ts`, `api-response.model.ts` | `PrecioVigente`, `Producto.precio?`, `variante.precioVigente?`, `Tienda.promociones?` (`PromocionPublica`), `meta.proximoCambioPrecio?` (todo opcional) |
| Tienda | `negocio/productos/precio.ts` | `precioDe(producto, variante?)` y `conDescuento`: usan el precio del servidor y, si no viene, la regla local de P3 |
| Tienda | `shared/components/precio-con-descuento/` (nuevo) | Vigente en negrita (rojo `#b91c1c` si es campaña), regular tachado leído como "Precio regular", etiqueta "−N %" opcional, "Desde …" |
| Tienda | `features/promocion/condiciones.ts` + `condiciones-promocion.component.ts` (nuevos) | Las frases de las condiciones armadas desde `promociones` (únicas con texto legal, Q8) y la franja / bloque de ficha |
| Tienda | `product-card`, `product-page`, `search-overlay`, `chat-widget`, `home-sections`, `catalog-page`, `category-page`, `catalog.service` | Leen `precio` sin cálculo propio; franja solo si la lista trae productos de la promoción; filtro "en oferta" y rango de precios por el precio vigente |
| Tienda | `core/interceptors/precio.interceptor.ts` (nuevo), `core/services/reloj-tienda.service.ts`, `app.config.ts` | `meta.proximoCambioPrecio` de las respuestas de productos va al reloj de la tienda (un solo temporizador fuera de la zona), que a esa hora invalida las consultas con precio |
| Tienda / Backend | `claves-tienda.json`, `pantallas-tienda.json` (+ copia en `modules/idiomas/`), `modules/idiomas/plataforma/en.json`, `scripts/claves-tienda.mjs`, `scripts/anti-identidad.mjs` | Claves comunes con su inglés (E9), pantalla "Precio y promoción" en Traducciones, `alcance 'productos'` declarado en NO_ES_RUBRO |

**Decisiones que tomé y por qué:**
- **Dejé `precioDeCompra` (el espejo de P3) como respaldo**, aunque T5.6 pedía borrarlo: el encargo decía dejarlo si hacía falta, y mientras el backend nuevo no esté en producción (o con una tienda cuyo backend responda sin `precio`) la vitrina se rompería sin él. Se borra cuando C3a esté en producción (anotado en pendiente). Lo que sí desapareció: ningún componente lo llama directo, todos pasan por `precioDe`.
- **El fin de la promoción se muestra como 23:59 del último día**: el servidor manda el fin exclusivo (00:00 del día siguiente) y la persona lee "hasta el 30 nov, 23:59". Se resta un minuto solo para mostrar.
- **Una sola fuente del temporizador:** el interceptor lee `meta.proximoCambioPrecio` y le pasa el instante a `RelojTiendaService.vigilarPrecio`; ese servicio elige lo primero que ocurra entre la campaña de la tienda y el precio. Al vencer el precio invalida solo las consultas de productos que están en pantalla (TanStack) y vuelve a pedir la tienda.
- **Franja de condiciones:** aparece solo si algún producto de la lista trae `precio.campana` de esa promoción (no por nombre de rubro ni por leer `carrito`: si el servidor no manda `precio` de campaña, no hay nada que mostrar).
- **Etiqueta "−N %" una sola vez por pantalla:** en la tarjeta va sobre la imagen (como el prototipo) y el bloque de precio no la repite; en la ficha va junto al precio.
- **Orden y rango:** el catálogo sigue enviando `precioBase` en `orderBy` y `min_/max_precioBase`; desde C3a el servidor los resuelve por el precio vigente. El rango de precios (`getPriceRange`) lee ahora `precio.vigente`.
- Las claves "Ahorras {monto}…" quedan en el grupo `productos` (están en la ficha de producto); las demás en `comun`.

**Lo que quedó pendiente / deuda:**
- Borrar `precioDeCompra` (T5.6) cuando C3a esté en producción.
- El carrito y el pago (C6) siguen usando su propio cálculo: la tarjeta (`quickAdd`) ya mete al carrito el precio vigente del servidor; el checkout cotiza igual con el servidor.
- Los nombres de categoría de las condiciones vienen del idioma base (pendiente ya anotado en C3a).
- La verificación de tasks.md (S/ 100 tachado, S/ 80, "−20 %", condiciones, apagar la campaña en menos de un minuto) no se hizo: Diego pidió sin QA ni navegador. Para probar: crear y confirmar la promoción de demo con las llamadas de C3b, abrir el catálogo, la categoría, la ficha, el buscador y el asesor; apagar la campaña y comprobar que todo vuelve al regular.

**Afecta al despliegue:**
- Sin SQL ni llaves. Se despliega después del backend de C3a (que trae `precio`, `promociones` y `proximoCambioPrecio`); con un backend anterior la tienda se ve como hoy.
- Backend: solo cambian datos de Traducciones (`modules/idiomas/claves/claves-tienda.json`, `pantallas/pantallas-tienda.json` y `plataforma/en.json`); las claves nuevas se sincronizan al arrancar.
- Reversa: revertir los commits de Tienda y del backend (datos).

**Pruebas:** Tienda `npm test` completo (claves, node:test, textos, anti-identidad, anti-ramas, Karma): 358 tests OK; `npx tsc --noEmit` y `ng build` OK. Nuevos: `condiciones.spec.ts`, `precio-con-descuento.component.spec.ts`, casos de `precioDe` en `precio.spec.ts`, vigilancia del precio en `reloj-tienda.spec.ts`. Backend: `npm test -- modules/idiomas` 96 OK. Sin navegador.

**Commits:** sin commit todavía.

---

## 2026-10-20 — Pieza C3b: La API del paso 3 (Backend, nada visible)
**En una frase:** el backend ya permite crear, cambiar, revisar y confirmar la promoción de una campaña en una sola operación, con los avisos de Indecopi para el diálogo de confirmación, y bloquea lo que rompería una promoción confirmada (cambiar sus fechas desde Diseño, subir el precio regular de un producto en promoción en curso). Sigue **inerte** hasta C4: el Admin todavía no llama a estas rutas.

**Dónde:**
| Repo | Archivo | Qué hace |
|---|---|---|
| Backend | `modules/campanas/promocion.schema.js` (nuevo) | Zod estricto: porcentaje entero 1–90, un solo alcance, topes 200/2.000, permisos, cupón como `cupones.schema.js` (reusa `porcentajeValido`), `confirmar: { version, ventanaInicio, ventanaFin }`. La campaña reusa `campanaTiendaSchema` |
| Backend | `modules/campanas/promocion.repository.js` (nuevo) | `SELECT … FOR UPDATE` de la fila `campanas`, leer/reemplazar promoción con categorías, productos y cupón, confirmación con `skipDuplicates` (ON CONFLICT DO NOTHING), ids contados contra la tienda, productos del alcance (activos con stock), ids del selector, conteo de tiendas con promoción confirmada por edición |
| Backend | `modules/campanas/promocion.service.js` (nuevo) | `guardarCampana` en una transacción (reusa `listaCampanasSchema` y `validarCampanasDeTienda`, R8), `obtenerPromocion`, `revision` (conteo, ejemplo y avisos con `precioVigente` y el historial de C2), `admitePromociones` (= `carrito`), calendario con promoción |
| Backend | `modules/campanas/promocion.js` | Puras nuevas: `paraCalculo`, `cambiaLoQueSeCobra`, `requiereConfirmacion`, `ventanaConfirmadaCambiada`, `promocionesDelProducto`, `promocionEnCalendario`, `textoFechaHora` |
| Backend | `modules/campanas/promocion.admin.routes.js` (nuevo) + `routes/admin/index.js` | `PUT /admin/tiendas/:id/campanas/:campanaId`, `GET …/promocion`, `POST …/promocion/revision` (limitador 30/min por usuario); todas `requireTiendaAccess("admin")` |
| Backend | `modules/campanas/promocion.guardas.js` (nuevo) + `productos.admin.routes.js`, `producto-variantes.admin.routes.js` | R10.5: 409 `PRECIO_EN_PROMOCION` al subir el precio regular (producto, matriz de variantes, variante suelta). Más `GET /admin/productos/ids` y `GET /admin/productos/:id/promociones` |
| Backend | `campanas.validacion.js`, `tiendas.admin.routes.js`, `services/tienda-diseno.service.js` | PUT de diseño: 409 si cambia la ventana de una campaña con promoción confirmada; la promoción de una campaña quitada del arreglo se borra en la misma transacción |
| Backend | `campanas.service.js` (`getCalendario`) | Cada fila trae `promocion: { resumen, estado, confirmacion: { por, en }, recordar }` o `null` |
| Backend | `ediciones.service.js`, `ediciones.schema.js`, `ediciones.admin.routes.js` | `GET /admin/campanas/ediciones/:presetId/tiendas?anio=&clave=` devuelve también `conPromocion` |
| Backend | `precios/contexto.service.js`, `precios/precio-vigente.js` | Se extrajo `leerPromociones(db, tiendaId)` (lo reusan Admin, guardas y diseño) y se exportó `cubre`; sin cambio de comportamiento |

**Decisiones que tomé y por qué:**
- **`confirmar.version` = la versión guardada que el dueño estaba editando (0 si la promoción es nueva)**, no la que resultará. Es la concurrencia optimista de E2: si otra pestaña guardó entre medio, 409 `PROMOCION_CAMBIO` con la versión y la ventana actuales. La confirmación se registra con la versión resultante (sube si cambió lo que se cobra). C4 debe mandar la `version` del GET y la `ventana` que mostró.
- **CA-9.4 solo para una campaña que sigue activa** y cuya promoción estaba confirmada para su ventana en curso o próxima. Apagar la campaña o quitar la promoción no pide confirmación (no cobra de menos sin que el dueño lo sepa). Una promoción sin confirmar se guarda sin más: la campaña queda solo visual (R5.7).
- **La revisión calcula con `precioVigente`** (ejemplo, bajo costo y "oferta propia" = `origen === "oferta"` sin promoción): no hay otra regla de precio (fitness "una sola regla" en verde). El ejemplo usa el precio del primer producto del alcance o S/ 100.
- **Avisos de historial:** subidas en `[inicio − 30 días, inicio]` con `subidasEnVentana`; "sin 30 días de historial" con `primerRegistro` + `tieneHistorial`. Devuelve muestra de 5, total y, en subidas, todos los ids (para "Ver la lista completa").
- **La guarda R10.5 bloquea solo una promoción en curso**; una que empieza en los próximos 30 días solo la devuelve `GET /admin/productos/:id/promociones` (aviso R10.3, del formulario en C4). En la matriz de variantes, una variante nueva no "sube" (no tiene precio anterior).
- **El cupón de la campaña se guarda con `fechaInicio`/`fechaFin` = la ventana en curso o próxima.** Hasta C7 (`cuponDeCampanaVigente`) es lo que hace que la validación de cupones de hoy lo rechace fuera de la ventana.
- **Bloqueo:** se bloquea la fila `campanas` (`FOR UPDATE`) como dice el impacto. El PUT de diseño no toma ese bloqueo; si una pestaña vieja del editor pisara las fechas justo después de una confirmación, la ventana deja de coincidir y la promoción **deja de aplicar** (falla hacia el lado seguro: nunca cobra un descuento sin confirmar).
- **T3b.11 (desvío):** los mensajes son del Admin (solo español), así que no se marcan con `clave(…)`: esa marca los mete en el catálogo de Traducciones de la tienda (contrato 10) y el dueño los vería como textos a traducir para sus clientes. Quedan juntos en `MENSAJES` (`promocion.service.js`) y en `mensajePrecioEnPromocion` (`promocion.guardas.js`).
- `porcentajeValido` de `cupones.schema.js` pasó a exportarse para no duplicar la regla del 100 %.
- El test de ediciones cambió a propósito: `tiendasConCampana` devuelve `{ total, conPromocion }`.

**Llamadas para probar** (con el SQL de C3a corrido; `$T` tienda demo de productos, `$C` id de una campaña propia activa, `$P` un producto, token de admin):
```bash
# 1. Crear la promoción (sin confirmar: no cambia precios)
curl -X PUT $API/admin/tiendas/$T/campanas/$C -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"campana":{"id":"'$C'","presetId":null,"activa":true,"nombre":"Aniversario","inicio":"2026-11-20","fin":"2026-11-30"},"promocion":{"porcentaje":20,"alcance":"tienda"}}'
# 2. Lo que mostrará el diálogo
curl -X POST $API/admin/tiendas/$T/campanas/$C/promocion/revision ... -d '{"promocion":{"porcentaje":20,"alcance":"tienda"},"completa":true}'
# 3. Confirmar (version = la del GET …/promocion; ventana = la de la revisión)
curl -X PUT ... -d '{"campana":{…igual…},"promocion":{"porcentaje":20,"alcance":"tienda"},"confirmar":{"version":1,"ventanaInicio":"2026-11-20T00:00:00-05:00","ventanaFin":"2026-12-01T00:00:00-05:00"}}'
# 4. Cambiar a 25 % sin "confirmar" → 409 CONFIRMACION_REQUERIDA (nada cambia)
# 5. Con la promoción en curso, subir el precio de un producto → 409 PRECIO_EN_PROMOCION
curl -X PUT $API/admin/productos/$P ... -d '{"precioBase":999}'
```

**Lo que quedó pendiente / deuda:**
- La verificación de tasks.md (llamadas reales en la tienda demo) no se hizo: Diego pidió sin QA y requiere el SQL de C3a corrido.
- La revisión calcula a nivel de producto (precio base, oferta y costo): las variantes con precio propio no entran en "bajo costo" ni en el ejemplo. Mira hasta 5.000 productos del alcance (tope del listado por precio).
- `cuponDeCampanaVigente` (cupón solo mientras su promoción aplica, con sus permisos) sigue siendo de C7.

**Afecta al despliegue:**
- **Sin SQL nuevo ni llaves.** Usa las tablas de `campanas_descuento_promociones.sql` (C3a), que debe estar corrido **antes** de este backend: el calendario, el PUT de diseño y las guardas de precio consultan `campana_promociones`. Va con o después de C3a, o sea después de precio-en-servidor P1–P3 en producción (R12.1).
- Reversa: revertir el commit del backend; los datos quedan en las tablas de C3a.

**Pruebas:** `npm test` backend: 135 suites, 1834 tests OK. Nuevos: `campanas/__tests__/promocion.service.test.js` (CA-11.1, CA-11.2, CA-9.4 porcentaje y fechas, `PROMOCION_CAMBIO` por versión y por ventana, ids ajenos, cupón repetido, confirmación con quién/qué/ventana, revisión CA-4.6, CA-4.8, CA-10.2, CA-10.3, CA-10.5, CA-10.7, ≥ 50 %), `promocion.guardas.test.js` (CA-10.6 producto, variantes y variante; confirmación idempotente; ids de otra tienda; PUT de diseño: promoción huérfana y 409 por fechas), `promocion-admin.test.js` (CA-4.1, `cambiaLoQueSeCobra`, promociones del producto, calendario, fechas). `ediciones.test.js` ajustado. Sin navegador.

**Commits:** sin commit todavía.

---

## 2026-10-20 — Pieza C3a: El servidor aplica la promoción (Supabase + Backend, nada visible)
**En una frase:** el servidor ya sabe bajar precios durante una campaña: si una tienda tiene una promoción confirmada para la ventana en curso de una campaña activa, el listado, la home, la ficha, el asesor, la cotización y el pedido usan el precio rebajado, y `/store/tiendas` publica las condiciones. Es **inerte**: nadie puede crear una promoción hasta C3b/C4, así que hoy todas las tiendas responden igual que antes (más el campo `precio`).

**Dónde:**
| Repo | Archivo | Qué hace |
|---|---|---|
| Backend | `docs/sql/campanas_descuento_promociones.sql` (+ `_reversa`) | Las 4 tablas, `cupones.campana_promocion_id`, trigger de confirmaciones inmutables, índices y RLS. Tal cual `impacto.md`; la reversa es idempotente |
| Backend | `prisma/schema.prisma`, `kernel/tenant/alcance.js` | 4 modelos nuevos + `cupones.campanaPromocionId`; los 4 en `ALCANCE` como `"tienda"` |
| Backend | `modules/campanas/promocion.js` (nuevo, puro) | `promocionesVigentes` (activa + ventana con `ventanas()` + confirmación con la misma `version` y la misma ventana; subcategorías; `orden`), `estadoPromocion`, `resumenPromocion`, `proximoCambioPromociones`, `promocionesPublicas` |
| Backend | `modules/precios/precio-vigente.js` | `precioVigente` con `contexto.promociones` (gana el menor; empate oferta-promoción → oferta, E8; entre promociones → `orden`; piso 1 céntimo) + `precioPublico` y `porcentajeDescuento` |
| Backend | `modules/precios/contexto.service.js`, `contexto.cache.js` (nuevos) | Cargador `contextoDePrecios(db, tiendaId, { ahora, conCache })` con camino rápido y caché por tienda `min(60 s, proximoCambio)` |
| Backend | `modules/catalogo/productos.store.routes.js`, `productos.serializer.js`, `productos.cache.js`, `listado-por-precio.js` (nuevo) | `precio` en tarjeta, home, ficha y variantes; `meta.proximoCambioPrecio`; orden y rango por precio vigente; TTL de memoria hasta el próximo cambio y `clear()` |
| Backend | `routes/store/index.js` | `cache(60, { hasta: meta.proximoCambioPrecio })` en `/store/productos` |
| Backend | `modules/tenants/tiendas.store.routes.js` | `promociones` públicas en `/store/tiendas` |
| Backend | `modules/agente/tools/buscar-productos.js`, `agente/precios.js`, `agente.serializer.js` | Presupuesto: SQL como cota + filtro exacto con `precioVigente`; tarjeta del chat con `precio` |
| Backend | `modules/ordenes/crear-pedido.js`, `modules/precios/cotizacion-compra.js`, `cotizacion-compra.service.js` | Cotizar y crear piden el contexto con `conCache: false` y lo pasan a `cotizarCompra`; las líneas leen `categoriaId` |
| Backend | `modules/tenants/tiendas.admin.routes.js`, `modules/campanas/ediciones.service.js` | Invalidaciones: guardar el diseño limpia el contexto de esa tienda y el catálogo en memoria; una edición de la plataforma limpia todo |

**Decisiones que tomé y por qué:**
- **`contextoDePrecios(db, tiendaId, …)` recibe el cliente Prisma** (tasks.md lo escribe sin `db`). El test de P1 "modules/precios no toca la BD" exige que nada en `modules/precios/` importe Prisma; así el cargador queda como `cargarLineas(tx, …)` y al crear el pedido lee dentro de la misma transacción.
- **`precioVigente` solo agrega `campana` cuando gana una promoción** y el porcentaje sale de `porcentajeDescuento` / `precioPublico`. Así, sin promociones, el resultado es idéntico al de P1 y sus tests siguen verdes sin tocarlos (lo pide impacto.md). `campana` interno trae `porcentaje`, `hasta` y los dos permisos (los usará C7); lo público solo `{ id, nombre, hasta }`.
- **Variantes:** cada una conserva `precio` (el guardado, lo lee la Tienda actual) y suma `precioVigente` (el objeto `{ vigente, regular, origen, porcentaje, campana }`). Poner el objeto en `precio` habría roto la Tienda hasta C5.
- **`hasta` en hora de Lima** (`aIsoLima`), como `proximoCambio` en `/store/tiendas`.
- **La vitrina no se cae si las tablas no responden** (p. ej. backend desplegado antes del SQL): sigue sin promociones y queda en la bitácora, igual que las ediciones. Cotizar y crear el pedido **sí** fallan: el dinero no se decide con una lectura a medias.
- **Orden y rango por precio:** se activa con `orderBy=precioBase|precio` o `min_/max_precioBase|precio`. Hoy `min_/max_precioBase` se ignoraba en silencio (no estaba en `allowedFilters`): ahora filtra de verdad, por el precio que se cobra.
- **`alcance.tipo === "productos"`** (alcance de la promoción) hizo saltar la fitness anti-identidad: se declaró en `NO_ES_RUBRO` con su motivo (no es el rubro).
- **Las invalidaciones van en `invalidateTiendasListCache`** (todas las escrituras de la tienda, incluido el PUT de diseño): limpia el contexto de esa tienda y la home/ficha en memoria. Es más de lo estricto (también al subir un logo), pero es barato y no deja precios viejos.
- `prisma format` realineó espacios en modelos vecinos (sin cambios de contenido; `git diff -w` solo muestra lo nuevo).

**Lo que quedó pendiente / deuda:**
- Los nombres de categoría en `promociones` de `/store/tiendas` salen en el idioma base (sin `localizar`); la franja de condiciones es de C5.
- La cotización todavía no devuelve la campaña por línea ni la guarda en el pedido: es C6 (`precio_origen` ya admite `campana`, es `varchar(20)` sin CHECK). Cupones y envío gratis con promoción: C7 (hoy se combinan como en P2).
- Caché en memoria por instancia (ya anotado en `productos.cache.js`): con varias instancias, Redis.
- Sin probar en el navegador ni la verificación de tasks.md (Diego pidió sin QA; requiere el SQL corrido y una promoción cargada a mano).

**Afecta al despliegue:**
- **Orden (R12.1): esta pieza se despliega DESPUÉS de precio-en-servidor P1, P2 y P3 en producción.** Antes no: la promoción entra por la cotización y el pedido de P2 y por el aviso 409 de P3.
- SQL `docs/sql/campanas_descuento_promociones.sql` en Supabase **antes** del backend, luego `npx prisma generate`. Tablas vacías: no afecta a nadie. Verificación al final del archivo.
- Sin llaves nuevas ni parámetros.
- Reversa: revertir el backend (los precios vuelven a P1 al instante); las tablas pueden quedarse. `campanas_descuento_promociones_reversa.sql` solo si se quiere borrar todo (después de revertir el backend).

**Pruebas:** `npm test` backend: 132 suites, 1785 tests OK. Nuevos: `campanas/__tests__/promocion.test.js` (CA-5.2 fronteras, CA-5.7, CA-9.4, CA-9.5 con `recordar`, CA-5.5, apagada, CA-4.2/4.3/4.4), `precios/__tests__/precio-vigente.test.js` ampliado (CA-5.3, 5.4, 5.6, piso, empates), `precios/__tests__/contexto.service.test.js`, `precios/__tests__/una-sola-regla.test.js` (fitness), `catalogo/__tests__/listado-por-precio.test.js`, 3 casos en `ordenes/__tests__/crear-pedido.test.js` y 1 en `agente/__tests__/precios.test.js`. Sin navegador.

**Commits:** sin commit todavía.

---

## 2026-10-20 — Pieza C1: La campaña en tres pasos, sin promoción (Admin)
**En una frase:** al abrir una campaña en Admin › Campañas el dueño ve dos pasos cerrados, cada uno con su estado ("Listo: 27–30 nov" · "Del catálogo"), activa con un solo botón "Activar campaña" y, desde el paso 2, va al editor de Diseño y vuelve a la misma campaña con una barra "← Volver a …". Todavía no hay promoción: el paso 3 no existe en esta pieza.

**Dónde:**
| Repo | Archivo | Qué hace |
|---|---|---|
| Admin | `pages/campanas/pasos/estado-pasos.ts` (+ `.spec.ts`) | Puro: estado del paso 1 y del paso 2, si "Activar campaña" está habilitado y por qué no, los botones según la campaña (apagada/activa), los avisos del aspecto |
| Admin | `pages/campanas/pasos/paso-campana.component.ts` | Cabecera de paso: número, título, estado (se retira al abrir y queda una chip), botón de 56 px con `aria-expanded` |
| Admin | `pages/campanas/pasos/paso-cuando.component.ts` | Paso 1: lo de hoy sin cambiar reglas (Fechas oficiales / Mis fechas, días antes y después, horas, Cyber Wow en solo lectura) más el error del servidor con `role="alert"` |
| Admin | `pages/campanas/pasos/paso-aspecto.component.ts` | Paso 2: vista previa, "Editar aspecto →" / "Guardar y editar aspecto →", avisos R8.7/R8.8 y "Cuándo se ve el efecto" (movido desde el panel) |
| Admin | `pages/campanas/pasos/campana-pasos.component.ts` (+ `.spec.ts`) | Contenedor: los pasos, un solo botón principal, "Guardar sin activar", "Descartar", "Restablecer lo sugerido" / "Eliminar" |
| Admin | `pages/campanas/pasos/calendario-filas.ts`, `fila-campana.ts` | Se movió de `campanas.component.ts` el cálculo de las filas del calendario y los tipos; sin cambio de lógica |
| Admin | `pages/campanas/campanas.component.ts` / `.html` | Pasa de 639 a 332 líneas: lista, interruptor, guardado (`guardar(activar)`), `editarAspecto()` y la llegada desde Diseño |
| Admin | `pages/diseno/diseno.component.ts` / `.html` | Barra "← Volver a {campaña}" cuando se llega con `?volver=campana:<id>`; vuelve a `/campanas?abrir=<id>&paso=2` |

**Decisiones que tomé y por qué:**
- **Sin paso 3 ni capacidad "vende con carrito" en esta pieza.** tasks.md dice que el paso no existe en C1; así no hay nada que ocultar por rubro y el anti-identidad queda intacto.
- **La vista previa del paso 2 es un dibujo de la portada con los datos reales de la campaña** (aviso de arriba, título, subtítulo, botón, cinta y color principal, mezclando lo propio con el catálogo), no una llamada al API. Se hizo así porque el backend no tiene un endpoint de vista previa de campaña y el editor en vivo ya existe en Diseño; "Editar aspecto" lleva ahí. Si se quiere la tienda real dentro del paso, es una pieza aparte.
- **El estado del estado de los pasos es una función pura** (`estado-pasos.ts`) y los componentes de paso no guardan nada: avisan con `cambio` y el contenedor (`CampanasComponent`) conserva el estado de siempre (`campanas`, `guardadas`, `dirty`). Un solo dueño del dato.
- **"Activar campaña" enciende y guarda en un solo paso** (`conActivacion`); "Guardar sin activar" y "Guardar cambios" no tocan el interruptor. Una campaña propia nueva ahora nace **apagada** (antes nacía activa): con un único botón "Activar campaña" es lo coherente.
- **Errores R8 del servidor**: siguen saliendo en el toast y además se repiten dentro del paso 1 (que se abre y queda en "Revisar") hasta el siguiente cambio. Si falla el guardado, la lista vuelve a como estaba (la campaña no queda encendida a medias).
- **"Guardar y editar aspecto"** guarda como borrador (sin activar) y navega a Diseño solo si el guardado salió bien.
- **Las fechas de uso siguen ocultas** (`FECHAS_DE_USO_VISIBLES = false`, campanas-cuando R1.11): el bloque se movió al paso 1 con el mismo interruptor, para que vuelva ahí cuando toque.
- En Diseño la barra solo aparece si el `volver` coincide con la campaña que se está editando; cambiar de campaña en el selector la quita.

**Lo que quedó pendiente / deuda:**
- El aviso R3.2/R3.3 (promete descuento y el paso 3 está vacío / porcentajes distintos) es de C4; hoy el paso 2 muestra el de siempre (R3.4, "Tu campaña no cambia precios…") con las partes donde aparece.
- El presupuesto de bundle inicial del Admin ya estaba excedido (787 kB frente a 700 kB) en `ng build`; no lo causa esta pieza.
- Sin probar en el navegador (Diego pidió sin QA).

**Afecta al despliegue:** nada (solo Admin; sin llaves ni SQL). Revertir = revertir el commit del front.

**Commits:** sin commit todavía.


---

## Pieza C2 — Historial del precio regular (Backend + SQL, nada visible)

**Qué cambió:** el sistema empieza a guardar cada cambio de `precio_base` (producto) y `precio` (variante) con fecha, precio anterior y nuevo, y quién. Lo hacen triggers de BD, así que ningún camino de escritura se lo salta. El SQL también guarda una línea base con los precios de hoy: desde ese día corren los 30 días del aviso de Indecopi.

| Archivo | Qué hace |
|---|---|
| `docs/sql/campanas_descuento_historial.sql` (+ `_reversa`) | Tabla, triggers (alta/cambio, inmutable), línea base, RLS. Idempotente, tal cual `impacto.md` |
| `prisma/schema.prisma` | Modelo `producto_precio_historial` y relaciones en `tiendas`, `productos`, `producto_variantes` |
| `kernel/tenant/alcance.js` | `producto_precio_historial: "tienda"` |
| `modules/catalogo/precio-historial.js` | Puro: `subidasEnVentana`, `tieneHistorial`, `restarDias` |
| `modules/catalogo/precio-historial.repository.js` | `historialDe(tiendaId, productoIds, desde)` y `primerRegistro(...)`, solo lectura |

**Decisiones:**
- T2.5 revisado, sin cambios de código: el genérico (`addUpdateAuditFields`), `sincronizarVariantes` (SQL crudo con `usuario_actualizacion`, `createMany` con `usuarioRegistro`, `productos.update`) y el `PUT` de variante (genérico) ya dejan el usuario. Un SQL a mano queda con "quién" vacío, pero el cambio sí se registra.
- Subida = fila `cambio` con anterior y nuevo no nulos y nuevo > anterior. Variante con precio null (usa el del producto) no cuenta: no hay con qué comparar.
- Extra al repositorio: `primerRegistro` (fecha mínima por producto), para decidir `tieneHistorial` sin traer todas las filas.
- El campo `usuario` es el correo del Admin; en altas por SQL queda null.

**Pendiente:** el aviso en sí lo usan la revisión (C3b) y el formulario (C4). No hay endpoint ni pantalla.

**Afecta al despliegue:** SQL `campanas_descuento_historial.sql` en Supabase ANTES de desplegar el backend (sin la tabla, `prisma generate` compila pero nadie la lee todavía, así que el orden no rompe nada). Sin llaves. Reversa: `campanas_descuento_historial_reversa.sql` (borra el historial acumulado).

**Pruebas:** `npm test` backend 128 suites, 1734 tests OK (incluye `alcance.test.js` y `precio-historial.test.js`, 11 casos: CA-10.2, 10.3, 10.5). Sin navegador. Falta la verificación de tasks.md (cambiar S/ 80 a S/ 100 y ver la fila), que requiere el SQL corrido.

**Commits:** sin commit todavía.
