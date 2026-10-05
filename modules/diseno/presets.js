// Valores iniciales de cada tipo de sección cuando el dueño la agrega desde
// el admin (R4.2), como los `presets` de las secciones de Shopify.
//
// Los textos explican QUÉ poner y no inventan datos del negocio (Shopify
// Theme Store: "los valores por defecto deben indicar cómo usar el ajuste").
// Las secciones con afirmaciones entran ocultas: el dueño las activa cuando
// escribió las suyas. El admin genera el `id`.

function congelar(obj) {
  Object.values(obj).forEach((v) => v && typeof v === "object" && congelar(v));
  return Object.freeze(obj);
}

export const PRESETS_SECCION = congelar({
  hero: { tipo: "hero", variante: "imagen-completa", titulo: null, subtitulo: null, textoBoton: "Ver productos" },
  categorias: { tipo: "categorias", variante: "grilla", fondo: "superficie", titulo: "Explora por categoría" },
  productos: { tipo: "productos", fuente: "destacados", variante: "carrusel", fondo: "pagina", titulo: "Lo que más se llevan" },
  beneficios: {
    tipo: "beneficios", variante: "tarjetas", fondo: "superficie", oculto: true,
    items: [
      { icono: "envio", titulo: "¿Cómo envías?", texto: "Ej.: a qué zonas llegas y en cuánto tiempo" },
      { icono: "pago", titulo: "¿Cómo te pagan?", texto: "Ej.: Yape, Plin, transferencia" }
    ]
  },
  testimonios: { tipo: "testimonios", fondo: "superficie", titulo: "Lo que dicen nuestros clientes", items: [] },
  "imagen-texto": {
    tipo: "imagen-texto", fondo: "superficie", imagen: "banner", posicionImagen: "izquierda", oculto: true,
    kicker: "Nuestra historia", titulo: "Cuenta por qué te eligen",
    texto: "Escribe en dos o tres frases qué hace distinta a tu tienda: cómo eliges tus productos, a quién atiendes, desde cuándo vendes.",
    textoBoton: "Ver productos"
  },
  faq: {
    tipo: "faq", fondo: "pagina", titulo: "Preguntas frecuentes", oculto: true,
    items: [{ pregunta: "Escribe la pregunta que más te hacen", respuesta: "Y aquí tu respuesta, tal como la darías por WhatsApp." }]
  },
  oferta: { tipo: "oferta", titulo: "Oferta por tiempo limitado", texto: "", textoBoton: "Ver ofertas", oculto: true, terminaEn: null },
  cinta: { tipo: "cinta", estilo: "primario", oculto: true, items: ["Escribe un mensaje corto", "Por ejemplo, cómo te pagan"] },
  contacto: { tipo: "contacto", titulo: "¿Dudas? Escríbenos.", texto: "Te ayudamos a elegir por WhatsApp." },
  // Hospedaje (docs/specs/diseno-por-rubro).
  habitaciones: { tipo: "habitaciones", variante: "grilla", fondo: "superficie", titulo: "Nuestras habitaciones" },
  servicios: {
    tipo: "servicios", variante: "iconos", fondo: "suave", titulo: "Servicios", oculto: true,
    items: [
      { icono: "wifi", titulo: "Escribe un servicio que ofreces" },
      { icono: "desayuno", titulo: "Y otro más" }
    ]
  },
  ubicacion: { tipo: "ubicacion", fondo: "superficie", titulo: "Cómo llegar", texto: null, cercanos: [], mapa: true },
  politicas: { tipo: "politicas", fondo: "pagina", titulo: "Antes de reservar" }
});
