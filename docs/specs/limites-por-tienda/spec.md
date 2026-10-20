# Spec: límites de uso por tienda (que una tienda no afecte a las demás)

> Estado: borrador · Fecha: 2026-10-19 · Rubros: productos, hotel, tours, eventos, locales, canchas (transversal; focos: asesor de ventas IA y transmisiones en vivo, eventos)
> Repos: Backend (control de admisión) · Admin (ver consumo y cortes) · Tienda (mensajes al visitante)
> Base: tesis de Krebs (KIT, 2015) sobre aislamiento de rendimiento entre inquilinos y el modelo "pool" del AWS SaaS Lens. Ya conversado con Diego: **no se pasa a microservicios**; la solución es controlar la admisión por tienda.

## Por qué

Todas las tiendas comparten la misma base de datos, la misma instancia del servidor y la misma cuenta de IA. Hoy los topes de uso son **por visitante (IP)**, no **por tienda**. Si una tienda recibe un pico, un ataque o abusa (por ejemplo, un enlace de chat compartido en redes), puede:

- agotar la cuenta de IA que usan todas y dejar **sin asesor a todas las tiendas**;
- ocupar las conexiones a la base de datos o el servidor y **hacer lenta a toda la plataforma**.

El objetivo es que cada tienda tenga su propio "carril": si se pasa, se corta **solo esa tienda**, con un mensaje claro, y las demás no lo notan.

## Qué ya existe (línea base, no se rehace)

Revisado en el código el 2026-10-19. Esta spec **extiende** esto, no lo duplica.

| Pieza | Qué hace hoy | Qué le falta frente a este requerimiento |
|---|---|---|
| Límite global por IP (`server.js`, `config.rateLimit`) | 1000 lecturas / 100 escrituras por IP cada 15 min | No mira la tienda |
| Límites por módulo (`config/index.js`): reseñas, libro, reservas, rastreo, checkout | Por IP | No mira la tienda |
| Asesor IA del storefront (`modules/agente`) | Por IP (30/min) y por tienda+sesión (10/min) | Ningún tope **por tienda** |
| Asistente "Guía" del admin (`modules/asistente`) | Por usuario (30 cada 15 min) | Un usuario por tienda: varias personas de una tienda suman sin tope de tienda |
| `modules/consumo-ia` + tabla `tienda_uso_recursos` | Cuota **mensual por tienda** de consultas (asesor, Guía, traducciones), tope **diario** solo para la Guía, el dueño puede bajarla (no subirla), reserva atómica, devuelve la consulta si el LLM falla, aviso por correo al llegar a un %, y 402 al agotarse. La tienda ve el chat "no disponible por ahora" sin cifras. El dueño la ve en la página Consumo IA del Admin | Sin tope diario para el asesor (una tienda puede gastar el mes en un día); topes "sin plan" fijos en config salvo traducciones; no hay tope de llamadas **a la vez** |
| `parametros_plataforma` (`modules/parametros`) | Valores que el administrador de la plataforma cambia sin deploy (caché 30 s) | Solo 3 parámetros; ninguno es un límite de uso |
| Planes (`planes.limite_*`) | Topes por plan de consultas, imágenes IA y horas de transmisión | No hay topes de ritmo ni de concurrencia |
| Transmisiones | Horas del plan por mes, paquetes y excedente con tope (cuota comercial en `tienda_uso_recursos`); tope de espectadores por plan | Los "latidos" de cada espectador (cada 30 s) pegan a la base sin límite por tienda |
| Imágenes IA (Gemini) | Cuota por plan y freno global por día/mes | Otro proveedor y otro modelo de cobro (excedente facturado): ver "Fuera de alcance" |
| Pruebas de carga | `X-Carga-Key` salta los límites por IP | El nuevo límite por tienda debe respetar la misma regla (R6.4) |

No encontré en el código ningún tope de llamadas simultáneas a la IA ni ningún límite de solicitudes agrupado por tienda.

## Rubros: dónde aplica y cómo

El mecanismo es el mismo para todos; lo que cambia es **qué endpoints tiene cada rubro**. No hay ramas por rubro: los límites se miden por tienda, sin importar el rubro (ver CLAUDE.md, "capacidades, no identidad"). Las reglas de cada rubro no se alteran.

