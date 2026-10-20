# Spec: Campañas con promoción de precios (rediseño en 3 pasos y descuento real en productos)

> Estado: aprobado · Fecha: 2026-10-20 · Rubros: productos (esta fase). hotel, tours, eventos, locales y canchas: fase posterior (solo listado)
> Repos: Backend · Admin · Tienda
> Es el **R5** de [campanas-cuando](../campanas-cuando/spec.md), con el alcance aprobado por Diego el 2026-10-20 (rediseño de la campaña en 3 pasos + promoción en productos).
> **Decisiones de arquitectura aprobadas por Diego (2026-10-20), que esta spec no repite ni contradice:** [ADR-0001, el precio lo calcula el servidor y las promociones no reescriben productos](../../adr/ADR-0001-precio-calculado-en-servidor.md) y [ADR-0002, la campaña en tres pasos](../../adr/ADR-0002-campana-en-tres-pasos.md) (reemplaza "Campañas es el cuándo; Diseño es el cómo").
> Prerrequisito: [precio-en-servidor](../precio-en-servidor/) (el arquitecto la está planificando; ver R12). Relacionadas: [campanas-widgets](../campanas-widgets/spec.md), [reserva-hotel-mejoras](../reserva-hotel-mejoras/spec.md) (H3, pospuesto), [checkout-envio-pago](../checkout-envio-pago/).

## Por qué

1. **La campaña de hoy es solo un disfraz.** Cambia colores, portada y cinta, pero no cambia ningún precio. Un dueño que lanza "Black Friday -20 %" tiene que ir producto por producto bajando precios a mano el día de inicio, y subiéndolos de nuevo al terminar. Se olvida, se equivoca de hora, o deja un precio rebajado de más.
2. **La pantalla de Campañas no cuenta la historia completa.** Hoy "Campañas" decide el cuándo y "Diseño" el aspecto, y el dueño salta entre dos pantallas sin ver nunca la campaña completa. Con una promoción real hay un tercer dato (qué se rebaja y cuánto), y necesita un solo lugar donde ver y activar todo.
3. **Prometer un descuento que no existe es un riesgo legal.** Hoy el sistema solo *avisa* si la portada dice "30 %" (R8.7 de campanas-cuando). Con la promoción real, la portada, el precio tachado y lo que se cobra deben coincidir siempre, y cumplir lo que exige Indecopi (precedente vinculante 186-2021/CCD): el descuento se calcula sobre el precio ordinario, no sobre uno inflado.

Esta spec cambia la pantalla de la campaña a **tres pasos (Cuándo, Cómo se verá, Promoción)** y agrega el **paso 3** para tiendas de **productos**. Los rubros con reserva quedan para una fase posterior.

## Contexto: cómo funciona hoy (verificado en el código el 2026-10-20)

- Una campaña vive dentro del diseño de la tienda (clave `campanas`), con su interruptor "activa", fechas, horas, aspecto (paleta, portada, cinta, adornos, efecto) y, en rubros con reserva, fechas de uso. **No cambia precios** (campanas-cuando, "Contexto").
- En Admin › Campañas se abre una campaña como panel debajo de su fila: un Guardar por campaña, Descartar, y el enlace "Editar cómo se ve" que lleva a Diseño en modo campaña.
- Un producto tiene `precioBase` y un `precioOferta` opcional que escribe el dueño a mano (solo del producto, no de la variante). El módulo de **cupones** existe solo en productos (PRO-18): porcentaje o monto fijo, con vigencia, usos y mínimo de compra.
- **El navegador manda el precio y el descuento al crear el pedido, y el servidor los acepta sin recalcular** (`productos.md`, "Riesgos de reglas"). Es el bug que corrige `precio-en-servidor`.
- El envío gratis se decide con `subtotal - descuento >= envio_gratis_minimo` (PRO-12).
- Cada línea del pedido guarda hoy `precioUnitario` y `descuento`; no guarda de qué campaña vino.
- Una sola campaña es la "visible" a la vez (mayor prioridad y, si empatan, ventana más corta); los cruces entre campañas del catálogo con fechas oficiales están permitidos, y los cruces con fechas de la tienda están prohibidos (R8.5 de campanas-cuando).

## Conceptos

- **Precio regular:** el precio normal del producto (o de la variante) sin ninguna promoción: hoy, `precioBase`. Es el que se tacha y sobre el que se calcula el porcentaje (R10).
- **Precio vigente:** lo que realmente cuesta *hoy* y lo que se cobra. Es el menor entre el regular, la oferta del producto y la promoción de campaña (R5.3).
- **Promoción de la campaña:** el descuento por porcentaje que el dueño agrega a una campaña en el paso 3, sobre un alcance (toda la tienda, categorías o productos).
- **Alcance:** a qué productos llega la promoción.
- **Ventana de la promoción:** la misma de la campaña (inicio y fin con hora, ya existen). No hay un segundo calendario.
- **Congelar el precio:** desde que el cliente empieza a pagar, el precio que vio queda reservado un tiempo, aunque la campaña termine (R8.4).

## Rubros: dónde aplica y cómo

| Rubro | ¿Aplica? | Cómo se comporta | Regla de negocio que lo condiciona (`docs/rubros/<rubro>.md`) |
|---|---|---|---|
| productos | **Sí** (R1 a R10) | Rediseño en 3 pasos y paso 3 con promoción por porcentaje. El servidor calcula el precio vigente al vuelo; no reescribe precios de productos. | PRO-01 (precio base obligatorio), PRO-09 y PRO-12 (envío y envío gratis), PRO-18 (cupones), PRO-07 (el pedido bloquea stock). Riesgo abierto "precios confiados al navegador": se cierra en `precio-en-servidor`, que es prerrequisito. |
| hotel | R1 y R2 sí (los 3 pasos, **sin paso 3**). Promoción: fase posterior | El paso 3 no se muestra. La campaña sigue siendo el aspecto, las fechas y las fechas de uso. | H-07, H-11, H-21 (precio por noche). Depende del código promocional de reservas (`reserva-hotel-mejoras` H3, pospuesto). |
| tours | R1 y R2 sí, sin paso 3. Promoción: posterior | Igual que hotel. | T-01, T-02 (sin cupo por salida), T-07. |
| eventos | R1 y R2 sí, sin paso 3. Promoción: posterior | Igual que hotel. | EV-05, EV-06. |
| locales | R1 y R2 sí, sin paso 3. Promoción: posterior | Igual que hotel. El cupón de locales sigue pendiente (L1.3). | LOC-03, LOC-07 (la cotización congela el precio 7 días). |
| canchas | R1 y R2 sí, sin paso 3. Promoción: posterior | Igual que hotel. | CAN-03, CAN-04, CAN-05 (tarifa día y noche, bloques de 30 min). |

Revisión de los `docs/rubros/*.md`: `productos.md` (revisado el 2026-10-18) está al día para esta fase. Los de reserva no se ven afectados salvo por el rediseño de los pasos 1 y 2, que ya viven en campanas-cuando. **Antes de especificar la promoción para rubros con reserva** hay que llamar a `analista-hotel`, `analista-locales` y los demás. Tras desplegar `precio-en-servidor` conviene que `analista-productos` actualice `productos.md` (PRO-25 en adelante).

## Cómo dividirlo (propuesta)

