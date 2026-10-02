import {
  updateImagenSchema,
  uploadImagenForProductoSchema,
  confirmarIaSchema
} from "../producto-imagenes.schema.js";

const PRODUCTO = "11111111-1111-4111-8111-111111111111";

describe("valorOpcion de la imagen de producto", () => {
  it("acepta valores de cualquier opción principal, no solo colores", () => {
    expect(uploadImagenForProductoSchema.parse({ valorOpcion: "negro" }).valorOpcion).toBe("negro");
    expect(uploadImagenForProductoSchema.parse({ valorOpcion: "Stitch" }).valorOpcion).toBe("Stitch");
  });

  it("en multipart, valor vacío es foto general (null)", () => {
    expect(uploadImagenForProductoSchema.parse({ valorOpcion: "" }).valorOpcion).toBeNull();
    expect(uploadImagenForProductoSchema.parse({}).valorOpcion).toBeUndefined();
  });

  it("rechaza valores de más de 30 caracteres", () => {
    expect(updateImagenSchema.safeParse({ valorOpcion: "x".repeat(31) }).success).toBe(false);
  });

  it("editar puede asignar o quitar el valor", () => {
    expect(updateImagenSchema.parse({ valorOpcion: "Floral" }).valorOpcion).toBe("Floral");
    expect(updateImagenSchema.parse({ valorOpcion: null }).valorOpcion).toBeNull();
  });

  it("la imagen mejorada con IA conserva el valor", () => {
    expect(confirmarIaSchema.parse({ productoId: PRODUCTO, valorOpcion: "rojo" }).valorOpcion).toBe("rojo");
  });
});
