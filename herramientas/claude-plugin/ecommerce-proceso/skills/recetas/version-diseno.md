# Receta: nueva versión de un diseño

Un diseño aprobado no se edita (el plugin lo bloquea). Un cambio es una versión nueva.

1. Lee `BackendNode/docs/disenos/INDICE.md` y la versión vigente del diseño. Parte de ella, no de cero.
2. Crea `docs/disenos/<diseño>/v<N+1>-AAAA-MM-DD.html` (o la carpeta `v<N+1>-AAAA-MM-DD/` si son varias pantallas).
   Si se dibujó en claude.ai, copia aquí el resultado (o el paquete "Handoff to Claude Code").
3. En `INDICE.md`: la fila de "Vigentes" apunta a la versión nueva; la anterior pasa a "Reemplazados" con fecha y por qué.
4. En la spec y en `diseno.md`: enlaza la copia del repo y el original de claude.ai.

**Decide** solo el número de versión y la razón del cambio.
