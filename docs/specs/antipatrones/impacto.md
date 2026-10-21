# Impacto: antipatrones, pieza 6 (monorepo, contratos generados y núcleo compartido)

> Spec: [spec.md](spec.md) (A8) · Decisión: [ADR-0003](../../adr/ADR-0003-monorepo-y-contratos-generados.md) · Tareas: [tasks.md](tasks.md) · Estado: **planificado, por aprobar** (2026-10-20)
> Sin diseño: la pieza no cambia nada visible.

## Resumen en una frase

Los tres proyectos (backend, tienda y panel) pasan a vivir en una sola carpeta con su historia completa, siguen publicándose en los mismos sitios con las mismas direcciones, y después el backend "dicta" la forma de sus datos para que la tienda y el panel no puedan quedar desfasados sin que alguien se entere.

## Hallazgos que cambian el plan (verificados en el código y en las plataformas)

| # | Hallazgo | Dónde | Qué cambia |
|---|---|---|---|
| H1 | **El nombre `ecommerceMultitenant` ya está ocupado**: es la landing (React + Vite), con repo en GitHub y proyecto de Vercel `ecommerce-multitenant`. La carpeta local también existe, y su clave de memoria de Claude (`c--…-ecommerce-ecommerceMultitenant`) también. | `C:/Users/diego armando/repositorios/ecommerce/ecommerceMultitenant/` (`.vercel/project.json`, `origin` = `flowiseai2110/ecommerceMultitenant`) | El monorepo necesita otro nombre. Propuesta: `ecompyme`, el dominio del producto (pregunta P1). La landing queda fuera por ahora. |
| H2 | **Railway con Root Directory no ve la raíz:** "Railway will only pull down files from that directory". Con npm workspaces hay un solo `package-lock.json`, en la raíz. | docs.railway.com/deployments/monorepo | El servicio se construye **desde la raíz** (Root Directory `/`), con comando de inicio `npm run start -w apps/backend` y Watch Paths. No con Root Directory `apps/backend`, como estaba propuesto. |
| H3 | **El `postinstall` del backend (`prisma generate`) correría en Vercel** si los fronts instalan todo el workspace. `prisma.config.ts` lee `env("DATABASE_URL")`, que en Vercel no existe. | `BackendNode/package.json` (`postinstall`), `prisma.config.ts` | Cada front instala solo lo suyo: `npm ci -w apps/<app>` (la instalación filtrada que documenta Vercel). |
| H4 | **El `test` del backend llama a jest por ruta:** `node --experimental-vm-modules node_modules/jest/bin/jest.js`. Con workspaces, jest queda en el `node_modules` de la raíz y esa ruta deja de existir. | `BackendNode/package.json` (`scripts.test`) | Único ajuste de script en el backend: un `scripts/jest.mjs` que resuelve jest con `require.resolve`. |
| H5 | **Los hooks del plugin reconocen los repos por nombre de carpeta** (`/ecommerceMultitenant-(BackendNode\|FrontendAdmin\|FrontendStore)/`). En el monorepo dejarían de funcionar **sin avisar**: no bloquearían la edición de diseños aprobados, no avisarían de llaves nuevas ni pedirían la bitácora, y la coordinación no se cargaría. | `herramientas/claude-plugin/ecommerce-proceso/hooks/reglas.ts` (`REPOS`), `register.ts` (`leerCoordinacion`), `register.test.ts` | Hay que actualizar el plugin antes de trabajar en el monorepo (6a.2). |
| H6 | **El SSR de la Tienda arma rutas con `process.cwd()` en Vercel:** `join(process.cwd(), 'dist', 'pc.ng.storefront', 'server')`. En un monorepo, la carpeta de trabajo de la función puede ser otra. | `FrontendStore/src/server.ts:11-12` | La Tienda se reconecta con un despliegue de producción **en espera**, sin dominio. Se prueba en su URL y recién entonces se promueve (6a.5). Si falla, se corrige la ruta con un cambio chico. |
| H7 | **Los puertos locales no están fijados:** ninguno de los dos `angular.json` tiene `port`, así que los dos usan 4200. En la práctica, el Admin corre en **4300** (receta `local.md`, permisos `localhost:4300`), no en 4201. | `angular.json` (serve) de los dos fronts, `recetas/local.md` | `npm run dev` levanta backend :3000, Tienda :4200 y Admin :4300. Si Diego prefiere 4201, se revisan antes las URL de redirección de Supabase (pregunta P2). |
| H8 | **`fechas.ts` no es igual entre los fronts:** el de la Tienda (107 líneas) usa el diccionario de idiomas y el del Admin (26 líneas) usa `Intl`. | `FrontendStore/src/app/core/i18n/fechas.ts`, `FrontendAdmin/src/app/shared/calendario/fechas.ts` | `fechas.ts` no va al núcleo: es la implementación de `PROVEEDOR_FECHAS` de cada app (spec A8.5, corregida). |
| H9 | **163 paquetes de primer nivel tienen versión distinta entre los tres lockfiles.** Entre las dependencias directas: Tailwind 4.1.18 (Tienda) contra 4.3.3 (Admin), `@supabase/supabase-js` 2.117 / 2.93 / 2.91 y `express` 4 (SSR de la Tienda) contra 5 (backend). | los tres `package-lock.json` (v3) | Al unirlos, npm resuelve de nuevo. Se comparan las directas antes y después, y se fijan exactas las que cambien (6a.1). |
| H10 | **BackendNode es público** y los fronts son privados. | GitHub | El monorepo es privado, y BackendNode se hace privado al archivarlo. Costo: Actions en un repo privado tiene minutos limitados. |
| H11 | **Sin secrets, variables ni webhooks** en los tres repos. Vercel y Railway entran por sus GitHub Apps. La única Action es `arquitectura.yml` (backend, `docs/arquitectura/**`). | `gh secret list`, `gh variable list`, `.../hooks` (los tres vacíos) | No hay secrets que copiar. Hay que darle a las GitHub Apps de Vercel y Railway acceso al repo nuevo. |
| H12 | Las **9 issues** de antipatrones (#1, y #2–#9 como sub-issues) viven en FrontendStore y están en el tablero "Ecommerce Saas" (proyecto 1, campos Status, Rubro y Spec). Un repo archivado deja sus issues en solo lectura, y Diego comenta el avance en cada una. | `gh issue list`, `gh project item-list 1` | Se transfieren las 9, en orden #1→#9, para que conserven el número. |
| H13 | **Config as Code de Railway (`railway.json`) está obsoleto**: deja de leerse el 2026-12-01 y lo reemplaza Infrastructure as Code (`.railway/railway.ts`). Hoy no hay `railway.json`, `nixpacks.toml` ni `Procfile`. | docs.railway.com/reference/config-as-code | La configuración de Railway va en el panel, como hoy. No se agrega un `railway.json`. |
| H14 | `scripts/claves-servidor.mjs` **no cruza repos**: escribe dentro del backend. Lo que cruza es `npm run claves` de la Tienda (`--backend ../ecommerceMultitenant-BackendNode`). | `BackendNode/scripts/claves-servidor.mjs:21-22`, `FrontendStore/package.json` | Solo cambia la ruta de `claves` (`--backend ../backend`). |
| H15 | Hay **archivos ignorados que git no lleva**: `.env`, `.env_tests` y `load-tests/.env.local` del backend, y `.env` de la Tienda (con `PROXY_TARGET`). | `git status --ignored` | Se copian a mano a `apps/…` (6a.1). |

## Mapa de cambios

### 6a: mudanza (sin cambiar código)

| Lugar | Archivo | Tipo | Por qué |
|---|---|---|---|
| Raíz | `package.json` (`workspaces: ["apps/*", "paquetes/*"]`, scripts `dev`, `test`, `build`, `e2e`, `claves`, `contratos`), `package-lock.json` único, `.gitignore`, `CLAUDE.md`, `README.md`, `.worktreeinclude`, `.claude/settings.json` | nuevo | Workspace y comandos desde la raíz |
| Raíz | `docs/` (antes `BackendNode/docs/`), `herramientas/` (antes `BackendNode/herramientas/`), `.github/workflows/arquitectura.yml` | se mueve (`git mv`) | Specs, tablero, proceso y plugin son de los tres. La Action sigue con `docs/arquitectura/**` (misma ruta relativa) |
| Raíz | `docs/historial/commit-map-{backend,tienda,admin}.txt` | nuevo | Hash viejo → hash nuevo, para los hashes citados en `cambios.md` |
| apps/backend | `package.json` (`test` → `node --experimental-vm-modules scripts/jest.mjs`), `scripts/jest.mjs` | cambia / nuevo | H4 |
| apps/tienda | `package.json` (`claves`: `--backend ../backend`), `vercel.json` (`installCommand`: `cd ../.. && npm ci -w apps/tienda`) | cambia | H3, H14 |
| apps/admin | `vercel.json` (`installCommand`: `cd ../.. && npm ci -w apps/admin`) | cambia | H3 |
| apps/* | `package.json`: versiones exactas solo donde la comparación de H9 lo pida | cambia | H9 |
| herramientas | `claude-plugin/ecommerce-proceso/hooks/reglas.ts`, `register.ts`, `register.test.ts` | cambia | H5: reconocer `apps/<app>`, `paquetes/<p>`, `docs/sql` de la raíz y rutas dentro de `.claude/worktrees/<n>/` |
| herramientas | `coordinacion.md`, `agents/*.md` (13), `skills/recetas/{SKILL,local,pruebas,commit,plugin,estado}.md`, `README.md`, `.claude-plugin/plugin.json` (versión 0.4.0) | cambia | Rutas y "un repo" en vez de "tres repos" |
| herramientas | `skills/recetas/paralelo.md` | nuevo | Sesiones de Claude en paralelo con worktrees |
| docs | 22 enlaces relativos de docs a código (`../../../modules/…` → `../../../apps/backend/modules/…`), `docs/proceso/README.md`, `docs/ARQUITECTURA.md`, `docs/ESTADO.md`, las specs abiertas | cambia | Al mover `docs/` a la raíz |
| CLAUDE.md | raíz (nuevo: estructura, comandos, glosario de nombres viejos) y los tres de `apps/` (solo rutas) | nuevo / cambia | — |

No se tocan: el código fuente de las tres apps, los ~300 comentarios que citan "BackendNode `docs/…`" (los explica el glosario de la raíz), ni los `cambios.md` / `qa.md` cerrados (son historia).

### 6b–6h: contratos, reglas, núcleo y migración por recurso

| Lugar | Archivo | Tipo | Por qué |
|---|---|---|---|
| apps/backend | `modules/<contexto>/<recurso>.contrato.js` (empieza `catalogo/categorias.contrato.js`) | nuevo | A8.1, esquema de salida (wire format) por audiencia |
| apps/backend | `kernel/contratos/registro.js` (`CONTRATOS`), `kernel/contratos/__tests__/contratos.test.js`, `utils/apiResponse.contrato.js` (`Meta`) | nuevo | Registry + contrato, fitness de cobertura (`DEUDA`) |
| apps/backend | `scripts/contratos.mjs` (+ `--check`), devDependency `json-schema-to-typescript@16` | nuevo | A8.2, A8.4 |
| paquetes/contratos | `package.json` (`@ecompyme/contratos`, solo tipos), `src/comun/sobre.ts` (a mano: `Sobre<T>`, `Listado<T>`), `src/{tienda,admin}/*.ts` (generados) | nuevo | Lenguaje publicado |
| paquetes/compartido | `package.json` (`@ecompyme/compartido`, peer `@angular/core`, `marked`), `src/calendario/{calendario.core,grilla-mes.component,proveedor-fechas}.ts`, `src/transmision/senal-envivo.ts`, `src/texto/texto-rico.ts` (+ specs) | nuevo (se mueve) | A8.5, A8.7 |
| apps/tienda, apps/admin | `tsconfig.json` (`paths` a los dos paquetes), `package.json` (dependencias `"*"`), `src/styles.css` (`@source`; Admin: `@theme` con `primary` / `primary-tint`), `app.config.ts` (`PROVEEDOR_FECHAS`) | cambia | Consumir los paquetes |
| apps/tienda, apps/admin | por recurso: servicio de data-access + `<recurso>.desde-api.ts`; `models/<recurso>.model.ts` queda solo con el modelo de pantalla | cambia | A8.8 |
| herramientas | `fitness/dependencias.cjs`, `fitness/conocidas.json` (línea base), devDependency `dependency-cruiser@18` en la raíz | nuevo | A8.9 |
| .github | `workflows/ci.yml` (backend + `contratos --check` + fitness + `tsc` y Karma headless de los fronts, con filtros de rutas) | nuevo | A8.4 (hoy ningún test corre en CI) |
| docs | `docs/proceso/patrones.md` (4 patrones nuevos, si Diego los aprueba), `docs/ARQUITECTURA.md` ("Contratos en las fronteras": el esquema de salida pasa a ser contrato), receta `recetas/contrato.md` | cambia / nuevo | — |

## Contrato por rubro

- **No cambia ningún contrato por rubro:** ni `contrato.js`, ni `perfil-negocio.ts`, ni `PiezasUi` o `LAYOUT_POR_NEGOCIO`. `perfiles.spec.ts` y `uis.spec.ts` de los dos fronts tienen que pasar **sin cambios** en todas las sub-piezas. Si uno cambia, es un error.
- `anti-identidad` sigue corriendo en cada app. Se agrega la misma idea para la identidad de **app** en `paquetes/compartido` (`esAdmin`, `esTienda`, `app ===`).
- Regresión posible por rubro: 6d (calendario de hotel, tours, eventos, locales y canchas en la Tienda y en el Admin) y 6h (`reserva`, el DTO más divergente). Cada una se prueba con las tiendas demo de cada rubro.

## Patrones

Del [catálogo](../../proceso/patrones.md). Los marcados **(nuevo)** no están en el catálogo: se proponen aquí y entran si Diego los aprueba (tarea en 6b, 6c y 6d).

| Patrón | Dónde se aplica | Por qué aplica (o por qué no hace falta) |
|---|---|---|
| **Serializer** (existe) | Cada `*.serializer.js` gana su esquema de salida | Ya es la frontera de salida (`docs/ARQUITECTURA.md`). El esquema la describe en vez de inventar otra capa |
| **Registry + contrato** (existe) | `CONTRATOS` en `kernel/contratos/registro.js`: id, esquema, serializer, audiencia y archivo | El mismo patrón que `ALCANCE` o `parametros.registro.js`: una lista, y un test que falla si un serializer no está |
| **Fitness function** (existe) | Contratos al día (`--check`), cobertura de serializers (`DEUDA`), reglas de dependencia (`dependency-cruiser` + línea base) | Son reglas que se romperían en silencio. La línea base que solo baja ya funciona en anti-identidad |
| **Strategy** (existe, por rubro) → **Strategy por app con `InjectionToken`** (nuevo como variante) | `PROVEEDOR_FECHAS` en `grilla-mes` | Hay variación real hoy (diccionario contra `Intl`, H8). Es el patrón de los rubros con la app en el lugar del rubro (A8.7) |
| **Lenguaje publicado / contratos generados** (nuevo) | `paquetes/contratos`, `npm run contratos` | El backend es la verdad de la forma de los datos. Generar evita que los tipos a mano se separen de la API (hallazgos 2 y 6 de la pieza 4) |
| **Capa anticorrupción** (nuevo; antecedente: `monto.ts`, `…DesdeApi`) | data-access de cada front | Ya hay variación real entre DTO y modelo: montos en texto contra número, el árbol `subcategorias`, `productosCount` |
| **Tipos de librería con reglas de dependencia** (nuevo) | `herramientas/fitness/dependencias.cjs` | Hace cumplir la capa anticorrupción y el núcleo compartido. Sin la regla, el DTO vuelve a los componentes en la primera prisa |
| Design tokens | `primary` / `primary-tint` en el `@theme` de cada app | La apariencia del componente compartido cambia por app sin `if` |
| Adapter, Facade, Abstract Factory de UI | — | No hacen falta: no hay proveedor externo nuevo ni estructura de pantalla que cambie |

## Base de datos

No aplica: no hay tablas, columnas, SQL ni RLS. Los contratos describen respuestas que ya existen. La única excepción posible es en 6f: un recurso que hoy no tiene serializer gana uno, y su test de equivalencia prueba que la respuesta no cambia.

## Configuración

No hay llaves nuevas ni quitadas en el código, ni parámetros de plataforma. Cambia la **configuración de las plataformas**, que el `deployer` necesita conocer:

| Llave / ajuste | Repo / plataforma | Nueva / cambia / se quita | Valor | Quién |
|---|---|---|---|---|
| Repo conectado | Vercel (Admin y Tienda), Railway (backend) | cambia | `flowiseai2110/ecompyme`, rama `main` | Diego |
| Root Directory | Vercel Admin / Tienda | cambia | `apps/admin` / `apps/tienda` | Diego |
| Include files outside the root directory in the Build Step | Vercel (los dos) | se confirma | Enabled (ya viene activo en proyectos creados después de 2020) | Diego |
| Skip deployments when there are no changes to the root directory or its dependencies | Vercel (los dos) | nueva | Enabled | Diego |
| `installCommand` | `apps/tienda/vercel.json`, `apps/admin/vercel.json` | cambia / nueva | `cd ../.. && npm ci -w apps/<app>` | Desarrollador |
| Auto-assign Custom Production Domains | Vercel Tienda (Settings → Environments → Production) | temporal | Off durante 6a.5, On al terminar | Diego |
| Root Directory | Railway | cambia (si hoy tiene valor) | vacío / `/` | Diego |
| Custom Start Command | Railway | nueva | `npm run start -w apps/backend` | Diego |
| Watch Paths | Railway | nueva | `/apps/backend/**`, `/package.json`, `/package-lock.json` | Diego |
| Healthcheck Path | Railway | se confirma o nueva | `/api/v1/health` | Diego |
| `RAILPACK_NODE_VERSION` (o `NIXPACKS_NODE_VERSION`, según el builder del servicio) | Railway, variable | nueva | La versión mayor de Node que muestra hoy el log del build | Diego |
| `RAILPACK_NODE_NPM_INSTALL` (o `NIXPACKS_INSTALL_CMD`) | Railway, variable | nueva (opcional) | `npm ci -w apps/backend`, para no instalar Angular en el backend | Diego |
| Acceso de las GitHub Apps de Vercel y de Railway | GitHub → Settings → Applications | cambia | agregar `ecompyme` si están en "Only select repositories" | Diego |
| Variables de entorno y dominios | Vercel y Railway | **no cambian** | — | — |
| `.env` locales | `apps/backend/.env`, `.env_tests`, `load-tests/.env.local`, `apps/tienda/.env` | se copian | los mismos de hoy | Desarrollador |
| `extraKnownMarketplaces.ecommerce-local` y `additionalDirectories` | `~/.claude/settings.json` (usuario) | cambia | `…/ecompyme/herramientas/claude-plugin` y `…/ecompyme` | Diego |
| `worktree.baseRef` | `.claude/settings.json` de la raíz del monorepo | nueva | `"head"` | Desarrollador (con aprobación) |

## Plataformas en detalle

### GitHub

- **Repo nuevo, privado**, `flowiseai2110/ecompyme` (P1), vacío: sin README, licencia ni `.gitignore`, para que el primer push no choque.
- **Importación con historial:** `git filter-repo --to-subdirectory-filter apps/<app>` sobre un clon de cada repo, y luego `git merge --allow-unrelated-histories`.
  - Por qué no `git subtree add`: con subtree, los commits viejos tienen los archivos en la raíz. Así `git log -- apps/tienda/src/server.ts` solo muestra lo posterior a la mudanza, y para ver lo anterior hay que acordarse de `--follow` o del prefijo.
  - Con `filter-repo`, cada commit viejo ya tiene sus archivos en `apps/<app>/`, y `log`, `blame` y el historial de GitHub funcionan sin trucos.
  - El costo: los hashes cambian. Los `cambios.md` citan hashes viejos, que siguen existiendo en los repos archivados, y `docs/historial/commit-map-*.txt` traduce de uno a otro.
  - Verificación exacta: el árbol `HEAD:apps/<app>` del monorepo tiene que tener el mismo hash que el `HEAD^{tree}` del repo viejo.
- **Solo se importa `main`.** `develop`, `chore/upgrade-angular-22` y `claude/*` quedan en los repos archivados. No hay tags.
- **Issues:** se transfieren las 9 de FrontendStore (`gh issue transfer`), en orden #1→#9, para que conserven su número (el repo nuevo empieza en #1). GitHub conserva comentarios y responsables, y redirige la URL vieja. Las etiquetas pasan si existen con el mismo nombre: solo usan `enhancement`, que viene por defecto. La documentación de GitHub no dice qué pasa con el tablero de proyecto ni con las sub-issues. Por eso primero se respalda el tablero (`gh project item-list 1 --owner @me --format json`), se transfiere #1, se revisa y después se sigue.
- **Tablero "Ecommerce Saas"** (proyecto 1 de @me): es de usuario, no de repo, así que no se mueve. Se actualiza el campo "Spec" (`BackendNode/docs/specs/…` → `docs/specs/…`).
- **Actions:** `arquitectura.yml` se mueve a la raíz y sus `paths` quedan iguales, porque `docs/` también se mueve a la raíz. En 6b llega `ci.yml`. **Secrets y variables:** ninguno que copiar (H11).
- **Archivado** (6a.7, una semana después de reconectar todo): primero BackendNode pasa a privado, y después se archivan los tres. Un repo archivado se puede desarchivar.

### Vercel

- Se mantienen los dos proyectos (`ecommerce-multitenant-frontend-store` y el del Admin), con sus variables, dominios e historial de despliegues. En Settings → Git se desconecta el repo viejo y se conecta el nuevo. En Settings → Build and Deployment se fija el Root Directory de cada uno.
- **`vercel.json` sigue en la carpeta de cada app** y se lee relativo al Root Directory: `buildCommand`, `outputDirectory`, `functions` (`api/index.mjs` con `includeFiles: dist/pc.ng.storefront/server/**`), `headers` y `rewrites` no cambian. Solo cambia `installCommand`.
- **Instalación filtrada:** `cd ../.. && npm ci -w apps/<app>`. Corre en la raíz, con el `package-lock.json` único, e instala solo las dependencias de esa app. Así no corre el `postinstall` del backend (H3) ni baja Prisma, sharp o el SDK de AWS. Vercel documenta esta forma en "Filtered installs".
- **Builds sin cambios:** la opción integrada de Vercel salta una app si no cambió su carpeta, sus dependencias internas o el lockfile. No ocupa un build concurrente (Hobby tiene uno). Requisitos que se cumplen: workspaces de npm, nombres únicos en cada `package.json` (`pc.ng.storefront`, `pc.ng.admin`, `pc.node.admin`) y dependencias entre paquetes declaradas (`"@ecompyme/compartido": "*"`, desde 6b). **Límite:** un cambio fuera de los workspaces (por ejemplo, `docs/` o `ESTADO.md`) cuenta como global y construye las dos apps. Es inofensivo, porque el código es el mismo. Si molesta, se cambia por un "Ignored Build Step" con `git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- apps/<app> paquetes package-lock.json`, que sí ocupa un build.
- **Tienda en espera (H6):** con "Auto-assign Custom Production Domains" apagado, el despliegue de producción se construye sin tomar el dominio. Se prueba en su URL y se usa "Promote", que no vuelve a construir.
- **Reversa:** Instant Rollback al despliegue anterior, que sigue en el historial del proyecto, y reconectar el repo viejo.

### Railway

- Se mantiene el servicio, con sus variables y su dominio `ecommercemultitenant-backendnode-production-2ba3.up.railway.app`. La Tienda tiene ese dominio fijo en `vercel.json` (`rewrites`) y en `api/keepalive.mjs`, y no cambia.
- **Construcción desde la raíz (H2):** Root Directory vacío. Así ve el `package-lock.json` de la raíz, y Railpack "soporta workspaces automáticamente". El comando de inicio es `npm run start -w apps/backend`, que corre `node --import ./instrument.js server.js` con `apps/backend` como carpeta de trabajo: el `.env`, `prisma.config.ts` y `generated/` resuelven igual que hoy. No hace falta comando de build: `prisma generate` corre en el `postinstall` del backend.
- **Watch Paths** (patrones tipo gitignore, que "operan desde `/`" aunque haya Root Directory): `/apps/backend/**`, `/package.json`, `/package-lock.json`. Un cambio solo de docs o de un front no redespliega el backend.
- **Versión de Node:** hoy el backend no fija versión (sin `engines` ni `.nvmrc`), así que Railpack usa `lts`. En 6a **no** se agrega `engines` ni `.nvmrc` a la raíz, porque Railpack los leería. Se fija explícita con `RAILPACK_NODE_VERSION`, con la que muestra el log de hoy.
- **Instalación:** Railpack la personaliza con `RAILPACK_NODE_NPM_INSTALL`. Sin esa variable, instala todo el workspace: funciona, pero tarda más y la imagen pesa más. Si el servicio todavía usa Nixpacks, las equivalentes son `NIXPACKS_INSTALL_CMD` y `NIXPACKS_NODE_VERSION`. Diego mira el builder en Settings → Build antes de empezar, y no se cambia de builder en la misma mudanza.
- **Sin cortes:** con Healthcheck Path, Railway activa el despliegue nuevo solo cuando responde 2xx. Si falla, sigue el anterior. **Reversa:** Rollback en el menú del despliegue anterior (restaura la imagen y las variables) y reconectar el repo viejo.
- **No se agrega `railway.json`** (H13).

### Local

| Comando (en la raíz) | Qué hace |
|---|---|
| `npm install` | instala los tres y los paquetes (un solo `node_modules` en la raíz y, si hace falta, uno anidado por app) |
| `npm run dev` | `concurrently` con nombres y colores: backend `nodemon` :3000, Tienda `ng serve` :4200 y Admin `ng serve --port 4300` (H7) |
| `npm run dev:fronts` | solo los dos fronts (la Tienda apunta a producción, salvo `PROXY_TARGET` en `apps/tienda/.env`, como hoy) |
| `npm run start -w apps/backend` · `npm start -w apps/tienda` · `npm start -w apps/admin -- --port 4300` | uno solo |
| `npm run test:backend` · `npm run test:tienda` · `npm run test:admin` | Jest · `pretest` + anti-identidad + anti-ramas + Karma (`--watch=false`) · anti-identidad + Karma (`--watch=false`) |
| `npm test` | los tres en serie, y se detiene en el primero que falla (más `contratos --check` y `fitness`, desde 6b y 6c) |
| `npm run e2e` | Playwright de la Tienda |
| `npm run claves` | claves de la Tienda, copiadas a `apps/backend` |
| `npm run contratos` | (desde 6b) regenera `paquetes/contratos` |

### Lo que hoy cruza repos y se rompe al mover

| Qué | Dónde | Qué se hace |
|---|---|---|
| `npm run claves` copia al backend | `FrontendStore/package.json` (`--backend ../ecommerceMultitenant-BackendNode`) | `--backend ../backend` |
| `scripts/claves-servidor.mjs` | backend | No cruza (H14). Sigue igual |
| Rutas `../ecommerceMultitenant-…` y nombres de repo | 24 archivos en BackendNode (plugin, docs, `.claude`), 2 en la Tienda (`package.json`, `.claude/settings.json`), 3 en el Admin (`.claude/*`, `Doc/Bugs/frontend-bugs-log.md`) | Plugin y docs vivos: se actualizan. Los `.claude/settings*.json` de cada app dejan de usarse (Claude se abre en la raíz). Lo histórico queda igual |
| Plugin `ecommerce-proceso` | `herramientas/claude-plugin/` (marketplace `ecommerce-local` de tipo directorio, con la ruta en `~/.claude/settings.json` y en `plugins/known_marketplaces.json`) | Se mueve con `herramientas/`. Hooks (H5), coordinación, agentes, recetas. Diego quita y vuelve a agregar el marketplace con la ruta nueva |
| `evaluar-coordinacion.sh` | `REPO="$AQUI/../.."` | Con `herramientas/` en la raíz, `../..` es la raíz del monorepo: funciona sin cambio |
| `CLAUDE.md` | los tres repos | Uno nuevo en la raíz (estructura, comandos, proceso, glosario). Los de `apps/` cargan cuando se trabaja en su carpeta |
| Skills del proyecto | `.claude/skills/{frontend-design,senior-frontend}` repetidas en los dos fronts | Una sola copia en `.claude/skills/` de la raíz |
| Memorias de Claude Code | `~/.claude/projects/c--…-ecommerceMultitenant-{BackendNode,FrontendAdmin,FrontendStore}/memory/` (18, 31 y 39 archivos; solo `MEMORY.md` se repite) | Se copian los 85 temas a `~/.claude/projects/c--Users-diego-armando-repositorios-ecommerce-ecompyme/memory/` y se unen los tres `MEMORY.md` en uno, sin repetidos y con menos de 200 líneas (es lo que se carga). La memoria depende del repo git: subcarpetas y worktrees del monorepo comparten una sola. Las carpetas viejas quedan como respaldo |

### Sesiones de Claude en paralelo (receta nueva `recetas/paralelo.md`)

En la pieza 4, dos sesiones editaron el mismo archivo en la misma carpeta. Con un solo repo es más probable. Receta:

1. La sesión principal trabaja en la carpeta del monorepo, en `main`.
2. Cada sesión extra arranca con `claude --worktree <tarea>` desde la raíz. Claude Code crea `.claude/worktrees/<tarea>/` en la rama local `worktree-<tarea>`, y bloquea las ediciones y los comandos git que apunten a la carpeta principal.
3. `.claude/settings.json` de la raíz con `"worktree": { "baseRef": "head" }`, para que el worktree parta del `main` local con los commits todavía sin push, y no de `origin/main`. `.worktreeinclude` con `apps/backend/.env`, `apps/backend/.env_tests` y `apps/tienda/.env`, que se copian solos.
4. En el worktree: `npm ci -w apps/<app>`, solo la app que se toca (el `node_modules` no se comparte). Si levanta servidores, usa otros puertos (`--port 4210`, backend `PORT=3010`).
5. Una pieza por sesión. Si dos piezas tocan el mismo archivo, van una después de la otra, no en paralelo.
6. Al terminar: commit en el worktree, `git rebase main` ahí mismo y, desde la carpeta principal, `git merge --ff-only worktree-<tarea>`. Al salir, Claude borra el worktree y su rama.
7. **Excepción a "sin ramas" (pregunta P3):** las ramas `worktree-*` son locales y duran lo que dura la sesión. Nunca se suben, y en GitHub solo existe `main`. Sin una rama por worktree, git no deja tener dos copias de trabajo.

## Alternativas consideradas

| Opción | A favor | En contra | Elegida |
|---|---|---|---|
| Railway con Root Directory `apps/backend` (la propuesta inicial) | Igual a hoy | No ve el lockfile de la raíz (H2). Instalaría sin lockfile, con versiones distintas a las probadas | No |
| Railway desde la raíz + comando de inicio + Watch Paths | Lockfile único; Railway lo documenta para monorepos compartidos | Dos ajustes más en el panel | **Sí** |
| Dejar el backend fuera de los workspaces (con su propio lockfile) | Railway quedaría igual a hoy | Dos instalaciones, dos lockfiles y un "caso raro" para siempre. El día que el backend use un paquete, hay que mudarlo igual | No |
| Mover `docs/` y `herramientas/` a la raíz en 6a | Cada referencia "BackendNode `docs/…`" tiene que cambiar igual. Así cambia una sola vez y queda donde corresponde | 22 enlaces de docs a código para arreglar | **Sí** |
| Dejar `docs/` en `apps/backend/docs` | Menos movimiento | Las specs, el tablero y el proceso son de los tres, y las rutas cambian igual | No |
| `git subtree add` | Sin herramientas extra | Historial con rutas viejas (ver GitHub, arriba) | No |
| `filter-repo` + merge de historias no relacionadas | Historial y `blame` limpios por carpeta | Instalar `git-filter-repo` (Python ya está); hashes nuevos | **Sí** |
| Librería Angular compilable (ng-packagr) para el núcleo | Es lo que recomienda la guía de Angular | Compilar antes de cada `serve` o `test` y un `--watch` aparte | No |
| Núcleo desde el código fuente con `paths` (como Nx por defecto) | Sin paso de compilación, con recarga en vivo | Se aparta de la guía de Angular (que apunta a librerías publicables) | **Sí** |
| Reglas de dependencia con un script propio, como anti-identidad | Sin dependencias | Habría que reimplementar la resolución de imports (`paths`, `loadComponent`, relativos) | No |
| `dependency-cruiser` + línea base | Resuelve TypeScript y alias, y trae la línea base que solo baja (`--ignore-known`) | Una devDependency en la raíz | **Sí** |
| Tipos por inferencia (`z.infer`) / OpenAPI / JSON Schema → TS | Ver [ADR-0003](../../adr/ADR-0003-monorepo-y-contratos-generados.md) | — | JSON Schema → TS |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| La reconexión despliega commits de `main` que no estaban en producción y piden SQL antes (precio-en-servidor, campañas-descuento) | Media | Requisito previo: lo desplegado = `main` en los tres, con los commits anotados. Congelar el trabajo durante 6a.3–6a.6 (un solo día) |
| Una versión de una dependencia se mueve al unir los lockfiles y cambia algo visible (Tailwind 4.1 → 4.3 en la Tienda) | Media | Comparar las directas antes y después y fijar exactas las que cambien. Mismas pruebas y números que la línea base. Capturas de las tiendas demo antes y después |
| El SSR de la Tienda no encuentra `dist/` en Vercel (H6) | Media | Despliegue en espera, sin dominio. Se prueba en su URL antes de promover. Si falla, se corrige la ruta en `server.ts` (un cambio chico y anotado) |
| Los hooks del plugin dejan de actuar sin avisar (H5) | Alta si no se corrige | 6a.2 los actualiza con pruebas y se verifican antes de trabajar en el monorepo |
| Railway instala sin filtrar y el build tarda o pesa más | Baja | `RAILPACK_NODE_NPM_INSTALL`. Si no lo toma, igual funciona |
| La transferencia de issues pierde el tablero o las sub-issues | Baja | Respaldo JSON del tablero; transferir #1, revisar y seguir; volver a agregar con `gh project item-add` |
| Dos sesiones de Claude en la misma carpeta pisan un archivo | Media | Receta `paralelo.md` (worktrees) |
| Un cambio de contrato rompe un front en la ventana entre despliegues | Media (desde 6b) | Regla de dos tiempos (A8.10), backend antes que los fronts |
| Minutos de Actions en un repo privado | Baja | CI con filtros de rutas: un cambio solo de docs no corre tests |

## Orden de despliegue y reversa

**6a** (un solo día para 6a.3–6a.6, con todo congelado). La versión anterior sigue en línea en Vercel y en Railway hasta que la nueva sale bien.

| Paso | Qué | Cómo se vuelve atrás |
|---|---|---|
| 6a.1–6a.2 | Monorepo en el disco (local) | Borrar la carpeta. No se tocó nada más |
| 6a.3 | Repo en GitHub + issues | Transferir las issues de vuelta. Archivar o borrar el repo nuevo |
| 6a.4 | Vercel Admin | Instant Rollback + reconectar el repo viejo y quitar el Root Directory (el `vercel.json` del repo viejo está intacto) |
| 6a.5 | Vercel Tienda (en espera → Promote) | Si no se promovió, no pasó nada. Si se promovió: Instant Rollback + reconectar el repo viejo |
| 6a.6 | Railway | Si falla el healthcheck, sigue el despliegue anterior. Si no: Rollback + reconectar el repo viejo y quitar el comando de inicio y los watch paths |
| 6a.7 | Archivar los repos viejos (una semana después) | Desarchivar. Desde aquí, volver atrás es portar los commits nuevos (`git format-patch --relative=apps/<app>` + `git am`): ya no es gratis |

**6b en adelante:** el orden de siempre, backend → Admin → Tienda. Ninguna sub-pieza cambia la API ni la BD, así que cada una se revierte con `git revert` de su commit.

## Preguntas para Diego (no bloquean el plan, sí el inicio de 6a)

- **P1. Nombre del repo y de la carpeta.** `ecommerceMultitenant` está ocupado por la landing (H1). Propuesta: `ecompyme` (repo, carpeta local y prefijo `@ecompyme/` de los paquetes). Alternativa: renombrar antes la landing a `ecompyme-landing` y usar `ecommerceMultitenant`, pero entonces hay que reconectar también su proyecto de Vercel.
- **P2. Puerto del Admin en local:** 4300, como ya se usa (propuesta), o 4201. Si es 4201, hay que revisar las URL de redirección de Supabase Auth para local.
- **P3. Ramas locales `worktree-*` para sesiones en paralelo:** son la única excepción a "sin ramas". Son locales y cortas, y en GitHub solo queda `main`. Si dices que no, la alternativa es no correr sesiones en paralelo sobre el mismo repo.
