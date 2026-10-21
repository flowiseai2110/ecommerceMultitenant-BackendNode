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

## Pieza 6 — Monorepo, contratos generados y núcleo compartido (los tres, nada visible)

> Impacto: [impacto.md](impacto.md) · Decisión: [ADR-0003](../../adr/ADR-0003-monorepo-y-contratos-generados.md).
> **[D]** = lo hace Diego a mano · **[Dev]** = el desarrollador (sesión de Claude). Nombres con la propuesta P1 (`ecompyme`); si Diego elige otro, se reemplaza en todo el plan.
> Rutas: `<eco>` = `C:/Users/diego armando/repositorios/ecommerce/`; `<mono>` = `<eco>ecompyme/`.

- [x] Decidir el mecanismo del núcleo compartido: monorepo + patrones estratégicos de DDD (Diego, 2026-10-20)

### Antes de 6a (requisitos)
- [ ] **[D]** Responder P1 (nombre), P2 (puerto del Admin) y P3 (ramas locales `worktree-*`) de [impacto.md](impacto.md)
- [ ] **[D]** FrontendAdmin limpio: commitear (o descartar) los cambios de campañas/promoción de la otra sesión (`campana.model.ts`, `pages/campanas/**`, `pages/diseno/campana-*`, `negocio/*/perfil.ts`…). Los tres repos con `git status --short` vacío y `git push` hecho
- [ ] **[D]** Producción = `main` en los tres. Anotar aquí el commit en línea hoy, que es el destino de la reversa:
  - Vercel Tienda → Deployments → el "Current" → commit: `_______`
  - Vercel Admin → Deployments → el "Current" → commit: `_______`
  - Railway → servicio → Deployments → el activo → commit: `_______`
  - Si `main` tiene commits sin desplegar, desplegarlos antes con su propio proceso (SQL `precio_en_servidor.sql` antes de su backend, campañas-descuento en su orden), o esperar. **La reconexión despliega el último `main`.**
- [ ] **[D]** Railway → servicio → Settings, y anotar: Builder (Railpack / Nixpacks) `_______`, Root Directory `_______`, Build / Start command `_______`, Healthcheck Path `_______`; y del log del último build, la versión de Node `_______`
- [ ] **[Dev]** Línea base en los repos viejos, anotada en `cambios.md`: `npm test` del backend (suites y tests), `npx tsc --noEmit -p tsconfig.app.json` + `npm test -- --watch=false` de la Tienda y del Admin (tests SUCCESS), `npm run e2e` de la Tienda, `ng build --configuration production` de los dos fronts, y capturas de la portada de `zapatillas`, `killa-hostal`, `tour-test` y `los-cedros` (390 y 1440 px) y del login y Dashboard del Admin
- [ ] **[Dev]** `pip install git-filter-repo` (el Python de miniconda está en el PATH); `git filter-repo --version` responde
- [ ] **[D]** Desde aquí hasta 6a.6, ninguna sesión de Claude trabaja en los repos viejos

### Pieza 6a.1 — Monorepo en el disco, sin cambiar código (local, nada visible)
- [ ] T6a.1.1 **[Dev]** Clonar limpio cada repo en el scratch (`git clone --no-local <eco>ecommerceMultitenant-<Repo> <scratch>/<app>`) y reescribirlo en su carpeta: `git -C <scratch>/<app> filter-repo --to-subdirectory-filter apps/<app>` (BackendNode → `backend`, FrontendStore → `tienda`, FrontendAdmin → `admin`). Guardar `<scratch>/<app>/.git/filter-repo/commit-map`
- [ ] T6a.1.2 **[Dev]** `git init -b main <mono>`; `git -C <mono> pull <scratch>/backend main`; `git -C <mono> pull --allow-unrelated-histories --no-edit <scratch>/tienda main`; ídem `admin`
- [ ] T6a.1.3 **[Dev]** Verificar la importación: `git -C <mono> rev-parse HEAD:apps/<app>` = `git -C <eco>ecommerceMultitenant-<Repo> rev-parse HEAD^{tree}` (las tres); número de commits = 104 + 119 + 85 + 2 merges; `git log --oneline -- apps/tienda/src/server.ts` igual de largo que `git log -- src/server.ts` en el repo viejo
- [ ] T6a.1.4 **[Dev]** Raíz (`<mono>`):
  - `package.json`: `name` `ecompyme`, `private`, `workspaces: ["apps/*", "paquetes/*"]` y los scripts de la tabla "Local" de impacto.md, con devDependency `concurrently`. Sin `engines` (Railpack lo leería)
  - `.gitignore`: `node_modules/`, `dist/`, `.env*` (con `!.env.example`), `.angular/`, `.claude/worktrees/`, `.claude/settings.local.json`
  - `README.md`; `docs/historial/commit-map-{backend,tienda,admin}.txt`
  - Commit "monorepo: raíz del workspace"
