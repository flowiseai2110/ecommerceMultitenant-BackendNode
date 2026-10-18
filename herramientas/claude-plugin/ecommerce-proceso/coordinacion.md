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
