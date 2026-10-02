# Spec: opciones y variantes de producto (registro estilo Falabella)

> Estado: **Fases 1 y 2 implementadas y probadas por el usuario (2026-10-01)** en los tres repos, sin commit. Fase 3 pendiente. Ver [tasks.md](tasks.md).
> Diseño técnico: [plan.md](plan.md).
> Repos involucrados: BackendNode, FrontendAdmin, FrontendStore.

## Problema

Antes, cada variante se registraba en un modal como un nombre libre ("Talla M, Color Azul"), una por una. Un polo con 5 colores y 3 tallas obligaba a llenar 15 modales, y nada impedía escribir "Azul M" en una y "M azul" en otra. Los colores del producto se marcaban por separado, sin saber qué talla había en qué color. La tienda mostraba una lista plana de botones ("Beige / 37") y el asesor IA no podía responder "¿hay talla M en negro?".

## Objetivo

Que el dueño registre productos con variantes como lo hacen Saga Falabella o Shopify: define las **opciones** (Color, Talla, Tamaño, Personaje...) y marca qué combinaciones existe. La tienda muestra un selector por opción y el asesor IA filtra por combinación con stock. Debe servir a **cualquier rubro**: la plataforma es multinegocio, así que nada puede estar fijo a la ropa.

## Conceptos

- **Opción:** una dimensión en la que varía el producto, con su lista de valores. Ej: Talla = [S, M, L]. Cada tienda la nombra como quiera; hay atajos (Talla ropa, Talla calzado, Tamaño, Capacidad, Sabor).
- **Opción Color:** caso especial que usa la paleta fija `COLORES_PRODUCTO` (16 colores). Su clave siempre es `color` y alimenta `productos.colores`, el filtro de color del asesor.
- **Opción principal (padre):** la PRIMERA opción. Agrupa las variantes en el editor y es la que tiene fotos propias. Es lo que cambia cómo se ve el producto: el color en un polo, el personaje en un peluche, el diseño en un plato.
- **Opciones hijas:** las demás. Cambian el producto sin cambiar la foto: talla, tamaño, capacidad.
- **Variante:** una combinación de valores que **existe** (Negro / 40 US), con su propio stock, precio y SKU. Es lo que se vende, se descuenta del inventario y entra al carrito.
- **Combinación que no existe:** el dueño la desmarca en el editor y no se guarda. Ej: el modelo negro solo viene en 40. Es distinto de **agotado**, que existe con stock 0.

## Alcance

**Incluye (Fases 1-2, hechas)**
- Hasta 3 opciones por producto, hasta 30 valores por opción, hasta 100 variantes.
- Editor padre → hijos en el admin: grupos por valor principal, hijos marcables, precio y stock por grupo y por valor del hijo.
- Autocompletado con las opciones y valores que la tienda ya usó en otros productos.
- Fotos por valor de la opción principal.
- Selector agrupado en la tienda, con miniatura con foto y galería que cambia según el valor elegido.
- Asesor IA con filtro por opciones de la tienda y combinaciones disponibles en el resultado.
- `productos.stock` = suma de las variantes, mantenido también al vender y al cancelar.
- Convivencia con variantes antiguas de nombre libre y conversión opcional.

**No incluye (Fase 3 y futuro)**
- Especificaciones / ficha técnica (Material, Género, Tipo de ajuste...).
- Guía de tallas.
- Dos opciones con paleta de color en el mismo producto (ej. esfera y correa de un reloj): la segunda va como texto.
- Precio de oferta por variante (hoy solo hay precio por variante; la oferta es del producto).

## Requisitos

### R1. Opciones
- R1.1 Un producto tiene 0 a 3 opciones. Cada opción tiene nombre (máx. 30), tipo `color` | `texto` y 1 a 30 valores (máx. 30 caracteres, sin repetir sin importar mayúsculas).
- R1.2 Solo una opción de tipo color. Sus valores deben ser de `COLORES_PRODUCTO`. Una opción de texto no puede llamarse "Color".
- R1.3 La primera opción es la principal. El dueño puede cambiarla con "Usar como principal".
- R1.4 Las opciones se pueden definir antes de crear el producto. El único botón Guardar guarda producto + variantes.