- [ ] T6a.1.5 **[Dev]** Lockfile único: borrar `apps/*/package-lock.json` y correr `npm install` en la raíz. Comparar la versión resuelta de cada **dependencia directa** de cada app con su lockfile viejo (script en el scratch; tabla en `cambios.md`). Fijar exacta en el `package.json` de la app la que cambie de minor o de major (se espera Tailwind / `@tailwindcss/postcss` 4.1.18 en la Tienda). Repetir hasta que las directas coincidan
- [ ] T6a.1.6 **[Dev]** Ajustes que exige el workspace (y solo esos):
  - `apps/backend/package.json` `test` → `node --experimental-vm-modules scripts/jest.mjs`; `apps/backend/scripts/jest.mjs` resuelve `jest/bin/jest.js` con `createRequire` (H4)
  - `apps/tienda/package.json` `claves` → `--backend ../backend`
  - `apps/tienda/vercel.json` `installCommand` → `cd ../.. && npm ci -w apps/tienda`; `apps/admin/vercel.json` agrega `"installCommand": "cd ../.. && npm ci -w apps/admin"`
- [ ] T6a.1.7 **[Dev]** Copiar los ignorados: `apps/backend/.env`, `apps/backend/.env_tests`, `apps/backend/load-tests/.env.local` y `apps/tienda/.env` (desde los repos viejos)
- [ ] T6a.1.8 **[Dev]** Simular las plataformas en un clon fresco del monorepo (scratch):
  - Vercel: `cd apps/tienda && cd ../.. && npm ci -w apps/tienda`. En el log **no** corre `prisma generate`. Luego `cd apps/tienda && API_BASE_URL=https://ejemplo node scripts/generate-env.js && npm run build` OK. Ídem el Admin con `npm run build -- --configuration=production`
  - Railway: `npm ci -w apps/backend` (corre `prisma generate`), y `npm run start -w apps/backend` con el `.env` → `GET /api/v1/health` 200
- [ ] Tests: `npm test` en la raíz da **los mismos números** que la línea base. `npm run e2e` 12/12 (o lo que diga la línea base). Builds de producción OK. Capturas iguales a las de la línea base
- [ ] Verificar: `npm run dev` levanta backend :3000, Tienda :4200 y Admin :4300 (P2), y la tienda demo abre igual que hoy

