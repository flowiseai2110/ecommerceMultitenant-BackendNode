# Diseño: Campañas, "el cuándo" (Fase 1: horas, fechas por año, ventana de uso)

> Spec: [spec.md](spec.md) (aprobada 2026-10-19) · Estado: **borrador, por aprobar** · Alcance: Fase 1 (P1, P2, P3). La Fase 2 (R4, R5) no se diseña aquí.
> Prototipo: [v1-2026-10-19.html](../../disenos/campanas-cuando/v1-2026-10-19.html) (un solo scroll, sin toggles de vista, datos de ejemplo; las fechas del Cyber Wow no son oficiales).
> Las notas "D1…D19" del prototipo explican cada detalle junto a la pantalla; las decisiones para aprobar están al final con letras (A–I).

## De dónde parte

- **No hay diseño vigente de Campañas** en `docs/disenos/INDICE.md`. Se parte de la pantalla que ya está en código (`FrontendAdmin/src/app/pages/campanas/campanas.component.html`): calendario por año con barras, interruptor, panel por fila, un Guardar por campaña, "Editar cómo se ve →" como enlace. Se conservan sus piezas y su patrón (regla de Diego: guardar junto a lo editado, sin barras fijas).
- Selectores de fecha de la tienda: se parte de [selector-fechas](../selector-fechas/spec.md) y su prototipo (`disenos/selector-fechas/v1.html`): `app-grilla-mes`, `app-calendario-mes`, `app-calendario-rango`, la leyenda que solo muestra las marcas presentes en el mes visible, `DiaCalendario` con `tono` y `sub`.
- Plataforma: se parte de "Parámetros de la plataforma" (`pages/parametros-plataforma`): misma cabecera "Plataforma · solo tú ves esto", tarjetas con filas, "Cambiado por … el …".
- Bloque de campaña de la portada: se parte de `app-offer-section` y `conCampana` (`state/diseno.state.ts`).

## Flujo

**Dueño (Admin › Campañas), 5 pasos**
1. Abre Campañas; el calendario del año ya muestra la hora en el texto del rango cuando existe.
2. Toca Black Friday (o su campaña propia); se abre el panel debajo de la fila.
3. En "Cuándo se ve tu tienda" elige, para el inicio y para el fin, "Todo el día" o "A las 10:00".
4. Si su tienda recibe reservas, toca "+ Agregar fechas de uso" y dice hasta cuándo se usa lo reservado; el panel le muestra la frase tal como la leerá su cliente.
5. Pulsa **Guardar** (el único botón principal del panel). La tienda cambia a la hora exacta.

**Cliente (los cinco rubros con reserva)**
1. Abre la portada: ve la campaña y, en su bloque, una línea "Reserva hasta el 3 dic · para alojarte hasta el 31 mar".
2. Abre el selector de fecha (calendario, funciones o tira de días): ve el rombo ◆ en las fechas que ya puede elegir y la leyenda "Fechas de Black Friday".
3. Elige la fecha que quiera (dentro o fuera del uso: las reglas de siempre).
4. Hotel: si todas las noches caen dentro, el pie dice "Tu estadía entra en Black Friday".
5. Reserva como siempre; la campaña no cambió precio, cupo ni plazos.

**Plataforma (administrador), 4 pasos**: abre Fechas por año → elige el año → carga o corrige una edición del Cyber Wow (nombre, inicio y fin con hora opcional) → confirma el cambio si ya estaba cargada. Queda anotado quién y cuándo.

## Pantallas

