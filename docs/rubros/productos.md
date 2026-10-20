# Rubro: productos

> Dueño: agente `analista-productos` · Última revisión: 2026-10-18 · Fuente: código + specs (cada regla cita de dónde sale). Primera versión.
> Rutas: backend `ecommerceMultitenant-BackendNode/`, admin `ecommerceMultitenant-FrontendAdmin/src/app/`, tienda `ecommerceMultitenant-FrontendStore/src/app/`.

## En una frase
Tienda online de productos físicos: el cliente arma un carrito, elige envío y forma de pago, pide boleta o factura y genera un **pedido**; el negocio gana vendiendo el producto (el envío se cobra al cliente o se paga en destino).

## Clientes típicos y tiendas demo
- Tiendas de ropa, calzado, tecnología, juguetes, menaje, abarrotes (ver tabla de rubros validados en `docs/specs/opciones-variantes/spec.md`).
- Es el rubro por defecto: un `tipoNegocio` desconocido o vacío se trata como `productos` (`modules/negocio/registro.js` `estrategiaDe`; `negocio/perfiles.spec.ts` y `uis.spec.ts` en la tienda).
- Tiendas demo de este rubro: **no documentadas** (ver Preguntas abiertas).

## Glosario
| Término del negocio | Qué significa | Nombre en el código |
|---|---|---|
| Pedido | Compra con carrito (único rubro con pedido de tipo `compra`, sin reserva) | `pedidos`, `pedido_detalles` |
| Opción | Dimensión en que varía un producto (Color, Talla...), hasta 3 | `productos.metadata.opciones` |
| Variante | Combinación que existe (Negro / 40) con stock, precio y SKU propios | `producto_variantes` |
| Opción principal | Primera opción; agrupa variantes y tiene fotos propias | spec `opciones-variantes` |
| Stock de alerta | Umbral para el aviso de stock bajo | `productos.stock_alerta` |
| Servicio | Producto sin stock físico | `productos.es_servicio` |
| Método de envío | `courier`, `delivery_propio`, `recojo_tienda` | `metodos_envio` |
| Zona de envío | Tarifa por ubigeo (depto/provincia/distrito/país) dentro de un método | `zonas` de `metodos_envio` |
| Pago en destino | El cliente paga el flete al courier al recibir | `metodos_envio.pagoEnDestino` |
| Modo de pago | `manual` (captura + verificación) o `automatico` (pasarela) | `tiendas.modoPago` |
| Comprobante | Boleta o factura, guardado como snapshot en el pedido | `pedidos.comprobante*` |
| Hoja de reclamación | Reclamo/queja del Libro de Reclamaciones (INDECOPI) | `modules/libro-reclamaciones/` |

## Ciclo de vida
Pedido (estado logístico) y pago (`estadoPago`) son dos ejes independientes.

| Eje | Valores | Quién lo mueve |
|---|---|---|
| `estado` | `pendiente` > `confirmado` > `en_proceso` > `enviado` > `entregado`; `cancelado` | Nace `pendiente` (sistema, al crear). El resto lo cambia el admin a mano; no hay validación de transiciones en el código |
| `estadoPago` | `pendiente`, `pagado`, `rechazado`, `reembolsado` | Nace `pendiente`. Manual: el admin. Automático: pasarela/webhook pone `pagado` |

Flujo: cliente crea pedido (el stock se descuenta en el acto) > tienda confirma y prepara > envía > entrega. Cancelar repone stock y revierte estadísticas del cliente (`modules/ordenes/pedidos.service.js` `updateEstado`). Seguimiento público por número de pedido (`modules/ordenes/rastreo.js`).

