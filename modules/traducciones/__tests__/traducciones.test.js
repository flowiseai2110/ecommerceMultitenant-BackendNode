import { jest } from "@jest/globals";

jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: {}, default: {} }));
const { estadoCampo, textoLocal } = await import("../texto-local.js");
const { CAMPOS_DISENO_TRADUCIBLES, FUENTES, textosDiseno, textosTour } = await import("../fuentes.js");
const { localizar, localizado } = await import("../localizar.js");
const { catalogoDeLugares } = await import("../traducciones.service.js");
const { DATOS } = await import("../../negocio/datos.js");

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
  it.each(Object.keys(FUENTES))("%s declara etiqueta, almacén, nombre, nombreCampo, textos, aplicar y lugares", (nombre) => {
    const f = FUENTES[nombre];
    expect(typeof f.etiqueta).toBe("string");
    for (const m of ["leer", "leerUna", "idDe", "guardar"]) expect(typeof f.almacen[m]).toBe("function");
    for (const m of ["nombre", "nombreCampo", "textos", "aplicar", "lugares"]) expect(typeof f[m]).toBe("function");
  });

  it("nombreCampo: cada fuente nombra sus campos como los ve el dueño", () => {
    expect(FUENTES.habitaciones.nombreCampo("amenities")).toBe("Servicios");
    expect(FUENTES.productos.nombreCampo("descripcionCorta")).toBe("Descripción corta");
    expect(FUENTES.tours.nombreCampo("itinerario.1.titulo")).toBe("Itinerario, paso 2: título");
    expect(FUENTES.tours.nombreCampo("pasajero.abc")).toBe("Tipo de pasajero");
    expect(FUENTES.diseno.nombreCampo("tienda.descripcion")).toBe("Descripción de la tienda");
    expect(FUENTES.diseno.nombreCampo("s.faq.items.1.pregunta")).toBe("Pregunta (2)");
    expect(FUENTES.diseno.nombreCampo("s.cerca.cercanos.0")).toBe("Lugar cercano 1");
    expect(FUENTES.diseno.nombreCampo("s.hero.textoBotonSecundario")).toBe("Botón secundario");
    expect(FUENTES.textos.nombreCampo("Salida|tour")).toBe("Texto fijo (tour)");
    expect(FUENTES.textos.nombreCampo("Buscar")).toBe("Texto fijo");
  });

  it("nombreCampo: todo campo traducible del diseño tiene nombre (no queda la clave técnica)", () => {
    for (const c of CAMPOS_DISENO_TRADUCIBLES.filter((x) => !x.includes("[]"))) {
      expect([c, FUENTES.diseno.nombreCampo(`s.x.${c}`)]).not.toEqual([c, c]);
    }
  });
});

// docs/specs/idiomas, diseno.md A1 (Strategy) y A5 (catálogo de la respuesta)
describe("dónde se muestra cada texto en Traducciones", () => {
  const ESTANDAR = "8a1f0c2e-0000-4000-8000-000000000001";

  it("nombre, ficha de habitación y ficha del tour van al catálogo, con el producto como sección", () => {
    const delProducto = FUENTES.productos.lugares({ id: ESTANDAR, nombre: "Estándar Queen" }, "nombre", DATOS.hotel);
    const deLaFicha = FUENTES.habitaciones.lugares({ productoId: ESTANDAR, producto: { nombre: "Estándar Queen" } }, "camas", DATOS.hotel);
    expect(deLaFicha).toEqual(delProducto);
    expect(delProducto).toEqual([{
      lugar: { id: "contenido/catalogo", zona: "contenido", nombre: "Habitaciones", orden: 0 },
      seccion: { id: ESTANDAR, nombre: "Estándar Queen" }
    }]);
    expect(FUENTES.tours.lugares({ id: "t1", nombre: "Valle Sagrado" }, "incluye", DATOS.tours)[0].lugar.nombre).toBe("Tours");
  });

  it("el nombre del catálogo es del rubro (nombreCatalogo), sin preguntar cuál es", () => {
    for (const [rubro, datos] of Object.entries(DATOS)) {
      expect([rubro, FUENTES.productos.lugares({ id: "x", nombre: "X" }, "nombre", datos)[0].lugar.nombre]).toEqual([rubro, datos.nombreCatalogo]);
    }
  });

  it("los textos fijos van a la pantalla de la tienda donde salen, filtrada por los grupos del rubro", () => {
    const lugares = FUENTES.textos.lugares({ id: "hotel" }, "Ver disponibilidad", DATOS.hotel);
    expect(lugares.length).toBeGreaterThan(0);
    expect(lugares.every((l) => l.lugar.zona === "pantallas")).toBe(true);
    expect(lugares.map((l) => l.lugar.id)).not.toContain("pantallas/otros");
  });

  it("el catálogo de la respuesta: referencias en cada campo, nombres una vez, zonas y secciones en orden", () => {
    const c = catalogoDeLugares();
    const correo = { lugar: { id: "mensajes/correos", zona: "mensajes", nombre: "Correos al cliente", orden: 19 }, seccion: { id: "reserva-confirmada", nombre: "Reserva confirmada", orden: 4 } };
    const ficha = { lugar: { id: "pantallas/habitacion", zona: "pantallas", nombre: "Ficha de la habitación", orden: 9 }, seccion: { id: "ficha", nombre: "Ficha", orden: 0 } };
    const calendario = { ...ficha, seccion: { id: "calendario-de-la-estadia", nombre: "Calendario de la estadía", orden: 1 } };
    const producto = (id, nombre) => ({ lugar: { id: "contenido/catalogo", zona: "contenido", nombre: "Habitaciones", orden: 0 }, seccion: { id, nombre } });

    expect(c.agregar([correo])).toEqual([{ lugar: "mensajes/correos", seccion: "reserva-confirmada" }]);
    c.agregar([calendario, ficha]);
    c.agregar([producto("b", "Suite")]);
    c.agregar([producto("a", "Estándar Queen")]);
    c.agregar([producto("b", "Suite")]);

    expect(c.lista()).toEqual([
      // Las filas del contenido, en el orden en que aparecen.
      { id: "contenido/catalogo", zona: "contenido", nombre: "Habitaciones", orden: 0, secciones: [{ id: "b", nombre: "Suite" }, { id: "a", nombre: "Estándar Queen" }] },
      // Las secciones de una pantalla, en el orden del registro.
      { id: "pantallas/habitacion", zona: "pantallas", nombre: "Ficha de la habitación", orden: 9, secciones: [{ id: "ficha", nombre: "Ficha" }, { id: "calendario-de-la-estadia", nombre: "Calendario de la estadía" }] },
      { id: "mensajes/correos", zona: "mensajes", nombre: "Correos al cliente", orden: 19, secciones: [{ id: "reserva-confirmada", nombre: "Reserva confirmada" }] }
    ]);
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
