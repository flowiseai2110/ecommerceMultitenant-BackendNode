import { serializeProductoCardStore, serializeProductoDetailStore } from "../productos.serializer.js";

const fila = {
  id: "p-1", tiendaId: "t-1", nombre: "Polo", slug: "polo", precioBase: "30.00",
  imagenes: [], variantes: [],
  // Campos internos que NUNCA deben llegar al storefront.
  precioCosto: "12.00", stockAlerta: 5, metadata: { proveedor: "x" }
};

describe("rating en los serializers del store", () => {
  it.each([
    ["tarjeta", serializeProductoCardStore],
    ["detalle", serializeProductoDetailStore]
  ])("%s: expone promedio y cantidad como números", (_, serialize) => {
    // En las queries raw ($queryRaw) Postgres puede devolver el número como string.
    const dto = serialize({ ...fila, ratingPromedio: "4.67", ratingCantidad: "3" });

    expect(dto.ratingPromedio).toBe(4.67);
    expect(dto.ratingCantidad).toBe(3);
  });

  it.each([
    ["tarjeta", serializeProductoCardStore],
    ["detalle", serializeProductoDetailStore]
  ])("%s: sin datos de rating devuelve 0 (no null ni NaN)", (_, serialize) => {
    const dto = serialize(fila);

    expect(dto.ratingPromedio).toBe(0);
    expect(dto.ratingCantidad).toBe(0);
  });

  it("agregar el rating no filtra campos internos", () => {
    const dto = serializeProductoDetailStore({ ...fila, ratingPromedio: 5, ratingCantidad: 1 });

    expect(dto).not.toHaveProperty("precioCosto");
    expect(dto).not.toHaveProperty("stockAlerta");
    expect(dto).not.toHaveProperty("metadata");
  });
});
