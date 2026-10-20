# QA: Campañas, "el cuándo"

> Spec: [spec.md](spec.md) · Pieza probada: **1b (horas frontera exactas)** · Fecha: 2026-10-19 · Resultado: ✅ aprobada (con 2 observaciones menores, ver "Fallos")

## Pruebas automáticas
| Repo | Comando | Resultado |
|---|---|---|
| Backend | `npm test` | ✅ 1613 (corrido por el desarrollador; no repetido) |
| Tienda | `npm test` (con anti-identidad) | ✅ 282 (idem) |
| Admin | — | no tocado por la pieza |

## Cómo se probó
Backend local (`npm start`, puerto 3000, BD de desarrollo) y tienda local (4200) con Playwright/Chromium sobre `killa-hostal.localhost:4200` (hospedaje) y `zapatillas.localhost:4200` (productos). Para cada caso se creó en la BD una campaña propia ("QA frontera", topBar `QA CAMPANA FRONTERA`, oferta `QA oferta`, efecto etiquetas) que termina o empieza ~3 min después, con la pestaña abierta y sin tocarla. Escritorio 1280 y celular 390. Las pruebas escribieron la clave `campanas` de las dos tiendas; **ambas quedaron restauradas a su valor original** (zapatillas: Halloween + verano; killa-hostal: sin campañas) y el backend local que levanté quedó detenido.

## Matriz criterio × rubro
| CA / R | productos (zapatillas) | hotel (killa-hostal) | Evidencia |
|---|---|---|---|
| R3.9.1 / CA-3.13 caché vence en el próximo cambio | ✅ `max-age=300` sin swr con el cambio a 6 min (faltan < 450 s); `max-age=183` a 3 min | ✅ `max-age=184`, `220`, `212` y **`48`** a 48 s de la frontera (≤ 120), sin `stale-while-revalidate`; lejos de la frontera (zapatillas, Halloween el 1-nov) sigue `max-age=300, swr=150` | cabeceras en los logs de Playwright y `curl -i` |
| R3.9.2 / CA-3.14 fin con pestaña abierta | ✅ +1,6 s (escritorio) y +5 s (celular) de la frontera: campaña fuera, colores al diseño normal, sin recargar | ✅ +3 s / +5 s; "Terminando…" visible entre la frontera y la respuesta (≈3 s) | `A-killa`, `C-desk`, `C-off`, `E-killa` |
| R3.9.2 inicio con pestaña abierta | ✅ aparece a +8 s con fundido | ✅ escritorio +3 s, celular +8,6 s | `B-desk`, `B-mob`, `D-zap` |
| Fundido de 300 ms (R7.4) | ✅ clase `fundido-tema` una pasada y se retira | ✅ idem (escritorio y celular) | MutationObserver en los logs |
| Sin salto de scroll (R7.4) | ✅ scroll compensado (300 → 276 al encoger la página 272 px) | ✅ 500 → 356 al quitar un bloque de 144 px; 400 → 584 al sumarse 184 px (escritorio) y 400 → 736 (celular, +336 px): lo que se lee no se movió | "scroll tras frontera" en los logs |
| Scroll al inicio al navegar tras el cambio (CA-3.14, último párrafo) | no probado en productos (un comunicado modal tapaba el clic; ver abajo) | ✅ escritorio y celular: tras el cambio, scroll 600, clic en "Habitaciones" → `/habitaciones` con `scrollY = 0` | `B-desk.log`, `B-mob.log` |
| R7.6 efecto no se reproduce en cambio en caliente | ✅ tras el inicio en caliente no caen etiquetas; una carga nueva justo después sí las muestra | — (no se repitió) | `D-zap-3-despues.png` vs `D-zap-5-fresca.png` |
| R3.9.3 / CA-3.15 reloj del servidor (navegador +10 min) | ✅ con `Date` del navegador 10 min adelantado, la campaña seguía visible a 5 min 50 s del fin (cuenta 00 d : 00 h : 5 min) y cambió a la hora del servidor (+5 s), no antes | — | `C-off.log`, `C-off-1-antes.png` |
| R3.9.5 / CA-3.12 tema guardado vence en el fin exacto | ✅ (mismo mecanismo) | ✅ pestaña nueva en el mismo navegador, con la respuesta **vieja** (con campaña) forzada tras el fin: la campaña se descarta al cargar y los colores son los normales | `E-killa.log` línea FRESCA |
| CA-3.16 borde exacto del fin | cubierto por tests de unidad (no repetido en navegador) | idem | — |
| `/store/hora` sin caché | ✅ `Cache-Control: no-store` en todas las respuestas | ✅ | cabeceras |
| Vista previa del editor sin temporizador (R3.9.2) | — | ✅ dentro de un iframe con `?vista-previa=1`: sin `/store/hora`, sin nueva petición de la tienda a la frontera, sin fundido. Nota: fuera de un iframe el parámetro se ignora (por diseño) y el reloj corre normal | `B-vp.log` |

