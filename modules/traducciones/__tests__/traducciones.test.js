import { jest } from "@jest/globals";

jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: {}, default: {} }));
const { estadoCampo, textoLocal } = await import("../texto-local.js");
const { FUENTES, textosDiseno, textosTour } = await import("../fuentes.js");
const { localizar, localizado } = await import("../localizar.js");

// docs/specs/idiomas D4 (cadena de respaldo) · antes hospedaje-completo C3
describe("estado y texto de una traducción", () => {
  it("falta, al día o desactualizada según el texto base del que salió", () => {
    expect(estadoCampo("Terraza", null)).toBe("falta");
    expect(estadoCampo("Terraza", { t: "Terrace", o: "Terraza" })).toBe("al_dia");
    expect(estadoCampo("Terraza y bar", { t: "Terrace", o: "Terraza" })).toBe("desactualizada");
    expect(estadoCampo("", { t: "x", o: "" })).toBeNull();
  });

  it("muestra la traducción al día o la manual; si quedó vieja y es automática, el texto base", () => {
    expect(textoLocal("Terraza", { t: "Terrace", o: "Terraza" })).toBe("Terrace");
    expect(textoLocal("Terraza y bar", { t: "Terrace", o: "Terraza" })).toBe("Terraza y bar");
    expect(textoLocal("Terraza y bar", { t: "Rooftop", o: "Terraza", m: true })).toBe("Rooftop");
    expect(textoLocal("Terraza", undefined)).toBe("Terraza");
  });
});

// docs/specs/idiomas D5 · diseno.md B5
describe("localizar", () => {
  const habitacion = {
    camas: "2 camas", amenities: ["Locker", "Baño compartido"],
    traducciones: {
      en: { amenities: { t: ["Locker", "Shared bathroom"], o: ["Locker", "Baño compartido"] } },
      qu: { camas: { t: "Iskay puñuna", o: "2 camas", m: true } }
    }
  };

  it("cada idioma toma sus propias traducciones, también las listas", () => {
    expect(localizar(FUENTES.habitaciones, habitacion, "en").amenities).toEqual(["Locker", "Shared bathroom"]);
    expect(localizar(FUENTES.habitaciones, habitacion, "en").camas).toBe("2 camas");
    expect(localizar(FUENTES.habitaciones, habitacion, { codigo: "qu" }).camas).toBe("Iskay puñuna");
  });

  it("el idioma base (o uno sin traducciones) devuelve la misma fila, sin copiarla", () => {
    expect(localizar(FUENTES.habitaciones, habitacion, "es")).toBe(habitacion);
    expect(localizar(FUENTES.habitaciones, habitacion, "ay")).toBe(habitacion);
    expect(localizar(FUENTES.habitaciones, null, "en")).toBeNull();
  });

  it("no agrega campos que la fila no tenía", () => {
    const parcial = { nombre: "Polo", traducciones: { en: { nombre: { t: "Shirt", o: "Polo" } } } };
    expect(localizar(FUENTES.productos, parcial, "en")).toEqual({ nombre: "Shirt", traducciones: parcial.traducciones });
  });

  it("localizado decora un serializer con el idioma del contexto", () => {
    const serializar = (c) => ({ nombre: c.nombre });
    const categoria = { nombre: "Polos", traducciones: { en: { nombre: { t: "Shirts", o: "Polos" } } } };
    expect(localizado(serializar, FUENTES.categorias)(categoria, { idioma: { codigo: "en" } })).toEqual({ nombre: "Shirts" });
    expect(localizado(serializar, FUENTES.categorias)(categoria, {})).toEqual({ nombre: "Polos" });
  });
});

describe("todas las fuentes tienen la misma forma (diseno.md B4)", () => {
  it.each(Object.keys(FUENTES))("%s declara etiqueta, almacén, nombre, textos y aplicar", (nombre) => {
    const f = FUENTES[nombre];
    expect(typeof f.etiqueta).toBe("string");
    for (const m of ["leer", "leerUna", "idDe", "guardar"]) expect(typeof f.almacen[m]).toBe("function");
    for (const m of ["nombre", "textos", "aplicar"]) expect(typeof f[m]).toBe("function");
  });
});

describe("textos del diseño", () => {
  const estructura = { home: { secciones: [
    { id: "hero", tipo: "hero", titulo: "Bienvenidos" },
    { id: "faq", tipo: "faq", titulo: "Preguntas", items: [{ pregunta: "¿Hay cochera?", respuesta: "Sí" }] },
    { id: "testimonios", tipo: "testimonios", titulo: "Reseñas", items: [{ nombre: "Ana", texto: "Lindo" }] },
    { id: "oculta", tipo: "cinta", oculto: true, items: ["No se traduce"] }
  ] } };

  it("lista los textos visibles, sin las palabras de los clientes", () => {
    expect(textosDiseno(estructura, "Hostal en Barranco")).toEqual({
      "tienda.descripcion": "Hostal en Barranco",
      "s.hero.titulo": "Bienvenidos",
      "s.faq.titulo": "Preguntas",
      "s.faq.items.0.pregunta": "¿Hay cochera?",
      "s.faq.items.0.respuesta": "Sí",
      "s.testimonios.titulo": "Reseñas"
    });
  });

  it("aplica un idioma sin tocar lo que no tiene traducción", () => {
    const traducciones = { en: {
      "s.hero.titulo": { t: "Welcome", o: "Bienvenidos" },
      "s.faq.items.0.pregunta": { t: "Is there parking?", o: "¿Hay cochera?" },
      "tienda.descripcion": { t: "Hostel in Barranco", o: "Hostal en Barranco" }
    } };
    const en = localizar(FUENTES.diseno, { estructura, descripcion: "Hostal en Barranco", traducciones }, "en");
    expect(en.estructura.home.secciones[0].titulo).toBe("Welcome");
    expect(en.estructura.home.secciones[1].items[0]).toEqual({ pregunta: "Is there parking?", respuesta: "Sí" });
    expect(en.estructura.home.secciones[2].items[0].texto).toBe("Lindo");
    expect(en.descripcion).toBe("Hostel in Barranco");
  });
});

describe("ficha del tour", () => {
  const tour = {
    duracion: "Medio día", incluye: ["Bote", "Guía"], noIncluye: [], recojo: null,
    itinerario: [{ hora: "08:00", titulo: "Salida del muelle", descripcion: null }],
    tiposPasajero: [{ id: "a1", nombre: "Adulto", precio: 60 }]
  };
  const traducciones = { en: {
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

  it("aplica un idioma sin tocar precios ni horas", () => {
    const producto = { tour, traducciones };
    const en = localizar(FUENTES.tours, producto, "en").tour;
    expect(en.duracion).toBe("Half day");
    expect(en.incluye).toEqual(["Boat", "Guide"]);
    expect(en.itinerario[0]).toEqual({ hora: "08:00", titulo: "Departure from the pier", descripcion: null });
    expect(en.tiposPasajero[0]).toEqual({ id: "a1", nombre: "Adult", precio: 60 });
    expect(localizar(FUENTES.tours, producto, "es").tour).toBe(tour);
  });
});
