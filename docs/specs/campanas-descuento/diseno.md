# Diseño: Campañas en tres pasos (Cuándo · Cómo se verá · Promoción) y precio de campaña en la tienda

> Spec: [spec.md](spec.md) (borrador, 2026-10-20; escrita asumiendo las recomendaciones de sus preguntas Q1-Q11) · Estado: **aprobado 2026-10-20 **
> Decisiones de arquitectura: [ADR-0002](../../adr/ADR-0002-campana-en-tres-pasos.md) (tres pasos, un CTA) y [ADR-0001](../../adr/ADR-0001-precio-calculado-en-servidor.md) (precio calculado en el servidor).
> Prototipo: [v1-2026-10-20.html](../../disenos/campanas-descuento/v1-2026-10-20.html) (un solo scroll, sin toggles de vista, enlaces inertes, datos de ejemplo; "hoy" = mar 20 oct 2026, Black Friday = vie 27 nov, Cyber Monday = lun 30 nov).
> Lo que depende de una pregunta abierta de la spec lleva la marca **pendiente de Diego (Qn)**; se lista completo en "Pendiente de la spec".

## De dónde parte

- **Admin › Campañas:** del calendario por año y el panel debajo de la fila de [campanas-cuando](../campanas-cuando/diseno.md) (prototipo [v1-2026-10-19](../../disenos/campanas-cuando/v1-2026-10-19.html), aprobado 2026-10-19). Se conservan filas, interruptor, barra del año, el control de hora "Todo el día | A las", "Fechas oficiales / Mis fechas" (R2.9), la caja de fechas de uso y el patrón de guardado junto a lo editado. Código actual: `FrontendAdmin/src/app/pages/campanas/campanas.component.html`.
- **Diseño en modo campaña:** [editor en vivo](../editor-diseno-en-vivo/spec.md), sin duplicarlo (R1.3).
- **Tienda:** `app-product-card` (precio, `precioOferta`, etiqueta), ficha, carrito y pago existentes; selector de rubro por capacidad (`perfilDe(...)`, `UiNegocio`), no por nombre.
- **Cupones y productos (Admin):** `pages/cupones` y el formulario de producto.
- No hay un diseño vigente de la pantalla "campaña de tres pasos": es nueva. Es la versión 1 de este diseño y **no reemplaza** ninguna versión aprobada (el prototipo de campanas-cuando sigue vigente para lo que no cambia: calendario, selectores de fecha, portada y plataforma).

## Flujo

**Dueño de una tienda de productos (Admin › Campañas), 5 pasos**
1. Abre Campañas y toca Black Friday: debajo de su fila ve tres pasos cerrados, cada uno con su estado: "Listo: 27–30 nov", "Del catálogo", "Sin promoción".
2. Abre **1. Cuándo** solo si quiere cambiar algo (fechas oficiales o "Mis fechas", horas). Abre **2. Cómo se verá**: ve la vista previa y, si quiere, toca "Editar aspecto" (va a Diseño y vuelve a este paso).
3. Abre **3. Promoción**, pulsa "+ Agregar promoción", elige a qué se aplica (toda la tienda, categorías o productos que marca en lote), escribe el porcentaje y ve al instante cuántos productos entran y un ejemplo ("S/ 100 pasa a S/ 80"). Opcional: un cupón de la campaña.
4. Pulsa **Activar campaña** (único botón principal). Como hay promoción, se abre la confirmación con el desde/hasta, el ejemplo, las reglas de combinación y los avisos (precio subido en 30 días, bajo costo, ofertas propias). Confirma con "Sí, aplicar −20 %".
5. La campaña queda activa; los precios cambian solos el 27 nov y vuelven solos al terminar. No tocó ningún precio de producto.

**Dueño de una tienda con reserva:** los mismos pasos 1 y 2; sin paso 3; el CTA es el mismo.

**Cliente de la tienda de productos, 5 pasos**
1. Ve en el listado el precio de campaña, el regular tachado y "−20 %"; con "Ver condiciones" lee hasta cuándo vale y si se combina.
2. Abre la ficha: mismo trío en grande, "Ahorras S/ 20,00", condiciones abiertas.
3. Agrega al carrito: cada línea con el mismo trío; el ahorro se lee una vez; el cupón y el envío gratis explican si aplican.
4. Va a pagar; si la promoción empezó o terminó, ve el aviso con el total anterior y el nuevo, y el botón ya dice la cifra nueva.
5. Paga con el precio asegurado; el pedido guarda de dónde vino el descuento.

## Pantallas

