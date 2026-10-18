# Proceso de trabajo con agentes

> Por qué existe: el código crecía más rápido que lo que el dueño del producto alcanzaba a entender
> ("deuda de comprensión"). La solución que usa la industria no es "más IA", sino **dejar todo por escrito
> en el repo y que una persona apruebe cada paso**: spec → diseño → impacto → tareas → código → QA → despliegue.
> Referencias: Spec Kit (GitHub), BMAD Method, ADR de Nygard, "Comprehension Debt" (Addy Osmani).

## Regla de oro

1. **Ningún agente pasa a la siguiente etapa sin tu aprobación.** Cada etapa termina con un documento y una pregunta.
2. **La memoria del proyecto vive en `docs/`, versionada**, no en el chat ni en la memoria privada de Claude.
   Si algo no está en un documento, no existe.
3. **Una pieza a la vez** (divide y vencerás): se desarrolla, se prueba y se despliega una pieza antes de la siguiente.
4. **El tablero [`docs/ESTADO.md`](../ESTADO.md)** dice siempre qué está abierto, en qué etapa y qué te toca hacer a ti.

## Los agentes

Viven en `~/.claude/agents/ecommerce/` (carpeta de usuario: se ven desde los tres repos; la carpeta padre `repositorios/ecommerce/`
no sirve porque Claude Code deja de buscar en la raíz de cada repo git). La coordinación está en `repositorios/ecommerce/CLAUDE.md`,
que sí se carga desde los tres. Se llaman con `@agente-<nombre>` o "usa el agente X para …".

| Etapa | Agente | Produce | Toca código |
|---|---|---|---|
| Conocimiento | `analista-productos`, `analista-hotel`, `analista-tours`, `analista-eventos`, `analista-locales`, `analista-canchas` | `docs/rubros/<rubro>.md` (reglas de negocio del rubro) | No |
| 1. Qué y por qué | `analista-requerimientos` | `docs/specs/<feature>/spec.md` | No |
| 2. Cómo se ve | `disenador` | `docs/specs/<feature>/diseno.md` (+ prototipo opcional) | Solo `prototipos/` |
| 3. Cómo se construye | `arquitecto` | `impacto.md` + `tasks.md` | No |
| 4. Construir | `desarrollador` | código + tests + `cambios.md` | Sí |
| 5. Probar | `qa` | `qa.md` | Solo tests |
| 6. Desplegar | `deployer` | `despliegue.md` (checklist manual Railway / Vercel / Supabase) | No |
| En cualquier momento | `explicador` | explicaciones en lenguaje simple | No |

## Carpeta de una funcionalidad

```
docs/specs/<feature>/
  spec.md        analista-requerimientos   qué, por qué, rubros, criterios de aceptación
  diseno.md      disenador                 pantallas, flujos, estados, mobile/desktop (si hay UI)
  impacto.md     arquitecto                qué módulos toca en cada repo, BD, contrato, riesgos, alternativas
  tasks.md       arquitecto                piezas en orden, cada una verificable
  cambios.md     desarrollador             bitácora por pieza: qué se cambió, dónde y por qué (para humanos)
  qa.md          qa                        matriz criterio × rubro, resultado, evidencia
  despliegue.md  deployer                  llaves nuevas/quitadas, SQL, orden, verificación, reversa
```

Los diseños (HTML, lienzos, paquetes de Claude Design) van en [`docs/disenos/`](../disenos/README.md) con su
[índice](../disenos/INDICE.md): versionados, sin sobrescribir los aprobados.

Plantillas: [`plantillas/`](plantillas/). Las specs anteriores no se migran; se completan cuando se vuelvan a tocar.

## Estados (cabecera de `spec.md` y columna del tablero)

`borrador` → `aprobado` → `diseñado` → `planificado` → `en desarrollo (pieza N)` → `en QA` → `listo para desplegar` → `desplegado` → `cerrado`

## Cuándo usar el flujo completo

- **Cambio chico** (texto, estilo, bug evidente de un archivo): directo con el desarrollador; anotar en `cambios.md` si toca una feature existente.
- **Cambio mediano** (una pantalla, una regla): requerimientos → arquitecto → desarrollador → qa → deployer.
- **Cambio grande o que cruza rubros/repos**: flujo completo, empezando por los analistas de rubro afectados.

## Marcador del último despliegue

Para que el deployer sepa "qué cambió desde producción", cada repo lleva un tag `prod-AAAA-MM-DD` en el commit desplegado.
El deployer lo propone al final; tú confirmas que ya desplegaste y entonces se crea.
