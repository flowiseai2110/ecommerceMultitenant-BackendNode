# Spec: campañas de temporada y widgets del storefront

> Estado: **backend (Fases 1-3) y storefront (Fase 6) listos, sin commit**: la tienda muestra la campaña que resuelve el backend. Faltan la subida de imágenes para widgets (Fase 4), la pantalla de campañas del admin (Fase 5) y la verificación end-to-end con una campaña activada (Fase 7). Ver [tasks.md](tasks.md).
> Diseño técnico: [plan.md](plan.md).
> Repos involucrados: BackendNode, FrontendAdmin, FrontendStore.
> Depende de: personalización de tienda (estructura, tipografía y paleta), hoy simulada en `FrontendStore/src/app/state/diseno.state.ts`.

## Problema

Las tiendas peruanas venden por temporadas: Día de la Madre, Fiestas Patrias, Black Friday y Navidad concentran buena parte de las ventas del año. Hoy el storefront se ve igual todo el año. Para "vestir" la tienda en una campaña, el dueño tendría que cambiar a mano el anuncio y los textos del hero, y acordarse de revertirlos. En la práctica no lo hace, o deja la tienda con "Feliz Navidad" hasta febrero.

## Objetivo

Que el dueño active las campañas del calendario comercial con un clic y que la tienda cambie sola durante la ventana de cada una: colores, anuncio, hero, cinta, cuenta regresiva y adornos (widgets). Al terminar la campaña, la tienda vuelve sola a su diseño base, y la activación se repite cada año.

## Conceptos

- **Preset de campaña:** fecha comercial del calendario peruano definida por la plataforma (no por la tienda). Incluye una regla de fecha ("2.º domingo de mayo"), una ventana (cuántos días antes empieza y cuántos después termina) y contenido por defecto (paleta, textos, widgets).
- **Campaña de la tienda:** un preset activado por la tienda, con sus personalizaciones opcionales. También puede ser una campaña propia sin preset, como el aniversario de la tienda.
- **Widget:** adorno decorativo tipo sticker (sol, corazón, la imagen de la tienda o un sello "-30%") colocado en un **ancla**.
- **Ancla:** lugar predefinido y seguro donde puede ir un widget (por ejemplo `hero-arriba-derecha`). No existen coordenadas libres.

## Alcance

**Incluye**
- Catálogo de presets: verano, amistad, Día del Niño, Día de la Madre, Día del Padre, Fiestas Patrias, primavera, Halloween, Black Friday y Navidad.
- Activación por tienda, ajustes de fechas, textos, paleta y widgets, y campañas propias.
- Resolución de la campaña vigente **en el servidor**, en hora de Lima.
- Widgets por campaña y widgets permanentes de la tienda, con figura del catálogo, imagen subida o sello de texto.
- Subida de imágenes para widgets (PNG/WebP, sin SVG).
- Calendario anual en el admin y vista previa por fecha.

**No incluye** (futuro)
- Colección de productos asociada a la campaña ("Regalos para mamá") y badge en la product card.
- Imagen de hero propia por campaña.
- Métricas por campaña (ventas, conversión).
- Arrastrar widgets a una posición libre.
- Notificaciones al dueño ("faltan 21 días para el Día de la Madre"); queda como tarea aparte con email (Resend).

## Requisitos

Formato: *Cuando [condición], el sistema debe [comportamiento].*

### R1 — Calendario
- **R1.1** El sistema debe calcular la fecha clave de cada preset para cualquier año a partir de su regla: fecha fija o n-ésimo día de la semana del mes, más un desfase opcional.
  - Criterio: Día de la Madre 2027 → 9 may; Día del Padre 2027 → 20 jun; Día del Niño 2027 → 11 abr; Black Friday 2026 → 27 nov.
- **R1.2** La ventana de una campaña va desde `fechaClave − anticipacionDias` (00:00 de Lima) hasta el final del día `fechaClave + despuesDias` (23:59:59 de Lima).
- **R1.3** Cuando dos campañas activas se cruzan, gana la de mayor `prioridad`; si empatan, la de ventana más corta (la más específica).
  - Criterio: 25 nov 2026 con Black Friday y Navidad activas → Black Friday. 1 feb con verano y amistad → amistad.

