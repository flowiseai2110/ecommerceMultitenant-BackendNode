import { readFileSync } from "node:fs";
import { confirmadaEmail, fechaHora, nuevaSolicitudEmail, pedirResenaEmail, solicitudRecibidaEmail } from "../reservas.emails.js";
import { crearTraductor } from "../../idiomas/traductor.js";

// El inglés real de la plataforma (modules/idiomas/plataforma/en.json).
const en = crearTraductor(JSON.parse(readFileSync(new URL("../../idiomas/plataforma/en.json", import.meta.url), "utf8")));
const url = "https://tienda.test/resenar/abc";

// "¿Cómo te fue?" tras la estadía o el tour (docs/specs/hospedaje-completo C6)
describe("pedirResenaEmail", () => {
  it("habla del tour en inglés e invita a la reseña en otro sitio", () => {
    const c = pedirResenaEmail({
      idioma: "en", nombre: "Ann", negocio: "Paracas Tours", producto: "Islas Ballestas", tipo: "tour",
      externa: { fuente: "tripadvisor", puntaje: 4.8, cantidad: 300, url: "https://www.tripadvisor.com/x" }
    }, url, en);
    expect(c.subject).toBe("How was your tour with Paracas Tours?");
    expect(c.html).toContain("Your tour");
    expect(c.html).toContain("https://www.tripadvisor.com/x");
    expect(c.html).toContain("Tripadvisor");
    expect(c.html).toContain('<html lang="en">');
  });

  it("sin reseña externa solo lleva el link propio", () => {
    const c = pedirResenaEmail({ idioma: "es", nombre: "Ana", negocio: "Killa", producto: null }, url);
    expect(c.subject).toBe("¿Cómo te fue con Killa?");
    expect(c.html).toContain(url);
    expect(c.html).not.toContain("nos ayuda mucho");
  });
});

// docs/specs/idiomas D11, B7
describe("correos en el idioma en que reservó", () => {
  const base = {
    id: "r1", codigo: "R-100", total: 480, montoPagado: 480, saldoDestino: 0, estado: "confirmada", idiomaHuesped: "en",
    inicio: "2026-09-24T19:00:00Z", fin: "2026-09-27T17:00:00Z",
    titular: { nombres: "Ann", apellidos: "Lee" }, contacto: { whatsapp: "999" },
    negocio: { nombre: "Killa Hostal", direccion: "Barranco", alojamiento: "hostal" }, producto: { nombre: "Matrimonial" },
    modalidad: { tipo: "noche", etiqueta: "Noche" }, noches: 3, habitaciones: 1, adultos: 2, ninos: 1
  };

  it("hotel: el texto en inglés de siempre, con la voz del tipo de alojamiento y la fecha a su modo", () => {
    const c = confirmadaEmail(base, url, en);
    expect(c.subject).toBe("✅ Booking confirmed R-100 — Killa Hostal");
    expect(c.html).toContain("Hi Ann, we look forward to welcoming you at <strong>Killa Hostal</strong> (Barranco).");
    expect(c.html).toContain("3 nights");
    expect(c.html).toContain("2 adults, 1 child");
    expect(c.html).toContain("Thu, Sep 24, 14:00");
  });

  it("evento: antes solo en español; ahora también en el idioma de la compra", () => {
    const evento = { ...base, tipo: "evento", evento: { lugar: "Teatro Municipal" }, entradas: [{ nombre: "General", cantidad: 2 }] };
    const c = confirmadaEmail(evento, url, en);
    expect(c.subject).toBe("✅ Tickets confirmed R-100 — Matrimonial");
    expect(c.html).toContain("Your tickets are confirmed!");
  });

  it("sin traductor, en el idioma base (y la fecha como siempre)", () => {
    const c = solicitudRecibidaEmail({ ...base, idiomaHuesped: "es", estado: "solicitada" }, url);
    expect(c.subject).toBe("Recibimos tu solicitud de reserva R-100 — Killa Hostal");
    expect(c.html).toContain("El hostal confirmará la disponibilidad");
    expect(fechaHora("2026-09-24T19:00:00Z")).toBe("jue, 24/09, 14:00");
  });

  it("al negocio, siempre en el idioma base", () => {
    const c = nuevaSolicitudEmail({ ...base, tipo: "hotel", estado: "solicitada" });
    expect(c.html).toContain("Tienes una nueva solicitud de reserva");
    expect(c.html).toContain("Código de reserva");
  });

  it("la traducción del dueño se escapa: no puede meter HTML en el correo", () => {
    const malicioso = crearTraductor({ "¡Tu reserva está confirmada!": "<script>x</script>Listo" });
    const c = confirmadaEmail(base, url, malicioso);
    expect(c.html).not.toContain("<script>");
    expect(c.html).toContain("&lt;script&gt;x&lt;/script&gt;Listo");
  });
});
