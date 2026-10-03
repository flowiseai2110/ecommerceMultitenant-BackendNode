import { esBasura, esSaludo, enmascararPagos, clasificarMensaje, textoPlantilla, PLANTILLA } from "../filtros.js";

describe("esBasura", () => {
  it.each(["532 3%& '34", "???", "jjjjjj", "xkcd qwrt", "😀😀", "   "])("«%s» es basura", (t) => {
    expect(esBasura(t)).toBe(true);
  });

  it.each([
    "40",            // respuesta a "¿qué talla?"
    "200",           // presupuesto
    "S/ 200",
    "zapas pa correr",
    "q",
    "ok",
    "PED-0007",
    "talla 40 negras"
  ])("«%s» NO es basura", (t) => {
    expect(esBasura(t)).toBe(false);
  });
});

describe("esSaludo", () => {
  it.each(["hola", "Hola!!", "¡Buenas tardes!", "hola, buenas", "hola qué tal", "Buenos días", "holi"])(
    "«%s» es solo un saludo",
    (t) => expect(esSaludo(t)).toBe(true)
  );

  it.each(["hola, busco zapatillas", "buenas, tienen talla 40?", "holanda", "quiero un polo"])(
    "«%s» trae algo más que un saludo",
    (t) => expect(esSaludo(t)).toBe(false)
  );
});

describe("enmascararPagos", () => {
  it("oculta un número de tarjeta válido (Luhn), con o sin espacios", () => {
    expect(enmascararPagos("mi tarjeta es 4111 1111 1111 1111 vence 12/28")).toEqual({
      texto: "mi tarjeta es [tarjeta oculta] vence 12/28",
      oculto: true
    });
    expect(enmascararPagos("4111-1111-1111-1111").oculto).toBe(true);
  });

  it("no toca números largos que no son tarjetas", () => {
    expect(enmascararPagos("1234 5678 9012 3456").oculto).toBe(false); // no pasa Luhn
    expect(enmascararPagos("mi celular es 987654321").oculto).toBe(false);
    expect(enmascararPagos("DNI 45678912").oculto).toBe(false);
  });
});

describe("clasificarMensaje", () => {
  it("la tarjeta gana a todo y el texto sale enmascarado", () => {
    expect(clasificarMensaje("hola 4111111111111111")).toEqual({
      texto: "hola [tarjeta oculta]",
      plantilla: PLANTILLA.PAGO
    });
  });

  it("basura, saludo o nada", () => {
    expect(clasificarMensaje("$$$").plantilla).toBe(PLANTILLA.BASURA);
    expect(clasificarMensaje("hola").plantilla).toBe(PLANTILLA.SALUDO);
    expect(clasificarMensaje("zapatillas para correr")).toEqual({ texto: "zapatillas para correr", plantilla: null });
  });
});

describe("textoPlantilla", () => {
  it("el saludo se presenta como asistente de IA y ofrece una persona", () => {
    const t = textoPlantilla(PLANTILLA.SALUDO, { tiendaNombre: "Zap Terrex" });
    expect(t).toContain("asistente virtual de Zap Terrex");
    expect(t).toContain("persona");
  });

  it("la plantilla de pago remite al checkout oficial", () => {
    expect(textoPlantilla(PLANTILLA.PAGO)).toContain("checkout");
  });
});
