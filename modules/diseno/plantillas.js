// Plantillas de estructura por rubro (layout + secciones de la home). Son de
// la plataforma: la tienda aplica una y se guarda una COPIA completa que
// edita a partir de ahí (docs/specs/estructura-tienda). Si cambias el
// contenido de una plantilla, sube su `version`; si cambias la FORMA de los
// datos, mira migrar.js.
//
// Portadas de FrontendStore src/app/core/theme/estructuras.mock.ts, que
// queda solo para el selector de desarrollo.
//
// Cada una sigue la anatomía de home que mejor convierte en su rubro (temas
// de Shopify líderes por industria y pautas de Baymard). Los textos son de
// ejemplo: al copiar, copia.js oculta las secciones que afirman cosas del
// negocio y deja el hero con los textos propios de la tienda (R3).

const SIN_BENEFICIOS = [];

/** Opciones del detalle de producto (R5) por defecto: lo que se ve hoy. */
export const PRODUCTO_DEFAULT = Object.freeze({
  galeria: "lado",
  envio: { mostrar: true, texto: null },
  devoluciones: { mostrar: true, texto: null },
  relacionados: true,
  resenas: true,
  beneficios: SIN_BENEFICIOS
});

const B = {
  envio: { icono: "envio", titulo: "Envíos a todo el Perú", texto: "Lima en 24-48 h, provincias por agencia" },
  pago: { icono: "pago", titulo: "Paga como prefieras", texto: "Yape, Plin, transferencia o contraentrega" },
  cambios: { icono: "cambios", titulo: "Cambios sin drama", texto: "Tienes 7 días para cambiar tu producto" }
};

function congelar(obj) {
  Object.values(obj).forEach((v) => v && typeof v === "object" && congelar(v));
  return Object.freeze(obj);
}

function plantilla({ layout, ...resto }) {
  return { version: 1, ...resto, layout: { ...layout, producto: PRODUCTO_DEFAULT } };
}

