# Análisis: comunicados de la tienda

> Fecha: 2026-10-08. Insumo para [spec.md](spec.md).

## El pedido

El dueño necesita avisar a **todos los que visitan su tienda** de cambios que les afectan: un cambio en la política del hotel, una subida del IGV dispuesta por el Estado o que el sauna estará en mantenimiento. El aviso aparece como modal mientras está activo.

## Qué ya existe y por qué no alcanza

| Pieza existente | Qué hace | Por qué no sirve para un comunicado |
|---|---|---|
| Barra de anuncios (`diseno.anuncio`) | Una franja de texto de 200 caracteres sobre el header, con un link | Es una sola línea y no tiene fechas, título ni nivel de importancia. Sirve para "Envío gratis desde S/ 99", no para explicar que el sauna cierra del 12 al 15. |
| Campañas de temporada (`diseno.campanas`) | Cambian el diseño en fechas del calendario comercial | Son decoración de venta. Un comunicado es información operativa o legal, y no debe cambiar los colores de la tienda. |
| Aviso de live (`avisos_live`) | Avisa de una transmisión en curso con links a TikTok/YouTube/Facebook | Dura unas horas, se activa a mano y solo enlaza plataformas externas. |

Conclusión: hace falta una pieza nueva. Puede reutilizar dos patrones probados: la fila JSONB en `tienda_configuraciones`, que evita escribir DDL, y la resolución por fecha **en el servidor**, en hora de Lima, igual que las campañas.

## Qué hacen las plataformas establecidas

**Constructores de sitios (Wix, Shopify y sus apps de popups, Poper, Desk9 Notice Planner para WooCommerce):**
- **Programación:** fecha y hora de inicio y de fin. Wix lo llama *Lightbox scheduling*. El aviso aparece y desaparece solo.
- **Disparador:** al cargar la página, con retraso, al hacer scroll o al intentar salir. Para un comunicado solo tiene sentido "al cargar, con un retraso corto".
- **Páginas:** todas, solo algunas o todas menos algunas. Todas las guías coinciden en **no interrumpir el checkout** con un popup.
- **Frecuencia:** una vez por sesión o una sola vez, y se recuerda que el visitante lo cerró (cookie o localStorage).
- **Plantillas por caso:** mantenimiento con cuenta regresiva, cierre por vacaciones o feriado, cambio de horario y retrasos de envío. Desk9 está hecho justo para esto: "cierres por vacaciones, cambios de horario, ventanas de mantenimiento, retrasos de entrega".
- **Formato:** modal centrado o barra fija arriba o abajo. Los sistemas de diseño (Pega, ServiceTitan, Dialpad) reservan el **modal** para lo que exige atención inmediata y la **barra** para el resto.

**Niveles de importancia (sistemas de diseño):** informativo, advertencia y crítico, cada uno con su color e ícono. El nivel decide el formato. Un aviso informativo como modal termina enseñando al visitante a cerrar todos los modales sin leerlos.

## Restricciones que el diseño debe respetar

1. **SEO en móvil (Google, *intrusive interstitials*):** Google baja en los resultados móviles las páginas que, al entrar, muestran un popup que tapa el contenido principal y es difícil de cerrar. Para cumplir: en móvil se usa una hoja inferior que no cubre toda la pantalla, con un botón de cierre visible, y aparece después de que se pintó el contenido.
2. **Accesibilidad (WCAG 2.2 AA):** `role="dialog"` (o `alertdialog` si es crítico), `aria-modal="true"`, `aria-labelledby` apuntando al título, foco dentro del modal mientras está abierto, Esc para cerrar, foco devuelto al cerrar, fondo inerte y animaciones que respetan `prefers-reduced-motion`.
3. **Ley 29571 (Código de Protección al Consumidor):** el consumidor tiene derecho a información "oportuna, suficiente, veraz y fácilmente accesible", y los precios mostrados deben incluir el IGV. El comunicado **ayuda a informar, pero no reemplaza** que el precio del producto y el total del checkout ya reflejen el impuesto nuevo. Además, un modal que se cierra no es "fácilmente accesible": el visitante tiene que poder volver a leerlo.
4. **Mantenimiento del proyecto:** sin DDL nuevo (ver `project_rls_no_aplicado`: el SQL manual ya causó desincronización), sin cron (igual que el aviso de live) y sin HTML libre (riesgo de XSS en el storefront).

## Casos de uso por rubro

| Rubro | Ejemplo | Nivel | ¿Afecta el checkout? |
|---|---|---|---|
| Hotel | "El sauna estará en mantenimiento del 12 al 15 de octubre" | Importante | No |
| Hotel | "Desde el 1 de noviembre, el check-in es a las 15:00" | Importante | Sí (reserva) |
| Hotel | "Nueva política de cancelación: gratis hasta 72 h antes" | Importante | Sí |
| Cualquiera | "Desde el 1 de enero, el IGV sube al X %; los precios ya lo incluyen" | Importante | Sí |
| Tours | "El punto de encuentro cambia a la Plaza de Armas" | Urgente | Sí |
| Eventos | "El concierto del sábado se reprograma al 20 de noviembre" | Urgente | Sí |
| Tienda de productos | "Por feriado, los pedidos de esta semana se despachan el lunes" | Informativo | Sí (envío) |
| Cualquiera | "Atendemos en horario especial por Fiestas Patrias" | Informativo | No |

