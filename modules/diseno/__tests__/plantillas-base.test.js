import { buscarPlantilla, combinarPlantillas, PLANTILLAS, plantillasActivas, siguienteOrden, usarFilasDeLaBase } from "../plantillas.js";
import { contenidoDePlantilla, copiarPlantilla, idDePlantilla } from "../copia.js";
import { aplicarPlantillaSchema, estructuraSchema } from "../secciones.schema.js";
import { esAdminPlataforma } from "../../../middlewares/platform-admin.middleware.js";

// docs/specs/editor-diseno-en-vivo, fase 2.

const codigo = PLANTILLAS.map((p, i) => ({ ...p, origen: "codigo", orden: i * 10, activa: true }));
const fila = (datos) => ({
  version: 1, rubro: "general", descripcion: "", activa: true, orden: 0,
  contenido: { radio: "suave", encabezados: "deportivo", layout: { header: { logo: "izquierda" } }, secciones: [], tema: null },
  ...datos
});

describe("combinarPlantillas (P2, P3)", () => {
  it("sin filas, las del código en su orden", () => {
    expect(combinarPlantillas(codigo, []).map((p) => p.id)).toEqual(PLANTILLAS.map((p) => p.id));
  });

  it("una fila con id nuevo agrega una plantilla del editor", () => {
    const todas = combinarPlantillas(codigo, [fila({ id: "canchas-simple-1a2b", tipoNegocio: "canchas", nombre: "Simple", orden: 999 })]);
    const nueva = todas.find((p) => p.id === "canchas-simple-1a2b");
    expect(nueva).toMatchObject({ origen: "editor", tipoNegocio: "canchas", nombre: "Simple", encabezados: "deportivo", activa: true });
    expect(todas.at(-1).id).toBe("canchas-simple-1a2b");
  });

  it("una fila con el id de una del código la reemplaza (nombre, orden, visibilidad)", () => {
    const todas = combinarPlantillas(codigo, [fila({ id: "moda", tipoNegocio: "productos", nombre: "Moda 2", orden: -5, activa: false })]);
    expect(todas.filter((p) => p.id === "moda")).toHaveLength(1);
    expect(todas[0]).toMatchObject({ id: "moda", nombre: "Moda 2", origen: "codigo", activa: false });
  });
});

describe("registro con filas de la base", () => {
  afterEach(() => usarFilasDeLaBase([]));

  it("una oculta no se ofrece, pero se sigue encontrando por id", () => {
    usarFilasDeLaBase([fila({ id: "hogar", tipoNegocio: "productos", nombre: "Hogar", orden: 60, activa: false })]);
    expect(plantillasActivas().some((p) => p.id === "hogar")).toBe(false);
    expect(buscarPlantilla("hogar")).not.toBeNull();
  });

  it("una plantilla nueva se puede aplicar y su estructura pasa la validación", () => {
    usarFilasDeLaBase([fila({ id: "canchas-simple-1a2b", tipoNegocio: "canchas", nombre: "Simple", contenido: contenidoDePlantilla(copiarPlantilla(buscarPlantilla("canchas-complejo"))) })]);
    expect(aplicarPlantillaSchema.safeParse({ plantillaId: "canchas-simple-1a2b" }).success).toBe(true);
    const e = copiarPlantilla(buscarPlantilla("canchas-simple-1a2b"));
    expect(estructuraSchema.safeParse(e).success).toBe(true);
  });

  it("una plantilla que no existe no se valida", () => {
    expect(aplicarPlantillaSchema.safeParse({ plantillaId: "no-existe" }).success).toBe(false);
  });

  it("una nueva va al final de su tipo de negocio", () => {
    const ultimaCanchas = Math.max(...codigo.filter((p) => p.tipoNegocio === "canchas").map((p) => p.orden));
    expect(siguienteOrden("canchas")).toBe(ultimaCanchas + 10);
  });
});

describe("contenidoDePlantilla (P5)", () => {
  const estructura = {
    radio: "suave", encabezados: "comercial", layout: { header: { logo: "izquierda" } },
    home: { secciones: [
      { id: "h", tipo: "hero", variante: "imagen-completa", titulo: "Mi hotel" },
      { id: "it", tipo: "imagen-texto", imagen: "propia", imagenUrl: "https://img/t1/diseno/a.webp", titulo: "Nuestra casa", ejemplo: true },
      { id: "g", tipo: "galeria", fotos: [{ url: "https://img/t1/diseno/1.webp" }, { url: "x" }, { url: "y" }] }
    ] }
  };

  it("las fotos de la tienda no viajan y la marca de ejemplo se quita; los textos quedan", () => {
    const c = contenidoDePlantilla(estructura, { paleta: "cancha-tinte", tipografia: "deportiva" });
    expect(c.secciones[0].titulo).toBe("Mi hotel");
    expect(c.secciones[1]).toMatchObject({ imagen: "banner", imagenUrl: null, titulo: "Nuestra casa" });
    expect(c.secciones[1].ejemplo).toBeUndefined();
    expect(c.secciones[2]).toMatchObject({ fotos: [], oculto: true });
    expect(c.tema).toEqual({ paleta: "cancha-tinte", tipografia: "deportiva" });
    // No toca la estructura original.
    expect(estructura.home.secciones[1].imagen).toBe("propia");
  });
});

describe("idDePlantilla", () => {
  it("legible, sin tildes y único", () => {
    let n = 0;
    const azar = () => ["aaaa", "bbbb"][n++];
    expect(idDePlantilla("Cancha Simple Ñandú", (id) => id === "cancha-simple-nandu-aaaa", azar)).toBe("cancha-simple-nandu-bbbb");
  });
});

describe("esAdminPlataforma", () => {
  it("por email, sin importar mayúsculas", () => {
    expect(esAdminPlataforma({ email: "Diego@Ejemplo.com" }, ["diego@ejemplo.com"])).toBe(true);
    expect(esAdminPlataforma({ email: "otro@ejemplo.com" }, ["diego@ejemplo.com"])).toBe(false);
    expect(esAdminPlataforma(null, ["diego@ejemplo.com"])).toBe(false);
    expect(esAdminPlataforma({ email: "diego@ejemplo.com" }, [])).toBe(false);
  });
});
