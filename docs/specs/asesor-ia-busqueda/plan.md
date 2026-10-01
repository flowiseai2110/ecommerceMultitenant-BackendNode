# Plan técnico: búsqueda confiable del asesor IA

> Implementa [spec.md](spec.md). Tareas y estado: [tasks.md](tasks.md).

## Flujo

```
Cliente (chat) → POST /store/agente/mensajes
  agente.service.js
    obtenerFacetas(tiendaId)          ← categorías + colores de la tienda (cache 5 min)
    buildBuscarProductosToolDef(...)  ← tool con enum de categoria/color de ESA tienda
    Claude Haiku 4.5 → tool_use buscar_productos { query, precioMax?, soloConStock?, categoria?, color? }
    ejecutarBuscarProductos(...)      ← 1 query SQL: FTS + trigram + filtros
    tool_result al modelo (sin imágenes) → respuesta
  → { mensaje, productos } (tarjetas con imagen para el frontend)
```

## Decisiones

| Decisión | Por qué | Alternativa descartada |
|---|---|---|
| FTS con la config `spanish` de fábrica | Su stemmer ya une plural/singular y quita tildes (verificado: `zapatillas`/`Zapatilla` → `zapatill`, `clásica`/`clasica` → `clasic`). No requiere instalar nada | `unaccent` + config propia: innecesario, más DDL |
| `pg_trgm` `word_similarity` para typos | Cubre "sapatilla" y el único caso que el stemmer no une (`mujer`→`muj`, `mujeres`→`mujer`) | pgvector/embeddings: sobredimensionado para 40–150 productos |
| Términos con OR + `ts_rank` | Ordena por cuántas palabras calzan; con AND "negro" (que no está en los nombres) vaciaba los resultados | AND estricto (`websearch_to_tsquery`) |
| `$queryRaw` sin índice ni cambios de schema para FTS | Con ≤150 productos por tienda el cálculo al vuelo cuesta ms; un índice GIN no declarado lo borraría `prisma db push` | Columna `tsvector` generada + índice GIN |
| Categoría como filtro | Es el único atributo estructurado que ya existe en todas las tiendas | Esperar a tener campo género |
| Columna `colores TEXT[]` con paleta cerrada | Filtrable por igualdad en todas las tiendas; el comerciante controla el dato | `etiquetas` libres (sin normalizar), `metadata` JSON, `producto_atributos` (sin UI) |
| `enum` dinámico por tienda en la tool | El modelo elige de valores reales en vez de adivinar; valores fuera de la lista se ignoran en el backend | `strict: true`: no se usó para no arriesgar un 400 de la API; la validación server-side cubre el caso |

## Modelo de datos

```sql
-- docs/sql/agente_busqueda.sql (aplicado)
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- docs/sql/productos_colores.sql (PENDIENTE)
ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "colores" TEXT[] NOT NULL DEFAULT '{}';
```

`prisma/schema.prisma` → `productos.colores String[] @default([])`.

Paleta (misma lista en backend y admin, minúsculas sin tildes):
`negro, blanco, gris, beige, marron, azul, celeste, verde, amarillo, naranja, rojo, rosado, morado, dorado, plateado, multicolor`

- Backend: `COLORES_PRODUCTO` en `modules/catalogo/productos.schema.js`.
- Admin: `COLORES_PRODUCTO` en `src/app/models/producto.model.ts` (con etiqueta y muestra CSS).
- Si se agrega un color, cambiar **las dos listas**.

## Contrato de la tool

**Entrada** (`input_schema`, armado por tienda):

| Campo | Tipo | Notas |
|---|---|---|
| `query` | string, requerido | Tipo de producto y características |
| `precioMax` | number | Compara contra `precio_base` |
| `soloConStock` | boolean | Default true |
| `categoria` | enum | Categorías activas de la tienda; solo si tiene alguna. Incluye subcategorías al filtrar |
| `color` | enum | Colores usados por sus productos activos; solo si hay alguno |

**Salida al modelo:** `id, nombre, categoria, colores, descripcionCorta, precioBase, precioOferta, disponible`.
**Salida al frontend:** sin cambios (`agente.serializer.js`: tarjeta con imagen).

**Ranking:** `ts_rank(nombre·A + etiquetas·A + descripcion_corta·B) + 0.3 · suma(word_similarity ≥ 0.5 por palabra)`, luego `destacado`, luego `fecha_registro`. Límite 4.

Constantes a calibrar con uso real (`modules/agente/tools/buscar-productos.js`): `MAX_RESULTADOS = 4`, `UMBRAL_TYPO = 0.5`, `PESO_TYPO = 0.3`, `TTL_FACETAS_MS = 5 min`.

## Archivos por repo

**BackendNode**
- `modules/agente/tools/buscar-productos.js` — búsqueda, facetas, tool dinámica.
- `modules/agente/agente.service.js` — usa facetas, tool_result enriquecido, reglas del prompt.
- `modules/catalogo/productos.schema.js` — paleta + validación `colores`.
- `modules/catalogo/productos.serializer.js`, `productos.admin.routes.js` — exponen `colores` al admin.
- `prisma/schema.prisma`, `docs/sql/agente_busqueda.sql`, `docs/sql/productos_colores.sql`.

**FrontendAdmin**
- `src/app/models/producto.model.ts` — campo y paleta.
- `src/app/pages/productos/producto-detail/*` — selector de colores.

**FrontendStore** — sin cambios para esta spec.

## Orden de despliegue

1. SQL `pg_trgm` ✅
2. SQL `colores` en Supabase ← **antes** de cualquier deploy del backend: Railway corre `prisma generate` en `postinstall` y el cliente nuevo pide la columna.
3. Backend.
4. Admin.

## Riesgos y límites conocidos

- Un producto sin colores cargados no aparece cuando el modelo filtra por color. Mitigación futura: cascada de cero resultados (acción 4 del reporte).
- Filtrar por categoría equivocada deja sin resultados; la tool le pide al modelo no usarla si duda.
- El chat muestra las tarjetas de **todos** los resultados, aunque el texto recomiende uno (acción 3 / salida estructurada).
- Los pesos del ranking son un punto de partida, no valores medidos.