| Rubro | ¿Aplica? | Cómo se comporta | Regla de negocio que lo condiciona (`docs/rubros/<rubro>.md`) |
|---|---|---|---|
| productos | Sí | Asesor IA (con perfil propio), API público del catálogo y checkout, Guía y traducciones del Admin. Sin transmisiones | `productos.md`: el checkout y el stock (PRO-07) no deben cortarse por el límite de ritmo del catálogo (R1.5) |
| hotel | Sí | Asesor IA (perfil `hotel`), API público de disponibilidad y cotización, Guía y traducciones. Sin transmisiones | `hotel.md`: la cotización y la reserva directa son lo que más consulta el huésped; no se deben cortar antes que el chat (R1.5) |
| tours | Sí | Asesor IA (perfil `tours`), API público de salidas y cotización, Guía y traducciones. Sin transmisiones | `tours.md`: igual que hotel |
| eventos | Sí (**foco**) | Todo lo anterior **más transmisiones en vivo**: página del invitado y latido cada 30 s por espectador. Es el rubro con más carga sostenida por tienda | `eventos.md`: el espectador no debe perder la función por un límite (R1.6); el tope de espectadores del plan ya limita el costo |
| locales | Sí | Asesor IA (perfil `locales`), API público de cotización, Guía y traducciones. Sin transmisiones (capacidad `false`) | `locales.md`: la cotización con enlace firmado no se corta por el chat |
| canchas | Sí | Asesor IA (hoy sin perfil propio: usa el genérico), API público de disponibilidad por hora (consulta frecuente), Guía y traducciones. Sin transmisiones (capacidad `false`; pregunta abierta D-03 de `canchas.md`) | `canchas.md`: la grilla de horarios se consulta mucho; el límite por tienda no debe romperla (R1.5) |

> Los `docs/rubros/*.md` están al día (revisión del 2026-10-18). No hace falta llamar a un `analista-<rubro>` antes de aprobar; esta spec no cambia reglas de negocio de ningún rubro.

## Requisitos

### R1. Límite de solicitudes por tienda (ritmo)

- R1.1 Cada tienda tiene un **tope de solicitudes por ventana de tiempo** en los endpoints costosos: asesor IA (mensaje y mensaje con transmisión continua), asistente Guía, "Traducir con IA" y latidos/página del invitado de una transmisión.
- R1.2 Las demás solicitudes del API público de una tienda (catálogo, disponibilidad, cotización, checkout, reservas) tienen un **tope general por tienda**, más alto y separado entre lecturas y escrituras (igual que hoy se separa por IP).
- R1.3 El límite por tienda **se suma** a los de IP, no los reemplaza. El orden es: primero el de IP; una solicitud ya rechazada por IP **no consume cupo de la tienda**. Así un solo visitante abusivo no puede dejar fuera a los clientes de su propia tienda.
- R1.4 Una solicitud rechazada por límite de ritmo **no cuenta como consulta** de la cuota de IA (R2).
- R1.5 Las operaciones que cierran una venta o reserva (checkout, reserva, pago) se tratan aparte de las consultas de lectura: un pico de navegación no debe impedir comprar o reservar. *(Cómo se separan lo decide el arquitecto.)*
- R1.6 La función de una transmisión en curso no se interrumpe por el límite: el tope de latidos de una tienda debe ser coherente con el tope de espectadores de su plan y con cuántas transmisiones puede tener a la vez. *(Ver pregunta P5.)*
- R1.7 El límite se mide **por tienda**, identificada en el servidor (no por un dato que el visitante pueda cambiar).

### R2. Cuota de IA por tienda con corte solo de esa tienda

