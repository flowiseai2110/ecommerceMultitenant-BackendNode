# Cambios: Campañas, "el cuándo"

> Bitácora para humanos. Una entrada por pieza, la más reciente arriba.

## 2026-10-20 — Validaciones de sentido común (R8)

Hecho en la sesión principal, sin agentes.

| Repo | Archivo | Qué cambió |
|---|---|---|
| Backend | `modules/campanas/sentido.js` (nuevo) | `errorDeSentido()`, pura: R8.1–R8.5 sobre las campañas tocadas (comparadas con lo guardado). |
| Backend | `modules/campanas/campanas.validacion.js` | `validarCampanasDeTienda()` lee lo guardado y las ediciones y aplica R8; siempre que vienen campañas, no solo con uso. |
| Backend | `__tests__/sentido.test.js` (nuevo) | 10 casos: año equivocado, más de un año, uso antes/pasado, cruce con Black Friday en los dos sentidos, Black Friday + Cyber Monday permitido, "Mis fechas", sin error. |
| Admin | `pages/diseno/campana-edicion.ts` (+ spec) | `avisosCampana()` (R8.7 promesa de descuento, R8.8 contraste) y `contrasteConBlanco()`. |
| Admin | `pages/diseno/campana-panel.component.ts` | Muestra los avisos (ámbar) arriba de la parte abierta. |

El Admin no repite R8.1–R8.5: el backend responde 400 con el mensaje y el Admin lo muestra en el toast; el interruptor vuelve atrás si se rechaza la activación. Tests: Backend completo verde; Admin 209/209 con anti-identidad y `ng build` ok. Sin SQL ni llaves.

## 2026-10-20 — "Mis fechas" sobre una campaña del catálogo (R2.9)

Al probar, Diego vio que cada tienda quiere su Cyber Wow (u otra) en fechas distintas y no debe pedírselas a la plataforma. Ahora toda campaña del catálogo tiene "Fechas oficiales" (por defecto, como antes) o "Mis fechas" (inicio y fin de la tienda, con hora y hasta 90 días), conservando el aspecto del preset. Hecho en la sesión principal, sin agentes.

| Repo | Archivo | Qué cambió |
|---|---|---|
| Backend | `modules/campanas/resolver.js` | `efectiva()`: un preset con `inicio` y `fin` se resuelve como una propia (sin regla ni ediciones) y conserva la prioridad. `calendarioAnual()` agrega `misFechas` a la fila. |
| Backend | `modules/campanas/campanas.schema.js` | Un preset acepta `inicio`+`fin` juntos (antes se rechazaba), sin días antes/después; las reglas de fechas de la propia pasan a `validarFechas()`, compartida. El 00:00 de fin solo se rechaza con fechas oficiales. |
| Backend | `__tests__/campanas.schema.test.js`, `__tests__/ediciones.test.js` | El test "un preset no lleva fechas fijas" se reemplazó a propósito; casos de las tiendas A–D (fechas propias, hora, año siguiente, calendario, próximo cambio). |
| Admin | `pages/campanas/campanas.component.{ts,html}` | Selector "Fechas oficiales / Mis fechas" con `app-campo-periodo`; con "Mis fechas", horas como una propia, se ocultan días antes/después y las ediciones; la fila del calendario usa las fechas de la tienda. |
| Admin | `pages/diseno/campana-edicion.ts` (+ spec) | `errorCuando()` valida "Mis fechas" con las reglas de una propia. |
| Admin | `models/campana.model.ts` | Comentario de `inicio`/`fin`. |

Tests: Backend 1662/1662; Admin `npm test` 206/206 con anti-identidad y `ng build` ok. Tienda sin cambios (recibe la campaña ya resuelta). Sin SQL ni llaves.

## 2026-10-20 — Piezas 3a y 3b: ventana de uso
**En una frase:** en las tiendas de reservas (hotel, tours, eventos, locales, canchas) el dueño puede agregar a una campaña "fechas de uso" (hasta cuándo se usa lo reservado) en la pantalla Campañas; el cliente ve una línea en la portada ("Reserva hasta el 30 nov · para alojarte hasta el 28 feb"), un rombo con leyenda en los selectores de fecha y, en el hotel, "Tu estadía entra en {campaña}" si todas las noches entran. No cambia precios, cupos ni reglas; nada dice "oferta" ni "descuento". Una tienda de productos no ve nada de esto y el servidor lo rechaza.

