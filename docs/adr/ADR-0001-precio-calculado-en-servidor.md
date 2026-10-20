# ADR-0001: El precio lo calcula el servidor; las promociones no reescriben productos

- **Estado:** aceptada
- **Fecha:** 2026-10-20
- **Decide:** Diego
- **Relacionadas:** [precio-en-servidor](../specs/precio-en-servidor/) · [campanas-descuento](../specs/campanas-descuento/spec.md) · [campanas-cuando](../specs/campanas-cuando/spec.md) (Q5, R5)

## Contexto

- En el rubro productos, el servidor acepta el precio y el descuento que manda el navegador al crear el pedido. Cualquiera puede pagar lo que quiera ("price tampering").
- Las campañas (Black Friday, Cyber Wow…) hoy solo cambian el aspecto. Una campaña real es un descuento: toda la tienda, categorías o productos seleccionados, o un cupón. Hacerlo editando cada producto es inviable y hay que deshacerlo al terminar.
- Las herramientas que reescriben precios y los restauran al final (apps de Shopify, plugins de WooCommerce) dejan la tienda con precios rotos si algo falla a mitad de camino.
- En Perú, Indecopi (precedente 186-2021/CCD) exige que el descuento se calcule sobre el precio ordinario vigente antes de la promoción.

## Decisión

1. **Una sola función de precio vigente en el servidor** (`precioVigente(producto, variante, contexto)`), pura y testeable. Es la única fuente del precio en el listado, la ficha, el carrito, el pago y el pedido.
2. **El servidor ignora los montos que manda el navegador**: recalcula el precio, los descuentos, el cupón y el envío desde sus datos.
3. **Las promociones de campaña se calculan al vuelo** con la campaña vigente (hora exacta de Lima). **Nunca se reescribe** el precio guardado de un producto, y al terminar no hay nada que restaurar.
4. **Sin acumulación sobre el mismo producto:** gana el mayor descuento entre `precioOferta` y las promociones. Los cupones y el envío gratis se combinan solo si la tienda lo permite.
5. **El precio se congela al empezar a pagar**, y cada línea del pedido guarda el precio, la promoción y el descuento aplicados (snapshot para soporte, devoluciones e Indecopi).
6. **El precio de referencia (tachado) es el precio regular guardado.** Se avisa si subió en los 30 días previos a la promoción.

## Consecuencias

- Se corrige el bug de seguridad, y cualquier promoción futura entra en un solo lugar.
- El fin de una promoción es exacto y no requiere ningún trabajo: la caché ya vence en el próximo cambio (campanas-cuando R3.9).
- Calcular al vuelo cuesta CPU en cada listado. Mitigación: función pura, campañas cargadas una vez por petición y caché pública que vence en el próximo cambio.
- La Tienda deja de ser fuente de verdad del precio: si muestra un precio viejo, el servidor manda. El pago avisa si el total cambió.
- Los rubros con reserva siguen fuera hasta tener su código promocional (reserva-hotel-mejoras H3).

## Alternativas descartadas

- **Reescribir los precios al empezar y restaurarlos al terminar** (Shopify con apps, WooCommerce): es frágil, deja precios rotos ante una falla y complica el historial de precios que exige Indecopi.
- **Descuento solo al pagar, sin precio tachado** (descuento automático nativo de Shopify): el cliente no ve la oferta en el catálogo y el tachado desaparece en el checkout.
- **Validar en el servidor el precio que manda el navegador, sin recalcularlo:** igual exige calcular el precio en el servidor, y agrega un camino más que mantener.
