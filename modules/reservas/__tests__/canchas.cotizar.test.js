import { bloquesDelDia, horasDeInicio, minutosCierre, todoElDiaNoche, tramosDelTurno } from "../canchas/tarifa.js";
import { cotizarCancha, textoDuracion } from "../canchas/cotizar.js";
import { instanteLima } from "../tiempo.js";

// Complejo de San Juan de Lurigancho (alquiler-canchas): abre de 7:00 a 23:00,
// noche desde las 18:00, fines de semana y feriados con tarifa noche todo el día.
const config = {
  canchaApertura: "07:00", canchaCierre: "23:00", canchaInicioNoche: "18:00", canchaFindeNoche: true,
  canchaDuraciones: [60, 90, 120], anticipacionMinHoras: 0,
  cobro: "adelanto", adelantoPct: 50, avisoProximoHoras: 2, avisoProximoTexto: "Tu partido es pronto ({hora})."
};
const f7 = { nombre: "Cancha 1", formato: "F7", precioDia: 120, precioNoche: 160 };
const feriados = { 2026: ["2026-10-08"] };
// Lunes 12/10/2026, 9:00 de Lima.
const ahora = instanteLima("2026-10-12", "09:00");
const base = { cancha: f7, config, ahora, feriados };

describe("tarifa (R2, R3, R8)", () => {
  it("bloques de 30 min de la apertura al cierre, noche desde las 18:00", () => {
    const b = bloquesDelDia("2026-10-12", config, feriados);
    expect(b).toHaveLength(32);
    expect(b[0]).toEqual({ min: 420, hora: "07:00", noche: false });
    expect(b.find((x) => x.hora === "17:30").noche).toBe(false);
    expect(b.find((x) => x.hora === "18:00").noche).toBe(true);
    expect(b.at(-1).hora).toBe("22:30");
  });

  it("sábado, domingo y feriado: tarifa noche todo el día (si el complejo lo usa)", () => {
    expect(todoElDiaNoche("2026-10-17", config, feriados)).toBe(true); // sábado
    expect(todoElDiaNoche("2026-10-18", config, feriados)).toBe(true); // domingo
    expect(todoElDiaNoche("2026-10-08", config, feriados)).toBe(true); // feriado (jueves)
    expect(todoElDiaNoche("2026-10-12", config, feriados)).toBe(false);
    expect(todoElDiaNoche("2026-10-17", { ...config, canchaFindeNoche: false }, feriados)).toBe(false);
  });

  it("cierre a medianoche: 00:00 es el final del día", () => {
    expect(minutosCierre("00:00")).toBe(1440);
    const b = bloquesDelDia("2026-10-12", { ...config, canchaCierre: "00:00" }, feriados);
    expect(b.at(-1).hora).toBe("23:30");
  });

  it("horas de inicio en punto según la duración", () => {
    expect(horasDeInicio(config, 60).at(-1)).toBe("22:00");
    expect(horasDeInicio(config, 120).at(-1)).toBe("21:00");
    expect(horasDeInicio(config, 90)).toHaveLength(15);
  });

  it("un turno que cruza las 18:00 cobra cada media hora con su tarifa", () => {
    const t = tramosDelTurno({ fecha: "2026-10-12", hora: "17:00", duracionMin: 120, cancha: f7, config, feriados });
    expect(t).toEqual([
      { tarifa: "dia", desde: "17:00", hasta: "18:00", minutos: 60, precioHora: 120, total: 120 },
      { tarifa: "noche", desde: "18:00", hasta: "19:00", minutos: 60, precioHora: 160, total: 160 }
    ]);
    const hora30 = tramosDelTurno({ fecha: "2026-10-12", hora: "17:00", duracionMin: 90, cancha: f7, config, feriados });
    expect(hora30.map((x) => x.total)).toEqual([120, 80]);
  });
});

describe("cotizarCancha", () => {
  it("total, adelanto del 50 % y saldo en la cancha", () => {
    const c = cotizarCancha({ ...base, fecha: "2026-10-12", hora: "19:00", duracionMin: 90 });
    expect(c.errores).toEqual([]);
    expect(c.total).toBe(240);
    expect(c.montoAPagar).toBe(120);
    expect(c.saldoDestino).toBe(120);
    expect(c.lineas).toEqual([{ descripcion: "Cancha 1 · Tarifa noche 19:00–20:30", cantidad: 1, precioUnitario: 240, total: 240 }]);
    expect(c.inicio).toEqual(instanteLima("2026-10-12", "19:00"));
    expect(c.fin).toEqual(instanteLima("2026-10-12", "20:30"));
  });

  it("sábado de día también es tarifa noche", () => {
    const c = cotizarCancha({ ...base, fecha: "2026-10-17", hora: "10:00", duracionMin: 60 });
    expect(c.total).toBe(160);
  });

  it("valida hora, duración, horario y lo ya ocupado", () => {
    const codigos = (p) => cotizarCancha({ ...base, fecha: "2026-10-12", ...p }).errores.map((e) => e.codigo);
    expect(codigos({ hora: null, duracionMin: 60 })).toContain("HORA_REQUERIDA");
    expect(codigos({ hora: "19:00", duracionMin: 45 })).toContain("DURACION_INVALIDA");
    expect(codigos({ hora: "22:00", duracionMin: 120 })).toContain("FUERA_DE_HORARIO");
    expect(codigos({ hora: "19:30", duracionMin: 60 })).toContain("FUERA_DE_HORARIO");
    expect(codigos({ hora: "06:00", duracionMin: 60 })).toContain("FUERA_DE_HORARIO");
    expect(codigos({ hora: "08:00", duracionMin: 60 })).toContain("HORA_PASADA");
    const ocupadas = [{ inicio: instanteLima("2026-10-12", "20:00"), fin: instanteLima("2026-10-12", "21:00") }];
    expect(cotizarCancha({ ...base, fecha: "2026-10-12", hora: "19:00", duracionMin: 90, ocupadas }).errores.map((e) => e.codigo)).toEqual(["HORARIO_OCUPADO"]);
    // Termina justo cuando empieza la otra: no se cruzan.
    expect(cotizarCancha({ ...base, fecha: "2026-10-12", hora: "19:00", duracionMin: 60, ocupadas }).errores).toEqual([]);
    const cierres = [{ fechaDesde: "2026-10-12", fechaHasta: "2026-10-12" }];
    expect(cotizarCancha({ ...base, fecha: "2026-10-12", hora: "19:00", duracionMin: 60, cierres }).errores.map((e) => e.codigo)).toEqual(["FECHA_CERRADA"]);
  });

  it("avisa cuando el partido es dentro de poco", () => {
    const c = cotizarCancha({ ...base, fecha: "2026-10-12", hora: "10:00", duracionMin: 60 });
    expect(c.aviso).toEqual({ texto: "Tu partido es pronto (10:00).", hora: "10:00" });
  });

  it("cobro en la cancha: no hay adelanto", () => {
    const c = cotizarCancha({ ...base, config: { ...config, cobro: "en_destino" }, fecha: "2026-10-12", hora: "19:00", duracionMin: 60 });
    expect(c.montoAPagar).toBe(0);
    expect(c.saldoDestino).toBe(160);
  });

  it("texto de la duración", () => {
    expect(textoDuracion(60)).toBe("1 h");
    expect(textoDuracion(90)).toBe("1 h 30");
    expect(textoDuracion(120)).toBe("2 h");
  });
});
