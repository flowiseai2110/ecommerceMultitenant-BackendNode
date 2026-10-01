# Spec: checkout con envío por zonas, comprobante y paso de pago

> Estado: **implementado sin commit, pendiente de base de datos y verificación** (ver [tasks.md](tasks.md)).
> Diseño técnico: [plan.md](plan.md).
> Repos involucrados: BackendNode, FrontendAdmin, FrontendStore.

## Problema

El checkout de la tienda tenía cuatro huecos que en Perú cuestan ventas o generan problemas con el cliente:

1. **Métodos de pago invisibles.** El checkout cargaba todos los métodos activos pero solo usaba el primero (`metodos[0]`): el selector se perdió al pasar de 5 a 3 pasos (commit `5946db8`). Una tienda con Yape, Plin y transferencia solo mostraba Yape.
2. **Sin comprobante de pago.** En Perú el comercio debe entregar boleta o factura. El checkout no preguntaba cuál ni pedía DNI/RUC, y `pedidos.comprobante` existía pero nunca se llenaba.
3. **Envío siempre "por coordinar".** `costoEnvio` era siempre 0 y el costo se negociaba por WhatsApp. Por eso el total nunca era definitivo y no se podían mostrar los datos de pago con el monto exacto.
4. **"Domicilio" tratado como nacional.** Un cliente de Tacna podía elegir delivery a domicilio de una tienda con almacén en Lima, cuyo costo puede superar al producto. Además el backend **aceptaba el `costoEnvio` del navegador**, que cualquiera podía manipular.

## Investigación (cómo lo resuelven otros)