El requerimiento es grande y toca precios y pagos. Se parte en piezas que se construyen, prueban y despliegan de a una. La numeración es de esta spec (C1…C7), no de campanas-cuando.

| Pieza | Qué es | Depende de |
|---|---|---|
| C1 | Rediseño en 3 pasos: estados, CTA único, cambio del aviso R8.7 (R1, R2, R3). Sin promoción: el paso 3 existe solo cuando la pieza C4 lo habilite | nada (puede ir primero) |
| C2 | **Historial del precio regular** (R10.4). Es la que tiene plazo: el aviso de 30 días solo sirve cuando ya hay 30 días de datos, así que conviene **empezar a registrar cuanto antes** | `precio-en-servidor` (misma función de precio) |
| C3 | Promoción en el servidor: alcance, porcentaje, precio vigente al vuelo, mayor descuento (R4 solo datos, R5) | `precio-en-servidor` desplegado |
| C4 | Paso 3 en el Admin: alcance en lote, porcentaje, cupón, avisos y confirmación (R4, R7.4, R9, R10) | C1, C3 |
| C5 | Tienda: precio tachado consistente, condiciones visibles y aviso de cambio de precio (R6) | C3 |
| C6 | Carrito, pago y pedido: recálculo, congelado, campaña en cada línea (R7, R8) | C3, C5 |
| C7 | Cupones y envío gratis con promoción (R7) | C6 |

Orden sugerido: C1 y C2 primero (no dependen de la promoción), luego C3, C5/C6 y C4, y C7 al final. El arquitecto confirma.

## Requisitos

### R1. La campaña en tres pasos (Admin › Campañas)

- R1.1 Al abrir una campaña, el dueño ve **tres pasos en este orden**: **1. Cuándo**, **2. Cómo se verá**, **3. Promoción**. Es la forma de ver y editar una campaña completa en un solo lugar.
- R1.2 **Paso 1, Cuándo:** lo que ya existe, sin cambiar sus reglas: fechas oficiales o "Mis fechas" (R2.9 de campanas-cuando), días antes y después, horas de inicio y fin, fechas de uso (solo rubros con reserva).
- R1.3 **Paso 2, Cómo se verá:** una **vista previa** de la campaña y un botón **"Editar aspecto"** que abre el editor en vivo de Diseño en modo campaña. **No se duplica el editor**: el aspecto (paleta, portada, cinta, adornos, efecto, saludo) se sigue editando solo en Diseño. Al terminar, el dueño vuelve a la campaña en el mismo paso.
- R1.4 **Paso 3, Promoción:** opcional. Solo existe en tiendas con carrito (productos en esta fase; ver R11). En las demás tiendas el paso **no se muestra** y la campaña tiene dos pasos.
- R1.5 **La campaña es el centro; Diseño es la herramienta de su aspecto** ([ADR-0002](../../adr/ADR-0002-campana-en-tres-pasos.md), que reemplaza "Campañas es el cuándo; Diseño es el cómo"). El selector de campañas de Diseño se mantiene para llegar directo al editor. Todo dato de la campaña (cuándo, aspecto, promoción) se ve y se resume en Campañas; el editor de Diseño se usa solo para dibujar el aspecto.
- R1.6 **Un dato, un lugar.** La promoción se edita solo en el paso 3. En Diseño no hay campos de promoción (igual que no hay de fechas ni de uso).
- R1.7 **Mismo patrón de guardado de Campañas:** guardar junto a lo editado, sin barra fija. El detalle de cómo se combina con el interruptor de la fila lo resuelve el diseñador (R2.5).

### R2. Estado de cada paso y un solo CTA

- R2.1 Cada paso muestra **su estado en una línea**, visible aunque el paso esté cerrado:
  - Paso 1: "Pendiente" si falta algo, o "Listo: 27–30 nov" (el rango con horas si las hay: "Listo: 27 nov 10:00 – 30 nov, medianoche").
  - Paso 2: "Del catálogo" si no se cambió nada, o "Personalizado" si se editó el aspecto.
  - Paso 3: "Sin promoción", o la promoción en una frase: "−20 % en Zapatillas", "−15 % en toda la tienda", "−10 % en 3 categorías", "−25 % en 12 productos".
- R2.2 Hay **un solo CTA principal**: **"Activar campaña"**. Está **habilitado cuando el paso 1 está listo**; los pasos 2 y 3 no lo bloquean (son opcionales).
- R2.3 Si el paso 3 tiene una promoción **sin confirmar**, "Activar campaña" abre la confirmación del dueño (R9) en lugar de activar directo. Si el paso 3 está vacío, activa la campaña como hoy (solo visual).
- R2.4 Con la campaña activa, el CTA pasa a guardar los cambios pendientes (el texto exacto lo define el diseñador). Un cambio en la promoción o en las fechas de una campaña con promoción confirmada pide **confirmar de nuevo** (R9.5).
- R2.5 **El interruptor de la fila** (activar al instante, como hoy) **no puede saltarse la confirmación**: si la campaña tiene una promoción sin confirmar, encender el interruptor lleva a la confirmación y, si el dueño la cancela, la campaña **no queda encendida**.
- R2.6 La campaña activa sin pasos 2 o 3 completos sigue funcionando: el aspecto toma el del catálogo y la promoción simplemente no existe.

### R3. Validaciones y avisos de la campaña

- R3.1 Se **mantienen** todas las validaciones R8.1 a R8.5 y R8.8 de campanas-cuando (bloquean: campaña vencida, a más de un año, uso incoherente, cruces; avisan: color ilegible).
- R3.2 **Cambia el aviso R8.7 (descuento prometido).** En una tienda con paso 3, avisa **si la portada, el anuncio, la cinta, la cuenta regresiva o un sello prometen un descuento y la campaña no tiene una promoción (paso 3 vacío)**: "Tu portada promete un descuento pero esta campaña no tiene promoción. Agrégala en el paso 3 o quita el texto." Sigue siendo un aviso (no bloquea) y vive en Diseño (modo campaña) y en el paso 2.
- R3.3 **Aviso nuevo, de coincidencia:** si el texto promete un **porcentaje distinto** del de la promoción ("30 %" en la portada y la promoción es de 20 %), avisa con los dos números. No bloquea.
- R3.4 En tiendas **sin paso 3** (rubros con reserva) el aviso de R8.7 se queda como hoy: "Tu campaña no cambia precios…".
- R3.5 Como en R8 de campanas-cuando, al guardar solo se revisan las campañas que cambian.

### R4. Promoción: alcance y porcentaje (paso 3, productos)

- R4.1 La promoción es un **descuento por porcentaje** sobre el precio regular. No hay monto fijo, "2x1" ni compra mínima en esta fase.
- R4.2 **Porcentaje:** un número entero de 1 a 90 (propuesta, Q7). Desde 50 % la confirmación (R9) lo marca como descuento muy alto y pide que el dueño lo verifique.
- R4.3 **Alcance**, a elegir **uno**:
  - R4.3.1 **Toda la tienda:** todos los productos activos, también los que se creen después.
  - R4.3.2 **Categorías:** una o varias. Entran los productos de esas categorías (incluidos los que se agreguen después). Si una categoría tiene subcategorías, entran también (propuesta, Q6).
  - R4.3.3 **Productos seleccionados:** una lista fija. Los productos que se creen después **no** entran solos.
