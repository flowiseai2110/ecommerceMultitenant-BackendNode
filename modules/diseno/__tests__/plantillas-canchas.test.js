import { buscarPlantilla } from "../plantillas.js";
import { copiarPlantilla } from "../copia.js";
import { buscarPaleta } from "../paletas.js";
import { estructuraSchema, seccionesAjenas } from "../secciones.schema.js";
import { PRESETS_SECCION } from "../presets.js";

// docs/specs/plantillas-canchas.

const seccion = (estructura, tipo) => estructura.home.secciones.find((s) => s.tipo === tipo);

describe("plantillas de canchas", () => {
  it.each(["canchas-complejo", "canchas-noche", "canchas-liga"])("%s se copia como una estructura válida del rubro", (id) => {
    const e = copiarPlantilla(buscarPlantilla(id));
    const r = estructuraSchema.safeParse(e);
    expect(r.success ? [] : r.error.issues).toEqual([]);
    expect(seccionesAjenas(e.home.secciones, "canchas")).toEqual({});
  });

  it("Noche de reflectores usa la portada con foto y la paleta oscura ámbar", () => {
    const noche = buscarPlantilla("canchas-noche");
    expect(seccion(copiarPlantilla(noche), "canchas-portada").variante).toBe("foto");
    expect(noche.tema).toEqual({ paleta: "amber-noche", tipografia: "deportiva" });
  });

  it("la tabla de la liga llega vacía y oculta: nunca equipos inventados (PC3)", () => {
    const liga = seccion(copiarPlantilla(buscarPlantilla("canchas-liga")), "liga");
    expect(liga).toMatchObject({ equipos: [], oculto: true });
    // La plantilla sí trae equipos de ejemplo para su miniatura.
    expect(seccion({ home: { secciones: buscarPlantilla("canchas-liga").secciones } }, "liga").equipos.length).toBeGreaterThan(0);
  });

  it("la liga solo es de canchas", () => {
    expect(seccionesAjenas([{ id: "liga", ...PRESETS_SECCION.liga }], "productos")).not.toEqual({});
  });
});

describe("tabla de la liga (PC3)", () => {
  const conEquipos = (equipos) => {
    const e = copiarPlantilla(buscarPlantilla("canchas-liga"));
    e.home.secciones = e.home.secciones.map((s) => (s.tipo === "liga" ? { ...s, oculto: false, equipos } : s));
    return estructuraSchema.safeParse(e);
  };

  it("acepta equipos con resultados que cuadran", () => {
    expect(conEquipos([{ nombre: "Los Veteranos", pj: 3, pg: 2, pe: 1, pp: 0, gf: 7, gc: 2 }]).success).toBe(true);
  });

  it("rechaza ganados + empatados + perdidos distinto de jugados", () => {
    expect(conEquipos([{ nombre: "Los Veteranos", pj: 3, pg: 2, pe: 2, pp: 0, gf: 7, gc: 2 }]).success).toBe(false);
  });
});

describe("paletas Noche (PC1)", () => {
  it("cada base tiene su versión oscura", () => {
    expect(buscarPaleta("amber-noche")).toMatchObject({ oscura: true, fondos: { topBar: "primario", pagina: "neutro", footer: "claro" } });
    expect(buscarPaleta("cancha-noche")?.oscura).toBe(true);
    expect(buscarPaleta("amber-contraste").oscura).toBe(false);
  });
});
