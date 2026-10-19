# Cambios: antipatrones

> Bitácora para humanos. Una entrada por pieza, la más reciente arriba.

## 2026-10-19 — Pieza 4 · tarea 3: `CheckoutStore` (A5.2)
**En una frase:** el estado y la lógica del checkout salen de la página y pasan a un `CheckoutStore` con signals, que se puede probar sin pantalla. La página solo dibuja y llama al store. El comprador no ve nada distinto.

**Qué ve distinto el comprador:** nada. El e2e del checkout pasa igual: 12 de 12, y 36 de 36 con `--repeat-each=3`, sin tocar aserciones.

**Dónde:**
| Repo | Archivo | Qué hace |
|---|---|---|
| FrontendStore | `features/checkout/checkout.store.ts` (nuevo) | `@Injectable()` con signals: contacto, envío elegido, destino, zona, cotización, cupón, pago (incluido el pago en línea), comprobante y paso. Tiene los `computed` de totales (`costoEnvio`, `totalFinal`, `necesitaCoordinarEnvio`, `boletaRequiereDocumento`) y de validez (`contactoValido`, `paso1Valido`, `paso2Valido`, `primerErrorComprobante`). Acciones: `iniciar`, `irAPaso`, `elegirTipoEnvio`, `elegirMetodoEnvio`, `cambiarZona`, `aplicarGps`, `cotizarEnvios`, `aplicarCupon`, `quitarCupon`, `elegirMetodoPago`, `cambiarComprobante`, `continuarAConfirmar`, `crearPedido` y los tres envíos por WhatsApp. También el borrador en localStorage y la precarga desde la cuenta. |
| FrontendStore | `features/checkout/envio/textos-cotizacion.ts` (nuevo) | Funciones puras: los textos que dependen del modo de cotización (`textoEnvio`, `textoEnvioResumen`, `descripcionTipo`, `textoDias`, `formatoSoles`). Es lo que A5.1 dejó anotado para A5.2. |
| FrontendStore | `features/checkout/comprobante.ts` (nuevo) | Funciones puras: `DatosComprobante`, `errorComprobante`, `comprobanteSolicitud` y `resumenComprobante`. |
| FrontendStore | `checkout-page.component.ts` | Pasa de **2190 a 1282 líneas** (la plantilla, unas 1100, se va en A5.3). Declara `providers: [CheckoutStore]` y la plantilla lee `checkout.…`. Solo le queda lo de la vista: qué está desplegado, "✓ Copiado", el formato de los datos de la cuenta de pago, los filtros de teclado y pegado, y subir el scroll al cambiar de paso. |
| FrontendStore | `checkout.store.spec.ts` (nuevo) | 17 tests sin DOM, con los servicios reales del checkout y el backend simulado (`HttpTestingController`). Así los montos que llegan como texto pasan por la misma conversión que en la tienda. |
| FrontendStore | `scripts/claves-tienda.mjs` | "Datos y entrega" incluye también `checkout.store` y `comprobante`, porque sus textos vienen de la página. `claves-tienda.json` y `pantallas-tienda.json` no cambian. |

**Qué cubren los tests del store:**
- **Totales:** subtotal − cupón + envío con `costo: "10.00"` y `descuento: "20.00"` como texto da 90 y no concatena. Un envío por coordinar no suma al total. Un cupón inválido deja el mensaje y no descuenta.
- **Validez:** el paso 1 pide nombre y celular de 9 dígitos (el "+51 987 654 321" del autocompletado queda en `987654321`). Con varios tipos de entrega hay que elegir uno. Courier espera el distrito y el panel. El paso 2 valida el DNI de 8 dígitos y el RUC de 11. Con el comprobante mal, `continuarAConfirmar` no avanza.
- **Cambio de método:** otro tipo toma su propia cotización y limpia el destino del anterior, pero deja la zona. Si el método ya no llega al distrito nuevo, se suelta la selección. Solo vale la última cotización.
- **Pedido (payload):** el body del POST lleva envío, destino, cupón, pago, comprobante y el documento del cliente. Con éxito: paso 4, carrito vacío y borrador borrado. En el recojo no viaja destino. Una factura en una tienda que no la emite sale como boleta. Con el comprobante mal vuelve al paso 2 sin mandar nada. Si el backend rechaza el pedido, queda su mensaje y no se vacía el carrito.
- **Borrador:** una visita nueva (otro store) recupera contacto, método y paso.

