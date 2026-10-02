// Paletas del tema: un color primario combinado con la familia de neutros
// que mejor lo acompaña, en tres versiones de fondos. Portadas de
// FrontendStore src/app/core/theme/paletas.ts (los valores de cada neutro
// los resuelve el storefront: aquí solo viaja su id).
//
// La base "tienda" no trae primario: el storefront usa el color propio de la
// tienda, como hasta ahora. "tienda-contraste" es la que ven hoy todas.

const BASES = [
  { id: "tienda", nombre: "Color de la tienda", neutro: "gray" },
  { id: "indigo", nombre: "Índigo", primario: "#4f46e5", neutro: "slate" },
  { id: "sky", nombre: "Celeste", primario: "#0284c7", neutro: "slate" },
  { id: "emerald", nombre: "Esmeralda", primario: "#059669", neutro: "zinc" },
  { id: "violet", nombre: "Violeta", primario: "#7c3aed", neutro: "zinc" },
  { id: "rose", nombre: "Rosa", primario: "#e11d48", neutro: "neutral" },
  { id: "orange", nombre: "Naranja", primario: "#f97316", neutro: "stone" },
  { id: "amber", nombre: "Ámbar", primario: "#f59e0b", neutro: "stone" },
  { id: "grafito", nombre: "Grafito", primario: "#1c1917", neutro: "stone" }
];

const VERSIONES = [
  // Zonas fijas oscuras que enmarcan un centro claro: el look actual.
  { id: "contraste", nombre: "Contraste", fondos: { topBar: "oscuro", header: "blanco", pagina: "neutro", footer: "oscuro" } },
  // Todo claro, el color solo en botones y acentos.
  { id: "clara", nombre: "Clara", fondos: { topBar: "claro", header: "blanco", pagina: "blanco", footer: "claro" } },
  // El color de marca también en los fondos.
  { id: "tinte", nombre: "Tinte", fondos: { topBar: "primario", header: "tinte", pagina: "tinte", footer: "oscuro" } }
];

export const PALETAS = Object.freeze(
  BASES.flatMap((base) =>
    VERSIONES.map((v) =>
      Object.freeze({
        id: `${base.id}-${v.id}`,
        nombre: `${base.nombre} · ${v.nombre}`,
        grupo: base.nombre,
        primario: base.primario ?? null,
        neutro: base.neutro,
        fondos: Object.freeze({ ...v.fondos })
      })
    )
  )
);

export const PALETA_IDS = PALETAS.map((p) => p.id);
export const PALETA_DEFAULT = "tienda-contraste";

/** @param {string} id */
export function buscarPaleta(id) {
  return PALETAS.find((p) => p.id === id) ?? null;
}