### Pieza 6a.2 — Docs, herramientas y Claude Code en el monorepo (local, nada visible)
- [ ] T6a.2.1 **[Dev]** `git mv apps/backend/docs docs`, `git mv apps/backend/herramientas herramientas` y `git mv apps/backend/.github .github`. `arquitectura.yml` queda igual (`docs/arquitectura/**`)
- [ ] T6a.2.2 **[Dev]** Arreglar los 22 enlaces relativos de docs a código (`../../../modules/…` → `../../../apps/backend/modules/…`, también `middlewares/`, `services/`, `kernel/`, `server.js`). Revisar con un script de enlaces (scratch): 0 enlaces rotos en `docs/`
- [ ] T6a.2.3 **[Dev]** Rutas en los docs vivos: `docs/proceso/*`, `docs/ARQUITECTURA.md`, `docs/ESTADO.md`, `docs/rubros/*` y las `spec.md`, `impacto.md` y `tasks.md` de lo abierto en ESTADO ("BackendNode `docs/…`" → "`docs/…`", "FrontendStore/" → "apps/tienda/", "FrontendAdmin/" → "apps/admin/", "BackendNode/" → "apps/backend/"). Los `cambios.md` y `qa.md` cerrados no se tocan
- [ ] T6a.2.4 **[Dev]** `CLAUDE.md` en la raíz: estructura, comandos, proceso (`docs/proceso/README.md`), y el glosario "BackendNode = `apps/backend`, FrontendStore = `apps/tienda`, FrontendAdmin = `apps/admin`, issue `FrontendStore#N` = `ecompyme#N`". En los tres `apps/*/CLAUDE.md`, solo las rutas
- [ ] T6a.2.5 **[Dev]** Plugin (`herramientas/claude-plugin/ecommerce-proceso/`), siguiendo `recetas/plugin.md`:
  - `hooks/reglas.ts`: la "raíz" es `apps/<app>` o `paquetes/<p>`, el SQL de despliegue es `docs/sql/*.sql` de la raíz, y una ruta dentro de `.claude/worktrees/<n>/` se evalúa como si estuviera en la raíz (hoy `FUERA_DEL_CODIGO` excluye `.claude/`)
  - `register.ts`: la coordinación carga si la sesión está en la raíz del monorepo (existe `apps/backend`)
  - `register.test.ts`: casos para `apps/*`, `paquetes/*`, `docs/sql`, el `.env.example` por app y un worktree
  - `coordinacion.md`, los 13 `agents/*.md`, `skills/recetas/{SKILL,local,pruebas,commit,plugin,estado}.md` y `README.md`: un repo con tres apps. En `commit.md`: un commit por pieza que abarca todas las apps (atómico), no uno por repo
  - Receta nueva `skills/recetas/paralelo.md` (sección "Sesiones de Claude en paralelo" de impacto.md) y su fila en `SKILL.md`
  - `.claude-plugin/plugin.json` → `0.4.0`
- [ ] T6a.2.6 **[Dev]** `.claude/settings.json` de la raíz (`"worktree": { "baseRef": "head" }`) y `.worktreeinclude` (`apps/backend/.env`, `apps/backend/.env_tests`, `apps/tienda/.env`). `.claude/skills/{frontend-design,senior-frontend}` en la raíz (una copia), borradas de `apps/tienda/.claude/` y `apps/admin/.claude/`
- [ ] T6a.2.7 **[Dev]** Memorias: copiar los 85 temas de `~/.claude/projects/c--Users-diego-armando-repositorios-ecommerce-ecommerceMultitenant-{BackendNode,FrontendAdmin,FrontendStore}/memory/` a `~/.claude/projects/c--Users-diego-armando-repositorios-ecommerce-ecompyme/memory/`, y unir los tres `MEMORY.md` en uno (sin entradas repetidas; menos de 200 líneas). Las carpetas viejas no se tocan
- [ ] T6a.2.8 **[D]** En tu Claude Code (configuración de usuario; un agente no la cambia):
  1. `claude plugin marketplace remove ecommerce-local`
  2. `claude plugin marketplace add "<mono>herramientas/claude-plugin"`
  3. `claude plugin install ecommerce-proceso@ecommerce-local`
  4. En `~/.claude/settings.json` → `permissions.additionalDirectories`: cambiar las tres rutas `…\ecommerceMultitenant-*` por `<mono>`
  5. Usar el `claude` de la extensión de VS Code (receta `plugin.md`)
- [ ] Tests: `bash herramientas/claude-plugin/verificar.sh` OK; `npm test` de la raíz igual que en 6a.1
- [ ] Verificar: abrir Claude Code en `<mono>`. Carga la coordinación (tiene que verse el bloque "Ecommerce multi-tenant: cómo se trabaja"), `/memory` muestra el índice unido, e intentar editar un `docs/disenos/<x>/v1-…` se bloquea

