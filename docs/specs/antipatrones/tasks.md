# Tareas: corrección de antipatrones

> Spec: [spec.md](spec.md). Una pieza a la vez: no se empieza la siguiente sin verificar la anterior.

## Antes de la pieza 1
- [x] Aprobar la spec y la decisión de `ALCANCE` compartido con multi-sede (2026-10-17)
- [ ] Commitear el trabajo abierto en reservas, hotel y checkout; los tres repos sin cambios pendientes

## Pieza 1 — Aislamiento por tienda (Backend, nada visible)
- [x] `kernel/tenant/alcance.js`: los 63 modelos con `tiendaId` clasificados; 61 `tienda` y 2 `global` (`usuario_tiendas`, `invitaciones`) con motivo (A1.1)
- [x] `config/prisma.js` arma los modelos con filtro desde `ALCANCE` (A1.2)
- [x] Test de contrato `kernel/tenant/__tests__/alcance.test.js` (lee `schema.prisma`): falla si un modelo con `tiendaId` no está clasificado; probado quitando `zonas_envio` (A1.3)
- [x] Auto-scope en `findUnique`, `findUniqueOrThrow`, `update`, `upsert` y `delete`, también en `updateManyAndReturn`; forma verificada contra Prisma 7 (A1.4)
- [x] Salida explícita: `runUnscoped` (ya existía) (A1.5)
- [x] Jobs de reseñas y transmisiones dentro de `runUnscoped` (A1.6)
- [x] Tests negativos `kernel/tenant/__tests__/auto-scope.test.js`: con la tienda A en el contexto, los 7 modelos por id llevan la tienda A; `global`, sin contexto y `runUnscoped` no se tocan (A1.7)
- [x] `GET /store/categorias/:id` exige la tienda (`requireTienda`) y el auto-scope la limita (A1.8)
- [x] Revisión de los 52 `$queryRaw` (resultado en el spec); `tienda_id` agregado a los 4 `UPDATE` de ocupaciones (A1.9)
- [x] Anotado en multi-sede que S2.1, S2.2, S2.5 y S2.6 se cierran aquí
- [x] Tests del backend: 114 suites, 1562 tests OK
- [ ] **Usuario:** probar el Admin y la tienda con una tienda demo por rubro, según "Cómo probar" del issue FrontendStore#2

## Pieza 2 — Errores centralizados (Backend, nada visible)
- [x] Codemod (AST con `@babel/parser`): 243 envoltorios quitados en 42 `*.routes.js`; `next` sale del parámetro si queda sin uso (A2.1, A2.2)
- [x] Revisar a mano los `catch` que quedan: 8, todos traducen el error (webhooks que responden 200, seeds de la tienda nueva, upload); se quedan
- [x] Test del mecanismo `middlewares/__tests__/errores-async.test.js`: mismo código y estado con y sin envoltorio (404, 409, 403, P2002, P2025, 500), más fitness function que falla si vuelve el envoltorio (A2.3)
- [x] Regla en el `CLAUDE.md` del backend (A2.4)
- [x] Verificar: 0 envoltorios en rutas; tests del backend OK (115 suites, 1567 tests); los 42 archivos importan sin error
- [ ] **Usuario:** provocar errores en el Admin según "Cómo probar" del issue FrontendStore#3