### 1. Admin › Campañas: calendario del año
- **Objetivo:** ver y activar las campañas del año, y qué ve hoy el cliente.
- **Contenido, en orden:** resumen "Hoy, 19 oct: …"; filas (interruptor, nombre, rango, chips, barra, efecto); pie con leyenda. Sin cambios de estructura.
- **Cambios:**
  - Rango con hora **solo si hay hora**: "15 oct, 8:00 – 31 oct, 14:00". Sin hora queda como hoy. Fin a las 00:00: "30 nov, medianoche" (R3.14).
  - Chips nuevos: "Empieza hoy a las 20:00", "Terminó" (gris; la fila baja de contraste y la barra se atenúa), "Por anunciar" (borde punteado).
  - **Cyber Wow**: una fila, una barra por edición (las pasadas atenuadas). Texto: "Próxima: noviembre · 2 – 5 nov" y el chip "3 ediciones en 2026". "En curso" y "Empieza en N días" hablan de la edición vigente o próxima (R2.3).
  - **Año sin fechas**: la fila sigue, dice "Fechas de 2027 por anunciar", el interruptor sigue activable (R2.6.3). Tres recuadros punteados en abril, julio y noviembre muestran dónde suelen caer, sin inventar fechas.
- **CTA:** el calendario no tiene CTA principal; cada panel tiene el suyo.
- **Móvil / escritorio:** como hoy (la cabecera de meses se oculta y la barra baja a su propia línea).
- **Estados:** cargando (spinner actual) · error ("Error al cargar las campañas") · sin campañas propias (solo catálogo; no hay vacío total) · activa en curso / activa futura / activa vencida / apagada / por anunciar · sin permiso (no aplica: lo ve todo dueño).

### 2. Admin › Campañas: panel de una campaña propia
- **Objetivo:** decir cuándo se ve la campaña (con hora) y, en tiendas con reservas, hasta cuándo vale para usar.
- **Contenido, en orden:** Nombre → **Cuándo se ve tu tienda con esta campaña** (periodo con `app-campo-periodo` + hora de inicio + hora de fin) → **Fechas de uso** (solo `recibeReservas`) → Cuándo se ve el efecto → pie.
- **Hora de inicio / de fin:** control "Todo el día | A las [10:00]" (grupo de radios segmentado de 44 px + selector de hora nativo). Texto de ayuda debajo, uno por estado:
  - Inicio sin hora: "Empieza a las 00:00 del primer día." Con hora: "Empieza el vie 20 nov a las 10:00."
  - Fin sin hora: "Termina al acabar el último día." Con hora: "Se ve hasta las 21:59; a las 22:00 ya no."
  - Fin a las 00:00: "A las 00:00 la campaña ya terminó: se verá hasta la medianoche del lun 30 nov. Para incluir el mar 1 dic, elige otra hora o «Todo el día»." (R3.14)
  - Etiqueta "hora de Lima" en el campo; no se repite en otro lugar.
- **Fechas de uso (P3):** recuadro propio. Se abre con el botón secundario "+ Agregar fechas de uso" y se cierra con "Quitar fechas de uso" (no es un interruptor). Contiene: "{Estadías} desde" (opcional, placeholder "Desde que reservan") y "{Estadías} hasta" (obligatoria), la ayuda "Máximo: 3 dic 2027 (un año después de que termina la campaña)" (R1.3) y la línea **"Así lo verá tu cliente en la portada: «Reserva hasta el 3 dic · para alojarte hasta el 31 mar»"**, que se arma sola (R1.10). Nota fija: "Les orienta en tu portada y en el calendario; no cambia tus precios ni limita las reservas." El nombre del campo viene del perfil del rubro.
- **CTA principal:** **Guardar** (deshabilitado sin cambios o con error inline). Secundarios: Descartar (con cambios), Eliminar (sin cambios), "Editar cómo se ve →" (enlace; "Guarda primero para editar cómo se ve" con cambios). Sin barra fija. Interruptor de activar: inmediato, como hoy.
- **Móvil / escritorio:** una columna en móvil, controles de 44 px; en escritorio, horas en dos columnas bajo las fechas.
- **Estados:** sin cambios · con cambios · guardando ("Guardando…") · éxito (toast "Campaña guardada. Tu tienda se actualiza en unos minutos.") · error de validación inline con `role="alert"` y `aria-invalid` (fin no posterior al inicio: "La fecha y hora de fin deben ser posteriores al inicio."; más de 90 días; uso hasta mayor al tope; uso sin "hasta") · error del servidor (toast con el mensaje del API; el panel queda abierto) · tienda de productos (la sección Fechas de uso **no existe**; no hay mensaje) · campaña vencida (editable).