**Decisiones que tomé y por qué:**
- **El store se provee en el componente, no en root.** Así cada visita empieza limpia. Lo que sobrevive entre visitas ya era así a propósito, y se respeta: el borrador en localStorage y la zona recordada (`UbicacionEntregaService`).
- **El contacto y el comprobante son signals de objeto** (`contacto()`, `comprobante()`) y se cambian con `cambiarNombre`, `cambiarTelefono` y `cambiarComprobante`. Antes eran objetos mutables con `[(ngModel)]`. En la plantilla queda `[ngModel]` + `(ngModelChange)`. Así la validez del paso 1 es un `computed` del store, y el botón Continuar usa `checkout.paso1Valido()` en lugar de `step1Form.valid`. La regla es la misma: nombre no vacío (`required`) y 9 dígitos (`pattern`).
- **El store no toca el DOM.** El scroll lo hace la página: `crearPedido(alCambiarPaso)` avisa cuando cambia el paso, y `continuarAConfirmar()` devuelve si avanzó.
- **Los efectos (re-cotizar y autocompletar desde la cuenta) viven en el store.** Como el store se provee en el componente, siguen siendo efectos de la vista, igual que antes.
- **`resumenComprobante` y `emiteFactura` son métodos, no `computed`:** leen la tienda, que no es un signal.
- **Se mantuvieron los nombres de estado** (`selectedMetodoEnvio`, `currentStep`…) para que el diff de la plantilla sea solo el prefijo `checkout.`. Las acciones van en español.

**Riesgos de pago que vi y NO cambié:**
- **Doble envío del pedido:** `crearPedido` no se protege contra un segundo clic. Solo lo evita el botón deshabilitado mientras `sending()`. Un `if (this.sending()) return;` lo cerraría, pero es un cambio de comportamiento.
- **Estado del pago en línea (Culqi):** `estadoPagoEnLinea` y `cobrarPedido` se mudaron tal cual al store.

**Hallazgos (de antes de A5.2; los encontró el test del store):**
1. **El borrador vuelve a escribirse después del pedido.** Al crear el pedido, el carrito se vacía, el efecto vuelve a cotizar con subtotal 0 y `revalidarSeleccionEnvio` guarda el borrador otra vez (con `paso: 4`). La siguiente compra en ese navegador arranca con el nombre, el teléfono y el destino del pedido anterior. El comentario del código dice que el borrador se limpia al crear el pedido. No es de pago, pero sí de privacidad en un equipo compartido.
2. **El mensaje "Coordinar … por WhatsApp" de la confirmación usa el envío re-cotizado con subtotal 0.** Si la tienda tiene envío gratis desde cierto monto, el mensaje puede decir un costo de envío distinto al del pedido. El total del mensaje sí sale del pedido.

**Lo que quedó pendiente / deuda:**
- **El store tiene 887 líneas.** La verificación final de la pieza 4 pide que ningún archivo del checkout pase de 400. Para cumplirlo habría que partir el store: por ejemplo, envío (zona, cotización y destino), pedido y pago, y borrador/precarga. Esa partición es una decisión de arquitectura y no la improvisé: la dejo para Diego o el arquitecto antes de cerrar la pieza.
- La plantilla (unas 1100 líneas) sigue en la página: es A5.3.
- Los hallazgos 1 y 2 de arriba.

**Afecta al despliegue:** nada. No hay llaves ni SQL.

**Tests:** `npm run e2e` contra un `ng serve` nuevo en :4321 → 12 passed (y 36/36 con `--repeat-each=3`). `npm test` → claves al día (1125 claves, 22 pantallas), 7 tests de scripts OK, textos OK, anti-identidad OK, anti-ramas-envio OK (0 ramas), Karma **260 SUCCESS** (antes 243, +17). `npx tsc --noEmit -p tsconfig.app.json` y `-p tsconfig.spec.json` → 0 errores. `ng build --configuration development` OK.

**Commits:** sin commit (pendiente de que Diego lo pida).

## 2026-10-19 — Pieza 4 · tarea 2: estrategias de envío (A5.1)
**En una frase:** el checkout ya no pregunta "¿es courier, domicilio o recojo en tienda?". Cada tipo de envío es una estrategia en un registro tipado, y el checkout le pregunta a ella. El comprador no ve nada distinto.

**Qué ve distinto el comprador:** nada. El e2e del checkout pasa igual (12 de 12, sin tocar aserciones ni selectores).

