# Spec: corrección de antipatrones (los tres repos)

> Estado (2026-10-17): **aprobada** para las piezas 1–5. El mecanismo del núcleo compartido (A8.5) se decide al empezar la pieza 6. Tareas: [tasks.md](tasks.md).
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

- **A8.1** Cada serializer del backend (`serializeCategoriaAdmin`, `serializeCategoriaStore`…) tiene su **esquema Zod de salida**. Un test valida que la salida del serializer cumple su esquema.
- **A8.2** `npm run contratos` en el backend:
  1. Zod 3 → JSON Schema (`zod-to-json-schema`);
  2. JSON Schema → TypeScript (`json-schema-to-typescript`);
  3. escribe `src/app/contratos/*.generado.ts` en los dos fronts, con un aviso de "no editar".
- **A8.3** Cada front genera los tipos de **su** serializer: las diferencias legítimas entre Admin y Store salen solas.
- **A8.4** CI de cada front: si los contratos generados no coinciden con los del backend en `main`, falla.
- **A8.5** El código de front que es igual en los dos (`calendario.core.ts`, `senal-envivo.ts`, `texto-rico.ts`, `grilla-mes`, `fechas.ts`) pasa a un paquete compartido. Ver la pregunta abierta sobre el mecanismo.
- **A8.7** **Lo que cambia entre Store y Admin no se copia: se inyecta.** El código compartido es uno solo, y cada app aporta lo suyo. Ejemplo: `grilla-mes` tiene hoy 28 líneas distintas entre las dos copias, de tres tipos:

  | Variación | Ejemplo en `grilla-mes` | Patrón |
  |---|---|---|
  | Comportamiento | Nombres de los días: Store los toma del diccionario de idiomas; Admin, de una constante | **Strategy** por `InjectionToken` (`PROVEEDOR_FECHAS`): cada app registra su implementación en `app.config.ts` |
  | Apariencia | `bg-primary` en Store, `bg-blue-600` en Admin | **Design tokens**: el componente usa `primary` y cada app define su valor |
  | Función opcional | El punto de "destacado" solo en Store | **Opción** por `input()` (`marcarDestacados`) |

  Es el mismo patrón que los rubros (código común + lo distinto inyectado), con la app en el lugar del rubro. Un archivo sin variaciones (`texto-rico.ts`, `calendario.core.ts`, `senal-envivo.ts`) se mueve tal cual. Un `if (esAdmin)` dentro del código compartido está prohibido, igual que `esHotel()`.
- **A8.6** Se migra un recurso a la vez, empezando por `categoria` (chico) y terminando por `reserva` (el más divergente).

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
| 4 | Checkout por estrategias | A5 | Store | No |
| 5 | CRUD con Composition Root | A7 | Backend | No |
| 6 | Contratos generados + núcleo compartido | A8 | Los tres | No |
| — | Partir archivos grandes y menores | A6, A9 | Los tres | No, continuo: al tocar cada archivo |

**Por qué este orden:** la pieza 1 es la única con riesgo de fuga de datos. La 2 es mecánica y sin riesgo. La 3 hace cumplir reglas ya escritas. La 6 es la más grande y va por partes, un recurso a la vez.

## Decisiones tomadas

- **Registro `ALCANCE` (2026-10-17, aprobada):** nace en esta spec (pieza 1) con `tienda` y `global`, y multi-sede lo extiende. Así no hay dos listas, y multi-sede S2.1, S2.2, S2.5 y S2.6 se cierran aquí.

## Riesgos

- **Choque con multi-sede pieza 1:** los dos tocan `config/prisma.js` y `kernel/tenant/`. Esta pieza 1 va antes, y multi-sede parte de su `ALCANCE`.
- **A1.4 puede dar 404 donde hoy da 200:** una ruta que lee por id sin la tienda en el contexto, o con otra tienda a propósito (auth, plataforma). Mitigación: tests negativos (A1.7), `conTodasLasTiendas` en esos casos y probar el Admin completo con una tienda demo por rubro.
- **Jobs (A1.6):** si un job pasa a tener contexto y antes no lo tenía, puede procesar de menos. Cada job se prueba antes y después con datos de dos tiendas.
- **Codemod A2:** quitar un `catch` que hacía algo más. Mitigación: A2.2 (solo cuerpo `next(error)`) y revisar el diff.
- **Trabajo sin commit en los mismos archivos** (reservas, hotel, checkout): cerrar y commitear antes de cada pieza.

## Fuera de alcance

- Postgres RLS: se evalúa después, junto con multi-sede S2.7.
- Reescribir de golpe los archivos grandes (A6.1).
- Cambiar el modelo de datos o la API pública. Solo cambian el aislamiento y los tipos generados.

## Preguntas abiertas

- **Mecanismo del núcleo compartido (A8.5):**
  1. Repo propio publicado como paquete npm privado: versionado, pero hay que publicar en cada cambio.
  2. Dependencia por git (`"@tienda/compartido": "github:…#v1.2"`): sin registro, versionado por tag.
  3. Monorepo con los tres repos: la opción más limpia a largo plazo, pero cambia despliegues (Vercel, Railway) y el historial.

  **Recomendación:** la 2 ahora (no cambia despliegues), y evaluar la 3 si el núcleo compartido crece.
- **Contratos (A8.2):** ¿los fronts copian los tipos generados con un script, o los consumen del mismo paquete de A8.5? Propuesta: del mismo paquete, para tener un solo mecanismo.

## Para el manual

No aplica: son cambios internos y la tienda y el Admin se ven igual. Lo que gana el dueño de la tienda es indirecto: sus datos quedan aislados de las otras tiendas aunque se agreguen funciones nuevas.
