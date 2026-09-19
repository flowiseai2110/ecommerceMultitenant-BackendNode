# Arquitectura — Monolito Modular por Bounded Context

> Estado: **en migración incremental** (PR 0 en adelante). Este documento es la
> fuente de verdad de las convenciones. Ante cualquier duda entre el código
> viejo y esto, esto manda para código nuevo o refactorizado.

## Restricción dura: JavaScript ESM

Todo el código de la aplicación se escribe en **JavaScript ESM (`.js`)**.

- No se crean archivos `.ts`, `.mts` ni `.d.ts`.
- No se añaden `typescript`, `ts-node` ni `tsx` a `package.json`.
- No se migra a TypeScript en ningún paso.
- Si un patrón de arquitectura depende de tipos de TS, se **adapta a JS**
  (Zod + JSDoc + serializers) en lugar de saltárselo.

> Nota: el cliente que Prisma 7 genera en `generated/` es TypeScript, pero es
> **código generado** consumido vía import; no cuenta como código de la app y no
> se edita a mano.

## Contratos en las fronteras (sin TS)

Los "tipos en fronteras" se resuelven con tres mecanismos, no con tipos estáticos:

1. **Entrada → Zod.** Cada ruta valida `body`/`params`/`query` con un schema
   Zod. **El schema ES el contrato.** El resto del sistema asume que lo que pasó
   por el schema es confiable (input parseado y confiable hacia adentro).
2. **Salida → serializers explícitos por audiencia.** Nunca se devuelve el
   resultado crudo de Prisma. Cada audiencia (`admin`, `store`) tiene un
   serializer que construye el objeto **campo por campo**. Esto es la barrera
   contra over-fetching (que el storefront reciba `precioCosto`, PII, etc.).
3. **Documentación → JSDoc.** Las firmas de services y repositories llevan
   JSDoc (`@param`, `@returns`) describiendo la forma esperada. Es documentación
   y ayuda del editor, no validación en runtime.

## Capas y responsabilidades

Regla mental: *funcional core / imperative shell*. La ruta lee lineal en
términos de dominio; los detalles (transporte, persistencia, terceros) se
empujan a la frontera que los posee.

```
route (transporte)  →  controller  →  service (negocio)  →  repository (Prisma)
        │                   │                  │
   Zod (entrada)      serializer         JSDoc contrato
   guards/tenant      (salida)           orquesta terceros
```

| Capa | SÍ hace | NO hace |
|------|---------|---------|
| **route** | método/path, wiring de middlewares, rate limit, declarar guards y schemas Zod | lógica de negocio, queries Prisma |
| **controller** | resolver estado del request, delegar input confiable al service, mapear salida con el **serializer** de la audiencia | reglas de negocio, tocar Prisma |
| **service** | reglas de negocio, secuencia de workflow, transacciones cross-repo, orquestar terceros (email, storage) | conocer `req`/`res`, formatear respuestas HTTP |
| **repository** | queries y composición de queries, defaults de storage, transacciones de persistencia | llamar APIs externas, colas, mailers, HTTP |
| **serializer** | construir el DTO de salida campo por campo por audiencia | consultar la BD, lógica de negocio |

- Prisma **solo** se toca en repositories. `$transaction` que cruza varios
  repositories puede vivir en el service, pero el SQL/consultas van en repos.
- Los services reciben **input ya confiable** (parseado por Zod en la ruta) y
  devuelven objetos de dominio; el controller los pasa por el serializer.

## El tenant es un invariante del dominio, no un parámetro opcional

El multi-tenant deja de resolverse de tres formas distintas. Se unifica en un
**contexto de tenant** (`req.tenant`) poblado por el kernel, y las firmas de
dominio reciben `tiendaId` como **argumento obligatorio**, no como
`tiendaId = null`. Filtrar por tienda no puede ser algo que cada ruta recuerde
hacer: lo exige el dominio.

## Layout de módulos (destino)

```
modules/
  <contexto>/
    <contexto>.admin.routes.js  # rutas de la audiencia admin (o .routes.js si es única)
    <contexto>.store.routes.js  # rutas de la audiencia store (storefront público)
    <contexto>.controller.js    # delega y serializa
    <contexto>.service.js       # negocio (JSDoc en firmas)
    <contexto>.repository.js    # Prisma (JSDoc en firmas)
    <contexto>.schema.js        # schemas Zod de entrada
    <contexto>.serializer.js    # serializers de salida por audiencia
kernel/                         # cross-cutting compartido
  tenant/                       # contexto y guards de tenant
  http/                         # apiResponse, helpers de serialización
  errors/                       # (reexporta utils/errors.js)
```