- R2.1 Se **reutiliza** la cuota de `consumo-ia` (mensual por tienda, el dueño solo puede bajarla). No se crea una segunda cuota.
- R2.2 El asesor IA tiene también un **tope diario por tienda** (como ya lo tiene la Guía), para que una tienda no gaste el mes en un día. Su valor por defecto está en P2.
- R2.3 Al agotarse la cuota (día o mes) **solo esa tienda** pierde la función de IA; las demás siguen igual. La función vuelve sola al reiniciarse el periodo (día o mes, hora de Lima).
- R2.4 Los topes de las tiendas **sin plan** y los valores por defecto de IA se pueden cambiar sin desplegar (parámetro de plataforma), como ya ocurre con traducciones.
- R2.5 La suma de lo que la plataforma permite gastar debe poder compararse con lo que su cuenta de IA soporta. *(Pregunta P3: tope de plataforma.)*

### R3. Tope de llamadas simultáneas a la IA por tienda

- R3.1 Cada tienda tiene un **máximo de llamadas a la IA en curso al mismo tiempo**. Si lo supera, la nueva solicitud se rechaza (o espera un tiempo corto; ver P4) sin tocar a otras tiendas.
- R3.2 El tope se aplica a todo uso del proveedor de IA por tienda: asesor, Guía y "Traducir con IA" (esta última usa un modelo más caro y largo). *(Pregunta P4 si se incluye traducciones.)*
- R3.3 Una solicitud rechazada por concurrencia **no cuenta como consulta** de la cuota, y un cupo ocupado se libera siempre al terminar la llamada, falle o no, o se corte la conexión (nunca queda "pegado").
- R3.4 Un pico de una tienda **no puede dejar a otra sin su cupo simultáneo**: el cupo de cada tienda es independiente.

### R4. Qué ve el cliente cuando se corta

El visitante **nunca ve cifras de consumo de la tienda** (regla ya vigente en el chat). Se distinguen tres causas, cada una con su mensaje:

- R4.1 **Ritmo** (muchas solicitudes seguidas): mensaje de "espera un momento y vuelve a intentar", sin culpar al visitante.
- R4.2 **Ocupado** (tope de llamadas simultáneas): mensaje de "estamos atendiendo muchas consultas, intenta en unos segundos".
- R4.3 **Cuota agotada** (día o mes): mensaje de "el asesor no está disponible por ahora" con la alternativa que ya existe (WhatsApp de la tienda, si lo configuró, y seguir explorando la tienda). Es el comportamiento actual y se conserva.
- R4.4 Ninguno de los tres se muestra como "error genérico" ni como pantalla rota: el resto de la tienda (catálogo, reservas, compra) sigue funcionando.
- R4.5 Los mensajes están en el catálogo de textos de la tienda y se traducen a los idiomas activos de la tienda (spec `idiomas`).
- R4.6 En el espectador de una transmisión, si se corta por ritmo, ve un aviso de "reconectando" y el sistema reintenta sin que pierda su lugar; no se le muestra un error técnico.

### R5. Qué ve el dueño en el Admin y la plataforma

- R5.1 La página **Consumo IA** (ya existe) sigue mostrando consumo contra cuota del mes y, con esta spec, también el **tope diario del asesor** y la fecha de reinicio.
- R5.2 Cuando la cuota está agotada, el dueño ve en esa página y en la Guía un aviso claro: qué se cortó, desde cuándo y cuándo vuelve (o cómo ampliar, si depende del plan).
- R5.3 El dueño puede ver **cuántas veces** se cortó su tienda por ritmo o por ocupación en el día/mes (solo el número y la causa, sin detalle de visitantes). *(Pregunta P6: si va en esta spec.)*
- R5.4 El administrador de la plataforma puede ver qué tiendas se cortaron, por qué causa y cuántas veces, para ajustar los valores. *(Pregunta P6.)*
- R5.5 Aviso por correo al dueño: ya existe para el % de la cuota mensual; se mantiene. No se agregan correos por cada corte de ritmo.

### R6. Valores configurables

- R6.1 Ningún valor de límite queda fijo en el código como única fuente: todos tienen un **valor por defecto de la plataforma** que se cambia sin desplegar.
- R6.2 Orden de prioridad del valor efectivo de una tienda, de lo más específico a lo más general: **ajuste puntual de esa tienda** (hecho por la plataforma) → **valor de su plan** → **valor por defecto de la plataforma**. El dueño, como hoy, solo puede **bajar** la cuota de IA de su tienda. *(Pregunta P1: qué límites dependen del plan.)*
- R6.3 Cambiar un valor se aplica en pocos segundos en la instancia en uso (hoy los parámetros se cachean 30 s) y deja registro de quién lo cambió y cuándo.
- R6.4 Las pruebas de carga con `X-Carga-Key` siguen saltando los límites por IP. Los límites por tienda **también** obedecen esa llave, pero las pruebas de aislamiento (CA11) se hacen **sin** la llave.

