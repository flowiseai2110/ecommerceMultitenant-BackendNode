import { resolverDistrito, etiquetaDistrito, prefijoInei } from "../distritos.js";

const LIMA = "150101"; // tienda en Lima Cercado
const ok = (texto, ctx) => {
  const r = resolverDistrito(texto, ctx);
  expect(r.estado).toBe("ok");
  return r.distrito.ubigeo;
};

describe("resolverDistrito", () => {
  it.each([
    ["Surco", "150140"],
    ["SJL", "150132"],
    ["san juan de lurigancho", "150132"],
    ["Jesús María", "150113"],
    ["Breña", "150105"],
    ["la molina", "150114"],
    ["Callao", "070101"],
    ["en Los Olivos", "150117"]
  ])("«%s» → %s", (texto, ubigeo) => {
    expect(ok(texto, { ubigeoTienda: LIMA })).toBe(ubigeo);
  });

  it("con nombre repetido gana el de la provincia de la tienda", () => {
    expect(ok("miraflores", { ubigeoTienda: LIMA })).toBe("150122");
    expect(ok("miraflores", { ubigeoTienda: "040101" })).toBe("040110"); // tienda en Arequipa
  });

  it("el cliente puede desambiguar con la provincia o el departamento", () => {
    expect(ok("Miraflores, Arequipa", { ubigeoTienda: LIMA })).toBe("040110");
  });

  it("sin pista de cercanía, un nombre repetido es ambiguo y ofrece opciones", () => {
    const r = resolverDistrito("miraflores");
    expect(r.estado).toBe("ambiguo");
    expect(r.opciones.map(o => o.ubigeo)).toEqual(expect.arrayContaining(["150122", "040110"]));
    expect(r.opciones.length).toBeLessThanOrEqual(5);
  });

  it("texto que no es un distrito → no_encontrado", () => {
    expect(resolverDistrito("xyz").estado).toBe("no_encontrado");
    expect(resolverDistrito("").estado).toBe("no_encontrado");
  });
});

describe("etiquetaDistrito", () => {
  it("muestra la provincia, o el departamento si la provincia se llama igual que el distrito", () => {
    expect(etiquetaDistrito({ distrito: "Santiago de Surco", provincia: "Lima", departamento: "Lima" }))
      .toBe("Santiago de Surco, Lima");
    expect(etiquetaDistrito({ distrito: "Callao", provincia: "Callao", departamento: "Callao" }))
      .toBe("Callao, Callao");
  });
});

describe("prefijoInei", () => {
  it("convierte el código de 8 dígitos de la tabla ubigeos a depto + provincia INEI", () => {
    expect(prefijoInei("01150114")).toBe("1501");
    expect(prefijoInei("01150000")).toBe("15"); // solo departamento
  });

  it("acepta un código INEI de 6 dígitos y descarta vacíos", () => {
    expect(prefijoInei("040101")).toBe("0401");
    expect(prefijoInei(null)).toBeNull();
    expect(prefijoInei("01000000")).toBeNull(); // solo país
  });

  it("con el ubigeo de la tabla, «miraflores» se resuelve en Lima", () => {
    expect(resolverDistrito("miraflores", { ubigeoTienda: "01150114" }).distrito.ubigeo).toBe("150122");
  });
});