- R4.4 **Selección en lote, nunca de uno en uno.** Para "productos seleccionados" el dueño puede buscar y filtrar (por categoría, por nombre), marcar varios a la vez, "seleccionar todos los resultados" y quitar varios a la vez. No existe un flujo que obligue a abrir cada producto.
- R4.5 Productos **inactivos o sin stock** no dejan de pertenecer al alcance, pero **no se muestran** (ya no se muestran hoy) y no se cuentan en la confirmación.
- R4.6 El paso 3 muestra siempre **un ejemplo calculado** ("Un producto de S/ 100 pasa a S/ 80") y **cuántos productos** entran hoy en el alcance.
- R4.7 Una campaña tiene **una** promoción (un porcentaje y un alcance). Para dos porcentajes distintos, dos campañas (que no se pueden cruzar si tienen fechas de la tienda, R8.5).
- R4.8 **Cupón de la campaña (opcional):** el dueño puede crear, en el mismo paso, un cupón con código propio (tipo y valor de los cupones existentes: porcentaje o monto fijo; con límite de usos y mínimo de compra opcionales). **Vence con la campaña**: solo vale dentro de su ventana, y el servidor lo rechaza fuera de ella aunque la tienda muestre un dato viejo. El cupón aparece en la lista de Cupones marcado "de la campaña {nombre}" y no se edita ahí. Sus reglas de combinación están en R7.
- R4.9 **Sentido común:** el precio vigente **nunca es menor a S/ 0,01**. La confirmación **avisa** cuántos productos quedarían por debajo de su costo (`precioCosto`), sin bloquear.

### R5. El servidor calcula el precio vigente al vuelo

- R5.1 **No se reescribe ningún precio de producto.** El precio guardado del producto (`precioBase`, `precioOferta`, precio de variante) **no cambia** cuando empieza o termina la promoción. No hay nada que restaurar al terminar.
- R5.2 La promoción rige **solo dentro de la ventana de la campaña** (inicio y fin con hora, hora de Lima), con la misma exactitud de las horas frontera de campanas-cuando (R3.4, R3.9): a la hora de fin, el precio vuelve solo. **Quien decide es el servidor**, nunca la caché de la tienda ni el navegador.
- R5.3 **No se suma sobre el mismo producto: gana el mayor descuento.** El precio vigente es el menor entre el precio regular, el `precioOferta` del producto y el precio con la promoción de la campaña. Los descuentos no se acumulan entre sí. Ejemplo: regular S/ 100, oferta S/ 85, promoción -20 % (S/ 80): gana la promoción (S/ 80). Con oferta S/ 70: gana la oferta (S/ 70).
- R5.4 Si en la ventana hay **más de una campaña con promoción** (cruces permitidos del catálogo, p. ej. Black Friday y Cyber Monday), se aplican por producto la que da el **mayor descuento**; en un empate, la campaña que el resolver de campañas prefiere (R3.10 de campanas-cuando). (Propuesta, Q10.)
- R5.5 El porcentaje se aplica sobre el **precio regular de la variante elegida** si el producto tiene variantes (cada variante tiene su precio). Redondeo al céntimo, el mismo en todo el sistema (lo fija `precio-en-servidor`).
- R5.6 La promoción **entra por la función única de precio vigente** de `precio-en-servidor`. Ninguna otra parte del sistema calcula precios por su cuenta (R6.1).
- R5.7 Solo cuentan promociones **confirmadas** por el dueño (R9). Una campaña activa con promoción sin confirmar es solo visual y no cambia precios.

### R6. Precio consistente en toda la tienda

- R6.1 **Un mismo precio en todos los lugares.** Todo lugar que muestre o use un precio toma el precio vigente de la misma función del servidor: listado y categorías, ficha de producto, carrito, mini carrito, pago, resumen del pedido, seguimiento del pedido, el buscador y los filtros y orden por precio, el asesor IA de la tienda y el mensaje de WhatsApp del pedido. El arquitecto enumera los lugares reales; este requisito obliga a que ninguno quede con el precio viejo.
- R6.2 **Precio tachado:** donde hay descuento (de campaña o por oferta del producto) se muestra el **precio regular tachado**, el **precio vigente** y la etiqueta con el porcentaje ("−20 %"), de la misma forma en listado, ficha, carrito y pago.
- R6.3 El porcentaje de la etiqueta se calcula sobre el **precio regular** y se redondea al entero más cercano; si el descuento ganador es la oferta del producto, la etiqueta dice el porcentaje de esa oferta.
- R6.4 **El precio anunciado es el final.** El precio que se muestra (con los impuestos que la tienda ya incluye en sus precios) es el que se paga por el producto. El envío se informa aparte, antes de pagar, como hoy (PRO-09).
- R6.5 **Condiciones visibles.** En ficha, carrito y pago, donde hay un precio de campaña, el cliente puede leer sin salir de la pantalla las condiciones, armadas solas desde la configuración: nombre de la campaña, porcentaje sobre el precio regular, **hasta cuándo** vale (con hora), a qué productos o categorías llega, y si se combina o no con cupones y envío gratis (R7). En el listado alcanza la etiqueta, con las condiciones al alcance de un toque o en el bloque de la campaña. La forma exacta la define el diseñador.
- R6.6 **Cambio de precio visible.** Si el carrito se recalcula y el precio de una línea sube o baja porque la promoción empezó o terminó, el cliente lo ve **antes de pagar** ("El precio de Zapatillas cambió: la promoción terminó"). Un dato de caché de hasta cinco minutos puede mostrar un precio viejo en el listado, pero **nunca se cobra distinto de lo que muestra el pago**.
- R6.7 Cuando la promoción termina, las etiquetas y los precios tachados desaparecen solos, sin intervención del dueño.

### R7. Cupones y envío gratis

- R7.1 **Por defecto, no se combinan.** Con una promoción de campaña en una línea, los **cupones** y el **envío gratis por mínimo de compra** se comportan según los dos permisos de la promoción (R7.2). Ambos vienen **apagados**: un dueño que no los toca no regala margen sin saberlo. (Q1.)
- R7.2 En el paso 3 hay dos permisos, uno por campaña, que el dueño puede encender:
  - **"Permitir cupones sobre productos en promoción".**
  - **"Permitir envío gratis en pedidos con productos en promoción".**
- R7.3 **Efecto de cada permiso apagado:**
  - Cupones: un cupón de la tienda se calcula **solo sobre las líneas sin descuento de campaña** (sus mínimos y límites se miden sobre esas líneas). Si el pedido no tiene ninguna, el cupón se rechaza con un mensaje claro.
  - Envío gratis: un pedido con **al menos una línea con descuento de campaña** no recibe envío gratis por mínimo de compra (PRO-12), aunque llegue al mínimo. `recojo_tienda` sigue siendo gratis (PRO-12).
- R7.4 **Con el permiso encendido,** el cupón se calcula sobre el precio ya rebajado y el mínimo de envío gratis se mide sobre lo que el cliente paga (`subtotal - descuento`, como hoy). La confirmación del dueño (R9) muestra el ejemplo combinado.
- R7.5 **El cupón de la campaña (R4.8) también es un cupón**: se rige por los mismos permisos. Si el dueño crea ese cupón con "Permitir cupones…" apagado, el paso 3 le **avisa** que el cupón solo valdrá en productos sin promoción (Q5).
- R7.6 El carrito y el pago dejan claro **cuándo no se puede usar** un cupón o el envío gratis por haber productos en promoción, con el mismo mensaje en ambos lugares.

