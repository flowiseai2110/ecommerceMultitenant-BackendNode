# Mejoras del proceso

> Lo que se descubre al usar el plugin: un agente que tropieza, una corrección de Diego al proceso, una tarea que se repite.
> Se anota aquí en el momento (la coordinación lo hace) y se aplica cuando Diego lo decide. La más reciente arriba.
> Dónde se aplica cada tipo de mejora: [README](README.md) y la receta `plugin` de `ecommerce-proceso:recetas`.

Estados: `propuesta` → `aprobada` → `aplicada (v<versión>)` · o `descartada` (con el porqué).

| Fecha | Qué pasó | Mejora propuesta | Dónde se aplica | Estado |
|---|---|---|---|---|
| 2026-10-18 | La coordinación lanzaba al `explicador` para resumir y repetía al `arquitecto` con `tasks.md` aprobado (casos 6 y 2) | Reglas "no repetir etapas" y "no lanzar agentes para resumir" | `coordinacion.md` | aplicada (v0.3.1) |
| 2026-10-18 | Elegir patrones de diseño no estaba escrito como decisión de nadie | Catálogo `docs/proceso/patrones.md` y sección "Patrones" obligatoria en `impacto.md` | `arquitecto.md`, plantilla `impacto.md` | aplicada (v0.3.2) |
| 2026-10-18 | El conocimiento de los rubros quedaba viejo después de cada cambio | Al cerrar una funcionalidad, el analista de cada rubro que tocó actualiza `docs/rubros/<rubro>.md` | `coordinacion.md` | aplicada (v0.3.3) |
| 2026-10-20 | Diego pidió registrar como ADR las decisiones de arquitectura (precio en servidor, campaña en 3 pasos); no existía `docs/adr/` | El `arquitecto` escribe un ADR en `docs/adr/` (formato del README) por cada decisión que cambie una regla transversal o reemplace una anterior, y lo enlaza desde `impacto.md` | `arquitecto.md`, `docs/proceso/README.md` | propuesta |