### 3. Admin › Campañas: panel de una campaña del catálogo
- **Mismo orden y mismas piezas.** Cambia solo la ventana: sin Nombre ni periodo; dos columnas, izquierda = empieza, derecha = termina.
  - Izquierda: "Empieza (días antes)" + "Hora de inicio · el primer día". Derecha: "Sigue (días después)" + "Hora de fin · el último día" (R3.3, R3.12).
  - Fechas de uso en días relativos (R1.4): "{Estadías} hasta [60] días después de que termina la campaña" y, opcional, "desde [N] días después de que empieza". Ayuda con el año en curso: "Este año: hasta el 30 dic 2026. El año que viene se recalcula solo." Misma línea "Así lo verá tu cliente".
  - El panel pasa a ordenar **Cuándo → Fechas de uso → Efecto** (hoy el efecto va antes que los días). Es un cambio de orden para que las dos clases de campaña se lean igual (decisión G).
- **Estados extra:** error "Con estos días y horas la campaña quedaría vacía. Ajusta las horas o los días." (R3.6); la frase del modo "solo el día clave" dice "31 oct, hasta las 14:00" (R3.7).

### 4. Admin › Campañas: Cyber Wow (varias ediciones)
- **Objetivo:** que el dueño active una vez y vea qué ediciones hay, sin cargar nada.
- **Contenido:** lista de solo lectura "Ediciones de 2026" (Abril · 6 – 9 abr · Terminó; Julio · 13 jul – 16 jul, medianoche · Terminó; Noviembre · 2 – 5 nov · Próxima) con la nota "Las fechas las carga la plataforma cuando el IAB Perú las anuncia. Si cambian, tu tienda se actualiza sola." Si el usuario es de la plataforma, la nota termina en el enlace "Cargar o corregir fechas (plataforma) →". Luego, "Empieza (días antes de cada edición)" y "Sigue (días después…)" con sus horas.
- **Horas en Cyber Wow:** la opción sin hora dice **"Según la plataforma"** (no "Todo el día"): la plataforma puede traer su propia hora. Si el dueño pone una hora, vale para **todas** las ediciones del año (propuesta P3).
- **Año sin fechas:** aviso azul "Todavía no hay fechas de 2027. **Déjala activada:** cuando se anuncien, tu tienda se vestirá sola, sin que hagas nada." y la lista con cada edición esperada en "Por anunciar". Con ediciones parciales (abril y julio cargadas): esas dos con fechas y noviembre "Por anunciar" en la misma lista (R2.6.2).
- **Estados:** una edición en curso (chip "En curso") · terminadas (gris) · próxima · por anunciar · cargando/error como la pantalla 1.