### R2. Variantes
- R2.1 Se generan las combinaciones de todas las opciones. El dueño desmarca las que no existen, dentro del grupo de cada valor principal.
- R2.2 Cada valor principal debe tener al menos un hijo marcado (si no, error al guardar).
- R2.3 Un valor que no quedó en ninguna variante no se guarda en las opciones (la tienda no lo ofrece).
- R2.4 Cada variante tiene stock (entero ≥ 0), precio opcional (vacío = precio del producto) y SKU opcional. Sin SKU propio, si el producto tiene SKU, se genera `SKU-VALOR1-VALOR2`.
- R2.5 Atajos masivos: stock por grupo ("Stock para todo Negro"), precio y stock por valor del hijo para todos los grupos ("256 GB → S/ 1800"), y stock/precio para todas con una sola opción.
- R2.6 Al guardar, una combinación que ya existía conserva su `id` (pedidos y carritos la referencian). Las que se quitan se **desactivan**, no se borran.

### R3. Stock y colores del producto
- R3.1 Con opciones, `productos.stock` = suma del stock de las variantes activas. El campo Stock del producto se vuelve de solo lectura en el admin.
- R3.2 Al vender o cancelar una variante, el stock del producto se mueve igual.
- R3.3 Con opción Color, `productos.colores` = sus valores. La paleta manual del producto se oculta.

### R4. Fotos
- R4.1 Cada foto pertenece a un valor de la opción principal o es general (`NULL`).
- R4.2 Se elige al subir la foto y al editarla ("¿De qué color/personaje es esta foto?"). La foto mejorada con IA conserva el valor.
- R4.3 Sin opciones, los colores marcados en el producto hacen de opción Color para las fotos.

### R5. Tienda
- R5.1 Con opciones: un grupo por opción, con "Nombre: valor elegido".
- R5.2 Opción principal: miniatura con su foto si tiene; si no, el círculo de color (color) o un botón de texto.
- R5.3 Opciones hijas: solo aparecen los valores que **existen** con lo ya elegido. Los que existen sin stock salen tachados y deshabilitados.
- R5.4 Cambiar el valor principal suelta los hijos que no tienen stock con él y lleva la galería a su primera foto.
- R5.5 Galería: fotos del valor elegido + generales. Si el valor no tiene fotos, las generales; sin valor elegido, todas.
- R5.6 Las opciones con un solo valor vienen ya elegidas.
- R5.7 Productos con variantes antiguas (sin atributos) siguen con la lista plana.

### R6. Asesor IA
- R6.1 La definición de `buscar_productos` incluye, por tienda, sus opciones reales como `enum` (hasta 5 opciones y 40 valores, sin contar color).
- R6.2 "Talla M en negro" exige UNA variante activa con ambos valores y con stock.
- R6.3 El resultado incluye `variantesDisponibles` ("Negro / M"), hasta 24 por producto.
- R6.4 Si el cliente pidió un color, la tarjeta del chat muestra la foto de ese color.

### R7. Variantes antiguas
- R7.1 Un producto con variantes de nombre libre y sin `metadata.opciones` sigue usando el modal de variante.
- R7.2 "Organizar por opciones" abre el editor; al guardar, las variantes antiguas se desactivan y se reemplazan por la matriz.

## Rubros validados (análisis 2026-10-01)

| Producto | Principal → hija | Nota |
|---|---|---|
| Polos, casacas, camisas, zapatos, ropa interior, medias | Color → Talla | Caso base |
| Sostenes | Color → Talla | Talla como un solo valor ("34B"), no banda × copa |
| Gorras, carteras | Color | Una sola opción: lista simple |
| Celulares | Color → Capacidad | Precio por capacidad con el atajo por valor del hijo |
| Bicicletas | Color → Aro | Precio por aro |
| Peluches | Personaje → Tamaño | Fotos por personaje |
| Juguetes | Personaje / Modelo | Fotos por personaje |
| Platos | Diseño → Presentación | Fotos por diseño |
| Relojes | Esfera → Correa | Segundo color como texto |

Conclusión: ningún caso necesita más de 2 niveles si los valores compuestos se escriben juntos ("34B", "8 GB / 256 GB").

## Fase 3 (pendiente): especificaciones y guía de tallas

Decisión del usuario: **campos por tienda creados al vuelo**, no plantillas fijas por rubro.
- El dueño escribe "Material: Algodón" en el producto. Si el campo no existe en su tienda, se crea en `producto_atributos` (tabla ya existente, con `nombre`, `valores[]`, `aplicaA`).
- Autocompletado del nombre del campo y de sus valores usados.
- `aplicaA` = categoría: al crear otro producto en la misma categoría aparecen sus campos habituales.
- Biblioteca opcional de sugerencias por rubro como chips ("¿Usar campos típicos de Calzado?").
- El asesor IA recibe los campos de la tienda como facetas, con el mismo patrón que `opciones` (R6.1).
- Guía de tallas: una tabla o imagen por categoría, reutilizable, con el link "Tabla de tallas" en la tienda.
