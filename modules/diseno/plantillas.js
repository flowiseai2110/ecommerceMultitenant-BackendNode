import { datosDe } from "../negocio/datos.js";

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

// `tipoNegocio`: el de las tiendas que pueden usarla (docs/specs/diseno-por-rubro).
// `tema` (opcional): paleta y tipografía con que se prueba en el editor
// (editor-diseno-en-vivo V1). Sin tema, probarla conserva los colores y las
// letras de la tienda.
// El layout es el de su rubro (layout-por-rubro RU8): solo productos lleva la
// tarjeta y el detalle de producto.
function plantilla({ layout, tipoNegocio = "productos", ...resto }) {
  return { version: 1, tipoNegocio, ...resto, layout: tipoNegocio === "productos" ? { ...layout, producto: PRODUCTO_DEFAULT } : layout };
}

// Servicios de ejemplo de un hospedaje: se copian ocultos (R3.5) hasta que el
// dueño deje solo los que de verdad ofrece.
const S = {
  wifi: { icono: "wifi", titulo: "Wifi gratis" },
  desayuno: { icono: "desayuno", titulo: "Desayuno incluido" },
  agua: { icono: "agua-caliente", titulo: "Agua caliente 24 h" },
  recepcion: { icono: "recepcion", titulo: "Recepción 24 h" },
  cochera: { icono: "cochera", titulo: "Cochera" },
  equipaje: { icono: "equipaje", titulo: "Guardamos tu equipaje" },
  cocina: { icono: "cocina", titulo: "Cocina equipada" },
  terraza: { icono: "terraza", titulo: "Terraza" }
};

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
  }),

  // Estándar · Productos: hero dividido, categorías en círculos, lo más vendido en grilla,
  // novedades y beneficios (ecommerce retail, pautas Baymard de home y listado).
  plantilla({
    id: "productos-estandar",
    rubro: "general",
    nombre: "Estándar · Tienda",
    descripcion: "La plantilla estándar del rubro: portada dividida, categorías en círculos, lo más vendido, novedades y beneficios.",
    radio: "suave",
    encabezados: "comercial",
    tema: { paleta: "terracota-clara", tipografia: "estandar" },
    layout: { header: { logo: "izquierda" }, productCard: { cta: "slide-up", imagen: "cuadrada" } },
    secciones: [
      { id: "hero", tipo: "hero", variante: "dividido", titulo: "Nueva colección", subtitulo: "Lo último que llegó, con envío a todo el Perú.", textoBoton: "Ver ahora" },
      { id: "categorias", tipo: "categorias", variante: "circulos", fondo: "pagina", titulo: "Categorías" },
      { id: "destacados", tipo: "productos", fuente: "destacados", variante: "grilla", fondo: "superficie", titulo: "Más vendidos", subtitulo: "Lo que más se llevan", limite: 8 },
      { id: "recientes", tipo: "productos", fuente: "recientes", variante: "carrusel", fondo: "pagina", titulo: "Recién llegados" },
      { id: "beneficios", tipo: "beneficios", variante: "franja", fondo: "superficie", items: [B.envio, B.cambios, B.pago] },
      { id: "contacto", tipo: "contacto", titulo: "¿Dudas? Escríbenos.", texto: "Te respondemos por WhatsApp y te ayudamos a elegir." }
    ]
  }),

  // ── Hospedaje (docs/specs/diseno-por-rubro, fase 1) ───────────────────
  // Boutique: buscador de fechas sobre la portada, habitaciones con precio
  // arriba, después lo que convence (servicios, la casa, reseñas) y al final
  // lo práctico (cómo llegar, políticas). Patrón de las webs de hoteles
  // independientes que más reservas directas consiguen.
  plantilla({
    id: "hotel-boutique",
    tipoNegocio: "hotel",
    rubro: "hospedaje",
    nombre: "Boutique",
    descripcion: "Portada con buscador de fechas, habitaciones con precio, servicios, reseñas, ubicación y políticas.",
    radio: "suave",
    encabezados: "editorial",
    layout: { header: { logo: "izquierda" } },
    secciones: [
      { id: "hero", tipo: "hero", variante: "imagen-completa", buscador: true, titulo: "Tu descanso empieza aquí", subtitulo: "Habitaciones cómodas en el mejor lugar de la ciudad.", textoBoton: "Ver habitaciones" },
      { id: "habitaciones", tipo: "habitaciones", variante: "grilla", fondo: "superficie", titulo: "Nuestras habitaciones" },
      { id: "servicios", tipo: "servicios", variante: "iconos", fondo: "suave", titulo: "Servicios", items: [S.wifi, S.desayuno, S.agua, S.recepcion, S.cochera, S.equipaje] },
      { id: "historia", tipo: "imagen-texto", fondo: "superficie", espacio: "amplio", imagen: "banner", posicionImagen: "izquierda", kicker: "Nuestra casa", titulo: "Cuenta qué hace especial a tu hospedaje", texto: "Desde cuándo reciben huéspedes, quién los atiende y qué no se encuentra en otro lugar. Dos o tres frases bastan.", textoBoton: "Ver habitaciones" },
      { id: "testimonios", tipo: "testimonios", fondo: "pagina", titulo: "Lo que dicen nuestros huéspedes", items: [] },
      { id: "ubicacion", tipo: "ubicacion", fondo: "superficie", titulo: "Cómo llegar", texto: null, cercanos: [], mapa: true },
      { id: "politicas", tipo: "politicas", fondo: "pagina", titulo: "Antes de reservar" },
      { id: "contacto", tipo: "contacto", titulo: "¿Tienes dudas?", texto: "Escríbenos por WhatsApp y te ayudamos a elegir tu habitación." }
    ]
  }),

  // Casa única: un solo alojamiento (casa de playa, cabaña, departamento).
  // La portada y la historia del lugar mandan; las habitaciones (o la casa
  // entera) van después, como en un alquiler vacacional.
  plantilla({
    id: "hotel-casa",
    tipoNegocio: "hotel",
    rubro: "hospedaje",
    nombre: "Casa única",
    descripcion: "Para un solo alojamiento: el lugar primero, después los espacios, servicios, reseñas y cómo llegar.",
    radio: "redondeado",
    encabezados: "editorial",
    // Galería en mosaico: en un alquiler vacacional las fotos venden la casa.
    layout: { header: { logo: "centro" }, habitacion: { galeria: "mosaico", servicios: true, politicas: true, mapa: true, otras: true } },
    secciones: [
      { id: "hero", tipo: "hero", variante: "dividido", buscador: true, titulo: "Una casa para ti solo", subtitulo: "Desconéctate en un lugar pensado para descansar.", textoBoton: "Ver disponibilidad" },
      { id: "historia", tipo: "imagen-texto", fondo: "superficie", espacio: "amplio", imagen: "banner", posicionImagen: "derecha", kicker: "El lugar", titulo: "Describe tu casa en pocas palabras", texto: "Cuántas personas entran, qué tiene alrededor y por qué la gente vuelve. Escríbelo como se lo contarías a un amigo.", textoBoton: null },
      { id: "habitaciones", tipo: "habitaciones", variante: "grilla", fondo: "pagina", titulo: "Elige tu espacio" },
      { id: "servicios", tipo: "servicios", variante: "lista", fondo: "superficie", titulo: "Lo que vas a encontrar", items: [S.wifi, S.cocina, S.terraza, S.cochera] },
      { id: "testimonios", tipo: "testimonios", fondo: "pagina", titulo: "Quienes ya se quedaron", items: [] },
      { id: "ubicacion", tipo: "ubicacion", fondo: "superficie", titulo: "Dónde queda", texto: null, cercanos: [], mapa: true },
      { id: "politicas", tipo: "politicas", fondo: "pagina", titulo: "Antes de reservar" },
      { id: "contacto", tipo: "contacto", titulo: "¿Quieres saber más?", texto: "Escríbenos por WhatsApp y te contamos todo sobre la casa." }
    ]
  }),

  // Estándar · Hotel: buscador de fechas sobre la portada, servicios a la vista,
  // habitaciones con precio y la ficha con mosaico y panel fijo (Booking, motores de cadenas).
  plantilla({
    id: "hotel-estandar",
    tipoNegocio: "hotel",
    rubro: "hospedaje",
    nombre: "Estándar · Reserva directa",
    descripcion: "La plantilla estándar del rubro: buscador de fechas sobre la foto, servicios, habitaciones con precio, reseñas y cómo llegar.",
    radio: "suave",
    encabezados: "editorial",
    tema: { paleta: "marino-clara", tipografia: "estandar" },
    layout: { header: { logo: "izquierda", navegacion: "secciones" }, habitacion: { galeria: "mosaico", listado: "filas", servicios: true, politicas: true, mapa: true, otras: true } },
    secciones: [
      { id: "hero", tipo: "hero", variante: "buscador-abajo", buscador: true, titulo: "Tu casa en la ciudad", subtitulo: "Habitaciones cómodas cerca de todo. Mejor precio reservando aquí.", textoBoton: "Ver disponibilidad" },
      { id: "servicios", tipo: "servicios", variante: "franja", fondo: "pagina", espacio: "compacto", titulo: "Servicios", items: [
        { ...S.desayuno, texto: "Buffet de 6:30 a 10:00" },
        { icono: "traslado", titulo: "Traslado", texto: "Aeropuerto y terminal" },
        { ...S.terraza, texto: "Con vista a la ciudad" },
        { ...S.wifi, texto: "En toda la casa" }
      ] },
      { id: "habitaciones", tipo: "habitaciones", variante: "grilla", fondo: "superficie", titulo: "Habitaciones", subtitulo: "Precio total de tu estadía, sin sorpresas." },
      { id: "testimonios", tipo: "testimonios", fondo: "pagina", titulo: "Lo que dicen nuestros huéspedes", items: [] },
      { id: "ubicacion", tipo: "ubicacion", fondo: "superficie", titulo: "Cómo llegar", texto: null, cercanos: [], mapa: true },
      { id: "politicas", tipo: "politicas", fondo: "pagina", titulo: "Antes de reservar" },
      { id: "contacto", tipo: "contacto", titulo: "¿Tienes dudas?", texto: "Escríbenos por WhatsApp y te ayudamos a elegir tu habitación." }
    ]
  }),

  // ── Tours (docs/specs/diseno-por-rubro, fase 2) ───────────────────────
  // Catálogo (Viator, GetYourGuide): buscador de fecha y personas arriba, los
  // tours con precio "desde", duración y nota, y después la confianza
  // (por qué con nosotros, reseñas, preguntas) y lo práctico.
  plantilla({
    id: "tours-catalogo",
    tipoNegocio: "tours",
    rubro: "turismo",
    nombre: "Catálogo",
    descripcion: "Buscador de fecha y personas, tours con precio desde y duración, por qué viajar con ustedes, reseñas y preguntas.",
    radio: "suave",
    encabezados: "impacto",
    layout: { header: { logo: "izquierda" } },
    secciones: [
      { id: "hero", tipo: "hero", variante: "imagen-completa", buscador: true, titulo: "Vive el destino con guías locales", subtitulo: "Tours de día completo y caminatas, con recojo en tu hotel.", textoBoton: "Buscar tours" },
      { id: "tours", tipo: "tours", variante: "grilla", fondo: "superficie", titulo: "Los más reservados", subtitulo: "Elige tu tour y la fecha: confirmamos la salida." },
      { id: "servicios", tipo: "servicios", variante: "iconos", fondo: "suave", titulo: "Por qué viajar con nosotros", items: [
        { icono: "guia", titulo: "Guías locales" },
        { icono: "grupo", titulo: "Grupos pequeños" },
        { icono: "calendario", titulo: "Cambio de fecha sin costo" },
        { icono: "traslado", titulo: "Recojo en tu hotel" }
      ] },
      { id: "testimonios", tipo: "testimonios", fondo: "pagina", titulo: "Viajeros que ya fueron", items: [] },
      { id: "faq", tipo: "faq", fondo: "superficie", titulo: "Preguntas frecuentes", items: [
        { pregunta: "¿Qué pasa si llueve?", respuesta: "Escribe aquí qué haces si el clima no acompaña: si el tour sale igual, si se reprograma o si devuelves el pago." },
        { pregunta: "¿Cómo pago?", respuesta: "Escribe aquí los medios de pago y cuánto se paga para separar el cupo." }
      ] },
      { id: "politicas", tipo: "politicas", fondo: "pagina", titulo: "Antes de reservar" },
      { id: "contacto", tipo: "contacto", titulo: "¿Armamos tu viaje a medida?", texto: "Cuéntanos tus días y te proponemos un plan por WhatsApp." }
    ]
  }),

  // Operador (Peek, Wilderness Travel): pocos tours de autor. La historia de
  // la agencia va arriba y los tours en carrusel, con mucha foto.
  plantilla({
    id: "tours-operador",
    tipoNegocio: "tours",
    rubro: "turismo",
    nombre: "Operador",
    descripcion: "Para pocos tours de autor: portada inmersiva, quiénes son, los tours en carrusel, reseñas y dónde encontrarlos.",
    radio: "redondeado",
    encabezados: "editorial",
    layout: { header: { logo: "centro" }, tour: { galeria: "mosaico", itinerario: true, incluye: true, otros: true } },
    secciones: [
      { id: "hero", tipo: "hero", variante: "imagen-completa", buscador: false, titulo: "Viajes que se recuerdan", subtitulo: "Rutas pensadas por quienes las caminan desde hace años.", textoBoton: "Ver tours" },
      { id: "historia", tipo: "imagen-texto", fondo: "superficie", espacio: "amplio", imagen: "banner", posicionImagen: "izquierda", kicker: "Quiénes somos", titulo: "Cuenta quién guía tus tours", texto: "Desde cuándo operan, quiénes son los guías y qué hace distintos a sus recorridos. Dos o tres frases bastan.", textoBoton: "Ver tours" },
      { id: "tours", tipo: "tours", variante: "carrusel", fondo: "pagina", titulo: "Nuestros tours" },
      { id: "servicios", tipo: "servicios", variante: "lista", fondo: "superficie", titulo: "Viajar con nosotros", items: [
        { icono: "guia", titulo: "Guías locales" },
        { icono: "idiomas", titulo: "Tours en español e inglés" },
        { icono: "seguro", titulo: "Seguro de viaje incluido" }
      ] },
      { id: "testimonios", tipo: "testimonios", fondo: "pagina", titulo: "Lo que cuentan los viajeros", items: [] },
      { id: "ubicacion", tipo: "ubicacion", fondo: "superficie", titulo: "Dónde encontrarnos", texto: null, cercanos: [], mapa: true },
      { id: "politicas", tipo: "politicas", fondo: "pagina", titulo: "Antes de reservar" },
      { id: "contacto", tipo: "contacto", titulo: "¿Tienes dudas?", texto: "Escríbenos por WhatsApp y te ayudamos a elegir tu tour." }
    ]
  }),

  // Estándar · Tours: buscador de fecha y personas, los más reservados, ficha con mosaico,
  // itinerario e incluye, y el calendario en el panel (Viator / GetYourGuide).
  plantilla({
    id: "tours-estandar",
    tipoNegocio: "tours",
    rubro: "turismo",
    nombre: "Estándar · Experiencias",
    descripcion: "La plantilla estándar del rubro: buscador sobre la foto, los tours más reservados, por qué viajar con ustedes, reseñas y preguntas.",
    radio: "suave",
    encabezados: "impacto",
    tema: { paleta: "petroleo-clara", tipografia: "estandar" },
    layout: { header: { logo: "izquierda" }, tour: { galeria: "mosaico", itinerario: true, incluye: true, otros: true } },
    secciones: [
      { id: "hero", tipo: "hero", variante: "imagen-completa", buscador: true, titulo: "Vive el destino con guías locales", subtitulo: "Operador autorizado. Recojo en tu hotel y cancelación flexible.", textoBoton: "Buscar tours" },
      { id: "tours", tipo: "tours", variante: "grilla", fondo: "superficie", titulo: "Más reservados", subtitulo: "Precio desde, duración y lo que incluye cada tour." },
      { id: "servicios", tipo: "servicios", variante: "iconos", fondo: "pagina", titulo: "Por qué viajar con nosotros", items: [
        { icono: "guia", titulo: "Guías locales" },
        { icono: "traslado", titulo: "Recojo en tu hotel" },
        { icono: "calendario", titulo: "Cancelación flexible" },
        { icono: "idiomas", titulo: "Español e inglés" }
      ] },
      { id: "testimonios", tipo: "testimonios", fondo: "superficie", titulo: "Viajeros que ya fueron", items: [] },
      { id: "faq", tipo: "faq", fondo: "pagina", titulo: "Preguntas frecuentes", items: [
        { pregunta: "¿Qué pasa si llueve?", respuesta: "Escribe aquí qué haces si el clima no acompaña: si el tour sale igual, si se reprograma o si devuelves el pago." },
        { pregunta: "¿Dónde me recogen?", respuesta: "Escribe aquí desde qué zonas recoges y a qué hora pasas." }
      ] },
      { id: "politicas", tipo: "politicas", fondo: "superficie", titulo: "Antes de reservar" },
      { id: "contacto", tipo: "contacto", titulo: "¿Armamos tu viaje a medida?", texto: "Cuéntanos tus días y te proponemos un plan por WhatsApp." }
    ]
  }),

  // ── Eventos con entradas (docs/specs/diseno-por-rubro, fase 3) ────────
  // Cartelera (Joinnus, Teleticket, la web de un teatro): muchos eventos.
  // Buscador por fecha arriba, la cartelera con fecha y precio "desde", y
  // después lo que da confianza para pagar (entrada digital, preguntas) y lo
  // práctico.
  plantilla({
    id: "eventos-cartelera",
    tipoNegocio: "eventos",
    rubro: "eventos",
    nombre: "Cartelera",
    descripcion: "Para varios eventos: buscador por fecha, cartelera con fecha y precio desde, cómo funciona la compra y preguntas.",
    radio: "suave",
    encabezados: "impacto",
    layout: { header: { logo: "izquierda" } },
    secciones: [
      { id: "hero", tipo: "hero", variante: "imagen-completa", buscador: true, titulo: "Lo que se viene", subtitulo: "Conciertos, obras y fiestas. Compra tus entradas en línea y entra con tu QR.", textoBoton: "Ver eventos" },
      { id: "eventos", tipo: "eventos", variante: "grilla", fondo: "superficie", titulo: "Próximos eventos", subtitulo: "Elige la fecha, compra en línea y recibe tu entrada al instante." },
      { id: "servicios", tipo: "servicios", variante: "iconos", fondo: "suave", titulo: "Comprar es fácil", items: [
        { icono: "entrada", titulo: "Entrada digital con QR" },
        { icono: "seguro", titulo: "Pago seguro" },
        { icono: "calendario", titulo: "Recordatorio antes del evento" }
      ] },
      { id: "faq", tipo: "faq", fondo: "pagina", titulo: "Preguntas frecuentes", items: [
        { pregunta: "¿Cómo recibo mi entrada?", respuesta: "Escribe aquí cómo llega la entrada (correo, WhatsApp) y si hay que imprimirla." },
        { pregunta: "¿Puedo devolver mi entrada?", respuesta: "Escribe aquí tu política: si devuelves el dinero, si se puede cambiar de fecha o de titular." }
      ] },
      { id: "politicas", tipo: "politicas", fondo: "superficie", titulo: "Antes de comprar" },
      { id: "contacto", tipo: "contacto", titulo: "¿Compras para un grupo?", texto: "Escríbenos por WhatsApp y te ayudamos con tus entradas." }
    ]
  }),

  // Evento único (festival, conferencia, obra en temporada): un evento con
  // una o varias fechas. El evento manda en la portada; las fechas van en
  // agenda, y después qué hay, dónde es y las dudas.
  plantilla({
    id: "eventos-unico",
    tipoNegocio: "eventos",
    rubro: "eventos",
    nombre: "Evento único",
    descripcion: "Para un festival, una obra en temporada o una conferencia: el evento primero, las fechas en agenda, qué hay y cómo llegar.",
    radio: "redondeado",
    encabezados: "impacto",
    // Galería en mosaico: las fotos de ediciones pasadas venden el evento.
    layout: { header: { logo: "centro" }, evento: { galeria: "mosaico", mapa: true, otros: false } },
    secciones: [
      { id: "hero", tipo: "hero", variante: "dividido", buscador: false, titulo: "Una noche para recordar", subtitulo: "Escribe aquí la fecha, el lugar y lo que hace único a tu evento.", textoBoton: "Comprar entradas" },
      { id: "eventos", tipo: "eventos", variante: "agenda", fondo: "superficie", titulo: "Fechas y entradas" },
      { id: "historia", tipo: "imagen-texto", fondo: "pagina", espacio: "amplio", imagen: "banner", posicionImagen: "izquierda", kicker: "El evento", titulo: "Cuenta qué va a vivir tu público", texto: "Quiénes se presentan, cuánto dura y qué no se pueden perder. Dos o tres frases bastan.", textoBoton: "Comprar entradas" },
      { id: "servicios", tipo: "servicios", variante: "lista", fondo: "superficie", titulo: "Qué vas a encontrar", items: [
        { icono: "musica", titulo: "Música en vivo" },
        { icono: "bar", titulo: "Barra y comida" },
        { icono: "accesible", titulo: "Acceso para sillas de ruedas" }
      ] },
      { id: "testimonios", tipo: "testimonios", fondo: "pagina", titulo: "Lo que dijo el público", items: [] },
      { id: "ubicacion", tipo: "ubicacion", fondo: "superficie", titulo: "Cómo llegar", texto: null, cercanos: [], mapa: true },
      { id: "faq", tipo: "faq", fondo: "pagina", titulo: "Preguntas frecuentes", items: [
        { pregunta: "¿Desde qué edad se puede entrar?", respuesta: "Escribe aquí la edad mínima y si los menores entran acompañados." },
        { pregunta: "¿A qué hora abren las puertas?", respuesta: "Escribe aquí a qué hora se puede entrar y a qué hora empieza." }
      ] },
      { id: "contacto", tipo: "contacto", titulo: "¿Tienes dudas?", texto: "Escríbenos por WhatsApp y te respondemos." }
    ]
  }),

  // Estándar · Eventos: la agenda manda (fecha, hora y precio desde), compra con
  // el total final claro y entradas con QR (Eventbrite / Joinnus; Baymard ticketing).
  plantilla({
    id: "eventos-estandar",
    tipoNegocio: "eventos",
    rubro: "eventos",
    nombre: "Estándar · Agenda",
    descripcion: "La plantilla estándar del rubro: portada con buscador por fecha, la agenda de próximos eventos, cómo funciona la compra y preguntas.",
    radio: "suave",
    encabezados: "impacto",
    tema: { paleta: "uva-clara", tipografia: "estandar" },
    layout: { header: { logo: "izquierda" }, evento: { galeria: "carrusel", mapa: true, otros: true } },
    secciones: [
      { id: "hero", tipo: "hero", variante: "imagen-completa", buscador: true, titulo: "Lo que se viene", subtitulo: "Compra en línea y entra con tu QR desde el celular.", textoBoton: "Ver agenda" },
      { id: "agenda", tipo: "eventos", variante: "agenda", fondo: "superficie", titulo: "Próximos", subtitulo: "Fecha, hora y precio desde. Elige y compra en un minuto." },
      { id: "servicios", tipo: "servicios", variante: "iconos", fondo: "pagina", titulo: "Comprar es fácil", items: [
        { icono: "entrada", titulo: "Entrada digital con QR" },
        { icono: "seguro", titulo: "Pago seguro" },
        { icono: "calendario", titulo: "Agrega la fecha a tu calendario" }
      ] },
      { id: "faq", tipo: "faq", fondo: "superficie", titulo: "Preguntas frecuentes", items: [
        { pregunta: "¿Cómo recibo mis entradas?", respuesta: "Escribe aquí cómo llegan las entradas: al correo y en el link de tu compra, una por persona con su QR." },
        { pregunta: "¿Puedo devolver mi entrada?", respuesta: "Escribe aquí tu política: si devuelves el dinero, si se puede cambiar de fecha o de titular." }
      ] },
      { id: "politicas", tipo: "politicas", fondo: "pagina", titulo: "Antes de comprar" },
      { id: "contacto", tipo: "contacto", titulo: "¿Compras para un grupo?", texto: "Escríbenos por WhatsApp y te ayudamos con tus entradas." }
    ]
  }),

  // ── Alquiler de locales (docs/specs/alquiler-locales L1.30) ────────────
  // Quinceaños, promociones, cumpleaños y conferencias. El cliente llega de
  // TikTok o de un portal y quiere ver tres cosas: el salón, si la fecha está
  // libre y cuánto cuesta. Después, cómo se separa la fecha y las dudas.
  plantilla({
    id: "locales-salones",
    tipoNegocio: "locales",
    rubro: "general",
    nombre: "Salones de eventos",
    descripcion: "Para un local de eventos: los salones con aforo y precio desde, cómo separar la fecha, galería y preguntas.",
    radio: "redondeado",
    encabezados: "editorial",
    layout: { header: { logo: "izquierda" } },
    secciones: [
      { id: "hero", tipo: "hero", variante: "imagen-completa", titulo: "Tu fiesta, en el lugar perfecto", subtitulo: "Mira las fechas libres, cotiza al instante y separa tu fecha en línea.", textoBoton: "Ver salones" },
      { id: "salones", tipo: "salones", variante: "grilla", fondo: "superficie", titulo: "Nuestros salones", subtitulo: "Elige el salón, mira las fechas libres y cotiza tu evento al instante." },
      { id: "servicios", tipo: "servicios", variante: "iconos", fondo: "suave", titulo: "Separar tu fecha es fácil", items: [
        { icono: "calendario", titulo: "Calendario con fechas libres" },
        { icono: "seguro", titulo: "Contrato y pagos en cuotas" },
        { icono: "musica", titulo: "Paquetes con DJ y hora loca" }
      ] },
      { id: "galeria", tipo: "galeria", variante: "mosaico", fondo: "pagina", titulo: "Eventos que hicimos", subtitulo: null, fotos: [], oculto: true },
      { id: "faq", tipo: "faq", fondo: "superficie", titulo: "Preguntas frecuentes", items: [
        { pregunta: "¿Cómo separo la fecha?", respuesta: "Escribe aquí cuánto es la separación y hasta cuándo se paga el saldo." },
        { pregunta: "¿Puedo traer mi propio catering o DJ?", respuesta: "Escribe aquí si aceptas proveedores externos y si cobras descorche." },
        { pregunta: "¿Puedo visitar el local antes?", respuesta: "Escribe aquí los días y horas en que recibes visitas." }
      ] },
      { id: "ubicacion", tipo: "ubicacion", fondo: "pagina", titulo: "Cómo llegar", texto: null, cercanos: [], mapa: true },
      { id: "politicas", tipo: "politicas", fondo: "superficie", titulo: "Antes de reservar" },
      { id: "contacto", tipo: "contacto", titulo: "¿Quieres visitar el local?", texto: "Escríbenos por WhatsApp y agenda tu visita." }
    ]
  }),

  // Estándar · Locales: buscador por tipo de evento, fecha e invitados; qué se celebra,
  // los salones con la disponibilidad del día y cómo se separa la fecha (Peerspace / Tagvenue).
  plantilla({
    id: "locales-estandar",
    tipoNegocio: "locales",
    rubro: "general",
    nombre: "Estándar · Salones",
    descripcion: "La plantilla estándar del rubro: buscador de fecha e invitados, qué celebras, los salones con fechas libres, cómo separar y preguntas.",
    radio: "redondeado",
    encabezados: "editorial",
    tema: { paleta: "magenta-clara", tipografia: "estandar" },
    layout: { header: { logo: "izquierda" } },
    secciones: [
      { id: "hero", tipo: "hero", variante: "imagen-completa", buscador: true, titulo: "Tu celebración, sin preocupaciones", subtitulo: "Mira qué salón está libre en tu fecha y cotiza al instante.", textoBoton: "Ver salones libres" },
      { id: "celebras", tipo: "servicios", variante: "tarjetas", fondo: "pagina", titulo: "¿Qué celebras?", items: [
        { icono: "musica", titulo: "Quinceañero" },
        { icono: "bar", titulo: "Boda" },
        { icono: "grupo", titulo: "Infantil" },
        { icono: "calendario", titulo: "Corporativo" }
      ] },
      { id: "salones", tipo: "salones", variante: "grilla", fondo: "superficie", titulo: "Salones", subtitulo: "Elige una fecha en la lista para ver cuáles están libres." },
      { id: "galeria", tipo: "galeria", variante: "mosaico", fondo: "pagina", titulo: "Eventos que hicimos", subtitulo: null, fotos: [], oculto: true },
      { id: "faq", tipo: "faq", fondo: "pagina", titulo: "Preguntas frecuentes", items: [
        { pregunta: "¿Cómo separo la fecha?", respuesta: "Escribe aquí cuánto es la separación, cómo pagas el resto en cuotas y hasta cuándo." },
        { pregunta: "¿Puedo visitar el local antes?", respuesta: "Escribe aquí los días y horas en que recibes visitas." }
      ] },
      { id: "ubicacion", tipo: "ubicacion", fondo: "superficie", titulo: "Cómo llegar", texto: null, cercanos: [], mapa: true },
      { id: "contacto", tipo: "contacto", titulo: "¿Quieres visitar el local?", texto: "Escríbenos por WhatsApp y agenda tu visita." }
    ]
  }),

  // ── Complejo de canchas (docs/specs/alquiler-canchas) ──────────────────
  // El cliente quiere tres cosas: saber si hay hora, cuánto cuesta y separarla
  // sin llamar. La portada muestra las tarifas y lo libre de hoy, las canchas
  // con su precio de día y de noche, y el reservador va al centro de la página.
  // Maqueta aprobada: "Cancha Los Cedros" (spec).
  plantilla({
    id: "canchas-complejo",
    tipoNegocio: "canchas",
    rubro: "general",
    nombre: "Complejo deportivo",
    descripcion: "Para canchas sintéticas: tarifas de día y de noche, horarios libres al instante, reserva con adelanto y preguntas.",
    radio: "suave",
    encabezados: "deportivo",
    tema: { paleta: "cancha-tinte", tipografia: "deportiva" },
    layout: { header: { logo: "izquierda" } },
    secciones: [
      {
        id: "portada", tipo: "canchas-portada", kicker: null, titulo: "Arma tu pichanga", acento: "en 1 minuto",
        subtitulo: "Elige día y hora, ve la cancha libre al instante y separa con un adelanto. Sin llamar ni esperar respuesta.",
        textoBoton: "Ver horarios libres", textoBotonSecundario: "Conocer las canchas"
      },
      { id: "canchas", tipo: "canchas", variante: "grilla", fondo: "pagina", espacio: "compacto", kicker: null, titulo: "Nuestras canchas", subtitulo: null },
      { id: "reservador", tipo: "reservador", fondo: "superficie", kicker: "Disponibilidad en tiempo real", titulo: "Reserva tu horario" },
      { id: "pasos", tipo: "pasos", fondo: "pagina", kicker: "Cómo funciona", titulo: "Tres pasos y a jugar" },
      { id: "servicios", tipo: "servicios", variante: "tarjetas", fondo: "pagina", espacio: "compacto", kicker: "Servicios", titulo: "Todo para el partido", items: [
        { icono: "reflectores", titulo: "Reflectores LED" },
        { icono: "vestuarios", titulo: "Vestuarios y duchas" },
        { icono: "cochera", titulo: "Estacionamiento" },
        { icono: "bar", titulo: "Kiosko y bebidas" },
        { icono: "pelota", titulo: "Pelotas y chalecos" },
        { icono: "techada", titulo: "Cancha techada" },
        { icono: "tribuna", titulo: "Tribuna" },
        { icono: "pagos", titulo: "Yape, Plin y tarjeta" }
      ] },
      {
        id: "fijo", tipo: "fijo-semanal", kicker: "Alquiler fijo semanal", titulo: "Tu equipo, el mismo día cada semana",
        texto: "Separa la misma hora todas las semanas por 1 o 3 meses y paga menos. Ideal para la pichanga de la oficina o la liga del barrio.",
        textoBoton: "Pedir horario fijo"
      },
      { id: "faq", tipo: "faq", variante: "dos-columnas", fondo: "pagina", kicker: "Políticas", titulo: "Preguntas frecuentes", items: [
        { pregunta: "¿Cuánto tengo que adelantar?", respuesta: "Escribe aquí cuánto se adelanta y cómo se paga el saldo." },
        { pregunta: "¿Puedo cambiar o cancelar?", respuesta: "Escribe aquí hasta cuándo se puede cambiar de día y si devuelves el adelanto." },
        { pregunta: "¿Y si llueve?", respuesta: "Escribe aquí qué pasa con la reserva si llueve o hay tormenta." },
        { pregunta: "¿Qué zapatillas puedo usar?", respuesta: "Escribe aquí qué calzado se permite en la cancha." },
        { pregunta: "¿Cuántos jugadores entran?", respuesta: "Escribe aquí cuántas personas entran en cada cancha." }
      ] },
      { id: "ubicacion", tipo: "ubicacion", fondo: "pagina", kicker: "Ubicación", titulo: "Cómo llegar", texto: null, cercanos: [], mapa: true }
    ]
  }),

  // Propuesta aprobada "Tres plantillas para canchas" (docs/specs/plantillas-canchas).
  plantilla({
    id: "canchas-noche",
    tipoNegocio: "canchas",
    rubro: "general",
    nombre: "Noche de reflectores",
    descripcion: "Fondo oscuro, la foto de tu cancha de noche y el ámbar de los reflectores. Para el complejo que vive de los partidos de noche.",
    radio: "suave",
    encabezados: "deportivo",
    tema: { paleta: "amber-noche", tipografia: "deportiva" },
    layout: { header: { logo: "izquierda" } },
    secciones: [
      {
        id: "portada", tipo: "canchas-portada", variante: "foto", kicker: null, titulo: "El partido", acento: "de la noche",
        subtitulo: "Canchas con reflectores hasta tarde. Elige tu hora y sepárala en un minuto.",
        textoBoton: "Ver horarios de hoy", textoBotonSecundario: null
      },
      { id: "reservador", tipo: "reservador", fondo: "superficie", kicker: null, titulo: "Reserva tu horario" },
      { id: "galeria", tipo: "galeria", variante: "mosaico", fondo: "pagina", titulo: "Así se ve de noche", subtitulo: null, fotos: [], oculto: true },
      { id: "canchas", tipo: "canchas", variante: "grilla", fondo: "pagina", kicker: null, titulo: "Nuestras canchas", subtitulo: null },
      { id: "testimonios", tipo: "testimonios", fondo: "superficie", titulo: "Lo que dicen los equipos", items: [] },
      {
        id: "fijo", tipo: "fijo-semanal", kicker: "Alquiler fijo semanal", titulo: "Tu noche, todas las semanas",
        texto: "Separa la misma hora todas las semanas y asegura la cancha para tu equipo.",
        textoBoton: "Pedir horario fijo"
      },
      { id: "ubicacion", tipo: "ubicacion", fondo: "pagina", kicker: "Ubicación", titulo: "Cómo llegar", texto: null, cercanos: [], mapa: true }
    ]
  }),

  plantilla({
    id: "canchas-liga",
    tipoNegocio: "canchas",
    rubro: "general",
    nombre: "Liga y equipos",
    descripcion: "El alquiler fijo y la tabla del campeonato primero. Para el complejo que vive de los equipos que juegan cada semana.",
    radio: "suave",
    encabezados: "deportivo",
    tema: { paleta: "indigo-contraste", tipografia: "comercial" },
    layout: { header: { logo: "izquierda" } },
    secciones: [
      {
        id: "portada", tipo: "canchas-portada", variante: "dibujo", kicker: "Ligas y alquiler fijo", titulo: "Tu equipo, tu cancha,", acento: "cada semana",
        subtitulo: "Separa el mismo horario todas las semanas o juega el campeonato del complejo.",
        textoBoton: "Ver horarios libres", textoBotonSecundario: "Conocer las canchas"
      },
      {
        id: "fijo", tipo: "fijo-semanal", kicker: "Alquiler fijo semanal", titulo: "El mismo día y la misma hora, toda la temporada",
        texto: "Escribe aquí tu oferta para los equipos que juegan cada semana.",
        textoBoton: "Pedir horario fijo"
      },
      { id: "liga", tipo: "liga", fondo: "superficie", kicker: "Campeonato", titulo: "Tabla de posiciones", campeonato: "Copa del barrio", nota: "Próxima fecha: el sábado desde las 4 p. m.", equipos: [
        { nombre: "Los Veteranos", pj: 5, pg: 4, pe: 1, pp: 0, gf: 18, gc: 6 },
        { nombre: "Real Comas", pj: 5, pg: 3, pe: 1, pp: 1, gf: 14, gc: 9 },
        { nombre: "Deportivo Oficina", pj: 5, pg: 2, pe: 0, pp: 3, gf: 10, gc: 12 },
        { nombre: "Los del Jueves", pj: 5, pg: 0, pe: 0, pp: 5, gf: 4, gc: 19 }
      ] },
      { id: "pasos", tipo: "pasos", fondo: "pagina", kicker: "Cómo funciona", titulo: "Tres pasos y a jugar" },
      { id: "reservador", tipo: "reservador", fondo: "superficie", kicker: "Disponibilidad en tiempo real", titulo: "Reserva tu horario" },
      { id: "canchas", tipo: "canchas", variante: "grilla", fondo: "pagina", espacio: "compacto", kicker: null, titulo: "Nuestras canchas", subtitulo: null },
      { id: "faq", tipo: "faq", variante: "dos-columnas", fondo: "pagina", kicker: "Políticas", titulo: "Preguntas frecuentes", items: [
        { pregunta: "¿Cómo inscribo a mi equipo en el campeonato?", respuesta: "Escribe aquí cómo se inscriben los equipos y cuánto cuesta." },
        { pregunta: "¿Cuánto tengo que adelantar?", respuesta: "Escribe aquí cuánto se adelanta y cómo se paga el saldo." },
        { pregunta: "¿Puedo cambiar o cancelar?", respuesta: "Escribe aquí hasta cuándo se puede cambiar de día y si devuelves el adelanto." }
      ] },
      { id: "ubicacion", tipo: "ubicacion", fondo: "pagina", kicker: "Ubicación", titulo: "Cómo llegar", texto: null, cercanos: [], mapa: true }
    ]
  }),

  // Estándar · Canchas: deporte y día en la portada, la grilla de horarios al centro,
  // tarifas de día y de noche y cómo funciona (Playtomic / MATCHi). Clara, con la letra estándar.
  plantilla({
    id: "canchas-estandar",
    tipoNegocio: "canchas",
    rubro: "general",
    nombre: "Estándar · Reserva por turno",
    descripcion: "La plantilla estándar del rubro: portada con los horarios libres, la grilla para reservar, las canchas, servicios y preguntas. En claro.",
    radio: "suave",
    encabezados: "deportivo",
    tema: { paleta: "cancha-clara", tipografia: "estandar" },
    layout: { header: { logo: "izquierda" } },
    secciones: [
      {
        id: "portada", tipo: "canchas-portada", kicker: null, titulo: "Reserva tu cancha", acento: "en 1 minuto",
        subtitulo: "Elige día y hora, mira lo libre al instante y separa con un adelanto.",
        textoBoton: "Ver horarios libres", textoBotonSecundario: "Conocer las canchas"
      },
      { id: "reservador", tipo: "reservador", fondo: "superficie", kicker: "Disponibilidad en tiempo real", titulo: "Elige tu horario" },
      { id: "canchas", tipo: "canchas", variante: "grilla", fondo: "pagina", espacio: "compacto", kicker: null, titulo: "Nuestras canchas", subtitulo: null },
      { id: "pasos", tipo: "pasos", fondo: "superficie", kicker: "Cómo funciona", titulo: "Tres pasos y a jugar" },
      { id: "servicios", tipo: "servicios", variante: "tarjetas", fondo: "pagina", espacio: "compacto", kicker: "Servicios", titulo: "Todo para el partido", items: [
        { icono: "reflectores", titulo: "Reflectores LED" },
        { icono: "vestuarios", titulo: "Vestuarios y duchas" },
        { icono: "pelota", titulo: "Pelotas y chalecos" },
        { icono: "pagos", titulo: "Yape, Plin y tarjeta" }
      ] },
      {
        id: "fijo", tipo: "fijo-semanal", kicker: "Alquiler fijo semanal", titulo: "Tu equipo, el mismo día cada semana",
        texto: "Separa la misma hora todas las semanas y asegura la cancha para tu equipo.",
        textoBoton: "Pedir horario fijo"
      },
      { id: "faq", tipo: "faq", variante: "dos-columnas", fondo: "superficie", kicker: "Políticas", titulo: "Preguntas frecuentes", items: [
        { pregunta: "¿Cuánto tengo que adelantar?", respuesta: "Escribe aquí cuánto se adelanta y cómo se paga el saldo." },
        { pregunta: "¿Puedo dividir el pago con mi equipo?", respuesta: "Sí: al reservar puedes dividir el total y cada jugador paga su parte con su link." },
        { pregunta: "¿Puedo cambiar o cancelar?", respuesta: "Escribe aquí hasta cuándo se puede cambiar de día y si devuelves el adelanto." }
      ] },
      { id: "ubicacion", tipo: "ubicacion", fondo: "pagina", kicker: "Ubicación", titulo: "Cómo llegar", texto: null, cercanos: [], mapa: true }
    ]
  })
]);

