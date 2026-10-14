import { copiarPlantilla } from "../copia.js";
import { buscarPlantilla, PLANTILLAS, plantillaPorDefecto, tipoNegocioDe } from "../plantillas.js";
import { resolverTema } from "../resolver.js";
import { estructuraSchema, layoutDeNegocio, LAYOUT_POR_NEGOCIO, seccionesAjenas, tiposPermitidos, TIPOS_POR_NEGOCIO, TIPOS_SECCION } from "../secciones.schema.js";
import { PRESETS_SECCION } from "../presets.js";

// docs/specs/diseno-por-rubro, fase 1 (hospedaje).

const ahora = new Date("2026-10-05T12:00:00-05:00");
const seccion = (estructura, tipo) => estructura.home.secciones.find((s) => s.tipo === tipo);

describe("plantillas por tipo de negocio (H1)", () => {
  it("las de siempre son de productos; hotel, tours y eventos tienen las suyas", () => {
    expect(tipoNegocioDe(buscarPlantilla("clasica"))).toBe("productos");
    expect(PLANTILLAS.filter((p) => p.tipoNegocio === "hotel").map((p) => p.id)).toEqual(["hotel-boutique", "hotel-casa", "hotel-estandar"]);
    expect(PLANTILLAS.filter((p) => p.tipoNegocio === "tours").map((p) => p.id)).toEqual(["tours-catalogo", "tours-operador", "tours-estandar"]);
    expect(PLANTILLAS.filter((p) => p.tipoNegocio === "eventos").map((p) => p.id)).toEqual(["eventos-cartelera", "eventos-unico", "eventos-estandar"]);
  });

  it.each(PLANTILLAS.map((p) => p.id))("%s solo usa secciones de su tipo de negocio", (id) => {
    const p = buscarPlantilla(id);
    expect(seccionesAjenas(p.secciones, tipoNegocioDe(p))).toEqual({});
  });

  it("cada tipo de sección existe en algún tipo de negocio y tiene preset", () => {
    const usados = new Set(Object.values(TIPOS_POR_NEGOCIO).flat());
    expect([...usados].sort()).toEqual([...TIPOS_SECCION].sort());
    expect(Object.keys(PRESETS_SECCION).sort()).toEqual([...TIPOS_SECCION].sort());
  });

  it("un tipo de negocio sin lista propia usa la de productos", () => {
    expect(tiposPermitidos("otro")).toBe(TIPOS_POR_NEGOCIO.productos);
    expect(tiposPermitidos(undefined)).toBe(TIPOS_POR_NEGOCIO.productos);
  });
});

describe("copia de las plantillas de hotel (H5)", () => {
  it("servicios se copia oculta y como ejemplo; habitaciones y políticas, visibles", () => {
    const e = copiarPlantilla(buscarPlantilla("hotel-boutique"));
    expect(seccion(e, "servicios")).toMatchObject({ oculto: true, ejemplo: true });
    expect(seccion(e, "habitaciones").oculto).toBeUndefined();
    expect(seccion(e, "politicas").oculto).toBeUndefined();
  });

  it("ubicación no trae lugares cercanos inventados", () => {
    for (const id of ["hotel-boutique", "hotel-casa"]) {
      expect(seccion(copiarPlantilla(buscarPlantilla(id)), "ubicacion").cercanos).toEqual([]);
    }
  });

  it("el buscador de la portada se conserva y el título de ejemplo no se publica", () => {
    expect(seccion(copiarPlantilla(buscarPlantilla("hotel-boutique")), "hero")).toMatchObject({ buscador: true, titulo: null, textoBoton: "Ver habitaciones" });
  });
});

describe("estructura por defecto según el tipo de negocio (H4)", () => {
  it("un hotel sin estructura se ve con la Boutique, tours con el Catálogo y productos con la clásica", () => {
    expect(plantillaPorDefecto("hotel").id).toBe("hotel-boutique");
    expect(resolverTema({ tipoNegocio: "hotel" }, ahora).estructura.plantillaId).toBe("hotel-boutique");
    expect(resolverTema({ tipoNegocio: "productos" }, ahora).estructura.plantillaId).toBe("clasica");
    expect(resolverTema({ tipoNegocio: "tours" }, ahora).estructura.plantillaId).toBe("tours-catalogo");
  });

  it("no publica las secciones de ejemplo del hotel", () => {
    const tipos = resolverTema({ tipoNegocio: "hotel" }, ahora).estructura.home.secciones.map((s) => s.tipo);
    expect(tipos).toEqual(expect.arrayContaining(["hero", "habitaciones", "ubicacion", "politicas"]));
    expect(tipos).not.toContain("servicios");
  });

  it("una estructura de productos guardada no se publica en un hotel (cambió de tipo)", () => {
    const estructura = copiarPlantilla(buscarPlantilla("moda"));
    expect(resolverTema({ estructura, tipoNegocio: "hotel" }, ahora).estructura.plantillaId).toBe("hotel-boutique");
    expect(resolverTema({ estructura, tipoNegocio: "productos" }, ahora).estructura.plantillaId).toBe("moda");
  });
});

