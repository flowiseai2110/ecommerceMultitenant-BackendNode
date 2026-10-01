# Tareas: búsqueda confiable del asesor IA

> Implementa [spec.md](spec.md) según [plan.md](plan.md). Marcar `[x]` al cerrar cada tarea.

## Cómo retomar

1. Aplicar **T0.2** (columna `colores`). Hasta entonces **no arrancar ni desplegar el backend**: el cliente Prisma ya está regenerado con `colores` y fallan todas las consultas de productos.
2. Seguir con la Fase 4 (verificación) en orden.
3. Commitear (Fase 5). Todo el código de las fases 1–3 está escrito pero **sin commit** en BackendNode y FrontendAdmin (rama `main`).

## Fase 0 — Base de datos (bloqueante)

- [x] **T0.1** Instalar `pg_trgm` en Supabase — `docs/sql/agente_busqueda.sql`.
- [ ] **T0.2** Crear columna `productos.colores` — `docs/sql/productos_colores.sql` en el SQL Editor.
  - Verificar: `select column_name from information_schema.columns where table_name='productos' and column_name='colores';` devuelve 1 fila.
- [x] **T0.3** `npx prisma generate` con `colores` en `schema.prisma` (hecho en local; en Railway corre solo en `postinstall`).

## Fase 1 — Búsqueda por texto (R1)

- [x] **T1.1** Reemplazar `contains` por FTS `spanish` + `word_similarity` en una sola `$queryRaw` con `tienda_id` explícito — `modules/agente/tools/buscar-productos.js`.
- [x] **T1.2** Ranking por relevancia; `destacado` solo desempata.
- [x] **T1.3** Probado contra la BD (transacción revertida) con los criterios de R1.1–R1.4.

## Fase 2 — Filtro por categoría (R2)

- [x] **T2.1** `obtenerFacetas()` con cache LRU de 5 min por tienda.
- [x] **T2.2** Tool dinámica: `enum` de categorías de la tienda; filtro incluye subcategorías; categoría desconocida se ignora.
- [x] **T2.3** `tool_result` al modelo con `categoria` y `descripcionCorta` — `agente.service.js`.
- [x] **T2.4** Probado con las funciones reales contra la BD (criterios R2.2, R2.3).

## Fase 3 — Colores (R3, R4)

- [x] **T3.1** Paleta `COLORES_PRODUCTO` + validación Zod (máx. 8) — `modules/catalogo/productos.schema.js`.
- [x] **T3.2** Exponer `colores` en listado y detalle del admin — `productos.serializer.js`, `productos.admin.routes.js`.
- [x] **T3.3** Parámetro `color` en la tool con `enum` de colores usados por la tienda; filtro `= ANY(p.colores)`; `colores` en el `tool_result`.
- [x] **T3.4** Selector de colores en el formulario de producto — FrontendAdmin `producto-detail.component.*`, `models/producto.model.ts`. Compila.
- [x] **T3.5** Filtro por color probado contra la BD (transacción revertida con la columna creada temporalmente).

## Fase 4 — Verificación end-to-end (después de T0.2)

- [ ] **T4.1** Levantar backend (`npm run dev`) y admin; abrir un producto existente y guardarlo **sin** tocar colores → debe guardar sin error.
- [ ] **T4.2** Marcar colores en el admin (ej. Chunky Mujer: negro, naranja; Running Boost Hombre: negro; Clásica Cuero Blanca: blanco), guardar, recargar → los colores persisten.
- [ ] **T4.3** Intentar guardar un color fuera de la paleta vía API → 400 "Color inválido".
- [ ] **T4.4** En el chat de la tienda (esperar ≤5 min o reiniciar backend para vaciar la cache):
  - "zapatillas negras para hombre" → recomienda Running Boost Hombre; no aparece la Clásica Blanca.
  - "zapatillas blancas" → Clásica Cuero Blanca.
  - "sapatilla para mujer" → Chunky o Fashion Pastel.
  - "tienen polos?" → responde que no hay, sin inventar.
- [ ] **T4.5** Revisar que el catálogo público (home, listado, detalle) sigue cargando normal tras el cambio de schema.

## Fase 5 — Cierre

- [ ] **T5.1** Commit en BackendNode con: `buscar-productos.js`, `agente.service.js`, `config/index.js` (max_tokens 200, del ajuste de brevedad), `productos.schema.js`, `productos.serializer.js`, `productos.admin.routes.js`, el campo `colores` de `schema.prisma`, `docs/sql/agente_busqueda.sql`, `docs/sql/productos_colores.sql`, `docs/specs/asesor-ia-busqueda/`.
  - Ojo: `schema.prisma` ya tenía cambios sin commit ajenos a esta spec (p. ej. reseñas) y `productos.store.routes.js` no fue tocado por esta spec; separar con `git add -p`.
- [ ] **T5.2** Commit en FrontendAdmin con los 3 archivos del selector de colores.
- [ ] **T5.3** Desplegar en el orden de [plan.md § Orden de despliegue](plan.md#orden-de-despliegue).
- [ ] **T5.4** Actualizar el estado de [spec.md](spec.md) a "implementada".

## Siguiente spec sugerida

Acciones del reporte que dependen de esta: **4** (cascada de cero resultados: relajar color/categoría antes de responder "no hay") y **3** (mostrar solo las tarjetas que el modelo recomienda). La 4 mitiga el riesgo de productos sin colores cargados.