### Pieza 6a.3 — GitHub (nada visible)
- [ ] **[D]** github.com/new → Owner `flowiseai2110`, nombre `ecompyme`, **Private**, sin README, sin `.gitignore` ni licencia → Create
- [ ] **[Dev]** (con tu permiso para el push) `git -C <mono> remote add origin https://github.com/flowiseai2110/ecompyme.git` y `git -C <mono> push -u origin main`
- [ ] **[Dev]** Respaldo del tablero: `gh project item-list 1 --owner @me --format json --limit 100 > docs/historial/tablero-AAAA-MM-DD.json` (commit)
- [ ] **[D]** Transferir las issues **en orden**, antes de crear cualquier otra issue en el repo nuevo:
  1. `gh issue transfer 1 flowiseai2110/ecompyme -R flowiseai2110/ecommerceMultitenant-FrontendStore`
  2. Revisar: quedó como #1, sigue en el tablero "Ecommerce Saas" con Status, Rubro y Spec, y conserva sus comentarios
  3. Repetir con 2, 3, … 9, una por una. Después de la #2, revisar que sigue como sub-issue de #1
  4. Si una salió del tablero: `gh project item-add 1 --owner @me --url https://github.com/flowiseai2110/ecompyme/issues/<n>` y volver a poner sus campos desde el respaldo. Si perdió el vínculo de sub-issue, se vuelve a agregar en la issue #1 (Sub-issues → Add existing)
- [ ] **[D o Dev]** Tablero: en las 9, el campo "Spec" `BackendNode/docs/specs/antipatrones` → `docs/specs/antipatrones`
- [ ] **[D]** Acceso de las apps: github.com/settings/installations → **Vercel** → Configure → Repository access. Si dice "Only select repositories", agregar `ecompyme` → Save. Ídem **Railway**
- [ ] **[D]** Repo nuevo → Actions → "arquitectura" → Run workflow (rama `main`) → termina en verde
- [ ] Verificar: en GitHub, `apps/tienda/src/server.ts` → History muestra los commits viejos; las 9 issues tienen su número y están en el tablero

### Pieza 6a.4 — Vercel: Admin (nada visible)
- [ ] **[D]** Proyecto del Admin → Settings → **Git** → Connected Git Repository → **Disconnect** → **Connect Git Repository** → `flowiseai2110/ecompyme`. Production Branch: `main`
- [ ] **[D]** Settings → **Build and Deployment** → Root Directory → Edit → `apps/admin` → Save. En la misma sección: "Include files outside the root directory in the Build Step" → **Enabled**; "Skip deployments when there are no changes to the root directory or its dependencies" → **Enabled**
- [ ] **[D]** Misma página: Framework Preset "Other". Build Command, Output Directory e Install Command **sin override** (salen de `apps/admin/vercel.json`). Si hoy alguno tiene override, anotarlo antes de quitarlo. Node.js Version: no tocar
- [ ] **[D]** Environment Variables y Domains: **no tocar**
- [ ] **[D]** Deployments → menú ⋯ junto al título → **Create Deployment** → `main` → Create
- [ ] **[D]** En el log del build: instala con `npm ci -w apps/admin`, no aparece `prisma generate` y termina en "Ready"
- [ ] Verificar: el dominio del Admin abre, entras con tu usuario, ves el Dashboard y Productos de `zapatillas` y la bandeja de Reservas de `killa-hostal`, igual que antes. **Si algo falla:** Deployments → el despliegue anterior → ⋯ → **Instant Rollback**; y Settings → Git → reconectar `ecommerceMultitenant-FrontendAdmin` y vaciar el Root Directory