describe("validación de secciones por tipo de negocio (H3)", () => {
  it("señala la sección ajena con la ruta que usa el admin", () => {
    const e = copiarPlantilla(buscarPlantilla("hotel-boutique"));
    e.home.secciones.push({ id: "destacados", tipo: "productos", fuente: "destacados", variante: "carrusel", fondo: "pagina", titulo: "x" });
    const i = e.home.secciones.length - 1;
    expect(Object.keys(seccionesAjenas(e.home.secciones, "hotel"))).toEqual([`estructura.home.secciones.${i}.tipo`]);
    expect(seccionesAjenas(copiarPlantilla(buscarPlantilla("hotel-boutique")).home.secciones, "productos")).toHaveProperty(["estructura.home.secciones.1.tipo"]);
  });
});

describe("schema de las secciones de hotel", () => {
  const base = () => copiarPlantilla(buscarPlantilla("hotel-boutique"));

  it("servicios pide de 2 a 12 items con íconos del catálogo", () => {
    const e = base();
    seccion(e, "servicios").items = [{ icono: "wifi", titulo: "Wifi" }];
    expect(estructuraSchema.safeParse(e).success).toBe(false);
    seccion(e, "servicios").items = [{ icono: "wifi", titulo: "Wifi" }, { icono: "jacuzzi", titulo: "Jacuzzi" }];
    expect(estructuraSchema.safeParse(e).success).toBe(false);
  });

  it("ubicación completa sus defaults y limita los cercanos a 4", () => {
    const e = base();
    const u = seccion(e, "ubicacion");
    delete u.cercanos;
    delete u.mapa;
    expect(seccion(estructuraSchema.parse(e), "ubicacion")).toMatchObject({ cercanos: [], mapa: true });
    u.cercanos = ["a", "b", "c", "d", "e"];
    expect(estructuraSchema.safeParse(e).success).toBe(false);
  });

  it("solo una sección de habitaciones", () => {
    const e = base();
    e.home.secciones.push({ ...seccion(e, "habitaciones"), id: "habitaciones-2" });
    expect(estructuraSchema.safeParse(e).success).toBe(false);
  });
});

describe("opciones de la ficha de habitación (fase 1b)", () => {
  it("una estructura sin `habitacion` recibe los defaults", () => {
    const e = copiarPlantilla(buscarPlantilla("hotel-boutique"));
    expect(resolverTema({ estructura: e, tipoNegocio: "hotel" }, ahora).estructura.layout.habitacion)
      .toEqual({ galeria: "carrusel", listado: "grilla", servicios: true, politicas: true, mapa: true, otras: true });
  });

  it("la plantilla estándar del hotel lista las habitaciones en filas (mapeo-pantallas 2.2)", () => {
    const e = copiarPlantilla(buscarPlantilla("hotel-estandar"));
    expect(resolverTema({ estructura: e, tipoNegocio: "hotel" }, ahora).estructura.layout.habitacion.listado).toBe("filas");
  });

  it("Casa única usa la galería en mosaico y el layout del hotel rechaza una galería desconocida", () => {
    const e = copiarPlantilla(buscarPlantilla("hotel-casa"));
    expect(e.layout.habitacion.galeria).toBe("mosaico");
    e.layout.habitacion.galeria = "slider";
    expect(() => layoutDeNegocio(e.layout, "hotel")).toThrow();
  });
});