Hallazgos:
- **Casi siempre hay fecha de fin.** El mantenimiento termina, la reprogramación pasa y el cambio de política ya no es "noticia" después de unas semanas. Un comunicado sin fin acaba siendo un modal permanente que molesta.
- **Muchos afectan el checkout.** Justo ahí no se debe interrumpir con un modal, pero el aviso tampoco puede desaparecer. La solución es mostrarlo como un aviso dentro de la página, sin bloquearla.
- **El dueño no sabe redactarlos.** Las plantillas con texto de ejemplo le ahorran tiempo, igual que las secciones con `ejemplo: true` de la estructura de la tienda.

## Decisiones propuestas

| Tema | Decisión | Alternativa descartada y por qué |
|---|---|---|
| Almacenamiento | Clave JSONB `comunicados` en `tienda_configuraciones` (categoría `comunicacion`) | Tabla nueva: exige DDL a mano y no hace falta consultar por SQL. |
| Formato según nivel | Urgente e importante → modal. Informativo → barra bajo el header. El dueño puede cambiarlo | Siempre modal: produce fatiga y el visitante cierra los modales sin leerlos. |
| Varios vigentes | Un solo modal por visita (el de mayor nivel); el resto queda en "Avisos" | Encadenar modales: hostil, y peor en móvil. |
| Volver a leer | Ícono "Avisos (n)" en el header mientras haya comunicados vigentes | Nada: no cumpliría "fácilmente accesible". |
| Checkout, carrito y rastreo | Nunca modal; los comunicados marcados "afecta compras" se muestran como aviso dentro de la página | Modal también ahí: baja la conversión y Google lo penaliza. |
| Contenido | Texto plano con saltos de línea, más un botón opcional | HTML o editor rico: riesgo de XSS y más trabajo sin beneficio claro. |
| Confirmación | Botón "Entendido" que solo cierra el modal; **no** se guarda como aceptación legal | Guardar quién aceptó: exige identificar al visitante, datos personales y otro alcance legal. |
| Activación | Programada (inicio y fin) más pausa manual | Solo manual: el dueño se olvida de apagarlo. |
| Entrega | Viaja en `GET /store/tiendas?slug=` ya resuelto (caché de 60 s) | Supabase Realtime: un minuto de retraso es aceptable para este caso. |

## Fuera de alcance (posible futuro)

- **Avisar a clientes con reservas o pedidos afectados** por email o WhatsApp, por ejemplo a los huéspedes con reserva durante el mantenimiento del sauna. Llega a la audiencia que **no** visita el sitio y es probablemente lo más valioso para un hotel. Necesita el cruce con reservas, el envío con Resend y la plantilla de WhatsApp.
- **Que el asesor IA conozca los comunicados vigentes** y responda "el sauna está en mantenimiento hasta el 15" cuando le pregunten.
- Métricas (vistas, cierres y clics en el botón).
- Segmentar por visitante nuevo o recurrente.
- Idiomas (hoteles con huéspedes extranjeros).

## Fuentes

- Marfeel, configuración de popups (modo modal frente a contextual): https://www.marfeel.com/docs/experiences/formats/popup-experiences-configuration-and-best-practices
- Buenas prácticas de popups y barras de anuncio (frecuencia, recordar el cierre, excluir el checkout): https://smithery.ai/skills/davila7/popup-cro
- Smashing Magazine, *Intrusive Interstitials: Guidelines To Avoiding Google's Penalty*: https://www.smashingmagazine.com/2017/05/intrusive-interstitials-guidelines-avoid-google-penalty/
- Wix, popups y programación de lightbox: https://support.wix.com/en/article/studio-editor-using-lightboxes
- Poper, plantillas de mantenimiento con cuenta regresiva: https://poper.ai/templates/site-maintenance-announcements-with-countdown
- Desk9 Notice Planner (cierres, horarios, mantenimiento, retrasos): https://ja.wordpress.org/plugins/?p=361214
- Open/Close Store Hours for WooCommerce: https://woocommerce.com/de/products/open-close-store-hours-for-woocommerce/
- Pega, niveles de banner y cuándo usar modal: https://academy.pega.com/node/54466
- ServiceTitan Anvil, variaciones de estado del banner: https://v1.anvil.servicetitan.com/components/banner
- MADA, modal accesible WCAG 2.2: https://ictaccess.mada.org.qa/ui-accessible-component/en/modal-dialog.html
- Infomercado, Indecopi y precios con IGV: https://infomercado.pe/indecopi-los-clientes-deben-conocer-los-precios-antes-de-ingresar-a-un-restaurante-noticia-ar/
