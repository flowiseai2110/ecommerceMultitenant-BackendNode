# Plugin `ecommerce-proceso`

Los agentes y las reglas del [proceso](../../docs/proceso/README.md), versionados con el repo.

| Parte | Dónde | Qué hace |
|---|---|---|
| 13 agentes | `ecommerce-proceso/agents/` | `ecommerce-proceso:analista-<rubro>`, `analista-requerimientos`, `disenador`, `arquitecto`, `desarrollador`, `qa`, `deployer`, `explicador` |
| Estrategia de costo | `agents/*.md` (`model`, `effort`) y `coordinacion.md` | Cada agente trae el modelo y esfuerzo que su tarea pide (solo el arquitecto usa opus); la coordinación clasifica la tarea (receta, chica, mediana, crítica) y sube o baja el modelo |
| Recetas | `ecommerce-proceso/skills/recetas/` | Skill `ecommerce-proceso:recetas`: datos fijos del proyecto y pasos de las tareas repetidas (commit, pruebas, SQL, llave, parámetro, capacidad o pieza por rubro, versión de diseño, ESTADO, local, plugin), para no volver a investigarlas |
| Coordinación | `ecommerce-proceso/coordinacion.md` | Se agrega al prompt de toda sesión abierta en los tres repos o en su carpeta padre: la sesión principal pasa cada requerimiento por las etapas y se detiene a pedir aprobación. Es texto: se edita directo |
| Diseños aprobados | `hooks/register.ts` | Bloquea editar o sobrescribir `docs/disenos/<diseño>/v<N>…`: obliga a crear la versión siguiente |
| Llaves nuevas | `hooks/register.ts` | Al escribir código que lee una `process.env.X` nueva que `.env.example` no declara (o si el repo no tiene `.env.example`), le avisa al modelo que la declare y la anote para el despliegue |
| SQL nuevo | `hooks/register.ts` | Al crear un archivo en `docs/sql/`, pide anotarlo en "Afecta al despliegue" y en "Te toca" de `ESTADO.md` |
| Bitácora | `hooks/register.ts` | Si en el turno se cambió código y no `cambios.md` ni `ESTADO.md`, pide anotarlo antes de terminar (o decir que es un cambio chico) |

Las reglas son funciones puras en `hooks/reglas.ts`; las pruebas en `hooks/register.test.ts`. `tipos/claude-code.d.ts` es la API de
hooks de Claude Code 2.1.301 (la primera línea dice la versión); cuando Claude Code cambie de versión y algo deje de compilar,
pídele a Claude que lo regenere.

## Instalar (una vez por computadora)

```bash
claude plugin marketplace add "C:/Users/diego armando/repositorios/ecommerce/ecommerceMultitenant-BackendNode/herramientas/claude-plugin"
claude plugin install ecommerce-proceso@ecommerce-local --scope user
```

Requiere Claude Code **2.1.287 o más nuevo** (los módulos de hooks). El de la extensión de VS Code ya lo es.

## Cambiar un agente o una regla

El plugin se lee **desde esta carpeta**: edita el archivo y corre `/reload-plugins` en la sesión. No hay que reinstalar.
Antes de commitear un cambio en `hooks/` (valida, corre las pruebas y revisa los tipos con el Claude Code correcto):

```bash
bash herramientas/claude-plugin/verificar.sh
```

Sube `version` en `ecommerce-proceso/.claude-plugin/plugin.json` cuando cambie el comportamiento.

## Comprobar que la coordinación enruta bien

Después de cambiar `coordinacion.md` o un agente, corre los 20 casos de [docs/proceso/casos-de-uso.md](../../docs/proceso/casos-de-uso.md)
en modo simulación (o solo algunos con el tercer argumento) y compara con lo esperado:

```bash
bash herramientas/claude-plugin/evaluar-coordinacion.sh <carpeta-de-salida> sonnet [2,6]
```

## Apagarlo

`/plugin` → Installed → `ecommerce-proceso` → Disable (por ejemplo, para corregir a propósito un diseño aprobado).
