# Ecommerce multi-tenant: cómo se trabaja (los tres repos)

(Si eres un subagente, esta sección no es para ti: sigue tus propias instrucciones.)

Repos, en `C:/Users/diego armando/repositorios/ecommerce/`: `ecommerceMultitenant-BackendNode` (API, procesa),
`ecommerceMultitenant-FrontendAdmin` y `ecommerceMultitenant-FrontendStore` (ingresan datos).
Rubros: `productos`, `hotel`, `tours`, `eventos`, `locales` (alquiler), `canchas`.

El proceso completo está en BackendNode `docs/proceso/README.md`; el tablero de lo abierto, en BackendNode `docs/ESTADO.md`;
los diseños, en BackendNode `docs/disenos/INDICE.md`.

- La sesión principal **coordina**: un requerimiento mediano o grande no se implementa de una vez. Pasa por las etapas
  `ecommerce-proceso:analista-<rubro>` → `ecommerce-proceso:analista-requerimientos` → `ecommerce-proceso:disenador` (si hay pantallas)
  → `ecommerce-proceso:arquitecto` → `ecommerce-proceso:desarrollador` (una pieza) → `ecommerce-proceso:qa` → `ecommerce-proceso:deployer`.
- **Al terminar cada etapa se detiene**: le muestra a Diego el resumen "Para Diego" del agente y lo que debe aprobar. No encadena etapas sin su aprobación.
- Cambio chico (un archivo, texto, estilo, bug evidente): directo; si toca una funcionalidad con carpeta en `docs/specs/`, se anota en su `cambios.md`.
- Toda llave nueva o quitada y todo SQL quedan escritos en el documento de la funcionalidad, nunca solo en el chat.
- Si Diego pregunta "¿qué hace?", "¿qué cambió?" o "¿por qué?", se usa `ecommerce-proceso:explicador`.
- **Al cerrar una funcionalidad** (Diego confirma que se desplegó): el `deployer` la mueve a "Desplegado" en `ESTADO.md` y después
  se llama al `analista-<rubro>` de cada rubro que tocó para que actualice `docs/rubros/<rubro>.md` con lo nuevo. Así el
  conocimiento de los rubros crece con cada funcionalidad terminada.
- **Mejoras del proceso**: cuando un agente tropieza, Diego corrige cómo se trabaja ("no hagas X", "siempre Y") o una tarea se
  repite sin receta, anótalo en BackendNode `herramientas/claude-plugin/MEJORAS.md` (fecha, qué pasó, mejora propuesta, dónde se
  aplica, `propuesta`) y díselo a Diego en una línea. No cambies el plugin sin su aprobación.

## Estrategia de costo: el modelo y el esfuerzo según la tarea

Antes de actuar, clasifica la tarea y usa la estrategia de su fila. No gastes razonamiento de arquitecto en una tarea mecánica.

| Tipo de tarea | Ejemplos | Cómo se hace |
|---|---|---|
| **Receta** | commit, correr pruebas, SQL nuevo, llave nueva, parámetro, capacidad o pieza por rubro, versión de diseño, actualizar ESTADO | La skill `ecommerce-proceso:recetas`, paso a paso, sin explorar ni rediseñar lo que la receta ya fija |
| **Chica** | un texto, un estilo, un bug evidente en un archivo | Directo en la sesión principal, sin agentes; razonamiento mínimo |
| **Mediana** | una pantalla, una regla de negocio | Agentes con su modelo por defecto (abajo) |
| **Crítica** | contrato por rubro, BD/RLS, pagos, seguridad, concurrencia (cupos, reservas simultáneas), multi-tenant | Agentes; al `desarrollador` y al `qa` pásales `model: "opus"` en la llamada |

Modelo por defecto de cada agente (en su archivo): `arquitecto` opus/high; `analista-requerimientos` y `disenador` sonnet/high;
analistas de rubro, `desarrollador`, `qa` y `deployer` sonnet/medium; `explicador` sonnet/low.

- **No repitas etapas hechas**: si la funcionalidad ya tiene `tasks.md` (o `impacto.md`) aprobado, el plan existe; empieza en la
  etapa que falta (normalmente el `desarrollador` con la pieza siguiente), no vuelvas a lanzar al `arquitecto`.
- **No lances un agente para resumir**: cada agente ya cierra con su "Para Diego"; muéstralo tú. El `explicador` es para preguntas de Diego, no para redactar el resultado de otra etapa.
- **Revisar una spec en `borrador`** es trabajo del `analista-<rubro>` de cada rubro que toca: compara la spec con `docs/rubros/<rubro>.md` y el código del rubro. No la revises tú solo.
- **Sube** a `model: "opus"` cuando la tarea es crítica o un agente falló dos veces en lo mismo (o el `qa` rechazó la pieza dos veces).
- **Baja** a `effort: "low"` en tareas mecánicas: renombrar, regenerar, mover, aplicar un cambio ya decidido.
- Si un problema que resolviste probablemente se repita, propón a Diego agregarlo como receta (BackendNode `herramientas/claude-plugin/ecommerce-proceso/skills/recetas/`).
