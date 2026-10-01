# Spec: búsqueda confiable del asesor IA

> Estado: **en implementación, bloqueado por base de datos** (ver [tasks.md](tasks.md)).
> Diseño técnico: [plan.md](plan.md). Contexto general del asesor: [modules/agente/arquitectura.md](../../../modules/agente/arquitectura.md).
> Investigación de respaldo: `ecommerceMultitenant-FrontendStore/reports/Perfeccionar chatbot ecommerce multitenant.md` (acciones 1 y 2).

## Problema

La tool `buscar_productos` del asesor buscaba con `contains` por palabra. En pruebas reales:

1. **Plural/singular y tildes:** "zapatillas" no encontraba "Zapatilla Chunky Mujer".
2. **Ruido:** con OR por palabra y orden por `destacado`, un producto irrelevante destacado le ganaba al relevante.
3. **Atributos contradictorios:** pidieron "zapatilla negra para hombre" y recomendó "Zapatilla Clásica Cuero Blanca". La tool no filtraba por género ni color, y el color **no existe como dato** en ninguna tienda (atributos vacíos, admin sin campo).

El modelo no puede corregir con el prompt lo que la búsqueda no le da: lo que debe ser correcto se garantiza en SQL.

## Objetivo

Que el asesor encuentre el producto que el cliente describe, en español coloquial, y nunca recomiende uno que contradiga la categoría o el color pedidos.

## Alcance

**Incluye**
- Búsqueda full-text en español con tolerancia a typos, ordenada por relevancia.
- Filtro por categoría de la tienda (cubre género y uso cuando la tienda organiza así su catálogo).
- Campo "Colores" por producto, cargado por el comerciante en el admin, y filtro por color en la tool.

**No incluye** (specs futuras, ver acciones 3–12 del reporte)
- Cascada de relajación cuando no hay resultados.
- Mostrar solo las tarjetas que el modelo recomienda.
- Talla como filtro, género como campo propio, relleno automático de colores con IA.

## Requisitos

Formato: *Cuando [condición], el sistema debe [comportamiento].*

### R1 — Búsqueda por texto
- **R1.1** Cuando el cliente escribe una palabra en plural, singular, con o sin tilde, el sistema debe encontrar los productos que la contienen en otra forma.
  - Criterio: "zapatillas chunky mujer" → primer resultado "Zapatilla Chunky Mujer"; "clasica blanca" → "Zapatilla Clásica Cuero Blanca".
- **R1.2** Cuando la consulta tiene un error de tipeo leve, el sistema debe igual encontrar el producto.
  - Criterio: "sapatilla mujeres" → "Zapatilla Chunky Mujer" entre los primeros.
- **R1.3** Cuando varios productos coinciden, el sistema debe ordenar primero los que calzan más palabras de la consulta; `destacado` solo desempata.
  - Criterio: "zapatilla running hombre negro" → primero "Zapatilla Running Boost Hombre".
- **R1.4** Cuando nada coincide, el sistema debe devolver una lista vacía (no productos al azar).
  - Criterio: "polo rojo" en una tienda de zapatillas → 0 resultados.
- **R1.5** Toda búsqueda debe quedar limitada a la tienda del request (`tiendaId` server-side), a productos activos y, por defecto, con stock.

### R2 — Filtro por categoría
- **R2.1** La tool debe ofrecer al modelo solo las categorías activas reales de esa tienda.
- **R2.2** Cuando el modelo elige una categoría, el sistema debe devolver solo productos de esa categoría o de sus subcategorías.
  - Criterio: "zapatillas running negro" + categoría Hombre → no aparece "Zapatilla Clásica Cuero Blanca".
- **R2.3** Cuando el modelo manda una categoría que la tienda no tiene, el sistema debe ignorar el filtro y buscar igual.

### R3 — Colores del producto
- **R3.1** El comerciante debe poder marcar uno o más colores (máx. 8) de una paleta fija de 16 en el formulario de producto del admin.
- **R3.2** El backend debe rechazar cualquier color fuera de la paleta (validación Zod).
- **R3.3** La tool debe ofrecer como filtro solo los colores que usan los productos activos de esa tienda; si no hay ninguno, no ofrece el filtro.
- **R3.4** Cuando el modelo elige un color, el sistema debe devolver solo productos que tienen ese color cargado.
  - Criterio: "zapatillas" + color negro → solo productos con `negro` en `colores`.
- **R3.5** Un color recién cargado debe estar disponible en el chat en ≤ 5 minutos.

### R4 — Datos para el modelo
- **R4.1** Cada producto que recibe el modelo debe incluir nombre, categoría, colores, descripción corta, precios y disponibilidad, para que pueda descartar contradicciones que el filtro no cubrió.
- **R4.2** Las URLs de imagen no se envían al modelo (solo al frontend).

## Dependencia crítica: base de datos

Toda la spec depende de dos cambios en Postgres (Supabase), aplicados a mano con los scripts de `docs/sql/`:

| Cambio | Script | Estado |
|---|---|---|
| Extensión `pg_trgm` | `docs/sql/agente_busqueda.sql` | ✅ aplicado |
| Columna `productos.colores` | `docs/sql/productos_colores.sql` | ⬜ **pendiente — bloqueante** |

Sin la columna `colores`, el backend con el cliente Prisma regenerado **rompe todas las consultas de productos**, no solo el chat.
