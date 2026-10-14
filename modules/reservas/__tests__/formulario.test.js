import { aplicarFormulario, formularioDe } from "../formulario.js";
import { montoACuenta, opcionesDePago } from "../hotel/cotizar.js";

// Plantillas por rubro, parte 4: formulario configurable por tienda y adelanto o total (C8).
const datos = (extra = {}) => ({
  titular: { nombres: "Ana", apellidos: "Quispe", docTipo: "DNI", docNumero: "44836469", nacionalidad: "PE", nacimiento: "1990-05-01" },
  horaLlegada: "15:00", comentarios: "Llegamos en auto", ...extra
});

describe("formulario de la reserva", () => {
  it("el hotel no pide la fecha de nacimiento por defecto (va en el check-in)", () => {
    expect(formularioDe("hotel", null)).toEqual({ documento: "obligatorio", nacionalidad: "obligatorio", nacimiento: "oculto", horaLlegada: "opcional", comentarios: "opcional" });
  });

  it("la tienda cambia el modo de un campo; un campo que su rubro no tiene no aparece", () => {
    expect(formularioDe("hotel", { nacimiento: "obligatorio", documento: "oculto" })).toMatchObject({ nacimiento: "obligatorio", documento: "oculto" });
    expect(formularioDe("tours", { horaLlegada: "obligatorio" })).not.toHaveProperty("horaLlegada");
    expect(formularioDe("eventos", null)).toEqual({ documento: "obligatorio", nacionalidad: "obligatorio", comentarios: "opcional" });
  });

  it("descarta lo que la tienda no pide", () => {
    const d = aplicarFormulario(datos(), formularioDe("hotel", null));
    expect(d.titular.nacimiento).toBeNull();
    expect(d.titular.docNumero).toBe("44836469");
  });

  it("exige lo obligatorio con el campo que falta", () => {
    const sinDoc = datos({ titular: { ...datos().titular, docTipo: null, docNumero: null } });
    expect(() => aplicarFormulario(sinDoc, formularioDe("hotel", null))).toThrow(expect.objectContaining({ details: expect.objectContaining({ campo: "documento" }) }));
    expect(aplicarFormulario(sinDoc, formularioDe("hotel", { documento: "opcional" })).titular.docNumero).toBeNull();
  });
});

describe("adelanto o total (C8)", () => {
  const config = { cobro: "adelanto", adelantoPct: 50, cobroEleccion: true };

  it("con elección, el cliente paga el adelanto o el total", () => {
    expect(montoACuenta(360, config, "adelanto")).toBe(180);
    expect(montoACuenta(360, config, "total")).toBe(360);
    expect(opcionesDePago(360, config)).toEqual([
      { tipo: "adelanto", pct: 50, monto: 180 }, { tipo: "total", pct: 100, monto: 360 }
    ]);
  });

  it("sin elección rige el adelanto de la tienda, aunque pidan el total", () => {
    expect(montoACuenta(360, { ...config, cobroEleccion: false }, "total")).toBe(180);
    expect(opcionesDePago(360, { ...config, cobroEleccion: false })).toBeNull();
    expect(opcionesDePago(360, { cobro: "en_destino", cobroEleccion: true })).toBeNull();
  });
});
