import { cotizarHotel, montoACuenta, textoAviso } from "../hotel/cotizar.js";
import { estadoEfectivo, transicionar } from "../estados.js";
import { fechaLima, horaLima, instanteLima } from "../tiempo.js";

// Caso real (Hotel Verona, Los Olivos): Matrimonial, noche S/ 160 y fracción 6 h S/ 100.
const tipo = { capacidadAdultos: 2, capacidadNinos: 0, capacidadMax: 2, porPersona: false };
const noche = { tipo: "noche", horas: null, precio: 160, precioVieSab: 180, activo: true };
const seisHoras = { tipo: "horas", horas: 6, precio: 100, precioVieSab: null, activo: true };
const config = {
  horaCheckin: "14:00", horaCheckout: "12:00", cobro: "total", adelantoPct: null, anticipacionMinHoras: 0,
  avisoProximoHoras: 2, avisoProximoTexto: "Si el hotel no la confirma antes de las {hora}, se anula."
};
// Miércoles 24/09/2026, 9:43 de Lima.
const ahora = instanteLima("2026-09-24", "09:43");

describe("tiempo", () => {
  it("convierte a hora de Lima sin importar la zona del servidor", () => {
    const i = instanteLima("2026-09-24", "18:30");
    expect(i.toISOString()).toBe("2026-09-24T23:30:00.000Z");
    expect(fechaLima(i)).toBe("2026-09-24");
    expect(horaLima(i)).toBe("18:30");
  });
});

describe("cotizarHotel — fracción por horas (ventana fija)", () => {
  it("6 h desde las 18:30 sale a las 00:30 del día siguiente y cuesta el precio del bloque", () => {
    const c = cotizarHotel({ tipo, modalidad: seisHoras, fecha: "2026-09-24", hora: "18:30", adultos: 2, config, ahora });
    expect(c.errores).toEqual([]);
    expect(horaLima(c.inicio)).toBe("18:30");
    expect(fechaLima(c.fin)).toBe("2026-09-25");
    expect(horaLima(c.fin)).toBe("00:30");
    expect(c.horas).toBe(6);
    expect(c.lineas).toEqual([{ descripcion: "Estadía de 6 horas", cantidad: 1, precioUnitario: 100, total: 100 }]);
    expect(c.total).toBe(100);
    expect(c.montoAPagar).toBe(100);
    expect(c.saldoDestino).toBe(0);
  });

  it("si el bloque cruza la medianoche, un cierre del día siguiente también lo bloquea", () => {
    const cierres = [{ fechaDesde: "2026-09-25", fechaHasta: "2026-09-25" }];
    const c = cotizarHotel({ tipo, modalidad: seisHoras, fecha: "2026-09-24", hora: "20:00", adultos: 1, cierres, config, ahora });
    expect(c.errores.map(e => e.codigo)).toContain("FECHA_CERRADA");
  });
});

describe("cotizarHotel — noches", () => {
  it("agrupa las noches por precio y cobra viernes y sábado aparte", () => {
    // jue 24, vie 25, sáb 26 → 1 × 160 + 2 × 180
    const c = cotizarHotel({ tipo, modalidad: noche, fecha: "2026-09-24", noches: 3, adultos: 2, config, ahora });
    expect(c.errores).toEqual([]);
    expect(c.lineas).toEqual([
      { descripcion: "1 noche (jue 24/09)", cantidad: 1, precioUnitario: 160, total: 160 },
      { descripcion: "2 noches (vie 25/09, sáb 26/09)", cantidad: 2, precioUnitario: 180, total: 360 }
    ]);
    expect(c.total).toBe(520);
    expect(horaLima(c.inicio)).toBe("14:00");          // sin hora: check-in estándar
    expect(fechaLima(c.fin)).toBe("2026-09-27");
    expect(horaLima(c.fin)).toBe("12:00");
  });

  it("precio por persona (cama en dormitorio) se multiplica", () => {
    const dorm = { ...tipo, capacidadAdultos: 6, capacidadMax: 6, porPersona: true };
    const c = cotizarHotel({ tipo: dorm, modalidad: { ...noche, precioVieSab: null, precio: 35 }, fecha: "2026-09-28", noches: 2, adultos: 3, config, ahora });
    expect(c.total).toBe(210);
    expect(c.lineas[0].descripcion).toContain("3 personas");
  });
});