### A1. Admin › Campañas: la lista (cambios mínimos)
- **Objetivo:** ver y activar las campañas del año y saber cuáles tienen promoción y si falta confirmarla.
- **Contenido, en orden:** resumen "Hoy…"; filas (interruptor, nombre, rango, chips, barra, efecto); pie con leyenda. Chips nuevos (solo con carrito): **"Promoción sin confirmar"** (ámbar), **"−15 % en toda la tienda · confirmada"** (verde), **"Confirma tu promoción de noviembre"** (campañas que se repiten, R9.6). El resumen dice si hay una promoción en curso.
- **CTA principal:** ninguno en la lista; cada campaña abierta tiene el suyo.
- **El interruptor (R2.5):** apagar es inmediato (toast "Los precios vuelven al regular en unos minutos"). Encender una campaña sin promoción, o con la promoción ya confirmada, es inmediato como hoy. Encender una con **promoción sin confirmar** abre la fila y la confirmación (A6); si el dueño la cierra, el interruptor vuelve a apagado. Es un solo diálogo para las dos entradas.
- **Móvil / escritorio:** como hoy (cabecera de meses oculta, barra a su propia línea).
- **Estados:** cargando · error ("Error al cargar las campañas") · activa en curso / futura / vencida / apagada / por anunciar (como campanas-cuando) · con promoción sin confirmar · con promoción confirmada · edición nueva por confirmar. Sin permisos: no aplica.
- **Slot por rubro:** ninguno. Los chips de promoción se dibujan solo si la tienda tiene la capacidad "vende con carrito" (sin `if` por nombre de rubro).

### A2. Admin › Campañas: el centro de la campaña (tres pasos cerrados)
- **Objetivo:** ver la campaña completa y activarla sin saltar de pantalla.
- **Contenido, en orden:** (campaña propia) Nombre; **1. Cuándo**; **2. Cómo se verá**; **3. Promoción** (con "opcional"); fila del CTA.
- **Estado de cada paso, en una línea y visible aunque el paso esté cerrado** (R2.1):
  - Paso 1: "Listo: 27–30 nov" (verde) · "Listo: 27 nov 10:00 – 30 nov, medianoche" · "Pendiente: falta la fecha de fin" (ámbar) · "Revisar" (rojo, con un error bloqueante dentro).
  - Paso 2: "Del catálogo" · "Personalizado". Propuesta mía para campañas propias sin tocar: "Sin personalizar" (la spec solo define las dos primeras).
  - Paso 3: "Sin promoción" · "−20 % en Zapatillas" · "−15 % en toda la tienda" · "−10 % en 3 categorías" · "−25 % en 12 productos", con sufijo "· sin confirmar" (ámbar), "· confirmada" (verde) o "· terminó" (gris).
- **Un paso abierto a la vez.** Cada cabecera es un botón de 56 px con `aria-expanded`. Al abrir un paso su línea de estado se retira y queda una chip ("Listo", "Personalizado", "Sin confirmar"): el detalle ya está en los campos y nada se lee dos veces. Con la fila abierta, su texto de rango se retira (el rango se lee solo en el paso 1).
- **CTA principal (uno):** **"Activar campaña"**, habilitado con el paso 1 listo; los pasos 2 y 3 no lo bloquean (R2.2). Deshabilitado, trae el motivo en texto visible ("Completa las fechas del paso 1 para activarla"), enlazado con `aria-describedby`. Con la campaña ya activa pasa a **"Guardar cambios"** (R2.4; texto propuesto por mí), deshabilitado sin cambios.
- **Secundarios:** "Guardar sin activar" (guarda los tres pasos como borrador; propuesta mía, solo con cambios o campaña apagada), "Descartar" (con cambios), "Restablecer lo sugerido" / "Eliminar" (sin cambios, como hoy). **Sin barra fija en Admin**: con los pasos cerrados el CTA queda a la vista; con un paso abierto queda debajo de él.
- **Móvil / escritorio:** una columna en las dos; en móvil los pasos ocupan el ancho completo y el CTA también. Escritorio: el panel sale con sangría bajo la fila, máximo 760 px.
- **Estados:** apagada con paso 1 pendiente · apagada lista sin promoción · apagada con promoción sin confirmar · activa sin cambios · activa con cambios · guardando ("Guardando…") · éxito (toasts: "Campaña activada. Tu tienda se actualiza en unos minutos." / "Campaña activada. Empezará el vie 27 nov." / "Campaña guardada.") · error del servidor (toast con el mensaje del API; el panel queda abierto) · campaña terminada (editable en 1 y 2; el paso 3 pasa a solo lectura).
- **Tabla completa** de combinaciones botón-acción en el prototipo, sección 8.

### A3. Paso 1 · Cuándo
- **Objetivo:** decir cuándo se ve la campaña. Es la pantalla de campanas-cuando **sin cambio de reglas** (R1.2).
- **Contenido, en orden:** "¿Qué fechas usa tu tienda?" (Fechas oficiales / Mis fechas; solo catálogo) → fechas (propia o "Mis fechas": `app-campo-periodo`) o días antes y después (catálogo con fechas oficiales) → hora de inicio y de fin ("Todo el día | A las", etiqueta "hora de Lima") → **Fechas de uso** (solo si la tienda recibe reservas; ver A9). Cyber Wow conserva su lista de ediciones de solo lectura y "Según la plataforma".
- **Cambio frente a campanas-cuando:** la sección "Cuándo se ve el efecto" sale de este panel y pasa al paso 2 (A4); y los errores de R8 (campaña ya terminada, empieza en más de un año, uso incoherente, cruce con otra campaña) se muestran **dentro del paso 1**, con `role="alert"`, dejándolo en "Revisar".
- **CTA:** el de la campaña (A2). El paso no tiene botón propio.
- **Estados:** como campanas-cuando (sin hora, con hora, fin a las 00:00, año sin fechas "por anunciar", cruce, vencida). Un Cyber Wow del año sin fechas cargadas queda **"Listo: fechas por anunciar"** (propuesta mía: coherente con R2.6.3 de campanas-cuando, que deja activarlo).
- **Móvil:** una columna; controles de 44 px.

