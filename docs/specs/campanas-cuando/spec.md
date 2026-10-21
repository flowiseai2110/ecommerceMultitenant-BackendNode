# Spec: Campañas, "el cuándo" (ventana de uso, fechas por año, horas, repetición y descuento)

> Estado: aprobado · Fecha: 2026-10-19 · Rubros: productos, hotel, tours, eventos, locales, canchas (según la pieza; ver tabla)
> Repos: Backend · Admin · Tienda
> Extiende: [campanas-widgets](../campanas-widgets/spec.md) y [efectos-festivos](../efectos-festivos/spec.md).
> Relacionadas: [reserva-hotel-mejoras](../reserva-hotel-mejoras/spec.md) (H3, código promocional), [multi-sede](../multi-sede/spec.md), [selector-fechas](../selector-fechas/spec.md).
> Regla vigente desde 2026-10-19: **Campañas es el cuándo; Diseño es el cómo** (ver `campanas-widgets/cambios.md`). Todo lo de esta spec se configura en Campañas, junto a las fechas que ya se editan allí.
> **Actualización 2026-10-20:** esa regla fue reemplazada por [ADR-0002](../../adr/ADR-0002-campana-en-tres-pasos.md) (la campaña en tres pasos). El **R5** (descuento real) se especifica ahora en [campanas-descuento](../campanas-descuento/spec.md), que también cambia el aviso R8.7.

## Por qué

Hoy una campaña solo sabe de **días completos**, de **una sola ventana** y de **fechas que se calculan solas** cada año. Eso deja fuera tres cosas que las tiendas ya necesitan:

1. **Los negocios con reserva no venden "hoy para hoy".** Un hotel que lanza un Black Friday quiere decir "reserva del 20/11 al 3/12 para estadías hasta el 31/03". Hoy la campaña solo tiene una ventana, la de la tienda vestida, y no hay dónde decir para qué fechas de uso vale.
2. **El comercio peruano tiene eventos cuyas fechas no se pueden calcular.** El Cyber Wow del IAB Perú se hace tres veces al año y sus fechas se anuncian cada vez. La regla actual (fecha fija o n-ésimo día del mes) no puede representarlo.
3. **Una campaña de un día entero es muy gruesa.** Una oferta flash arranca a las 10:00 y termina a las 22:00, y la "hora baja" de una cancha es de martes y miércoles de 9 a 17. Y el descuento de verdad (que la campaña lo active y desactive sola) no existe: la campaña es solo visual.

La spec fija el alcance por fases. **Fase 1** es lo que se construye primero (ventana de uso, fechas por año, horas). **Fase 2** se especifica a nivel de requisitos y se construye después (repetición semanal, descuento real). El **futuro** solo se lista.

## Contexto: cómo funciona hoy (verificado en el código el 2026-10-19)

- Una campaña es **solo visual**: paleta, barra superior, portada, cinta, cuenta regresiva de texto, adornos y efecto. **No aplica descuentos.**
- Cada campaña de la tienda tiene un interruptor **activa**. Hay 11 campañas del catálogo de la plataforma (verano, amistad, niño, madre, padre, fiestas patrias, primavera, Halloween, Black Friday, Navidad, Año Nuevo). Su fecha clave sale de una regla: fecha fija o n-ésimo día de la semana del mes, con desfase.
- La tienda ajusta cuántos días **antes** y **después** (0 a 60). Una campaña propia lleva fecha de inicio y de fin ("YYYY-MM-DD", ambas incluidas, máximo 90 días, no se repite).
- El efecto festivo se ve el **día clave** o **toda la campaña**.
- Si dos campañas se cruzan gana la de mayor prioridad y, si empatan, la de ventana más corta.
- Todo se calcula en el servidor, en **días completos de Lima (UTC-5 fijo)**. La tienda recibe la campaña ya resuelta, con `inicio`, `fechaClave` y `fin` en ISO con `-05:00`, y no calcula fechas.
- La vista previa del admin acepta solo una **fecha** y se calcula al mediodía de Lima.
- Código: `modules/campanas/` (`calendario.js`, `resolver.js`, `presets.js`, `campanas.schema.js`); Admin: `pages/campanas/`, `models/campana.model.ts`, `pages/diseno/campana-edicion.ts`.

### Dos hallazgos que cambian el planteamiento

1. **El código promocional del hotel no existe todavía.** `reserva-hotel-mejoras` H3 está **pospuesto** (decisión del 2026-10-16: "se hace cuando un cliente lo pida"); las tareas 3.1 a 3.3 siguen sin hacer. Lo que sí existe es el módulo de **cupones**, que es de **productos**: `docs/rubros/productos.md` PRO-18 dice "no se usan cupones en rubros de reserva", y en locales el cupón sigue pendiente (`locales.md`, L1.3). Además, en productos **el precio y el descuento los manda el navegador** y el servidor no los recalcula (riesgo registrado en `productos.md`). La Fase 2 (R5) tiene por eso **prerrequisitos**; ver R5.
2. **La caché pública de la tienda es de 5 minutos, no de 60 segundos.** `campanas-widgets` R3.4 dice 60 s, pero `routes/store/index.js` usa `cache(300)` para `/store/tiendas`, y `efectos-festivos` ya lo reconoce. Con horas, una campaña puede empezar o terminar hasta 5 minutos tarde en la tienda (ver R3.9 y la pregunta Q7).

### Referencias de otros sistemas

Las dio Diego; no las revisé una por una para esta spec.

| Sistema | Qué hace | Qué tomamos |
|---|---|---|
| Shopify (Launchpad) | Programa un cambio con hora de inicio y de fin, y **revierte solo** | Horas de inicio y fin, vuelta automática (R3) |
| VTEX | Promociones con **recurrencia por días de la semana y horas** | Repetición semanal con franja (R4) |
| Tiendanube | Promociones con fecha y hora | Hora de inicio y fin (R3) |
| Salesforce Commerce Cloud | La **campaña agrupa** promociones y cupones, y se dirige a grupos de clientes y tiendas | Campaña ligada a un descuento (R5); grupos y tiendas quedan en futuro |
| Adobe Commerce | **Vista previa** del sitio en una fecha futura | Vista previa con hora (R3.11); el enlace para compartir queda en futuro |
| Booking.com | La oferta separa **fechas de reserva** y **fechas de estadía** | Ventana de uso (R1) |