### Pieza 6a.5 — Vercel: Tienda, primero en espera (nada visible)
- [ ] **[D]** Proyecto `ecommerce-multitenant-frontend-store` → Settings → **Environments** → Production → Branch Tracking → "Auto-assign Custom Production Domains" → **Off** → Save
- [ ] **[D]** Settings → **Git** → Disconnect → Connect `flowiseai2110/ecompyme`, rama `main`
- [ ] **[D]** Settings → **Build and Deployment** → Root Directory `apps/tienda` → Save; "Include files outside the root directory…" **Enabled**; "Skip deployments…" **Enabled**; sin overrides de Build, Output e Install (salen de `apps/tienda/vercel.json`); variables (`API_BASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ADMIN_ORIGINS`, `SSR_API_KEY`…) y dominios **sin tocar**
- [ ] **[D]** Deployments → ⋯ → **Create Deployment** → `main`. Queda en "Ready" sin el dominio (staged)
- [ ] **[D]** Abrir la URL de ese despliegue con la tienda en la ruta: `https://<despliegue>.vercel.app/zapatillas` y `…/killa-hostal`. En `*.vercel.app` no hay subdominio y la Tienda toma el slug de la ruta (`core/utils/subdomain.util.ts`). Revisar que abre la portada (SSR, sin error 500 en Logs → Functions), una ficha de producto, el checkout hasta el resumen y una reserva de `killa-hostal`. Si la función falla con "no such file … dist/pc.ng.storefront/server" (H6), **no promover**: avisar al desarrollador (se corrige la ruta en `src/server.ts` y se vuelve a crear el despliegue)
- [ ] **[D]** Si está bien: ⋯ del despliegue → **Promote to Production** (no vuelve a construir). Después, volver a poner "Auto-assign Custom Production Domains" → **On**
- [ ] Verificar: `zapatillas.ecompyme.com` (y una tienda de cada rubro) se ve igual que en las capturas de la línea base; `GET /api/v1/health` por el rewrite de la Tienda responde 200. **Si algo falla después de promover:** Instant Rollback al despliegue anterior y reconectar `ecommerceMultitenant-FrontendStore` con el Root Directory vacío

### Pieza 6a.6 — Railway: backend (nada visible)
- [ ] **[D]** Si no tiene: Settings → Deploy → **Healthcheck Path** `/api/v1/health` → Deploy (todavía desde el repo viejo: prueba que el health responde con el código de hoy)
- [ ] **[D]** Variables → agregar:
  - Railpack: `RAILPACK_NODE_VERSION` = la versión anotada en los requisitos (p. ej. `22`), y `RAILPACK_NODE_NPM_INSTALL` = `npm ci -w apps/backend`
  - Nixpacks: `NIXPACKS_NODE_VERSION` y `NIXPACKS_INSTALL_CMD` con los mismos valores
  - Railway muestra los cambios en espera: **todavía no aplicar**
- [ ] **[D]** Settings → **Source** → Disconnect → Connect Repo `flowiseai2110/ecompyme`, rama `main`
- [ ] **[D]** Settings → **Root Directory**: vacío (`/`). **No** `apps/backend` (H2)
- [ ] **[D]** Settings → Deploy → **Custom Start Command** `npm run start -w apps/backend`. Build Command: vacío
- [ ] **[D]** Settings → **Watch Paths**: `/apps/backend/**`, `/package.json`, `/package-lock.json`
- [ ] **[D]** Aplicar los cambios (**Deploy**). En el log: la versión de Node es la misma de antes, se instala solo el backend, corre `prisma generate` y pasa el healthcheck → Active
- [ ] Verificar: `curl https://ecommercemultitenant-backendnode-production-2ba3.up.railway.app/api/v1/health` → 200; en la Tienda y en el Admin de producción: login, catálogo, una reserva demo y una búsqueda. **Si el healthcheck falla:** el despliegue anterior sigue activo; volver a Source → repo viejo, vaciar el Start Command y los Watch Paths. **Si falla después:** Deployments → el anterior → ⋯ → **Rollback** (restaura la imagen y las variables)

### Pieza 6a.7 — Cierre de la mudanza (una semana después, sin incidentes)
- [ ] **[Dev]** Commit vacío en `docs/` para comprobar los saltos: ni Railway ni (con la opción integrada) los fronts deberían reconstruir por un cambio de backend; un cambio en `apps/admin/` construye solo el Admin
- [ ] **[D]** GitHub → `ecommerceMultitenant-BackendNode` → Settings → General → Danger Zone → **Change visibility → Private**. Después, en los tres viejos: **Archive this repository**
- [ ] **[D]** Renombrar (no borrar) las carpetas locales viejas a `<eco>_archivo-ecommerceMultitenant-*`
- [ ] **[Dev]** Tag `prod-AAAA-MM-DD` en el monorepo; comentario de avance en la issue #7; ESTADO
- [ ] Verificar: un cambio de prueba de una línea en `apps/admin` llega a producción del Admin y no dispara la Tienda ni Railway

