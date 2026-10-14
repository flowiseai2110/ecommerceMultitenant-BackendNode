/**
 * Idiomas de la tienda para cualquier perfil del asesor (docs/specs/idiomas,
 * tasks.md 1.18): responde en el idioma del cliente y, si la tienda se ve en
 * más de uno, le recuerda el selector. `idiomas` son los visibles (con nombre
 * en su propia lengua). Pura: se testea sin la BD.
 */
export function bloqueIdiomas(idiomas = []) {
  const lineas = ["", "Idioma:", "- Responde siempre en el idioma en que te escribe el cliente, aunque los datos de la tienda estén en español."];
  if (idiomas.length > 1) {
    lineas.push(`- La tienda también se puede ver en: ${idiomas.map((i) => i.nombre).join(", ")}.`,
      "  Si el cliente te escribe en uno de esos idiomas, recuérdale una sola vez que puede cambiar el idioma de la tienda con el selector de arriba.");
  }
  return lineas.join("\n");
}