Evidencia (logs y capturas) en el directorio temporal de la sesión: `...\scratchpad\{A-killa,B-desk,B-mob,B-vp,C-desk,C-off,D-zap,E-killa}*.log|png`.

## Regresión
- **Campañas sin hora**: `zapatillas` con su Halloween (sin horas, `proximoCambio = 2026-11-01T00:00-05:00`, caché normal `max-age=300, swr=150`) se sirve igual que antes; las tiendas con `proximoCambio: null` (killa-hostal, mirador-miraflores, los-cedros) mantienen la caché normal.
- **Otros rubros**: `demobooking` (hotel, `proximoCambio` 15-nov), `los-cedros` (canchas) y `mirador-miraflores` responden `/store/tiendas` bien; no se abrieron en navegador.
- Sin errores de consola en ninguna corrida.

## Fallos encontrados
| # | Severidad | Pasos | Esperado | Obtenido |
|---|---|---|---|---|
| 1 | Menor (observación) | Celular, killa-hostal, campaña que empieza en caliente con scroll 400 | El scroll se mueve una sola vez | El log de scroll muestra dos eventos en el mismo instante (400 → 424 → 736). El valor final es el correcto; es la compensación en pasadas combinada con el ancla del navegador. Sin salto visible en capturas; revisar a ojo en Safari |
| 2 | Informativa | Escritorio, killa-hostal | — | En el primer cuadro tras el cambio el contenido ya cambió de alto y el scroll se corrige en el cuadro siguiente (500 → 356 en ~1 s). No visible en captura; sin acción |

Ninguno bloquea la pieza.

## Lo que NO se pudo probar y por qué
- **Black Friday / Cyber Monday reales (CA-3.13 y CA-3.14 con fechas de noviembre)**: Cyber Monday llega con la pieza 2; se probó el mismo mecanismo con campañas propias.
- **Clic para navegar tras el cambio en productos**: en zapatillas un comunicado modal ("Horario especial por Navidad") tapa la página; el caso se probó completo en hospedaje, que comparte el mismo layout.
- **Safari** (pendiente según el desarrollador): no hay Safari en este equipo; solo Chromium.
- **Cabeceras en el borde de Railway** (`Age`, `max-age` real tras el proxy): solo local; queda para el deployer.
- **Tours, eventos, locales y canchas en navegador**: no se abrieron.
- **CA-3.16 en navegador y la cuenta exacta "5 min" a las 21:55**: se observó 5 min 50 s a 6 min del fin (consistente); el borde exacto lo cubren los tests de unidad.

## Para Diego
**Veredicto: aprobada.** La pieza 1b hace lo que dice en hospedaje y productos, escritorio y celular.

- Probado: campaña que termina y que empieza con la pestaña abierta (cambia sola en 2-9 s, con fundido, sin mover lo que lees, y al navegar después el scroll vuelve arriba); cabeceras de `/store/tiendas` (`max-age` 48-220 s cerca de la frontera, sin `stale-while-revalidate`; 300 s lejos) y `/store/hora` sin caché; reloj del navegador 10 min adelantado no adelanta la campaña; el efecto festivo no se reproduce en el cambio en caliente; en la vista previa del editor (iframe) no corre el temporizador; las campañas sin hora siguen igual.
- Fallos: ninguno bloqueante; 2 observaciones menores arriba.
- Las tiendas de prueba quedaron como estaban.

Lo que tienes que ver con tus ojos (máx. 3):
1. **Safari/iPhone**: en una tienda con una campaña propia que empieza o termina en 3 min (Admin › Campañas), baja un poco y espera sin tocar: debe cambiar sola, con fundido, sin saltar.
2. **Editor de Diseño** (Admin › Diseño): con la vista previa abierta deja pasar la hora de fin de una campaña; la vista no debe recargarse sola.
3. **Producción/Railway** tras desplegar: `curl -I "https://<api>/api/v1/store/tiendas?slug=<slug>"` cerca de una frontera: `max-age` bajo y sin `stale-while-revalidate`; `/store/hora` debe devolver `no-store`.
