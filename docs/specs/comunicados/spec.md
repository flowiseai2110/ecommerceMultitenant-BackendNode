# Spec: comunicados de la tienda

> Estado: **especificado, sin implementar** (2026-10-08). Falta plan.md y tasks.md.
> Análisis y fuentes: [analisis.md](analisis.md).
> Repos involucrados: BackendNode, FrontendAdmin, FrontendStore.

## Problema

El dueño de una tienda no tiene dónde avisar a sus visitantes de cambios que los afectan: una nueva política de cancelación del hotel, que el sauna estará en mantenimiento o una subida del IGV. La barra de anuncios admite una sola línea, sin fechas ni nivel de importancia, y las campañas y el aviso de live tienen otro propósito. Hoy esos avisos se dan por WhatsApp o en redes, y quien entra directo a la tienda no se entera.

## Objetivo

Que el dueño publique comunicados con fecha de inicio y fin, y que el storefront los muestre solos mientras estén vigentes:
- los importantes y urgentes, en un modal;
- los informativos, en una barra;
- todos, en un listado de "Avisos" para volver a leerlos;
- y, en carrito y checkout, como aviso dentro de la página, sin bloquearla.

El aviso se apaga solo al vencer, sin que el dueño tenga que acordarse.

## Conceptos

- **Comunicado:** un aviso de la tienda con título, mensaje, nivel, formato, vigencia y opciones de muestra. Se guarda como un elemento de la lista `comunicados` en `tienda_configuraciones` (categoría `comunicacion`).
- **Nivel:** `informativo`, `importante` o `urgente`. Define el color, el ícono, el formato por defecto y el orden.
- **Formato:** `modal` o `barra`. El modal se dibuja centrado en desktop y como hoja inferior en móvil. La barra va debajo del header, aparte de la barra de anuncios, que va encima.
- **Vigente:** comunicado no pausado cuyo intervalo `[inicio, fin)` contiene la hora actual de Lima, calculada en el servidor.
- **Versión:** número que el servidor incrementa cuando cambia el contenido. Si un visitante cerró la versión 1, la versión 2 se le vuelve a mostrar.
- **Plantilla:** texto de ejemplo por caso (mantenimiento, cambio de política, cambio de precios o impuestos, horario especial, retraso de despachos, evento reprogramado, cambio de punto de encuentro). Solo existe en el admin: copia un texto al formulario y no queda vinculada al comunicado.

## Alcance

**Incluye**
- CRUD de comunicados por tienda (máximo 20, vencidos incluidos).
- Programación por fechas, pausa manual y apagado al vencer, sin cron.
- Resolución de los comunicados vigentes en el servidor y entrega embebida en `GET /store/tiendas?slug=`.
- Modal accesible, barra, listado de "Avisos" y aviso dentro del checkout en el storefront.
- Recordar en el navegador que el visitante cerró un comunicado, según la frecuencia elegida.
- Pantalla de administración con plantillas, vista previa móvil y desktop, y permisos por rol.

**No incluye (futuro, ver analisis.md)**
- Avisar por email o WhatsApp a los clientes con reservas o pedidos afectados.
- Que el asesor IA conozca los comunicados vigentes.
- Imagen en el comunicado, métricas de vistas y clics, segmentación de visitantes e idiomas.
- Registro de aceptación del visitante con valor legal.
- Editor de texto rico o HTML.

## Modelo

```jsonc
// tienda_configuraciones: categoria "comunicacion", clave "comunicados", valor = lista
{
  "id": "uuid",                      // lo genera el servidor si no viene
  "titulo": "Sauna en mantenimiento", // 3-80 caracteres
  "mensaje": "Del 12 al 15 de octubre…", // 1-800, texto plano; los \n se respetan
  "nivel": "importante",             // informativo | importante | urgente
  "formato": "modal",                // modal | barra
  "inicio": "2026-10-10T00:00:00-05:00", // null = desde que se guarda
  "fin": "2026-10-16T00:00:00-05:00",    // obligatorio, exclusivo
  "pausado": false,
  "afectaCompras": false,            // también se ve en carrito/checkout
  "paginas": "todas",                // todas | inicio (solo para el modal y la barra)
  "frecuencia": "una_vez",           // una_vez | cada_visita
  "boton": { "texto": "Ver política", "link": "/paginas/politicas" }, // o null
  "version": 1,                      // la calcula el servidor
  "actualizadoEn": "ISO", "actualizadoPor": "email"
}
```

## Requisitos

Formato: *Cuando [condición], el sistema debe [comportamiento].*

