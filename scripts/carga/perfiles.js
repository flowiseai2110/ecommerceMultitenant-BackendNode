/**
 * Perfiles de tienda para el seed de carga: imitan los negocios reales de la
 * plataforma (tiendas chicas de un rubro, 40-50 productos con variantes).
 *
 * Imágenes: URLs de picsum con semilla fija. No ocupan el Storage del proyecto
 * de pruebas y la misma semilla siempre devuelve la misma foto (10-20 por perfil).
 */

const foto = (semilla, w = 800, h = 800) => `https://picsum.photos/seed/${semilla}/${w}/${h}`;
const fotos = (perfil, n) => Array.from({ length: n }, (_, i) => foto(`${perfil}-${i + 1}`));

const TALLAS_ROPA = ["XS", "S", "M", "L", "XL"];
const TALLAS_ZAPATO = ["35", "36", "37", "38", "39", "40", "41", "42", "43", "44"];

/**
 * @typedef {object} Perfil
 * @property {string} rubro - Valor de modules/tenants/rubros.js.
 * @property {string[]} marcas - Base del nombre comercial.
 * @property {string[]} categorias
 * @property {string[]} bases - Sustantivo del producto.
 * @property {string[]} adjetivos
 * @property {[number, number]} precio - Rango de precio base (PEN).
 * @property {Array<{nombre: string, tipo: "color"|"texto", valores: string[], elegir: [number, number]}>} opciones
 *   Opciones de variante; `elegir` = cuántos valores toma cada producto.
 * @property {number} sinVariantes - Proporción de productos sin opciones.
 * @property {string[]} imagenes
 */

/** @type {Record<string, Perfil>} */
export const PERFILES = {
  medias: {
    rubro: "moda",
    marcas: ["Medias", "Calcetines", "Pies Felices"],
    categorias: ["Deportivas", "De vestir", "Tobilleras", "Térmicas", "Packs"],
    bases: ["Media", "Calcetín", "Pack de medias"],
    adjetivos: ["deportiva", "de algodón", "antideslizante", "térmica", "estampada", "invisible", "de compresión", "de bambú"],
    precio: [8, 45],
    opciones: [
      { nombre: "Color", tipo: "color", valores: ["negro", "blanco", "gris", "azul", "rosado", "multicolor"], elegir: [2, 4] },
      { nombre: "Talla", tipo: "texto", valores: ["S", "M", "L"], elegir: [2, 3] }
    ],
    sinVariantes: 0.15,
    imagenes: fotos("medias", 15)
  },
  zapatillas: {
    rubro: "moda",
    marcas: ["Zapatillas", "Sneakers", "Paso Firme"],
    categorias: ["Running", "Urbanas", "Training", "Niños", "Outdoor"],
    bases: ["Zapatilla", "Tenis", "Botín"],
    adjetivos: ["running", "urbana", "de cuero", "ultraligera", "impermeable", "de lona", "retro", "con plataforma"],
    precio: [120, 450],
    opciones: [
      { nombre: "Color", tipo: "color", valores: ["negro", "blanco", "gris", "azul", "rojo", "beige"], elegir: [1, 3] },
      { nombre: "Talla", tipo: "texto", valores: TALLAS_ZAPATO, elegir: [5, 7] }
    ],
    sinVariantes: 0.05,
    imagenes: fotos("zapatillas", 15)
  },
  ropa: {
    rubro: "moda",
    marcas: ["Moda", "Boutique", "Estilo"],
    categorias: ["Polos", "Pantalones", "Casacas", "Vestidos", "Shorts", "Blusas"],
    bases: ["Polo", "Pantalón", "Casaca", "Vestido", "Short", "Blusa"],
    adjetivos: ["oversize", "slim fit", "de algodón", "de lino", "estampado", "básico", "de denim", "manga larga"],
    precio: [35, 220],
    opciones: [
      { nombre: "Color", tipo: "color", valores: ["negro", "blanco", "beige", "verde", "celeste", "marron"], elegir: [2, 4] },
      { nombre: "Talla", tipo: "texto", valores: TALLAS_ROPA, elegir: [3, 5] }
    ],
    sinVariantes: 0.1,
    imagenes: fotos("ropa", 20)
  },
  belleza: {
    rubro: "belleza",
    marcas: ["Belleza", "Glow", "Bella"],
    categorias: ["Labios", "Ojos", "Rostro", "Cuidado de piel", "Uñas"],
    bases: ["Labial", "Máscara de pestañas", "Base", "Sérum", "Esmalte", "Crema"],
    adjetivos: ["mate", "hidratante", "de larga duración", "vegano", "con vitamina C", "waterproof", "nude"],
    precio: [15, 120],
    opciones: [
      { nombre: "Tamaño", tipo: "texto", valores: ["15 ml", "30 ml", "50 ml"], elegir: [1, 3] }
    ],
    sinVariantes: 0.4,
    imagenes: fotos("belleza", 12)
  },
  mascotas: {
    rubro: "mascotas",
    marcas: ["Mascotas", "Patitas", "Huellitas"],
    categorias: ["Alimento", "Juguetes", "Camas", "Collares", "Higiene"],
    bases: ["Collar", "Cama", "Juguete", "Shampoo", "Plato", "Arnés"],
    adjetivos: ["reforzado", "lavable", "antipulgas", "acolchado", "ajustable", "de acero", "mordible"],
    precio: [10, 180],
    opciones: [
      { nombre: "Tamaño", tipo: "texto", valores: ["Pequeño", "Mediano", "Grande"], elegir: [2, 3] }
    ],
    sinVariantes: 0.3,
    imagenes: fotos("mascotas", 12)
  }
};

export const NOMBRES_PERFILES = Object.keys(PERFILES);

/** Banner y logo genéricos (también de picsum, apaisado el banner). */
export const imagenTienda = (slug) => ({
  logoUrl: foto(`logo-${slug}`, 200, 200),
  bannerUrl: foto(`banner-${slug}`, 1200, 400)
});

// Distritos de Lima Metropolitana (ubigeo INEI) para clientes y pedidos.
export const DISTRITOS = [
  { ubigeo: "150101", distrito: "Lima" },
  { ubigeo: "150122", distrito: "Miraflores" },
  { ubigeo: "150130", distrito: "San Borja" },
  { ubigeo: "150131", distrito: "San Isidro" },
  { ubigeo: "150140", distrito: "Santiago de Surco" },
  { ubigeo: "150141", distrito: "Surquillo" },
  { ubigeo: "150108", distrito: "Chorrillos" },
  { ubigeo: "150132", distrito: "San Juan de Lurigancho" },
  { ubigeo: "150135", distrito: "San Martín de Porres" },
  { ubigeo: "150103", distrito: "Ate" }
];

export const COMENTARIOS_RESENA = {
  5: ["Excelente calidad, llegó rápido.", "Me encantó, tal cual la foto.", "Súper recomendado, volveré a comprar.", "Muy buena atención y el producto es lo máximo."],
  4: ["Buen producto, la talla calza bien.", "Llegó en buen estado, recomendado.", "Buena calidad por el precio."],
  3: ["Está bien, pero demoró un poco el envío.", "Cumple, aunque esperaba otro color."],
  2: ["La calidad no es la que esperaba."],
  1: ["No me llegó lo que pedí."]
};
