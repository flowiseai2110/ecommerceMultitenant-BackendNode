import { z } from "zod";
import { COLORES_PRODUCTO } from "./productos.schema.js";

/**
 * Opciones de producto (Color, Talla, Tamaño, Sabor...) y la matriz de variantes
 * que generan. Lógica pura, sin BD, para poder testearla aislada.
 *
 * Modelo (sin DDL, sobre columnas JSONB existentes):
 * - productos.metadata.opciones = [{ nombre: "Talla", tipo: "texto", valores: ["S","M"] }]
 *   Define el orden de las opciones y de sus valores (el storefront arma el
 *   selector con esto).
 * - producto_variantes.atributos = { color: "negro", talla: "M" }
 *   Una variante = una combinación. La clave es claveOpcion(nombre), así el
 *   asesor IA filtra por `atributos->>'talla'` sin conocer cómo la tienda
 *   escribió el nombre ("Talla", "talla ", "TALLA").
 *
 * La opción de tipo "color" es especial: usa la paleta cerrada COLORES_PRODUCTO,
 * siempre tiene clave "color" y alimenta productos.colores (filtro de color del
 * asesor). Las demás son libres por tienda: cada negocio vende cosas distintas.
 */

export const MAX_OPCIONES = 3;
export const MAX_VALORES_POR_OPCION = 30;
export const MAX_VARIANTES = 100;

// Etiquetas legibles de la paleta, para el nombre de la variante ("Marrón / M").
// Misma lista que COLORES_PRODUCTO del admin.
const ETIQUETAS_COLOR = {
  negro: "Negro", blanco: "Blanco", gris: "Gris", beige: "Beige", marron: "Marrón",
  azul: "Azul", celeste: "Celeste", verde: "Verde", amarillo: "Amarillo", naranja: "Naranja",
  rojo: "Rojo", rosado: "Rosado", morado: "Morado", dorado: "Dorado", plateado: "Plateado",
  multicolor: "Multicolor"
};

/**
 * Clave estable de una opción a partir de su nombre: minúsculas, sin tildes y
 * con "_" en lugar de espacios/símbolos. "Tamaño" → "tamano", "Talla Zapato" → "talla_zapato".
 * @param {string} nombre
 * @returns {string}
 */
export function claveOpcion(nombre) {
  return String(nombre ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
}

/**
 * Clave de la opción ya normalizada: la de color siempre es "color".
 * @param {{ nombre: string, tipo: string }} opcion
 */
export function claveDe(opcion) {
  return opcion.tipo === "color" ? "color" : claveOpcion(opcion.nombre);
}

/**
 * Nombre visible de la variante: los valores en el orden de las opciones.
 * @param {Array<{nombre:string, tipo:string}>} opciones
 * @param {Record<string,string>} atributos
 * @returns {string} Ej: "Negro / M"
 */
export function nombreVariante(opciones, atributos) {
  return opciones
    .map(o => {
      const valor = atributos[claveDe(o)];
      return o.tipo === "color" ? (ETIQUETAS_COLOR[valor] ?? valor) : valor;
    })
    .join(" / ")
    .slice(0, 100);
}

/**
 * Identifica una combinación sin importar mayúsculas ni el orden de las claves
 * en el JSON: sirve para reencontrar la variante existente al regenerar la matriz.
 * @param {Record<string,string>|null} atributos
 * @param {string[]} claves - Claves de las opciones, en orden.
 * @returns {string|null} null si los atributos no cubren todas las claves.
 */
export function claveCombinacion(atributos, claves) {
  if (!atributos || typeof atributos !== "object" || Array.isArray(atributos)) return null;
  const partes = [];
  for (const c of claves) {
    const v = atributos[c];
    if (typeof v !== "string" || !v) return null;
    partes.push(`${c}=${v.toLowerCase()}`);
  }
  return partes.join("|");
}

const opcionSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre de la opción es requerido").max(30, "Nombre de opción: máximo 30 caracteres"),
  tipo: z.enum(["color", "texto"]).default("texto"),
  valores: z.array(z.string().trim().min(1, "Valor vacío").max(30, "Valor: máximo 30 caracteres"))
    .min(1, "Cada opción necesita al menos un valor")
    .max(MAX_VALORES_POR_OPCION, `Máximo ${MAX_VALORES_POR_OPCION} valores por opción`)
}).transform(o => (o.tipo === "color" ? { ...o, nombre: "Color" } : o));

const varianteSyncSchema = z.object({
  id: z.string().uuid("ID de variante inválido").optional().nullable(),
  atributos: z.record(z.string().trim()),
  sku: z.string().trim().max(50, "El SKU no puede exceder 50 caracteres").optional().nullable(),
  precio: z.coerce.number().positive("El precio debe ser positivo").optional().nullable(),
  stock: z.coerce.number().int("El stock debe ser un número entero").min(0, "El stock no puede ser negativo").default(0)
});

/**
 * Body de PUT /admin/productos/:id/variantes: reemplaza opciones y matriz de una vez.
 * Opciones vacías + variantes vacías = el producto deja de tener variantes.
 */
export const sincronizarVariantesSchema = z.object({
  opciones: z.array(opcionSchema).max(MAX_OPCIONES, `Máximo ${MAX_OPCIONES} opciones por producto`),
  variantes: z.array(varianteSyncSchema).max(MAX_VARIANTES, `Máximo ${MAX_VARIANTES} variantes por producto`)
}).superRefine((data, ctx) => {
  const { opciones, variantes } = data;
  const claves = opciones.map(claveDe);

  if (opciones.filter(o => o.tipo === "color").length > 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["opciones"], message: "Solo puede haber una opción de color" });
  }
  opciones.forEach((o, i) => {
    const clave = claves[i];
    if (!clave) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["opciones", i, "nombre"], message: `Nombre de opción inválido: "${o.nombre}"` });
    } else if (o.tipo === "texto" && clave === "color") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["opciones", i, "nombre"], message: "Para colores usa la opción de tipo color" });
    }
    if (claves.indexOf(clave) !== i) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["opciones", i, "nombre"], message: `Opción repetida: "${o.nombre}"` });
    }
    const vistos = new Set();
    for (const v of o.valores) {
      if (vistos.has(v.toLowerCase())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["opciones", i, "valores"], message: `Valor repetido en ${o.nombre}: "${v}"` });
      }
      vistos.add(v.toLowerCase());
      if (o.tipo === "color" && !COLORES_PRODUCTO.includes(v)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["opciones", i, "valores"], message: `Color inválido: "${v}"` });
      }
    }
  });

  if (opciones.length === 0 && variantes.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["variantes"], message: "Define al menos una opción para crear variantes" });
    return;
  }

  const combinaciones = new Set();
  variantes.forEach((v, i) => {
    const keys = Object.keys(v.atributos);
    if (keys.length !== claves.length || !claves.every(c => keys.includes(c))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["variantes", i, "atributos"], message: "La variante debe tener un valor por cada opción" });
      return;
    }
    opciones.forEach((o, j) => {
      if (!o.valores.includes(v.atributos[claves[j]])) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["variantes", i, "atributos", claves[j]], message: `"${v.atributos[claves[j]]}" no es un valor de ${o.nombre}` });
      }
    });
    const combinacion = claveCombinacion(v.atributos, claves);
    if (combinaciones.has(combinacion)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["variantes", i], message: `Combinación repetida: ${nombreVariante(opciones, v.atributos)}` });
    }
    combinaciones.add(combinacion);
  });
});