**Dónde:**
| Repo | Archivo | Qué hace |
|---|---|---|
| Backend | `modules/campanas/campanas.schema.js` | `uso` en la campaña: propia `{ desde?, hasta }` (hasta obligatorio, <= fin + 365 días, desde <= hasta); del catálogo `{ hastaDiasDespues 0-365, desdeDiasDespuesInicio 0-365 \| null }`. Mezclar fechas y días se rechaza. |
| Backend | `modules/campanas/uso.js` (nuevo) | Puro: `usoResuelto` (propia = sus fechas; catálogo = último día de la ventana + N días, y primer día + M), `errorDeUso` (capacidad `recibeReservas` vía `datosDe`). |
| Backend | `modules/campanas/campanas.validacion.js` (nuevo), `tiendas.admin.routes.js` | `validarCampanasDeTienda` en el `PUT /:id/diseno`: 400 "Esta tienda no usa fechas de uso" sin `recibeReservas`. |
| Backend | `modules/campanas/resolver.js`, `campanas.service.js` | `efectiva` pasa `uso`; la campaña vigente y las filas del calendario traen `uso: { desde, hasta }` en "YYYY-MM-DD" solo si el rubro recibe reservas y hay ventana. |
| Backend | `modules/idiomas/plataforma/en.json`, `claves/claves-tienda.json` | Inglés de las frases (generado con `npm run claves` en la tienda). |
| Admin | `negocio/perfil-negocio.ts`, `negocio/{hotel,tours,eventos,locales,canchas}/perfil.ts`, `perfiles.spec.ts` | `reservas.campanas { campo, reservaHasta, usoHasta, usoRango }` ("Estadías", "Salidas", "Funciones", "Eventos", "Partidos"). |
| Admin | `negocio/frase-uso.ts` (+ spec) | La frase de la portada; copia en la tienda, mismos casos. |
| Admin | `pages/campanas/campanas.component.{ts,html}`, `pages/diseno/campana-edicion.ts` | Recuadro "Fechas de uso" (solo con `tieneReservas()`), "+ Agregar" / "Quitar", fechas en la propia, días en el catálogo con "Este año: hasta el …", "Así lo verá tu cliente…", nota fija, errores iguales al backend (`errorUso`, `topeUso`), Guardar deshabilitado con error. Orden Cuándo, Uso, Efecto. |
| Admin / Tienda | `calendario.core.ts` (+ spec) | Copia idéntica: `DiaCalendario.campana?` y `OpcionesMes.marca?`, aplicada al final de `semanasMes` solo sobre días elegibles y no tachados (D-2). |
| Tienda | `negocio/perfil-negocio.ts`, `negocio/*/vitrina.ts`, `perfiles.spec.ts`, `negocio/frase-uso.ts` (+ spec) | `reserva.campana { reservaHasta, usoHasta, usoRango, leyenda, entra }`; `entra` solo hotel (los demás null). |
| Tienda | `core/theme/uso-campana.ts` (+ spec), `fin-campana.ts`, `core/i18n/fechas.ts` | `enUso`, `marcaDeUso`, `estadiaEntra` (todas las noches), `MarcaCampana`; `finParaLinea`; `diaMesCorto`. |
| Tienda | `state/diseno.state.ts` (+ spec), `models/diseno.model.ts` | `usoCampana()`, `lineaUso()`, `marcaCalendario()`; la sección de la campaña lleva `conUso` y, sin cuenta regresiva, una banda `campana-uso` bajo el hero. |
| Tienda | `features/home/sections/offer-section.component.ts` | La línea con ◆ dentro del bloque; el pie "Termina el…" se omite cuando hay línea (el fin se escribe una vez); banda delgada de respaldo. |
| Tienda | `reservas/compartido/{grilla-mes,calendario-mes,calendario-rango}.component.ts` | Rombo arriba a la izquierda, leyenda solo si el mes visible tiene marcas, etiqueta de lectura "fechas de {campaña}", aviso "Tu estadía entra en…" (aria-live). |
| Tienda | `reservas/{hotel/buscador-hotel,hotel/habitacion-page,tours/tour-page,locales/salon-page,canchas/reservador,eventos/evento-page,eventos/eventos-grid}` | Pasan `marca`; canchas pinta el rombo en la tira de días con leyenda; eventos pone la etiqueta "Fechas de {campaña}" en funciones disponibles dentro del uso. |

