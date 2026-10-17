import { textoPlano } from "../texto-plano.js";

// Igual que textoPlano de FrontendStore (shared/utils/texto-rico.spec.ts).
describe("textoPlano", () => {
  it("quita los símbolos y deja el texto", () => {
    expect(textoPlano("**Polo** de *algodón*\n- Rojo\n1. Azul\n# Título\n[web](https://a.pe)"))
      .toBe("Polo de algodón\nRojo\nAzul\nTítulo\nweb");
  });

  it("no toca guiones bajos ni asteriscos sueltos dentro del texto", () => {
    expect(textoPlano("codigo_de_barra 5 * 3")).toBe("codigo_de_barra 5 * 3");
  });

  it("vacío → cadena vacía", () => {
    expect(textoPlano(null)).toBe("");
  });
});
