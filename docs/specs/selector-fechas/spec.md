# Spec: selector de fechas

> Estado (2026-10-16): spec, tareas y análisis de patrones escritos. Nada implementado.
> Prototipo y mapa de uso: claude.ai/artifact/MGNhGAvQ1HfgtXVJdYazkd (propuestas 0–4 y sección "Mapa de uso"). Copia en el repo: [docs/disenos/selector-fechas/](../../disenos/selector-fechas/).
> Repos: FrontendStore (vitrina) y FrontendAdmin (panel). BackendNode sin cambios (D1 no aplica).
> Tareas: [tasks.md](tasks.md). Patrones de implementación: [patrones.md](patrones.md).

## Objetivo

Que cada campo de fecha use el patrón que corresponde a lo que la persona está haciendo:

- el **cliente que reserva** ve la disponibilidad antes de tocar un día;
- el **cliente que da un dato** (nacimiento) lo escribe sin recorrer un calendario;
- el **admin que registra** una fecha conocida sigue con el campo nativo;
- el **admin que define un periodo** lo ve dibujado como rango;
- el **admin que filtra** una lista resuelve el caso común con un atajo.

## Situación actual

53 campos de fecha u hora: 17 en la vitrina y 36 en el panel. El detalle por pantalla está en el mapa del prototipo.

| Control hoy | Dónde | Problema |
|---|---|---|
| `app-calendario-mes` | Ficha de tour, ficha de salón | No dice por qué un día está tachado ni cuánto queda. El punto ámbar no tiene leyenda. Sin flechas de teclado. |
| `app-calendario-estadia` | Ficha de habitación | Un solo mes; no hay vista previa del rango ni total de noches. |
| Dos `input type="date"` para un rango | Buscador de hotel, tarifas, disponibilidad, cierres, cupones, campañas, filtros | No se ve el periodo; la salida puede quedar antes de la llegada (solo `min` lo evita). |
| `input type="date"` | Buscadores de tours, eventos y locales | Aspecto distinto en cada teléfono; no sigue la marca de la tienda. |
| `input type="date"` para nacimiento | `solicitud-page` | Abre en el mes actual; hay que retroceder décadas. |
| `input type="time" step="1800"` | Ficha de salón | Deja escribir horas fuera del turno. |

Lo que ya está bien y no se toca: tira de días de canchas (`reservador`), lista de funciones de evento, los 9 campos de hora de configuración y las vistas de agenda (`local-calendario`, widget del dashboard).

## Componentes

Cinco piezas. Cada repo tiene su copia (no hay librería compartida entre repos); el núcleo sin DOM es idéntico en los dos y lo fija el mismo test.

| ID | Pieza | Qué hace | Repos |
|---|---|---|---|
| **K0** | `calendario.core.ts` | Funciones puras: celdas de un mes, rango, teclado, atajos. Sin Angular. | Ambos |
| **K1** | `app-grilla-mes` | Dibuja un mes a partir de celdas ya calculadas. No decide nada. | Ambos |
| **K2** | `app-calendario-mes` (ajuste) | Un día. Usa K1 y la estrategia del rubro. Agrega texto bajo el número, tono y leyenda. | Store; Admin nuevo |
| **K3** | `app-calendario-rango` | Entrada y salida con 1 o 2 meses, vista previa, noches y atajos. Reemplaza a `app-calendario-estadia`. | Ambos |
| **K4** | `app-campo-fecha` | Campo que abre K2 o K3: popover en escritorio, hoja inferior en móvil. | Store |
| **K5** | `app-fecha-memorable` | Día / mes / año en tres campos. | Store |
| **K6** | `app-atajos-rango` | Botones "Hoy · 7 días · Este mes · Personalizado" que llenan un rango. | Admin |

## Requisitos

### R1. Núcleo común (K0)

