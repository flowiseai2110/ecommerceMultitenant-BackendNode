# Spec: corrección de antipatrones (los tres repos)

> Estado (2026-10-17): **aprobada** para las piezas 1–5. Pieza 6: mecanismo decidido por Diego el 2026-10-20 (monorepo + patrones estratégicos de DDD, ver "Decisiones tomadas" y [ADR-0003](../../adr/ADR-0003-monorepo-y-contratos-generados.md)); plan en [impacto.md](impacto.md), por aprobar. Tareas: [tasks.md](tasks.md).
> Base: [perfil-negocio](../perfil-negocio/spec.md) (capacidades, no identidad), [layout-por-rubro](../layout-por-rubro/spec.md) (slots y registro de piezas), [multi-sede](../multi-sede/spec.md) S2 (registro `ALCANCE`).
> Repos: BackendNode, FrontendAdmin, FrontendStore.

## Por qué

Un barrido de los tres repos (2026-10-17) encontró siete antipatrones. Ninguno rompe hoy la tienda, pero:

- uno **puede filtrar datos entre tiendas** (A1);
- otros hacen que cada rubro, método de envío o recurso nuevo obligue a tocar código en muchos lugares (A3–A5, A8);
- y algunos incumplen reglas ya escritas en los `CLAUDE.md` (A3).

Cada antipatrón tiene aquí su patrón de reemplazo, aplicado a lo que el código ya tiene. Varios patrones ya existen a medias (auto-scope de Prisma, perfil de rubro, hooks de la vertical, `errorHandler`): se trata de terminarlos, no de inventar otros.

### Línea base (medida el 2026-10-17)

| Medida | Hoy | Meta |
|---|---|---|
| Modelos con `tiendaId` sin auto-scope | 28 de 63 | 0 (salvo los `global` declarados) |
| Operaciones por id (`findUnique`, `update`, `delete`) con auto-scope | 0 | Las tres |
| `try { … } catch (error) { next(error); }` en rutas | 141 | 0 |
| Comparaciones por identidad de rubro en código compartido | 6 lugares en los tres repos (tabla de A3) | 0 |
| Ramas `tipo === 'courier' \| 'delivery_propio' \| 'recojo_tienda'` en el checkout | 21 | 0 |
| Líneas de `checkout-page.component.ts` | 2203 | < 400 por archivo |
| Archivos con el mismo nombre en Store y Admin | ~35 (`reserva.model.ts`: 1603 líneas distintas) | Solo los propios de cada front |

## Principios

