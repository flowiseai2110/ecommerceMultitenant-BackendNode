import { PLANTILLAS } from "../plantillas.js";
import { temaSchema } from "../secciones.schema.js";

// editor-diseno-en-vivo V1: el tema de una plantilla se pone en el borrador y
// se publica con el PUT /diseno, así que tiene que pasar su validación.
describe("tema de las plantillas", () => {
  it.each(PLANTILLAS.filter((p) => p.tema).map((p) => [p.id, p.tema]))("%s usa paleta y tipografía del catálogo", (_id, tema) => {
    expect(temaSchema.safeParse(tema).success).toBe(true);
  });

  it("canchas-complejo trae el verde cancha con letra deportiva", () => {
    expect(PLANTILLAS.find((p) => p.id === "canchas-complejo").tema).toEqual({ paleta: "cancha-tinte", tipografia: "deportiva" });
  });
});
