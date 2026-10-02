import {
  claveOpcion,
  claveCombinacion,
  nombreVariante,
  sincronizarVariantesSchema
} from "../producto-opciones.js";

const color = (valores) => ({ nombre: "Color", tipo: "color", valores });
const talla = (valores) => ({ nombre: "Talla", tipo: "texto", valores });
const variante = (atributos, stock = 1) => ({ atributos, stock });

const errores = (body) => {
  const r = sincronizarVariantesSchema.safeParse(body);
  return r.success ? [] : r.error.issues.map(i => i.message);
};

describe("claveOpcion", () => {
  it("normaliza tildes, mayúsculas y espacios", () => {
    expect(claveOpcion("Tamaño")).toBe("tamano");
    expect(claveOpcion("  Talla Zapato ")).toBe("talla_zapato");
    expect(claveOpcion("TALLA")).toBe("talla");
  });

  it("devuelve vacío si no queda nada usable", () => {
    expect(claveOpcion("¿?")).toBe("");
  });
});

describe("claveCombinacion", () => {
  it("no depende del orden de las claves ni de mayúsculas", () => {
    const a = claveCombinacion({ talla: "M", color: "negro" }, ["color", "talla"]);
    const b = claveCombinacion({ color: "negro", talla: "m" }, ["color", "talla"]);
    expect(a).toBe(b);
  });

  it("es null para variantes viejas sin atributos", () => {
    expect(claveCombinacion(null, ["talla"])).toBeNull();
    expect(claveCombinacion({ color: "negro" }, ["color", "talla"])).toBeNull();
  });
});

describe("nombreVariante", () => {
  it("usa la etiqueta del color y el orden de las opciones", () => {
    const opciones = [color(["marron"]), talla(["M"])];
    expect(nombreVariante(opciones, { talla: "M", color: "marron" })).toBe("Marrón / M");
  });
});

describe("sincronizarVariantesSchema", () => {
  it("acepta color + talla con su matriz", () => {
    const body = {
      opciones: [color(["negro", "azul"]), talla(["S", "M"])],
      variantes: [
        variante({ color: "negro", talla: "S" }),
        variante({ color: "negro", talla: "M" }),
        variante({ color: "azul", talla: "S" }, 0)
      ]
    };
    expect(errores(body)).toEqual([]);
  });

  it("acepta opciones libres de cualquier rubro", () => {
    const body = {
      opciones: [{ nombre: "Tamaño", valores: ["50 ml", "100 ml"] }],
      variantes: [variante({ tamano: "50 ml" }), variante({ tamano: "100 ml" })]
    };
    expect(errores(body)).toEqual([]);
  });

  it("vaciar opciones y variantes es válido (quita las variantes)", () => {
    expect(errores({ opciones: [], variantes: [] })).toEqual([]);
  });

  it("fuerza el nombre Color en la opción de color", () => {
    const r = sincronizarVariantesSchema.parse({
      opciones: [{ nombre: "Colores", tipo: "color", valores: ["negro"] }],
      variantes: [variante({ color: "negro" })]
    });
    expect(r.opciones[0].nombre).toBe("Color");
  });

  it("rechaza colores fuera de la paleta", () => {
    expect(errores({ opciones: [color(["fucsia"])], variantes: [] }))
      .toContain('Color inválido: "fucsia"');
  });

  it("rechaza una opción de texto llamada color", () => {
    expect(errores({ opciones: [{ nombre: "Color", valores: ["Rojo"] }], variantes: [] }))
      .toContain("Para colores usa la opción de tipo color");
  });

  it("rechaza opciones y valores repetidos", () => {
    expect(errores({ opciones: [talla(["S"]), { nombre: "talla", valores: ["M"] }], variantes: [] }))
      .toContain('Opción repetida: "talla"');
    expect(errores({ opciones: [talla(["S", "s"])], variantes: [] }))
      .toContain('Valor repetido en Talla: "s"');
  });

  it("rechaza variantes con valores que no están en la opción", () => {
    expect(errores({ opciones: [talla(["S"])], variantes: [variante({ talla: "XL" })] }))
      .toContain('"XL" no es un valor de Talla');
  });

  it("rechaza variantes a las que les falta una opción", () => {
    expect(errores({ opciones: [color(["negro"]), talla(["S"])], variantes: [variante({ talla: "S" })] }))
      .toContain("La variante debe tener un valor por cada opción");
  });

  it("rechaza combinaciones repetidas", () => {
    const body = { opciones: [talla(["S"])], variantes: [variante({ talla: "S" }), variante({ talla: "S" })] };
    expect(errores(body)).toContain("Combinación repetida: S");
  });

  it("rechaza variantes sin opciones", () => {
    expect(errores({ opciones: [], variantes: [variante({})] }))
      .toContain("Define al menos una opción para crear variantes");
  });

  it("rechaza stock negativo", () => {
    expect(errores({ opciones: [talla(["S"])], variantes: [variante({ talla: "S" }, -1)] }))
      .toContain("El stock no puede ser negativo");
  });
});

describe("updateProductoSchema y el stock de productos con variantes", () => {
  it("no rellena stock con 0 cuando el admin no lo manda", async () => {
    const { updateProductoSchema } = await import("../productos.schema.js");
    const r = updateProductoSchema.parse({ nombre: "Zapatilla" });
    expect("stock" in r).toBe(false);
  });
});
