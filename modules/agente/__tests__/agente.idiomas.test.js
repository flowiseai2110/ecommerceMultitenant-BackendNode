import { bloqueIdiomas } from "../idiomas.js";

// docs/specs/idiomas tasks.md 1.18: el asesor conoce los idiomas de la tienda.
describe("idiomas en las instrucciones del asesor", () => {
  it("siempre responde en el idioma del cliente", () => {
    expect(bloqueIdiomas([])).toContain("Responde siempre en el idioma en que te escribe el cliente");
  });

  it("con un solo idioma no menciona el selector", () => {
    expect(bloqueIdiomas([{ nombre: "Español" }])).not.toContain("selector");
  });

  it("con varios, los nombra en su propia lengua y recuerda el selector una sola vez", () => {
    const b = bloqueIdiomas([{ nombre: "Español" }, { nombre: "Runasimi" }, { nombre: "English" }]);
    expect(b).toContain("Español, Runasimi, English");
    expect(b).toContain("una sola vez");
  });
});