### R7. Aislamiento verificable

- R7.1 Debe poder demostrarse que una tienda que excede cualquiera de sus límites no empeora la respuesta de otra.
- R7.2 El comportamiento debe ser correcto cuando llegan solicitudes simultáneas de la misma tienda (no se pasa del tope por carreras). Hoy el servidor corre en **una sola instancia**; si se pasa a varias, los límites deben seguir cumpliéndose o documentarse en qué se vuelven aproximados. *(Pregunta técnica para el arquitecto, P8.)*

## Criterios de aceptación

Formato: **Dado** … **cuando** … **entonces** … El rubro se indica; "todos" significa que se prueba en al menos una tienda de cada rubro con la capacidad.

- CA1 (R1.1, todos menos eventos para transmisión): Dado una tienda con tope de 10 mensajes por minuto al asesor, cuando recibe 11 mensajes de IPs distintas en el mismo minuto, entonces el mensaje 11 recibe respuesta 429 con el mensaje de "espera un momento" y los 10 anteriores se respondieron.
- CA2 (R1.3, todos): Dado un visitante que ya superó el límite por IP, cuando sigue enviando solicitudes, entonces el contador de la tienda no aumenta y otros visitantes de la misma tienda siguen atendidos.
- CA3 (R1.4, todos): Dado una tienda con 5 consultas de IA libres en el mes, cuando 3 mensajes son rechazados por ritmo, entonces siguen quedando 5 consultas libres.
- CA4 (R1.2, productos): Dado una tienda de productos que supera el tope general de lecturas, cuando el visitante intenta navegar el catálogo, entonces recibe el mensaje de "muchas solicitudes" y el checkout de esa tienda, ya iniciado, no se corta por ese límite.
- CA5 (R1.5, hotel): Dado una tienda de hotel con el tope general de lecturas agotado, cuando un huésped confirma una reserva que ya cotizó, entonces la reserva se procesa.
- CA6 (R1.6, eventos): Dado una transmisión en vivo con espectadores dentro del tope de su plan, cuando todos envían su latido cada 30 s durante toda la función, entonces ningún espectador es rechazado por ritmo.
- CA7 (R2.2, todos): Dado una tienda con tope diario del asesor de N consultas, cuando recibe la consulta N+1 el mismo día (hora de Lima), entonces recibe 402 (cuota agotada) sin cifras, y a la medianoche de Lima el asesor vuelve a responder.
- CA8 (R2.3, todos): Dado dos tiendas A y B, cuando A agota su cuota del mes, entonces el asesor de B responde con normalidad y su contador no cambia.
- CA9 (R2.4 y R6.1, todos): Dado un cambio del tope de las tiendas sin plan hecho por el administrador de la plataforma, cuando pasan hasta 30 segundos, entonces una tienda sin plan se corta con el nuevo valor sin haber desplegado.
- CA10 (R3.1, R3.3, todos): Dado una tienda con tope de 3 llamadas simultáneas a la IA, cuando llegan 5 mensajes a la vez, entonces como máximo 3 están en curso, los otros 2 reciben el mensaje de "ocupado" (R4.2), ninguno de los 2 descuenta consulta, y al terminar las 3 un mensaje nuevo se atiende.
- CA11 (R3.4, R7.1, todos): Dado la tienda A con su tope simultáneo ocupado y su ritmo excedido, cuando la tienda B envía una consulta al asesor, entonces B se atiende y su tiempo de respuesta no empeora más de lo medido sin carga de A en un margen que fija el arquitecto. (Se prueba sin `X-Carga-Key`.)
- CA12 (R3.3, todos): Dado una llamada a la IA que falla, que se agota por tiempo o cuyo cliente se desconecta, cuando termina, entonces el cupo simultáneo de la tienda queda libre y la consulta de la cuota se devuelve (como hoy).
- CA13 (R2.3 y R3, todos): Dado dos mensajes simultáneos de una tienda a la que le queda 1 consulta, cuando se procesan a la vez, entonces solo uno se atiende y el otro recibe 402, sin pasar del tope.
- CA14 (R4.3, tours): Dado una tienda de tours con cuota agotada y WhatsApp configurado, cuando el visitante escribe en el chat, entonces ve "El asesor no está disponible por ahora" con la salida por WhatsApp, y la reserva de tours sigue funcionando.
- CA15 (R4.1–R4.3, canchas): Dado una tienda de canchas, cuando se corta por cada una de las tres causas, entonces el visitante ve tres mensajes distintos, ninguno contiene cifras de consumo y ninguno es "error genérico".
- CA16 (R4.5, todos): Dado una tienda con un idioma activo además del español, cuando se corta, entonces el mensaje aparece en ese idioma.
- CA17 (R5.1–R5.2, todos): Dado una tienda con la cuota diaria del asesor agotada, cuando el dueño abre Consumo IA, entonces ve el tope diario usado, que está agotado y la fecha/hora en que vuelve.
- CA18 (R5.3–R5.4, todos; sujeto a P6): Dado una tienda cortada 3 veces por ritmo hoy, cuando el dueño y el administrador de la plataforma abren la vista de cortes, entonces ambos ven "3 por ritmo", y el dueño no ve datos de visitantes.
- CA19 (R6.2, todos): Dado una tienda con ajuste puntual de límite hecho por la plataforma y otra sin ajuste del mismo plan, cuando ambas llegan a su límite, entonces cada una se corta en su propio valor.
- CA20 (R6.2, todos): Dado un dueño que intenta subir su cuota de IA por encima de la de su plan, cuando guarda, entonces se rechaza (comportamiento actual, se conserva).
- CA21 (R6.3, todos): Dado un cambio de un límite, cuando se consulta el historial del parámetro, entonces consta quién lo cambió y cuándo.
- CA22 (R1.6/R4.6, eventos): Dado un espectador cuyo latido es rechazado una vez por ritmo, cuando su reproductor reintenta, entonces no ve un error técnico ni pierde su lugar en la función.

