import { textoRicoEmail } from "../texto-rico-email.js";

describe("textoRicoEmail", () => {
  it("párrafos y saltos de línea con estilos en línea", () => {
    const html = textoRicoEmail("Hola\nmañana cerramos\n\nGracias");
    expect(html).toMatch(/^<p style="[^"]+">Hola<br>mañana cerramos<\/p>/);
    expect(html).toContain(">Gracias</p>");
  });

  it("negrita, listas y enlaces", () => {
    const html = textoRicoEmail("**Importante**\n- Piscina cerrada\n- Desayuno 7 a 10\n\n[Ver tienda](https://a.pe)");
    expect(html).toContain("<strong>Importante</strong>");
    expect(html).toMatch(/<ul style="[^"]+">/);
    expect(html).toContain('<li style="margin: 0 0 4px;">Piscina cerrada</li>');
    expect(html).toContain('<a href="https://a.pe" style="color: #2563eb;">Ver tienda</a>');
  });

  it("las listas numeradas conservan el número escrito", () => {
    expect(textoRicoEmail("3. Tercero\n7. Séptimo")).toContain('<li value="7"');
  });

  it("el HTML se muestra como texto y no hay enlaces peligrosos ni imágenes", () => {
    const html = textoRicoEmail('<img src=x onerror="alert(1)"> [x](javascript:alert(1)) ![f](https://a.pe/f.png)');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("&lt;img");
  });

  it("vacío → cadena vacía", () => {
    expect(textoRicoEmail("  ")).toBe("");
  });
});