- **Seguro por defecto.** Lo que protege a una tienda de otra aplica solo, y lo que se salta se declara y se puede buscar.
- **Polimorfismo, no condicionales.** El código común le pide algo al rubro, al método o a la sección (*tell, don't ask*). No le pregunta qué es.
- **Una fuente de verdad.** Un contrato se define una vez y los demás lo reciben generado.
- **Sin cambios visibles.** Cada pieza deja la tienda y el Admin igual que antes. Se verifica en el navegador con las tiendas demo de cada rubro.
- **Divide y vencerás.** Una pieza a la vez, con su verificación, antes de la siguiente.

## Requisitos

### A1. Aislamiento por tienda seguro por defecto (Backend)

**Antipatrón:** seguridad opt-in. `TENANT_SCOPED_MODELS` en `config/prisma.js` es una lista hecha a mano. Todo modelo nuevo nace **sin** auto-scope, y así quedaron 28: casi todo `hotel_*`, todo `transmision_*`, `evento_entradas`, `evento_invitaciones`, `evento_transmisiones`, `reserva_partes`, `zonas_envio`, `avisos_live`, `tienda_configuraciones`, `tienda_textos` y `tienda_uso_recursos`.

**Patrones:** *seguro por defecto* (deny-by-default), *contexto ambiental* (ALS, ya existe), *interceptor* (la extensión de Prisma, ya existe) y *fitness function* (un test que vigila la regla).

- **A1.1** Se crea `kernel/tenant/alcance.js` con el registro `ALCANCE`: por cada modelo con `tiendaId`, `tienda` o `global`. Cada `global` lleva el motivo (por ejemplo, `usuario_tiendas` e `invitaciones` se consultan entre tiendas en auth). Es el mismo registro que pide [multi-sede](../multi-sede/spec.md) S2.1: aquí nace solo con `tienda` y `global`, y multi-sede le agrega `sede`, `sede:<padre>`, `presencia` y `razon_social`.
- **A1.2** `config/prisma.js` arma `TENANT_SCOPED_MODELS` desde `ALCANCE` (cierra multi-sede S2.2 y S2.6).
- **A1.3** **Test de contrato:** lee `prisma/schema.prisma` (el cliente generado se mockea en los tests), y todo modelo con campo `tiendaId` debe estar en `ALCANCE`. Si alguien agrega una tabla y no la clasifica, el test falla. Es el mismo enfoque que `negocio/__tests__/negocio.test.js`.
- **A1.4** El auto-scope cubre también `findUnique`, `findUniqueOrThrow`, `update`, `upsert` y `delete`. Desde Prisma 5 el `where` de esas operaciones acepta campos no únicos junto al `id` (`where: { id, tiendaId }`), así que el comentario actual ("findUnique no admite un where no-único") ya no aplica.
  - Un registro de otra tienda da "no encontrado" (404), nunca 200 con datos.
  - `create` queda fuera: el `tiendaId` lo pone la ruta y lo valida `requireTiendaAccess`.
- **A1.5** Una sola salida explícita para las consultas entre tiendas: `runUnscoped(fn)` (`kernel/tenant/tenant-store.js`, ya existía; prende `bypass` en el ALS solo dentro de `fn`). Se busca por nombre en code review.
- **A1.6** Los jobs sin request (reseñas, transmisiones y grabaciones) no tienen tienda en el contexto. Recorren todas las tiendas a propósito, así que cada vuelta corre dentro de `runUnscoped`. Así queda explícito, y siguen funcionando igual aunque se lancen desde un request (un timer creado en un request hereda su contexto).
- **A1.7** Tests negativos: con la tienda A en el contexto, leer, editar y borrar un registro de la tienda B por id da 404. Un test por modelo de alto riesgo: `pedidos`, `pagos`, `clientes`, `reservas`, `hotel_cobros`, `hotel_caja_movimientos`, `transmision_movimientos`.
- **A1.8** La ruta pública `GET /store/categorias/:id` se limita a la tienda del subdominio (hoy devuelve una categoría de cualquier tienda).
- **A1.9** Los `$queryRaw` (52) **no** pasan por la extensión. Se revisa cada uno: si toca una tabla `tienda`, recibe `tiendaId` como parámetro obligatorio. La revisión por sede sigue en multi-sede S2.7.

  Revisión del 2026-10-17. Ninguno recibe ids del cliente sin validarlos contra la tienda:
  - 36 filtran por `tienda_id` en el propio SQL o en un fragmento `Prisma.sql` (búsqueda del agente, historial de pedidos).
  - `libro.service.js:106` es un advisory lock y `bloquearTipo` (hotel) es un `FOR UPDATE`: no devuelven datos. `onboarding.service.js` toca `auth`.
  - Los 4 `UPDATE` de ocupaciones (canchas y locales) ganaron `tienda_id = ${tiendaId}`: ya tenían el dato a mano.
  - Stock (`inventario.service.js`) y variantes (`producto-opciones.service.js`) actualizan por ids que el servidor obtuvo antes de consultas filtradas por tienda: los productos bloqueados en `validarYBloquearStock`, los detalles de un pedido de la tienda y un `productoId` validado por la ruta. Se dejan así; cambiar la firma de `descontarStock` y `reponerStock` no suma protección.

En las operaciones por clave, Prisma exige que la clave quede en la raíz del `where`. Por eso la tienda va en `AND`, conservando el `AND` que ya trajera. Se verificó contra Prisma 7 que las seis formas pasan la validación del cliente:

```js
// lecturas y masivas
{ AND: [where, { tiendaId }] }
// findUnique, findUniqueOrThrow, update, upsert, delete
{ ...where, AND: [...where.AND, { tiendaId }] }
```

### A2. Manejo de errores centralizado (Backend)

**Antipatrón:** boilerplate repetido. Hay 141 handlers con `try { … } catch (error) { next(error); }` (63 en `reservas.admin.routes.js`).

**Patrón:** *manejo centralizado de errores*, una cadena de responsabilidad hacia `errorHandler` (`middlewares/error.middleware.js`, ya existe).

- **A2.1** Con Express 5 (`^5.2.1`), una promesa rechazada en un handler `async` llega sola a `errorHandler`. Un codemod quita el envoltorio en todas las rutas.
- **A2.2** El codemod solo quita los `catch` cuyo único cuerpo es `next(error)`. Un `catch` que traduce el error o hace otra cosa se queda y se revisa a mano.
- **A2.3** Un test de error por módulo confirma que el código y el estado HTTP no cambian (`NotFoundError` → 404, `ConflictError` → 409, error de Prisma → su mapeo).
- **A2.4** Regla para código nuevo, anotada en el `CLAUDE.md` del backend: sin try/catch en rutas, salvo para traducir un error.

  Hecho el 2026-10-18. El conteo de 141 era solo de envoltorios en una línea: con los de varias líneas eran 243, en 42 archivos. El codemod se limitó a `*.routes.js`. Middlewares (`tienda-access`, `validation`, `negocio.middleware`) y `agente.controller.js` quedan como están: se llaman a mano en tests o en composición, y ahí el `catch → next` sí cumple una función. A2.3 se cubre con un test del mecanismo (Express 5 + `errorHandler`) y no con un test por módulo: la transformación es la misma en todos y se verificó sobre el AST.

### A3. Rubro por capacidades, no por identidad (los tres)

**Antipatrón:** revisar el tipo en vez de usar polimorfismo. El `CLAUDE.md` lo prohíbe, pero quedan casos:

| Repo | Lugar | Hoy |
|---|---|---|
| Store | `features/reservas/reserva/seguimiento-page.component.ts:113,193,262` | `r.tipo === 'hotel'` |
| Store | `seguimiento-page.component.html:486,496` | `esEvento()`, `esTour()` |
| Admin | `pages/reservas/reservas.util.ts:29-59` | `esLocal ? … : esCancha ? … : esEvento ? …`, `r.tipo === 'hotel'` |
| Backend | `modules/reservas/reservas.service.js:767` | `pedido.tipo === "hotel"` para validar el cupo |
| Backend | `modules/reservas/estados.js:107` | `transicionar(…, tipo = "hotel")`: rubro por defecto |
| Backend | `modules/diseno/plantillas.js:47`, `plantillas.service.js:37` | `tipoNegocio === "productos"` |

**Patrones:** *reemplazar condicional por polimorfismo*, *Strategy* (el perfil de rubro y la vertical de reservas, que ya existen) y *tell, don't ask*.

- **A3.1** Store: el perfil de reserva (`perfilDeTipoReserva`) agrega lo que hoy decide el `if`:
  - `ventana(r)`: rango de noches o fecha y hora;
  - `permiteModificar(r)`;
  - `textoFechas(r)`.
  El detalle propio de cada rubro (entradas del evento, pasajeros del tour) va en un `<app-slot-rubro>`, como en layout-por-rubro.
- **A3.2** Admin: `voz()` y `detalle()` de `reservas.util.ts` se mueven al perfil de reserva de cada rubro en `negocio/<rubro>/`.
- **A3.3** Backend: la vertical de reservas gana el hook opcional `alAceptar(tx, { pedido, forzar, ahora })`. El hotel pone ahí `validarCupoAlAceptar`. `reservas.service.js` solo llama `vertical.alAceptar?.(…)`. Se suma al contrato en `modules/negocio/contrato.js`.
- **A3.4** Backend: `transicionar` exige `tipo`, sin valor por defecto. Un tipo sin máquina es un error, no "hotel".
- **A3.5** Backend: el layout por defecto de cada rubro sale de `datos.diseno.layoutPorDefecto` (y el rubro de la tienda, de una capacidad), no de `tipoNegocio === "productos"`.
- **A3.6** Fitness function en cada repo: un test que busca `tipo === '<rubro>'`, `tipoNegocio === '<rubro>'` y `es<Rubro>(` fuera de `negocio/<rubro>/` y de las carpetas de un solo rubro, y falla si encuentra alguno.

  Hecho el 2026-10-18 (pieza 3). La tabla de arriba listaba 6 lugares, pero el barrido con el patrón de A3.6 encontró unos 50. Se corrigieron los de la tabla, y además todo `reservas.util.ts` y `reserva-detail` del Admin y todo el seguimiento del Store. Lo que queda está en el backend: `reservas.emails.js` (22), `reservas.service.js` (11), `reservas.serializer.js` (5) y `reservas.pago.js` (2). Va a la **pieza 3b**, y mientras tanto lo cubre la lista `DEUDA` del test, que solo puede bajar. Hecha el 2026-10-18: `DEUDA` quedó vacía. Lo propio de cada tipo en la transición, el DTO y los correos vive en `reservas/<rubro>/` (`alCambiarEstado`, `dto.js`, `correo.js`), y el código común lo elige con un registro (`DTO_POR_TIPO`, `CORREO_POR_TIPO`), no con un if. Las comparaciones que no son de rubro (tipo de sección, tour guiado del asistente, comentarios) se declaran en `NO_ES_RUBRO` con su motivo.

  Desvíos de lo escrito arriba:
  - A3.1: el detalle por rubro del seguimiento es `perfil.detalle` (un componente) y no `<app-slot-rubro>`, porque el slot elige por el rubro de la tienda y el seguimiento por el tipo de la reserva. `permiteModificar(r)` quedó como `antesDeLlegar: boolean`: la condición de estado es común.
  - A3.3: `alAceptar({ tiendaId, pedido, ahora })` no recibe `tx` y corre antes de la transacción, igual que antes, para no cambiar el comportamiento.
  - Traducciones: los textos del detalle del seguimiento ahora cuentan solo para su rubro ("Pasajeros" solo en tours, "Entradas" solo en eventos), porque viven en `negocio/<rubro>/`. En Admin › Traducciones, cada tienda deja de ver los de otros rubros.

### A4. Tipos de sección por registro (Admin y Backend)

**Antipatrón:** un condicional que crece con cada tipo nuevo. Por ejemplo, `pages/diseno/seccion-form.component.ts:519`: `s.tipo === 'categorias' || 'productos' || 'habitaciones' || 'tours' || 'eventos' || 'salones' || 'canchas'`.

**Patrón:** *registro de metadatos* (Type Object): cada tipo de sección declara sus capacidades.

- **A4.1** `META_SECCIONES[tipo] = { listaItems, filtraPorCategoria, … }` junto a la definición de secciones del Admin. La plantilla pregunta `meta(s).listaItems`.
- **A4.2** El registro es exhaustivo (`Record<TipoSeccion, MetaSeccion>`): un tipo nuevo sin meta no compila.
- **A4.3** El backend ya lista las secciones en `modules/negocio/secciones.js` y las valida en `diseno/secciones.schema.js`. Si una capacidad se usa en los dos lados, se define en el backend y viaja con los contratos de A8.

### A5. Checkout por estrategias (Store)

**Antipatrón:** God Object. `features/checkout/checkout-page/checkout-page.component.ts` tiene 2203 líneas (1150 de template inline), 24 signals, 14 servicios inyectados, unos 60 métodos y 21 ramas por método de envío.

**Patrones:** *Strategy* (métodos de envío), *Facade + store de feature* (estado del checkout), *Container / Presentational* (pasos) y *Humble Object* (tests sin DOM).

- **A5.1** `ESTRATEGIAS_ENVIO: Record<TipoMetodoEnvio, EstrategiaEnvio>` para `courier`, `delivery_propio` y `recojo_tienda`. Cada estrategia declara:
  - si pide dirección o agencia;
  - su formulario (componente por `ngComponentOutlet`);
  - cómo arma el resumen del paso;
  - cómo valida.
  El registro es exhaustivo: un tipo nuevo sin estrategia no compila.
- **A5.2** `CheckoutStore` (signals, a nivel de la ruta) reúne el estado y los 14 servicios: carrito, envío, pago, cupón, comprobante, cuenta y tracking. Es la única API que ven los pasos.
- **A5.3** Un componente por paso (contacto, envío, pago, comprobante, resumen), cada uno con `input()`/`output()` y template en su propio `.html`. La página solo orquesta.
- **A5.4** Lo mismo para el pago si las ramas por método (tarjeta, QR, contra entrega) pasan de tres: se revisa al partir el paso.
- **A5.5** Tests: estrategias y `CheckoutStore` sin DOM, más un e2e de Playwright del checkout completo por cada método de envío, antes y después.
- **A5.6** Textos por defecto que hoy están en templates (`product-page.component.ts:353,373`: envío y devoluciones) pasan al perfil o a la configuración de la tienda.

### A6. Servicios y componentes grandes por caso de uso (los tres)

**Antipatrón:** God Object, en el resto del código:
- Backend: `transmisiones.service.js` (1067), `reservas.service.js` (1011), `pedidos.service.js` (892).
- Store: `catalog-page` (1146), `product-page` (852).
- Admin: `diseno.component.ts` (803), `seccion-form` (713), `image-upload` (683 + 761).

**Patrones:** *un caso de uso por archivo* (Command / Use Case) en el backend y *Container / Presentational* en los fronts.

- **A6.1** **Sin reescritura de golpe.** Se parte el archivo cuando una función nueva lo toque (regla del boy scout). Lo único obligatorio de esta spec es que nada nuevo crezca sobre ellos.
- **A6.2** Backend: `modules/reservas/casos/aceptar.js`, `cotizar.js`, `solicitar.js`…, cada uno con su transacción. `reservas.service.js` queda como fachada que los reexporta, para no romper imports.
- **A6.3** Límite orientativo de 400 líneas por archivo de componente o servicio. Pasarlo no bloquea, pero se anota en la pieza.

### A7. Composition Root para el CRUD genérico (Backend)

**Antipatrón:** cada archivo de rutas crea sus dependencias con `new` ("control freak"): `new GenericRepository`, `new GenericService` y `new GenericController`, cada uno con su política de lectura y sus middlewares de scope armados a mano.

**Patrones:** *Composition Root* + *Factory* + *Policy Object*.

- **A7.1** `crearCrud({ modelo, nombre, politica, serializer, schemas })` arma repositorio, servicio, controller **y** las rutas con sus middlewares: `authMiddleware`, `resolveTiendaId`, `scopeReadToResourceTienda`, `requireTiendaAccess(rol)` y `validate`.
- **A7.2** Políticas con nombre: `POLITICAS.adminTienda` y `POLITICAS.vitrinaPublica`. Así, olvidar `scopeReadToResourceTienda` en una ruta deja de ser posible.
- **A7.3** Se migran primero los CRUD de catálogo (categorías, marcas, atributos, variantes, imágenes), que ya comparten forma.

### A8. Contratos generados y núcleo compartido (los tres)

**Antipatrón:** copiar y pegar contratos, con cirugía de escopeta. Hay unos 35 archivos con el mismo nombre en Store y Admin, y ya distintos:

| Archivo | Store / Admin (líneas) | Líneas distintas |
|---|---|---|
| `reserva.model.ts` | 763 / 840 | 1603 |
| `diseno.model.ts` | 651 / 557 | 724 |
| `perfil-negocio.ts` | 97 / 166 | 245 |
| `tienda.model.ts` | 71 / 92 | 163 |
| `calendario.core.ts`, `senal-envivo.ts` | iguales | 0 |

**Patrones:** *fuente única de verdad* con *contract-first y generación de código* (el backend publica un *lenguaje publicado*) y un *núcleo compartido* (*shared kernel*) para el código de front que no es contrato.

- **A8.1** Cada serializer del backend (`serializeCategoriaAdmin`, `serializeCategoriaStore`…) tiene su **esquema Zod de salida**, en `<contexto>.contrato.js` junto al serializer, y entra al registro `CONTRATOS` (`kernel/contratos/registro.js`). El esquema describe **lo que viaja por la red**, no la fila de Prisma: un `Decimal` es texto, una fecha es texto ISO y un `BigInt` es texto. Por eso el test valida `JSON.parse(JSON.stringify(salida))` contra el esquema estricto, con filas de ejemplo que cubren los `null`. Un serializer sin contrato falla el test, salvo que esté en `DEUDA` (lista que solo baja).
- **A8.2** `npm run contratos` (en la raíz; corre el script del backend):
  1. Zod → JSON Schema con `z.toJSONSchema()` de la API v4 (`zod/v4`, ya incluida en el zod 3.25 instalado; sin dependencias nuevas). `zod-to-json-schema` se descarta: su autor lo dejó sin mantenimiento en noviembre de 2025 y archivó el repo en junio de 2026.
  2. JSON Schema → TypeScript con `json-schema-to-typescript`.
  3. Escribe `paquetes/contratos/src/<audiencia>/<recurso>.ts` (`tienda/` o `admin/`), con el aviso "GENERADO, no editar". El backend sigue sin una línea de TypeScript (`docs/ARQUITECTURA.md`, "Restricción dura"): genera el archivo, igual que Prisma genera su cliente.
- **A8.3** Cada front usa los tipos de **su** audiencia: la Tienda importa solo `@ecompyme/contratos/tienda/*` y el Admin solo `@ecompyme/contratos/admin/*` (lo vigila A8.9). Las diferencias legítimas entre Admin y Tienda salen solas, porque vienen de serializers distintos.
- **A8.4** Contratos al día: `npm run contratos -- --check` regenera en memoria y falla si los archivos del paquete no coinciden con los esquemas. Corre en el `npm test` del backend y en la Action de CI del monorepo. Como backend y fronts están en el mismo commit, "coincidir con `main` del backend" pasa a ser "coincidir en el mismo commit".
- **A8.5** El código de front que es igual en los dos pasa al paquete `paquetes/compartido` (`@ecompyme/compartido`) del monorepo (ver A8.10): `calendario.core.ts`, `senal-envivo.ts` y `texto-rico.ts` tal cual (con sus specs), y `grilla-mes` con lo distinto inyectado (A8.7). **`fechas.ts` no se mueve:** la de la Tienda (107 líneas) toma los nombres del diccionario de idiomas y la del Admin (26 líneas) usa `Intl` en español. Son dos implementaciones de la misma interfaz, y justamente esa interfaz es el `PROVEEDOR_FECHAS` de A8.7. Corrección del 2026-10-20: la versión anterior de esta spec la contaba entre los archivos iguales.
  - El paquete se consume **desde el código fuente** (`paths` del `tsconfig` de cada app), sin compilarlo aparte. Es lo que hace Nx con sus librerías Angular por defecto (`buildable: false`). La guía de Angular (`ng generate library`) pide compilar la librería antes de usarla y no apuntar `paths` al fuente, pero esa guía apunta a librerías que se publican. Aquí no se publica nada, los dos `tsconfig` tienen las mismas opciones de compilación y así se evita un paso de compilación (y un `--watch`) en cada cambio.
  - Cada app declara la dependencia en su `package.json` (`"@ecompyme/compartido": "*"`). Así Vercel sabe que, si cambia el paquete, tiene que volver a construir la app.
  - Tailwind de cada app lee las clases del paquete (`@source` en su `styles.css`).
- **A8.7** **Lo que cambia entre Store y Admin no se copia: se inyecta.** El código compartido es uno solo, y cada app aporta lo suyo. Ejemplo: `grilla-mes` tiene hoy 28 líneas distintas entre las dos copias, de tres tipos:

  | Variación | Ejemplo en `grilla-mes` | Patrón |
  |---|---|---|
  | Comportamiento | Nombres de los días: Store los toma del diccionario de idiomas; Admin, de una constante | **Strategy** por `InjectionToken` (`PROVEEDOR_FECHAS`): cada app registra su implementación en `app.config.ts` |
  | Apariencia | `bg-primary` en Store, `bg-blue-600` en Admin | **Design tokens**: el componente usa `primary` y cada app define su valor |
  | Función opcional | El punto de "destacado" solo en Store | **Opción** por `input()` (`marcarDestacados`) |

  Es el mismo patrón que los rubros (código común + lo distinto inyectado), con la app en el lugar del rubro. Un archivo sin variaciones (`texto-rico.ts`, `calendario.core.ts`, `senal-envivo.ts`) se mueve tal cual. Un `if (esAdmin)` dentro del código compartido está prohibido, igual que `esHotel()`.
  En `grilla-mes` (medido el 2026-10-20) la variación ya no es solo la de la tabla: la Tienda agregó la marca de campaña (`c.campana`, `etiquetaCampana`) y el tono `primary-tint`. Las dos son opciones por `input()` y tokens, como "destacado".
- **A8.6** Se migra un recurso a la vez, empezando por `categoria` (chico) y terminando por `reserva` (el más divergente). Un recurso cuyo endpoint hoy **no tiene serializer** (tienda, métodos de envío y de pago, cupón, pedido, entre otros: devuelven la fila de Prisma) necesita primero su serializer, con un test de equivalencia que pruebe que la respuesta no cambia.
- **A8.8** **Capa anticorrupción en cada front.** El contrato es el lenguaje del backend. Cada front tiene su propio modelo, y lo traduce en un solo lugar:
  - El DTO generado entra solo por la capa **data-access** (servicio HTTP, store de datos y su traductor `<recurso>DesdeApi(dto)` y, si envía datos, `<recurso>HaciaApi(modelo)`).
  - El **modelo de pantalla** (`models/<recurso>.model.ts`) es del front. Puede diferir del DTO: números en vez de los `Decimal` en texto, campos derivados (el árbol `subcategorias` de la Tienda, `productosCount` del Admin) o nombres propios.
  - Componentes, páginas y perfiles de rubro solo ven el modelo de pantalla, nunca el DTO. Si el backend cambia un campo, se toca el traductor y el error de compilación aparece ahí, no en las plantillas.
  - Antecedente: `FrontendStore/src/app/models/monto.ts` y los `…DesdeApi` del checkout (pieza 4). Cuando se migra cada recurso, su traductor pasa de `models/` a data-access, porque `models/` no puede importar contratos (A8.9).
- **A8.9** **Tipos de librería con reglas de dependencia** (como los tipos de Nx, pero sin Nx). Cada carpeta de cada front tiene un tipo, declarado en una sola tabla (`herramientas/fitness/dependencias.cjs`):

  | Tipo | Tienda | Admin | Puede importar |
  |---|---|---|---|
  | `feature` | `features/**` (salvo `services/`), `negocio/**` | `pages/**`, `dashboard/**`, `negocio/**` | todo, menos los contratos |
  | `ui` | `shared/components/**` | `shared/**` (componentes) | `ui`, `util` |
  | `data-access` | `core/services/**`, `features/*/services/**`, `state/**`, `features/*/estado/**` | `services/**`, `store/**` | `data-access`, `util`, **contratos** |
  | `util` | `shared/utils/**`, `core/utils/**`, `models/**` | `shared/**` (no componentes), `models/**` | `util` |

  Reglas que se vigilan siempre: una app no importa de otra; un paquete no importa de una app; `paquetes/compartido` no importa contratos ni pregunta qué app es (`if (esAdmin)` prohibido, como `esHotel()`); cada front importa solo los contratos de su audiencia (A8.3).
  - Fitness function con `dependency-cruiser` (resuelve `paths`, imports dinámicos de `loadComponent` y rutas relativas; un script con expresiones regulares tendría que reimplementarlo). Corre en `npm test` de la raíz y en CI.
  - Lo que hoy rompe una regla queda en su línea base de violaciones conocidas (`--ignore-known`), que solo puede bajar, igual que `DEUDA` en anti-identidad.
  - El nombre del tipo y la carpeta pueden cambiar. La regla no: el DTO solo lo ve data-access.
- **A8.10** **Monorepo** (decisión del 2026-10-20). Los tres repos pasan a uno con npm workspaces, sin Nx:

  ```
  ecompyme/                      (nombre por confirmar, ver impacto.md P1)
    apps/backend  apps/tienda  apps/admin
    paquetes/contratos  paquetes/compartido
    docs/            (sale de BackendNode: specs, proceso y tablero son de los tres)
    herramientas/    (plugin ecommerce-proceso, fitness de dependencias)
    .github/workflows/
  ```

  - Se conserva el historial de los tres: cada uno se reescribe en su carpeta (`git filter-repo --to-subdirectory-filter`) y se une con `merge --allow-unrelated-histories`. Los repos viejos se archivan, no se borran.
  - **Cambios de contrato en dos tiempos.** El monorepo deja el cambio en un commit atómico, pero el backend (Railway) y los fronts (Vercel) se siguen desplegando por separado (highlight.io lo advierte en su propio caso). Un campo que se quita o se renombra se hace en dos despliegues: primero el backend manda lo viejo y lo nuevo, y los fronts pasan a lo nuevo; después se quita lo viejo. Agregar un campo es seguro, si el backend sale antes que los fronts (el orden de siempre).
  - **Contract testing (Pact) descartado:** un solo equipo y un solo commit. El test de A8.1 más el `--check` de A8.4 cubren lo mismo, sin un broker.

### A9. Menores

| Antipatrón | Lugar | Patrón |
|---|---|---|
| `valueChanges.subscribe` sin cierre | Admin `tienda-form.component.ts:161,178` | Reactivo declarativo: `toSignal(control.valueChanges)` o `takeUntilDestroyed()` |
| Lecturas HTTP con `subscribe` + `signal.set` | Store y Admin (unos 360 `subscribe`) | `httpResource` / `rxResource` de Angular 22, al tocar cada pantalla |
| `await` en bucles sobre listas que crecen | `resenas-reservas.js:51`, `transmisiones.envivo.js:132` | Operaciones en lote: `updateMany` o `Promise.all` dentro de la transacción |
| Checkout sin tests propios | Store | Humble Object (A5.5) |

## Piezas (en orden; cada una se verifica antes de la siguiente)

| # | Pieza | Requisitos | Repos | Cambia algo visible |
|---|---|---|---|---|
| 1 | Aislamiento por tienda | A1 | Backend | No |
| 2 | Errores centralizados | A2 | Backend | No |
| 3 | Rubro por capacidades + secciones por registro | A3, A4 | Los tres | No |
| 3b | Rubro por capacidades en correos, serializer y service de reservas | A3 (resto) | Backend | No |
| 4 | Checkout por estrategias | A5 | Store | No |
| 5 | CRUD con Composition Root | A7 | Backend | No |
| 6a | Monorepo: mover los tres repos sin cambiar código y reconectar despliegues | A8.10 | Los tres | No |
| 6b | Contratos generados: mecanismo + `categoria` + capa anticorrupción de `categoria` | A8.1–A8.4, A8.8 | Los tres | No |
| 6c | Reglas de dependencia (fitness) | A8.9 | Fronts + paquetes | No |
| 6d | Núcleo compartido (`calendario.core`, `senal-envivo`, `texto-rico`, `grilla-mes`) | A8.5, A8.7 | Fronts + paquetes | No |
| 6e–6h | Recurso por recurso hasta `reserva` | A8.6, A8.8 | Los tres | No |
| — | Partir archivos grandes y menores | A6, A9 | Los tres | No, continuo: al tocar cada archivo |

**Por qué este orden:** la pieza 1 es la única con riesgo de fuga de datos. La 2 es mecánica y sin riesgo. La 3 hace cumplir reglas ya escritas. La 6 es la más grande y va por partes, un recurso a la vez.

## Decisiones tomadas

- **Registro `ALCANCE` (2026-10-17, aprobada):** nace en esta spec (pieza 1) con `tienda` y `global`, y multi-sede lo extiende. Así no hay dos listas, y multi-sede S2.1, S2.2, S2.5 y S2.6 se cierran aquí.
- **Mecanismo de la pieza 6 (2026-10-20, decisión de Diego tras investigar; cierra las dos preguntas abiertas):**
  - **Monorepo con npm workspaces, sin Nx** (A8.10). Un solo equipo, mucho código que cambia junto y la necesidad de commits atómicos entre backend y fronts. Con repos separados, el front queda atrasado cuando cambia la API: copiar tipos o publicarlos como paquete privado no evita que las versiones se separen (highlight.io, *The power of the monorepo: keep your fullstack app in sync*). Vercel soporta varios proyectos sobre un mismo repo, cada uno con su Root Directory y con salto de builds sin cambios (Vercel, *Using Monorepos*). Nx se descarta: con dos apps Angular y un backend, npm workspaces + `dependency-cruiser` cubre lo que se necesita sin otra herramienta que aprender.
  - **Patrones estratégicos de DDD, no DDD táctico completo:** *lenguaje publicado* (el backend es dueño de los contratos, A8.1–A8.4); *núcleo compartido* chico (solo lo idéntico de verdad, A8.5 y A8.7; los `reserva.model.ts` no entran porque son DTO distintos); *capa anticorrupción* en cada front (A8.8); tipos de librería con reglas de dependencia (A8.9). Referencias: Evans, *Domain-Driven Design Reference* (Shared Kernel, Published Language, Anticorruption Layer); Angular, *Creating libraries* (`ng generate library`).
  - **Tipos por generación (JSON Schema → TS), no por inferencia directa de Zod en un paquete:** el backend es JavaScript y no puede tener TypeScript. Inferir con `z.infer` desde un paquete obligaría a los fronts a leer JS con `allowJs` o a generar `.d.ts`, y los ataría a la versión de Zod del backend. El archivo generado es TypeScript plano, sin código en tiempo de ejecución, y cada cambio de contrato se ve en el diff del mismo commit. OpenAPI (`zod-to-openapi` + `openapi-typescript` / `ng-openapi-gen`) queda para después: exige declarar cada ruta, y `ng-openapi-gen` genera servicios que se saltarían la capa anticorrupción. El JSON Schema de hoy es el mismo que usaría OpenAPI 3.1, así que no es un camino cerrado.
  - Detalle y alternativas: [ADR-0003](../../adr/ADR-0003-monorepo-y-contratos-generados.md) e [impacto.md](impacto.md).

## Riesgos

- **Choque con multi-sede pieza 1:** los dos tocan `config/prisma.js` y `kernel/tenant/`. Esta pieza 1 va antes, y multi-sede parte de su `ALCANCE`.
- **A1.4 puede dar 404 donde hoy da 200:** una ruta que lee por id sin la tienda en el contexto, o con otra tienda a propósito (auth, plataforma). Mitigación: tests negativos (A1.7), `conTodasLasTiendas` en esos casos y probar el Admin completo con una tienda demo por rubro.
- **Jobs (A1.6):** si un job pasa a tener contexto y antes no lo tenía, puede procesar de menos. Cada job se prueba antes y después con datos de dos tiendas.
- **Codemod A2:** quitar un `catch` que hacía algo más. Mitigación: A2.2 (solo cuerpo `next(error)`) y revisar el diff.
- **Trabajo sin commit en los mismos archivos** (reservas, hotel, checkout): cerrar y commitear antes de cada pieza.
- **Pieza 6a, el despliegue de la mudanza:** al reconectar Vercel y Railway al repo nuevo se despliega el último commit de `main`. Si `main` tiene algo sin desplegar que pide SQL antes, saldría sin ese SQL. Mitigación: antes de 6a, lo desplegado es igual a `main` en los tres repos. Detalle, riesgos y reversa de cada paso en [impacto.md](impacto.md).
- **Versiones que se mueven al unir tres lockfiles en uno** (163 paquetes de primer nivel tienen versión distinta entre los tres; Tailwind 4.1.18 en la Tienda y 4.3.3 en el Admin). Mitigación: comparar las dependencias directas antes y después y fijar las que cambien.

## Fuera de alcance

- Postgres RLS: se evalúa después, junto con multi-sede S2.7.
- Reescribir de golpe los archivos grandes (A6.1).
- Cambiar el modelo de datos o la API pública. Solo cambian el aislamiento y los tipos generados.

## Preguntas abiertas

- ~~**Mecanismo del núcleo compartido (A8.5):** paquete npm privado, dependencia por git o monorepo.~~ **Cerrada el 2026-10-20: monorepo** (ver "Decisiones tomadas"). La recomendación anterior (dependencia por git) se descartó: igual exige publicar un tag por cada cambio y deja al front atrasado cuando cambia la API.
- ~~**Contratos (A8.2):** ¿los fronts copian los tipos generados o los consumen de un paquete?~~ **Cerrada el 2026-10-20:** de un paquete del monorepo (`paquetes/contratos`), separado del núcleo compartido. Los contratos son el lenguaje del backend y el núcleo es código de front, y tienen reglas de dependencia distintas (A8.9).

## Para el manual

No aplica: son cambios internos y la tienda y el Admin se ven igual. Lo que gana el dueño de la tienda es indirecto: sus datos quedan aislados de las otras tiendas aunque se agreguen funciones nuevas.