**Dónde:**
| Repo | Archivo | Qué hace |
|---|---|---|
| FrontendStore | `features/checkout/envio/estrategia-envio.ts` (nuevo) | Contrato `EstrategiaEnvio`: `etiqueta`, `descripcion`, `pideDestino`, `cotiza`, `camposDestino`, `panel`, `nota()`, `resumen()`, `valida()`. Además, `ContextoPanelEnvio` (lo que recibe el panel) y dos ayudas: `validaConDestino` y `usaUbicacionGps`. |
| FrontendStore | `envio/courier.ts`, `envio/delivery-propio.ts`, `envio/recojo-tienda.ts` (nuevos) | Una estrategia por tipo, con los textos y las reglas que antes estaban en las ramas del checkout. |
| FrontendStore | `envio/estrategias-envio.ts` (nuevo) | `ESTRATEGIAS_ENVIO: Record<MetodoEnvioTipo, EstrategiaEnvio>`. Si se agrega un tipo y falta su estrategia, no compila. El orden de las claves es el orden del selector de entrega (`TIPOS_ENVIO`). |
| FrontendStore | `envio/panel-agencia.component.ts`, `envio/panel-domicilio.component.ts` (nuevos) | Adaptadores: reciben el contexto por un solo input y lo conectan con `app-agencia-picker` y `app-domicilio-picker`, que no cambian. |
| FrontendStore | `checkout-page.component.ts` | El panel se dibuja con `*ngComponentOutlet="estrategiaDe(tipo).panel"` (antes era un `@if` por tipo). El resumen del destino usa `resumen()` y el botón Continuar usa `valida()`. Las 25 comparaciones con un tipo literal se cambiaron por preguntas a la estrategia. |
| FrontendStore | `components/recojo-tienda/…` | Cumple el contrato de panel (`contexto`, que hoy no usa). |
| FrontendStore | `envio/estrategias-envio.spec.ts` (nuevo) | 23 tests sin DOM: el contrato de las tres estrategias (exhaustividad y orden, panel con input `contexto`, `pideDestino` ⇔ `camposDestino`) y uno por tipo con sus textos, nota, resumen y validación. |
| FrontendStore | `scripts/anti-ramas-envio.mjs` (nuevo), `package.json` | Fitness function: falla si aparece `'courier'`, `'delivery_propio'` o `'recojo_tienda'` en el código (sin contar comentarios) fuera de `features/checkout/envio/` y de `models/metodo-envio.model.ts`. Corre en `npm test` (también `npm run anti-ramas-envio`). Contra el `checkout-page` anterior encuentra 25. |
| FrontendStore | `scripts/claves-tienda.mjs` | "Datos y entrega" también incluye `features/checkout/envio`, porque los textos de las opciones se mudaron ahí. `claves-tienda.json` y `pantallas-tienda.json` no cambian. |

**Qué decide cada estrategia (antes era una rama):**
| Antes, en `checkout-page` | Ahora |
|---|---|
| `ORDEN_TIPOS` fijo | orden de `ESTRATEGIAS_ENVIO` (`TIPOS_ENVIO`) |
| `@if (tipo === 'courier') <app-agencia-picker> @else if …` | `panel` + `NgComponentOutlet` |
| `switch` de `tipoLabel` / `tipoDescripcion` | `etiqueta` / `descripcion` |
| `needsDestino`, `requiereZona`, limpiar la dirección en recojo | `pideDestino` |
| `esRecojoEnTienda` → "Gratis", sin "por coordinar", sin precio en la opción | `cotiza: false` |
| `notaAgencia` (texto de courier con tarifa) | `nota(cotizacion)` |
| Destino del último pedido copiado campo a campo por tipo | `camposDestino` |
| Recrear el panel de domicilio tras el GPS | `usaUbicacionGps` (el tipo llena `direccion`) |
| Destino en el resumen del paso 3 (`@if` courier / domicilio) | `resumen(destino)` → líneas |
| Condición de Continuar (`needsDestino && (!destinoValido \|\| !zona)`) | `valida({ panelValido, zona })` |

**Decisiones que tomé y por qué:**
- **Los callbacks van en el contexto, no como outputs.** `NgComponentOutlet` solo pasa inputs. Por eso el panel recibe un único input `contexto` con los datos y los callbacks (`alElegirMetodo`, `alCambiarDestino`, `alCambiarValidez`). Las funciones son estables y los datos salen de `computed` separados: así el picker no recibe un arreglo nuevo en cada cambio.
- **Adaptadores en vez de cambiar los pickers.** `agencia-picker` y `domicilio-picker` mantienen sus `@Input`/`@Output`. Esto importa sobre todo en el de domicilio: el setter de `zonaFija` y el mapa son delicados. El adaptador (unas 25 líneas) tiene `display: contents`, así que el DOM visible no cambia.
- **Un método de un tipo desconocido no se ofrece.** Al cargar, `metodosEnvio` filtra los tipos que no tienen estrategia, para que el registro no reviente con `undefined`. Antes, un tipo así tampoco salía en el selector, pero sí hacía pedir el distrito. El backend solo manda los tres tipos, así que en la práctica no cambia nada.
- **`pideDestino` y `cotiza` son dos banderas distintas**, aunque hoy coincidan (solo el recojo en tienda tiene las dos en falso). Pedir destino y cobrar envío son cosas diferentes: un futuro "recojo en sede con costo" las separaría. El test fija que `pideDestino` coincide con tener `camposDestino`.
- **"Ref:" sigue sin traducirse**, como antes. Cambiarlo sería otro cambio de comportamiento.