**Decisiones que tomé y por qué:**
- `uso` viaja resuelto solo si hay ventana (la clave no existe si no); un backend anterior no lo manda y la tienda queda como hoy.
- El aviso "Tu estadía entra en…" vive en `calendario-rango` (pregunta si el perfil trae `entra`), no en cada página de hotel: así el buscador y la ficha lo tienen sin repetir.
- Eventos: etiqueta también en la tarjeta de la cartelera no se hizo; solo en las filas de agenda y en las funciones de la ficha (lo que pide el diseño).
- Inglés: el test del backend exige inglés de TODAS las claves, así que tours, eventos, locales y canchas también tienen inglés de sus frases (la spec decía "solo español"). Solo se ve si la tienda activa inglés.
- La hora del fin en la línea va en 24 h ("3 dic, 22:00"), no "10:00 pm" como el prototipo en inglés.
- En el Admin las fechas de uso de la propia usan `input type=date` nativo (no `app-campo-periodo`): son dos fechas sueltas con tope, no un periodo.
- La banda de solo línea no reemplaza la sección de oferta que traiga la estructura (a diferencia de la cuenta regresiva de la campaña).
- Cambios intencionales en `perfiles.spec.ts` (Admin y Tienda): se agregaron los textos de campañas por rubro; no se cambió nada existente. `uis.spec.ts` no cambió.

**Lo que quedó pendiente / deuda:**
- Todo se probará en el navegador al final del requerimiento (lista en el cierre de esta pieza).
- La vista previa de Diseño (iframe) no incluye la línea de uso (`campanaParaVista` no la arma); se ve en la tienda real.
- La cartelera en variante tarjeta/carrusel no lleva la etiqueta de uso.

**Afecta al despliegue:** nada (sin SQL ni llaves). Orden: backend, Admin, tienda. Con backend nuevo y tienda anterior solo falta lo visual; con tienda nueva y backend anterior no hay `uso` y todo queda como hoy.

**Commits:** sin commit (Diego decide).

## 2026-10-20 — Pieza 2: fechas por año (Cyber Wow) y Cyber Monday
**En una frase:** la plataforma puede cargar cada año las ediciones del Cyber Wow (abril, julio, noviembre) en una pantalla propia, sin publicar una versión nueva; las tiendas que lo tenían activado lo muestran solas en cada edición, y el Cyber Monday (lunes tras el Black Friday) se calcula sin carga. El dueño ve las ediciones en solo lectura y, si un año no tiene fechas, "Fechas de {año} por anunciar".

**Dónde:**
| Repo | Archivo | Qué hace |
|---|---|---|
| Backend | `docs/sql/campanas_ediciones.sql` (+ `_reversa`) | Tablas `campana_ediciones` y `campana_ediciones_historial`, con RLS. **No se corrió en ninguna BD.** |
| Backend | `prisma/schema.prisma` | Los dos modelos nuevos; `transmision_avisos_plataforma` pasa a `avisos_plataforma` con `@@map` (sin SQL). |
| Backend | `modules/campanas/presets.js` | Cyber Monday (`nEsimoDia`, jueves 4.º + 4, prioridad 2, un día) y Cyber Wow (`porAnio`, `edicionesEsperadas`, 3 días antes, prioridad 2, efecto `etiquetas`). |
| Backend | `modules/campanas/calendario.js` | `ventanas(campana, anio, ediciones)`: una ventana por edición cargada (hora de la tienda, si no la de la plataforma, si no día completo); sin ediciones no hay ventana. `vigente`, `proximaVentana` y `proximoCambio` reciben las ediciones. La ventana del efecto usa el rango de días de la edición (`claveFin`). |
| Backend | `modules/campanas/resolver.js` | `resolverCampana`, `disenoPublico`, `proximoCambioDe` y `calendarioAnual` reciben las ediciones; cada fila "por año" trae `ventanas[]`, `ediciones[]` y `porAnunciar[]` (sin fechas: `inicio/fin` null). |
| Backend | `modules/campanas/ediciones.{repository,service,schema,admin.routes}.js` | Leer (caché 60 s), crear/cambiar/borrar con historial en la misma transacción, validaciones (fin posterior, ≤ 30 días, empieza en su año, sin cruces, clave esperada, fuente https), conteo de tiendas (solo el número). Rutas `/admin/campanas/ediciones` solo para `requirePlatformAdmin`. Al escribir: `invalidateTiendasStoreCache()`. |
| Backend | `modules/campanas/ediciones.faltantes.js`, `jobs/campanas.job.js`, `server.js` | Cada 6 h: bitácora (una vez por proceso) por edición esperada sin cargar del año en curso y el siguiente; correo a 60 días del día 1 del mes esperado (idempotente). |
| Backend | `modules/plataforma/avisos.js`, `transmisiones.plataforma.js`, `services/email.service.js` | `avisarPlataforma` se mueve a un módulo común (transmisiones lo reexporta); `sendAlertaPlataformaEmail` con el nombre viejo como alias. |
| Backend | `tiendas.store.routes.js`, `campanas.service.js`, `campanas.schema.js` | Las ediciones llegan a la respuesta pública, al calendario y a la vista previa; el schema no prueba "ventana vacía" en una campaña "por año". |
| Admin | `pages/campanas/campanas.component.{ts,html}`, `models/campana.model.ts` | Una barra por edición (pasadas atenuadas, por anunciar punteadas), "Próxima: noviembre · 2 – 5 nov" y "3 ediciones en 2026", panel de solo lectura con la nota y el enlace a plataforma solo si `esAdminPlataforma()`, "Según la plataforma" en las horas. |
| Admin | `pages/campanas-plataforma/*`, `services/campanas-plataforma.service.ts`, `app.routes.ts` | Pantalla `/campanas-plataforma` (sin menú; enlace desde Campañas y Parámetros): año, fila por edición con formulario en su sitio, historial, "Fuente", banner de faltantes (ámbar a 60 días), diálogo con el número de tiendas solo al cambiar una cargada. Sin permiso: aviso. |
| Admin | `pages/diseno/campana-edicion.ts`, `diseno.component.ts` | Aceptan una fila sin fechas (`inicio` null) y no prueban "vacía" en "por año". |
| Tienda | `models/diseno.model.ts`, `core/theme/campanas.ts`, `state/diseno.state.ts` | `ReglaFecha` con `porAnio`: el simulador devuelve null para esa regla y se copia Cyber Monday (D-3). |