### R1 — Administración (backend)
- **R1.1** `GET /admin/tiendas/:id/comunicados` devuelve la lista completa, con el `estado` calculado de cada uno: `programado`, `activo`, `pausado` o `vencido`. Requiere rol `viewer` o superior.
- **R1.2** `PUT /admin/tiendas/:id/comunicados` reemplaza la lista entera, igual que `campanas`. Requiere rol `editor` o superior e invalida la caché pública de la tienda.
- **R1.3** Validación (Zod), con 400 y `data.message` en español:
  - máximo 20 comunicados;
  - límites de longitud del modelo;
  - `fin > inicio`;
  - vigencia máxima de 180 días;
  - `id` sin repetir.
  - Criterio: un comunicado con `fin` anterior a `inicio` responde 400 `"La fecha de fin debe ser posterior al inicio"`, no 500.
- **R1.4** `boton.link` debe ser una ruta interna (empieza con `/` y no con `//`) o una URL `https://`. Se rechaza `javascript:`, `data:`, `http:` y cualquier otro esquema.
  - Criterio: `"javascript:alert(1)"` responde 400.
- **R1.5** Al guardar, el servidor compara cada comunicado con el guardado del mismo `id`. Si cambió `titulo`, `mensaje`, `nivel` o `boton`, incrementa `version`; los demás cambios (fechas, pausa, páginas) no la tocan. El `version` que envía el cliente se ignora.
- **R1.6** `inicio: null` se guarda como la hora del servidor al momento de guardar. Las fechas se interpretan y se devuelven con offset `-05:00`.

### R2 — Resolución y entrega al storefront
- **R2.1** `GET /store/tiendas?slug=` incluye `data[0].comunicados`: solo los vigentes, sin `actualizadoPor` y ordenados por nivel (urgente > importante > informativo) y luego por `inicio` más reciente. Si no hay ninguno, `[]`.
- **R2.2** La hora de referencia es la del servidor en `America/Lima`. El endpoint público no acepta fechas simuladas.
- **R2.3** Cuando un comunicado empieza, termina o se pausa, el storefront lo refleja en un minuto como máximo (TTL actual de la caché pública).
- **R2.4** El storefront oculta además en el cliente un comunicado cuyo `fin` ya pasó, aunque haya llegado en una respuesta cacheada.

### R3 — Modal en el storefront
- **R3.1** Se muestra como máximo **un** modal por carga de página: el primer comunicado vigente con `formato: "modal"` que el visitante no haya cerrado (R5) y cuya `paginas` coincida con la página actual.
- **R3.2** El modal se abre solo en el navegador, después de pintar la página y con 1,5 s de retraso; nunca en el render del servidor. Respeta el patrón `[style.display]` por hidratación (lección del bug de cierre al arrastrar en modales).
- **R3.3** El modal **nunca** se abre en carrito, checkout, pago, confirmación, rastreo de pedido, libro de reclamaciones ni login.
- **R3.4** En móvil (< 640 px) es una hoja inferior de 75 % de alto como máximo, con scroll interno. En desktop es una tarjeta centrada de 480 px de ancho como máximo. Nunca ocupa toda la pantalla.
- **R3.5** Accesibilidad:
  - `role="dialog"`, o `role="alertdialog"` si el nivel es `urgente`;
  - `aria-modal="true"` y `aria-labelledby` apuntando al título;
  - el foco va al modal al abrir y queda atrapado mientras está abierto;
  - Esc lo cierra y el foco vuelve a donde estaba;
  - el scroll del fondo se bloquea;
  - sin animación con `prefers-reduced-motion`.
- **R3.6** Formas de cerrar: la X, el botón "Entendido" y la tecla Esc. Un clic en el fondo cierra solo los niveles `informativo` e `importante`; en `urgente` no, para evitar cierres accidentales. El handler del fondo es un método `void`, no una expresión inline (lección del bug de cierre al arrastrar en modales).
- **R3.7** Si tiene `boton`, se muestra junto a "Entendido". Un link interno navega con el router; uno externo abre en otra pestaña con `rel="noopener noreferrer"`. Al usarlo, el comunicado también cuenta como cerrado.
- **R3.8** El mensaje se pinta con interpolación de Angular (nunca `innerHTML`) y `white-space: pre-line`.

### R4 — Barra, avisos y checkout
- **R4.1** Se muestra la barra del comunicado vigente de mayor prioridad con `formato: "barra"`, debajo del header, con ícono y color según el nivel, el título, un "Ver más" que abre el detalle en el modal y una X. Si hay varias, se muestra solo una.
- **R4.2** Mientras haya al menos un comunicado vigente, el header muestra un ícono de "Avisos" con el número de vigentes. Abre un panel con todos, incluidos los ya cerrados, para volver a leerlos (Ley 29571: información "fácilmente accesible").
- **R4.3** En carrito y checkout, los vigentes con `afectaCompras: true` se muestran como aviso dentro de la página, arriba del resumen, sin bloquearla y sin posibilidad de cerrarse. Se muestran ahí aunque el visitante ya los haya cerrado en otra página.
- **R4.4** El modal y la barra no tapan el botón de compra fijo de móvil ni el menú inferior. El chat y el widget flotante quedan debajo del modal (z-index).