## Reglas de negocio
| ID | Regla | Dónde vive (archivo) | Spec |
|---|---|---|---|
| PRO-01 | El precio base es obligatorio al crear y debe ser > 0 | `modules/negocio/productos/estrategia.js` | perfil-negocio |
| PRO-02 | El rubro sale de la base (`tiendas.tipo_negocio`), nunca del request | `modules/negocio/registro.js` | perfil-negocio |
| PRO-03 | Un producto tiene 0 a 3 opciones (máx. 30 valores c/u, máx. 100 variantes); una sola opción de tipo color con paleta fija de 16 | `modules/catalogo/producto-opciones*.js` | opciones-variantes R1 |
| PRO-04 | Cada valor principal debe tener al menos una variante; al guardar, las variantes quitadas se **desactivan** (conservan `id` por pedidos/carritos) | `modules/catalogo/producto-variantes.admin.routes.js` | opciones-variantes R2.2, R2.6 |
| PRO-05 | Con opciones, `productos.stock` = suma del stock de variantes activas y se mueve al vender/cancelar | `modules/inventario/inventario.service.js` | opciones-variantes R3 |
| PRO-06 | "Agotado" (existe, stock 0) es distinto de "no existe" (combinación desmarcada) | tienda: selector de variantes | opciones-variantes R5.3 |
| PRO-07 | Al crear el pedido se valida y **bloquea** el stock (FOR UPDATE) en la misma transacción; sin stock o variante inactiva rechaza el pedido; los servicios no descuentan | `modules/inventario/inventario.service.js` `validarYBloquearStock` | (código; sin spec propia) |
| PRO-08 | Máx. 50 líneas por pedido y 100 unidades por línea | `modules/ordenes/pedidos.schema.js` | (código) |
| PRO-09 | El costo de envío lo **calcula el servidor** con el subtotal y el descuento del servidor (envío gratis desde un monto incluido); el body ya no trae `costoEnvio` ni el nombre del método. Si la tienda tiene métodos activos hay que elegir uno; sin métodos, el pedido va "Por coordinar". Si el método no llega al distrito, rechaza el pedido | `modules/ordenes/crear-pedido.js`, `modules/precios/cotizacion-compra.js`, `modules/envios/cotizacion.js` | checkout-envio-pago R3.7, precio-en-servidor C9 |
| PRO-10 | Gana la zona más específica (distrito > provincia > depto > país); a igual especificidad, la de menor `orden` | `modules/envios/cotizacion.js` `resolverZona` | checkout-envio-pago R3.2 |
| PRO-11 | Fuera de zona: `coordinar` (por WhatsApp, defecto) o `no_disponible` (el método se oculta). Método sin zonas = por coordinar | `modules/envios/cotizacion.js` | checkout-envio-pago R3.3, R3.4 |
| PRO-12 | Envío gratis si subtotal - descuento >= `tiendas.envio_gratis_minimo`; `recojo_tienda` siempre gratis | `modules/envios/cotizacion.js` | checkout-envio-pago R3.5 |
| PRO-13 | Con `pagoEnDestino` el flete no suma al total; se muestra como referencia | `modules/envios/cotizacion.js` | checkout-envio-pago R3.6 |
| PRO-14 | Boleta desde S/ 700 exige DNI o CE; bajo S/ 700 el documento es opcional. DNI 8 dígitos, CE 9-12 alfanuméricos | `modules/ordenes/pedidos.service.js` (`MONTO_BOLETA_CON_DOCUMENTO`), `pedidos.schema.js` | checkout-envio-pago R2.2 |
| PRO-15 | Solo se acepta factura si `tiendas.emite_factura`; si no: "Esta tienda solo emite boletas" | `modules/ordenes/pedidos.service.js` | checkout-envio-pago R2.4 |
| PRO-16 | Factura: RUC (11 dígitos, prefijo 10/15/17/20, dígito verificador). Razón social y dirección fiscal salen del **padrón SUNAT**, no del navegador. RUC no ACTIVO bloquea la factura | `modules/sunat/ruc.service.js`, `pedidos.schema.js` | consulta-ruc |
| PRO-17 | Comprobante y datos fiscales se guardan como snapshot en el pedido (no en `clientes`); el admin puede corregirlos | `modules/ordenes/pedidos.service.js` `updateDetalles` | checkout-envio-pago R2.5 |
| PRO-18 | Cupón: debe estar activo, vigente, con usos disponibles y respetar mínimo de compra y máximo por cliente; tipo `porcentaje` (máx. 100 %) o `monto_fijo`; el descuento nunca supera el subtotal. Una sola regla para mostrar y para cobrar (`evaluarCupon`), y el servidor calcula el monto. El uso se suma solo si queda cupo (dos pedidos con el último uso: uno sale "Cupón agotado"). Se suma a la oferta manual del producto. No se usan cupones en rubros de reserva | `modules/cupones/regla-cupon.js`, `cupones.service.js`, `modules/ordenes/crear-pedido.js` | precio-en-servidor C4, C5, D2 |
| PRO-19 | Pago manual: Yape/Plin/transferencia con datos copiables, efectivo o contra entrega ("Pagas al recibir"). Con costo de envío por coordinar no se muestra el monto a pagar | `modules/pagos/metodos-pago.*`, tienda `features/checkout/checkout-page/checkout-page.component.ts` | checkout-envio-pago R4 |
| PRO-20 | Pago automático (tarjeta/Yape): solo si la pasarela está lista; el monto sale de `pedido.total` en el servidor; el webhook es la fuente de verdad y es idempotente. Volver a manual siempre se puede | `modules/pagos/modo-pago.service.js`, `modules/pagos/pasarela/destinos.js` | pago-automatico R1, R4, R5 |
| PRO-21 | Todas las tiendas tienen Libro de Reclamaciones visible y no ocultable; correlativo por tienda y año; plazo 15 días hábiles; la hoja no se edita ni borra | `modules/libro-reclamaciones/` | libro-reclamaciones R1-R6 |
| PRO-22 | Seguimiento público: sin prueba solo estado y fechas; detalle completo con sesión del dueño o últimos 4 dígitos del WhatsApp | `modules/ordenes/rastreo.js` | agente-ventas R4 |
| PRO-23 | El dashboard cuenta ventas = compras no canceladas, por fecha del pedido; alerta stock bajo, por confirmar y por despachar | `modules/negocio/productos/dashboard.js` | dashboard-por-rubro DR6 |
| PRO-24 | Video del producto (link de redes) existe como capacidad pero está **apagada** en productos (fase 2, activable por tienda) | Admin `negocio/productos/perfil.ts` (`usaVideo: false`), backend `modules/catalogo/video.js` | video-producto |