**Decisiones que tomé y por qué:**
- Las ediciones llevan campo `fuente`, `nombre` (por defecto el de la esperada) y se exige que **empiecen en su año**: así la clave (preset, año, clave) y los años que mira la resolución no se contradicen. No estaba en la spec; se puede quitar.
- Una campaña "por año" no valida "ventana vacía" al guardar (el impacto lo pedía solo si 0 días antes/después y hora de fin <= inicio, pero con una edición de varios días eso es un caso válido). El resolver ya descarta cualquier ventana vacía.
- La fila "por año" del calendario trae `inicio/fechaClave/fin` de la primera edición del año (no "la vigente o próxima"); el Admin nuevo usa `ventanas[]`/`ediciones[]` y calcula la vigente con su reloj. Sin ediciones esos tres campos van null (el Admin anterior no dibuja la barra).
- La caché de ediciones guarda todas las filas (tabla de pocas filas) y filtra por año al calcular; si la tabla falla, la tienda se resuelve sin Cyber Wow y queda `warn` en la bitácora.
- El conteo de tiendas es una ruta aparte (`GET .../:presetId/tiendas`) que la pantalla pide justo antes del diálogo; si falla, el diálogo omite el número.
- La bitácora de faltantes se acuerda por proceso (no hay tabla): tras un reinicio vuelve a escribir la línea; el correo sigue siendo una sola vez.
- Cambio intencional de un test: `calendario.test.js` "a mayor prioridad gana..." — el 30 nov ahora gana `cyber-monday` (antes `black-friday`); el 29 sigue siendo Black Friday (CA-2.10).
- Ni `perfiles.spec.ts` ni `uis.spec.ts` cambiaron.

**Lo que quedó pendiente / deuda:**
- Probar en el navegador (al final del requerimiento, por pedido de Diego): cargar una edición, ver la tienda y el calendario del dueño, el diálogo con el número, el 403 de un usuario normal.
- No hay botón para borrar una edición en la pantalla (el diseño no lo pide); la ruta `DELETE` existe y deja historial.
- Las rutas de ediciones no tienen test de integración HTTP (el repo no usa supertest): se probó el servicio, las reglas y que el router pasa primero por `requirePlatformAdmin`.
- `perfiles` del Admin/tienda: el preset de Cyber Wow no tiene `oferta`/textos revisados por un humano; son genéricos como los demás.

**Afecta al despliegue:**
- **SQL:** correr `docs/sql/campanas_ediciones.sql` en Supabase **antes** del backend; después `npx prisma generate`. Reversa: `campanas_ediciones_reversa.sql` (guardar antes las ediciones cargadas).
- **Llaves:** ninguna nueva. `PLATFORM_ADMIN_EMAILS` (ya existe) la usa también el aviso de fechas faltantes.
- **Orden:** SQL → backend → Admin → tienda (la tienda solo cambia el simulador, apagado). Con el SQL sin correr, el backend no se cae: resuelve sin Cyber Wow y deja un `warn`.

**Commits:** sin commit (Diego decide).

## 2026-10-19 — Pieza 1b: horas frontera exactas
**En una frase:** con la tienda abierta, la campaña empieza o termina sola a su hora exacta (en menos de ~15 s), con un fundido de colores y sin mover lo que el cliente está leyendo; la hora la manda el servidor, así que un computador mal puesto no adelanta ni atrasa una campaña.