describe("cotizarHotel — reglas", () => {
  it("rechaza capacidad excedida, niños no admitidos y fechas pasadas", () => {
    const c = cotizarHotel({ tipo, modalidad: seisHoras, fecha: "2026-09-24", hora: "08:00", adultos: 3, ninos: 1, config, ahora });
    const codigos = c.errores.map(e => e.codigo);
    expect(codigos).toContain("CAPACIDAD");
    expect(codigos).toContain("FECHA_PASADA");
  });

  it("aplica la anticipación mínima (límite duro)", () => {
    const c = cotizarHotel({
      tipo, modalidad: seisHoras, fecha: "2026-09-24", hora: "10:30", adultos: 1,
      config: { ...config, anticipacionMinHoras: 1 }, ahora
    });
    expect(c.errores.map(e => e.codigo)).toEqual(["ANTICIPACION_INSUFICIENTE"]);
  });

  it("valida el número de noches", () => {
    const c = cotizarHotel({ tipo, modalidad: noche, fecha: "2026-09-28", noches: 0, adultos: 1, config, ahora });
    expect(c.errores.map(e => e.codigo)).toContain("NOCHES_INVALIDAS");
  });
});

describe("aviso de reserva próxima (límite blando)", () => {
  it("aparece si faltan menos horas que las configuradas, sin bloquear", () => {
    const c = cotizarHotel({ tipo, modalidad: seisHoras, fecha: "2026-09-24", hora: "11:00", adultos: 1, config, ahora });
    expect(c.errores).toEqual([]);
    expect(c.aviso).toEqual({ texto: "Si el hotel no la confirma antes de las 11:00, se anula.", hora: "11:00" });
  });

  it("no aparece con tiempo suficiente ni si el negocio lo desactivó", () => {
    const lejos = cotizarHotel({ tipo, modalidad: seisHoras, fecha: "2026-09-24", hora: "18:30", adultos: 1, config, ahora });
    expect(lejos.aviso).toBeNull();
    const sinAviso = cotizarHotel({
      tipo, modalidad: seisHoras, fecha: "2026-09-24", hora: "10:00", adultos: 1, config: { ...config, avisoProximoHoras: null }, ahora
    });
    expect(sinAviso.aviso).toBeNull();
  });

  it("agrega la fecha si el inicio no es hoy", () => {
    expect(textoAviso("antes de las {hora}", instanteLima("2026-09-25", "01:00"), ahora)).toBe("antes de las 01:00 del 25/09");
  });
});

describe("montoACuenta", () => {
  it("total, adelanto y pago en destino", () => {
    expect(montoACuenta(520, { cobro: "total" })).toBe(520);
    expect(montoACuenta(520, { cobro: "adelanto", adelantoPct: 30 })).toBe(156);
    expect(montoACuenta(520, { cobro: "en_destino" })).toBe(0);
  });
});

describe("estados", () => {
  it("sigue el flujo solicitud → aceptada → pago en revisión → confirmada", () => {
    expect(transicionar("solicitada", "aceptar")).toBe("aceptada");
    expect(transicionar("aceptada", "subir_captura")).toBe("pago_en_revision");
    expect(transicionar("pago_en_revision", "verificar")).toBe("confirmada");
    expect(transicionar("pago_en_revision", "rechazar_pago")).toBe("aceptada");
  });

  it("rechaza transiciones inválidas con 409", () => {
    expect(() => transicionar("confirmada", "aceptar")).toThrow(expect.objectContaining({ statusCode: 409 }));
    expect(() => transicionar("rechazada", "verificar")).toThrow(expect.objectContaining({ statusCode: 409 }));
  });

  it("lo no atendido se anula a la hora de inicio; lo pagado en revisión no", () => {
    const inicio = instanteLima("2026-09-24", "18:30");
    const despues = instanteLima("2026-09-24", "18:31");
    expect(estadoEfectivo({ estado: "solicitada", inicio }, despues)).toBe("vencida");
    expect(estadoEfectivo({ estado: "aceptada", inicio }, despues)).toBe("vencida");
    expect(estadoEfectivo({ estado: "pago_en_revision", inicio }, despues)).toBe("pago_en_revision");
    expect(estadoEfectivo({ estado: "solicitada", inicio }, ahora)).toBe("solicitada");
  });

  it("una confirmada pasa a completada al terminar la estadía", () => {
    const inicio = instanteLima("2026-09-24", "18:30");
    const fin = instanteLima("2026-09-25", "00:30");
    expect(estadoEfectivo({ estado: "confirmada", inicio, fin }, instanteLima("2026-09-24", "20:00"))).toBe("confirmada");
    expect(estadoEfectivo({ estado: "confirmada", inicio, fin }, instanteLima("2026-09-25", "01:00"))).toBe("completada");
  });
});