describe("layout por rubro (layout-por-rubro RU8)", () => {
  const VIEJO = {
    header: { logo: "centro" },
    productCard: { cta: "boton", imagen: "vertical" },
    producto: { galeria: "arriba" },
    habitacion: { galeria: "mosaico" },
    tour: { galeria: "mosaico" },
    evento: { galeria: "mosaico" }
  };
  const claves = (o) => Object.keys(o).sort();

  it("cada tipo de negocio tiene su layout", () => {
    expect(claves(LAYOUT_POR_NEGOCIO)).toEqual(claves(TIPOS_POR_NEGOCIO));
  });

  it("una estructura vieja queda con el header y solo lo de su rubro, con defaults", () => {
    expect(claves(layoutDeNegocio(VIEJO, "productos"))).toEqual(["header", "productCard", "producto"]);
    expect(claves(layoutDeNegocio(VIEJO, "hotel"))).toEqual(["habitacion", "header"]);
    expect(claves(layoutDeNegocio(VIEJO, "tours"))).toEqual(["header", "tour"]);
    expect(claves(layoutDeNegocio(VIEJO, "eventos"))).toEqual(["evento", "header"]);
    expect(claves(layoutDeNegocio(VIEJO, "locales"))).toEqual(["header"]);
    expect(layoutDeNegocio(VIEJO, "hotel").habitacion).toMatchObject({ galeria: "mosaico", servicios: true });
    expect(layoutDeNegocio(VIEJO, "desconocido")).toHaveProperty("productCard");
  });

  it("las plantillas de reservas no traen la tarjeta ni el detalle de producto", () => {
    for (const p of PLANTILLAS.filter((p) => p.tipoNegocio !== "productos")) {
      const e = copiarPlantilla(p);
      expect(e.layout).not.toHaveProperty("productCard");
      expect(e.layout).not.toHaveProperty("producto");
      expect(claves(e.layout)).toEqual(claves(layoutDeNegocio(e.layout, p.tipoNegocio)));
    }
  });

  it("el storefront recibe solo el layout del rubro de la tienda", () => {
    const tema = resolverTema({ tipoNegocio: "tours", estructura: { ...copiarPlantilla(buscarPlantilla("tours-operador")), layout: VIEJO } }, new Date());
    expect(claves(tema.estructura.layout)).toEqual(["header", "tour"]);
  });
});

describe("tours (fase 2)", () => {
  it("la copia del Catálogo oculta servicios y preguntas de ejemplo y deja visibles los tours y las políticas", () => {
    const e = copiarPlantilla(buscarPlantilla("tours-catalogo"));
    expect(seccion(e, "servicios")).toMatchObject({ oculto: true, ejemplo: true });
    expect(seccion(e, "faq")).toMatchObject({ oculto: true, ejemplo: true });
    expect(seccion(e, "tours").oculto).toBeUndefined();
    expect(seccion(e, "politicas").oculto).toBeUndefined();
    expect(seccion(e, "hero")).toMatchObject({ buscador: true, titulo: null });
  });

  it("habitaciones no existe en tours ni tours en hotel", () => {
    const tours = copiarPlantilla(buscarPlantilla("tours-catalogo")).home.secciones;
    expect(seccionesAjenas(tours, "tours")).toEqual({});
    expect(Object.keys(seccionesAjenas(tours, "hotel"))).toHaveLength(1);
  });

  it("layout.tour toma defaults y el Operador usa la galería en mosaico", () => {
    const e = copiarPlantilla(buscarPlantilla("tours-catalogo"));
    expect(resolverTema({ estructura: e, tipoNegocio: "tours" }, ahora).estructura.layout.tour)
      .toEqual({ galeria: "carrusel", itinerario: true, incluye: true, otros: true });
    expect(copiarPlantilla(buscarPlantilla("tours-operador")).layout.tour.galeria).toBe("mosaico");
  });
});

describe("eventos con entradas (fase 3)", () => {
  it("un organizador sin estructura se ve con la Cartelera, sin las secciones de ejemplo", () => {
    const { estructura } = resolverTema({ tipoNegocio: "eventos" }, ahora);
    expect(estructura.plantillaId).toBe("eventos-cartelera");
    expect(estructura.home.secciones.map((s) => s.tipo)).toEqual(["hero", "eventos", "politicas", "contacto"]);
  });

  it("la clásica guardada antes de la fase 3 deja de publicarse en eventos", () => {
    const estructura = copiarPlantilla(buscarPlantilla("clasica"));
    expect(resolverTema({ estructura, tipoNegocio: "eventos" }, ahora).estructura.plantillaId).toBe("eventos-cartelera");
  });

  it("la sección eventos no existe en tours ni tours en eventos", () => {
    const eventos = copiarPlantilla(buscarPlantilla("eventos-unico")).home.secciones;
    expect(seccionesAjenas(eventos, "eventos")).toEqual({});
    expect(Object.keys(seccionesAjenas(eventos, "tours"))).toHaveLength(1);
  });

  it("valida la variante agenda y layout.evento toma defaults", () => {
    const e = copiarPlantilla(buscarPlantilla("eventos-unico"));
    expect(estructuraSchema.safeParse(e).success).toBe(true);
    expect(seccion(e, "eventos").variante).toBe("agenda");
    expect(e.layout.evento).toEqual({ galeria: "mosaico", mapa: true, otros: false });
    const cartelera = copiarPlantilla(buscarPlantilla("eventos-cartelera"));
    expect(resolverTema({ estructura: cartelera, tipoNegocio: "eventos" }, ahora).estructura.layout.evento)
      .toEqual({ galeria: "carrusel", mapa: true, otros: true });
  });
});