### Receta de un recurso (se repite en 6b, 6e, 6f, 6g y 6h)
Para cada recurso `<r>` (p. ej. `categoria`), en un solo commit atómico:
1. **Backend** `modules/<contexto>/<r>.contrato.js`: un esquema de salida por audiencia (`zod/v4`, `.strict()`, `.meta({ id: '<R>Tienda' | '<R>Admin' })`) con la forma que viaja por la red (Decimal y fechas como texto) y filas de ejemplo con y sin `null`. Entrada en `CONTRATOS`. Si el endpoint no tiene serializer: primero el serializer, con un test de equivalencia (misma respuesta que hoy, campo por campo)
2. `npm run contratos` → `paquetes/contratos/src/{tienda,admin}/<r>.ts`
3. **Cada front:** el servicio de data-access recibe `Sobre<…>` / `Listado<…>` con el DTO de su audiencia y lo pasa por `<r>DesdeApi` (`<r>.desde-api.ts`, junto al servicio). `models/<r>.model.ts` queda solo con el modelo de pantalla. Si había un `…DesdeApi` en `models/`, se muda
4. Bajar la línea base: el serializer sale de `DEUDA` y las violaciones de `dependency-cruiser` de ese recurso salen de `conocidas.json`
5. Probar: `npm test` (raíz) en verde, `tsc` de los dos fronts y la pantalla del recurso en el navegador con una tienda demo por rubro que lo use

### Pieza 6b — Contratos generados: mecanismo + `categoria` (los tres, nada visible)
- [ ] T6b.1 **[Dev]** `paquetes/contratos/`: `package.json` (`@ecompyme/contratos`, `private`, `exports` `./tienda/*`, `./admin/*` y `./comun/*` → `./src/…/*.ts`, sin dependencias), `README.md` ("lo genera el backend; no editar salvo `comun/sobre.ts`") y `src/comun/sobre.ts` (`Sobre<T>`, `Listado<T>` con `Meta` generado)
- [ ] T6b.2 **[Dev]** Backend: `kernel/contratos/registro.js` (`CONTRATOS`: id, esquema, serializer, audiencia, archivo) y `utils/apiResponse.contrato.js` (esquema de `Meta` del `GenericService`: `total`, `page`, `limit`, `totalPages`, `hasNextPage`, `hasPrevPage`, `proximoCambioPrecio`)
- [ ] T6b.3 **[Dev]** `apps/backend/scripts/contratos.mjs`: `z.toJSONSchema` → `json-schema-to-typescript` (`bannerComment` "GENERADO por apps/backend/scripts/contratos.mjs. No editar", `additionalProperties: false`) → `paquetes/contratos/src/<audiencia>/<archivo>.ts`. `--check` sin escribir. Scripts: `contratos` en el backend y en la raíz. devDependency `json-schema-to-typescript@16`
- [ ] T6b.4 **[Dev]** `kernel/contratos/__tests__/contratos.test.js`: (a) cada serializer de `CONTRATOS`, con sus filas de ejemplo, pasado por JSON, cumple su esquema estricto; (b) todo `export function serialize*` de `modules/**/*.serializer.js` está en `CONTRATOS` o en `DEUDA` (arranca con todos menos categoría; solo baja); (c) `contratos --check` limpio. Probado que falla: quitar `codigo` del esquema admin y quitar el serializer de categoría del registro
- [ ] T6b.5 **[Dev]** `categoria` con la receta: `modules/catalogo/categorias.contrato.js` (`CategoriaTienda` sin auditoría; `CategoriaAdmin` con `codigo` y auditoría). Tienda: `features/category/services/` y `features/store/services/store.service.ts` reciben `CategoriaTienda` y mapean con `categoriaDesdeApi`; el árbol `subcategorias` sigue en el modelo de pantalla. Admin: `services/categorias.service.ts` con `CategoriaAdmin`; `Categoria` del Admin conserva `productosCount` y `categoriaPadre` como campos de pantalla. Los dos: `tsconfig.json` `paths` (`@ecompyme/contratos/*` → `../../paquetes/contratos/src/*`) y `"@ecompyme/contratos": "*"` en `package.json`
- [ ] T6b.6 **[Dev]** `.github/workflows/ci.yml`: en push y PR a `main`, `npm ci`; backend `npm test` (incluye `--check`); fronts `tsc --noEmit -p tsconfig.app.json` y Karma con `--watch=false --browsers=ChromeHeadless`. Filtros de rutas: un cambio solo en `docs/` no corre tests (A8.4)
- [ ] T6b.7 **[Dev]** Docs: `docs/ARQUITECTURA.md` ("Contratos en las fronteras": el esquema de salida es contrato y genera los tipos), receta `herramientas/claude-plugin/ecommerce-proceso/skills/recetas/contrato.md` (la "Receta de un recurso") y, si Diego aprueba, los patrones "Lenguaje publicado / contratos generados" y "Capa anticorrupción" en `docs/proceso/patrones.md`
- [ ] Tests: `npm test` de la raíz; CI en verde en GitHub; builds de los dos fronts
- [ ] Verificar: la página de una categoría en `zapatillas` y Admin › Categorías se ven igual. Prueba de que sirve: si se cambia un campo del esquema sin regenerar, `npm test` falla; y al regenerar, `tsc` del front falla en `categoriaDesdeApi`, no en una plantilla

