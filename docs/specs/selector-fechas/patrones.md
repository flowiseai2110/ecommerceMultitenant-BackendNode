# Patrones de diseño: selector de fechas

> Acompaña a [spec.md](spec.md) y [tasks.md](tasks.md). Explica qué patrón usa cada pieza (K0–K6), por qué, y qué se descartó.

## 1. Resumen

| # | Patrón | Pieza | Problema que resuelve |
|---|---|---|---|
| 2 | Strategy | K2, K3 | Cada rubro dice cómo es un día sin que el calendario conozca el rubro. |
| 3 | Núcleo funcional, cáscara reactiva | K0 | Probar reglas de fechas sin DOM y copiarlas entre repos. |
| 4 | Máquina de estados | K3 | Saber qué hace un toque según lo ya elegido. |
| 5 | Presentacional y contenedor (composición) | K1 dentro de K2 y K3 | Una sola grilla para un día, para rangos, en vitrina y admin. |
| 6 | Adapter | CVA en admin, K5, respuesta del backend → estrategia | Conectar el calendario con formularios y con datos de otra forma. |
| 7 | Foco itinerante (WAI-ARIA grid) | K1 | Teclado y lector de pantalla. |
| 8 | Configuración como datos | Atajos, leyenda | Agregar un atajo o un tono sin tocar el componente. |
| 9 | Estado local con signals | Todos | Estado efímero de UI fuera de NgRx. |
| 10 | Proyección de contenido | K4 | Un mismo panel para K2 o K3, popover o hoja inferior. |
| 11 | Copia con test espejo | K0–K3 entre repos | Reusar sin librería compartida. |

## 2. Strategy: `EstrategiaCalendario`

Ya existe en `compartido/calendario-mes.component.ts` y funciona bien: la ficha de tour y la de salón pasan una función `(fecha) => DiaCalendario`. Se mantiene y solo se amplía el resultado:

```ts
export interface DiaCalendario {
  habilitado: boolean;
  tachado?: boolean;
  tono?: 'pocos' | 'destacado' | null;   // nuevo
  sub?: string;                           // nuevo: "1 turno", "S/90"
  etiqueta?: string;                      // se lee con la fecha
}
export type EstrategiaCalendario = (fecha: string) => DiaCalendario;
```

**Por qué.** Cumple la regla del proyecto: el código compartido pregunta por capacidades, no por identidad (`CLAUDE.md`, "Lógica por rubro"). El calendario no sabe si es un tour o un salón; solo pinta lo que la estrategia devuelve. Un rubro nuevo escribe su estrategia y no toca K2.

**Cómo se usa bien.**
- La estrategia es un `computed` que lee sus señales (cierres, ocupación), así K2 se repinta cuando llegan los datos. Ya es así en `tour-page` y `salon-page`.
- La estrategia es pura y barata: se llama 28 a 62 veces por pintada. Nada de búsquedas lineales adentro: los datos van en un `Map` por fecha, como hace `salon-page` con `calendario()`.
- `tono` es semántico ("pocos"), no un color. El color lo decide K1 con los tokens de la tienda.

**En rango (K3)** el papel de la estrategia lo cumple `ReglasEstadia` (hoy en `hotel/calendario-estadia.ts`): un objeto de política con `bloqueadas`, `minNoches(entrada)` y `maxNoches`. Se generaliza a `ReglasRango` y el admin lo arma con sus propios datos (temporadas, reservas).

## 3. Núcleo funcional, cáscara reactiva (K0)

Toda decisión sobre fechas vive en funciones puras sin Angular:

```ts
celdasMes(mes: string, estrategia: EstrategiaCalendario): (Celda | null)[]
tocarRango(fecha: string, sel: SeleccionRango, reglas: ReglasRango): SeleccionRango | null
moverFoco(fecha: string, tecla: string, limites: Limites): string
```

Los componentes son la cáscara: guardan signals, llaman a K0 en `computed` y emiten eventos.

**Por qué.**
- Ya funciona así en hotel (`calendario-estadia.ts` separado de su componente) y es la parte con menos bugs.
- Las reglas de fechas son las que fallan en los bordes (febrero, cambio de mes, salida sobre noche bloqueada). Se prueban con Jasmine sin `TestBed`, en milisegundos.
- Es lo único que se copia entre repos (ver §11). Cuanto menos Angular tenga, menos se rompe al copiar.

**Regla.** Si una función de K0 necesita `inject()`, un signal o el DOM, no va en K0.

## 4. Máquina de estados del rango (K3)

Un rango tiene tres estados y un toque cambia de uno a otro:

```
          toca día válido                 toca día > entrada y válido como salida
 [vacío] ─────────────────▶ [entrada] ─────────────────────────────────────────────▶ [completo]
    ▲                        │   ▲  toca día ≤ entrada, o que cruza un bloqueo          │
    │                        │   └──────────────── (empieza de nuevo) ◀────────────────┤
    └──── Borrar ────────────┴─────────────────────────────────────────────────────────┘
                          toca día con menos del mínimo de noches → sin cambio
```

```ts
type SeleccionRango =
  | { estado: 'vacio' }
  | { estado: 'entrada'; entrada: string }
  | { estado: 'completo'; entrada: string; salida: string };
```

**Por qué una unión discriminada y no `{ entrada: string | null; salida: string | null }`.** Hoy `calendario-estadia` mezcla `pendiente`, `entrada()` y `salida()` en tres fuentes y las reconcilia en `sel`. Con la unión, el compilador impide estados imposibles (salida sin entrada) y `tocarRango` es una tabla de transiciones que se prueba caso por caso. La vista previa (hover) no es un estado: es un `signal` aparte que solo se lee en `entrada`.

## 5. Presentacional y contenedor (composición, no herencia)

```
K1 app-grilla-mes        ← presentacional: recibe celdas, emite elegir/hover/foco
 ├─ K2 app-calendario-mes    ← contenedor: estrategia + mes visible + leyenda
 └─ K3 app-calendario-rango  ← contenedor: reglas + máquina de estados + 1 o 2 K1 + pie
K4 app-campo-fecha       ← contenedor de K2 o K3 (proyección, §10)
```

**Por qué.**
- Hoy `calendario-mes` y `calendario-estadia` repiten la cabecera, la grilla y los estilos. Con K1 hay un solo lugar para accesibilidad, tamaños y tema.
- K1 no tiene lógica: entra `Celda[]`, sale un evento. Se puede usar en vistas de agenda (`local-calendario`) más adelante sin arrastrar reglas de reserva.
- **Composición en vez de una clase base `CalendarioBase`**: Angular con signals e inputs funcionales se lleva mal con la herencia de componentes (los `input()` del padre no se redeclaran bien, el template no se hereda). Y K2 y K3 comparten la grilla, no el comportamiento.

**OnPush en todos.** K1 se repinta solo cuando cambian sus celdas.

## 6. Adapter

Tres lugares donde algo tiene una forma y otro espera otra:

| Adaptador | De | A |
|---|---|---|
| `ControlValueAccessor` de K3 (admin) | `SeleccionRango` | `{ desde, hasta }` para `ngModel` y formularios reactivos |
| `ControlValueAccessor` de K2 (admin) | celda elegida | `string \| null` |
| K5 fecha memorable | tres campos de texto | `YYYY-MM-DD \| null` |
| Estrategia de cotizaciones (admin) | respuesta de `…/locales/calendario` (fecha, estado, turnos) | `EstrategiaCalendario` |

**Por qué.** Los formularios del admin (tarifas, cupones, campañas) ya trabajan con dos strings. Con el adaptador cambian de `<input type="date">` × 2 a un `<app-calendario-rango [(ngModel)]>` sin tocar su modelo ni el payload al backend. Lo mismo `solicitud-page` con K5: el formulario sigue recibiendo `f.nacimiento` como string.

**Cuidado.** El CVA debe llamar a `onTouched` al cerrar o al completar el rango, no en cada toque, para que la validación y `unsavedChangesGuard` no se disparen a medio elegir.

## 7. Foco itinerante (WAI-ARIA grid)

En la grilla solo un día tiene `tabindex="0"`; los demás `-1`. Tab entra y sale de la grilla de una vez; adentro se usan flechas. Es el patrón de la guía W3C para calendarios.

- `moverFoco` (K0) calcula la fecha destino; K1 la enfoca. Si cae fuera del mes visible, K1 emite `foco` y el contenedor cambia de mes; luego K1 enfoca el día en el siguiente pintado (`afterNextRender`).
- Días no elegibles: `aria-disabled="true"` y no `disabled`. Un `button disabled` no recibe foco y el lector de pantalla nunca dice "sin disponibilidad".
- `aria-label` con fecha larga del diccionario (`fechaLarga` en `core/i18n/fechas`) más la etiqueta de la estrategia.

## 8. Configuración como datos

Los atajos y la leyenda no son ramas de código:

```ts
export interface Atajo { id: string; etiqueta: string; rango: (hoy: string) => { desde: string; hasta: string } }

const ATAJOS_CUPON: Atajo[] = [
  { id: '1s', etiqueta: '1 semana', rango: h => ({ desde: h, hasta: sumarDias(h, 6) }) },
  { id: 'fm', etiqueta: 'Hasta fin de mes', rango: h => ({ desde: h, hasta: finDeMes(h) }) },
];
```