### A4. Paso 2 · Cómo se verá
- **Objetivo:** que el dueño vea cómo quedará la campaña y llegue al editor.
- **Contenido, en orden:** vista previa de la portada (es la vista previa del API con un momento dentro de la ventana de la campaña, propuesta P6 de campanas-cuando) → botón "Editar aspecto →" → avisos cruzados → "Cuándo se ve el efecto" (Solo el día clave / Toda la campaña, movido desde el panel de hoy).
- **CTA del paso:** "Editar aspecto →" (secundario). Abre Diseño en modo campaña con una barra "← Volver a Black Friday" que regresa a este paso (CA-1.3). Con cambios sin guardar el botón dice **"Guardar y editar aspecto"** y guarda como borrador sin activar (hoy se deshabilita con "guarda primero"; en el celular eso es un callejón sin salida).
- **Avisos, que no bloquean:**
  - R3.2: "Tu portada promete un descuento pero esta campaña no tiene promoción. Agrégala en el paso 3 o quita el texto." con "Ir al paso 3" y "Editar aspecto". Dice dónde está el texto (sello, portada…).
  - R3.3: "Tu portada dice 30 % pero la promoción de esta campaña es de 20 %." (mismos atajos).
  - R8.8 (sin cambio): color principal ilegible (< 3:1).
  - Tiendas sin paso 3 (R3.4): el aviso de hoy, "Tu campaña no cambia precios…".
  - El mismo aviso se ve en Diseño (modo campaña), como define campanas-cuando R8.7; no se repite en la misma pantalla.
- **Diseño (único cambio, sin pantalla nueva):** barra de retorno. Llegando desde el selector de campañas de Diseño no aparece. **Requiere un cambio pequeño en Diseño**; lo propongo a la spec (la R1.3 ya dice que se vuelve a la campaña).
- **Móvil / escritorio:** la vista previa cambia sola por ancho: en escritorio es una portada ancha con el botón a su lado; en móvil, la portada a ancho completo con el botón debajo. **Sin interruptor de vista.**
- **Estados:** cargando (la previa en esqueleto) · error ("No pudimos cargar la vista previa. Reintentar"; el botón "Editar aspecto" sigue disponible) · "Del catálogo" · "Personalizado".

### A5. Paso 3 · Promoción (solo tiendas con carrito)
- **Objetivo:** rebajar precios con una promoción por porcentaje, con todo a la vista antes de activar.
- **Contenido, en orden:** (1) A qué se aplica → (2) Cuánto → (3) Cómo se combina → (4) Cupón de la campaña (opcional) → (5) "Así lo verá tu cliente" (una tarjeta de producto con el trío) → "Quitar promoción".
  1. **Alcance**, tres tarjetas radio de 56 px: *Toda la tienda* · *Categorías* (árbol con casillas, conteo por categoría y subcategorías que entran con su padre y se muestran marcadas y bloqueadas; **Q6 pendiente de Diego**) · *Productos que elijo* (resumen "12 productos elegidos", tres chips y "y 9 más", y el botón "Cambiar selección" que abre A5b). Nunca se edita producto por producto (R4.4).
  2. **Porcentaje:** campo numérico de 44 px con "%", entero de 1 a 90 (**Q7 pendiente de Diego**), error inline "Escribe un número entero de 1 a 90". Debajo, en vivo (`aria-live`): "Entran hoy **34 productos** de Zapatillas" y "Un producto de **S/ 100** pasa a **S/ 80**" (R4.6).
  3. **Cómo se combina:** dos casillas **apagadas por defecto** (R7.1): "Permitir cupones sobre productos en promoción" y "Permitir envío gratis en pedidos con productos en promoción", cada una con una línea que explica qué pasa apagada (**Q1 pendiente de Diego**). Son casillas guardadas con el CTA, no interruptores inmediatos.
  4. **Cupón de la campaña (opcional, "+ Agregar cupón…"):** código, tipo (Porcentaje | Monto fijo, el mismo control segmentado de la hora), valor, límite de usos y compra mínima opcionales (R4.8). Texto fijo: "Solo vale mientras dure la campaña. Aparecerá en Cupones como «de la campaña {nombre}» y se edita solo aquí." Si «Permitir cupones…» está apagado, aviso: "Este cupón solo valdrá en productos sin promoción", con el atajo "Permitirlo" (R7.5; **Q5 pendiente de Diego**).