### Pieza 6c — Reglas de dependencia (fronts + paquetes, nada visible)
- [ ] T6c.1 **[Dev]** `dependency-cruiser@18` en la raíz; `herramientas/fitness/dependencias.cjs` con la tabla de tipos de A8.9 por app (Tienda con `apps/tienda/tsconfig.app.json`, Admin con el suyo) y las reglas: app ↛ otra app; paquete ↛ app; contratos solo desde data-access; cada front, solo su audiencia; `ui` ↛ `data-access` / `feature`; `util` solo `util`; `compartido` ↛ contratos
- [ ] T6c.2 **[Dev]** Línea base: `depcruise-baseline` → `herramientas/fitness/conocidas.json`, con el número de violaciones por regla y app anotado en `cambios.md`. Scripts `fitness`, `fitness:tienda` y `fitness:admin` en la raíz (`--ignore-known`), dentro de `npm test` de la raíz y en CI
- [ ] T6c.3 **[Dev]** Anti-identidad de app en `paquetes/`: `esAdmin`, `esTienda` y `app ===` fallan (extender o reusar `scripts/anti-identidad.mjs`)
- [ ] T6c.4 **[Dev]** `CLAUDE.md` de los dos fronts: la tabla de tipos y "el DTO solo lo ve data-access". Si Diego aprueba, el patrón "Tipos de librería con reglas de dependencia" en `patrones.md`
- [ ] Tests: `npm run fitness` pasa con la línea base, y falla si un componente importa `@ecompyme/contratos/…` (probado y revertido)
- [ ] Verificar: Diego ve en `cambios.md` cuántas violaciones hay hoy por regla: ese número solo puede bajar

### Pieza 6d — Núcleo compartido (fronts + paquetes, nada visible)
- [ ] T6d.1 **[Dev]** `paquetes/compartido/`: `package.json` (`@ecompyme/compartido`, `private`, peer `@angular/core` y `marked`). `paths` y dependencia `"*"` en los dos fronts. `@source "../../../paquetes/compartido/src";` en `apps/{tienda,admin}/src/styles.css`
- [ ] T6d.2 **[Dev]** Mover tal cual (`git mv` desde la Tienda; borrar la copia del Admin; actualizar los imports, unos 48 archivos): `calendario.core.ts` (+spec), `senal-envivo.ts` (+spec), `texto-rico.ts` (+spec; la copia del Admin solo difiere en un comentario)
- [ ] T6d.3 **[Dev]** Specs del núcleo: correrlos en el Karma de la Tienda (opción `include` del builder con `../../paquetes/compartido/src/**/*.spec.ts`). **Primero comprobar que el builder acepta la ruta.** Si no la acepta, plan B: los specs viven en `apps/tienda/src/app/compartido.spec/` e importan desde `@ecompyme/compartido`
- [ ] T6d.4 **[Dev]** `grilla-mes` compartido (A8.7):
  - `PROVEEDOR_FECHAS` (`InjectionToken<{ inicialesDias(): string[]; fechaLarga(f: string): string }>`): la Tienda lo provee en `app.config.ts` desde `core/i18n/fechas.ts`, y el Admin desde `shared/calendario/fechas.ts` (los dos `fechas.ts` se quedan en su app)
  - Colores por tokens `primary` / `primary-tint`: el Admin los define en su `@theme` con los valores de hoy (`blue-600` / `blue-50`)
  - `marcarDestacados` y la marca de campaña (`etiquetaCampana`) como `input()`, apagados por defecto
  - Sin `if` por app
