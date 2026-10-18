# Receta: cambiar o verificar el plugin `ecommerce-proceso`

Carpeta: `BackendNode/herramientas/claude-plugin/ecommerce-proceso/`. Se lee desde ahí: tras editar, `/reload-plugins`.

| Cambiar | Archivo |
|---|---|
| Un agente (instrucciones, `model`, `effort`, `tools`) | `agents/<agente>.md`; la `description` en formato `>-` (un `:` en una sola línea rompe el YAML) |
| La coordinación y la estrategia de costo | `coordinacion.md` |
| Una receta | `skills/recetas/<receta>.md` y su fila en `SKILL.md` |
| Qué cuenta como código, diseño o llave de plataforma | `hooks/reglas.ts` (+ prueba en `hooks/register.test.ts`) |
| Los hooks | `hooks/register.ts` (+ prueba) |

Después de cambiar `hooks/` o un agente: `bash herramientas/claude-plugin/verificar.sh` (valida, prueba y revisa tipos).
Si cambia el comportamiento, sube `version` en `.claude-plugin/plugin.json` y corre `claude plugin update ecommerce-proceso@ecommerce-local`
con el `claude` de la extensión de VS Code.