- **Los avisos de Indecopi, costo y ofertas propias NO están en este paso:** llegan en la confirmación (A6), donde la spec los exige (R9.2, R10.2), para que el dueño los lea justo antes de confirmar y no aparezcan dos veces. Este paso solo trae lo necesario para armar.
- **CTA:** el de la campaña (A2). Sin botón propio de guardar.
- **Móvil / escritorio:** una columna; tarjetas y casillas de 44 px o más; el árbol de categorías con scroll interno de 240 px.
- **Estados:** vacío ("Esta campaña solo cambia cómo se ve tu tienda: los precios no cambian", con "+ Agregar promoción") · armando · **cargando el conteo** (esqueleto; el resto sigue editable) · **error del conteo** ("No pudimos contar los productos… Reintentar"; permite guardar borrador, no confirmar) · **alcance sin productos activos** (error que bloquea "Activar campaña") · porcentaje inválido · **sin confirmar** (chip ámbar) · **confirmada en curso** ("Confirmada por Ana el 20 oct, 10:32"; con la ayuda de que no se puede subir el precio regular de esos productos, **Q3 pendiente de Diego**) · **edición nueva de una campaña que se repite** ("Confirma tu promoción de noviembre…", R9.6, **Q2 pendiente de Diego**) · **campaña terminada** (solo lectura, "los precios ya volvieron al regular").
- **Pieza por capacidad:** el paso entero se dibuja por la capacidad "vende con carrito" (no una rama por rubro), con el nombre de la unidad ("productos") del perfil. Si el arquitecto prefiere una pieza de slot en Admin, el diseño no cambia.

### A5b. Elegir productos en lote
- **Objetivo:** marcar muchos productos sin abrirlos uno por uno (R4.4).
- **Contenido, en orden:** buscar (nombre o código) y filtrar por categoría → barra de selección ("**Seleccionar los 40 resultados**", "12 elegidos", "Quitar los 40 resultados", "Quitar todos") → tabla (casilla, foto, nombre, categoría, precio regular; marca "Con oferta propia") → pie "Cancelar" / **"Listo · 12 productos"**.
- **CTA principal:** "Listo · N productos". Cerrar con Cancelar, la X o Esc conserva la selección anterior.
- **Móvil / escritorio:** ventana centrada de 760 px en escritorio; hoja de pantalla completa en móvil, con la barra de selección fija **dentro de la hoja** (es un diálogo, no una barra fija de la página) y filas de 48 px.
- **Estados:** cargando (filas en esqueleto) · sin resultados · error ("No pudimos cargar los productos. Reintentar") · con selección. Los productos inactivos o sin stock no aparecen (R4.5).

### A6. Confirmación de la promoción (diálogo único)
- **Objetivo:** que activar una promoción sea una decisión explícita, con todo lo que cambia lo que se cobra (R9).
- **Cuándo se abre:** "Activar campaña" con promoción sin confirmar · interruptor de la fila con promoción sin confirmar · "Guardar cambios" si cambió el porcentaje, el alcance, los permisos, el cupón o las fechas de una campaña con promoción confirmada (R9.5; el diálogo dice qué cambió, "de −20 % a −25 %").
- **Contenido, en orden:** título "¿Aplicar −20 % en Zapatillas?" → lo que se cobra (Qué y a cuántos productos; Desde y Hasta con día de la semana y hora, hora de Lima; Ejemplo; Se combina) → "Los precios de tus productos **no se modifican**…" → avisos que **solo aparecen si corresponden**, de más a menos grave: subida del precio regular en los 30 días previos (con la lista corta y el enlace "Ver los N productos", R10.2; recomienda dejarlos fuera o esperar), productos bajo su costo (R4.9), productos con oferta propia ("se aplicará el mayor descuento", R10.7), productos sin 30 días de historial (R10.4: "Aún no tenemos 30 días de historial…").
- **CTA principal:** **"Sí, aplicar −20 %"** (repite el número para que no se confirme sin leerlo). Secundario: "Volver y cambiar la promoción". Cerrar (X o Esc) = no confirmar (R9.3): la campaña sigue como estaba y el panel dice "No se aplicó la promoción. La campaña sigue como estaba."
- **Desde 50 %:** aviso "Es un descuento muy alto" y el botón principal espera la casilla "Revisé que 60 % es correcto" (concreción mía de R4.2; la spec dice "marca y pide verificar").
- **Los datos del diálogo (porcentaje, alcance, fechas) ya existen en la campaña:** el diálogo es otra capa cuyo fin es repetirlos una vez, de forma explícita, antes de tocar precios. No hay segundo diálogo.
- **Móvil / escritorio:** escritorio 560 px; móvil, hoja de ancho completo con botones apilados (principal arriba) de 44 px mínimo. Foco al título al abrir; Tab queda atrapado; el foco vuelve al botón que lo abrió.
- **Estados:** abriendo (esqueleto mientras se calculan avisos) · con avisos · sin avisos · confirmando ("Aplicando…") · éxito (toast de A2) · error (toast; el diálogo sigue abierto) · el servidor no pudo calcular los avisos ("No pudimos revisar los precios de tus productos. Reintentar"; no se puede confirmar sin revisarlos).