### R8. Carrito, pago y pedido

- R8.1 **El servidor recalcula en cada cambio del carrito** (agregar, quitar, cambiar cantidad, aplicar un cupón, cambiar el envío) y devuelve los precios vigentes. El precio que manda el navegador **no se usa**.
- R8.2 Al **crear el pedido** el servidor vuelve a calcular todo con sus propios datos; si el precio difiere del que vio el cliente, el pedido no se crea sin que el cliente vea el nuevo (R6.6).
- R8.3 **Cada línea del pedido guarda:** precio regular, precio cobrado, descuento aplicado, y **de dónde vino** el descuento: el nombre y el identificador de la campaña, o "oferta del producto", o ninguno. El pedido guarda además el cupón aplicado, como hoy. Lo ve el dueño en la ficha del pedido (para soporte, devoluciones y cuentas) y el cliente en su seguimiento.
- R8.4 **El precio se congela al empezar a pagar.** Cuando el cliente entra al paso de pago, el servidor reserva los precios vigentes de su carrito por **15 minutos** (propuesta, Q4). Si la campaña termina durante ese lapso, el pedido se crea con el precio que el cliente vio. Pasado el lapso, se recalcula y se avisa el cambio (R6.6).
- R8.5 Un pedido **ya creado** nunca cambia de precio, aunque la campaña se apague o se edite después.
- R8.6 **Apagar la campaña a mano** (o corregir sus fechas) corta la promoción en el siguiente cálculo del servidor; los pedidos ya creados y los precios congelados (R8.4) se respetan.
- R8.7 Pedidos con **pago automático** (tarjeta/Yape): el monto que se cobra sale del `pedido.total` guardado en el servidor, como hoy (PRO-20), que ya incluye la promoción congelada.

### R9. Confirmación explícita del dueño

- R9.1 **Activar una promoción cambia lo que se cobra, así que el dueño la confirma de forma explícita.** Sin confirmar, la campaña se puede activar como solo visual (R5.7).
- R9.2 La confirmación es un diálogo único, con estos datos en lenguaje del negocio: el porcentaje, el alcance y **cuántos productos** entran; el **desde y el hasta**, con hora y día de la semana; un **ejemplo** de precio ("S/ 100 pasa a S/ 80"); las reglas de combinación (R7); el aviso de que **los precios de sus productos no se modifican** y vuelven solos; y los avisos de R4.2, R4.9 y R10.2 si corresponden.
- R9.3 El dueño confirma con una acción explícita (por ejemplo, un botón "Sí, aplicar -20 %" o una casilla que debe marcar). Cerrar el diálogo equivale a no confirmar.
- R9.4 Queda registrado **quién confirmó, cuándo y qué** (porcentaje, alcance, ventana, permisos).
- R9.5 **Se vuelve a confirmar** cuando cambia cualquier dato que cambia lo que se cobra o cuándo: porcentaje, alcance, permisos, cupón, o las fechas y horas de una campaña con promoción confirmada.
- R9.6 **Campañas que se repiten.** Una campaña del catálogo se repite cada año o en varias ediciones (Cyber Wow tiene tres). La confirmación vale **solo para la ventana en que se confirmó** (esa edición de ese año). En la siguiente ventana la campaña se ve sola, pero la **promoción no se aplica hasta que el dueño la confirme de nuevo**, y el Admin se lo recuerda con anticipación en Campañas. (Propuesta, Q2.)

### R10. Cumplimiento Indecopi

Base: precedente de observancia obligatoria 186-2021/CCD del Indecopi, tal como lo recogió Diego. Esta spec no es asesoría legal (Q8).

- R10.1 **El descuento se calcula sobre el precio ordinario vigente antes de la promoción** (el precio regular). Nunca sobre un precio subido para la ocasión. El precio tachado y el porcentaje de la etiqueta salen de ese precio regular.
- R10.2 **Aviso por alza reciente.** Al confirmar (R9), el sistema revisa, para los productos del alcance, si su **precio regular subió en los 30 días anteriores al inicio** de la ventana. Si es así, la confirmación **avisa** cuántos productos y cuáles (lista corta con enlace a la lista completa) y recomienda ponerlos fuera del alcance o esperar. Es un aviso: no bloquea, pero el dueño debe verlo antes de confirmar.
- R10.3 El mismo aviso aparece en la ficha del producto cuando el dueño **sube el precio regular de un producto que está en una promoción programada** ("Esta subida cae en los 30 días previos a la promoción {campaña}").
- R10.4 **Historial del precio regular.** El sistema registra cada cambio del precio regular (de producto y de variante) con fecha, valor anterior y nuevo, y quién lo hizo. Sin historial no hay aviso confiable. Mientras un producto no tenga 30 días de historial registrado, la confirmación lo dice ("Aún no tenemos 30 días de historial de este producto") en vez de callar. Cómo se guarda lo decide el arquitecto.
- R10.5 **No se puede subir el precio regular de un producto mientras una promoción lo cubre y está en curso** (propuesta, Q3). El dueño recibe el mensaje "Este producto está en la promoción {campaña} hasta el {fecha}. Para cambiar su precio regular, apaga la promoción o espera a que termine." Bajarlo sí se permite. Editar otros datos del producto no se afecta.
- R10.6 **El precio anunciado es el final** (R6.4) y **las condiciones son visibles** (R6.5).
- R10.7 Un producto que **ya tiene `precioOferta`** sigue siendo calculado contra el precio regular (R5.3): el `precioOferta` no se toma como "precio ordinario". La confirmación **avisa** cuántos productos del alcance ya tienen una oferta propia (por si la oferta es permanente, lo que Indecopi cuestiona).

### R11. Rubros con reserva (solo listado)

- R11.1 En esta fase **ningún rubro con reserva tiene paso 3 ni promoción**. El API **rechaza** una promoción en una tienda sin carrito con el mensaje "Esta tienda no usa promociones de precio". Se pregunta por la **capacidad** (la tienda vende con carrito), nunca por el nombre del rubro.
- R11.2 Quedan para una **fase posterior**, con su propia spec y los analistas de cada rubro: hotel (precio por noche, estadía completa dentro de la ventana de uso), tours, eventos, locales y canchas. Dependen del **código promocional de las reservas** (`reserva-hotel-mejoras` H3, pospuesto) y del criterio de campanas-cuando R1.8 y R5.3.
- R11.3 Los pasos 1 y 2 (R1 a R3) sí aplican a todos los rubros.

### R12. Prerrequisito y orden de construcción

- R12.1 **No se construye ninguna parte de la promoción (C3 en adelante) hasta que `precio-en-servidor` esté en producción.** Hoy el servidor confía en el precio del navegador: una promoción sobre esa base se podría esquivar.
- R12.2 La promoción **se enchufa en la función única de precio vigente** de `precio-en-servidor`. Si esa función no existe aún, el arquitecto de esta spec la espera, no la duplica.
- R12.3 Las piezas C1 (rediseño de pasos) y C2 (historial de precios) no dependen de la promoción y pueden ir antes (ver "Cómo dividirlo").

## Criterios de aceptación

Formato: **Dado** … **cuando** … **entonces** … (el QA los prueba tal cual). Hora de Lima. Precios en soles. Ejemplo: Black Friday 2026, ventana del 20 al 30 nov (fechas de ejemplo).

