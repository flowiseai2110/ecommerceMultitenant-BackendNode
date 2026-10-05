import { copiarPlantilla } from "../copia.js";
import { buscarPlantilla, PLANTILLAS, plantillaPorDefecto, tipoNegocioDe } from "../plantillas.js";
import { resolverTema } from "../resolver.js";
import { estructuraSchema, seccionesAjenas, tiposPermitidos, TIPOS_POR_NEGOCIO, TIPOS_SECCION } from "../secciones.schema.js";
import { PRESETS_SECCION } from "../presets.js";

// docs/specs/diseno-por-rubro, fase 1 (hospedaje).

const ahora = new Date("2026-10-05T12:00:00-05:00");
const seccion = (estructura, tipo) => estructura.home.secciones.find((s) => s.tipo === tipo);

describe("plantillas por tipo de negocio (H1)", () => {
  it("las de siempre son de productos y hay dos de hotel", () => {
    expect(tipoNegocioDe(buscarPlantilla("clasica"))).toBe("productos");
    expect(PLANTILLAS.filter((p) => p.tipoNegocio === "hotel").map((p) => p.id)).toEqual(["hotel-boutique", "hotel-casa"]);
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
    expect(tiposPermitidos("tours")).toBe(TIPOS_POR_NEGOCIO.productos);
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
  it("un hotel sin estructura se ve con la Boutique; productos y tours siguen con la clásica", () => {
    expect(plantillaPorDefecto("hotel").id).toBe("hotel-boutique");
    expect(resolverTema({ tipoNegocio: "hotel" }, ahora).estructura.plantillaId).toBe("hotel-boutique");
    expect(resolverTema({ tipoNegocio: "productos" }, ahora).estructura.plantillaId).toBe("clasica");
    expect(resolverTema({ tipoNegocio: "tours" }, ahora).estructura.plantillaId).toBe("clasica");
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