### A7. Rubros con reserva (hotel, tours, eventos, locales, canchas)
- **Misma pantalla, dos pasos**; no hay paso 3 ni mensaje que lo explique (R1.4, R11.1). El CTA, los estados y los pasos 1 y 2 son los mismos. Las **fechas de uso** están dentro del paso 1 (R1.2) con su frase "Así lo verá tu cliente" y el nombre del campo desde el perfil ("Estadías", "Salidas"…). El aviso de promesa de descuento es el de hoy (R3.4).
- La pantalla pregunta por la capacidad "vende con carrito", no por el rubro.

### A8. Efectos en otras pantallas de Admin
- **Productos, subir el precio regular de un producto con promoción programada** (R10.3): aviso ámbar bajo el campo, "Esta subida cae en los 30 días previos a la promoción {campaña}", se puede guardar.
- **Productos, promoción en curso** (R10.5, **Q3 pendiente de Diego**): el campo se marca con error inline y "Guardar" se deshabilita: "Este producto está en la promoción {campaña} hasta el {fecha}. Para cambiar su precio regular, apaga la promoción o espera a que termine." con el atajo "Ir a la campaña →". Bajarlo y editar otros datos se permite.
- **Cupones:** el cupón de una campaña se ve en la lista con la chip "De la campaña Black Friday" y el botón "Editar en la campaña →" (no se edita ahí: un dato, un lugar).
- **Pedido (ficha del dueño):** cada línea con precio regular, cobrado, descuento y su origen (campaña / oferta del producto / ninguno, R8.3). Se diseñará con la pieza C6; no está dibujado.

### T1. Tienda › Listado y categorías (tienda con carrito)
- **Objetivo:** que el cliente vea el precio vigente y qué tanto ahorra, igual en toda la tienda.
- **Contenido de la tarjeta, en orden:** imagen con etiqueta "−N %" arriba a la izquierda (texto blanco sobre rojo `#b91c1c`, contraste AA) → categoría → nombre → **precio vigente** (negrita, color de acento) y **precio regular tachado**. Sin etiqueta ni tachado si no hay descuento. El porcentaje sale del precio regular; si gana la oferta del producto, es el de la oferta (R6.3). El tachado se lee con "Precio regular" para lector de pantalla.
- **Condiciones (R6.5):** una franja bajo el título de la categoría solo en páginas que listan productos de la promoción: "**Black Friday** · −20 % en Zapatillas · hasta el lun 30 nov, 23:59" y "Ver condiciones" (44 px). Se abre con: porcentaje sobre el precio regular, hasta cuándo, a qué productos, si se combina con cupones y envío gratis, "El precio que ves es el precio final; el envío se muestra antes de pagar". Se arma sola desde la configuración.
- **CTA:** el botón de agregar sube desde el borde de abajo de la imagen, a todo el ancho (solo escritorio, patrón de la casa); en móvil se toca la tarjeta.
- **Estados:** cargando (tarjetas en esqueleto) · vacío ("No hay productos en esta categoría") · error ("No pudimos cargar los productos. Reintentar") · promoción terminada (todo desaparece solo, R6.7; la oferta propia sigue) · caché hasta 5 minutos atrás (el carrito lo corrige).
- **Slot por rubro:** ninguno nuevo; la tarjeta es la de productos; no se agrega ninguna rama por nombre de rubro. Lo que cambia por capacidad (precio y carrito) ya vive en la plantilla de productos. SSR: el servidor no conoce la campaña (devuelve `{}`), así que la franja y las etiquetas se dibujan en el navegador, igual que las secciones de campaña; a confirmar con el `arquitecto`.

### T2. Tienda › Ficha del producto
- **Contenido, en orden:** galería → categoría y nombre → **precio vigente + tachado + etiqueta "−20 %"** → una línea "Ahorras S/ 20,00 con Black Friday" (el porcentaje va en la etiqueta y el monto en la frase: no se repite) → "Condiciones de la promoción" (abiertas en escritorio y cerradas en móvil, con el resumen ya visible arriba) → variantes → **Agregar al carrito** (único CTA).
- **Variantes:** el precio sigue a la variante elegida (cada una con su regular, R5.5); antes de elegir dice "Desde S/ …".
- **Móvil:** el CTA está a la vista; la barra fija de "Agregar al carrito" aparece solo cuando ese botón sale de pantalla (regla de la casa).
- **Estados:** cargando · sin stock (CTA "Avísame" o deshabilitado, como hoy) · promoción terminada mientras se mira (el precio se actualiza en la siguiente carga; el servidor decide al agregar) · error.