### R1 y R2: los tres pasos, estados y CTA

- CA-1.1 (R1.1, R1.4, productos): Dado una tienda de productos, cuando el dueño abre una campaña en Admin › Campañas, entonces ve tres pasos en el orden Cuándo, Cómo se verá, Promoción.
- CA-1.2 (R1.4, R11.1, hotel): Dado una tienda de hotel, cuando abre una campaña, entonces ve dos pasos (Cuándo y Cómo se verá) y no existe el paso Promoción. Lo mismo en tours, eventos, locales y canchas.
- CA-1.3 (R1.3, productos): Dado el paso 2, cuando pulsa "Editar aspecto", entonces se abre el editor en vivo de Diseño en modo campaña de esa campaña; y al terminar vuelve a la campaña en el paso 2. Diseño no contiene campos de fechas, de uso ni de promoción.
- CA-2.1 (R2.1, productos): Dado una campaña con fechas del 27 al 30 nov, sin cambios de aspecto y sin promoción, cuando el dueño ve la campaña, entonces los pasos dicen "Listo: 27–30 nov", "Del catálogo" y "Sin promoción".
- CA-2.2 (R2.1, productos): Dado el aspecto editado y una promoción de 20 % sobre la categoría Zapatillas, cuando ve los pasos, entonces dicen "Personalizado" y "−20 % en Zapatillas". Con tres categorías dice "−20 % en 3 categorías"; con 12 productos, "−20 % en 12 productos"; con toda la tienda, "−20 % en toda la tienda".
- CA-2.3 (R2.2, productos): Dado una campaña propia sin fecha de fin, cuando el dueño la ve, entonces el paso 1 dice "Pendiente" y "Activar campaña" está deshabilitado; al completar las fechas se habilita, aunque los pasos 2 y 3 estén sin tocar.
- CA-2.4 (R2.3, productos): Dado una promoción de 20 % sin confirmar, cuando el dueño pulsa "Activar campaña", entonces se abre la confirmación (R9) y la campaña no se activa hasta que confirme. Dado el paso 3 vacío, cuando pulsa "Activar campaña", entonces se activa directo, solo visual.
- CA-2.5 (R2.5, productos): Dado una campaña con promoción sin confirmar, cuando el dueño enciende el interruptor de su fila, entonces se abre la confirmación; si la cancela, la campaña sigue apagada.

### R3: validaciones y avisos

- CA-3.1 (R3.1, productos): Dado una campaña activa que ya terminó (año equivocado), cuando el dueño intenta guardarla, entonces se rechaza con el mensaje de R8.1 de campanas-cuando (las validaciones de campanas-cuando se mantienen).
- CA-3.2 (R3.2, productos): Dado una portada con el texto "30 % de descuento" y el paso 3 vacío, cuando el dueño abre el paso 2 o Diseño en modo campaña, entonces ve el aviso "promete un descuento pero esta campaña no tiene promoción"; guardar sigue permitido.
- CA-3.3 (R3.2, productos): Dado el mismo texto y una promoción confirmada de 30 %, cuando abre el paso 2, entonces no ve ese aviso.
- CA-3.4 (R3.3, productos): Dado el texto "30 %" y una promoción de 20 %, cuando abre el paso 2, entonces ve un aviso que menciona 30 % y 20 %.
- CA-3.5 (R3.4, hotel): Dado una tienda de hotel con "descuento" en la portada, cuando el dueño abre el paso 2, entonces ve el aviso de hoy "Tu campaña no cambia precios…".

### R4: alcance y porcentaje

- CA-4.1 (R4.2, productos): Dado el paso 3, cuando el dueño ingresa 0, 91, 12,5 o texto, entonces no se acepta; con 1 y con 90 sí. Con 50 o más la confirmación marca "descuento muy alto".
- CA-4.2 (R4.3.1, productos): Dado "Toda la tienda" al 20 % y un producto nuevo creado después de activar, cuando el cliente lo ve dentro de la ventana, entonces tiene el 20 %.
- CA-4.3 (R4.3.2, productos): Dado la categoría Zapatillas con subcategoría Running al 20 %, cuando el cliente ve un producto de Running, entonces tiene el 20 %; uno de Camisas, no.
- CA-4.4 (R4.3.3, productos): Dado 12 productos seleccionados, cuando se crea un producto nuevo de la misma categoría, entonces no tiene descuento.
- CA-4.5 (R4.4, productos): Dado la selección de productos, cuando el dueño filtra por la categoría Zapatillas (40 resultados) y pulsa "seleccionar todos los resultados", entonces los 40 quedan seleccionados en una acción, y puede quitar varios a la vez.
- CA-4.6 (R4.6, productos): Dado el paso 3 con 20 % y la categoría Zapatillas, cuando el dueño lo ve, entonces dice cuántos productos entran hoy y muestra "Un producto de S/ 100 pasa a S/ 80".
- CA-4.7 (R4.8, productos): Dado un cupón de la campaña CYBER10 creado en el paso 3, cuando se consulta el 1 dic (la campaña terminó el 30 nov), entonces el servidor lo rechaza aunque la tienda tenga datos viejos; y en la lista de Cupones aparece como "de la campaña Black Friday".
- CA-4.8 (R4.9, productos): Dado un producto de S/ 100 con costo S/ 85 y la promoción de 20 %, cuando el dueño abre la confirmación, entonces ve el aviso "1 producto quedaría por debajo de su costo"; no bloquea.

### R5: precio vigente en el servidor

- CA-5.1 (R5.1, productos): Dado Zapatillas a S/ 100 y la promoción de 20 % activa, cuando se consulta el precio guardado del producto, entonces sigue siendo S/ 100 (`precioBase`), antes, durante y después de la ventana.
- CA-5.2 (R5.2, productos): Dado la promoción con ventana del 20 nov 00:00 al 30 nov 23:59:59, cuando se consulta el precio el 19 nov 23:59, entonces es S/ 100; el 20 nov 00:00, S/ 80; el 30 nov 23:59, S/ 80; el 1 dic 00:00, S/ 100.
- CA-5.3 (R5.3, productos): Dado regular S/ 100, `precioOferta` S/ 85 y promoción de 20 %, cuando se calcula el precio vigente, entonces es S/ 80. Con `precioOferta` S/ 70, es S/ 70. En ambos casos el precio tachado es S/ 100.
- CA-5.4 (R5.3, productos): Dado un producto sin oferta y sin promoción, cuando se calcula, entonces es el precio regular, sin tachado.
- CA-5.5 (R5.4, productos): Dado Black Friday con 20 % y Cyber Monday con 15 % cruzadas el 30 nov, cuando se calcula el 30 nov, entonces gana el 20 % (el mayor descuento); el 29 nov también.
- CA-5.6 (R5.5, productos): Dado un producto con una variante de S/ 150, cuando se calcula con 20 %, entonces esa variante cuesta S/ 120; y un precio de S/ 19,99 con 20 % queda en S/ 15,99.
- CA-5.7 (R5.7, productos): Dado una campaña activa con promoción sin confirmar, cuando se consulta el precio de un producto del alcance, entonces es el precio regular.
- CA-5.8 (R5.2, productos): Dado el dueño que apaga la campaña a las 12:00, cuando el cliente pide el carrito a las 12:00:30, entonces el servidor calcula sin la promoción (una página con caché puede mostrar el precio viejo hasta 5 minutos, pero lo que se cobra es el real).

