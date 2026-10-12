# Spec: editor de Diseño en vivo

> Estado: **Fase 1 implementada** (2026-10-12), sin commit. La vista previa de la tienda se probó en el navegador con una página de prueba (borrador, orden, selección en los dos sentidos). Falta probar el editor del admin con sesión y backend local, y configurar `ADMIN_ORIGINS` en Vercel.
> Repos involucrados: BackendNode, FrontendAdmin, FrontendStore.
> Base: [estructura-tienda](../estructura-tienda/spec.md) (plantillas, copia, tema) y [diseno-por-rubro](../diseno-por-rubro/spec.md) (plantillas y secciones por tipo de negocio).
> Propuesta elegida: "Opción A · Lienzo con panel" (claude.ai/artifact/7rNJojVewHZMc6MebjWNHz). Ejemplo con canchas: claude.ai/artifact/RkiwZVaqtx2ZYAqCxzQ7fW.

## Problema

El dueño edita su diseño a ciegas: el editor es un esquema con formularios y para ver el resultado tiene que guardar y abrir su tienda en otra pestaña. Las plantillas se ven como bloques grises y aplicarlas guarda en el momento, con un aviso de que se pierden cambios. Hay dos formas de guardar: el logo y el banner al subirlos y el resto con "Guardar cambios".

Además, cada rubro tiene una o dos plantillas fijas en el código. Cuando un cliente quiere otro estilo para su rubro ("más simple"), no hay cómo ofrecérselo sin programar.

## Objetivo

1. **Ver mientras edita.** La tienda real al centro del editor, actualizándose con cada cambio, sin guardar.
2. **Elegir plantilla viéndola.** Cada rubro ofrece varias plantillas (la meta: 3). Probar una cambia la vista previa; recién se guarda al publicar.
3. **Un solo guardado.** Deshacer y rehacer siempre; un botón **Publicar**.
4. **Plantillas sin programar** (fase 2). La plataforma crea plantillas nuevas de un rubro desde el mismo editor.

## Fases

| Fase | Qué | Repos |
|---|---|---|
| 1 | Vista previa en vivo, plantillas en borrador con su tema, deshacer/rehacer, Publicar | los tres |
| 2 | Plantillas guardadas en base de datos y "Guardar como plantilla del rubro" (solo superadmin) | Backend, Admin |
| 3 | Vista previa de la ficha (producto, habitación, tour, cancha) y editar textos sobre la vista previa | Store, Admin |

## Fase 1

### Conceptos

- **Borrador.** Lo que el dueño cambió desde la última publicación. Vive en el editor (memoria del navegador). No se guarda en el servidor hasta **Publicar**.
- **Vista previa.** La tienda abierta en un iframe con `?vista-previa=1`. Recibe el borrador por `postMessage` y lo dibuja como si fuera el diseño publicado.
- **Tema de una plantilla.** Una plantilla puede traer su paleta y su tipografía (`tema`). Al probarla, el borrador toma la estructura y también ese tema; el dueño puede cambiar colores y letras después.

### Requisitos — backend

- **V1** Una plantilla puede declarar `tema: { paleta, tipografia }` con ids del catálogo. El catálogo la entrega como está.
- **V2** `POST /admin/tiendas/:id/diseno/estructura/copia { plantillaId }` devuelve `{ estructura, tema }` sin guardar nada: la estructura con las mismas reglas de copia de siempre (R3) y los textos de portada que la tienda ya tenía, y el tema de la plantilla (o null). Responde 400 si la plantilla no existe o es de otro tipo de negocio. Rol mínimo: admin de la tienda.
- **V3** Publicar es el `PUT /:id/diseno` de siempre (estructura y tema completos). Los endpoints `aplicar` y `deshacer` se mantienen por compatibilidad; el editor nuevo no los usa.

### Requisitos — tienda (modo vista previa)

- **V4** Con `?vista-previa=1` y dentro de un iframe, la tienda entra en modo vista previa. Fuera de un iframe, el parámetro se ignora.
- **V5** Al arrancar envía `{ tipo: "vp-lista" }` a la ventana padre. Acepta solo mensajes de la ventana padre y, si `environment.adminOrigins` tiene valores, solo de esos orígenes.
- **V6** `{ tipo: "vp-diseno", diseno, tienda }` reemplaza en memoria el diseño de la tienda (`anuncio`, `hero`, `tema`) y los datos visibles (`logoUrl`, `bannerUrl`). Un refresco de la tienda (al volver a la pestaña) conserva el borrador recibido.
- **V7** El tema recibido se dibuja igual que el publicado: secciones ocultas no se ven, la oferta sin fecha o vencida tampoco (como `resolverTema`).
- **V8** Cada parte que se puede editar lleva `data-seccion`: `anuncio`, `encabezado`, `pie` y el id de cada sección de la home. Al pasar el mouse se marca; un clic envía `{ tipo: "vp-seleccion", id }` al padre.
- **V9** `{ tipo: "vp-seleccionar", id }` marca esa parte y la desplaza a la vista.
- **V10** En vista previa, los enlaces y botones no navegan ni envían nada, no se cargan píxeles de seguimiento y no se guarda el cache del tema.

### Requisitos — admin

- **V11** Diseño tiene tres zonas en escritorio: esquema a la izquierda, vista previa al centro y el panel de la parte elegida a la derecha. En el celular, la vista previa va arriba, una fila de pestañas con las partes y el panel debajo.
- **V12** Cada cambio del borrador llega a la vista previa sin guardar. Elegir una parte en el esquema la marca en la vista previa y viceversa.
- **V13** En **Estilo**, arriba, las plantillas del tipo de negocio de la tienda, con su miniatura en los colores de su tema. "Probar" pide la copia (V2) y la pone en el borrador. La plantilla en uso se marca.
- **V14** **Deshacer** y **Rehacer** cubren todo el borrador (estructura, tema, anuncio, portada). Teclear en un mismo campo cuenta como un solo paso.
- **V15** **Publicar** guarda el borrador (V3). Se habilita solo con cambios. Salir con cambios sin publicar pide confirmación, como hoy.
- **V16** Se quitan "Personalizar", "Restaurar" y el bloqueo "primero elige una plantilla". Una tienda sin estructura guardada ve su plantilla por defecto como borrador inicial.
- **V17** El logo y el banner se siguen guardando al subirlos (viven en la tienda, no en el diseño) y se ven en la vista previa en el momento.

### Fuera de la fase 1

- Borrador guardado en el servidor (si se cierra la pestaña, se pierde lo no publicado).
- Vista previa de la ficha: la pestaña de la ficha sigue con su formulario.
- Programar plantillas nuevas: el contenido de las plantillas lo arma la plataforma (fase 2).

## Decisiones

- **postMessage y no URL con el borrador.** El borrador puede ser grande (15 secciones con textos) y cambia con cada tecla; recargar el iframe parpadea y pierde el scroll.
- **La copia la arma el backend (V2).** Las reglas de copia (secciones con afirmaciones ocultas, testimonios vacíos, textos de portada propios) quedan en un solo lugar: `copia.js`.
- **Orígenes permitidos opcionales (V5).** Un sitio ajeno que enmarque la tienda solo puede cambiar lo que se ve dentro de su propia página, lo mismo que podría hacer copiando el HTML. Aun así, en producción se configura `ADMIN_ORIGINS`.