**Dónde:**
| Repo | Archivo | Qué hace |
|---|---|---|
| Backend | `modules/campanas/calendario.js` | `proximoCambio(campanas, ahora)`: el menor inicio o fin posterior a ahora entre las ventanas y las del efecto (solo si la campaña tiene efecto o saludo). |
| Backend | `modules/campanas/resolver.js` | `proximoCambioDe(campanasTienda, ahora)` sobre las campañas aplicables. |
| Backend | `utils/cache.js` | `cache(segundos, { hasta })`: al responder, `max-age = min(segundos, faltan)` y `stale-while-revalidate` solo si faltan >= 1,5 x segundos (también cuando el cuerpo sale de la caché en memoria). |
| Backend | `modules/tenants/tiendas.store.routes.js`, `tiendas.cache.js` | `data[0].proximoCambio` (ISO de Lima o null); la caché en memoria vive `min(60 s, proximoCambio - ahora)`. |
| Backend | `routes/store/index.js` | `/tiendas` con `cache(300, { hasta })`; `GET /store/hora` -> `{ ahora }`, `no-store`, sin BD (D-1). |
| Tienda | `core/services/reloj-tienda.service.ts` (+ `reloj-tienda.ts`) | Desfase con `/store/hora`; un temporizador fuera de la zona a `proximoCambio + 0-10 s` (recortado a 24 h); re-corrige la hora antes de pedir; pide la tienda, la pone en `StoreState` y en la caché de TanStack; reintentos con espera creciente (5 s a 5 min). |
| Tienda | `core/theme/cambio-en-caliente.ts`, `styles.css` | Fundido de 300 ms (`:root.fundido-tema`; sin animación con `prefers-reduced-motion`) y compensación del scroll anclada a lo que está a mitad de pantalla. |
| Tienda | `state/diseno.state.ts`, `core/theme/campanas.ts` | `desdeApi(c, ahora, gracia)`: la campaña usa la hora del servidor; una campaña vista vigente en la pestaña se retiene 15 s tras su fin (al cargar la página, descarte inmediato). Se quitó el comentario "nunca con un timer". |
| Tienda | `store-layout.component.ts`, `efecto-festivo.component.ts`, `offer-section.component.ts`, `models/tienda.model.ts` | El layout arranca el reloj; el efecto festivo no se reproduce en un cambio en caliente (R7.6); la cuenta regresiva usa la hora del servidor y su "Terminando…" ahora dura hasta que llega la respuesta nueva (tope 15 s); `proximoCambio?` opcional. |

**Decisiones que tomé y por qué:**
- `proximoCambio` solo suma las fronteras del efecto si la campaña tiene efecto o saludo: si no, serían recargas que no cambian nada.
- El "Terminando…" de la 1a no se reemplazó por otro texto: sigue siendo el estado mientras llega la respuesta; lo nuevo es que la campaña (y su cuenta) se mantiene hasta que llega el cambio real y no desaparece sola a los 15 s de la sección. Solo una oferta puesta a mano en la estructura (que nadie vuelve a pedir) sigue desapareciendo a los 15 s.
- La retención solo aplica a una campaña que se vio vigente en esa pestaña (`RelojTiendaService.retieneFin`); un fin pasado al cargar se descarta de inmediato.
- Si la frontera ya pasó y la respuesta sigue igual (caché del borde), el reloj no entra en bucle: reintenta con la misma espera creciente.
- La compensación del scroll se repite 3 veces (2 cuadros, 120 ms, 400 ms) midiendo siempre contra la misma referencia, así no suma ajustes.
- No hubo ningún cambio en `perfiles.spec.ts` ni `uis.spec.ts`.

**Lo que quedó pendiente / deuda:**
- Probarlo en el navegador (ver "Verificar" de la pieza 1b en `tasks.md`), en especial scroll del router tras el cambio (CA-3.14) y Safari.
- El borde de Railway: verificar cabeceras `max-age`/`Age` en producción (deployer).
- La vista vieja `onRegainFocus` (volver a la pestaña) sigue sin escribir en la caché de TanStack; no se tocó.
- `/store/hora` queda bajo el limitador global de la API; con muchas pestañas a la hora frontera cada una la pide una vez más antes de refrescar.

**Afecta al despliegue:** nada (sin SQL ni llaves). Orden: backend, tienda (Admin no cambia). Con backend nuevo y tienda anterior solo falta el cambio en caliente; con tienda nueva y backend anterior `/store/hora` da 404 y el reloj sigue con la hora local.

**Commits:** sin commit (Diego decide).

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