### R6: consistencia en la tienda

- CA-6.1 (R6.1, R6.2, productos): Dado Zapatillas con 20 %, cuando el cliente la ve en el listado, la ficha, el carrito, el mini carrito y el pago, entonces en todos aparece S/ 100 tachado, S/ 80 y la etiqueta "−20 %".
- CA-6.2 (R6.1, productos): Dado la promoción activa, cuando el cliente busca, ordena por precio, filtra por rango de precio, o consulta al asesor IA, entonces todos usan S/ 80 y no S/ 100.
- CA-6.3 (R6.5, productos): Dado un precio de campaña en la ficha, el carrito y el pago, cuando el cliente busca las condiciones, entonces las ve sin salir de la pantalla: nombre de la campaña, 20 % sobre el precio regular, "hasta el lun 30 nov, 23:59", alcance, y si se combina con cupones y envío gratis.
- CA-6.4 (R6.4, productos): Dado el precio S/ 80, cuando el cliente llega al pago, entonces el producto cuesta S/ 80 (el mismo que anunció la ficha) y el envío se informa aparte antes de pagar.
- CA-6.5 (R6.6, productos): Dado un cliente con Zapatillas en el carrito a S/ 80 y la promoción que termina a las 22:00, cuando a las 22:01 cambia la cantidad en el carrito, entonces el carrito se recalcula a S/ 100 y muestra "El precio de Zapatillas cambió: la promoción terminó".
- CA-6.6 (R6.7, productos): Dado el 1 dic 00:00:01, cuando el cliente abre el listado, entonces no hay etiquetas ni tachados de la campaña (con la caché al día).

### R7: cupones y envío gratis

- CA-7.1 (R7.1, productos): Dado una promoción nueva, cuando el dueño abre el paso 3, entonces los dos permisos ("Permitir cupones…" y "Permitir envío gratis…") están apagados.
- CA-7.2 (R7.3, productos): Dado permisos apagados y un carrito con Zapatillas (promoción, S/ 160) y una Camisa sin descuento (S/ 50), cuando el cliente aplica un cupón de 10 % de la tienda, entonces el descuento es sobre la camisa solamente (S/ 5).
- CA-7.3 (R7.3, productos): Dado permisos apagados y un carrito con solo productos en promoción, cuando aplica un cupón de la tienda, entonces se rechaza con un mensaje que explica que no se combina con productos en promoción.
- CA-7.4 (R7.3, productos): Dado el envío gratis desde S/ 150, un carrito de S/ 160 con productos en promoción y el permiso apagado, cuando se calcula el envío, entonces no es gratis; con la camisa sola de S/ 200 sin promoción, sí.
- CA-7.5 (R7.4, productos): Dado el permiso de cupones encendido, cuando el cliente aplica un cupón de 10 % a Zapatillas a S/ 80, entonces el descuento es S/ 8 y el total de la línea S/ 72.
- CA-7.6 (R7.4, productos): Dado el permiso de envío gratis encendido, mínimo S/ 150 y carrito de S/ 160 ya con la promoción, cuando se calcula el envío, entonces es gratis; con S/ 140, no.
- CA-7.7 (R7.5, productos): Dado un cupón de la campaña creado con el permiso de cupones apagado, cuando el dueño ve el paso 3, entonces lee el aviso de que solo valdrá en productos sin promoción.
- CA-7.8 (R7.6, productos): Dado un cupón rechazado por haber productos en promoción, cuando el cliente ve el mensaje en el carrito y en el pago, entonces el texto es el mismo.

### R8: carrito, pago y pedido

- CA-8.1 (R8.1, productos): Dado un navegador que manda Zapatillas a S/ 10, cuando se calcula el carrito o se crea el pedido, entonces el servidor usa S/ 80 (el precio vigente) y no S/ 10.
- CA-8.2 (R8.3, productos): Dado un pedido con Zapatillas por promoción, una Camisa con `precioOferta` y un Pantalón sin descuento, cuando el dueño abre el pedido, entonces las líneas dicen: precio regular, precio cobrado y descuento, y de dónde vino ("Black Friday", "Oferta del producto", "Ninguno"); el cliente ve lo mismo en su seguimiento.
- CA-8.3 (R8.4, productos): Dado un cliente que entra al pago a las 21:50 con la promoción que termina a las 22:00, cuando confirma el pedido a las 22:05, entonces el pedido se crea con S/ 80. Si confirma a las 22:30 (más de 15 minutos después de entrar), se recalcula a S/ 100 y se le avisa antes de crear el pedido.
- CA-8.4 (R8.5, productos): Dado un pedido creado a S/ 80, cuando la campaña termina o se apaga, entonces el pedido sigue en S/ 80.
- CA-8.5 (R8.7, productos): Dado un pedido con pago automático, cuando se genera el cobro, entonces el monto es el `total` del pedido guardado en el servidor, con la promoción congelada.

### R9: confirmación explícita

- CA-9.1 (R9.1, R9.3, productos): Dado el diálogo de confirmación, cuando el dueño lo cierra sin pulsar la acción de confirmar, entonces la promoción no queda activa y la campaña, si estaba apagada, sigue apagada.
- CA-9.2 (R9.2, productos): Dado 20 % sobre Zapatillas del vie 20 nov 00:00 al lun 30 nov 23:59, cuando se abre el diálogo, entonces muestra el porcentaje, el alcance con el número de productos, el desde/hasta con día de la semana y hora, el ejemplo S/ 100 a S/ 80, las reglas de combinación y la frase de que los precios de sus productos no se modifican.
- CA-9.3 (R9.4, productos): Dado una promoción confirmada, cuando se consulta el registro, entonces muestra quién, cuándo y qué confirmó (porcentaje, alcance, ventana, permisos).
- CA-9.4 (R9.5, productos): Dado una promoción confirmada, cuando el dueño cambia el porcentaje de 20 a 25 % o extiende el fin de la campaña un día, entonces para guardar debe confirmar de nuevo; sin confirmar, el cambio no se guarda y la promoción vigente sigue siendo la anterior.
- CA-9.5 (R9.6, productos): Dado Cyber Wow del catálogo con promoción confirmada para la edición de julio, cuando llega la edición de noviembre, entonces la campaña se ve sola pero los precios no cambian hasta que el dueño confirme de nuevo la promoción de noviembre; y Campañas le recordó con anticipación que hay que confirmar.

### R10: Indecopi