## Variación por cliente

**Configuración por tienda** (el caso común): el mismo mecanismo para todas, con valores distintos según plan o ajuste puntual (R6.2). No hay capacidad opcional del rubro ni excepción por tienda en el registro de rubros, porque el límite no depende del rubro. No se crea una copia del mecanismo por cliente.

## Fuera de alcance

- Pasar a microservicios, separar la base de datos por tienda o crear instancias por tienda (decisión tomada).
- Elegir cómo se cuentan los límites, dónde se guardan los contadores o qué librería se usa (eso es del arquitecto).
- Diseñar la pantalla de cortes (es del diseñador, si se aprueba P6).
- Un cobro por excedente de IA o la venta de paquetes de consultas.
- Imágenes IA (Gemini): ya tienen cuota por plan y freno global; se revisan aparte si hace falta.
- El video en sí (Cloudflare Stream / YouTube va fuera del servidor); solo se limita lo que pasa por nuestro servidor (latidos, páginas del invitado).
- Defensa contra ataques de red masivos (DDoS): eso lo da el proveedor de hosting o un CDN, no esta spec.
- Cambiar el modelo de IA o de proveedor.
- Respuesta degradada del asesor sin IA (por ejemplo, solo tarjetas del catálogo) al cortarse: se evalúa como mejora posterior (P7).

## Piezas sugeridas (si se aprueba, el requerimiento es grande: dividir)

Una pieza a la vez, cada una se prueba antes de la siguiente. Orden recomendado:

1. **Ritmo por tienda del asesor y la Guía** (R1.1, R1.3, R1.4, R4.1) más valores configurables (R6.1–R6.3). Es la base de las demás.
2. **Tope simultáneo a la IA por tienda** (R3, R4.2): protege la cuenta de IA y el servidor.
3. **Cuota: tope diario del asesor y valores por defecto en parámetros** (R2.2, R2.4, R5.1–R5.2). Es poco trabajo porque `consumo-ia` ya existe.
4. **Ritmo general del API público y de transmisiones** (R1.2, R1.5, R1.6, R4.6): necesita medir valores reales antes de fijarlos.
5. **Visibilidad de cortes** (R5.3–R5.4), si Diego lo aprueba.