### 5. Admin › Plataforma: Fechas por año (pantalla nueva)
- **Ruta propuesta:** `/campanas-plataforma` (breadcrumb "Fechas por año"). Sin entrada de menú, como las otras pantallas de plataforma: se llega desde el panel del Cyber Wow, desde "Parámetros de la plataforma" y desde el aviso de la bitácora.
- **Objetivo:** que el administrador de la plataforma cargue o corrija las ediciones de un año, con seguridad.
- **Contenido, en orden:** cabecera "Fechas por año · Plataforma · solo tú ves esto" con selector de año; frase "Un cambio llega a todas las tiendas que tienen la campaña activa en menos de 5 minutos."; tarjeta "Cyber Wow · IAB Perú" con una fila por edición: nombre, fechas con hora ("13 jul – 16 jul, medianoche · 4 días"), "Cargada/Cambiada por {quién} el {cuándo}", chip de estado, y **Editar**; "Ver historial (2)" despliega la lista de cambios (quién, cuándo, valor anterior → nuevo; R2.7).
- **Cargar / editar:** la fila se abre con un formulario en su sitio (mismo patrón que Campañas): Nombre de la edición, Año (fijo), **Empieza** (fecha + "Todo el día | A las"), **Termina** (igual), duración calculada. **Un Guardar y un Descartar por edición**, sin barra fija. Las ediciones esperadas sin cargar aparecen como "Por anunciar" con el botón "Cargar fechas". Máximo 3 ediciones por año (R2.2).
- **Validaciones inline (R2.4, CA-2.7):** "La fecha y hora de fin deben ser posteriores al inicio." · "Una edición dura como máximo 30 días (esta dura 38)." · "Se cruza con la edición {nombre} ({fechas})." Guardar deshabilitado mientras haya error.
- **Confirmación (único diálogo):** solo al **cambiar** una edición ya cargada: "El fin pasa del 5 nov al 4 nov, 12:00. Lo verán las 14 tiendas que tienen el Cyber Wow activo, en menos de 5 minutos. Quedará anotado a tu nombre." [Cambiar fechas] [Cancelar]. Cargar una edición nueva no pide confirmación. El conteo de tiendas depende de la propuesta P1; sin él, la frase omite el número.
- **Aviso de fechas faltantes (R2.6.4):** banner azul arriba del año: "Faltan fechas: abril, julio y noviembre de 2027. Cada vez que falta una, queda anotado en la bitácora y, a 60 días del inicio previsto, se avisa por correo." Cuando falten menos de 60 días y la edición esté sin cargar, el banner pasa a ámbar con el mismo texto y "Cargar fechas" como acción.
- **Móvil / escritorio:** en móvil cada edición es una tarjeta de una columna con "Editar" a ancho completo; en escritorio, fila de tres columnas.
- **Estados:** cargando · vacío (año sin nada: las tres ediciones esperadas en "Por anunciar" + banner) · error al cargar · éxito (toast "Edición guardada. Las tiendas la verán en unos minutos.") · error de validación · **sin permiso**: "Solo el administrador de la plataforma puede ver esta pantalla. Volver" (igual que Parámetros); un 403 al guardar muestra "Solo el administrador de la plataforma puede cargar fechas."

### 6. Admin › Diseño: vista previa (sin pantalla nueva)
- En Diseño, modo campaña, no hay campo nuevo (R1.10, CA-1.13). **Nota para el desarrollo (propuesta P6):** como la vista previa del API usa el mediodía de Lima sin hora (R3.11), una campaña que empieza a las 20:00 no se vería. Al previsualizar una campaña concreta, el Admin manda un momento **dentro de su ventana** (el día clave a mediodía, o 1 hora después del inicio si ese mediodía queda fuera).

### 7. Tienda › Portada (los cinco rubros con reserva; productos solo recibe el pie de la cuenta)
- **Objetivo:** que el visitante sepa hasta cuándo reservar y, si existe, hasta cuándo usar lo reservado.
- **Contenido:** el bloque de campaña existente (`app-offer-section`) gana **una línea** bajo su texto, con el rombo ◆: **"Reserva hasta el 3 dic, 22:00 · para alojarte hasta el 31 mar"** (con desde: "para alojarte del 1 dic al 31 mar"). Si la campaña no trae bloque de cuenta regresiva, la línea va sola en una banda delgada bajo el hero (nota D13).
- **Una sola vez (R1.5.1):** no se repite en la barra superior ni en la cinta. **El fin de la campaña también se escribe una sola vez:** dentro de la línea si existe; si no (productos, o sin fechas de uso), como pie de la cuenta regresiva: "Termina el lunes 30 a medianoche" / "Termina el domingo 22 a las 22:00" / "Termina el domingo 22" (CA-3.17).
- **CTA principal:** el del hero, sin cambios. La línea no es un botón ni un enlace.
- **Móvil / escritorio:** la línea se parte en dos renglones como máximo; en escritorio queda bajo el texto del bloque, a la izquierda. Header sin cambios (cuenta e idioma visibles).
- **Estados:** sin fechas de uso (no hay línea) · con fechas de uso · campaña terminada (todo desaparece con ella, R1.7) · cuenta en cero ("Terminando…", ver pantalla 9) · inglés en hotel ("Book until 3 Dec, 10:00 pm · to stay until 31 Mar"); los demás rubros, solo español.
- **Pieza de slot:** ninguna. La estructura es la misma en todos los rubros; lo que cambia es texto, y sale del perfil. La línea viaja con las secciones de campaña que arma `conCampana` (ya solo se dibujan en el navegador), así que no agrega diferencias entre servidor y navegador.

