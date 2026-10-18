# Spec: editor de Diseño en vivo

> Estado: **Fase 1 implementada y probada** (2026-10-12, commit "fase 1 diseño"). Lo pendiente de producción está en [pase-a-produccion.md](pase-a-produccion.md).
> Repos involucrados: BackendNode, FrontendAdmin, FrontendStore.
> Pase a producción: [pase-a-produccion.md](pase-a-produccion.md).
> Base: [estructura-tienda](../estructura-tienda/spec.md) (plantillas, copia, tema) y [diseno-por-rubro](../diseno-por-rubro/spec.md) (plantillas y secciones por tipo de negocio).
> Propuesta elegida: "Opción A · Lienzo con panel" (claude.ai/artifact/7rNJojVewHZMc6MebjWNHz). Ejemplo con canchas: claude.ai/artifact/RkiwZVaqtx2ZYAqCxzQ7fW. Copia en el repo: [docs/disenos/nuevo-editor-diseno/](../../disenos/nuevo-editor-diseno/).

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

## Fase 2 — Plantillas sin programar

> Estado: **implementada, probada y con commit** (2026-10-12); SQL corrido en Supabase. Solo falta el pase a producción.

### Problema

Cada plantilla vive en `plantillas.js`: agregar una para un rubro (la "Simple" que pide un cliente de canchas) exige programar y desplegar el backend.

### Conceptos

- **Administrador de la plataforma.** Quien vende el SaaS, no el dueño de una tienda. Se reconoce por su email en `PLATFORM_ADMIN_EMAILS` (separados por coma). Hoy no existe otro rol de plataforma.
- **Plantillas del código y de la base.** Las de `plantillas.js` son la base y siempre existen. La tabla `plantillas_diseno` **agrega** plantillas nuevas y **reemplaza** las del código con el mismo id (cambiar textos, ocultarla, cambiar el orden). Así la plantilla por defecto de un rubro no puede faltar aunque la base no responda.
- **Ocultar, nunca borrar.** Una plantilla oculta no se ofrece a las tiendas, pero las tiendas que la usan siguen viéndose igual: su estructura es una copia y el backend la sigue encontrando.

### Requisitos

- **P1** Tabla `plantillas_diseno`: `id`, `tipo_negocio`, `rubro`, `nombre`, `descripcion`, `version`, `orden`, `activa`, `contenido` (radio, encabezados, layout, secciones, tema) y auditoría. Sin `tienda_id`: es de la plataforma.
- **P2** El catálogo (`GET /admin/diseno/catalogo`) y las búsquedas de plantillas usan la combinación código + base, guardada en memoria y recargada al arrancar, cada 5 minutos y después de cada cambio. Si la base falla, se usan las del código.
- **P3** El catálogo solo trae las activas, ordenadas por `orden` (las del código, en su orden de siempre).
- **P4** `POST /admin/diseno/plantillas` (solo administrador de la plataforma) crea una plantilla a partir del diseño de una tienda: `{ tiendaId, nombre, descripcion, estructura, tema }`. El tipo de negocio y el rubro son los de esa tienda. La estructura pasa las mismas validaciones que al publicar.
- **P5** Al crearla o actualizarla, las fotos propias de la tienda no viajan: "imagen y texto" con foto propia pasa a usar el banner de cada tienda y la galería queda vacía. Los textos se guardan como ejemplo y, al copiarla a una tienda, rigen las reglas de copia (R3).
- **P6** `PUT /admin/diseno/plantillas/:id` (solo administrador de la plataforma) cambia nombre, descripción, orden o visibilidad, o reemplaza el diseño con el de una tienda (`tiendaId`, `estructura`, `tema`). Cambiar el diseño sube la `version`. Una plantilla del código se edita guardando su reemplazo en la base.
- **P7** No se puede ocultar la plantilla por defecto de un tipo de negocio (400).
- **P8** `GET /admin/diseno/plantillas?tipoNegocio=` (solo administrador de la plataforma) lista todas las del tipo, también las ocultas, con su origen (`codigo` / `editor`).
- **P9** `GET /admin/tiendas/:id/diseno` incluye `puedeEditarPlantillas`.
- **P10** En el editor, el administrador de la plataforma ve en **Estilo**:
  - "Guardar como plantilla nueva" (nombre y descripción) con el borrador actual.
  - "Actualizar «X»" cuando el borrador parte de la plantilla X.
  - En cada tarjeta: subir, bajar, ocultar o mostrar. Las ocultas aparecen atenuadas solo para él.

### Fuera de la fase 2

- Borrar plantillas (solo se ocultan).
- Plantillas de una sola tienda o de un grupo de tiendas.
- Una pantalla de plantillas fuera del editor de Diseño.

## Decisiones

- **postMessage y no URL con el borrador.** El borrador puede ser grande (15 secciones con textos) y cambia con cada tecla; recargar el iframe parpadea y pierde el scroll.
- **La copia la arma el backend (V2).** Las reglas de copia (secciones con afirmaciones ocultas, testimonios vacíos, textos de portada propios) quedan en un solo lugar: `copia.js`.
- **Orígenes permitidos opcionales (V5).** Un sitio ajeno que enmarque la tienda solo puede cambiar lo que se ve dentro de su propia página, lo mismo que podría hacer copiando el HTML. Aun así, en producción se configura `ADMIN_ORIGINS`.