1. Semana de lunes a domingo. Fechas como texto `YYYY-MM-DD` en UTC. K0 no importa nada (tiene sus propios helpers de fecha) para poder copiarse igual en los dos repos.
2. `semanasMes(mes, estrategia, { hoy, seleccion })` devuelve semanas de 7 con huecos y días `{ fecha, numero, habilitado, tachado, tono, sub, etiqueta, hoy, elegida, rango }`.
3. `tocarRango(fecha, sel, reglas)` reemplaza a `tocarDia` de hotel y conserva sus reglas: mínimo y máximo de noches, noche bloqueada, el día de salida puede caer en una noche bloqueada.
4. `moverFoco(fecha, tecla, limites)` resuelve ← → ↑ ↓, Inicio, Fin, RePág y AvPág (mes anterior y siguiente).
5. Los atajos son datos: `{ id, etiqueta, rango(hoy) }`. La lista vive en quien los usa, no en el componente.
6. El test de K0 es el mismo archivo en los dos repos. Si cambia en uno, se copia al otro.

### R2. Grilla (K1)

1. `role="grid"`, filas `role="row"`, celdas `role="gridcell"` con un `button` dentro.
2. Foco itinerante: un solo día con `tabindex="0"` (el elegido, o hoy, o el primero habilitado); el resto `-1`.
3. Cada día se lee con fecha larga y el motivo: "sábado 24 de octubre, quedan 2 cupos".
4. Hoy lleva una marca propia, distinta de "elegido".
5. Celdas de al menos 40 × 40 px en móvil.
6. Los días deshabilitados se pueden enfocar con flechas pero no elegir (`aria-disabled`, no `disabled`), para que el lector de pantalla diga por qué no.

### R3. Un día (K2)

1. `DiaCalendario` suma dos campos opcionales: `sub` (texto corto bajo el número, máx. 10 caracteres) y `tono: 'pocos' | 'destacado' | null`.
2. La estrategia de cada rubro los llena. El componente no pregunta por el rubro.
3. Leyenda debajo de la grilla, armada solo con los tonos que aparecen en el mes visible.
4. Con los datos que ya hay:
   - salón: `sub` = "1 turno" cuando el estado es `parcial`; tachado con `etiqueta` "ocupado" o "cerrado";
   - tour: `etiqueta` "sin salida" en días cerrados; sin `sub` (D1 no aplica).
5. Ficha de salón: la hora se elige con botones de los horarios válidos del turno, no con `input type="time"`.

### R4. Rango (K3)

1. Arriba, dos campos "Entrada" y "Salida" (en admin: "Desde" y "Hasta"); el que se está eligiendo queda marcado.
2. Dos meses lado a lado desde 640 px; uno en móvil.
3. Después de elegir la entrada, pasar el mouse o mover el foco pinta el rango tentativo.
4. Pie con el total ("3 noches" en hotel; "15 días" en admin), atajos si los hay y "Borrar".
5. Un día que no sirve como salida (bloqueo en medio, más del máximo) empieza una selección nueva, como hoy en hotel.
6. Modo `dia` para hotel por horas, como `calendario-estadia`.
7. El texto del total sale del perfil del rubro (`vocabulario`), no de un `if` por rubro.

### R5. Campo con panel (K4)

1. Muestra la fecha o el rango elegido en un botón con aspecto de campo.
2. Desde 768 px abre un popover anclado; debajo, una hoja inferior al 86 % de la altura con los días de la semana fijos arriba y "Confirmar" fijo abajo.
3. En la hoja, los meses van en scroll vertical (los 3 siguientes, más al llegar al final).
4. Cierra con Escape, con el fondo y con "Confirmar". El foco vuelve al campo.
5. El cierre por fondo usa un método `void`, nunca una expresión en `(mousedown)` (bug conocido de arrastrar para cerrar).

### R6. Fecha memorable (K5)

1. Tres campos numéricos: día (2), mes (2) y año (4), con `inputmode="numeric"` y `autocomplete="bday-day|bday-month|bday-year"`.
2. Valida fecha real y rango de edad. El error dice qué corregir ("El mes va de 1 a 12").
3. Entrega `YYYY-MM-DD` o `null`; el formulario no cambia.