### 8. Tienda › Selectores de fecha (marca "Fechas de {campaña}")
**Regla común:** el símbolo es un **rombo ◆** del color de la campaña vigente (`--color-primary`; si no alcanza 3:1 contra el fondo, usa el color del texto). Es una forma, no solo un color, y tiene leyenda. Se pinta **solo sobre fechas ya elegibles** (no sobre cerradas, llenas ni ocupadas), no cambia precio, cupo ni reglas y no deshabilita nada fuera del uso (R1.5.2, R1.5.3). La leyenda aparece solo si el mes visible tiene marcas (regla actual de las leyendas). El rombo es una marca **independiente** de `tono` (un día puede ser "tarifa más baja" y de campaña a la vez): en la celda va arriba a la izquierda, el punto verde de "tarifa más baja" arriba a la derecha y la marca de "hoy" abajo al centro. La etiqueta de lectura de la celda suma "fechas de {campaña}" a lo que ya dice (nunca "disponible", nunca "oferta").

| Rubro | Dónde | Cómo se ve |
|---|---|---|
| hotel | `app-calendario-rango` (buscador y ficha de habitación) | Rombo en cada **noche** elegible dentro del uso; leyenda junto a "Precio por noche" y "Tarifa más baja". En el pie, bajo "12 – 15 dic · 3 noches": **"Tu estadía entra en Black Friday"** solo si todas las noches caen dentro (R1.8); si una cae fuera, no aparece nada (sin aviso de "parcial"). El pie ya es `aria-live`, así que el lector de pantalla la anuncia. Extremos elegidos: rombo blanco sobre el círculo oscuro. |
| tours | `app-calendario-mes` de la ficha | Rombo en las **fechas de salida elegibles** dentro del uso. Sin texto de cupo ni de disponibilidad (T-02). Un sábado fuera del uso se puede pedir igual, sin aviso. |
| eventos | Lista de funciones de la ficha del evento y filas de la agenda de la cartelera | **Etiqueta** "◆ Fechas de Cyber Wow" junto a la fecha de cada función dentro del rango. Una función agotada o cerrada no la lleva. Sin calendario. |
| locales | `app-calendario-mes` de la ficha del salón | Rombo en las **fechas libres** dentro del uso; las ocupadas (tachadas) no. Una fecha con "1 turno" sigue siendo libre y lleva rombo. |
| canchas | Tira de días del reservador | Rombo en la esquina de cada día de la tira dentro del uso; leyenda bajo la tira. Un horario ocupado dentro de un día marcado sigue sin poder elegirse. Día elegido (oscuro): rombo blanco. |

- **CTA principal:** sin cambios en cada pantalla (la marca no es un CTA).
- **Móvil / escritorio:** el rombo mide 7 px y vive dentro de la celda; no cambia el tamaño táctil de la celda (ver checklist). Dos meses lado a lado en escritorio, igual que hoy.
- **Estados:** cargando (calendario atenuado, como hoy) · sin marcas en el mes (sin leyenda) · con marcas · campaña terminada (desaparecen) · fuera del uso (sin marca, mismas reglas) · inglés solo en hotel.

### 9. Tienda › Cambio a la hora frontera con la pestaña abierta (R3.9.2)
- **Objetivo:** que el cambio de campaña no se note como un salto.
- **Secuencia (nota D19, storyboard en el prototipo):**
  1. Antes del fin: cuenta regresiva normal.
  2. Al llegar a cero: **todo sigue igual** y la cuenta dice "Terminando…" hasta que llegue la respuesta del servidor (máximo 15 s: el desfase aleatorio de R3.9.2 más la red). **Nunca se muestra el diseño normal entre dos campañas seguidas** (Black Friday → Cyber Monday).
  3. Llega la respuesta: **un solo fundido de 300 ms** de colores, barra superior y textos. Con "reducir movimiento" del sistema, el cambio es directo.
  4. Si era la última campaña: el mismo fundido hacia el diseño normal. Si la respuesta tarda más de 15 s o falla, se pasa al diseño normal y se reintenta.