- CA-10.1 (R10.1, productos): Dado un producto de precio regular S/ 100 con promoción de 20 %, cuando el cliente lo ve, entonces el tachado es S/ 100 y la etiqueta dice −20 % sobre ese precio regular.
- CA-10.2 (R10.2, productos): Dado Zapatillas que subió de S/ 80 a S/ 100 el 10 nov y una promoción que empieza el 20 nov, cuando el dueño abre la confirmación, entonces ve el aviso "1 producto subió de precio regular en los 30 días previos" con su nombre; puede confirmar igual.
- CA-10.3 (R10.2, productos): Dado el mismo producto con su última subida el 15 oct, cuando el dueño abre la confirmación el 18 oct para una ventana que empieza el 20 nov, entonces no hay aviso por ese producto.
- CA-10.4 (R10.3, productos): Dado una promoción confirmada que empieza el 20 nov, cuando el dueño sube el precio de Zapatillas el 5 nov, entonces ve el aviso de que la subida cae en los 30 días previos a la promoción; la subida se permite.
- CA-10.5 (R10.4, productos): Dado el dueño que cambia el precio regular de S/ 80 a S/ 100, cuando se consulta el historial, entonces hay un registro con fecha, S/ 80, S/ 100 y quién lo hizo. Dado un producto sin 30 días de historial, cuando se abre la confirmación, entonces dice que aún no hay historial suficiente.
- CA-10.6 (R10.5, productos): Dado una promoción en curso sobre Zapatillas, cuando el dueño intenta subir su precio regular de S/ 100 a S/ 120, entonces se rechaza con el mensaje que nombra la promoción y la fecha de fin; bajarlo a S/ 90 sí se permite; cambiar su descripción también.
- CA-10.7 (R10.7, productos): Dado 8 productos del alcance con `precioOferta` propio, cuando el dueño abre la confirmación, entonces ve "8 productos ya tienen un precio de oferta; se aplicará el mayor descuento".

### R11 y R12: rubros con reserva y orden

- CA-11.1 (R11.1, hotel): Dado una tienda de hotel, cuando el API recibe una campaña con promoción, entonces responde 400 "Esta tienda no usa promociones de precio"; y lo mismo para tours, eventos, locales y canchas.
- CA-11.2 (R11.1, productos): Dado una tienda de productos, cuando el API recibe una campaña con promoción válida, entonces la acepta.
- CA-12.1 (R12.1): Dado el repositorio, cuando se revisa antes de construir la pieza C3, entonces `precio-en-servidor` está desplegado y existe una función única de precio vigente que la promoción usa; ningún otro código calcula precios por su cuenta.
- CA-12.2 (R12.2, anti-identidad): Dado el código de la tienda y del Admin, cuando corre `scripts/anti-identidad.mjs`, entonces el paso 3 y la promoción no contienen comparaciones por nombre de rubro (preguntan por la capacidad de carrito).

### Resumen por rubro (humo)

| Rubro | Qué debe verse |
|---|---|
| productos | Tres pasos; promoción en el paso 3; precio tachado y etiqueta en listado, ficha, carrito y pago; confirmación explícita; pedido con la campaña en cada línea. |
| hotel | Dos pasos (Cuándo, Cómo se verá); sin paso 3; la campaña sigue sin cambiar precios. |
| tours, eventos, locales, canchas | Igual que hotel. |

## Variación por cliente

- **Configuración por tienda (por campaña):** la promoción (porcentaje, alcance), los dos permisos de combinación, el cupón de la campaña y la confirmación. Cada dueño decide la suya.
- **Capacidad:** el paso 3 se activa con la capacidad que ya existe de **vender con carrito** (productos). No se crea una capacidad nueva; el arquitecto confirma si hace falta una propia (por ejemplo "promoción de precios") para cuando un rubro de reserva la reciba.
- **Textos por rubro:** en el perfil de cada rubro, no en ramas del componente (CLAUDE.md "Lógica por rubro").
- **Dato de la plataforma:** ninguno nuevo.
- **Excepción por tienda:** ninguna.

## Fuera de alcance

- Promoción en rubros con reserva (hotel, tours, eventos, locales, canchas). Fase posterior, tras el código promocional de reservas.
- Monto fijo, "2x1", "lleva 3 paga 2", regalo, compra mínima o descuento por volumen.
- Excluir productos de "toda la tienda" (se resuelve eligiendo categorías o productos).
- Descuento solo para clientes registrados, VIP o por grupo (toca datos personales).
- Más de una promoción por campaña.
- Que el porcentaje de un sello de los adornos salga solo de la promoción (R5.8 de campanas-cuando). En esta fase solo se avisa si el texto no coincide (R3.3).
- Descuento por variante (la oferta del producto ya es solo del producto).
- Reportes de ventas o conversión por campaña.
- Reembolsos automáticos al cancelar un pedido pagado con promoción (sigue el límite de pago-automático).
- Una pantalla de condiciones legales editable por el dueño.
- Acceso anticipado, vista previa pública con enlace, y avisos antes de una campaña sugerida (siguen en "Futuro" de campanas-cuando).

## Riesgos

- **Cobrar distinto de lo anunciado.** Es el riesgo principal. Se mitiga con una sola función de precio en el servidor (R5.6, R6.1), el recálculo en cada cambio (R8.1) y el aviso de cambio de precio (R6.6). Sin `precio-en-servidor`, no se puede construir (R12.1).
- **Una promoción que se activa sola.** Una campaña del catálogo que se repite podría rebajar precios el año siguiente sin que el dueño lo sepa. Se mitiga con la confirmación por ventana (R9.6).
- **Margen negativo.** Un 90 % por error o un descuento bajo el costo. Se mitiga con el tope, la marca desde 50 % y el aviso de costo (R4.2, R4.9).
- **Indecopi.** El aviso de 30 días depende del historial de precios (R10.4); hasta que haya 30 días de datos, el aviso es parcial. De ahí que C2 vaya primero. Y la regla no sustituye la revisión de un abogado (Q8).
- **Caché pública.** El listado puede mostrar un precio viejo hasta 5 minutos. Es aceptable porque lo que se cobra lo decide el servidor y el cliente ve el cambio antes de pagar (R6.6), pero el arquitecto debe evaluar si el catálogo público pide una caché más corta durante campañas con promoción.
- **Pedidos y carritos en vuelo** al cambiar la promoción: cubierto por el congelado (R8.4) y por que un pedido creado no cambia (R8.5).
- **Trabajo sin commit en los mismos archivos** (campanas-cuando está programado completo y sin probar; checkout y reloj de la tienda con cambios pendientes): el arquitecto debe ordenar commits antes de C1.

## Preguntas abiertas

Todas llevan mi recomendación; la spec está escrita con ella. Las cinco primeras cambian el alcance.