### R7. Atajos en filtros del admin (K6)

1. Botones encima de los dos campos nativos: Hoy, Últimos 7 días, Este mes, Próximos 30 días (según la pantalla).
2. Un atajo llena los dos campos; tocar un campo a mano desmarca el atajo.
3. Pantallas: lista de reservas, libro de reclamaciones y rango de envío de comunicados.

### R8. Admin con K3

Tarifas por temporada, bloqueo de disponibilidad, cierres de la tienda, vigencia de cupones y de campañas usan K3 sin precios.

1. Bloqueo de disponibilidad: los días con reservas se marcan con tono `pocos` y el total dice cuántas reservas caen dentro.
2. Tarifas: los días que ya tienen otra temporada se marcan; elegir encima no se bloquea, se avisa.
3. Cupones y campañas: atajos "1 semana", "2 semanas", "Hasta fin de mes".
4. K3 en admin se integra con `ngModel` y formularios reactivos (`ControlValueAccessor`) y con `unsavedChangesGuard`.

### R9. Cotizaciones (admin)

La fecha de una cotización se elige con K2 alimentado por el calendario admin de locales (`GET …/locales/calendario` en `reservas.admin.routes.js`, el mismo que usa `local-calendario`). Días ocupados tachados, parciales con `sub`.

## Fuera de alcance

- Los 9 campos `type="time"` de configuración, los `datetime-local` de comunicados, secciones y funciones de evento, el vencimiento de cuota y la entrega de carta: quedan nativos. Como mucho llevan un botón "Hoy" (tarea opcional).
- La tira de canchas y la lista de funciones de evento.
- Buscadores de tours, eventos y locales y grilla de salones: siguen con `input type="date"` (D2). K4 se usa solo en el buscador de hotel.
- Selección de varios días sueltos.
- Calendarios de terceros: no se agrega librería (ver [patrones.md §6](patrones.md)).

## Decisiones

| ID | Pregunta | Propuesta |
|---|---|---|
| **D1** | ¿Precio o cupos por día en tours y hotel? Hoy el backend no los envía en el calendario público. | ❌ No aplica (2026-10-16): no se muestra precio ni cupos por día y no se crea endpoint (fase 5 descartada). `sub` y `tono` quedan en K2 para lo que ya trae su calendario (turnos libres del salón). |
| **D2** | ¿K4 en todos los buscadores o solo en hotel? | ✅ Solo hotel (2026-10-16). Los buscadores de tours, eventos y locales, la grilla de salones y la tira de canchas no cambian. |
| **D3** | ¿Copiar K0–K3 entre repos o crear un paquete? | Copiar, con el mismo test (ver [patrones.md §5](patrones.md)). |
| **D5** | ¿Agregar `@angular/cdk`? | ✅ Aprobado (2026-10-16), instalado ~22.1 en la tienda: sí, al empezar la fase 3 y solo `overlay` (posición del popover) y `a11y` (`FocusTrap`, foco de vuelta al campo) para K4. K0–K3 no lo necesitan: `FocusKeyManager` es de una dimensión y la grilla se mueve en dos. |
| **D4** | ¿El modo de K2 en admin necesita estrategia o basta con estados? | Misma estrategia que la vitrina; la de cotizaciones se arma con la respuesta del calendario admin. |

## Cuándo está terminado

- Las pantallas de prioridad alta del mapa usan su patrón: buscador y ficha de hotel, ficha de tour, ficha de salón, fecha de nacimiento, cotizaciones, tarifas y bloqueo de disponibilidad.
- Probado a 390 px y 1440 px, en tema claro y con teclado solo (sin mouse) en la ficha de habitación y en tarifas.
- Lector de pantalla (NVDA o VoiceOver) lee fecha y motivo en K1.
- `npm run build` y `npm test` pasan en los dos repos, incluido el test espejo de K0.
- `perfiles.spec.ts` sin cambios, o con cambios intencionales si se agregó vocabulario.
