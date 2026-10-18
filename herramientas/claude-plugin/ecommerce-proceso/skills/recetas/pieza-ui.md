# Receta: pieza de UI que cambia por rubro (slot)

Para algo que un componente compartido (header, pie, menú inferior, home, cuenta) dibuja distinto según el rubro. Nunca un `@if` por rubro.

1. Agrega la pieza a `PiezasUi` en `FrontendStore/src/app/negocio/ui-negocio.ts`.
2. Dale su componente en **las dos familias**: `negocio/familias/comercio/ui.ts` y `negocio/familias/reserva/ui.ts`
   (el componente, en la carpeta de la familia). Un rubro que difiere de su familia la reemplaza en su `negocio/<rubro>/ui.ts`.
3. En el componente compartido: `<app-slot-rubro pieza="<nombre>">`.
4. El slot no se hidrata: nada que dependa del rubro fuera del slot (el SSR no conoce la tienda).
5. Ruta de un solo rubro: en `rutas` de su `ui.ts`, montada con `rutaDelRubro`; nunca en `store.routes.ts`.
6. Actualiza a propósito `negocio/uis.spec.ts` y corre las [pruebas](pruebas.md) de la tienda.

**Decide** solo el nombre de la pieza y qué dibuja cada familia.
