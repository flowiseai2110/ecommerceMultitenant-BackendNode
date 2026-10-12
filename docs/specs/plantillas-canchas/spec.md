# Spec: plantillas de canchas

> Estado: **implementada** (2026-10-12), sin commit. Pruebas pasan en los 3 repos; falta verla en el navegador (sobre todo el tema oscuro en todas las páginas).
> Repos involucrados: BackendNode, FrontendStore, FrontendAdmin.
> Base: [alquiler-canchas](../alquiler-canchas/spec.md) (rubro y secciones) y [editor-diseno-en-vivo](../editor-diseno-en-vivo/spec.md) (plantillas desde el editor).
> Propuesta aprobada: "Tres plantillas para canchas" (claude.ai/artifact/7KTkVF44E3cDRpZAarfNXw) más la idea "Liga y equipos".

## Objetivo

Que una tienda de canchas pueda elegir entre varias plantillas:

| Plantilla | Para quién | Estado |
|---|---|---|
| Complejo deportivo (`canchas-complejo`) | Varias canchas, quiere vender todo desde la página | Ya existe |
| Al toque | Una o dos canchas, quiere reservas rápidas | Se arma en el editor, sin código |
| Noche de reflectores (`canchas-noche`) | Vive de los partidos de noche, quiere lucir sus canchas | Necesita las piezas PC1 y PC2 |
| Liga y equipos (`canchas-liga`) | Vive del alquiler fijo y de campeonatos | Necesita la pieza PC3 |

## Piezas nuevas

### PC1 — Paletas con fondo oscuro

- Cada paleta base gana la versión **Noche** (`<base>-noche`, por ejemplo `amber-noche`): fondo de página y superficies oscuros, texto claro, barra de arriba con el color de marca y pie en la superficie oscura. La paleta lleva `oscura: true`.
- La tienda la dibuja **en todas sus páginas** sin cambiar componentes: invierte la escala de neutros de la paleta (el gris 900 pasa a ser claro y el 50 oscuro) y el blanco de las superficies pasa a ser el gris oscuro de la familia. `text-white` sigue siendo blanco (texto sobre fotos y botones de color). Los bloques de contraste (`scheme-inverse`) quedan más oscuros que la página.
- El script de arranque (cache del tema) aplica el modo oscuro antes de que cargue la app, para que no se vea un destello claro.
- Sirve a cualquier rubro.

### PC2 — Portada de canchas con foto

- `canchas-portada` gana `variante`: `dibujo` (la de siempre, valor por defecto) o `foto`.
- `foto`: el banner de la tienda ocupa la portada de borde a borde, con un degradado oscuro para que el texto se lea; se mantienen las tarifas, los botones y los horarios libres de hoy. Sin banner, se dibuja como `dibujo`.
- En el admin, al elegir `foto` se ofrece subir el banner en el mismo panel.

### PC3 — Tabla de la liga

- Sección nueva `liga` (solo canchas, máximo una): antetítulo, título, nombre del campeonato (opcional), nota (opcional; por ejemplo "Próxima fecha: sábado 19") y hasta 20 equipos.
- Cada equipo: nombre, PJ, PG, PE, PP, GF y GC. Los puntos (3 por partido ganado y 1 por empate) y el orden (puntos, diferencia de goles, goles a favor) los calcula la tienda.
- Sin equipos no se dibuja.
- Regla de copia (como los testimonios, R3.2): una plantilla nunca publica equipos inventados. Al copiarla, la tabla llega **vacía y oculta**.

## Plantillas nuevas en el código

- `canchas-noche`: tema `amber-noche` + `deportiva`. Portada con foto, horarios libres, galería (mosaico), canchas (grilla), testimonios, alquiler fijo semanal y ubicación.
- `canchas-liga`: tema `indigo-contraste` + `comercial`. Portada, alquiler fijo semanal, tabla de la liga, cómo funciona, horarios libres, canchas, preguntas y ubicación.
- "Al toque" no va en el código: se crea desde el editor (editor-diseno-en-vivo, fase 2).

## Fuera de alcance

- Gestionar el campeonato (fixture, resultados, inscripción de equipos). La tabla se escribe a mano en Diseño.
- Modo oscuro automático según el dispositivo del visitante: la paleta es una elección del dueño.