- **Sin salto de scroll:** los bloques que se agregan o quitan arriba de lo que el cliente está viendo no lo desplazan (se compensa el scroll; Safari no lo hace solo). En el carrito, el pago y los pasos de reserva solo cambian los colores (esas pantallas no llevan bloques de campaña).
- **Sin sorpresas:** el efecto festivo no se dispara en una pestaña ya abierta (se verá en la próxima visita); el cambio no se anuncia con voz (es decorativo); el foco no se mueve.

## Textos
Todo lo que cambia por rubro va al **perfil**, nunca a una rama de la plantilla. Se agregan dos grupos de campos; la plantilla solo los lee.

**Tienda** (`perfilDe(tipo).reserva.campana`, `negocio/<rubro>/…`; `null` si el rubro no recibe reservas):

| Rubro | "Reserva hasta" | "usoHasta" / "usoRango" | Hotel (inglés) |
|---|---|---|---|
| hotel | Reserva hasta el {fin} | para alojarte hasta el {hasta} / para alojarte del {desde} al {hasta} | Book until {end} · to stay until {until} / to stay from {from} to {until} |
| tours | Reserva hasta el {fin} | para viajar hasta el … / para viajar del … al … | (por confirmar) |
| eventos | Compra tus entradas hasta el {fin} | para asistir a funciones hasta el … / … del … al … | solo español |
| locales | Reserva hasta el {fin} | para eventos hasta el … / … del … al … | solo español |
| canchas | Reserva hasta el {fin} | para jugar hasta el … / … del … al … | solo español |

- Leyenda de la marca: "Fechas de {campaña}" (igual en los cinco; vive en el perfil por si un rubro la quiere distinta). Hotel en inglés: "{campaign} dates".
- `entra` ("Tu estadía entra en {campaña}" / "Your stay is part of {campaign}"): **solo hotel**; en los demás rubros es `null` (capacidad: la reserva abarca varias noches). El componente compartido pregunta si existe, no por el rubro.
- Textos del fin: "Termina el {día} {a medianoche | a las HH:mm | (sin más)}" y "Terminando…" (comunes a todos los rubros, claves del diccionario).

**Admin** (`perfil.reservas.campanas`; `null` si `reservas` es `null`): nombre del campo de uso: hotel "Estadías", tours "Salidas", eventos "Funciones", locales "Eventos", canchas "Partidos". Las etiquetas salen de ahí: "{Estadías} desde", "{Estadías} hasta", "{Estadías} hasta [N] días después de que termina la campaña". La frase "Así lo verá tu cliente" usa la misma plantilla de la tienda (hay dos copias, una por repo; las ata un test espejo, como ya se hace con las otras copias).

**Textos fijos nuevos (Admin):** "Todo el día", "A las", "Según la plataforma" (solo Cyber Wow), "hora de Lima", "+ Agregar fechas de uso", "Quitar fechas de uso", "Terminó", "Por anunciar", "Fechas de {año} por anunciar". **Ninguno dice "oferta" ni "descuento"** (R1.5.4, R6.5); los textos existentes de los presets ("Ver ofertas") no se tocan.

## Piezas que se reutilizan y piezas nuevas
- Se reutilizan: `app-campo-periodo` (fechas de la campaña propia y su tope), `app-grilla-mes`, `app-calendario-mes`, `app-calendario-rango`, `app-offer-section`, el patrón de panel con Guardar/Descartar, el diálogo de confirmación, la cabecera de plataforma de Parámetros.
- Nuevas, pequeñas: control de hora "Todo el día | A las" (Admin, compartido entre Campañas y Plataforma); recuadro "Fechas de uso" (Admin); `DiaCalendario.campana?: boolean` y `LeyendaCalendario.campana?: string` (Tienda; cada rubro llena el flag en su estrategia solo en días ya habilitados); etiqueta "◆ Fechas de {campaña}" (funciones de eventos); línea de uso en `app-offer-section` y banda de respaldo. `PiezasUi` no cambia: ninguna pieza nueva de slot.

