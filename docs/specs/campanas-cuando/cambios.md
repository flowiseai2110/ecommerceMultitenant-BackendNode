# Cambios: Campañas, "el cuándo"

> Bitácora para humanos. Una entrada por pieza, la más reciente arriba.

## 2026-10-19 — Piezas 0 y 1a: horas de inicio y fin
**En una frase:** el dueño puede decir que una campaña empieza y termina a una hora exacta ("Todo el día" o "A las 10:00", hora de Lima) y el cliente ve en la cuenta regresiva cuándo termina ("Termina el lunes 30 a medianoche"). Una campaña guardada sin hora se ve igual que ayer.

**Pieza 0:** no hubo nada que commitear. Los tres repos ya tenían limpio lo que el plan nombraba (`campanas.component.{ts,html}` en `FrontendAdmin@394f38f`, `claves-tienda.json` y `en.json` en `BackendNode@ce27fd9`); se verificó con `git status`.

**Dónde:**
| Repo | Archivo | Qué hace |
|---|---|---|
| Backend | `modules/campanas/calendario.js` | `ventana()` pasa a `ventanas()` (devuelve una lista); horas en el primer y último día; `fechaClave` de una propia es el día que contiene `fin - 1 ms`; descarta ventanas vacías. `ventana()` queda como atajo (primera ventana) para no tocar los tests de hoy. |
| Backend | `modules/campanas/campanas.schema.js` | `horaInicio`/`horaFin` (`HH:mm`), fin posterior al inicio, 90 días por días de calendario tocados, sin `00:00` de fin en el catálogo, sin ventana vacía, `hora` opcional en la vista previa. |
| Backend | `modules/campanas/resolver.js`, `campanas.service.js`, `tiendas.admin.routes.js` | `efectiva()` con las horas; `campanasAplicables()` (punto de extensión para la sede); `calendarioAnual()` trae `ventanas[]` y las horas; vista previa con `?hora=HH:mm` (sin hora, mediodía). |
| Admin | `shared/campo-hora/campo-hora.component.ts` | Control "Todo el día / A las [HH:mm]" (44 px, aria, "hora de Lima"). |
| Admin | `pages/campanas/campanas.component.{ts,html}` | Horas en el panel de la propia y del catálogo, ayudas por estado, rango con hora solo si hay hora, fin 00:00 como "medianoche", chips "Empieza hoy a las…" y "Terminó", Guardar deshabilitado con error. |
| Admin | `pages/diseno/campana-edicion.ts`, `models/campana.model.ts` | `errorCuando()` con las mismas reglas y textos que el backend; `validarCampana()` la usa. |
| Tienda | `features/home/sections/offer-section.component.ts`, `core/theme/fin-campana.ts` | Pie "Termina el {día} a medianoche / a las HH:mm" y "Terminando…" (máx. 15 s) al llegar a cero. |
| Tienda / Backend | `claves-tienda.json` (generado), `en.json` | 3 claves nuevas y su inglés. |

**Decisiones que tomé y por qué:**
- `ventana()` se conserva como atajo de `ventanas()[0]`: la tarea decía "los tests de hoy sin cambios" y esos tests la llaman.
- Para el mensaje de "fin antes del inicio" se mantiene el texto de hoy cuando el *día* de fin es anterior; el texto nuevo ("La fecha y hora de fin deben ser posteriores al inicio") sale cuando el día no es anterior pero la hora sí (CA-3.5). Así el test existente no cambia.
- "Todo el día" del último día y "00:00" del día siguiente son el mismo instante (R3.14), por eso el cliente ve igual "a medianoche" en ambos; la variante "Termina el domingo 22" sin hora del diseño no se puede distinguir y no se usó.
- "Terminando…" se muestra máximo 15 s tras llegar a cero y luego la sección desaparece (como hoy). Hasta que llegue la pieza 1b (cambio en caliente) no hay respuesta nueva que lo reemplace.
- La rama "por año" de `ventanas()` no se hizo: es de la pieza 2.

**Lo que quedó pendiente / deuda:**
- T1a.8: la vista previa del Admin hoy no llama a `/vista-previa` (usa el iframe con `campanaParaVista`, que ya trabaja con el `inicio`/`fin` reales de la fila, horas incluidas), así que no hay servicio que mande `hora`. El backend ya la acepta; se conecta cuando el Admin la use.
- El pie "Termina…" también sale en una sección "oferta" puesta a mano en la estructura de la tienda (comparte el componente).
- Falta probarlo en el navegador (ver "Verificar" de la pieza 1a en `tasks.md`).

**Afecta al despliegue:** nada (sin SQL ni llaves). Orden: backend, Admin, tienda.

**Commits:** sin commit (Diego decide).