export const PLANTILLA_DEFAULT = "clasica";

// ── Registro: código + base (docs/specs/editor-diseno-en-vivo, fase 2) ──
// Las de arriba son la base y siempre existen. Las filas de la tabla
// plantillas_diseno (plantillas.repo.js las carga) reemplazan a la del código
// con el mismo id o agregan plantillas nuevas. Mientras no se cargan, o si la
// base falla, se usan solo las del código.

// Separación entre las del código: deja lugar para intercalar otras.
const PASO_ORDEN = 10;

const DEL_CODIGO = congelar(PLANTILLAS.map((p, i) => ({ ...p, origen: "codigo", orden: i * PASO_ORDEN, activa: true })));
let todas = DEL_CODIGO;

/**
 * Plantillas del código con las filas de la base encima, ordenadas por
 * `orden` (P2, P3). Pura: no toca el registro.
 */
export function combinarPlantillas(codigo, filas) {
  const delCodigo = new Set(codigo.map((p) => p.id));
  const porId = new Map(filas.map((f) => [f.id, f]));
  const base = codigo.map((p) => (porId.has(p.id) ? desdeFila(porId.get(p.id), "codigo") : p));
  const nuevas = filas.filter((f) => !delCodigo.has(f.id)).map((f) => desdeFila(f, "editor"));
  // sort es estable: a igual orden, primero las del código.
  return congelar([...base, ...nuevas].sort((a, b) => a.orden - b.orden));
}