Sobre el Cyber Wow: lo organiza el IAB Perú y se hace **tres veces al año** (abril, julio y noviembre). La prensa publica fechas **distintas** para las ediciones de 2026 (por ejemplo, una nota da abril del 6 al 9 y otra del 20 al 23; noviembre aparece del 2 al 5 en una sola fuente). Por eso **ningún dato de esta spec es una fecha oficial**: las fechas se cargan a mano, desde el canal oficial del IAB, cada vez que las anuncian (R2). Las fechas que aparecen en los criterios son de ejemplo. Fuentes consultadas el 2026-10-19: [Caretas](https://caretas.pe/?p=808869), [Caretas](https://caretas.pe/?p=797412), [Infomercado](https://infomercado.pe/cyber-wow-2026-cuando-empieza-y-cuanto-dura/), [Perú Retail](https://www.peru-retail.com/cuando-es-el-cyber-wow-2026-y-como-aprovechar-mejor-sus-ofertas/).

## Conceptos

- **Ventana de reserva:** el periodo en que la tienda se viste de campaña. Es la ventana que la campaña ya tiene hoy; aquí solo se le agrega la hora.
- **Ventana de uso:** las fechas en que el cliente **usa** lo que reserva (alojarse, viajar, asistir, jugar). Solo existe en tiendas cuyo rubro recibe reservas.
- **Fecha "por año":** una regla de fecha en la que la plataforma carga, para cada año, las fechas exactas de uno o más tramos (por ejemplo, las tres ediciones del Cyber Wow). No se calcula.
- **Edición:** cada tramo de una fecha por año ("Cyber Wow de julio").
- **Franja:** un rango de horas dentro de un día ("de 9:00 a 17:00").

## Rubros: dónde aplica y cómo

| Rubro | ¿Aplica? | Cómo se comporta | Regla de negocio que lo condiciona (`docs/rubros/<rubro>.md`) |
|---|---|---|---|
| productos | R2 sí, R3 sí, R4 sí, R5 con condiciones. **R1 no** | Horas, fechas por año y repetición funcionan igual que en cualquier rubro. **No tiene ventana de uso**: el panel no muestra esos campos y el API los rechaza. El descuento ligado (R5) usaría el módulo de cupones, que solo existe aquí. | PRO-18 (cupón: activo, vigente, usos, mínimo; tipo porcentaje o monto fijo). Riesgo abierto: el servidor no recalcula precio ni descuento. |
| hotel | R1 sí (por noche), R2 a R4 sí, R5 después de construir el código promocional | La ventana de uso se marca **noche por noche** en el calendario de precios del buscador y de la habitación. Es la que más se parece a Booking. No cambia precio ni cupo. | H-07 (precio por noche), H-11 (impuestos), H-21 (calendario con precio por noche). `reserva-hotel-mejoras` H3 pospuesto. Hotel tiene español e inglés. |
| tours | R1 sí (fecha de salida), R2 a R4 sí, R5 después | Se marcan las **fechas de salida elegibles** que caen dentro del uso. **Nunca se afirma disponibilidad**: la agencia confirma cada solicitud. | T-01 (solo días de salida), T-02 (sin cupo por salida), T-07 (cierres). |
| eventos | R1 sí (fecha de la función), R2 a R4 sí, R5 después | Se marca cada **función** cuya fecha cae dentro del uso (una etiqueta en la función, no un calendario). El cupo y la venta no cambian. | EV-05 y EV-06 (estado y cierre de venta). |
| locales | R1 sí (fecha del evento), R2 a R4 sí, R5 después | Se marcan las **fechas libres** del salón dentro del uso. Una fecha ocupada no lleva marca. | LOC-01 (hora de Lima), LOC-03 (fecha no se vende dos veces), LOC-07 (la cotización congela el precio 7 días). Cupón de locales pendiente. |
| canchas | R1 sí (día del turno), R2 a R4 sí. **R4 es su caso principal** ("hora baja"). R5 después | Se marcan los **días** dentro del uso en el selector de día. La franja de R4 es solo de la campaña; no cambia la tarifa de día y de noche. | CAN-03 (horario), CAN-04 (tarifa por bloques de 30 min), CAN-05 (finde y feriado todo noche). |

Los `docs/rubros/*.md` están al día (revisados el 2026-10-18). No hace falta llamar a un `analista-<rubro>` antes de aprobar la Fase 1. **Sí hace falta** antes de la spec del descuento (R5): `analista-hotel`, `analista-productos` y `analista-locales`.

## Cómo dividirlo (propuesta)

El requerimiento es grande. Se parte en piezas que se construyen, prueban y despliegan de a una.

| Pieza | Fase | Qué es | Depende de |
|---|---|---|---|
| P1 | 1 | Horas de inicio y fin (R3) | nada; **va primero** porque cambia la ventana, de "días" a "instantes" |
| P2 | 1 | Fechas por año: Cyber Wow y Cyber Monday (R2) | P1 (las ediciones también llevan hora) |
| P3 | 1 | Ventana de uso (R1) | nada técnico; es la que toca más pantallas de la tienda (cinco rubros) |
| P4 | 2 | Repetición semanal con franja (R4) | P1 |
| P5 | 2 | Campaña ligada a un descuento real (R5) | P1, P3 y el código promocional de reservas. **Spec propia** (`campanas-descuento`) cuando llegue el momento: toca precios y pagos |

El orden de construcción de la Fase 1 (P1, P2, P3) difiere del orden en que Diego numeró los puntos; la razón está en la tabla.

## Requisitos

### R1. Ventana de uso para los rubros con reserva (Fase 1, pieza P3)

- R1.1 Una campaña de una tienda de un rubro que **recibe reservas** puede tener, además de su ventana de reserva, una **ventana de uso**: las fechas en que se usa lo reservado. Se pregunta por la **capacidad** "recibe reservas" (`recibeReservas`), nunca por el nombre del rubro. En una tienda sin esa capacidad (productos) el campo no se muestra y el servidor lo rechaza.
- R1.2 La ventana de uso es **opcional**. Sin ella, la campaña se comporta exactamente como hoy.
- R1.3 **Campaña propia:** la ventana de uso tiene fechas explícitas, "desde" y "hasta" (día completo, hora de Lima). "Desde" puede quedar vacío ("desde que reservo"). "Hasta" es obligatorio si hay ventana de uso, y no puede pasar de un año después del fin de la campaña (igual al tope de anticipación de las reservas).
- R1.4 **Campaña del catálogo (se repite cada año):** la ventana de uso se expresa con **días relativos**, porque una fecha escrita se vencería el año siguiente: "hasta N días después de que termina la campaña" (0 a 365) y, opcionalmente, "desde N días después de que empieza". Propuesta a confirmar (Q6).
- R1.5 **Qué hace la ventana de uso.** Como la campaña no aplica descuento, la ventana de uso es **informativa y de orientación** (propuesta a confirmar por Diego, Q1). Mientras la campaña está vigente:
  - R1.5.1 **Una línea informativa en la portada**, en el bloque de la campaña, con la voz del rubro: "Reserva hasta el 3 dic · para alojarte hasta el 31 mar". Aparece **una sola vez** en la pantalla (no se repite en la barra superior ni en la cinta).
  - R1.5.2 **Una marca en el selector de fecha o de función**, con leyenda "Fechas de {nombre de la campaña}": un punto en el calendario (hotel, tours, locales, canchas) o una etiqueta en la función (eventos). Solo sobre fechas que el cliente **ya puede elegir**; no se marca lo cerrado, lleno u ocupado.
  - R1.5.3 La marca **no cambia** precio, cupo, disponibilidad, plazos ni reglas de la reserva, y **no deshabilita** las fechas fuera del uso.
  - R1.5.4 Los textos **no dicen "oferta" ni "descuento"**: la campaña no los garantiza (mientras no exista R5). Lo que prometa la tienda en su portada es responsabilidad del dueño, como hoy.
- R1.6 **Opciones descartadas de la Fase 1** (para que no entren solas): *filtrar o reordenar lo destacado* por la ventana de uso (no existe "destacado por fecha" y habría que definirlo); y *permitir reservar solo dentro del uso* mientras dura la campaña (la campaña no toca las reglas de la reserva; esto recién tiene sentido con un descuento real, R5.3).
- R1.7 Cuando la campaña termina, la línea y las marcas desaparecen solas con ella.
- R1.8 **Hotel:** en el calendario, cada **noche** se marca por separado según su fecha (orienta). Cuando el huésped ya eligió sus fechas, la frase "Tu estadía entra en {campaña}" aparece **solo si todas las noches** caen dentro del uso, como hace Booking con sus promociones (Q8). Con descuento (R5.3) vale la misma regla: estadía completa.
- R1.9 **Textos por rubro en el perfil, no en ramas.** La frase de uso ("para alojarte hasta…", "para viajar hasta…", "para asistir a funciones hasta…", "para eventos hasta…", "para jugar hasta…"), la leyenda de la marca y el nombre del campo en el Admin ("Estadías hasta", "Salidas hasta"…) viven en el perfil de cada rubro, en la tienda y en el Admin. El componente compartido no pregunta por el rubro. Los rubros que ya tienen inglés (hoy, hotel; tours por confirmar) llevan también la frase en inglés; los demás, solo en español, como hoy.
- R1.10 **Un dato, un lugar.** La ventana de uso se edita **solo en Campañas**, junto a las fechas de la campaña. En Diseño no hay un segundo campo. La frase de la portada se arma sola; no se escribe a mano en la Fase 1.

- R1.11 **Oculto (2026-10-20).** Sin la promoción para reservas, las fechas de uso no aportan y el concepto (dos ventanas, días relativos) confunde a un dueño que no es de marketing. La sección no se muestra en el Admin y la tienda no muestra la línea ni el rombo (`FECHAS_DE_USO_VISIBLES` en el Admin, `FUNCIONES_CAMPANA.fechasDeUso` en la tienda). El código y los datos se conservan. Las validaciones de uso del backend (R8.3, R8.4) solo corren si el uso cambia, para que un dato oculto no bloquee. Vuelve rediseñado dentro del paso 3 de campanas-descuento, como una sola pregunta con fechas: "¿Para qué fechas vale la oferta?" ([Cualquier fecha] / [Desde … hasta …]); en las campañas que se repiten, el sistema convierte a días y muestra "El próximo año: …".

### R2. Fechas fijadas cada año por la plataforma (Fase 1, pieza P2)

- R2.1 Se agrega un tipo nuevo de fecha clave, **"por año"**: la **plataforma** carga, para cada año, una o más **ediciones** con su fecha de inicio y de fin (con hora opcional, ver R3). No se calcula.
- R2.2 Se agregan al catálogo dos campañas nuevas:
  - **Cyber Wow** (IAB Perú): de 0 a 3 ediciones al año (abril, julio y noviembre), cargadas según se anuncian.
  - **Cyber Monday**: el lunes siguiente al Black Friday. Esta **se calcula con la regla que ya existe** (jueves 4.º de noviembre más 4 días): 30 nov 2026 y 29 nov 2027. No necesita carga anual.
- R2.3 **Una campaña, varias ediciones.** La tienda activa Cyber Wow **una sola vez** y vale para todas las ediciones del año. El calendario del Admin muestra una barra por edición. "En curso" y "Empieza en N días" hablan de la edición vigente o de la próxima.
- R2.4 **Quién carga y cómo.** Solo el **administrador de la plataforma**, **sin publicar una versión nueva del sistema**. (Hay precedentes: los parámetros de plataforma, y los feriados del Libro de Reclamaciones, que hoy sí requieren publicar.) Se carga: año, nombre de la edición ("abril"), inicio y fin. Validaciones: el fin es posterior al inicio; dos ediciones del mismo año no se cruzan; cada edición dura como máximo 30 días (propuesta).
- R2.5 **Qué ve el cliente en cada edición.** El "día clave" de una fecha por año son **todos los días de la edición**. La tienda puede ajustar los días de anticipación y de después, igual que en las demás. La campaña vigente se resuelve como siempre: prioridad y, si empatan, ventana más corta. Propuesta de prioridad para Cyber Wow: **2**, igual que Black Friday, porque cae dentro de otras campañas (la de julio dentro de Fiestas Patrias; la de abril, junto al Día del Niño).
- R2.6 **Qué pasa si un año aún no tiene fecha cargada:**
  - R2.6.1 La campaña **no se muestra** ese año. El sistema **no usa las fechas del año anterior** ni inventa una estimación.
  - R2.6.2 Se resuelve **por edición**: si el año tiene solo abril y julio cargadas, esas se muestran y la de noviembre queda "por anunciar".
  - R2.6.3 En el Admin, la fila de la campaña sigue visible y dice "Fechas de {año} por anunciar". El dueño **puede dejarla activada**: cuando la plataforma cargue las fechas, se mostrará sola, sin que él haga nada.
  - R2.6.4 La plataforma **se entera** de que faltan fechas (aviso en la bitácora y, si Diego lo aprueba, un correo al administrador de la plataforma). Cuándo avisar: Q10.
- R2.7 **Cambiar fechas ya cargadas** (el IAB reprograma) es posible. Las tiendas lo ven en el plazo de la caché (hasta 5 min). Si la edición estaba en curso y se acorta, termina en el nuevo fin. Queda registrado quién la cambió y cuándo.
- R2.8 El sistema **no consulta** el sitio del IAB ni ninguna fuente externa: las fechas las carga una persona (ver el contexto: las fuentes de prensa no coinciden).

- R2.9 **"Mis fechas" sobre una campaña del catálogo (2026-10-20).** Toda campaña del catálogo (por regla o por año) se puede usar con **"Fechas oficiales"** (por defecto: la regla o las ediciones de la plataforma, como hasta ahora) o con **"Mis fechas"**: el dueño elige inicio y fin, con hora opcional, hasta 90 días, igual que una campaña propia, y **conserva todo el aspecto del preset** (colores, portada, cinta, adornos, efecto). Motivo: cada tienda planea su Cyber Wow (u otra) en fechas distintas y no debe depender de la plataforma.
  - R2.9.1 Con "Mis fechas" no se usan los días antes/después ni las ediciones; la prioridad sigue siendo la del preset. El efecto "solo el día clave" toma como día clave el **último día** (como una propia).
  - R2.9.2 Las fechas de uso siguen en días relativos (R1.4), contados desde las fechas de la tienda.
  - R2.9.3 Validación: inicio y fin van juntos; las mismas reglas que una propia (fin posterior al inicio, hasta 90 días); no se mezclan con días antes/después.
  - R2.9.4 Volver a "Fechas oficiales" borra las fechas de la tienda.

### R3. Hora de inicio y de fin (Fase 1, pieza P1)

- R3.1 Toda campaña, del catálogo o propia, puede tener **hora de inicio** y **hora de fin** (HH:mm, al minuto), en **hora de Lima**.
- R3.2 **Campaña propia:** la fecha de inicio y la de fin llevan cada una su hora.
- R3.3 **Campaña del catálogo (con regla o por año):** la hora de inicio vale para el **primer día** de la ventana y la de fin para el **último día**. Para una fecha por año, la plataforma trae sus propias horas (R2.4) y la tienda puede cambiarlas.
- R3.4 **Qué significa "fin".** "Termina a las 22:00" quiere decir que se ve hasta las 21:59 y a las 22:00 ya no. Sin hora, se mantiene el comportamiento de hoy: el inicio es a las 00:00 y el fin es al terminar el día.
- R3.5 **Compatibilidad.** Una campaña guardada **sin hora** es un **día completo**, y se resuelve y se entrega **idéntica** a como se hace hoy. No hay que migrar ni modificar los datos guardados. Se puede poner solo la hora de inicio, o solo la de fin; la otra se queda en el día completo.
- R3.6 **Validaciones.** El fin es posterior al inicio (en el mismo día, la hora de fin va después de la de inicio). Las campañas propias siguen con el máximo de 90 días. En una campaña del catálogo, ninguna combinación de anticipación, días después y horas deja una ventana vacía o negativa (se rechaza con un mensaje claro).
- R3.7 **Efecto.** La ventana del efecto sigue recortada a la ventana de la campaña (efectos-festivos E2.2). Si la campaña termina el día clave a las 14:00, el efecto de ese día también termina a las 14:00.
- R3.8 **Cuenta regresiva.** Llega a cero exactamente en el `fin`, a la hora, y no al terminar el día.
- R3.9 **Las horas frontera son exactas (Q7).** Hoy `/store/tiendas` responde con `max-age=300, stale-while-revalidate=150`: una respuesta guardada antes de un inicio **no trae** la campaña nueva (el backend nunca publica las futuras), así que el inicio puede llegar hasta **7,5 min tarde**; el fin ya es exacto al cargar (la tienda descarta la campaña con `ahora >= fin`). Ejemplo: el lunes de Cyber Monday a las 00:00 la tienda seguiría con Black Friday hasta 7,5 min. Se corrige así:
  - R3.9.1 **La caché vence en el próximo cambio.** El `max-age` de la respuesta es el menor entre 300 s y los segundos que faltan para el **próximo cambio** de lo que ve el cliente: inicio o fin de cualquier campaña activa de la tienda, inicio o fin de la ventana del efecto (día clave) y, con R4, inicio o fin de la franja. Sin `stale-while-revalidate` cuando el próximo cambio está a menos de 450 s. Precedente: `/live` ya calcula su TTL según la expiración (`ttlHastaExpirar` en `routes/store/index.js`).
  - R3.9.2 **La pestaña abierta cambia sola.** La API devuelve también `proximoCambio` (instante, o null). La tienda programa un temporizador a ese instante y vuelve a pedir la tienda; así una pestaña abierta pasa de Black Friday a Cyber Monday, o vuelve al diseño normal, sin recargar. El temporizador corre **fuera de la zona de Angular** (ver el problema conocido de timers y el scroll del router) y se reprograma con cada respuesta. Un desfase aleatorio de 0 a 10 s evita que todas las pestañas pidan al servidor en el mismo segundo.
  - R3.9.3 **Reloj del servidor, no del cliente.** La respuesta trae `ahora` (hora del servidor). La tienda calcula la diferencia con su reloj y la usa para descartar campañas terminadas, para la cuenta regresiva y para el temporizador. Un celular con la hora mal no adelanta ni atrasa la campaña.
  - R3.9.4 **Cambios manuales** (el dueño apaga o edita una campaña, la plataforma corrige una edición) no son horas frontera: se ven en la próxima carga después de que venza la caché (hasta 5 min). Es aceptable: lo que cobra lo decide el servidor (R5.2).
  - R3.9.5 El tema que el navegador guarda sigue venciendo en el fin exacto de la campaña.
- R3.10 **Si se cruzan:** misma regla (mayor prioridad y, si empatan, ventana más corta), ahora medida en horas.
- R3.11 **Vista previa con hora.** La vista previa del Admin acepta fecha y **hora opcional** ("la tienda el 29 de nov a las 21:00"). Sin hora, se mantiene el mediodía de Lima de hoy. El endpoint público sigue sin aceptar una fecha simulada.
- R3.12 **En el Admin**, junto al campo de fecha de la campaña: "Empieza [fecha] [hora]" y "Termina [fecha] [hora]"; con la hora vacía dice "todo el día". En las del catálogo, "Hora de inicio" y "Hora de fin" van en el mismo panel que "Empieza (días antes)" y "Sigue (días después)". El calendario del año muestra la hora en el texto del rango y mantiene la barra por día.
- R3.13 La zona sigue siendo la de Lima para todos los visitantes, esté donde esté el cliente (Perú no cambia de hora en el año).
- R3.14 **Cómo se escribe el fin.** Un fin a las 00:00 se muestra al dueño y al cliente como el final del día anterior ("termina el lunes 30 a medianoche", no "el martes 1 a las 00:00"). En el Admin, elegir "Termina el 30 nov, todo el día" y "Termina el 1 dic a las 00:00" dan el mismo instante.

### R4. Repetición semanal por días y franja horaria (Fase 2)

Se especifica ahora, se construye después de la Fase 1. Pensada para canchas y locales ("hora baja los martes y miércoles de 9 a 17"), pero es de cualquier rubro.

- R4.1 Una **campaña propia** puede repetirse cada semana: uno o más días (lunes a domingo) y **una franja** (hora de inicio y de fin, en hora de Lima), dentro de su ventana de reserva (R3). Para dos franjas distintas, dos campañas. Las del catálogo no se repiten por semana.
- R4.2 Fuera de la franja la campaña **no se ve**, y la tienda vuelve a su diseño de siempre. Dentro de la franja se ve completa.
- R4.3 La cuenta regresiva cuenta hasta el fin de la **franja de hoy**.
- R4.4 Con repetición, el efecto solo tiene el modo "toda la campaña" (se ve cuando la franja está en curso, una vez por visita). La opción "solo el día clave" no se muestra.
- R4.5 Si se cruza con otra campaña, la comparación de la "ventana más corta" usa la **franja de hoy** y no el periodo total (propuesta, Q9).
- R4.6 La franja no cruza medianoche en esta versión (Q9): los complejos de canchas cierran como máximo a las 00:00 (CAN-03), así que basta permitir que una franja **termine** a las 00:00 (p. ej. 22:00 a 00:00). Los finales de semana y feriados no tienen tratamiento especial.
- R4.6b **No reemplaza la tarifa.** Canchas ya tiene tarifa de día y de noche (CAN-03). La repetición semanal **anuncia** la hora baja; el precio por franja sigue en la tarifa del rubro. El panel lo dice.
- R4.7 El Admin avisa al dueño: "Tu tienda cambiará de aspecto en estos horarios". El diseño recomendará que estas campañas sean livianas (para el `disenador`). Mientras no exista R5, el panel recuerda que la campaña **no cambia el precio**.
- R4.8 Los bordes de la franja son horas frontera: exactos por R3.9.1 y R3.9.2.
- R4.9 Con repetición, la campaña puede durar **hasta 365 días** (la hora baja de los clubes es permanente); sin repetición siguen los 90 (Q9).

### R5. Campaña ligada a un descuento real (Fase 2, spec propia)

**Es crítico: toca precios y pagos.** Aquí solo se fijan los requisitos y los prerrequisitos; antes de construir se escribe `docs/specs/campanas-descuento/spec.md` con los analistas de rubro.

**Prerrequisitos (no existen hoy):**
- P-a. **El código promocional en las reservas.** `reserva-hotel-mejoras` H3 está pospuesto; los cupones actuales son de productos. Hay que decidir si se construye el H3 del hotel y se generaliza a los demás rubros con reserva, o si se generaliza el módulo de cupones.
- P-b. **Productos: que el servidor recalcule precio y descuento.** Hoy se confía en lo que manda el navegador (`productos.md`). Sin eso, ligar una campaña a un descuento en productos no es seguro.

Requisitos:
- R5.1 Una campaña puede tener **un descuento asociado**, opcional: un código de la tienda o uno creado desde la campaña (Q12).
- R5.2 El descuento **vale solo mientras la campaña está vigente** (incluida la hora y la franja). Empieza y termina **solo**, sin intervención. Quien decide es el **servidor** al cotizar y al crear el pedido o la reserva, **nunca** la caché de la tienda ni el navegador: aunque la tienda muestre un dato de hace cinco minutos, el descuento ya no se acepta después del fin.
- R5.3 En los rubros con reserva, el descuento vale **solo si las fechas de uso caen dentro de la ventana de uso (R1)**, si existe. Aquí la ventana de uso deja de ser informativa.
- R5.4 Modos: **con código** (el cliente lo escribe, o llega con `?codigo=` en el enlace de la campaña) y **automático** (se aplica solo). Propuesta: la Fase 2 solo hace "con código"; el automático se difiere (Q12).
- R5.5 El cliente ve una **línea propia** ("Campaña Cyber Wow −10 %") y el total antes de pagar. El pedido o la reserva **guarda** la campaña, el código y el monto descontado, para soporte, devoluciones y cuentas del dueño.
- R5.6 Activar la campaña **no basta** para activar el descuento: el dueño confirma de forma explícita ("esta campaña aplica un descuento de X"), porque toca precios.
- R5.7 **No se suma** a otros descuentos (plan no reembolsable, cupones, paquetes): se aplica el que da el mejor precio, como hace Booking. **El precio se congela al empezar a pagar**: si la campaña termina mientras el cliente paga, se respeta (en el hotel, durante el apartado de 15 min). Una cotización de locales congelada a 7 días (LOC-07) se respeta igual (Q12).
- R5.8 **El sello "-30 %" de los adornos hoy es solo texto.** Cuando exista este requisito, el porcentaje de un sello debería salir del descuento real, no de un texto libre.

### R6. Transversales

- R6.1 **Un dato, un lugar.** Todo lo de esta spec se edita en **Campañas**, junto a lo que se edita. La pantalla de Campañas conserva su patrón: **un Guardar por campaña**, con Descartar, y el interruptor de activar que se guarda al instante. No se agregan barras fijas.
- R6.2 **Ninguna regla por nombre de rubro** fuera de código que ya es de un solo rubro. Lo que cambia entre rubros (la frase de uso, la leyenda, el nombre del campo) va en el perfil. Lo vigila `scripts/anti-identidad.mjs`.
- R6.3 **Hora de Lima**, siempre, para quien consulte.
- R6.4 **Compatibilidad hacia atrás:** una tienda con campañas guardadas hoy y un navegador con una versión anterior de la tienda siguen funcionando sin cambios.
- R6.5 **Sin lenguaje de descuento** en ningún texto nuevo mientras no exista R5.

### R7. Ajustes aprobados del diseño (2026-10-19, ver diseno.md P1–P8)

- R7.1 (P2) El catálogo declara las **ediciones esperadas** de una campaña "por año" (Cyber Wow: abril, julio, noviembre), para poder mostrar "por anunciar" por edición.
- R7.2 (P3) La hora que pone la tienda en una campaña "por año" es **una sola pareja** inicio/fin que vale para todas sus ediciones.
- R7.3 (P4) En campañas del catálogo **no se ofrece 00:00 como hora de fin**: para incluir el último día completo está "Todo el día".
- R7.4 (P5) Con la pestaña abierta, a la hora frontera la tienda retiene la vista hasta 15 s y cambia con un fundido de 300 ms, sin mover el scroll ni pasar por el diseño normal.
- R7.5 (P6) La vista previa de Diseño usa un momento **dentro** de la ventana de la campaña (no el mediodía fijo).
- R7.6 (P8) El efecto festivo no se reproduce en un cambio en caliente; se verá en la próxima visita.
- R7.7 (P1) Al cambiar una edición ya cargada, el diálogo dice cuántas tiendas tienen activa la campaña.
- R7.8 (P7) Cada edición tiene un campo opcional "Fuente" (enlace del anuncio).

### R8. Validaciones de sentido común (2026-10-20)

Para que un error de quien maneja el marketing no termine en "el sistema me lo permitió". Al guardar, solo se revisan las campañas que cambian (nuevas, o con fechas, horas, uso o estado distintos), para que una vieja no bloquee otros cambios.

**Bloquean (backend, `modules/campanas/sentido.js`; el Admin muestra el mensaje al guardar o activar):**
- R8.1 Una campaña activa con fechas de la tienda (propia o "Mis fechas") que **ya terminó**: "… ya terminó el 5 oct 2025. Revisa el año, o apágala si ya no la usas."
- R8.2 Una que **empieza en más de un año**: "… empieza el …, en más de un año. Revisa el año."
- R8.3 Fechas de uso (propia) que **terminan antes de que empiece la campaña**.
- R8.4 Fechas de uso (propia, activa) que **ya pasaron**.
- R8.5 **Cruce:** dos campañas activas que se cruzan, si al menos una tiene fechas de la tienda: "Aniversario se cruza con Black Friday del 25 nov al 28 nov. Apaga una de las dos o cambia las fechas." Los cruces entre campañas del catálogo con fechas oficiales se permiten (Black Friday con Cyber Monday, Cyber Wow con Fiestas Patrias): los diseñó el sistema y gana la regla de R3.10.

**Avisan sin bloquear (Admin, Diseño en modo campaña, en la parte abierta):**
- R8.7 La tienda escribió una **promesa de descuento** ("%", "descuento", "dscto", "rebaja", "2x1") en el anuncio, la portada, la cinta, la cuenta regresiva o un sello: "Tu campaña no cambia precios… anunciar uno que no existe es publicidad engañosa."
- R8.8 El **color principal no se lee** sobre blanco (contraste WCAG < 3:1).

(El aviso "editar una campaña en curso para que termine en el pasado" queda cubierto por R8.1: para quitarla ya, se apaga.)

## Criterios de aceptación

Formato: **Dado** … **cuando** … **entonces** … (el QA los prueba tal cual). Hora de Lima. Las fechas del Cyber Wow son **de ejemplo**, no oficiales.

### Fase 1, pieza P1: horas (R3)

- CA-3.1 (R3.1, R3.4, productos): Dado una campaña propia de una tienda de productos con inicio 2026-11-20 10:00 y fin 2026-11-22 22:00, cuando se consulta a las 09:59 del 20 nov, entonces la tienda no trae campaña; a las 10:00 del 20 nov, trae la campaña; a las 21:59 del 22 nov, sigue vigente; a las 22:00 del 22 nov, ya no hay campaña.
- CA-3.2 (R3.5, productos): Dado una campaña propia ya guardada con inicio "2026-11-20" y fin "2026-11-22" sin horas, cuando se consulta, entonces es vigente desde el 20 nov 00:00 hasta el 22 nov 23:59:59, y la respuesta trae `inicio` 2026-11-20T00:00:00-05:00 y `fin` 2026-11-23T00:00:00-05:00, igual que antes de este cambio.
- CA-3.3 (R3.3, hotel): Dado Halloween activa con hora de inicio 08:00 y hora de fin 14:00 (anticipación 16, después 0, clave 31 oct 2026), cuando se consulta el 15 oct 07:59, entonces no hay campaña; el 15 oct 08:00, sí; el 31 oct 13:59, sí; el 31 oct 14:00, no.
- CA-3.4 (R3.7, canchas): Dado el caso anterior con efecto "murciélagos" en modo "solo el día clave", cuando es 31 oct 13:59, entonces `efecto` viene con tipo "murciélagos"; a las 14:00 no hay campaña ni efecto.
- CA-3.5 (R3.6, tours): Dado una campaña propia con inicio y fin el mismo día, cuando la hora de fin es igual o anterior a la de inicio, entonces se rechaza con 400 y el mensaje "La fecha y hora de fin deben ser posteriores al inicio".
- CA-3.6 (R3.6, locales): Dado una campaña propia del 1 sep al 30 nov 2026 (91 días), cuando se intenta guardar, entonces se rechaza por exceder 90 días, con o sin horas.
- CA-3.7 (R3.10, eventos): Dado dos campañas propias activas de la misma prioridad, A del 20 nov 10:00 al 22 nov 22:00 (60 h) y B del 21 nov 00:00 al 21 nov 23:59 (24 h), cuando es el 21 nov 12:00, entonces se muestra B; el 20 nov 12:00, A; el 22 nov 12:00, A.
- CA-3.8 (R3.8, productos): Dado una campaña con cuenta regresiva y fin 22 nov 22:00, cuando faltan 30 min, entonces la cuenta regresiva muestra 30 min, y llega a cero a las 22:00.
- CA-3.9 (R3.11, hotel): Dado una campaña que empieza el 29 nov a las 20:00, cuando el Admin pide la vista previa del 29 nov sin hora, entonces la vista usa las 12:00 y no muestra la campaña; con hora 21:00, sí la muestra.
- CA-3.10 (R3.11, todos): Dado el endpoint público de la tienda, cuando se le envía una fecha u hora simulada, entonces la ignora o la rechaza, y resuelve con la hora real.
- CA-3.11 (R3.12, R6.1, productos): Dado el panel de una campaña propia en Campañas, cuando el dueño pone hora de inicio y de fin y pulsa Guardar, entonces se guarda; sin cambios, Guardar está deshabilitado; con la hora vacía el panel dice "todo el día".
- CA-3.12 (R3.9.5, hotel): Dado una campaña que termina a las 22:00, cuando el navegador tenía guardado el tema de la campaña, entonces a las 22:00 ya no se aplica (el tema guardado venció en el fin exacto).
- CA-3.13 (R3.9.1, productos): Dado Black Friday y Cyber Monday 2026 activas, cuando se pide la tienda el domingo 29 nov a las 23:58:00, entonces la respuesta trae Black Friday con `max-age` ≤ 120 y sin `stale-while-revalidate`; pedida de nuevo el lunes 30 nov a las 00:00:01, trae Cyber Monday.
- CA-3.14 (R3.9.2, productos): Dado una pestaña abierta con Black Friday el 29 nov a las 23:50, cuando llega el 30 nov 00:00, entonces en menos de 15 s la tienda muestra Cyber Monday sin recargar; y el 1 dic 00:00, vuelve al diseño normal sin recargar. Navegar entre páginas después del cambio no rompe el scroll al inicio.
- CA-3.15 (R3.9.3, hotel): Dado un navegador con el reloj 10 min adelantado, cuando una campaña termina a las 22:00 (hora del servidor), entonces a las 21:55 del servidor la campaña sigue visible y la cuenta regresiva muestra 5 min.
- CA-3.16 (R3.9, todos): Dado una campaña con fin 2026-12-01T00:00:00-05:00, cuando se resuelve a las 23:59:59.999 del 30 nov, entonces está vigente; a las 00:00:00.000 del 1 dic, no.
- CA-3.17 (R3.14, productos): Dado una campaña que termina el 1 dic a las 00:00, cuando el dueño la ve en Campañas o el cliente ve la cuenta regresiva, entonces dice "termina el lunes 30 a medianoche".

### Fase 1, pieza P2: fechas por año (R2)

- CA-2.1 (R2.2, productos): Dado el año 2026, cuando se calcula Cyber Monday, entonces es el 30 nov 2026; en 2027, el 29 nov 2027.
- CA-2.2 (R2.1, R2.5, productos): Dado Cyber Wow activa, con la edición de noviembre 2026 cargada del 2 al 5 nov (ejemplo) y anticipación 1, cuando se consulta el 1 nov 00:00, entonces hay campaña; el 5 nov 23:59, sigue; el 6 nov 00:00, no.
- CA-2.3 (R2.3, R2.6.2, hotel): Dado Cyber Wow activa con ediciones de abril y julio de 2027 cargadas y noviembre sin cargar, cuando se consulta en cada edición, entonces hay campaña en abril y en julio, y no la hay en noviembre; el calendario muestra abril y julio con fechas y noviembre "por anunciar".
- CA-2.4 (R2.6.1, tours): Dado Cyber Wow activa y el año 2027 sin ninguna edición cargada, cuando se consulta cualquier día de 2027, entonces no hay campaña de Cyber Wow, y no se usan las fechas de 2026.
- CA-2.5 (R2.6.3, canchas): Dado el caso anterior, cuando el dueño abre el calendario de 2027, entonces la fila de Cyber Wow sigue ahí con el mensaje "Fechas de 2027 por anunciar" y puede dejar el interruptor activado.
- CA-2.6 (R2.6.3, eventos): Dado el caso anterior, cuando el administrador de la plataforma carga una edición, entonces una tienda que ya tenía Cyber Wow activada la muestra en esa edición sin hacer nada; una tienda que no la había activado, no.
- CA-2.7 (R2.4, productos): Dado una edición con el fin anterior al inicio, o que se cruza con otra del mismo año, o de más de 30 días, cuando el administrador de la plataforma la guarda, entonces se rechaza con un mensaje claro. Un usuario que no es administrador de la plataforma recibe 403.
- CA-2.8 (R2.7, locales): Dado una edición en curso cuyo fin se adelanta de las 23:59 del 5 nov a las 12:00 del 4 nov, cuando pasan 5 minutos (la caché), entonces las tiendas ya no muestran la campaña desde las 12:00 del 4 nov.
- CA-2.9 (R2.5, hotel): Dado Cyber Wow de julio (ejemplo: 13 a 16 jul) y Fiestas Patrias activas y cruzadas, cuando se consulta el 14 jul, entonces gana la de mayor prioridad (Cyber Wow, 2).
- CA-2.10 (R2.2, productos): Dado Black Friday (20 a 30 nov 2026) y Cyber Monday (30 nov) activas, cuando se consulta el 30 nov 12:00, entonces gana Cyber Monday (misma prioridad, ventana más corta); el 29 nov 12:00, Black Friday. (Si Diego decide otra cosa en Q2, este criterio cambia.)

### Fase 1, pieza P3: ventana de uso (R1)

- CA-1.1 (R1.1, productos): Dado una tienda de productos, cuando el dueño abre una campaña, entonces no ve campos de uso; y si el API recibe una ventana de uso, responde 400 "Esta tienda no usa fechas de uso".
- CA-1.2 (R1.3, R1.5, hotel): Dado una campaña propia con reserva del 20 nov al 3 dic 2026 y uso hasta el 31 mar 2027, cuando el huésped abre el buscador el 25 nov, entonces las noches libres hasta el 31 mar llevan el punto "Fechas de {campaña}" con su leyenda, y las del 1 abr en adelante no; los precios y el cupo son idénticos a los de antes.
- CA-1.3 (R1.5.1, R1.9, hotel): Dado el mismo caso, cuando se ve la portada el 25 nov, entonces aparece una sola línea "…para alojarte hasta el 31 mar" (con la frase de hotel, y en inglés si la tienda está en inglés), y el mismo dato no se repite en la barra superior ni en la cinta.
- CA-1.4 (R1.7, hotel): Dado el mismo caso, cuando se consulta el 4 dic, entonces no hay línea ni marcas.
- CA-1.5 (R1.5.2, tours): Dado una campaña con uso hasta el 31 mar y un tour que sale los sábados, cuando el cliente abre el selector de fecha, entonces solo los sábados elegibles hasta esa fecha llevan la marca; la marca no dice que haya cupo.
- CA-1.6 (R1.5.2, eventos): Dado una campaña con uso del 1 dic al 31 mar, cuando se ve la cartelera, entonces cada función con fecha dentro del rango muestra la etiqueta y las demás no; una función agotada o cerrada no lleva etiqueta.
- CA-1.7 (R1.5.2, locales): Dado una campaña con uso, cuando el cliente ve el calendario del salón, entonces las fechas libres dentro del rango llevan la marca y las ocupadas no.
- CA-1.8 (R1.5.2, canchas): Dado una campaña con uso, cuando el cliente elige el día, entonces los días dentro del rango llevan la marca y el horario ocupado sigue sin poder elegirse.
- CA-1.9 (R1.4, hotel): Dado Black Friday 2026 (20 a 30 nov) con "hasta 90 días después de que termina", cuando se consulta, entonces el uso llega hasta el 28 feb 2027; y en 2027, hasta el 27 feb 2028.
- CA-1.10 (R1.3, tours): Dado una campaña con uso hasta una fecha posterior a un año después del fin de la campaña, cuando se guarda, entonces se rechaza con un mensaje claro.
- CA-1.11 (R1.5.3, todos los de reserva): Dado una campaña con ventana de uso, cuando el cliente elige una fecha fuera del uso, entonces la puede reservar con las reglas de siempre, sin aviso de error.
- CA-1.12 (R1.9, R6.2, todos): Dado el código de las tiendas, cuando corre `scripts/anti-identidad.mjs`, entonces el componente compartido no contiene ninguna comparación por nombre de rubro, y cada rubro aporta su frase y su leyenda desde su perfil.
- CA-1.13 (R1.10, hotel): Dado Diseño en modo campaña, cuando el dueño lo abre, entonces no hay un campo de ventana de uso (solo en Campañas).

### Fase 2 (R4 y R5, se verifican cuando se construyan)

- CA-4.1 (R4.1, R4.2, canchas): Dado una campaña propia de "hora baja" los martes y miércoles de 9:00 a 17:00, del 1 sep al 29 nov 2026 (90 días), cuando se consulta el martes 20 oct 10:00, entonces hay campaña; el martes 20 oct 17:00, no; el miércoles 21 oct 08:59, no; el jueves 22 oct 10:00, no.
- CA-4.2 (R4.3, locales): Dado la misma campaña, cuando es martes 12:00, entonces la cuenta regresiva muestra 5 h y llega a cero a las 17:00.
- CA-4.3 (R4.5, productos): Dado una campaña con repetición y otra propia de 24 horas de la misma prioridad, cuando se cruzan, entonces gana la de franja de hoy más corta.
- CA-4.4 (R4.4, eventos): Dado una campaña con repetición, cuando el dueño abre su efecto, entonces solo ofrece "toda la campaña".
- CA-5.1 (R5.2, productos): Dado una campaña con el código CYBER10 ligado y ventana 2 a 5 nov 2026 (ejemplo), cuando el cliente cotiza el 5 nov 23:59, entonces el código se aplica; el 6 nov 00:00 se rechaza con "La campaña terminó", aunque la tienda tenga la caché anterior.
- CA-5.2 (R5.3, hotel): Dado el mismo código con uso hasta el 31 mar, cuando el huésped cotiza una estadía que termina el 3 abr, entonces el código no aplica y el motivo se muestra.
- CA-5.3 (R5.5, hotel): Dado una reserva con el código aplicado, cuando se abre su ficha en el Admin, entonces se ve la campaña, el código y el monto descontado.
- CA-5.4 (R5.6, todos): Dado una campaña con descuento, cuando el dueño la activa, entonces el sistema le pide confirmar el descuento; sin confirmar, la campaña queda visual y el código no vale.
- CA-5.5 (P-b, productos): Dado el servidor, cuando el navegador manda un precio o un descuento distinto del real, entonces el servidor usa el suyo (condición para habilitar R5 en productos).

### Resumen por rubro (humo de la Fase 1)

| Rubro | Qué debe verse |
|---|---|
| productos | Horas y Cyber Wow/Cyber Monday funcionan; no hay campos de uso. |
| hotel | Horas, Cyber Wow, y uso con punto por noche en el calendario y la frase en la portada (español e inglés). |
| tours | Horas, Cyber Wow y uso en las salidas elegibles, sin afirmar cupo. |
| eventos | Horas, Cyber Wow y uso como etiqueta por función. |
| locales | Horas, Cyber Wow y uso en las fechas libres. |
| canchas | Horas, Cyber Wow y uso en los días elegibles. |

## Variación por cliente

- **Configuración por tienda (por campaña):** activar, horas, ventana de uso, repetición semanal y descuento ligado. Es lo más común: cada tienda decide sus propias campañas.
- **Dato de la plataforma (no de la tienda):** las ediciones de las fechas por año. La tienda solo activa la campaña y ajusta días y horas.
- **Capacidad:** no se crea una capacidad nueva. La ventana de uso se activa con la capacidad que ya existe, "recibe reservas". El arquitecto confirma si hace falta una propia.
- **Textos por rubro:** en el perfil de cada rubro.
- **Excepción por tienda:** ninguna.

## Fuera de alcance

- Que la campaña aplique descuentos o cambie precios en la **Fase 1** (solo desde R5).
- Filtrar o reordenar productos o lo destacado por la ventana de uso (R1.6).
- Restringir la reserva a las fechas de uso en la Fase 1.
- Consultar fuentes externas para obtener las fechas del Cyber Wow (R2.8).
- Campañas del catálogo con repetición semanal (R4.1).
- Excluir feriados o fechas puntuales de una repetición.
- Editar a mano la frase de uso de la portada.
- Métricas de ventas o conversión por campaña.

### Futuro (solo listado, sin requisitos)

- **Vista previa de la tienda en una fecha y hora futura, con enlace para compartir** (Adobe Commerce); hoy el Admin tiene la vista previa interna (R3.11), pero no un enlace público.
- **Acceso anticipado** para clientes registrados o VIP (el estilo de grupos de clientes de Salesforce). Toca datos personales (Ley 29733) y depende de la cuenta del cliente.
- **Avisos antes de que empiece una campaña sugerida**, no personalizados, al dueño ("faltan 21 días para el Día de la Madre"). Ya estaba anotado como tarea aparte con correo en `campanas-widgets`.
- **Campaña por sede** (`multi-sede`): campañas propias de cada local. La analítica por sede ya está prevista (S17.8).

## Riesgos

- **Prometer lo que no existe.** Con una ventana de uso y sin descuento, el dueño puede hacer pensar al cliente que hay una oferta. Mitigación: los textos del sistema no dicen "oferta" ni "descuento" (R1.5.4, R6.5), y el panel lo avisa.
- **Caché y horas frontera:** sin R3.9 el inicio llega hasta 7,5 min tarde. Con R3.9, a la hora frontera todas las pestañas abiertas piden la tienda casi a la vez (Black Friday a medianoche); el desfase aleatorio y la caché en memoria de la tienda (60 s) lo absorben. Si el servidor está dormido (Railway), la primera carga es lenta: no cambia la hora de la campaña, solo cuánto tarda en verse.
- **Código promocional inexistente y precios en el navegador** (R5): son prerrequisitos, no detalles.
- **Dos copias del catálogo.** `presets.js` (backend) y `core/theme/campanas.ts` (tienda) se mantienen "en sincronía" para el simulador de desarrollo. Un tipo nuevo de regla "por año" necesita decidir si el simulador lo entiende o lo omite (para el `arquitecto`).
- **Cambios de aspecto muy seguidos** con la repetición semanal (R4.7).
- **Fechas del IAB mal cargadas:** una fecha mal cargada afecta a todas las tiendas que activaron la campaña. Por eso solo la carga el administrador de la plataforma y queda registrado quién la cargó (R2.7).

## Preguntas abiertas

Verificadas en internet el 2026-10-19 (fuentes al final de la sección). Diego aprobó las 12 recomendaciones el 2026-10-19.

- [x] **Q1 (bloquea P3). ¿Qué hace la ventana de uso sin descuento?** Recomendación **confirmada**: línea informativa en la portada + marca en el selector de fecha/función (R1.5), sin filtrar lo destacado y sin restringir la reserva. Amenitiz, SiteMinder y GuestCentric separan "cuándo se ve" de "a qué fechas aplica" y muestran la promoción junto a la tarifa de las fechas que entran. La marca en el calendario no es estándar (es un extra nuestro), pero no tiene riesgo porque es informativa.
- [x] **Q2 (bloquea P2). Cyber Monday.** Recomendación **confirmada**: preset aparte. En Perú es el lunes siguiente al Black Friday (1 dic 2025) y las tiendas lo anuncian como evento propio dentro de una "Black Week". En 2026: Black Friday 27 nov, Cyber Monday 30 nov.
- [x] **Q3 (bloquea P2). ¿Quién y dónde carga las fechas por año?** Recomendación **confirmada**: el administrador de la plataforma, sin publicar versión. La prensa publica fechas distintas para la misma edición (abril 2026: 6-9 o 20-23; noviembre: 2-5 o 3-6) y el IAB confirma con pocas semanas de anticipación: cada corrección en código obligaría a desplegar.
- [x] **Q4. ¿Cyber Wow es una campaña con tres ediciones o tres campañas?** Recomendación **confirmada**: una campaña con ediciones. El IAB lo maneja como un evento con tres ediciones y un sello oficial único.
- [x] **Q5. Prerrequisitos del descuento.** Recomendación **cambiada**: P-b (el servidor confía en el precio y el descuento que manda el navegador en productos) es una falla de seguridad conocida ("price tampering"); toda guía indica recalcular en el servidor desde datos propios. **No debe esperar a la Fase 2**: va como bug crítico aparte, ya. El código promocional de reservas (P-a) y la spec propia `campanas-descuento` siguen como prerrequisitos de R5.
- [x] **Q6. Ventana de uso en las campañas del catálogo.** Recomendación **confirmada**: días relativos. Las promociones que se repiten se definen así (Early Booker de Booking: reservar al menos N días antes; last minute: como máximo N días); las fechas absolutas se usan en eventos de un año.
- [x] **Q7. Retraso por la caché.** Recomendación **cambiada**: no aceptarlo; las horas frontera son exactas con R3.9 (caché que vence en el próximo cambio, temporizador en la pestaña abierta, reloj del servidor). Revisado en el código: hoy el fin ya es exacto al cargar y el inicio llega hasta 7,5 min tarde. Los cambios manuales siguen tardando hasta 5 min (R3.9.4). Referencia: Launchpad de Shopify exige 5 min entre eventos, y en Shopify es común un retraso de 5-10 min por caché: lo resolvemos mejor que eso.
- [x] **Q8. Hotel.** Recomendación **cambiada**: Booking aplica una promoción solo si **todas** las noches de la estadía entran en la ventana; otros motores (CBDweb) dejan elegir estadía completa, primera o última noche. Queda: marca noche por noche en el calendario (orienta) y la frase "tu estadía entra" y el descuento futuro solo con estadía completa (R1.8, R5.3).
- [x] **Q9. Repetición semanal.** Recomendación **cambiada en parte**: hasta 365 días con repetición (la hora baja de los clubes es permanente); no hace falta cruzar medianoche porque los complejos cierran como máximo a las 00:00 (CAN-03), pero la franja debe poder terminar a las 00:00; la "ventana más corta" se mide por la franja de hoy. **Nuevo:** la repetición anuncia, no reemplaza la tarifa día/noche de canchas (R4.6b).
- [x] **Q10. ¿Cuándo avisar a la plataforma que faltan fechas?** Recomendación **confirmada**: bitácora siempre y correo a 60 días del inicio previsto. No hay dato oficial de con cuánta anticipación anuncia el IAB ("varias semanas"); 60 días da margen.
- [x] **Q11. Valores por defecto de Cyber Wow.** Recomendación **ajustada**: prioridad 2 (en julio debe ganar a Fiestas Patrias); **anticipación 3 días** (no 1), porque las marcas empiezan sus descuentos días antes de los cuatro días oficiales; después 0; efecto "lluvia de ofertas".
- [x] **Q12. Descuento (P5).** Recomendación **ajustada**: solo "con código" en la primera versión; **no se suma** a otros descuentos, gana el mejor precio (como Booking; Shopify solo combina si la tienda lo configura); el precio **se congela al empezar a pagar** (como Discount Ninja en Shopify), y se respeta la cotización de locales a 7 días (R5.7).

### Fuentes de la verificación

- Amenitiz, promociones con periodo de estadía y de visibilidad: https://support.amenitiz.com/en/articles/332595-how-to-create-a-promotion
- SiteMinder, descuentos del motor: https://help-platform.siteminder.com/en/articles/11881530-create-discounts-for-your-booking-engine
- GuestCentric, ventana de venta y de llegada: https://blog.guestcentric.com/extended-window-to-book-promotions-on-your-hotels-booking-engine/
- Stays.net, promociones de Booking.com solo con todas las noches dentro: https://academy.stays.net/en/support/solutions/articles/36000291585-how-is-the-behavior-of-the-promotions-on-booking-com-
- CBDweb, regla estadía completa / primera / última noche: https://help.cbdweb.net/?p=2782
- NightsBridge, Booking.com aplica la mejor promoción, no las suma: https://bridgeit.screenstepslive.com/a/2027441-which-nightsbridge-discount-types-display-as-promotions-on-booking-com
- Promart, Cyber Monday y Black Week 2025: https://www.promart.pe/cyber-monday
- Infomercado, Cyber Wow 2026: https://infomercado.pe/cyber-wow-2026-cuando-empieza-y-cuanto-dura/
- Libero, Cyber Wow 2025 y descuentos días antes: https://libero.pe/ocio/2025/03/24/cyber-wow-2025-fechas-cronograma-completo-todas-sus-ediciones-en-peru-391056
- Caretas, Cyber Wow julio 2026 y sello oficial: https://caretas.pe/?p=819213
- Avantio, Early Booking de Booking.com: https://support.avantio.com/en/articles/419446-booking-com-promotion-early-booking
- Beds24, precios early booker y last minute: https://wiki.beds24.com/index.php/Last-Minute_Prices
- MCB, Launchpad (5 min entre eventos): https://blog.mcb.dk/en/shopify-launchpad-0
- Comunidad Shopify, retraso de 5-10 min: https://community.shopify.com/t/product-updates-not-reflecting-immediately-on-storefront-5-10-minute-delay-in-same-browser/637606
- Sourcery, exploits de precio: https://www.sourcery.ai/security/categories/pricing_exploits
- HackerDNA, price tampering: https://hackerdna.com/daily-hack/pay-your-own-price
- Playtomic, franjas por hora: https://playtomic.com/clubs/indoor-padel-browns-bay-247
- Shopify, combinar descuentos: https://help.shopify.com/manual/discounts/discount-combinations
- Discount Ninja, precio al iniciar el pago: https://support.discountninja.io/en/articles/3581592-an-order-came-in-after-my-promotion-ended

## Decisiones tomadas

| Fecha | Decisión | Por qué | Alternativa descartada |
|---|---|---|---|
| 2026-10-19 | El alcance se entrega por fases: Fase 1 (ventana de uso, fechas por año, horas); Fase 2 (repetición semanal, descuento ligado) se especifica ahora y se construye después; el futuro solo se lista. | Lo pidió Diego al aprobar escribir la spec. | Construir todo junto |
| 2026-10-19 | La campaña sigue siendo solo visual en la Fase 1. | Mantener el principio de `campanas-widgets`. | Introducir descuentos en la Fase 1 |
| 2026-10-19 | Campañas es el cuándo, Diseño es el cómo. | Decisión previa de Diego (`campanas-widgets/cambios.md`, 2026-10-19). | Editar el cuándo en Diseño |
| 2026-10-19 | La hora es siempre la de Lima. | Perú no tiene horario de verano y es la regla vigente. | La hora del visitante |
| 2026-10-19 | Una campaña sin hora es un día completo (compatibilidad). | No migrar datos guardados. | Convertir los datos antiguos a horas |
| 2026-10-19 | Diego aprueba la spec y las 12 respuestas verificadas (Q1-Q12). Horas frontera exactas (R3.9); P-b (precio en el servidor, productos) se trata como bug crítico aparte. | Verificación en internet y en el código. | Aceptar el retraso de la caché; dejar P-b para la Fase 2 |
| 2026-10-19 | Diego aprueba el diseño v1 (decisiones A–I) y las propuestas P1–P8; P4 como recomendó la sesión principal (sin 00:00 de fin en el catálogo). Se agregan como R7. | Revisión del diseño. | 00:00 = todo el día |
| 2026-10-20 | "Mis fechas" sobre cualquier campaña del catálogo (R2.9); "Fechas oficiales" por defecto. | Al probar, Diego vio que cada tienda quiere su Cyber Wow en otras fechas y no debe escribirle a la plataforma para eso. | Que la plataforma cargue fechas por tienda; obligar a crear una propia y perder el aspecto del preset |
| 2026-10-20 | El cruce de campañas se queda como está: la tienda muestra una sola (mayor prioridad del catálogo y, a igual prioridad, la más corta). No hay prioridad numérica ni aviso de cruce; quien maneja el marketing decide qué activa. | Una tienda no corre varias campañas pagadas a la vez; los cruces reales (Black Friday/Cyber Monday, Cyber Wow/Fiestas Patrias, Navidad/Año Nuevo) ya los resuelve la regla. Investigado: Shopify y Adobe prohíben el cruce; Marketo, Intershop y Magento usan prioridad numérica. | Lo fechado a mano gana a lo calculado; prioridad numérica; prohibir el cruce |
| 2026-10-20 | Validaciones de sentido común R8. **Se prohíbe el cruce** de campañas activas cuando una tiene fechas de la tienda (reemplaza "no hay aviso de cruce" de la decisión anterior); los cruces del catálogo se siguen permitiendo. Aviso de descuento prometido y de color ilegible. | Diego: el sistema no debe permitir errores de un marketero descuidado ("el sistema me lo permitió"). | Prohibir todos los cruces (rompe Black Friday/Cyber Monday); solo avisar |
| 2026-10-20 | Se ocultan las fechas de uso (R1.11) hasta la promoción para reservas; volverán como "¿para qué fechas vale la oferta?" con fechas, sin días relativos. | Al probarlo, Diego vio que el concepto es de especialista en marketing y la pantalla no guía; sin descuento no cambia nada para el negocio. | Dejarlo visible; quitarlo del código |

## Para el manual

- **Hora de inicio y fin:** en Campañas, junto a las fechas, puedes decir a qué hora empieza y a qué hora termina tu campaña (hora de Lima). Si no pones hora, vale todo el día. Cuando termina, tu tienda vuelve sola a su diseño de siempre.
- **Cyber Wow y Cyber Monday:** actívalos una sola vez. Las fechas del Cyber Wow las cargamos nosotros cuando se anuncian (son tres veces al año). Si aún no hay fechas, verás "Fechas por anunciar" y no tienes que hacer nada: cuando las carguemos, tu tienda se viste sola.
- **Fechas de uso (hoteles, tours, eventos, locales y canchas):** puedes decir hasta qué fecha se usa lo que se reserva durante la campaña ("reserva hasta el 3 de diciembre, para alojarte hasta el 31 de marzo"). Tu cliente lo ve en tu portada y en el calendario. **No cambia tus precios**: si ofreces una tarifa distinta, la configuras donde siempre.
- **Más adelante:** repetir una campaña cada semana en ciertos horarios (hora baja) y ligar una campaña a un descuento real que empieza y termina solo.