### R5 — Frecuencia y memoria del cierre
- **R5.1** `una_vez`: al cerrarlo se guarda `tiendaId:id:version` en `localStorage` y no vuelve a abrirse como modal ni como barra, salvo que suba la versión.
- **R5.2** `cada_visita`: el cierre se guarda en `sessionStorage`; vuelve en la siguiente visita (pestaña nueva).
- **R5.3** Si el almacenamiento falla (modo privado o bloqueado), el modal se muestra una vez por carga y no rompe la página. Todo acceso al almacenamiento va en `try/catch`.

### R6 — Pantalla del admin
- **R6.1** Nueva entrada de menú "Comunicados", junto a "Aviso de Live", en la ruta `/comunicados`, lazy y standalone, con diseño mobile-first.
- **R6.2** El listado muestra los comunicados con un chip de estado (programado, activo, pausado o vencido), el nivel y las fechas. Acciones: editar, duplicar, pausar o reanudar, y eliminar con confirmación.
- **R6.3** Al crear, el dueño elige primero una plantilla o "En blanco". La plantilla llena el título, el mensaje con `[corchetes]` para completar, el nivel, el formato, `afectaCompras` y la duración sugerida. El admin no deja guardar si quedan `[corchetes]` sin reemplazar.
- **R6.4** En el formulario, el formato se ajusta al elegir el nivel (urgente o importante → modal; informativo → barra), pero el dueño puede cambiarlo. El fin tiene atajos (+1 día, +7 días, +30 días). Si el fin ya pasó, se avisa antes de guardar.
- **R6.5** La vista previa en vivo tiene un selector móvil/desktop y usa el mismo diseño que el storefront (copia del componente, como en `diseno.model.ts`).
- **R6.6** El formulario lleva `unsavedChangesGuard`. El rol `viewer` ve todo en modo solo lectura. Los 400 del backend se muestran junto al comunicado que los causó.
- **R6.7** Si se crea un comunicado `urgente` mientras hay otro urgente vigente, el admin advierte que solo se mostrará uno como modal por visita (no lo bloquea).

## Plantillas iniciales (admin)

| Id | Título de ejemplo | Nivel | Formato | Afecta compras | Duración |
|---|---|---|---|---|---|
| `mantenimiento` | [Servicio] en mantenimiento | importante | modal | no | 7 d |
| `cambio-politica` | Actualizamos nuestra política de [tema] | importante | modal | sí | 30 d |
| `cambio-precios` | Actualización de precios por [motivo] | importante | modal | sí | 30 d |
| `horario-especial` | Horario especial por [fecha] | informativo | barra | no | 7 d |
| `retraso-despachos` | Los despachos de [fecha] saldrán el [fecha] | informativo | barra | sí | 7 d |
| `evento-reprogramado` | [Evento] se reprograma | urgente | modal | sí | 30 d |
| `punto-encuentro` | Nuevo punto de encuentro para [tour] | urgente | modal | sí | 14 d |
| `cierre-temporal` | Cerrado temporalmente del [fecha] al [fecha] | urgente | modal | sí | 14 d |

El texto de `cambio-precios` recuerda que los precios publicados ya deben incluir el IGV nuevo. Un comunicado informa, pero no corrige los precios (ver analisis.md, Ley 29571).

## Riesgos y notas

- **Penalización de Google en móvil:** se mitiga con R3.2 (retraso, sin render del servidor) y R3.4 (hoja inferior que no ocupa toda la pantalla). Un comunicado urgente sigue siendo un modal: se acepta porque es temporal y el dueño lo decide.
- **Fatiga de modales:** el formato por defecto según el nivel (R6.4) y el límite de un modal por visita (R3.1) evitan que la tienda se vuelva una ventana emergente tras otra.
- **Nada de esto es aceptación legal:** "Entendido" solo cierra el modal. Si el dueño cambia condiciones de reserva o venta, el texto vinculante debe estar en sus políticas y en el checkout.
- **Sin DDL:** se reutiliza `tienda_configuraciones`. La categoría nueva `comunicacion` no choca con `DISENO_CLAVES`, porque `getDiseno` filtra por categoría `diseno`.
- **Caché:** el `PUT` debe invalidar `tiendas.cache.js` igual que el diseño. Si no, un comunicado pausado sigue apareciendo hasta 60 s.

## Preguntas abiertas

1. ¿El nombre "Comunicados" en el menú te sirve, o prefieres "Avisos"? En la tienda, el visitante ve "Avisos".
2. ¿20 comunicados por tienda (vencidos incluidos) es suficiente, o conviene borrar solos los vencidos hace más de 90 días?
3. ¿Se prioriza en una fase siguiente avisar por email a los huéspedes con reserva afectada? Es lo que más valor daría a un hotel.