## Capacidades del rubro
| Capacidad | Valor | Backend (`modules/negocio/productos/datos.js`) | Tienda (`negocio/productos/`) | Admin (`negocio/productos/`) |
|---|---|---|---|---|
| Carrito | sí | implícito (`recibeReservas:false`) | `carrito: true` (`perfil` en `negocio/perfiles.ts`) | `reservas: null` |
| Recibe reservas | no | `recibeReservas: false`, `reservas: null` (`registro.js`) | `reserva: null` | `reservas: null` |
| Plan de pagos / transmisiones / alquiler por horas | no | `false` los tres | n/a | n/a |
| Marcas | sí | `marcas: true` | sin bandera en el perfil | `catalogo.usaMarcas: true` |
| Categorías | sí | sección `categorias` | `usaCategorias: true` | `catalogo.usaCategorias: true` |
| Precio, stock, variantes | sí | `prepararProducto` exige precio | n/a | `usaPrecio/usaStock/usaVariantes: true` |
| Video | no | `modules/catalogo/video.js` (común) | n/a | `usaVideo: false` |
| Buscador de reservas | no | n/a | `buscador: null` | `buscador: null` |
| Plantilla por defecto | `clasica` | `diseno.plantillaPorDefecto` | n/a | `diseno.plantillaPorDefecto: 'clasica'` |
| Secciones de diseño | comunes + categorias, productos, oferta | `diseno.secciones` | n/a | n/a |
| Textos fijos traducibles | comun, productos, correos, errores | `gruposTextos` | n/a | n/a |
| Comprobante | `al_pagar` | `configReservas.comprobanteEn` | n/a | n/a |
| Asesor IA | el genérico | `agente: null` (no hay `agente/perfiles/productos.js`) | n/a | n/a |
| Estructura visual | familia `comercio` | n/a | `ui.ts` = `UI_COMERCIO` | n/a |
| Rutas propias (tienda) | productos, producto/:id, categorias/:slug, carrito, checkout, rastrear, rastrear/:n | n/a | `familias/comercio/ui.ts` | n/a |
| Nombre del catálogo | "Productos" | `nombreCatalogo` | `vitrina.ruta: 'productos'` | `vocab.items: 'Productos'` |

## Pantallas propias
- Tienda: catálogo, ficha de producto (selector de opciones, galería por valor), categoría, carrito + mini carrito, checkout (Tu pedido > Pago y comprobante > Confirmar > Pedido creado), rastreo de pedido, historial en "Mi cuenta", Libro de Reclamaciones.
- Admin: Productos, Categorías, Marcas, Pedidos (con alerta), Cupones, Envíos (métodos y zonas) (`negocio/productos/perfil.ts`); además modo de pago/pasarela, bandeja del Libro de Reclamaciones y dashboard de ventas.

## Casos borde que siempre hay que probar
- Dos clientes comprando la última unidad a la vez (debe ganar uno; el otro recibe "Stock insuficiente").
- Variante desactivada que sigue en un carrito guardado: "Variante no disponible".
- Producto con variantes: `productos.stock` coincide con la suma tras vender y tras cancelar.
- Cancelar un pedido ya pagado por pasarela (no hay reembolso automático).
- Destino fuera de zona con `no_disponible` vs `coordinar`; método sin zonas; Tacna con delivery propio de Lima.
- Pedido de exactamente S/ 700 con boleta sin documento; factura con RUC de baja o dígito verificador mal; CDN del padrón caído (no debe impedir comprar, spec consulta-ruc).
- Total con envío por coordinar: el monto a pagar no se muestra.
- Cupón agotado, vencido, ya usado por el cliente, bajo el mínimo.
- Tienda en modo automático cuya llave se borra: cobra en manual (`modo-pago.service.js`).
- Cliente sin sesión consultando el pedido de otro por número correlativo.
- Home de subdominio en SSR: el slot por rubro no se hidrata (CLAUDE.md de la tienda).