**Lo que quedó pendiente / deuda:**
- `checkout-page.component.ts` pasa de **2203 a 2190 líneas**. Esta tarea no buscaba bajarlas: eso viene con A5.2 (`CheckoutStore`) y A5.3 (pasos).
- Los textos de `tipoDescripcion` con precio ("Desde {monto} según la agencia") y los de `textoEnvio` dependen del **modo de cotización** (`fijo`/`gratis`/`destino`/`coordinar`), no del tipo. Por eso se quedan en la página y no son ramas por tipo. Encajan en el `CheckoutStore` (A5.2).
- `metodosDelTipo`, `preciosDelTipo` y `contextoPanel` deberían mudarse al `CheckoutStore` (A5.2).
- El nombre del archivo `funcionalidad-pendiente-recojo_tienda.component.ts` no se tocó.
- **Para quien corra el e2e:** un `ng serve` que ya estaba corriendo con HMR no aplicó bien el cambio de `imports` del componente (`Cannot read properties of undefined (reading 'Eager')` en `ɵɵreplaceMetadata`) y 5 casos fallaron. Con un `ng serve` nuevo pasan 12 de 12. Después de esta tarea hay que **reiniciar el `npm start`** antes de `npm run e2e`.

**Afecta al despliegue:** nada. No hay llaves ni SQL.

**Tests:** `npm run e2e` → 12 passed (contra un `ng serve` nuevo) y 36/36 con `--repeat-each=3`. `npm test` → claves al día (1125 claves, 22 pantallas), textos OK, anti-identidad OK, anti-ramas-envio OK, Karma 243 SUCCESS (antes 220, +23). `npx tsc --noEmit -p tsconfig.app.json` y `-p tsconfig.spec.json` → 0 errores. `ng build --configuration development` OK.

**Commits:** sin commit (pendiente de que Diego lo pida).

## 2026-10-19 — Pieza 4 · hallazgos del e2e (antes de A5.1)
**En una frase:** el comprador ya no ve textos internos ni nombres de courier que su tienda no usa, los textos del checkout llevan sus tildes y los montos del pedido creado se tratan como número (el mensaje "Ya pagué — Enviar comprobante" decía "S/ 110.00"; ahora "S/ 110", como el resto de la pantalla).

**Qué ve distinto el comprador:**
- Recojo en tienda: "Recojo en tienda: coordina por WhatsApp el local y el horario para recoger tu pedido." Sin "(Selección de local — funcionalidad pendiente.)".
- Recojo en agencia: la nota dice "Así trabaja {courier}: dejamos tu paquete en la agencia y tú pagas el envío cuando lo recoges.", con el nombre que la tienda le puso al método (antes, siempre "Así trabajan Shalom y Olva"). Esa nota antes no se traducía; ahora sí. El enlace al buscador oficial dice "Buscar mi agencia {courier}" (antes "Buscar mi agencia Shalom" / "Buscar mi agencia u agente Olva").
- Tildes: "Teléfono", "Teléfono / WhatsApp", "Envío" (checkout y carrito), "Envío y entrega" (ficha del producto), "Número de Pedido", "Tu carrito está vacío", "Ej: Juan Pérez", "Tu pedido quedó registrado…", "envía tu comprobante", "El teléfono es obligatorio", "Ingresa un número peruano válido (9 dígitos)".
- Mensaje de WhatsApp tras crear el pedido: los montos exactos salen sin ".00".

**Dónde:**
| Repo | Archivo | Qué hace |
|---|---|---|
| FrontendStore | `src/app/models/monto.ts` (nuevo) | `monto()` y `montoONulo()`: pasan a número un `Decimal` que llega como texto. |
| FrontendStore | `models/metodo-envio.model.ts`, `pedido.model.ts`, `cupon.model.ts` | `metodoEnvioDesdeApi`, `cotizacionDesdeApi`, `pedidoDesdeApi` (montos y detalles), `validarCuponDesdeApi`. |
| FrontendStore | `features/checkout/services/*.service.ts` | Los servicios de métodos de envío, cotización, cupón y pedido aplican esas funciones al recibir la respuesta, así la plantilla ya recibe números. |
| FrontendStore | `features/checkout/config/couriers.ts` | Registro de datos por courier: solo `alias`, `mapaUrl` y `ejemplo`, sin textos con el nombre fijo. El nombre visible sale del método de envío. |
| FrontendStore | `features/checkout/components/agencia-picker/…` | Enlace y nota con `{courier}` = nombre del método elegido. |
| FrontendStore | `features/checkout/components/recojo-tienda/…`, `checkout-page`, `cart-page`, `product-page` | Texto del recojo sin la nota interna; tildes. |
| FrontendStore | `scripts/claves-tienda.mjs` | `couriers.ts` ya no tiene textos, así que sale de la sección "Envío a agencia" de `PANTALLAS`. |
| FrontendStore | `e2e/checkout/*` | Fixtures con los montos del pedido como `"110.00"` y `costoReferencial: "12.00"`; `window.open` se anota para leer el mensaje de WhatsApp; selectores con tilde; casos nuevos (abajo). |
| BackendNode | `modules/idiomas/claves/claves-tienda.json` | Copiado por `npm run claves`. |
| BackendNode | `modules/idiomas/plataforma/en.json` | El inglés de la plataforma pasa a las claves nuevas (renombradas en su lugar); se agregan las 2 notas nuevas. |
| BackendNode | `docs/sql/antipatrones_claves_tildes.sql` (+ `_reversa.sql`) | Copia lo que cada tienda tradujo a mano (`tienda_textos`) de la clave vieja a la nueva, sin pisar una que ya exista. |