- **Shopify / WooCommerce:** la entrega local se define **por almacén** con un radio o una lista de códigos postales; fuera de esa área la opción no aparece. El envío nacional va por tarifas de zona ([Shopify local delivery](https://help.shopify.com/en/manual/fulfillment/setup/delivery-methods/local-delivery), [WooCommerce distance rate](https://woocommerce.com/document/woocommerce-distance-rate-shipping/limit-distance-rate-shipping-by-maximum-distance/)).
- **Tiendas peruanas:** a provincias se ofrece courier con dos precios, agencia o domicilio (Kabuki: S/ 9.90 / S/ 14.90; Krear 3D: Shalom agencia desde S/ 25, domicilio desde S/ 45). También se usa el pago en destino (el cliente paga el flete al recoger), la tarifa plana subsidiada (S/ 15–20 a provincias) y el envío gratis desde un monto (Kabuki: S/ 299). Fuentes: [kabuki.pe](https://www.kabuki.pe/envios-y-costos), [tiendakrear3d.com](https://www.tiendakrear3d.com/terminos/politicas-de-envios-lima-y-provincias/), [kom.pe](https://kom.pe/como-integrar-olva-courier-y-shalom-en-tu-tienda-virtual/).
- La cotización en tiempo real con la API del courier se justifica desde unos 50 pedidos al mes y exige el peso de cada producto. Con menos pedidos conviene usar tablas fijas.

## Objetivo

Que el comprador vea **en el checkout** cuánto cuesta el envío a su distrito y solo los métodos que llegan ahí. Que elija cómo pagar y tenga los datos para copiar, que pida boleta o factura con los datos correctos, y que el pedido llegue al vendedor con un **total definitivo calculado por el servidor**.

## Alcance

**Incluye**
- Selector de método de pago (corrección de la regresión).
- Comprobante: boleta (DNI/CE) o factura (RUC + razón social + dirección fiscal), con la regla de S/ 700 de SUNAT.
- Zonas de envío por método con tarifa fija, cobertura y pago en destino; cotización y recálculo en el servidor.
- Paso "Pago y comprobante" con los datos de pago para copiar (número de Yape/Plin, cuenta y CCI, monto).

**No incluye** (futuro)
- Pasarela de pago con tarjeta en el checkout (el backend ya tiene la integración con Culqi; falta conectar el frontend).
- Emisión electrónica del comprobante ante SUNAT (Nubefact u otro OSE/PSE).
- Autocompletar razón social y dirección desde el RUC (consulta SUNAT vía backend).
- Peso o volumen de productos en la tarifa; integración con la API del courier.
- Varios almacenes por tienda (el modelo lo permite: las zonas cuelgan del método).
- Ver el comprobante y las zonas en el detalle de pedido del admin; interruptor de `emiteFactura` en el admin.

## Requisitos

Formato: *Cuando [condición], el sistema debe [comportamiento].*

### R1 — Método de pago
- **R1.1** Cuando la tienda tiene más de un método de pago activo, el checkout debe mostrarlos todos para que el comprador elija; con uno solo, se muestra como texto.
- **R1.2** El pedido, el mensaje de WhatsApp y la confirmación deben usar el método elegido.

### R2 — Comprobante
- **R2.1** El checkout debe ofrecer boleta (preseleccionada) y, si la tienda emite facturas (`tiendas.emite_factura`), factura.
- **R2.2** Cuando el total es menor a S/ 700, la boleta no debe exigir documento (es opcional). Desde S/ 700 debe exigir DNI (8 dígitos) o CE.
  - Criterio: un pedido de S/ 750 con boleta sin DNI → 400 "Para boletas desde S/ 700 se requiere DNI o CE".
- **R2.3** La factura debe exigir RUC (11 dígitos, prefijo 10/15/17/20), razón social y dirección fiscal.
- **R2.4** Cuando la tienda no emite facturas, el backend debe rechazar una factura ("Esta tienda solo emite boletas").
- **R2.5** Los datos del comprobante se guardan como snapshot en el pedido (no en `clientes`) y van en el mensaje de WhatsApp.

### R3 — Zonas y tarifas de envío
- **R3.1** El dueño debe poder definir, por método de envío, zonas con nombre, costo, días de entrega y lugares (departamento, provincia, distrito o todo el país).
- **R3.2** Para un destino debe ganar la zona **más específica** (distrito > provincia > departamento > todo el país).
  - Criterio: zonas "Miraflores S/ 8" y "Lima Metropolitana S/ 12" → Miraflores cotiza S/ 8 y Carabayllo S/ 12.
- **R3.3** Cuando el destino no cae en ninguna zona, el método debe ocultarse (`fuera_de_zona = no_disponible`) o quedar por coordinar (`coordinar`, el valor por defecto).
  - Criterio: delivery propio desde Lima con "no ofrecer" → no aparece para Tacna; el courier con "Todo el país S/ 18" sí.
- **R3.4** Un método **sin zonas** debe comportarse como antes (por coordinar). Las tiendas que no configuren nada no cambian.
- **R3.5** Cuando el subtotal (menos descuento) alcanza `tiendas.envio_gratis_minimo`, el envío con tarifa debe ser gratis.
- **R3.6** Con pago en destino, el flete no suma al total y se muestra como referencia ("Pagas aprox. S/ 18 al recoger").
- **R3.7** El backend **debe calcular el costo de envío** al crear el pedido e ignorar el `costoEnvio` del body. Si el método no llega al distrito, debe rechazar el pedido.
- **R3.8** El checkout debe pedir el distrito primero ("¿Dónde recibes tu pedido?"), reutilizando la zona recordada de compras anteriores, y mostrar el precio de cada opción.

### R4 — Paso "Pago y comprobante"
- **R4.1** El checkout debe tener 4 pantallas: Tu pedido → Pago y comprobante → Confirmar → Pedido creado.
- **R4.2** Al elegir un método de pago, debe mostrarse su información con botón **Copiar** por dato (número, titular, banco, cuenta, CCI) y el QR si existe.
- **R4.3** Cuando el total es definitivo, debe mostrarse el **monto a pagar** con botón Copiar. Cuando el envío está por coordinar, el monto **no** se muestra y aparece un aviso para pagar después de confirmar el total con el vendedor.
- **R4.4** Contra entrega: "Pagas al recibir", sin datos. Tarjeta: "Pagarás con tarjeta al confirmar".
- **R4.5** La pantalla "Pedido creado" debe repetir los datos de pago con el monto definitivo y el número de pedido, también para copiar.