## Lo que NO es este rubro (fuera de alcance deliberado)
- No recibe reservas, ni calendario, ni cupo, ni plan de cuotas (`recibeReservas:false`).
- No emite comprobante electrónico ante SUNAT (Nubefact/OSE): solo captura los datos (checkout-envio-pago, "No incluye").
- No cotiza con la API del courier ni usa peso/volumen; tarifas por zona fijas.
- Un solo almacén por tienda hasta multi-sede (`docs/specs/multi-sede`, aprobado, pieza 1 sin empezar).
- Sin especificaciones técnicas ni guía de tallas (opciones-variantes, Fase 3 pendiente).
- Sin reembolsos automáticos (pago-automatico, "Fuera de alcance").
- Sin precio de oferta por variante (la oferta es solo del producto).

## Diferencias entre repos detectadas
| # | Qué | Detalle |
|---|---|---|
| D1 | Spec vs código en factura | `checkout-envio-pago` R2.3 dice que la factura exige razón social y dirección fiscal; el código las toma del padrón SUNAT y descarta lo que mande el navegador (`pedidos.schema.js`, spec `consulta-ruc`). Gana `consulta-ruc`; falta actualizar R2.3 |
| D2 | Marcas sin espejo en tienda | Backend (`marcas:true`) y admin (`usaMarcas:true`) la declaran; el perfil de la tienda no tiene esa capacidad (el filtro está en el catálogo) |
| D3 | Asesor de ventas | `agente: null` significa "usa el de productos", pero `modules/agente/perfiles/` no tiene archivo de productos; el default vive en `agente.service.js`/`tools` |
| D4 | Comentario desactualizado | `datos.js` dice "pago contra entrega" y no menciona el pago automático (tarjeta/Yape), que ya existe. Solo documentación |
| D5 | Textos en el admin | `negocio/productos/perfil.ts` (admin) tiene textos sin tildes ("Categoria", "Informacion"). Cosmético |
| D6 | Estado del pendiente | `docs/ESTADO.md` marca "SQL antes de desplegar" para checkout y libro; este documento asume que el código ya está activo |

### Riesgos de reglas (a confirmar en Preguntas)
- **Reabrir un pedido cancelado.** `updateEstado` repone stock al pasar a `cancelado`, pero no encontré que vuelva a descontarlo si el admin lo saca de `cancelado`.
- **Sin vencimiento de pedidos pendientes.** El stock se descuenta al crear el pedido y no vi un proceso que cancele pedidos sin pagar.
- **Cancelación con pago automático.** Un pedido pagado por tarjeta se cancela sin reembolso (el método `refund` existe, no está conectado).

## Preguntas abiertas para Diego
- [ ] ¿Qué tiendas demo de productos existen (slug, dueño de prueba)? No las encontré en código ni specs.
- [x] ¿Confirmas que el precio del producto y el descuento deben validarse en el servidor al crear el pedido? Sí: [ADR-0001](../adr/ADR-0001-precio-calculado-en-servidor.md), implementado en `precio-en-servidor` piezas 1-2 (precio, oferta, cupón y envío los calcula el servidor; solo vende con carrito el rubro con la capacidad `carrito`).
- [ ] ¿Un pedido pendiente sin pago debe vencer y devolver el stock? ¿A las cuántas horas?
- [ ] ¿Reabrir un pedido cancelado debe volver a descontar stock, o está prohibido?
- [ ] ¿Qué pasa con el dinero cuando se cancela un pedido ya pagado por pasarela: devolución manual o automática?
- [ ] ¿Las transiciones de estado (por ejemplo `entregado` a `pendiente`) deben restringirse? Hoy el admin puede ir a cualquiera.
- [ ] ¿Se activa el video del producto (fase 2) en productos? Hoy `usaVideo:false`.
- [ ] ¿Ya corriste el SQL de checkout-envio-pago, libro de reclamaciones y pago automático en Supabase, y están los secrets `LIBRO_*` y llaves de pasarela en Railway? (ESTADO.md lo lista como pendiente heredado)
- [ ] ¿Es aceptable en producción el padrón SUNAT vía un tercero gratuito (tribio-padron-ruc), o se prevé un proveedor propio?
- [ ] ¿Habrá un asesor IA con perfil propio para productos o seguirá el genérico?