## Lugar que se deja para la Fase 2 (una línea cada una)
- **R4 (repetición semanal):** en la campaña propia, bajo las horas de "Cuándo se ve tu tienda" cabe un "Repetir cada semana" (días + una franja), y la fila del calendario ganará un chip "Mar y mié, 9:00 – 17:00"; el efecto "solo el día clave" se ocultará con repetición.
- **R5 (descuento):** "Fechas de uso" es el recuadro donde luego irá "Descuento asociado" (con la confirmación explícita de R5.6); la marca y la leyenda ya sirven, y entonces el texto "no cambia tus precios" pasa a depender de si hay descuento. Al llegar a R5, la retención de 15 s del cambio de pestaña (pantalla 9) no puede mostrar precios con descuento vencido: decide el servidor.

## Propuestas a la spec (no las cambio yo)
- **P1.** El API de plataforma devuelve cuántas tiendas tienen activa la campaña (para el diálogo de la pantalla 5). Opcional: sin él, el diálogo omite el número.
- **P2.** El catálogo declara las **ediciones esperadas** del Cyber Wow (abril, julio, noviembre). Sin eso, el Admin solo conoce lo cargado y no puede mostrar "noviembre: por anunciar" (R2.6.2, CA-2.3).
- **P3.** Aclarar R3.3 para Cyber Wow: la hora de la tienda es **una sola pareja** (inicio, fin) que vale para todas las ediciones; vacía, manda la hora que cargó la plataforma.
- **P4.** Aclarar que en el catálogo "Hora de fin = 00:00" es el instante 00:00 **del último día incluido** (R3.14 literal): la campaña ya terminó y el último día no se ve. El panel lo explica con una frase (pantalla 2). Si Diego prefiere que 00:00 signifique "medianoche al terminar el último día" (= todo el día), se cambia el texto.
- **P5.** R3.9.3 hoy dice que la tienda descarta campañas con `ahora >= fin`. Para la pestaña abierta se propone **retener la vista hasta 15 s** al llegar al fin, para que Black Friday → Cyber Monday no pase por el diseño normal (pantalla 9). Al cargar la página sigue valiendo el descarte inmediato.
- **P6.** Vista previa de Diseño: mandar un momento dentro de la ventana de la campaña (pantalla 6).
- **P7 (opcional).** Un campo "Fuente (texto o enlace)" en cada edición del panel de plataforma, porque la prensa publica fechas distintas (riesgo "fechas del IAB mal cargadas"). No está en la spec; no está dibujado en el prototipo.
- **P8.** El efecto festivo no se dispara en caliente en una pestaña abierta (pantalla 9).

## Decisiones de diseño por aprobar
- **A.** Hora como "Todo el día | A las [HH:mm]" (y "Según la plataforma" en Cyber Wow), no un campo de hora vacío. *Descartado:* `input time` solo: vacío dice "--:--" y no explica qué pasa sin hora (CA-3.11).
- **B.** Fechas de uso detrás de "+ Agregar fechas de uso" (opcional por spec) y con la línea "Así lo verá tu cliente" dentro del panel. *Descartado:* una casilla "Tiene fechas de uso" (un interruptor más; la pantalla ya tiene los de activar).
- **C.** La marca es un **rombo ◆** con leyenda "Fechas de {campaña}", en la esquina superior izquierda de la celda, independiente de `tono`; etiqueta equivalente en funciones de eventos. *Descartado:* tintar el fondo de la celda (choca con "pocos cupos" y con la banda del rango) y un punto circular (se confunde con "tarifa más baja" y "hoy").
- **D.** La línea de la portada vive **dentro del bloque de la campaña**, y el fin se escribe una sola vez (en la línea, o bajo la cuenta regresiva si no hay línea). *Descartado:* línea propia siempre (repetiría el fin junto a la cuenta regresiva).
- **E.** "Tu estadía entra en {campaña}" en el pie del rango del hotel, solo con estadía completa. *Descartado:* aviso de "parcial".
- **F.** Pestaña abierta: retener la vista hasta 15 s, un solo fundido, sin efecto en caliente (P5, P8).
- **G.** El panel del catálogo ordena Cuándo → Fechas de uso → Efecto (cambia el orden actual).
- **H.** Pantalla de plataforma `/campanas-plataforma` con formulario en la fila, historial visible y un diálogo solo al cambiar una edición ya cargada. *Descartado:* ponerla como un grupo más de "Parámetros de la plataforma" (no son parámetros sueltos: tienen año, tramos y validaciones cruzadas).
- **I.** El dueño ve las ediciones del Cyber Wow en solo lectura; la carga vive solo en plataforma (un dato, un lugar).

