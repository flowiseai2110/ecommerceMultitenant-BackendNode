import { jest } from "@jest/globals";

jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: {}, default: {} }));
const { aplicarDisenoEn, estadoCampo, textoEn, textosDiseno, textosTour, traducirFila, traducirTour } = await import("../traducciones.service.js");

// docs/specs/hospedaje-completo C3
describe("estado y texto de una traducción", () => {
  it("falta, al día o desactualizada según el español del que salió", () => {
    expect(estadoCampo("Terraza", null)).toBe("falta");
    expect(estadoCampo("Terraza", { t: "Terrace", o: "Terraza" })).toBe("al_dia");
    expect(estadoCampo("Terraza y bar", { t: "Terrace", o: "Terraza" })).toBe("desactualizada");
    expect(estadoCampo("", { t: "x", o: "" })).toBeNull();
  });

  it("muestra el inglés al día o el manual; si quedó viejo y es automático, el español", () => {
    expect(textoEn("Terraza", { t: "Terrace", o: "Terraza" })).toBe("Terrace");
    expect(textoEn("Terraza y bar", { t: "Terrace", o: "Terraza" })).toBe("Terraza y bar");
    expect(textoEn("Terraza y bar", { t: "Rooftop", o: "Terraza", m: true })).toBe("Rooftop");
  });

  it("traduce las listas completas (servicios de una habitación)", () => {
    const fila = { amenities: ["Locker", "Baño compartido"], traducciones: { en: { amenities: { t: ["Locker", "Shared bathroom"], o: ["Locker", "Baño compartido"] } } } };
    expect(traducirFila(fila, ["amenities"], "en").amenities).toEqual(["Locker", "Shared bathroom"]);
    expect(traducirFila(fila, ["amenities"], "es")).toBe(fila);
  });
});

describe("textos del diseño", () => {
  const estructura = { home: { secciones: [
    { id: "hero", tipo: "hero", titulo: "Bienvenidos" },
    { id: "faq", tipo: "faq", titulo: "Preguntas", items: [{ pregunta: "¿Hay cochera?", respuesta: "Sí" }] },
    { id: "testimonios", tipo: "testimonios", titulo: "Reseñas", items: [{ nombre: "Ana", texto: "Lindo" }] },
    { id: "oculta", tipo: "cinta", oculto: true, items: ["No se traduce"] }
  ] } };

  it("lista los textos visibles, sin las palabras de los huéspedes", () => {
    expect(textosDiseno(estructura, "Hostal en Barranco")).toEqual({
      "tienda.descripcion": "Hostal en Barranco",
      "s.hero.titulo": "Bienvenidos",
      "s.faq.titulo": "Preguntas",
      "s.faq.items.0.pregunta": "¿Hay cochera?",
      "s.faq.items.0.respuesta": "Sí",
      "s.testimonios.titulo": "Reseñas"
    });
  });

  it("aplica el inglés sin tocar lo que no tiene traducción", () => {
    const tr = { "s.hero.titulo": { t: "Welcome", o: "Bienvenidos" }, "s.faq.items.0.pregunta": { t: "Is there parking?", o: "¿Hay cochera?" } };
    const en = aplicarDisenoEn(estructura, tr);
    expect(en.home.secciones[0].titulo).toBe("Welcome");
    expect(en.home.secciones[1].items[0]).toEqual({ pregunta: "Is there parking?", respuesta: "Sí" });
    expect(en.home.secciones[2].items[0].texto).toBe("Lindo");
  });
});

describe("ficha del tour", () => {
  const tour = {
    duracion: "Medio día", incluye: ["Bote", "Guía"], noIncluye: [], recojo: null,
    itinerario: [{ hora: "08:00", titulo: "Salida del muelle", descripcion: null }],
    tiposPasajero: [{ id: "a1", nombre: "Adulto", precio: 60 }]
  };
  const tr = { en: {
    duracion: { t: "Half day", o: "Medio día" },
    incluye: { t: ["Boat", "Guide"], o: ["Bote", "Guía"] },
    "itinerario.0.titulo": { t: "Departure from the pier", o: "Salida del muelle" },
    "pasajero.a1": { t: "Adult", o: "Adulto" }
  } };

  it("lista los textos con claves del itinerario y de cada tipo de pasajero", () => {
    const textos = textosTour(tour);
    expect(textos["itinerario.0.titulo"]).toBe("Salida del muelle");
    expect(textos["pasajero.a1"]).toBe("Adulto");
    expect(textos.incluye).toEqual(["Bote", "Guía"]);
  });

  it("aplica el inglés sin tocar precios ni horas", () => {
    const en = traducirTour(tour, tr, "en");
    expect(en.duracion).toBe("Half day");
    expect(en.incluye).toEqual(["Boat", "Guide"]);
    expect(en.itinerario[0]).toEqual({ hora: "08:00", titulo: "Departure from the pier", descripcion: null });
    expect(en.tiposPasajero[0]).toEqual({ id: "a1", nombre: "Adult", precio: 60 });
    expect(traducirTour(tour, tr, "es")).toBe(tour);
  });
});
