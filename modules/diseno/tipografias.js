// Pares de fuentes (títulos + cuerpo). Combinaciones cerradas para que
// siempre se lean bien juntas. Portadas de FrontendStore
// src/app/core/theme/tipografias.ts; las familias deben existir en la
// allowlist de store-theme.ts del storefront.

export const TIPOGRAFIAS = Object.freeze(
  [
    { id: "inter", nombre: "Inter · Neutra", titulos: "inter", cuerpo: "inter" },
    { id: "moderna", nombre: "Poppins + Inter · Moderna", titulos: "poppins", cuerpo: "inter" },
    { id: "comercial", nombre: "Montserrat + Lato · Comercial", titulos: "montserrat", cuerpo: "lato" },
    { id: "editorial", nombre: "Playfair + Inter · Editorial", titulos: "playfair", cuerpo: "inter" },
    { id: "boutique", nombre: "Bodoni Moda + Plus Jakarta · Boutique", titulos: "bodoni-moda", cuerpo: "plus-jakarta" },
    { id: "tecnologica", nombre: "Space Grotesk + Inter · Tecnológica", titulos: "space-grotesk", cuerpo: "inter" },
    { id: "amigable", nombre: "Nunito · Amigable", titulos: "nunito", cuerpo: "nunito" },
    { id: "shopify", nombre: "Assistant · Clásica", titulos: "assistant", cuerpo: "assistant" }
  ].map((t) => Object.freeze(t))
);

export const TIPOGRAFIA_IDS = TIPOGRAFIAS.map((t) => t.id);
export const TIPOGRAFIA_DEFAULT = "inter";

/** @param {string} id */
export function buscarTipografia(id) {
  return TIPOGRAFIAS.find((t) => t.id === id) ?? null;
}