// Congelado: copia.js clona antes de modificar y nunca debe mutar el
// catálogo compartido entre requests.
export const PLANTILLAS = congelar([
  // ── General ───────────────────────────────────────────────────────────
  plantilla({
    id: "clasica",
    rubro: "general",
    nombre: "Clásica · General",
    descripcion: "Hero a pantalla completa, categorías y carruseles. Es la que ven hoy todas las tiendas.",
    radio: "suave",
    encabezados: "comercial",
    layout: { header: { logo: "izquierda" }, productCard: { cta: "slide-up", imagen: "cuadrada" } },
    secciones: [
      { id: "hero", tipo: "hero", variante: "imagen-completa", textoBoton: "Ver la tienda" },
      { id: "categorias", tipo: "categorias", variante: "grilla", fondo: "superficie", titulo: "Explora por categoría" },
      { id: "destacados", tipo: "productos", fuente: "destacados", variante: "carrusel", fondo: "pagina", titulo: "Lo que más se llevan", subtitulo: "Los favoritos de quienes ya nos compraron" },
      { id: "recientes", tipo: "productos", fuente: "recientes", variante: "carrusel", fondo: "superficie", titulo: "Recién llegados", subtitulo: "Lo último que entró a la tienda" },
      { id: "contacto", tipo: "contacto", titulo: "¿Dudas? Escríbenos.", texto: "Te respondemos por WhatsApp y te ayudamos a elegir." }
    ]
  }),

  // ── Moda y accesorios ─────────────────────────────────────────────────
  // Editorial (Prestige/Dawn): novedades primero, colecciones en mosaico,
  // historia de marca con mucho aire, card vertical con botón visible.
  plantilla({
    id: "moda",
    rubro: "moda",
    nombre: "Moda y accesorios",
    descripcion: "Editorial: novedades primero, colecciones en mosaico, historia de marca, fotos verticales.",
    radio: "recto",
    encabezados: "editorial",
    layout: { header: { logo: "centro" }, productCard: { cta: "boton", imagen: "vertical" } },
    secciones: [
      { id: "hero", tipo: "hero", variante: "imagen-completa", titulo: "Lo nuevo ya llegó", subtitulo: "Prendas que vas a querer usar todos los días, no solo una vez.", textoBoton: "Ver la colección" },
      { id: "cinta", tipo: "cinta", estilo: "oscuro", items: ["Nueva colección", "Envíos a todo el Perú", "Cambios en 7 días", "Paga con Yape o Plin"] },
      { id: "recientes", tipo: "productos", fuente: "recientes", variante: "grilla", fondo: "superficie", espacio: "amplio", titulo: "La nueva colección", subtitulo: "Recién llegado", limite: 8 },
      { id: "colecciones", tipo: "categorias", variante: "mosaico", fondo: "pagina", titulo: "Encuentra tu estilo", subtitulo: "Colecciones" },
      { id: "historia", tipo: "imagen-texto", fondo: "superficie", espacio: "amplio", imagen: "categoria", posicionImagen: "izquierda", kicker: "Nuestra historia", titulo: "Menos prendas, mejor elegidas", texto: "Escogemos cada pieza por su tela, su calce y cuánto te va a durar. Si no la usaríamos nosotros, no la vendemos.", textoBoton: "Ver catálogo" },
      { id: "destacados", tipo: "productos", fuente: "destacados", variante: "carrusel", fondo: "pagina", titulo: "Lo que más se llevan", subtitulo: "Favoritos" },
      { id: "testimonios", tipo: "testimonios", fondo: "superficie", titulo: "Ellas ya lo usan", items: [] },
      { id: "beneficios", tipo: "beneficios", variante: "franja", fondo: "superficie", items: [B.envio, B.cambios, B.pago] }
    ]
  }),

  // ── Tecnología y electrónica ──────────────────────────────────────────
  // Catálogo grande (Impact/Warehouse): hero bajo para que las categorías se
  // vean sin scroll, confianza en una cinta, ofertas con urgencia y FAQ.
  plantilla({
    id: "tecnologia",
    rubro: "tecnologia",
    nombre: "Tecnología y electrónica",
    descripcion: "Catálogo grande: hero compacto, garantía en cinta, categorías arriba, ofertas con cuenta regresiva.",
    radio: "suave",
    encabezados: "impacto",
    layout: { header: { logo: "izquierda" }, productCard: { cta: "slide-up", imagen: "cuadrada" } },
    secciones: [
      { id: "hero", tipo: "hero", variante: "compacto", titulo: "Tecnología original, con garantía de verdad", subtitulo: "Laptops, celulares y accesorios con boleta, factura y 12 meses de garantía.", textoBoton: "Ver productos" },
      { id: "cinta", tipo: "cinta", estilo: "primario", items: ["Garantía de 12 meses", "100 % originales", "Boleta o factura", "Envíos a todo el Perú"] },
      { id: "categorias", tipo: "categorias", variante: "grilla", fondo: "pagina", espacio: "compacto", titulo: "Compra por categoría" },
      { id: "oferta", tipo: "oferta", titulo: "Ofertas de la semana", texto: "Precios que no se repiten. Cuando se acaba el tiempo, se acaban.", textoBoton: "Ver ofertas", terminaEn: null },
      { id: "ofertas", tipo: "productos", fuente: "ofertas", variante: "carrusel", fondo: "superficie", titulo: "Bajaron de precio" },
      { id: "destacados", tipo: "productos", fuente: "destacados", variante: "carrusel", fondo: "pagina", titulo: "Lo más vendido", subtitulo: "Lo que la gente está comprando esta semana" },
      { id: "recientes", tipo: "productos", fuente: "recientes", variante: "grilla", fondo: "superficie", titulo: "Recién llegados", limite: 8 },
      { id: "faq", tipo: "faq", fondo: "pagina", espacio: "amplio", titulo: "Antes de comprar", items: [
        { pregunta: "¿Los productos tienen garantía?", respuesta: "Sí. Todos tienen 12 meses de garantía por defectos de fábrica, con boleta o factura." },
        { pregunta: "¿Son originales?", respuesta: "Trabajamos solo con distribuidores autorizados. Todo llega nuevo y sellado." },
        { pregunta: "¿Cuánto demora el envío?", respuesta: "En Lima de 24 a 48 horas. A provincias de 2 a 5 días hábiles por agencia." },
        { pregunta: "¿Emiten factura?", respuesta: "Sí, boleta o factura electrónica. Solo indícalo al hacer tu pedido." }
      ] }
    ]
  }),

  // ── Belleza y cuidado personal ────────────────────────────────────────
  // Storytelling (Sense/Refresh): hero dividido, categorías en círculos,
  // favoritos, ingredientes con mucho aire, reseñas y FAQ.
  plantilla({
    id: "belleza",
    rubro: "belleza",
    nombre: "Belleza y cuidado personal",
    descripcion: "Storytelling: hero dividido, categorías en círculos, ingredientes, reseñas y FAQ.",
    radio: "redondeado",
    encabezados: "editorial",
    layout: { header: { logo: "centro" }, productCard: { cta: "boton", imagen: "cuadrada" } },
    secciones: [
      { id: "hero", tipo: "hero", variante: "dividido", titulo: "Tu piel, pero mejor", subtitulo: "Skincare y maquillaje originales, elegidos para tu tipo de piel.", textoBoton: "Descubrir" },
      { id: "categorias", tipo: "categorias", variante: "circulos", fondo: "pagina", titulo: "Encuentra tu rutina", subtitulo: "Por necesidad" },
      { id: "destacados", tipo: "productos", fuente: "destacados", variante: "grilla", fondo: "superficie", espacio: "amplio", titulo: "Los que no fallan", subtitulo: "Favoritos", limite: 8 },
      { id: "cinta", tipo: "cinta", estilo: "primario", items: ["Cruelty free", "Registro sanitario", "100 % originales", "Asesoría gratis por WhatsApp"] },
      { id: "historia", tipo: "imagen-texto", fondo: "suave", espacio: "amplio", imagen: "producto", posicionImagen: "derecha", kicker: "Cuidado consciente", titulo: "Ingredientes que tu piel entiende", texto: "Elegimos marcas con fórmulas transparentes, probadas dermatológicamente y libres de crueldad animal. Si tienes dudas, te armamos la rutina.", textoBoton: "Ver productos" },
      { id: "testimonios", tipo: "testimonios", fondo: "superficie", titulo: "Lo dicen ellas", items: [] },
      { id: "faq", tipo: "faq", fondo: "pagina", titulo: "Preguntas frecuentes", items: [
        { pregunta: "¿Los productos son originales?", respuesta: "Sí, todos son 100 % originales y con registro sanitario vigente." },
        { pregunta: "¿Me ayudan a elegir según mi tipo de piel?", respuesta: "Claro. Escríbenos por WhatsApp y te armamos una rutina a tu medida." },
        { pregunta: "¿Puedo devolver un producto abierto?", respuesta: "Por higiene solo aceptamos cambios de productos sellados, dentro de 7 días." }
      ] }
    ]
  }),

  // ── Alimentos y abarrotes ─────────────────────────────────────────────
  // Compra rápida y recurrente (Refresh): hero bajo, chips para saltar al
  // pasillo, ofertas y "lo más pedido" con botón de agregar visible.
  plantilla({
    id: "alimentos",
    rubro: "alimentos",
    nombre: "Alimentos y abarrotes",
    descripcion: "Compra rápida: hero compacto, cinta de delivery, chips de pasillos, botón agregar siempre visible.",
    radio: "suave",
    encabezados: "impacto",
    layout: { header: { logo: "izquierda" }, productCard: { cta: "boton", imagen: "cuadrada" } },
    secciones: [
      { id: "hero", tipo: "hero", variante: "compacto", titulo: "Tu despensa, sin salir de casa", subtitulo: "Abarrotes, frutas y más, con delivery el mismo día.", textoBoton: "Hacer mi pedido" },
      { id: "cinta", tipo: "cinta", estilo: "primario", items: ["Delivery hoy mismo", "Paga contraentrega", "Pedidos por WhatsApp", "Frescos de verdad"] },
      { id: "pasillos", tipo: "categorias", variante: "chips", fondo: "superficie", espacio: "compacto", titulo: "Compra por pasillo" },
      { id: "destacados", tipo: "productos", fuente: "destacados", variante: "carrusel", fondo: "pagina", titulo: "Lo que más se pide", subtitulo: "Los que nunca faltan en la lista" },
      { id: "oferta", tipo: "oferta", titulo: "Ofertas del día", texto: "Precios bajos hasta agotar stock. Mañana cambian.", textoBoton: "Aprovechar", terminaEn: null },
      { id: "ofertas", tipo: "productos", fuente: "ofertas", variante: "grilla", fondo: "superficie", titulo: "Bajaron hoy", limite: 8 },
      { id: "recientes", tipo: "productos", fuente: "recientes", variante: "carrusel", fondo: "pagina", titulo: "Novedades en tienda" },
      { id: "contacto", tipo: "contacto", titulo: "¿Muy larga la lista?", texto: "Mándanosla por WhatsApp y te armamos el pedido completo." }
    ]
  }),

  // ── Mascotas ──────────────────────────────────────────────────────────
  // Emocional y de recompra: categorías en círculos, más vendidos,
  // historia, reseñas y FAQ.
  plantilla({
    id: "mascotas",
    rubro: "mascotas",
    nombre: "Mascotas",
    descripcion: "Cercana: categorías en círculos, favoritos, historia, reseñas de clientes y FAQ.",
    radio: "redondeado",
    encabezados: "impacto",
    layout: { header: { logo: "izquierda" }, productCard: { cta: "slide-up", imagen: "cuadrada" } },
    secciones: [
      { id: "hero", tipo: "hero", variante: "imagen-completa", titulo: "Todo para tu engreído", subtitulo: "Comida, snacks, juguetes y accesorios, con delivery el mismo día.", textoBoton: "Ver productos" },
      { id: "cinta", tipo: "cinta", estilo: "claro", items: ["Delivery el mismo día", "Asesoría por WhatsApp", "Paga con Yape o Plin", "Marcas que ellos aman"] },
      { id: "categorias", tipo: "categorias", variante: "circulos", fondo: "pagina", titulo: "¿Para quién compras hoy?" },
      { id: "destacados", tipo: "productos", fuente: "destacados", variante: "carrusel", fondo: "superficie", titulo: "Sus favoritos", subtitulo: "Lo que más piden los peludos de la casa" },
      { id: "historia", tipo: "imagen-texto", fondo: "suave", espacio: "amplio", imagen: "banner", posicionImagen: "izquierda", kicker: "Hecho por amantes de las mascotas", titulo: "Nosotros también tenemos peludos en casa", texto: "Por eso solo vendemos lo que les daríamos a los nuestros. ¿No sabes qué elegir? Cuéntanos de tu mascota y te recomendamos.", textoBoton: "Ver productos" },
      { id: "recientes", tipo: "productos", fuente: "recientes", variante: "grilla", fondo: "superficie", titulo: "Lo nuevo", limite: 8 },
      { id: "testimonios", tipo: "testimonios", fondo: "pagina", titulo: "Colitas felices", items: [] },
      { id: "faq", tipo: "faq", fondo: "superficie", titulo: "Preguntas frecuentes", items: [
        { pregunta: "¿Hacen delivery el mismo día?", respuesta: "Sí, en Lima Metropolitana para pedidos antes de las 2 p. m." },
        { pregunta: "¿Me ayudan a elegir el alimento?", respuesta: "Escríbenos por WhatsApp con la edad y raza de tu mascota y te recomendamos." }
      ] }
    ]
  }),

  // ── Hogar y decoración ────────────────────────────────────────────────
  // Inspiracional (Craft/Be Yours): ambientes en mosaico, historia de marca
  // con mucho aire, novedades en grilla y reseñas.
  plantilla({
    id: "hogar",
    rubro: "hogar",
    nombre: "Hogar y decoración",
    descripcion: "Inspiracional: ambientes en mosaico, historia de marca, novedades y reseñas.",
    radio: "suave",
    encabezados: "editorial",
    layout: { header: { logo: "centro" }, productCard: { cta: "slide-up", imagen: "vertical" } },
    secciones: [
      { id: "hero", tipo: "hero", variante: "imagen-completa", titulo: "Tu casa, con más carácter", subtitulo: "Piezas de diseño que convierten cualquier espacio en hogar.", textoBoton: "Explorar" },
      { id: "ambientes", tipo: "categorias", variante: "mosaico", fondo: "superficie", espacio: "amplio", titulo: "Inspírate por espacio", subtitulo: "Ambientes" },
      { id: "destacados", tipo: "productos", fuente: "destacados", variante: "carrusel", fondo: "pagina", titulo: "Lo que más se llevan", subtitulo: "Favoritos" },
      { id: "cinta", tipo: "cinta", estilo: "oscuro", items: ["Diseño que dura", "Envíos a todo el Perú", "Embalaje cuidado", "Cambios en 7 días"] },
      { id: "historia", tipo: "imagen-texto", fondo: "superficie", espacio: "amplio", imagen: "categoria", posicionImagen: "derecha", kicker: "Diseño con propósito", titulo: "Piezas que se quedan contigo", texto: "Materiales nobles, acabados cuidados y diseños que no pasan de moda. Cosas para usar, no para guardar.", textoBoton: "Explorar" },
      { id: "recientes", tipo: "productos", fuente: "recientes", variante: "grilla", fondo: "pagina", titulo: "Recién llegados", subtitulo: "Novedades", limite: 8 },
      { id: "testimonios", tipo: "testimonios", fondo: "superficie", titulo: "Casas que nos eligieron", items: [] },
      { id: "beneficios", tipo: "beneficios", variante: "franja", fondo: "pagina", items: [B.envio, B.cambios, B.pago] }
    ]
  })
]);

export const PLANTILLA_IDS = PLANTILLAS.map((p) => p.id);
export const PLANTILLA_DEFAULT = "clasica";

/** @param {string} id */
export function buscarPlantilla(id) {
  return PLANTILLAS.find((p) => p.id === id) ?? null;
}

/** Plantilla sugerida para un rubro (R2.3). Sin rubro → la clásica. */
export function plantillaPara(rubro) {
  return PLANTILLAS.find((p) => p.rubro === (rubro ?? "general")) ?? buscarPlantilla(PLANTILLA_DEFAULT);
}