Cada pantalla define su lista y la pasa como input. El atajo marcado se calcula comparando su rango con el valor actual, así que escribir a mano desmarca solo, sin estado extra.

La leyenda se deriva de los `tono` presentes en las celdas del mes visible: si no hay días con pocos cupos, no aparece esa entrada.

## 9. Estado local con signals (sin NgRx)

El mes visible, la selección pendiente, el hover y si el panel está abierto son estado de la UI que muere con el componente. No van al store.

- `model()` para lo que el padre también controla (`mes` en K2, como hoy).
- `signal()` para lo interno (hover, pendiente).
- `computed()` para celdas y leyenda.
- `output()` solo cuando hay una decisión del usuario (eligió, completó, cambió de mes para cargar datos).

Los datos que llenan la estrategia (cierres, ocupación) sí siguen donde están hoy (servicios y `computed` de la ficha).

## 10. Proyección de contenido (K4)

K4 no sabe si adentro hay un día o un rango:

```html
<app-campo-fecha [valor]="textoRango()" etiqueta="Fechas">
  <app-calendario-rango [reglas]="reglas()" [(seleccion)]="sel" />
</app-campo-fecha>
```

K4 solo decide cómo mostrar el panel. Un `signal` lee `matchMedia('(min-width: 768px)')` y elige popover o hoja inferior. La misma pieza proyectada sirve en las dos.

- K4 recibe del hijo cuándo cerrar (rango completo o "Confirmar") por un evento, no leyendo su estado.
- El fondo de la hoja cierra con un método `void`, nunca con una expresión en `(mousedown)` (problema ya visto en modales del admin).
- Sin `@angular/cdk`: no está instalado en ningún repo. El popover se posiciona con CSS (`position: absolute` bajo el campo) y la hoja es `position: fixed`. Si más adelante hace falta reposicionar en bordes, evaluar CDK Overlay.

## 11. Copia con test espejo entre repos

Store y Admin son proyectos separados sin librería común. K0–K3 se copian:

| Opción | Costo | Elegida |
|---|---|---|
| Paquete npm privado | Publicar, versionar y actualizar en dos repos. Pesado para 4 archivos. | No |
| Monorepo | Cambia la estructura de los dos proyectos. Fuera de alcance. | No |
| **Copia con test idéntico** | Si alguien cambia K0 en un repo y no en el otro, el test del otro sigue con los casos viejos y la diferencia se ve al copiar. | **Sí** |

Precedente: los TOURS del asistente ya están duplicados entre backend y frontend. La regla: el archivo `calendario.core.ts` y su `.spec.ts` llevan en la cabecera "Copia idéntica en FrontendStore/FrontendAdmin; cambiar en ambos".

Lo que **no** se copia: K4 y K5 (solo vitrina), K6 (solo admin) y los estilos de marca (cada repo usa sus tokens: `primary` en la vitrina, colores fijos en el admin).

## 12. Descartados

| Opción | Por qué no |
|---|---|
| Librería de calendario (Flatpickr, Litepicker, Angular Material Datepicker…) | Material arrastra `@angular/cdk` y su tema; las otras no siguen signals ni el i18n propio (diccionario, no `Intl`). Ninguna trae la estrategia por día con `sub` y `tono`. Además la regla del proyecto es solo OSS con licencia comercial verificada, y lo que hace falta son ~400 líneas propias. |
| Clase base `CalendarioBase` | Ver §5. |
| `ng-template` para que cada rubro dibuje su celda | Da libertad que rompe la consistencia (tamaños, contraste, accesibilidad). `sub` + `tono` cubre todos los casos del mapa. |
| `if (rubro === 'hotel')` en K3 para "noches" | Prohibido por la regla de capacidades; el texto sale del vocabulario del perfil. |
| Guardar selección en NgRx | Estado efímero de UI (§9). |
| Nombres de días y meses con `Intl.DateTimeFormat` | La vitrina traduce con su diccionario (`core/i18n/fechas`); se reusa. |

## 13. Riesgos

| Riesgo | Mitigación |
|---|---|
| Cambiar `calendario-estadia` rompe hotel, que es el piloto de plantillas | T1.2 mueve las reglas sin cambiarlas y conserva sus tests; K3 entra en T2.6, después de que K0 esté probado. |
| La estrategia se vuelve lenta con dos meses (62 llamadas) | Datos en `Map`; nada de `filter` dentro de la estrategia. |
| Las copias de K0 se desincronizan | Cabecera de aviso y test idéntico (§11). |
| Hoja inferior y teclado virtual en iOS | Los campos de K5 no van en hoja; K4 no tiene inputs de texto. |