## Checklist de reglas de la casa
- [x] Sin información duplicada en la misma pantalla: el fin de la campaña se escribe una vez (línea o pie de la cuenta); el rango de la fila y el del panel no se repiten como texto aparte; la lista de ediciones del dueño es de lectura y la edición vive solo en plataforma; la frase "Así lo verá tu cliente" muestra otra pantalla, no repite un dato de ésta.
- [x] Un solo CTA principal a la vista: Guardar por panel; en la tienda, el del hero o el de cada selector. No se agrega barra fija en ninguna pantalla.
- [x] Header siempre visible en móvil (cuenta e idioma) en la portada y en la reserva; la línea de la campaña no lo toca.
- [x] UI automática / responsive, sin toggles de vista; el prototipo muestra escritorio y celular lado a lado con un solo scroll y enlaces inertes.
- [x] Accesibilidad:
  - Contraste AA en textos nuevos: ayudas en gris 600 o más oscuro (no el gris 400 que usan algunos textos viejos); el rombo pide 3:1 y cae al color del texto si no llega.
  - Foco visible en el control de hora (radios con anillo) y en todo lo nuevo.
  - Etiquetas: radiogrupo con `aria-label`, hora con etiqueta, errores con `role="alert"` y `aria-invalid`, ayudas con `aria-describedby`; el rombo es `aria-hidden` y su significado va en la etiqueta de la celda y en la leyenda.
  - Objetivos táctiles de 44 px en todo control nuevo. **Excepción heredada, no cambia aquí:** las celdas del calendario de la tienda miden 40 px (selector-fechas R2.5) y los botones actuales del Admin 36 px; subirlos es otra tarea.
  - Reflujo a una columna y sin dependencia del color solo (forma + texto).
  - Movimiento reducido: el fundido de la pantalla 9 pasa a cambio directo.
- [x] Nada dependiente del rubro fuera de un slot ni de un perfil: textos y nombre del campo en el perfil; el componente pregunta por la capacidad (`recibeReservas`, `entra != null`); sin `if` por rubro. SSR: la campaña solo existe en el navegador (el resolver del servidor devuelve `{}`), así que la línea y las marcas no crean diferencias de hidratación; a confirmar con el `arquitecto`.

## Prototipo
- **Parte de:** pantalla actual de Campañas (sin diseño vigente en el índice) y `selector-fechas/v1.html` para los calendarios.
- **Copia en el repo:** [`docs/disenos/campanas-cuando/v1-2026-10-19.html`](../../disenos/campanas-cuando/v1-2026-10-19.html)
- **Original (claude.ai):** no se dibujó en claude.ai; el HTML del repo es la fuente de verdad.
- **Cómo verlo:** abrir el archivo en el navegador; ocho secciones numeradas (tabla de contenido arriba), un solo scroll, enlaces inertes. Equivalencia con este documento: prototipo 1-4 = pantallas 1-4 (más los estados de error y fin a las 00:00 en el 2), prototipo 5 = pantalla 5, prototipo 6 = pantalla 7 (portada), prototipo 7 = pantalla 8 (selectores), prototipo 8 = pantalla 9 (pestaña abierta). La pantalla 6 (vista previa de Diseño) no tiene dibujo. Las únicas interacciones son el control "Todo el día / A las" en los paneles del Admin.