## Preguntas abiertas

Cada una con mi recomendación. Lo que no se responda queda como está.

- [ ] **P1. ¿Qué límites dependen del plan?** Opciones: (a) solo la cuota de IA depende del plan (como hoy) y el ritmo/concurrencia son iguales para todas las tiendas; (b) todo depende del plan; (c) ritmo y concurrencia por plan solo en "gratis" vs "pagos". *Recomiendo (c)*: un plan gratis no debe poder consumir lo mismo que uno de pago, pero sin complicar con cinco niveles.
- [ ] **P2. Valores por defecto.** No los fijo yo: hace falta decidir con datos reales. Propongo medir una semana (cuántas consultas por tienda y por minuto hay hoy en `tienda_uso_recursos` y los logs) y fijar el tope en el doble del uso del 95 % de las tiendas. ¿Aceptas medir primero, o prefieres números provisionales? Si provisionales, ¿tope diario del asesor igual a mensual ÷ 10 (por ejemplo, plan gratis 100/mes → 10/día)?
- [ ] **P3. ¿Tope de plataforma además del de tienda?** La suma de cuotas de todas las tiendas puede superar lo que soporta la cuenta de IA. Opciones: (a) solo por tienda y cuidar que la suma de cuotas por plan no supere la cuenta; (b) además un freno global (como el de Gemini) que corta a todas cuando la cuenta se acerca a su límite. *Recomiendo (a)* para cumplir tu decisión de aislar por tienda, y **vigilar la suma** desde el Admin de plataforma. El freno global (b) sería contra el objetivo, porque hace que una tienda afecte a las demás.
- [ ] **P4. Al superar el tope simultáneo: ¿rechazar o esperar?** Opciones: (a) rechazar al instante con "ocupado"; (b) esperar en cola hasta unos segundos y rechazar si no se libera. Y: ¿entra "Traducir con IA" (modelo caro y de respuestas largas) en el mismo tope que el asesor, o con uno propio más bajo? *Recomiendo (a) para el asesor (el visitante no espera) y un tope propio más bajo para traducciones.*
- [ ] **P5. Transmisiones: ¿se limita a los espectadores?** El costo ya está acotado por las horas del plan y el tope de espectadores. Estimo (a revisar con el arquitecto) que 50 espectadores generan ~100 latidos por minuto. Opciones: (a) tope por tienda derivado del tope de espectadores × transmisiones simultáneas, con margen; (b) tope fijo y alto por tienda. *Recomiendo (a)*, y que **nunca se corte a un espectador de una función en curso** salvo abuso evidente.
- [ ] **P6. ¿Cortes visibles?** ¿Entra en esta spec que el dueño y el administrador de la plataforma vean cuántos cortes hubo (R5.3-R5.4), o se deja para después? *Recomiendo incluirlo como la última pieza:* sin ver los cortes no se pueden ajustar los valores con criterio.
- [ ] **P7. Qué hace el asesor al cortarse.** Opciones: (a) mensaje fijo + WhatsApp (hoy con cuota agotada); (b) además mostrar tarjetas del catálogo sin IA; (c) ocultar el chat. *Recomiendo (a) en esta spec* y (b) como mejora separada, porque (b) cambia la experiencia del visitante y necesita diseño.
- [ ] **P8. (Para el arquitecto, no para Diego)** Hoy hay una sola instancia en Railway y los contadores de `express-rate-limit` viven en memoria; los parámetros se cachean 30 s. ¿Qué pasa con los límites si se agrega una segunda instancia? ¿Y si el servidor se reinicia (se pierden los contadores de ritmo)?
- [ ] **P9. Identificar la tienda antes de limitar.** Un atacante que use el dominio de una tienda podría agotar su límite general y dejar fuera a sus clientes reales. R1.3 lo mitiga con el límite por IP primero. ¿Es suficiente, o el tope general de la tienda es solo una "alarma" y no un corte? *Recomiendo: corte solo para los endpoints costosos (IA, transmisiones); para el API general, alarma y límite alto.*

