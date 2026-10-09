import { pedirResenaEmail } from "../reservas.emails.js";

// "¿Cómo te fue?" tras la estadía o el tour (docs/specs/hospedaje-completo C6)
describe("pedirResenaEmail", () => {
  const url = "https://tienda.test/resenar/abc";

  it("habla del tour en inglés e invita a la reseña en otro sitio", () => {
    const c = pedirResenaEmail({
      idioma: "en", nombre: "Ann", negocio: "Paracas Tours", producto: "Islas Ballestas", tipo: "tour",
      externa: { fuente: "tripadvisor", puntaje: 4.8, cantidad: 300, url: "https://www.tripadvisor.com/x" }
    }, url);
    expect(c.subject).toBe("How was your tour with Paracas Tours?");
    expect(c.html).toContain("Your tour");
    expect(c.html).toContain("https://www.tripadvisor.com/x");
    expect(c.html).toContain("Tripadvisor");
  });

  it("sin reseña externa solo lleva el link propio", () => {
    const c = pedirResenaEmail({ idioma: "es", nombre: "Ana", negocio: "Killa", producto: null }, url);
    expect(c.subject).toBe("¿Cómo te fue con Killa?");
    expect(c.html).toContain(url);
    expect(c.html).not.toContain("nos ayuda mucho");
  });
});