**Claves que cambian** (el texto en español es la clave):
| Vieja | Nueva | Inglés de la plataforma | Traducción de cada tienda |
|---|---|---|---|
| Envio | Envío (ya existía) | ya estaba | se copia (SQL) si la tienda no tenía la nueva |
| Envio y entrega | Envío y entrega | movido | se copia (SQL) |
| Numero de Pedido | Número de Pedido | movido | se copia (SQL) |
| Telefono | Teléfono | movido | se copia (SQL) |
| Telefono / WhatsApp | Teléfono / WhatsApp | movido | se copia (SQL) |
| Tu carrito esta vacio | Tu carrito está vacío (ya existía) | ya estaba | se copia (SQL) si la tienda no tenía la nueva |
| Ej: Juan Perez | Ej: Juan Pérez | movido | se copia (SQL) |
| Buscar mi agencia Shalom / Buscar mi agencia u agente Olva | Buscar mi agencia {courier} | nuevo: "Find my {courier} agency" | **no se copia**: la traducción vieja tiene el nombre fijo |
| coordina por WhatsApp … (Selección de local — funcionalidad pendiente.) | coordina por WhatsApp el local y el horario para recoger tu pedido. | movido sin la nota | **no se copia**: arrastraría la nota interna |
| — | Así trabaja {courier}: dejamos tu paquete… / Dejamos tu paquete en la agencia… | nuevo | — |

Las claves viejas no se borran: el backend las marca obsoletas al arrancar, como siempre. Una tienda que había traducido a mano las filas que no se copian verá el inglés de la plataforma hasta que las vuelva a traducir en Traducciones.

**Casos del e2e que se agregaron o cambiaron** (siguen siendo 12):
- Olva: el enlace "Buscar mi agencia Olva Courier" apunta a `olvacourier.com/agencias`.
- Shalom: la nota dice "Así trabaja Shalom: …" y el enlace apunta a `shalom.com.pe/agencias`.
- Fuera de zona: la nota usa "Olva Courier" y no aparece "Shalom y Olva".
- Recojo en tienda: no aparece "funcionalidad pendiente".
- Domicilio: el resumen muestra "Teléfono".
- Yape: "Número de Pedido" a la vista. Al tocar "Ya pagué — Enviar comprobante", el mensaje a `wa.me/999000111` lleva `*N° PED-000123*` y `*S/ 110*`. **Probado que falla sin el arreglo:** sin `pedidoDesdeApi`, el mensaje decía `*S/ 110.00*`.

**Decisiones que tomé y por qué:**
- **Número en la entrada, por modelo.** Cada modelo tiene su `…DesdeApi` junto a su interfaz, y el servicio lo aplica en el `map` de la respuesta. La cotización y el cupón ya llegan con números desde el backend (`cotizacion.js` y `cupones.service.js` hacen `Number()`), pero igual pasan por la función: es barato y no depende de que eso siga así. Lo que sí llegaba como texto: `costoReferencial` de los métodos de envío y los montos del pedido creado.
- **Nombre del courier = nombre del método de envío.** La tienda ya lo configura en el Admin. El registro `COURIERS` queda solo con datos (alias para reconocerlo, URL del buscador, ejemplo). Un courier que no está en el registro funciona igual, sin enlace (como antes).
- **"agencia u agente" se va.** Era un error ("u" solo va antes de "o"), y con un texto genérico no hace falta.
- **"Número de Pedido" sin cambiar las mayúsculas:** solo se corrigió la tilde, para no mezclar otro cambio de estilo.
- **SQL para las traducciones de las tiendas, no un script del backend:** es una migración de datos de una sola vez. Queda versionada en `docs/sql` y la corre Diego.

**Lo que quedó pendiente / deuda:**
- Los textos de la confirmación ("Tu pedido quedó registrado…", "Pedido creado exitosamente") y los errores del teléfono son texto plano en la plantilla, sin `| t`, así que no se traducen. `textos:check` no los detecta. Encaja con A5.3/A5.6 (pasos y textos fuera del template).
- `order-tracking` recibe el mismo `Pedido` con los montos como texto y no lo normaliza. Hoy solo los muestra con `currencyFormat`, que hace `Number`. Conviene usar `pedidoDesdeApi` ahí; no lo toqué porque es otra pantalla.
- `Tienda.envioGratisMinimo` también llega como texto. Solo lo usa el chat, con `currencyFormat`. Queda para la pieza 6 (contratos).
- Los ejemplos de agencia de Shalom y Olva ("Ej: JR. RAYMONDI — …") son datos fijos en español, sin traducir.