function desdeFila(fila, origen) {
  const { radio, encabezados, layout, secciones, tema = null } = fila.contenido ?? {};
  return {
    id: fila.id,
    version: fila.version,
    tipoNegocio: fila.tipoNegocio,
    rubro: fila.rubro,
    nombre: fila.nombre,
    descripcion: fila.descripcion,
    radio,
    encabezados,
    tema,
    layout,
    secciones,
    origen,
    orden: fila.orden,
    activa: fila.activa
  };
}

/** Registra las filas de la base (plantillas.repo.js). */
export function usarFilasDeLaBase(filas) {
  todas = combinarPlantillas(DEL_CODIGO, filas);
}

/** Todas, también las ocultas (P8). */
export function todasLasPlantillas() {
  return todas;
}

/** Las que se ofrecen a las tiendas (P3). */
export function plantillasActivas() {
  return todas.filter((p) => p.activa);
}

/**
 * Por id, también una oculta: las tiendas que la usan la siguen necesitando
 * para saber su tipo de negocio.
 * @param {string} id
 */
export function buscarPlantilla(id) {
  return todas.find((p) => p.id === id) ?? null;
}

/** Orden para una plantilla nueva: al final de su tipo de negocio. */
export function siguienteOrden(tipoNegocio) {
  const delTipo = todas.filter((p) => tipoNegocioDe(p) === tipoNegocio).map((p) => p.orden);
  return (delTipo.length ? Math.max(...delTipo) : 0) + PASO_ORDEN;
}

/**
 * Con qué se ve una tienda sin estructura guardada, según su tipo de negocio
 * (diseno-por-rubro H4): la define cada rubro en modules/negocio/<rubro>/datos.js.
 */
export function plantillaPorDefecto(tipoNegocio) {
  return buscarPlantilla(datosDe(tipoNegocio).diseno.plantillaPorDefecto) ?? buscarPlantilla(PLANTILLA_DEFAULT);
}

/** Tipo de negocio de una plantilla (las viejas no lo declaran: productos). */
export function tipoNegocioDe(plantilla) {
  return plantilla?.tipoNegocio ?? "productos";
}

/** Plantilla sugerida para un rubro (R2.3). Sin rubro → la clásica. */
export function plantillaPara(rubro) {
  return plantillasActivas().find((p) => p.rubro === (rubro ?? "general")) ?? buscarPlantilla(PLANTILLA_DEFAULT);
}