## Decisiones tomadas

| Fecha | Decisión | Por qué | Alternativa descartada |
|---|---|---|---|
| 2026-10-19 | No se pasa a microservicios; se controla la admisión por tienda | Diego, tras la evaluación de arquitectura (Krebs 2015; AWS SaaS Lens, modelo pool) | Microservicios o una base por tienda: demasiado costo y complejidad hoy |
| 2026-10-19 | Tres controles: ritmo por tienda, cuota de IA por tienda, tope simultáneo a la IA por tienda | Cubren cuenta de IA, base de datos y servidor | Un solo límite global: una tienda afectaría a las demás |
| 2026-10-19 | Los valores se configuran (parámetro de plataforma y/o plan/tienda), no van fijos en el código | Diego | Constantes en el código |
| 2026-10-19 | Se reutiliza `consumo-ia` y `tienda_uso_recursos` para la cuota | Ya hace reserva atómica, devolución y aviso; ya lo ve el dueño | Crear una segunda cuota paralela |

## Para el manual

- **Qué es:** cada tienda tiene su propio "cupo" de uso. Si una tienda tiene mucho movimiento (o alguien abusa), solo esa tienda se frena; las demás siguen como siempre.
- **El asesor de ventas y la Guía** tienen un cupo de consultas por mes (y por día). Lo ves en *Consumo IA*: cuántas usaste, cuántas te quedan y cuándo se reinicia. Puedes bajar tu límite, no subirlo; para más consultas, cambia de plan.
- **Si el cupo se agota,** tus clientes ven "El asesor no está disponible por ahora" y pueden escribirte por WhatsApp. Tu tienda, el catálogo y las reservas siguen funcionando normal.
- **Si hay demasiadas consultas seguidas,** el cliente ve un aviso corto de esperar unos segundos. No se descuenta ninguna consulta de tu cupo.
- **Transmisiones en vivo:** tus espectadores no se cortan durante la función mientras estén dentro del tope de tu plan.
- **Si necesitas más,** escríbenos: podemos ajustar los límites de tu tienda o de tu plan.

## Para Diego

- **Requerimiento en 3 líneas:** (1) cada tienda tiene su propio límite de solicitudes, de cuota de IA y de llamadas simultáneas a la IA, con valores que cambias sin desplegar; (2) al pasarse, se corta solo esa tienda y el visitante ve un mensaje claro (nunca cifras ni error genérico); (3) el dueño ve su consumo y la plataforma puede ver quién se cortó. **Hallazgo importante:** la cuota mensual por tienda **ya existe** (`consumo-ia`, con tope diario solo en la Guía, y el chat ya muestra "no disponible"); la spec la extiende y añade lo que falta: ritmo por tienda, tope simultáneo y tope diario del asesor.
- **Rubros que toca:** los seis (transversal). Foco en el asesor IA (todos) y en las transmisiones (solo eventos hoy).
- **Preguntas que necesito que respondas** (detalle y recomendación arriba): P1 (qué depende del plan), P2 (medir primero o números provisionales), P3 (sin freno global, recomiendo solo por tienda), P4 (rechazar o esperar al estar ocupado; traducciones aparte), P5 (límite de transmisiones sin cortar a espectadores), P6 (cortes visibles: sí, como última pieza), P7 (qué ve el visitante al cortarse), P9 (alarma vs corte para el API general). P8 es para el arquitecto.
- **Riesgos:** (a) un límite por tienda mal calibrado puede cortar a clientes reales de una tienda que sí tiene muchas visitas: por eso P2 pide medir antes; (b) un atacante podría agotar el cupo general de una tienda: por eso R1.3 y P9. (c) Los valores por defecto aquí no se proponen sin datos.
- **Siguiente etapa recomendada:** aprobar la spec (o contestar las preguntas y la ajusto). Como solo la pieza 5 tiene pantalla y es chica, sigue el **`arquitecto`** (impacto y tareas), con el **`disenador`** solo para la vista de cortes si apruebas P6. Antes de la pieza 1, correr la medición de uso real para fijar valores (P2).