**Afecta al despliegue:** SQL: correr `docs/sql/antipatrones_claves_tildes.sql` en Supabase **después** de desplegar el backend y la tienda (reversa: `antipatrones_claves_tildes_reversa.sql`). Llaves: ninguna.

**Tests:** `npm run e2e` → 12 passed. `npm test` (Store) → claves al día (1125 claves, 22 pantallas), 7 tests de scripts OK, textos OK, anti-identidad OK, Karma 220 SUCCESS. `npx tsc --noEmit -p tsconfig.app.json` y `-p tsconfig.spec.json` → 0 errores. Backend `npm test` → 117 suites, 1582 tests OK.

**Commits:** sin commit (pendiente de que Diego lo pida).

## 2026-10-19 — Pieza 4 · tarea 1: e2e del checkout
**En una frase:** el checkout de la tienda tiene una red de seguridad automática. 12 pruebas en un navegador real recorren el checkout con cada método de envío y revisan lo que ve el comprador y lo que se manda al crear el pedido. Tienen que pasar igual antes y después de partir `checkout-page` en estrategias (A5.5). El comprador no ve nada distinto.

**Dónde:**
| Repo | Archivo | Qué hace |
|---|---|---|
| FrontendStore | `e2e/checkout/checkout-envio.spec.ts` | Los 12 casos (tabla de abajo). Solo usa roles, etiquetas y textos visibles. |
| FrontendStore | `e2e/checkout/mock-api.ts` | Contesta toda petición a `/api/v1` sin tocar ningún backend y guarda el POST del pedido para revisar su body. Si la página pide algo sin mock, la prueba falla. |
| FrontendStore | `e2e/checkout/fixtures.ts` | Tienda, métodos, cotización, SUNAT, cupón y pedido creado, con la misma forma que manda hoy el backend. |
| FrontendStore | `e2e/checkout.spec.ts`, `e2e/mocks/api.ts` | **Borrados**: la suite anterior estaba rota (5 de 5 fallaban, buscaba textos como "Datos de Contacto" que ya no existen). La nueva cubre lo mismo y más. |

**Cómo se corre** (en `ecommerceMultitenant-FrontendStore`):
```bash
npm run e2e                 # levanta `npm start` si no hay nada en :4200 (o reutiliza el que ya corre)
npm run e2e:ui              # modo visual, paso a paso
npm run e2e:report          # informe HTML de la última corrida
```
- Playwright ya estaba instalado (`@playwright/test` 1.60, `playwright.config.ts`, script `e2e`). No se tocaron ni la configuración ni `package.json`.
- `npm test` (Karma) no lo corre: Karma solo toma `src/**/*.spec.ts`.
- La primera vez en otra máquina: `npx playwright install chromium`.
- Duración: unos 25 s con el `ng serve` ya levantado. Repetido 3 veces seguidas (`--repeat-each=3`): 33/33, sin intermitencias.

**Qué cubre cada caso.** Datos fijos: el carrito tiene 2 × "Polo Algodón Pima" a S/ 50 (S/ 100). La tienda tiene los tres tipos de envío. En Lima (prefijo 1501): Delivery Lima a S/ 10 fijo, Olva Courier a S/ 15 fijo, Shalom con pago en destino (aprox. S/ 12 al recoger, que no suma al total) y Recojo en tienda gratis.