- [ ] T6d.5 **[Dev]** Si Diego aprueba, la variante "Strategy por app (`InjectionToken`)" en `patrones.md`
- [ ] Tests: Karma de los dos fronts con el mismo número de tests (los specs repetidos pasan a correr una vez); `perfiles.spec.ts` y `uis.spec.ts` sin cambios; fitness sin violaciones nuevas
- [ ] Verificar: el selector de fechas se ve y funciona igual que en las capturas de la línea base: en la Tienda, una reserva de `killa-hostal`, de `tour-test` y de `los-cedros` (con una campaña activa, se ven los rombos); en el Admin, la Recepción o la bandeja de reservas con el calendario

### Pieza 6e — Contratos del catálogo (los tres, nada visible)
- [ ] Receta de un recurso para `marca`, `producto-atributo`, `producto-variante`, `producto-imagen` y `producto` (ya tienen serializer; `productos.serializer.js` es el más grande: va último)
- [ ] Verificar: catálogo, ficha de producto y carrito en `zapatillas`; Admin › Productos (crear y editar una variante e imagen); 0 de estos serializers en `DEUDA`

### Pieza 6f — Recursos sin serializer (los tres, nada visible)
- [ ] Serializer + test de equivalencia + receta para `tienda` (`GET /store/tiendas`: con `diseno`, `comunicados` e `idiomasDisponibles`; `envioGratisMinimo` como texto → número en `tiendaDesdeApi`), `metodo-envio`, `metodo-pago`, `cupon` y `pedido` (los fixtures del e2e del checkout ya tienen la forma de hoy)
- [ ] Verificar: `npm run e2e` 12/12 sin tocar los fixtures (si un fixture cambia, el contrato cambió: se para y se revisa); checkout completo en el navegador con mapa y GPS

### Pieza 6g — Resto de recursos (los tres, nada visible)
- [ ] Receta para `live`, `libro-reclamaciones`, `agente`, `diseno`, `comunicado`, `resena`, `transmision`, `video` y `cuenta` (los que no tienen serializer lo ganan con su test de equivalencia)
- [ ] Verificar: la pantalla de cada uno en el navegador; `DEUDA` solo con `reserva`

### Pieza 6h — `reserva` (los tres, nada visible)
- [ ] Contrato de los tres serializers de reservas (`reservas.serializer.js` con `DTO_POR_TIPO`): una unión discriminada por `tipo` (un esquema por rubro en `reservas/<rubro>/dto.contrato.js`), registrada como el resto
- [ ] Tienda y Admin: `reservaDesdeApi` por rubro desde el perfil de reserva (`perfilDeTipoReserva`), sin `if` por tipo
- [ ] Verificar: seguimiento de una reserva de cada rubro en la Tienda y Admin › Reservas con una tienda demo por rubro; `DEUDA` vacía; la medida "Archivos con el mismo nombre en Store y Admin" de la línea base vuelve a medirse y se anota

### Cierre de la pieza 6
- [ ] **[Dev]** ADR-0003 → "aceptada"; la fila de antipatrones en ESTADO; comentario de cierre en la issue #7
- [ ] **[D]** Probar según "Cómo probar" de la issue #7

## Continuo — Archivos grandes y menores
- [ ] Al tocar un archivo de más de 400 líneas, partirlo por caso de uso o por componente (A6)
- [ ] `tienda-form`: `valueChanges` con `toSignal` o `takeUntilDestroyed` (A9)
- [ ] Lecturas HTTP a `httpResource` / `rxResource` al tocar cada pantalla (A9)
- [ ] `updateMany` o `Promise.all` en `resenas-reservas.js:51` y `transmisiones.envivo.js:132` (A9)