## Pieza 3 — Rubro por capacidades + secciones por registro (los tres, nada visible)
- [x] Store: `cuando`, `fechasConfirmada`, `personas`, `antesDeLlegar` y `detalle` (componente por rubro) en el perfil de reserva; el seguimiento sin comparaciones de tipo (A3.1)
- [x] Admin: `LecturaReserva` (voz, servicio, ventana, fechas, personas, WhatsApp) y `detalle` en el perfil de reserva de cada rubro; `perfilDeTipoReserva`; equivalencia verificada contra la versión anterior en 252 casos (A3.2)
- [x] Backend: hook `alAceptar` en la vertical + contrato (hooks opcionales deben ser funciones); el hotel valida el cupo ahí (A3.3)
- [x] Backend: `transicionar` sin rubro por defecto; `MAQUINAS` exhaustivo y test de contrato (A3.4)
- [x] Backend: `datos.diseno.layoutPorDefecto` y `rubroEnPlantillas` en lugar de `tipoNegocio === "productos"`; las 23 plantillas idénticas (A3.5)
- [x] Fitness function anti-identidad en los tres repos, con lista de deuda que solo baja: backend `modules/negocio/__tests__/anti-identidad.test.js`; fronts `scripts/anti-identidad.mjs` antes de `ng test` (A3.6)
- [x] Admin: `META_SECCIONES` exhaustivo y `seccion-form` sin el OR de 7 tipos (A4.1, A4.2)
- [x] `perfiles.spec.ts` (Store y Admin) con tests nuevos; `uis.spec.ts` sin cambios
- [x] Tests: backend 116 suites / 1571; Store 220; Admin 168; builds de producción OK
- [ ] **Usuario:** seguimiento de una reserva por rubro, Admin › Reservas y editor de Diseño en el navegador, según "Cómo probar" del issue FrontendStore#4

## Pieza 3b — Rubro por capacidades en correos, serializer y service de reservas (Backend, nada visible)
- [x] `reservas.service.js` (11) y `reservas.pago.js` (2): `alCambiarEstado` de locales (libera la franja) y de eventos (vendidas ±1, con `anterior`); capacidad `planDePagos` vía `rubroDePedido`; `mensajeMaxAbiertas`, `notasIniciales` y `avisaAlNegocio` en la vertical
- [x] `reservas.serializer.js` (5): `DTO_POR_TIPO` + `reservas/<rubro>/dto.js`; equivalencia en 70 casos × 3 serializadores
- [x] `reservas.emails.js` (22): `CORREO_POR_TIPO` + `reservas/<rubro>/correo.js` + `correo.comun.js`; equivalencia en 468 casos; Traducciones sin cambios de sección (90 claves pasan de `correos` a su rubro)
- [x] `DEUDA` de `anti-identidad.test.js` vacía; tests de contrato de `DTO_POR_TIPO` y `CORREO_POR_TIPO`
- [x] Bug corregido: la nota inicial de una reserva confirmada al reservar (hotel o tour) decía "Entradas libres confirmadas"
- [x] Tests: 117 suites / 1582
- [ ] **Usuario:** probar según "Cómo probar" del issue FrontendStore#9

## Pieza 4 — Checkout por estrategias (Store, nada visible)
- [x] e2e de Playwright del checkout por método de envío, **antes** de tocar nada (A5.5): `FrontendStore/e2e/checkout/`, `npm run e2e`, 12 casos en verde contra el código actual (ver [cambios.md](cambios.md))
- [x] Hallazgos del e2e: montos `Decimal` a número en los servicios del checkout, sin texto interno en el recojo en tienda, courier por el nombre del método (`{courier}`), tildes; claves migradas (`en.json` + `docs/sql/antipatrones_claves_tildes.sql`); e2e 12 en verde (ver [cambios.md](cambios.md))
- [ ] **Usuario:** correr `docs/sql/antipatrones_claves_tildes.sql` en Supabase después de desplegar
- [x] `ESTRATEGIAS_ENVIO` exhaustivo para `courier`, `delivery_propio` y `recojo_tienda` (A5.1): `FrontendStore/src/app/features/checkout/envio/`, panel por `NgComponentOutlet`, 23 tests sin DOM, fitness `scripts/anti-ramas-envio.mjs` en `npm test`; e2e 12 en verde (ver [cambios.md](cambios.md))
- [x] `CheckoutStore` con signals (A5.2): `FrontendStore/src/app/features/checkout/checkout.store.ts`, provisto en el componente; textos de cotización en `envio/textos-cotizacion.ts` y comprobante en `checkout/comprobante.ts`; 17 tests sin DOM; e2e 12 en verde (ver [cambios.md](cambios.md))
- [x] Un componente por paso con su `.html` (A5.3): `FrontendStore/src/app/features/checkout/pasos/` y `components/`, página como orquestador; store partido en `checkout/estado/` (borrador, contacto, cupón, pago, envío, pedido) con `CheckoutStore` como fachada; 21 tests sin DOM; e2e 12 en verde (ver [cambios.md](cambios.md))
- [x] Revisar las ramas del pago (A5.4): `ESTRATEGIAS_PAGO` en `FrontendStore/src/app/features/checkout/pago/` (paso 2, confirmación y pie de la tienda); 0 literales de tipo de pago fuera del registro (ver [cambios.md](cambios.md))
- [x] Textos por defecto de envío y devoluciones fuera del template (A5.6): `features/product/product-page/textos-por-defecto.ts`, traducibles y con tildes; mismo ejemplo en Admin
- [x] Tests de estrategias y `CheckoutStore` sin DOM (A5.5): estrategias de pago, `PagoCheckout`, cupón, precarga con sesión y borrador corrupto
- [x] Bugs de A5.2: doble clic al crear el pedido, borrador que se volvía a guardar tras el pedido, costo de envío del WhatsApp "Coordinar"; cada uno con un test que fallaba antes
- [x] `domicilio-picker` (584 → 290) partido con `mapa-entrega.component.ts` (lógica movida, sin cambios)
- [x] Verificar: el mismo e2e pasa (12/12, con el mock de `POST /store/pedidos/cotizar`); 0 ramas por tipo de envío; ningún archivo del checkout pasa de 400 líneas (máx. 369); Karma 340; tsc y build OK
- [ ] **Usuario:** probar el checkout en el navegador, con el mapa y el GPS a mano (el e2e no los cubre)