### T3. Tienda › Carrito
- **Contenido, en orden:** líneas (foto, nombre, variante, cantidad, **trío de precio por línea**) → cupón → totales → **Ir a pagar** (único CTA).
- **Totales:** "Subtotal" (suma de lo que se ve, ya con la promoción) → "Ya incluye −S/ 20,00 de Black Friday" (el ahorro, una sola vez, en verde AA, no se resta de nuevo) → "Cupón …" → nota de envío → Total.
- **Cupón y envío gratis (R7.3, R7.6, CA-7.8):** mensajes idénticos en carrito y pago: "Los productos en promoción no admiten cupones." / "El envío gratis no aplica a pedidos con productos en promoción." Un cupón en un carrito mixto se aplica solo a las líneas sin promoción y lo dice ("−S/ 5,00, solo sobre el Polo Sport"). Con el permiso de la campaña encendido (**Q1 pendiente de Diego**), esas frases no aparecen.
- **Cambio de precio visible (R6.6):** una línea cuyo precio subió o bajó porque la promoción empezó o terminó muestra, debajo, "El precio de {producto} cambió: la promoción terminó. Antes S/ 199,20, ahora S/ 249,00" (`role="status"`, no mueve el foco).
- **Móvil / escritorio:** escritorio, líneas a la izquierda y cupón y totales a la derecha; móvil, una columna. El mini carrito usa el mismo trío.
- **Estados:** vacío (el de hoy) · **recalculando** (importes atenuados, "Ir a pagar" deshabilitado hasta la respuesta) · **error al recalcular** ("No pudimos actualizar los precios. Reintentar"; no se puede ir a pagar con precios sin confirmar) · con cambio de precio · cupón aplicado / rechazado.

### T4. Tienda › Pago
- **Contenido:** igual al carrito para el resumen (mismo trío, mismo "Ya incluye…"), más datos de envío y pago como hoy. "Condiciones de la promoción" al alcance en el resumen (R6.5).
- **El total cambió (R6.6, R8.2):** si al pagar el servidor calcula otro total, **no crea el pedido** y el cliente ve un aviso encima del resumen: "El total cambió: la promoción Black Friday terminó. Antes S/ 90,00 · ahora S/ 110,00. No se cobró nada. Revisa tu pedido y paga si estás de acuerdo." (ámbar, `role="alert"` si sube). Si **bajó** porque empezó una promoción: aviso azul "Buenas noticias: empezó Black Friday. Antes … ahora …" (`role="status"`). El botón es el mismo y solo cambia su importe: "Pagar S/ 110,00". El cliente no paga una cifra que no ha visto.
- **Precio asegurado (R8.4, Q4):** al entrar al pago, una línea bajo el botón "Precio asegurado mientras pagas (15 min)". Pasado ese lapso se recalcula y se avisa como arriba. **Q4 pendiente de Diego** (15, 30 o 60 minutos).
- **CTA principal:** "Pagar S/ {total}" (uno solo). La barra fija del celular, si el botón sale de pantalla, repite el mismo texto.
- **Header** siempre visible en móvil (cuenta e idioma).
- **Estados:** cargando al recalcular (importes atenuados, botón deshabilitado) · error ("No pudimos confirmar el precio. Reintentar") · total subió · total bajó · precio asegurado vencido · éxito (el pedido guarda precio regular, precio cobrado, descuento y campaña por línea, y el cliente lo ve en su seguimiento) · sin permisos: no aplica.

## Textos

Lo que cambia por rubro va al **perfil**, no a la plantilla. Esta fase solo toca el rubro con carrito:

- **Perfil de la tienda (productos), `negocio/productos/…`:** nombre de la unidad para el paso 3 y los conteos ("productos"), "categoría(s)", y las frases de condiciones ("Aplica a la categoría {x} y sus subcategorías", "No se combina con cupones de la tienda ni con envío gratis por monto mínimo", "El precio que ves es el precio final; el envío se muestra antes de pagar"). Los rubros con reserva no tienen estos campos (`null`: el paso 3 y las condiciones no existen).
- **Admin, perfil de reservas:** sin cambios (nombres de "Fechas de uso": Estadías, Salidas, Funciones, Eventos, Partidos).
- **Textos comunes (claves de diccionario, no por rubro):** los estados de los pasos, los toasts, los avisos de A6 y los mensajes de cambio de precio. Las frases legales (Indecopi) se centralizan en un solo lugar para la revisión legal (**Q8 pendiente de Diego**: revisar el texto de condiciones y el aviso de 30 días antes de desplegar).
- **Nada de "oferta" o "descuento" en campañas sin promoción** (campanas-cuando R1.5.4); con promoción, los textos hablan del porcentaje real.

## Piezas que se reutilizan y piezas nuevas

- **Se reutilizan:** panel bajo la fila, interruptor, `app-campo-periodo`, control de hora, caja de fechas de uso, diálogo de confirmación, `app-product-card`, botón que sube desde la imagen, el trío de `precioOferta`.
- **Nuevas en Admin:** `PasoCampana` (cabecera de paso con número, título, estado, chip, `aria-expanded`); tarjetas radio de alcance; árbol de categorías con conteo; selector de productos en lote (ventana); bloque de cupón; diálogo de confirmación de promoción; chips de promoción en la fila.
- **Nuevas en Tienda:** `PrecioConDescuento` (vigente + tachado + etiqueta, único en listado, ficha, carrito, mini carrito y pago); `CondicionesPromocion` (franja o detalle desplegable); aviso de cambio de total.
- `PiezasUi` no cambia: ninguna pieza nueva de slot (el paso 3 y las condiciones se dibujan por capacidad).