Cuando un contexto sirve a dos audiencias con contratos distintos, se separan las
rutas en `<contexto>.admin.routes.js` y `<contexto>.store.routes.js`, cada una con
su serializer de salida. Los `routes/admin/index.js` y `routes/store/index.js`
siguen siendo el punto de montaje y sólo importan desde `modules/<contexto>/`.

**Estado de la extracción:** el módulo **`catalogo` está completo** — `categorias`,
`productos`, `producto-variantes`, `producto-atributos` y `producto-imagenes` viven
en `modules/catalogo/`. La caché pública vive en `catalogo/productos.cache.js`
(antes la ruta admin importaba de la ruta store — dependencia cruzada resuelta).

Los controllers de imagen/IA (`producto-imagenes.controller.js`,
`ai-imagen.controller.js`) y sus servicios (`image.service`, `ai-image.service`)
siguen en `controllers/` y `services/` por ser cross-context (los usa también el
upload de productos); se tratarán al definir un contexto de medios/AI. El guard
`requireIaTaskAccess` conserva un chequeo de membresía inline (TODO PR5: mover al
guard compartido del kernel).

El contexto **`tenants` (tiendas, users, invitations) está extraído** en
`modules/tenants/`, con cachés propias (`tiendas.cache.js`) y el chequeo de
membresía consolidado en `kernel/tenant/membership.js` (`findActiveMembership`,
usado por `requireTiendaAccess` y el guard de tareas de IA). Los servicios
`tienda-diseno`, `tienda-plantillas-whatsapp`, roles y seeds siguen en
`services/` (compartidos / datos maestros).

Contextos **`ordenes`** (pedidos, badge cache) e **`inventario`** (stock:
validar/bloquear/descontar/reponer, operando sobre la `tx` de Órdenes) extraídos.
`updatePago` (transición de estado de pago) vive en Órdenes por ser parte del
ciclo de vida del pedido.

Contextos **`pagos`** (metodos-pago + QR), **`envios`** (metodos-envio) y
**`cupones`** (CRUD admin + validación pública) extraídos.

**Todos los bounded contexts del plan están migrados a `modules/`.** Lo que queda
en `routes/` (`persona`, `studio`, `uploads`, `images`) son concerns
cross-cutting/auxiliares (datos maestros, AI, media) que no eran dominios del
plan; se pueden agrupar en un contexto de medios/AI en el futuro si hace falta.

Bounded contexts objetivo: **catálogo**, **órdenes**, **inventario**, **pagos**,
**tenants/usuarios**. (Carrito se mantiene client-side por decisión de producto;
no hay contexto Carrito en el backend por ahora.)

## Serializers — convención

Un serializer es una función pura por audiencia que arma el objeto campo por
campo. Vive en `<contexto>.serializer.js`.

```js
/**
 * DTO de producto para el storefront (público). NO expone costo ni alertas.
 * @param {object} row - Fila de Prisma (o proyección) del producto.
 * @returns {object} DTO público del producto.
 */
export function serializeProductoStore(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    precio: row.precio,
    // precioCosto y stockAlerta NUNCA salen al store
  };
}
```

Para listas y respuestas paginadas se usan los helpers de `kernel/http`
(`serializeList`, `serializePaginated`) — ver ese módulo.

## Plan de migración (por riesgo, cada paso = 1 PR, app siempre verde)

- ✅ **PR 0** — Fundaciones: este documento + helpers de serialización.
- ✅ **PR 1** — Kernel: contexto de tenant unificado + guards componibles.
- ✅ **PR 2** — Sacar Prisma de rutas/controladores; quitar cableado muerto.
- ✅ **PR 3** — Serializers de salida por audiencia (GET del store).
- ✅ **PR 4** — Extraer módulo **Catálogo** (categorías, productos, variantes,
  atributos, imágenes) — plantilla del resto.
- ✅ **PR 5** — Extraer **Tenants/Usuarios** (tiendas, users, invitations) +
  consolidar membresía en el kernel.
- ✅ **PR 6** — Extraer **Inventario** desde Órdenes (concurrency-critical).
- ✅ **PR 7** — Extraer **Órdenes** (pedidos).
- ✅ **PR 8** — Extraer **Pagos** (metodos-pago + QR), **Envíos** y **Cupones**.

Pendiente opcional (fuera del plan de dominios): agrupar `persona`, `studio`,
`uploads`, `images` en un contexto de medios/AI, y añadir serializers admin a los
endpoints de configuración (metodos-pago/envio) que hoy conservan su salida
previa.