## Pieza 5 — CRUD con Composition Root (Backend, nada visible)
- [x] `crearCrud` y `POLITICAS` (A7.1, A7.2): `kernel/crud/crear-crud.js` y `kernel/crud/politicas.js`; `adminTienda` (rol por operación, dueña real en cada `/:id`) y `vitrinaPublica` (solo lectura); fitness `kernel/crud/__tests__/composition-root.test.js` (ver [cambios.md](cambios.md))
- [x] Migrar categorías (Admin y tienda), marcas, atributos, variantes e imágenes (A7.3), uno a uno contra copias `*.tmp.js`: 201 casos con la respuesta completa y la BD iguales; copias borradas. Marcas de la tienda se queda fuera (no es un CRUD: SQL propio)
- [x] Bug de aislamiento cerrado por la política: en variantes e imágenes, un usuario de la tienda A que mandaba su tienda en la query o el body leía, editaba y borraba filas de la tienda B (20 ataques: 8 en variantes, 12 en imágenes; ver [cambios.md](cambios.md))
- [x] Verificar: mismas rutas y respuestas; tests negativos de la pieza 1 siguen OK (`auto-scope` y `alcance`, 23); test negativo por recurso, con y sin auto-scope (`modules/catalogo/__tests__/crud.test.js`); `npm test` 137 suites / 2149
- [ ] **Usuario:** probar en el Admin según "Cómo probar" del issue FrontendStore#6

## Pieza 6 — Contratos generados + núcleo compartido (los tres, nada visible)
- [ ] Decidir el mecanismo del núcleo compartido (pregunta abierta)
- [ ] Esquema Zod de salida por serializer + test (A8.1); empezar por `categoria`
- [ ] `npm run contratos` (A8.2, A8.3)
- [ ] Chequeo en CI de cada front (A8.4)
- [ ] Mover al paquete compartido `calendario.core`, `senal-envivo`, `texto-rico`, `grilla-mes` y `fechas` (A8.5)
- [ ] `grilla-mes` compartido: `PROVEEDOR_FECHAS` (Strategy por `InjectionToken`), colores por tokens y `marcarDestacados` como `input()` (A8.7)
- [ ] Migrar recurso por recurso hasta `reserva` (A8.6)
- [ ] Verificar: los dos fronts compilan contra los tipos generados; builds de Vercel OK

## Continuo — Archivos grandes y menores
- [ ] Al tocar un archivo de más de 400 líneas, partirlo por caso de uso o por componente (A6)
- [ ] `tienda-form`: `valueChanges` con `toSignal` o `takeUntilDestroyed` (A9)
- [ ] Lecturas HTTP a `httpResource` / `rxResource` al tocar cada pantalla (A9)
- [ ] `updateMany` o `Promise.all` en `resenas-reservas.js:51` y `transmisiones.envivo.js:132` (A9)