## Propuestas a la spec (no las cambio yo)

1. **Efecto de la campaña.** Hoy "Cuándo se ve el efecto" (Solo el día clave / Toda la campaña) vive en Campañas. La spec (R1.3) lista el "efecto" entre lo que se edita en Diseño. Propongo aclarar que el **modo** del efecto se queda en Campañas (paso 2) y que Diseño sigue editando cuál es el efecto.
2. **Guardar sin activar y "Guardar y editar aspecto".** La spec solo menciona "Activar campaña". Para no perder trabajo a medias y no bloquear el celular, propongo un borrador explícito (R2).
3. **Texto del CTA con la campaña activa:** "Guardar cambios" (R2.4 lo deja al diseñador).
4. **Estado del paso 2 en campañas propias sin tocar:** "Sin personalizar"; y del paso 1 de un Cyber Wow sin fechas: "Listo: fechas por anunciar".
5. **Sufijos del paso 3:** "· sin confirmar" / "· confirmada" / "· terminó".
6. **Recordatorio de R9.6:** definir con cuántos días de anticipación aparece "Confirma tu promoción de noviembre" (la spec dice "con anticipación"). Propuesta: desde 30 días antes del inicio.
7. **Casilla desde 50 %** (R4.2): concreción mía de "marca y pide verificar".
8. **Barra "← Volver a la campaña" en Diseño** (cambio chico en Diseño; R1.3 ya exige volver al mismo paso).
9. **Aviso R10.3 y bloqueo R10.5 en el formulario de producto** (ubicación en el diseño; la spec no dice dónde).
10. **El pedido no se crea si el total difiere** (R8.2): el botón conserva su nombre y cambia su importe.
11. **Etiqueta con la oferta propia:** cuando gana la oferta del producto, la ficha no dice "con {campaña}" (R6.3 lo deja abierto).

## Pendiente de la spec (marcado "pendiente de Diego")

| Pregunta | Qué cambia en el diseño | Si Diego decide distinto |
|---|---|---|
| **Q1** permisos por campaña (cupones y envío gratis apagados) | Las dos casillas del bloque "Cómo se combina", las frases de carrito y pago, la línea "Se combina" del diálogo | (b) encendidos: desaparecen las frases de rechazo. (c) un permiso único: el bloque sale del paso 3 y pasa a Cupones/ajustes de la tienda |
| **Q2** confirmar de nuevo cada edición | Chip "Confirma tu promoción de noviembre", aviso en el paso 3 | (b) vale siempre: se retiran el chip y el aviso |
| **Q3** bloquear subir el precio regular en promoción | Error inline del producto (A8) | (b) solo avisar: el campo solo muestra el aviso ámbar |
| **Q4** congelado de 15 minutos | Línea "Precio asegurado mientras pagas (15 min)" | Cambia el número del texto |
| **Q5** el cupón se rige por el permiso | Aviso "Este cupón solo valdrá en productos sin promoción" y su atajo | Sin aviso si siempre se combina |
| **Q6** subcategorías entran | Árbol con hijos marcados y bloqueados | Hijos independientes y sin "entra con Zapatillas" |
| **Q7** rango 1–90 y marca desde 50 % | Error inline, casilla del diálogo | Otro rango |
| **Q8** revisión legal | Textos de Indecopi y condiciones | Se reescriben en un solo lugar |
| **Q10** dos campañas con promoción | Solo una línea en el pie de la lista ("en un producto en común gana el mayor descuento"); no hay pantalla | — |
| **Q11** promoción sin confirmar queda solo visual | Chip "Promoción sin confirmar" en la fila y en el paso 3 | Si se bloquea la campaña, el CTA se deshabilita con motivo |

Además, **todo el paso 3, A6 y T1-T4 depende de `precio-en-servidor`** (R12.1): se pueden aprobar ahora, pero no se construyen antes.

## Decisiones de diseño por aprobar

- **A. Pasos cerrados, uno abierto a la vez.** El dueño ve los tres estados de un vistazo y el CTA cerca (sin barra fija en Admin). *Descartado:* los tres pasos abiertos (pantalla larga, CTA lejos en el celular); un asistente rígido (editar una campaña creada pide ver los tres a la vez; coincide con ADR-0002).
- **B. Un solo CTA, "Activar campaña" → "Guardar cambios"**, y el interruptor de la fila no puede saltarse la confirmación. *Descartado:* dos botones (activar y activar promoción).
- **C. Todos los avisos que tocan precios viven en el diálogo de confirmación** (Indecopi, costo, ofertas propias, historial); el paso 3 solo arma. *Descartado:* avisarlos en el paso y repetirlos en el diálogo (dato dos veces).
- **D. "Guardar sin activar" y "Guardar y editar aspecto"** (propuesta 2). *Descartado:* "guarda primero" deshabilitando el botón.
- **E. El efecto pasa al paso 2** (propuesta 1). *Descartado:* dejarlo en el paso 1 (no es "cuándo").
- **F. El estado de cada paso desaparece de la cabecera cuando el paso está abierto** (queda una chip). *Descartado:* mostrarlo siempre (repetiría el dato que está en los campos).
- **G. Casillas, no interruptores,** para los permisos del paso 3 (se guardan con el CTA, regla "guardar junto a lo editado"). *Descartado:* interruptores inmediatos (cambiarían reglas de combinación sin confirmar).
- **H. El total que cambia en el pago no crea el pedido; el botón cambia de importe y el aviso queda arriba** (R8.2). *Descartado:* un botón "Aceptar nuevo total" (un segundo CTA) y un diálogo bloqueante.
- **I. Condiciones en una franja con "Ver condiciones" en el listado, y abiertas en la ficha.** *Descartado:* una página de condiciones aparte (sale de la pantalla, R6.5).

