# Plan técnico: opciones y variantes de producto

> Requisitos: [spec.md](spec.md). Tareas: [tasks.md](tasks.md).

## Modelo de datos

Sin tablas nuevas. Se reutilizan columnas JSONB existentes y se agrega una columna a `producto_imagenes`. Las tres llevan `COMMENT ON COLUMN` en la base (ver `docs/sql/producto_imagenes_valor_opcion.sql`).

| Columna | Contenido |
|---|---|
| `productos.metadata.opciones` | `[{ nombre, tipo: "color"\|"texto", valores[] }]` en orden. La primera es la principal. |
| `producto_variantes.atributos` | `{ "color": "negro", "talla": "40 US" }`, una clave por opción. `NULL` en variantes antiguas. |
| `producto_imagenes.valor_opcion` | Valor de la opción principal al que pertenece la foto; `NULL` = general. VARCHAR(30). |

**Clave de opción:** `claveOpcion(nombre)` = minúsculas, sin tildes, `_` en vez de espacios y símbolos, máx. 30 ("Tamaño" → `tamano`). La de color siempre es `color`. La regla está copiada en tres lugares y debe mantenerse igual:
- Backend: `modules/catalogo/producto-opciones.js` (`claveOpcion`, `claveDe`).
- Admin: `src/app/models/producto.model.ts` (`claveOpcion`).
- Tienda: `src/app/models/producto-opcion.model.ts` (`claveOpcion`).

La paleta `COLORES_PRODUCTO` también está triplicada: `productos.schema.js` (backend), `producto.model.ts` (admin) y `producto-opcion.model.ts` (tienda, con etiqueta y muestra).

## Backend

### Endpoints nuevos (`modules/catalogo/productos.admin.routes.js`)
- `PUT /admin/productos/:id/variantes`: rol editor. Body `{ opciones, variantes: [{ id?, atributos, sku?, precio?, stock }] }`, validado por `sincronizarVariantesSchema`. Invalida la caché del detalle público.
- `GET /admin/productos/opciones?tiendaId=`: rol viewer. Opciones usadas por la tienda para autocompletar. Va **antes** de `/:id`.

### `producto-opciones.js` (lógica pura, con tests)
- `sincronizarVariantesSchema` valida R1 y R2: opciones repetidas por clave, una sola de color, colores de la paleta, cada variante con un valor por opción y dentro de sus valores, combinaciones sin repetir. La opción color se normaliza a nombre "Color".
- `nombreVariante` arma "Marrón / M" con las etiquetas de la paleta.
- `claveCombinacion` reconoce una combinación sin importar mayúsculas ni el orden de las claves.

### `producto-opciones.service.js`
- `sincronizarVariantes` corre en una transacción con timeout de 15 s:
  1. Producto filtrado por `tiendaId` (404 si no es de la tienda).
  2. Reutiliza la variante por `id` o por combinación de atributos, incluso una inactiva (se reactiva).
  3. Escrituras **en lote**: un `UPDATE ... FROM unnest(...)`, un `createMany` y un `updateMany` para desactivar. Con la latencia del pooler de Supabase (150-300 ms por viaje), un update por variante no cabría en la transacción.
  4. Actualiza el producto: `metadata.opciones`, `stock` = suma y `colores` = valores de la opción color.
- `opcionesUsadasPorTienda` agrega `metadata.opciones` de los productos de la tienda con `WITH ORDINALITY` para conservar el orden S, M, L, y une por clave "Talla" y "talla".

### Inventario (`modules/inventario/inventario.service.js`)
- `validarYBloquearStock` también bloquea (`FOR UPDATE`) los productos padre de las variantes, en el mismo SELECT ordenado que los productos sueltos, para evitar deadlocks.
- `ajustarStockPadres` mueve `productos.stock` en el mismo delta al vender o reponer variantes. `GREATEST(..., 0)` protege a los productos antiguos cuyo stock propio no cuadra.

### Detalle público (`productos.store.routes.js` + `productos.serializer.js`)
- Expone `opciones` desde `metadata->'opciones'`, copiado campo por campo: es lo único de `metadata` que llega al público.
- Las imágenes del detalle incluyen `valorOpcion`.

### Asesor IA (`modules/agente/tools/buscar-productos.js`, `agente.service.js`)
- `obtenerFacetas` suma `opciones` (claves y valores de las variantes activas, sin color), con la misma caché de 5 min.
- `buildBuscarProductosToolDef` agrega la propiedad `opciones` (objeto con un `enum` por clave, `additionalProperties: false`).
- Filtro: `EXISTS` sobre una variante activa con todos los valores pedidos (y color, y stock si `soloConStock`). Solo color: si el producto tiene variantes por color, exige ese color con stock.
- "Con stock" = `p.stock > 0` o alguna variante activa con stock.
- La foto de la tarjeta prefiere `valor_opcion = color pedido`.
- Al modelo le llega `variantesDisponibles` solo si el producto tiene variantes.

### Imágenes
- `valorOpcion` en `createImagenSchema`, `updateImagenSchema`, `uploadImagenSchema` (multipart: `""` → `null`) y `confirmarIaSchema`.
- `producto-imagenes.controller.js` y `ai-imagen.controller.js` lo persisten.

### Bug corregido en el camino
`updateProductoSchema` heredaba `stock: ...default(0)`: un PUT sin `stock` lo pisaba con 0. Ahora `stock` es opcional sin default al actualizar (test en `producto-opciones.test.js`).

## Admin

- `pages/productos/producto-opciones-editor/`: editor standalone. Usa `linkedSignal` desde `opcionesIniciales`/`variantesIniciales`, así se reinicia solo al recargar o al guardar.
  - `OpcionEditor.uid` (solo del editor) da identidad estable. La clave de una combinación es `uid=valor` ordenado, de modo que renombrar o reordenar opciones no pierde stock ni exclusiones.
  - `excluidas`: combinaciones que no existen. Al cargar, lo que no está guardado como variante queda excluido; los valores nuevos nacen incluidos.
  - Contrato con el formulario: `validar()`, `payload()`, `principal()`, `tieneOpciones()`, `tieneColor()`, `stockTotal()` y el output `(cambio)`.
- `producto-detail`: el editor se ve también en modo nuevo. `saveProducto` valida el editor **antes** de guardar el producto, guarda el producto (con opciones no manda `stock` ni `colores`) y luego llama a `guardarVariantes`. Si esto falla, el producto queda guardado y el formulario sigue sucio.
- `shared/valor-opcion-picker/`: selector "¿De qué X es esta foto?", usado por `product-image-uploader` (paso final) y por el modal de editar imagen.

## Tienda

- `product-page.component.ts`:
  - `opcionesProducto` está vacío si no hay opciones o si las variantes son antiguas: se muestra la lista plana.
  - `gruposOpciones` muestra el principal con `existe()`, los hijos con `existe()` según lo elegido, `disponible` con `hayStock()` y la foto con `fotoDeValor()`.
  - `elegirValor` suelta lo incompatible, fija `selectedVariant` cuando la combinación está completa y mueve la galería.
  - `imagenesVisibles` filtra por el valor principal elegido.

## Orden de despliegue

1. Correr `docs/sql/producto_imagenes_valor_opcion.sql` en Supabase.
2. `npx prisma generate`, y desplegar o reiniciar el backend. En local corre con `node server.js` sin nodemon: hay que reiniciarlo a mano.
3. Admin y tienda. Con el backend viejo, la tienda no recibe `opciones` y muestra la lista plana.

Si el backend ya usaba la columna `color` de la Fase 2 inicial, entre el SQL y el reinicio fallan las consultas de imágenes: hacerlo seguido.