| Grupo | Caso | Fija |
|---|---|---|
| Contacto | sin nombre / teléfono de menos de 9 dígitos | "Continuar" deshabilitado hasta que los dos son válidos |
| Contacto | tres tipos de entrega | se ofrecen "Recojo en agencia", "Envío a domicilio" y "Recojo en tienda", y sin elegir uno no se avanza |
| `courier` | tarifa fija (Olva) | sin distrito no avanza. El panel pide agencia (grupo "Elige la agencia", con el precio de cada una) y "Datos de la agencia" (mínimo 20 caracteres, con su error). El total es S/ 115. El resumen dice "Olva Courier · S/ 15 · 2-4 días hábiles" y "Recojo en Olva Courier · …". El POST lleva `metodoEnvio`, `metodoEnvioId`, `costoEnvio: 15`, `courier`, `agenciaTexto` y la zona, sin `direccionEnvio`. La confirmación muestra S/ 115. |
| `courier` | pago en destino (Shalom) | la primera agencia viene elegida. El envío dice "Pagas al recoger" y el total no llega a S/ 112. El resumen dice "Pagas aprox. S/ 12 al recoger · 2-3 días hábiles". El POST lleva `costoEnvio: 0` y la confirmación muestra S/ 100. |
| `delivery_propio` | en zona (Miraflores) | sin distrito, "Dirección exacta" está deshabilitada y no se avanza. La opción muestra "S/ 10 · 1-2 días hábiles". La dirección pide mínimo 8 caracteres (con su error) y la referencia es opcional. El total es S/ 110. El resumen muestra el ubigeo, la dirección y "Ref:". El POST lleva `direccionEnvio`, `referencia`, la zona, `costoEnvio: 10` y boleta sin documento. La confirmación dice "Coordina la entrega y el pago…". |
| `delivery_propio` | fuera de zona (Arequipa) | el domicilio desaparece (`fueraDeZona: no_disponible`) y el courier queda en "Por confirmar". Con Yape sale el aviso "El costo de envío se confirma por WhatsApp…". El resumen dice "Costo de envío a confirmar por WhatsApp". El POST lleva `costoEnvio: 0` y ubigeo `040101`. La confirmación ofrece "Coordinar pedido por WhatsApp". |
| `recojo_tienda` | sin destino | no pide distrito ni dirección: avanza solo con el contacto. El envío es "Gratis". La tarjeta de envío del resumen no tiene "Editar". El POST lleva todos los campos de destino en `null` y no manda `direccionEnvio`. |
| Cupón | inválido y válido | "Cupón no válido". Con `DESCUENTO20` aparece "Descuento (DESCUENTO20)" y el total queda en S/ 90 (100 − 20 + 10). El POST lleva `descuentoMonto: 20` y `codigoCupon`. |
| Pago | contra entrega | viene elegido (`aria-checked`) y dice "Pagas al recibir tu pedido…". El POST lleva `metodoPago: "Contra entrega"`. La confirmación ofrece "Coordinar entrega por WhatsApp". |
| Pago | manual (Yape) | muestra instrucciones, "Monto a pagar" S/ 110, el número y el aviso de verificar al destinatario. La confirmación dice "Paga con Yape", muestra el N° de pedido y "Ya pagué — Enviar comprobante". |
| Comprobante | boleta | viene por defecto ("· DNI opcional"). Un DNI de 4 dígitos no deja pasar de "Revisar pedido" ("El DNI debe tener 8 dígitos"). El resumen dice "Boleta · DNI 45678912". El POST lleva `comprobante` y `cliente.tipoDocumento`/`numeroDocumento`. |
| Comprobante | factura | un RUC de 10 dígitos no deja pasar ("Ingresa un RUC válido de 11 dígitos"). Con un RUC válido aparece la razón social de SUNAT. El resumen dice "Factura · RUC … · razón social". El POST lleva `tipo: factura`, `docTipo: RUC`, la razón social y la dirección fiscal. |

**Endpoints que se mockean y de dónde salió su forma.** Todos van con el sobre de `utils/apiResponse.js` (`{ status, type, code, data[, meta] }`). Los listados llevan el `meta` del `GenericService` (`total, page, limit, totalPages, hasNextPage, hasPrevPage`). La forma se comprobó contra el backend local con un GET de solo lectura.
| Endpoint | Forma tomada de |
|---|---|
| `GET /store/tiendas?slug=` | `modules/tenants/tiendas.store.routes.js`: fila de `tiendas` (Prisma, sin serializer) + `diseno`, `comunicados` e `idiomasDisponibles`. `Decimal` como texto. |
| `GET /store/metodos-envio` | `modules/envios/metodos-envio.store.routes.js` (GenericController, sin serializer): fila de `metodos_envio`, con `costoReferencial` como texto. |
| `GET /store/envios/cotizar` | `modules/envios/cotizacion.js` → `cotizarMetodo` (+ `nombre` de `cotizacion.service.js`). El fixture reproduce sus reglas: zona por prefijo, `destino`, `fijo`, `gratis` y `no_disponible`. |
| `GET /store/metodos-pago` | `modules/pagos/metodos-pago.store.routes.js` (sin serializer): fila de `metodos_pago`. |
| `GET /store/pagos/config` | `modules/pagos/modo-pago.service.js` → `configPublica`, modo `manual`. |
| `GET /store/live` | `modules/live/live.serializer.js` → `serializeLivePublic` (`{ activo: false }`). Lo pide el layout. |
| `GET /store/cupones/validar/:codigo` | `modules/cupones/cupones.service.js` → `validarCupon`. |
| `GET /store/sunat/ruc/:ruc` | `modules/sunat/ruc.service.js` y el contrato `ConsultaRuc` del front. 404 si el RUC no está. |
| `GET /store/categorias`, `/marcas`, `/productos` | listados vacíos. |
| `POST /store/pedidos` | `modules/ordenes/pedidos.service.js` → `create`: fila de `pedidos` con `detalles`, `historialEstados` y `cliente`. Como el backend, **ignora el `costoEnvio` del body** y lo recalcula con `metodoEnvioId` + `ubigeoCode`. |

Fuera de `localhost`, Nominatim contesta `[]` y todo lo demás se corta. Así el autocompletado de la dirección no depende de internet.