- [x] **Q1. Reglas por defecto de cupones y envío gratis (R7).** El ADR-0001 dice "solo si la tienda lo permite"; esta spec lo lee como un permiso **por campaña** (un refinamiento: la tienda decide campaña por campaña). Opciones: (a) ambos apagados y el dueño los enciende por campaña; (b) ambos encendidos; (c) un permiso único para toda la tienda, tal cual la letra del ADR. **Recomiendo (a)**: un dueño que no toca nada no pierde margen sin saberlo, y cada campaña puede ser distinta (Black Friday sí, otra no). Costo: el cliente de una tienda con envío gratis puede perderlo al comprar en promoción; el carrito se lo explica (R7.6).
- [x] **Q2. Campañas que se repiten (R9.6).** Opciones: (a) la confirmación vale solo para esa edición y ese año, hay que confirmar de nuevo; (b) vale para siempre. **Recomiendo (a)**: evita que el año siguiente se rebajen precios sin que el dueño lo vea. Costo: un clic más al año.
- [x] **Q3. Subir el precio regular durante una promoción en curso (R10.5).** Opciones: (a) bloquear; (b) permitir y solo avisar. **Recomiendo (a)**: es la forma de inflar el "precio ordinario" a mitad de campaña, justo lo que sanciona Indecopi. Excepción: apagar la promoción primero.
- [x] **Q4. Cuánto dura el congelado del precio al empezar a pagar (R8.4).** Opciones: 15 min, 30 min, 60 min. **Recomiendo 15 minutos**, igual al apartado del hotel; pagar con Yape o tarjeta toma menos.
- [x] **Q5. El cupón de la campaña, ¿se rige por el permiso de cupones o siempre se combina con su propia promoción? (R7.5).** **Recomiendo que se rija por el mismo permiso** (consistente con "cupones solo si la tienda lo permite") y que el paso 3 avise cuando el dueño crea ese cupón con el permiso apagado.
- [x] **Q6. Categorías con subcategorías (R4.3.2).** **Recomiendo que la promoción de una categoría incluya sus subcategorías**; es lo que un dueño espera de "Zapatillas".
- [x] **Q7. Rango del porcentaje (R4.2).** **Recomiendo 1 a 90** (entero) y marca de "descuento muy alto" desde 50 %.
- [x] **Q8. Revisión legal (R10).** La spec toma el precedente 186-2021/CCD como lo resumió Diego y no lo verifica de nuevo (modo ahorro). **Recomiendo** una revisión breve del texto de condiciones y del aviso de 30 días por quien lleve lo legal antes de desplegar.
- [x] **Q9. Historial de precios (R10.4).** **Recomiendo empezar a registrar cambios de precio apenas esté `precio-en-servidor`** (pieza C2), aunque la promoción llegue después; el aviso de 30 días necesita esos datos.
- [x] **Q10. Dos campañas con promoción en la misma fecha (R5.4).** Opciones: (a) por producto gana la de mayor descuento; (b) solo vale la promoción de la campaña visible. **Recomiendo (a)**, coherente con "gana el mayor descuento". Caso real: Black Friday (con promoción) y Cyber Monday (sin ella) el 30 nov: con (b) el 30 nov los precios volverían al regular aunque Black Friday seguía en su ventana.
- [x] **Q11. Una campaña activa con promoción sin confirmar (R5.7).** **Recomiendo** que quede como solo visual (sin cambio de precio) y que el Admin la marque "Promoción sin confirmar", en vez de bloquear la campaña.

## Decisiones tomadas

| Fecha | Decisión | Por qué | Alternativa descartada |
|---|---|---|---|
| 2026-10-20 | **Campañas es el centro de la campaña; Diseño es la herramienta de su aspecto.** Reemplaza "Campañas es el cuándo; Diseño es el cómo" (campanas-cuando, 2026-10-19). Registrada en [ADR-0002](../../adr/ADR-0002-campana-en-tres-pasos.md). | Con una promoción real hay un tercer dato y el dueño necesita ver y activar la campaña completa en un solo lugar. | Mantener la separación y agregar la promoción en una tercera pantalla |
| 2026-10-20 | El precio lo calcula el servidor con una función única; las promociones se calculan al vuelo y no reescriben productos; sin acumulación; se congela al pagar. Registrada en [ADR-0001](../../adr/ADR-0001-precio-calculado-en-servidor.md); esta spec solo agrega los requisitos de negocio. | Seguridad y nada que restaurar. | Ver el ADR |
| 2026-10-20 | La campaña se abre en tres pasos (Cuándo, Cómo se verá, Promoción), con estado por paso y un solo CTA "Activar campaña", habilitado con el paso 1 listo. | Diego aprobó el flujo. | Un formulario largo; dos CTA (activar y activar promoción) |
| 2026-10-20 | "Editar aspecto" abre el editor en vivo de Diseño en modo campaña; no se duplica el editor. | Un dato, un lugar; menos código. | Editor de aspecto dentro de Campañas |
| 2026-10-20 | Promoción solo para productos en esta fase; rubros con reserva en fase posterior. | Dependen del código promocional de reservas (H3, pospuesto). | Construir todos los rubros a la vez |
| 2026-10-20 | Alcance: toda la tienda, categorías o productos en lote (nunca de uno en uno); porcentaje; cupón de la campaña opcional que vence con ella. | Referencia: Tiendanube "Descuento sobre precios". | Selección producto por producto; monto fijo |
| 2026-10-20 | El servidor calcula el precio vigente al vuelo; no se reescriben precios de productos. | Nada que restaurar; la hora exacta de inicio y fin ya existe. | Que la campaña modifique `precioBase` al empezar y lo restaure al terminar |
| 2026-10-20 | No se suma sobre un mismo producto: gana el mayor descuento (frente a `precioOferta` u otra promoción). Cupones y envío gratis solo si la tienda lo permite. | Como Booking y Shopify; evita márgenes negativos. | Acumular descuentos |
| 2026-10-20 | El servidor recalcula en cada cambio del carrito, congela el precio al empezar a pagar y guarda campaña y descuento en cada línea del pedido. | Seguridad (price tampering) y soporte. | Confiar en el precio del navegador |
| 2026-10-20 | Activar la promoción exige confirmación explícita del dueño. | Toca lo que se cobra. | Que se active con la campaña |
| 2026-10-20 | Cumplimiento Indecopi (precedente 186-2021/CCD): descuento sobre el precio ordinario vigente antes de la promoción, aviso por alzas en los 30 días previos, precio anunciado final, condiciones visibles. | Diego lo investigó y lo aprobó. | Calcular sobre cualquier precio tachado |
| 2026-10-20 | Prerrequisito: `precio-en-servidor`; la promoción se enchufa en su función única de precio vigente. | La promoción no es segura sobre un precio que manda el navegador. | Construir la promoción antes |
| 2026-10-20 | El aviso R8.7 de campanas-cuando pasa a avisar si la portada promete descuento y el paso 3 está vacío. Se mantienen R8.1 a R8.5 y R8.8. | La campaña ahora puede tener descuento real. | Mantener "tu campaña no cambia precios" en productos |

## Para el manual

- **Tu campaña en tres pasos.** En Campañas abres una campaña y la armas en orden: 1. Cuándo (fechas y horas), 2. Cómo se verá (ves una vista previa y, si quieres cambiarla, tocas "Editar aspecto"), 3. Promoción (opcional). Cada paso te dice su estado: "Listo: 27–30 nov", "Personalizado", "−20 % en Zapatillas". Con las fechas listas ya puedes pulsar "Activar campaña".
- **La promoción baja los precios sola.** Eliges un porcentaje y a qué llega: toda la tienda, algunas categorías o productos que marcas varios a la vez. Cuando empieza la campaña, los clientes ven el precio de antes tachado y el nuevo; cuando termina, todo vuelve solo. **No tocamos los precios de tus productos**, no tienes que restaurar nada.
- **Si un producto ya tiene precio de oferta,** se aplica el que da el mejor precio al cliente; no se suman.
- **Cupones y envío gratis:** por defecto no se combinan con los productos en promoción. Puedes permitirlo en el mismo paso, campaña por campaña.
- **Antes de activar te pedimos confirmar.** Verás el porcentaje, cuántos productos entran, desde cuándo hasta cuándo y un ejemplo. Si algún producto subió de precio en los últimos 30 días, te avisamos: el Indecopi pide que el descuento se calcule sobre el precio normal, no sobre uno subido para la campaña.
- **Mientras una promoción está en curso no puedes subir el precio normal de esos productos.** Si necesitas hacerlo, apaga la promoción.
- **Hoteles, tours, eventos, locales y canchas:** la campaña tiene los dos primeros pasos. La promoción de precios para ellos viene en una fase posterior.
