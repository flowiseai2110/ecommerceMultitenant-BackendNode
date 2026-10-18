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
- [ ] Store: `ventana`, `permiteModificar` y `textoFechas` en el perfil de reserva; detalle por slot en el seguimiento (A3.1)
- [ ] Admin: `voz()` y `detalle()` al perfil de reserva de cada rubro (A3.2)
- [ ] Backend: hook `alAceptar` en la vertical + contrato; el hotel valida el cupo ahí (A3.3)
- [ ] Backend: `transicionar` sin rubro por defecto (A3.4)
- [ ] Backend: `datos.diseno.layoutPorDefecto` en lugar de `tipoNegocio === "productos"` (A3.5)
- [ ] Fitness function anti-identidad en los tres repos (A3.6)
- [ ] Admin: `META_SECCIONES` exhaustivo y `seccion-form` sin el OR de 7 tipos (A4.1, A4.2)
- [ ] Actualizar `perfiles.spec.ts` y `uis.spec.ts` solo si el cambio es intencional
- [ ] Verificar: seguimiento de una reserva por rubro y editor de Diseño en el navegador, iguales que antes

## Pieza 4 — Checkout por estrategias (Store, nada visible)
- [ ] e2e de Playwright del checkout por método de envío, **antes** de tocar nada (A5.5)
- [ ] `ESTRATEGIAS_ENVIO` exhaustivo para `courier`, `delivery_propio` y `recojo_tienda` (A5.1)
- [ ] `CheckoutStore` con signals (A5.2)
- [ ] Un componente por paso con su `.html` (A5.3)
- [ ] Revisar las ramas del pago (A5.4)
- [ ] Textos por defecto de envío y devoluciones fuera del template (A5.6)
- [ ] Tests de estrategias y `CheckoutStore` sin DOM (A5.5)
- [ ] Verificar: el mismo e2e pasa; 0 ramas por tipo de envío; ningún archivo del checkout pasa de 400 líneas

## Pieza 5 — CRUD con Composition Root (Backend, nada visible)
- [ ] `crearCrud` y `POLITICAS` (A7.1, A7.2)
- [ ] Migrar categorías, marcas, atributos, variantes e imágenes (A7.3)
- [ ] Verificar: mismas rutas y respuestas; tests negativos de la pieza 1 siguen OK

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
