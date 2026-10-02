# Tareas: opciones y variantes de producto

> Implementa [spec.md](spec.md) según [plan.md](plan.md). Marcar `[x]` al cerrar cada tarea.

## Cómo retomar

1. SQL: `docs/sql/producto_imagenes_valor_opcion.sql`, **ya aplicado** en Supabase (2026-10-01). `producto_imagenes_color.sql` quedó como historial (reemplazado).
2. Estado: Fases 1 y 2 probadas por el usuario y funcionando. **Sin commit en los tres repos.**
3. Antes de tocar el modelo, revisar que `claveOpcion` y `COLORES_PRODUCTO` sigan iguales en backend, admin y tienda (ver plan.md).
4. El usuario sigue probando: anotar aquí las mejoras que aparezcan, en "Mejoras detectadas".

## Fase 1 — Opciones, matriz de variantes y asesor IA (hecha)

- [x] **T1.1** `producto-opciones.js`: `claveOpcion`, `claveDe`, `nombreVariante`, `claveCombinacion` y `sincronizarVariantesSchema` + `__tests__/producto-opciones.test.js`.
- [x] **T1.2** `producto-opciones.service.js`: `sincronizarVariantes` (transacción y escrituras en lote) y `opcionesUsadasPorTienda`.
- [x] **T1.3** Rutas `PUT /admin/productos/:id/variantes` y `GET /admin/productos/opciones`.
- [x] **T1.4** Inventario: bloqueo de los productos padre y `ajustarStockPadres` al vender y al cancelar.
- [x] **T1.5** Detalle público con `opciones` (serializer campo por campo).
- [x] **T1.6** Asesor IA: facetas `opciones`, filtro por combinación con stock, `variantesDisponibles` + `__tests__/buscar-productos.opciones.test.js`.
- [x] **T1.7** Admin: editor de opciones, guardado único, stock de solo lectura, colores tomados de la opción y conversión de variantes antiguas.
- [x] **T1.8** Tienda: selector agrupado por opción y lista plana para variantes antiguas.
- [x] **T1.9** Bug: `updateProductoSchema` pisaba `stock` con 0 (default de Zod) + test de regresión.

## Fase 2 — Padre → hijos y fotos por valor principal (hecha)

- [x] **T2.1** Columna `producto_imagenes.valor_opcion` con `COMMENT ON` (también en `atributos` y `metadata`). Prisma: `valorOpcion @map("valor_opcion")`.
- [x] **T2.2** `valorOpcion` en los schemas de imagen, el upload multipart, el confirmar IA y los serializers admin/store + `__tests__/producto-imagenes.valor-opcion.test.js`.
- [x] **T2.3** Asesor IA: la tarjeta prefiere la foto del color pedido.
- [x] **T2.4** Admin: editor padre → hijos (grupos plegables, hijos marcables, stock por grupo, precio/stock por valor del hijo, "Usar como principal") y poda de valores sin variantes.
- [x] **T2.5** Admin: `valor-opcion-picker` en la subida y en la edición de imagen, y badge del valor en la grilla.
- [x] **T2.6** Tienda: miniatura con foto para el valor principal, hijos que no existen ocultos, galería por valor principal.

## Fase 3 — Especificaciones y guía de tallas (pendiente)

- [ ] **T3.1** Backend: CRUD y búsqueda de `producto_atributos` por tienda y categoría (`aplicaA`). Endpoint de sugerencias como `GET /admin/productos/opciones`.
- [ ] **T3.2** Decidir dónde guardar los valores por producto: `metadata.especificaciones` (sin DDL) o una columna JSONB propia (permite índice GIN para el asesor).
- [ ] **T3.3** Admin: sección "Especificaciones" con pares campo/valor, creación al vuelo, autocompletado y campos habituales de la categoría.
- [ ] **T3.4** Asesor IA: facetas de especificaciones por tienda (patrón R6.1) e inclusión en el full-text.
- [ ] **T3.5** Tienda: bloque de especificaciones (viñetas como en Falabella) en el detalle.
- [ ] **T3.6** Guía de tallas por categoría (tabla o imagen) y link "Tabla de tallas" junto a la opción Talla.

## Mejoras detectadas (backlog)

- [ ] Las imágenes y las variantes sueltas (CRUD antiguo) no invalidan la caché pública del detalle; hoy dependen del TTL de 60 s.
- [ ] El admin no tiene tests del editor (Karma). Candidatos: `inicial` (exclusiones desde variantes guardadas), `payload` (poda de valores) y `validar`.
- [ ] Fotos con `valor_opcion` que ya no está en las opciones (valor renombrado o quitado): hoy solo se ven sin valor elegido. Evaluar reasignarlas o avisar en el admin.
