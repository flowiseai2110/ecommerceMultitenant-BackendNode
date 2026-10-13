# Spec: video del ítem (link de redes)

> Estado: **Implementado en los tres repos 2026-10-12**, sin commit. Probado en navegador con YouTube en un tour; faltan los demás proveedores y un salón.
> Repos involucrados: BackendNode, FrontendAdmin, FrontendStore.

## Problema

En locales (alquiler para eventos) y tours el cliente decide por el lugar o la experiencia: amplitud, ambiente, paisaje. Las fotos no alcanzan, y hoy la visita presencial es lo que demora el cierre. El emprendedor ya tiene esos videos en TikTok, Instagram, Facebook o YouTube.

## Objetivo

Que el dueño **pegue el link** de un video que ya publicó y la ficha del ítem lo muestre incrustado. No se suben archivos: sin costo de almacenamiento ni de ancho de banda, y el dueño reutiliza lo que ya tiene.

## Alcance

**Incluye (fase 1)**
- Un video por ítem (producto, tour, salón...), en el formulario de producto del admin.
- Proveedores: YouTube (incluye Shorts), Vimeo, TikTok, Instagram (reel/post) y Facebook (video/reel).
- Ficha del tour y del salón en la tienda.
- Capacidad `catalogo.usaVideo` del perfil del rubro (admin): activa en `locales` y `tours`.

**No incluye**
- Subir archivos de video.
- Varios videos por ítem (el modelo admite pasar a lista sin romper nada).
- Video en el PDP de productos (fase 2, activable por tienda) y en el hero de la home.
- Links cortos (`vm.tiktok.com`, `fb.watch`): no traen el id del video; se pide el link completo.

## Requisitos

- R1 El campo acepta el link con o sin `https://`. Vacío = sin video.
- R2 Un link que ningún proveedor reconoce no se guarda: error en el campo con la lista de redes admitidas.
- R3 Se guarda el video reconocido en `productos.metadata.video = { proveedor, id, formato, link }`. Guardar el formulario no toca `metadata.opciones`.
- R4 `formato` es `vertical` para Shorts, TikTok, Instagram y reels de Facebook; `horizontal` para lo demás. La tienda reserva el alto según el formato (sin salto de layout).
- R5 La tienda recibe `video: { proveedor, formato, embed, enlace, miniatura } | null`. El `embed` lo arma el backend desde el proveedor (lista blanca de dominios); la tienda nunca recibe el link pegado ni texto libre para un iframe.
- R6 La tienda no carga el iframe hasta que el cliente toca play: muestra la miniatura (o la foto principal si el proveedor no la da) con un botón ▶.
- R6.1 Instagram no se incrusta (`embed` null, `enlace` = el reel): su embed es la publicación entera (me gusta, comentarios, scroll) y en el celular casi nunca reproduce dentro. El ▶ abre el reel en Instagram en otra pestaña (o en la app). Decisión 2026-10-12, tras probarlo en el admin.
- R7 El admin ve una vista previa al pegar el link, con la misma lógica de reconocimiento.

## Diseño

- **Strategy + registro** (`modules/catalogo/video.js`): cada proveedor implementa `reconocer(url)`, `urlEmbed(id)` y `miniatura(id)`. `parsearVideo` recorre `PROVEEDORES`. Proveedor nuevo = una entrada más. El admin tiene una copia del registro para la vista previa.
- **Value object en JSONB**: sin DDL. El embed se calcula al serializar, así un cambio de formato del proveedor no obliga a migrar datos.
- **Merge, no reemplazo**: el schema recibe `video` (link); el middleware `fusionarVideo` lo pone en `metadata` partiendo de la guardada.
- **Virtual Proxy** en la tienda: el componente de video carga el iframe solo al tocar play.
- **Capacidad, no identidad**: el admin muestra el campo según `perfil().catalogo.usaVideo`; la ficha de cada rubro decide si y dónde lo pone.

## Contrato

**Admin → backend** (`POST /admin/productos`, `PUT /admin/productos/:id`): `video?: string | null`.

**Backend → admin** (`GET /admin/productos/:id`): `video: { proveedor, formato, embed, enlace, miniatura, link } | null`.

**Backend → tienda** (`GET /store/productos/:id`, `GET /store/reservas/tours/:slug`, `GET /store/reservas/locales/salones/:slug`): `video: { proveedor, formato, embed, enlace, miniatura } | null`; viene `embed` (se reproduce) o `enlace` (se abre en la red). Los listados no lo traen.

## Tareas

- [x] Backend: `video.js` (proveedores, parser, schema, merge, serializers) + tests.
- [x] Backend: campo `video` en create/update de productos y middleware `fusionarVideo`.
- [x] Backend: `video` en el detalle del store de productos, tours y salones.
- [x] Admin: `catalogo.usaVideo` en el contrato, perfiles y `perfiles.spec.ts`.
- [x] Admin: campo "Video" con vista previa en el formulario de producto (`shared/video/`).
- [x] Tienda: componente de video (Virtual Proxy, `shared/components/video-embebido`) en las fichas de tour y salón.
- [x] Prueba en navegador: YouTube en la ficha de un tour (2026-10-12).
- [ ] Prueba en navegador: TikTok, Instagram, Facebook y Vimeo, y la ficha de un salón.

## Futuro: varios videos por ítem

**Decisión 2026-10-12: no se hace ahora.** Un video bien elegido cubre casi todo: el cliente mira el primero y decide, el dueño suele tener uno o dos reels por ítem, y varios videos apilados empujan precio e itinerario hacia abajo. Se hace cuando haya señal real: dueños que lo piden, que pegan links de videos en la descripción o que intentan pegar un canal en el campo.

Esperar no tiene costo para los clientes que ya tengan un video. El cambio solo agrega cosas:

- **Datos:** `metadata.videos` (lista, máx. 3). Al leer, `videos ?? [video]`: los videos ya guardados siguen funcionando sin script ni DDL. Al guardar se escribe `videos` y se borra `video`.
- **Contrato con la tienda:** durante la transición el backend manda `videos` (todos) y `video` (el primero), para que una tienda abierta con el bundle anterior no se rompa. Después se retira `video`.
- **Admin:** el campo "Video" pasa a "Videos" con "+ Agregar otro". El video actual aparece como el primero.
- **Tienda:** los videos van como diapositivas dentro de la galería de fotos (con ▶ encima), no apilados, para que la ficha no crezca.

**Opción intermedia barata:** aceptar listas de reproducción de YouTube (`youtube.com/playlist?list=…` → `youtube-nocookie.com/embed/videoseries?list=…`). Es una estrategia más en `PROVEEDORES` (backend y copia del admin): un solo reproductor con varios videos, sin tocar la tienda ni el modelo. Solo sirve para YouTube.

Lo que sí sería caro cambiar después, y ya está resuelto: link en vez de subida de archivos, y embed armado por el backend en vez de guardar el link crudo.
