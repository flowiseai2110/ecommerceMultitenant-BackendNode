# Spec: accesibilidad de la tienda

> Estado: **Fase 1 (subtítulos) implementada en FrontendStore 2026-10-14**, sin commit. Tests en verde; falta probar en navegador con un video que tenga subtítulos.
> Repos involucrados: FrontendStore (fase 1). Backend solo si se generan subtítulos de Cloudflare Stream (ver Pendientes).

## Problema

La tienda la usan también personas con discapacidad auditiva, del habla, visual o motriz. Sin ajustes, una persona sorda no entiende un video sin subtítulos y una persona que navega con teclado o lector de pantalla puede quedarse a mitad del checkout.

## Objetivo

Cumplir **WCAG 2.2 nivel AA** (el estándar internacional de accesibilidad web), que es lo que se toma como referencia para la Ley 29973 (Ley General de la Persona con Discapacidad, Perú).

## Estado actual (análisis por código, 2026-10-14)

Discapacidad auditiva y del habla:
- ✅ El contacto con la tienda es escrito: WhatsApp (texto) y correo. No hay botón de "llamar" ni contacto solo por teléfono.
- ✅ Ningún aviso depende del sonido; todos son visuales.
- ✅ Pedidos y reservas se hacen por formulario; no hay verificación por llamada ni código por voz.
- ✅ La transmisión avisa por escrito que el video empieza sin sonido.
- ✅ Fase 1: los videos arrancan con subtítulos (abajo).

Otras discapacidades:
- ✅ Imágenes con texto alternativo; mapas y videos con título; idioma de la página declarado; foco visible en botones.
- ⚠️ Pendientes en la sección Pendientes.

## Fase 1 — Subtítulos en los videos (hecho)

- R1 Los reproductores incrustados arrancan con los subtítulos activados, en el idioma de la página. WCAG 1.2.2 (video grabado) y 1.2.4 (en vivo).
- R2 Aplica a: video de la ficha del ítem (idioma de la tienda, español o inglés), transmisión en vivo y grabación (español: esas páginas son solo en español).
- R3 Si el video no tiene subtítulos en ese idioma, el reproductor se ve igual que antes; no hay error.
- R4 Proveedores sin parámetro de subtítulos (TikTok, Facebook, Instagram) quedan igual.

Diseño:
- `FrontendStore src/app/shared/utils/subtitulos.ts` → `conSubtitulos(url, idioma)` agrega el parámetro de cada proveedor:
  - YouTube: `cc_load_policy=1&cc_lang_pref=<idioma>`
  - Vimeo: `texttrack=<idioma>`
  - Cloudflare Stream: `defaultTextTrack=<idioma>`
- Se usa en `video-embebido.component.ts`, `transmision-page.component.ts` y `grabacion-page.component.ts`. Test: `subtitulos.spec.ts`.

De dónde salen los subtítulos:
- YouTube: los genera solo (también en vivo), o el dueño los sube.
- Vimeo: el dueño los sube a su video.
- Cloudflare Stream: hay que generarlos (Cloudflare ofrece subtítulos automáticos) — pendiente.

## Pendientes

- P1 Generar subtítulos automáticos de Cloudflare Stream para transmisiones y grabaciones (backend).
- P2 Anunciar errores y avisos a lectores de pantalla (`role="alert"` / `aria-live`) en checkout y reservas.
- P3 Cambiar los ~5 `div`/`span` con `(click)` por botones (usables con teclado).
- P4 Foco visible en `.valor-barra` (buscador del hotel) y `.caja-valor` (solicitud de reserva).
- P5 Enlace "Saltar al contenido" al inicio de la página.
- P6 Poder extender el tiempo del apartado de una reserva (WCAG 2.2.1).
- P7 Opcional (AAA): intérprete de Lengua de Señas Peruana en transmisiones.
- P8 **Auditoría con axe / Lighthouse (incluye contraste de colores) cuando el sitio esté completo y publicado.** Decisión del usuario 2026-10-14.

## Para el manual

> Texto para el manual de funcionalidades, dirigido al dueño de la tienda.

**Tu tienda es accesible para personas con discapacidad**

- **Videos con subtítulos.** Los videos de tus productos, tours o salones, y tus transmisiones en vivo, se muestran con los subtítulos encendidos, para que una persona sorda pueda seguirlos. Para que aparezcan, el video tiene que tener subtítulos en la plataforma: YouTube los crea automáticamente; en Vimeo los subes tú desde tu cuenta.
- **Contacto sin llamadas.** Tus clientes te escriben por WhatsApp o correo; nadie necesita hablar por teléfono para comprar o reservar.
- **Todo se hace por escrito.** Pedidos, reservas y avisos de la tienda son visuales: no dependen del sonido.
- **Consejo:** escribe las descripciones con frases cortas y claras. Para muchas personas sordas el español escrito es su segunda lengua, después de la lengua de señas.