### R2 — Activación por tienda
- **R2.1** Un preset no se aplica a una tienda hasta que el dueño lo activa (opt-in). Cambiar los colores de una tienda sin su permiso genera reclamos.
- **R2.2** Una campaña activada se repite todos los años hasta que el dueño la desactive.
- **R2.3** El dueño puede cambiar la anticipación y los días posteriores, los textos (anuncio, hero, cinta, cuenta regresiva), la paleta y los widgets. Lo que no cambie se toma del preset.
- **R2.4** El dueño puede crear campañas propias con nombre, fechas de inicio y fin explícitas (no se repiten, máximo 90 días) y el mismo contenido.
- **R2.6** Cada preset se activa una sola vez por tienda; como máximo 30 campañas por tienda.
  - Criterio: guardar dos campañas con `presetId: "madre"` → 400 `"madre" ya está en la lista`.
- **R2.5** El admin debe sugerir los presets según el rubro de la tienda (`tiendas.rubro`: general, moda, tecnologia, belleza, alimentos, mascotas, hogar), sin impedir activar otros. Una tienda sin rubro se trata como `general`. No se usa `tipo_negocio`, que distingue productos / servicios / ambos.

### R3 — Resolución y entrega al storefront
- **R3.1** `GET /store/tiendas?slug=` debe incluir en `diseno.campana` la campaña vigente **ya resuelta** (preset + personalizaciones) o `null`. El storefront no calcula fechas.
- **R3.2** La fecha de referencia es la del servidor en zona `America/Lima`, nunca la del navegador.
- **R3.3** La respuesta incluye `inicio`, `fin` y `fechaClave` en ISO con offset `-05:00`, para que el storefront pueda vencer su caché de tema (`hasta`) y dibujar la cuenta regresiva.
- **R3.4** Cuando una campaña empieza o termina, el storefront debe reflejarlo como máximo un minuto después (TTL de la caché pública actual: 60 s).

### R4 — Widgets
- **R4.1** Un widget tiene un contenido (`figura` del catálogo, `imagen` subida o `sello` de texto), un ancla, un tamaño (`chico`/`mediano`/`grande`), una animación (`flotar`/`latir`/`balanceo`/`girar`/`ninguna`) y si se muestra en móvil.
- **R4.2** Las anclas válidas son: `hero-arriba-derecha`, `hero-abajo-derecha`, `hero-arriba-izquierda`, `flotante-izquierda` y `junto-logo`.
- **R4.3** Debe haber como máximo un widget por ancla y cinco por lista. El backend rechaza con 400 una lista que no cumpla.
- **R4.4** El texto de un sello tiene como máximo 12 caracteres.
- **R4.5** La URL de un widget de imagen debe pertenecer al bucket `tiendas/{tiendaId}/widgets/` de la propia tienda. Se rechaza cualquier URL externa para evitar hotlinking, rastreo y contenido no moderado.
- **R4.6** Los widgets permanentes de la tienda (`diseno.widgets`) se muestran siempre. Durante una campaña, un widget de la campaña reemplaza al permanente de **la misma ancla**; los demás siguen.
- **R4.7** Los widgets del hero y el flotante solo se muestran en la home; nunca en carrito, checkout ni rastreo de pedido. `junto-logo` es parte del header y se ve en todas las páginas, porque es chico y no tapa contenido.
- **R4.8** El widget flotante tiene un botón para cerrarlo. Al cerrarlo no vuelve durante esa campaña (por año); si es un widget permanente, no vuelve más. Se recuerda en el navegador.

### R5 — Subida de imágenes de widgets
- **R5.1** `POST /uploads/image` acepta `folder = "widgets"`.
- **R5.2** Para `widgets` solo se aceptan PNG y WebP de hasta 1 MB, **nunca SVG**: un SVG puede llevar scripts y el storefront lo mostraría en su propio dominio.
- **R5.3** La imagen se normaliza a WebP de 512 px como máximo de lado, conservando la transparencia.

### R6 — Vista previa
- **R6.1** `GET /admin/tiendas/:id/diseno/vista-previa?fecha=YYYY-MM-DD` debe devolver el `diseno` como lo vería el storefront ese día, para que el admin revise una campaña antes de que empiece.
- **R6.2** El endpoint público nunca acepta una fecha simulada.

## Riesgos y notas

- **`POST /uploads/image` tiene `authMiddleware` comentado (TODO)** y acepta SVG para todas las carpetas. Para esta spec se cierra al menos la carpeta `widgets` (R5.2). Conviene activar la autenticación aparte, porque hoy cualquiera puede subir archivos al bucket de cualquier tienda.
- El diseño base (estructura, tipografía y paleta) todavía no está en el backend. La paleta de una campaña se guarda con valores explícitos (hex del primario, familia de neutros y fondos), así esta spec no depende de que ese diseño base esté migrado.
- SSR: el prerender de la home no conoce la tienda, así que la campaña siempre se pinta en el navegador. El script inline de `index.html` aplica el tema cacheado solo si `hasta` no venció.