## Checklist de reglas de la casa

- [x] Sin información duplicada en la misma pantalla: el rango se lee solo en el paso 1 (la fila abierta lo retira); el estado del paso se retira al abrirlo; el efecto vive solo en el paso 2; la promoción se edita solo en el paso 3; los avisos de precio solo en el diálogo; en la tienda el ahorro se escribe una vez ("Ya incluye…") y el porcentaje una vez (etiqueta). Excepción declarada: el diálogo de confirmación repite porcentaje, alcance y fechas a propósito (es otra capa y es la confirmación explícita).
- [x] Un solo CTA principal a la vista: "Activar campaña" / "Guardar cambios" en Admin (sin barra fija); "Agregar al carrito", "Ir a pagar" y "Pagar S/ …" en la tienda. En el celular, la barra fija de la ficha y del pago aparece solo cuando ese botón sale de pantalla.
- [x] Header siempre visible en móvil (cuenta e idioma) en listado, ficha, carrito y pago.
- [x] UI automática y responsive, sin toggles de vista; el prototipo muestra escritorio y celular lado a lado, con un solo scroll y enlaces inertes. La vista previa del paso 2 cambia por ancho.
- [x] Product card en escritorio: el botón de agregar sube desde abajo de la imagen, a todo el ancho (dibujado en T1).
- [x] Accesibilidad:
  - Contraste AA: etiquetas y precio de campaña en `#b91c1c` sobre blanco (≥ 6:1), ayudas en gris 600 o más oscuro, estados en verde `#166534` y ámbar `#92400e` sobre fondo claro.
  - Foco visible en cabeceras de paso, tarjetas de alcance, casillas y botones (anillo azul de 2 px).
  - Etiquetas y roles: cabecera de paso con `aria-expanded`; errores con `role="alert"` y `aria-invalid`; avisos informativos con `role="status"`; diálogos con `aria-modal`, foco atrapado y devuelto; tachado leído como "Precio regular".
  - Objetivos táctiles ≥ 44 px (cabeceras de 56 px, tarjetas de 56 px, filas de 44-48 px). **Excepción heredada:** botones pequeños de Admin de 36 px y celdas de calendario de 40 px, fuera de este alcance.
  - El significado no depende solo del color: etiqueta con "−N %" y texto en cada estado; chips con texto.
  - Movimiento reducido: sin animaciones salvo el despliegue de un paso (instantáneo con "reducir movimiento").
- [x] Nada dependiente del rubro fuera de un slot ni de un perfil: el paso 3, las condiciones y las chips de promoción se dibujan por la capacidad "vende con carrito" y sus textos salen del perfil; sin `if` por nombre de rubro (`scripts/anti-identidad.mjs`, CA-12.2). SSR: la campaña solo existe en el navegador; las etiquetas, franjas y condiciones no crean diferencias de hidratación (a confirmar con el `arquitecto`).

## Prototipo

- **Parte de:** [campanas-cuando v1-2026-10-19](../../disenos/campanas-cuando/v1-2026-10-19.html) (piezas, estilos y datos) y de las piezas existentes de la tienda; el paso 3, la confirmación y la tienda con precio de campaña son nuevos.
- **Copia en el repo:** [`docs/disenos/campanas-descuento/v1-2026-10-20.html`](../../disenos/campanas-descuento/v1-2026-10-20.html)
- **Original (claude.ai):** no se dibujó en claude.ai; el HTML del repo es la fuente de verdad.
- **Cómo verlo:** abrir el archivo en el navegador; catorce secciones numeradas (índice arriba), un solo scroll, enlaces inertes. Equivalencia: 1 = A1 · 2 = A2 · 3 = A3 · 4 = A4 (y barra de Diseño) · 5 = A5 · 6 = A5b · 7 = A6 · 8 = tabla de acciones y toasts de A2 · 9 = A7 · 10 = A8 · 11 = T1 · 12 = T2 · 13 = T3 · 14 = T4. Las interacciones son solo el control "Todo el día / A las" y los radios.
- **No dibujado:** portada de la tienda (sin cambios respecto a campanas-cuando), ficha del pedido y seguimiento (pieza C6), buscador y asesor IA (usan el mismo precio, sin diseño propio).
