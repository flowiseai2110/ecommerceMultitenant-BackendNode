// Migración del FORMATO de la estructura guardada (R1.4). Distinto de la
// `version` de una plantilla: aquí cambia la forma de los datos, no el
// contenido.
//
// Cada tienda guarda una copia con la forma que tenía el día que aplicó la
// plantilla, así que la forma no se puede cambiar sin más. Reglas:
// - Agregar una propiedad OPCIONAL con valor por defecto: no hace falta
//   migrar (el schema pone el default).
// - Renombrar, quitar o cambiar el tipo de una propiedad: subir
//   FORMATO_ACTUAL y agregar el paso `n → n+1` a PASOS.
// Se migra al leer (storefront y admin) y antes de validar un PUT, nunca con
// scripts sobre la BD (mismo enfoque que migrate()/transformProps() de Puck).

export const FORMATO_ACTUAL = 1;

/**
 * PASOS[n] lleva una estructura de formato n al n+1. Funciones puras: reciben
 * un objeto y devuelven otro, sin mutar.
 * @type {Record<number, (estructura: object) => object>}
 */
const PASOS = {};

/**
 * Estructura en el formato actual, o null si viene de un formato más nuevo
 * que este backend (no debería pasar: el admin nunca escribe uno) o si
 * falta un paso. Una estructura sin `formato` es del 1.
 */
export function migrarEstructura(estructura) {
  let actual = { ...estructura, formato: estructura.formato ?? 1 };
  if (!Number.isInteger(actual.formato) || actual.formato > FORMATO_ACTUAL) return null;

  while (actual.formato < FORMATO_ACTUAL) {
    const paso = PASOS[actual.formato];
    if (!paso) return null;
    actual = { ...paso(actual), formato: actual.formato + 1 };
  }
  return actual;
}
