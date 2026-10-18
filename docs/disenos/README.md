# Diseños: reglas

Los diseños se perdían porque vivían solo en claude.ai: nadie sabía cuál era el vigente y cada requerimiento
volvía a dibujar desde cero. Desde 2026-10-18 **la fuente de verdad es esta carpeta**.

1. **Todo diseño aprobado se copia aquí** antes de implementarlo: `docs/disenos/<diseño>/v<N>-AAAA-MM-DD.html`
   (o una carpeta `v<N>-AAAA-MM-DD/` si son varias pantallas). Si viene de Claude Design, se guarda el paquete de
   "Handoff to Claude Code" completo.
2. **Una versión aprobada no se edita.** Un cambio es una versión nueva (`v2-…`); la anterior pasa a
   "Reemplazados" en el [INDICE.md](INDICE.md) con el porqué.
3. **Cada diseño está en el índice** con su spec, su estado y si ya está implementado. La spec enlaza la copia del repo,
   no solo el enlace de claude.ai.
4. **Un diseño nuevo parte del vigente**, no de cero: el `disenador` lee primero el índice y la versión vigente de esa pantalla.
5. Los enlaces de claude.ai se conservan como "original", pero si se pierden, aquí está todo.

## Vista previa de las plantillas por rubro

`plantillas-por-rubro/v1-2026-10-13/vista/` tiene cada pantalla lista para abrir en el navegador (color de acento por defecto,
sin el editor de Claude Design). `fuente/` es el archivo editable original (`.dc.html` + `canvas.json`).