**Decisiones que tomé y por qué:**
- **Mocks de red (`page.route`) y no un backend de prueba.** El e2e no depende de Railway, de Supabase ni de datos que cambian. Hay además un motivo de seguridad: en esta máquina corre un backend en `:3000`, que es justo a donde apunta `environment.ts`. Sin el "atrapa todo", un POST de pedido podía crear pedidos reales. Por eso toda ruta de `/api/v1` sin mock devuelve 404 y hace fallar la prueba (`afterEach`). Si el refactor agrega un endpoint, hay que darle su fixture de forma consciente.
- **Se revisa el body del POST, no solo la pantalla.** Es lo que más importa no romper en un área de pagos. Uso `toMatchObject` sobre los campos de envío, pago y comprobante: los campos opcionales que hoy no se mandan (`email`, `notas`) no amarran la prueba.
- **El distrito se elige con los combos, como lo haría un comprador.** No se siembra en `localStorage`. Así la prueba cubre la cotización que dispara la zona.
- **La tarjeta "Envío" del resumen se ubica por contenido:** el bloque más chico que tiene el título "Envío" y el nombre del método. No uso clases ni anidamiento, que van a cambiar al partir en pasos. Los montos se buscan solo entre los visibles, porque el resumen móvil también está en el DOM.
- **Solo se probó en escritorio** (el proyecto `chromium` de la configuración). En móvil, el cupón y el resumen cambian de lugar. Ver lo que no cubre.

**Lo que no cubre y por qué:**
- **Pago en línea (modo automático, Culqi/simulador).** Necesita el SDK del proveedor y un token. Es un flujo aparte (`pago-en-linea`) que el refactor del paso de pago (A5.4) debería probar por su lado.
- **El mapa (Leaflet) y el GPS:** dependen de tiles y permisos del dispositivo. La coordenada es opcional y el POST la manda en `null`.
- **Sesión con Google** (autocompletar desde la cuenta y el destino del último pedido) y **el borrador** al volver de otra pestaña: requieren Supabase o recargas. Son buenos candidatos para tests sin DOM del `CheckoutStore` (A5.5, segunda parte).
- **Vista móvil** (cupón en el paso 1 y barra fija de "Confirmar"): se puede agregar como segundo proyecto de Playwright si se quiere fijar.
- **Los botones de WhatsApp:** se verifica que aparecen, pero no se abren (abrirían wa.me).
- **El SSR del `ng serve`:** Node, no el navegador, puede pedir al backend local. Playwright no ve esas peticiones. Son solo lecturas, y el `storeResolver` no pide la tienda en el servidor.

**Hallazgos** (no los arreglé: son de otra pieza o de comportamiento):
1. La suite e2e anterior estaba rota desde hace tiempo y nadie se enteró: no corre en ningún CI. Se reemplazó.
2. **El contrato de los `Decimal` no coincide.** El backend manda `total`, `subtotal`, `costoEnvio`, `costoReferencial` y `envioGratisMinimo` como texto (`"110"`), pero los modelos del front los declaran `number` (`Pedido`, `MetodoEnvio`, `Tienda`). Hoy no se nota: `currencyFormat` hace `Number(...)` y `pedidoCreado().costoEnvio > 0` funciona por coerción. Cualquier suma con esos campos en el `CheckoutStore` concatenaría texto. Es para la pieza 6 (contratos generados), y el refactor debe tratarlos con `Number()`.
3. **El comprador ve un texto interno en el recojo en tienda:** "(Selección de local — funcionalidad pendiente.)" (`recojo-tienda/funcionalidad-pendiente-recojo_tienda.component.ts`).
4. **El panel de agencia dice siempre "Así trabajan Shalom y Olva…"**, aunque la tienda use otros couriers (texto fijo en `agencia-picker`). Encaja con A5.6 (textos por defecto fuera del template).
5. **Faltan tildes en textos visibles del checkout:** "Tu pedido quedo registrado", "envia", "Telefono / WhatsApp", "Numero de Pedido", "Envio". Si se corrigen, hay que actualizar el e2e (los usa como selector).
6. `npx tsc --noEmit` con el `tsconfig.json` raíz da 724 errores previos: compila los specs de Karma sin los tipos de Jasmine. Con `tsconfig.app.json` y `tsconfig.spec.json` sale limpio, y los archivos del e2e compilan sin errores.

**Lo que quedó pendiente / deuda:** el resto de la pieza 4 (estrategias, `CheckoutStore`, pasos, tests sin DOM). El hallazgo 6 (tipos en el tsconfig raíz) es deuda del repo.

**Afecta al despliegue:** nada. No hay llaves ni SQL, y solo cambian archivos de prueba.

**Tests:** `npm run e2e` → 12 passed (y 33/33 con `--repeat-each=3`). `npm test` (Karma) → 220 SUCCESS. `npx tsc --noEmit -p tsconfig.app.json` y `-p tsconfig.spec.json` → 0 errores.

**Commits:** sin commit (pendiente de que Diego lo pida).
