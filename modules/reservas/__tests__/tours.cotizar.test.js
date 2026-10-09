import { cotizarTour, diaTour, textoDiasSalida } from "../tours/cotizar.js";
import { estadoEfectivo } from "../estados.js";
import { fechaLima, horaLima, instanteLima } from "../tiempo.js";

// Agencia de Paracas: Islas Ballestas, sale martes a domingo a las 08:00 y 10:00.
const tour = {
  diasSalida: [2, 3, 4, 5, 6, 7], horasSalida: ["08:00", "10:00"], idiomas: ["es", "en"],
  duracionHoras: 2, maxPasajeros: 10
};
const tipos = [
  { id: "adulto", nombre: "Adulto", precio: 60, activo: true },
  { id: "nino", nombre: "Niño (3-11)", precio: 40, activo: true },
  { id: "bebe", nombre: "Menor de 3", precio: 0, activo: true },
  { id: "viejo", nombre: "Estudiante", precio: 50, activo: false }
];
const config = {
  cobro: "total", adelantoPct: null, anticipacionMinHoras: 0,
  avisoProximoHoras: 24, avisoProximoTexto: "Tu tour sale pronto ({hora})."
};
// Miércoles 24/09/2026, 9:43 de Lima.
const ahora = instanteLima("2026-09-24", "09:43");
const base = { tour, tiposPasajero: tipos, config, ahora };

describe("días de salida", () => {
  it("usa 1 = lunes … 7 = domingo", () => {
    expect(diaTour("2026-09-28")).toBe(1); // lunes
    expect(diaTour("2026-09-27")).toBe(7); // domingo
  });

  it("describe los días en texto", () => {
    expect(textoDiasSalida([1, 2, 3, 4, 5, 6, 7])).toBe("todos los días");
    expect(textoDiasSalida([5, 1, 3])).toBe("lunes, miércoles y viernes");
    expect(textoDiasSalida([6])).toBe("sábados");
  });
});

describe("cotizarTour", () => {
  it("suma el precio por tipo de pasajero y guarda el snapshot", () => {
    const c = cotizarTour({
      ...base, fecha: "2026-09-26", hora: "08:00",
      pasajeros: [{ tipoId: "adulto", cantidad: 2 }, { tipoId: "nino", cantidad: 1 }, { tipoId: "bebe", cantidad: 1 }]
    });
    expect(c.errores).toEqual([]);
    expect(c.lineas.map(l => l.total)).toEqual([120, 40, 0]);
    expect(c.total).toBe(160);
    expect(c.personas).toBe(4);
    expect(c.pasajeros[0]).toEqual({ tipoId: "adulto", nombre: "Adulto", cantidad: 2, precio: 60 });
    expect(c.idioma).toBe("es");
    expect(horaLima(c.inicio)).toBe("08:00");
    expect(horaLima(c.fin)).toBe("10:00");
    expect(c.aviso).toBeNull();
  });

  it("con adelanto muestra lo que se paga ahora y el saldo en destino", () => {
    const c = cotizarTour({
      ...base, config: { ...config, cobro: "adelanto", adelantoPct: 30 },
      fecha: "2026-09-26", hora: "08:00", pasajeros: [{ tipoId: "adulto", cantidad: 2 }]
    });
    expect(c.montoAPagar).toBe(36);
    expect(c.saldoDestino).toBe(84);
  });

  it("rechaza un día sin salida y una hora que no es de salida", () => {
    const c = cotizarTour({ ...base, fecha: "2026-09-28", hora: "09:00", pasajeros: [{ tipoId: "adulto", cantidad: 1 }] });
    expect(c.errores.map(e => e.codigo)).toEqual(expect.arrayContaining(["DIA_SIN_SALIDA", "HORA_INVALIDA"]));
    expect(c.errores.find(e => e.codigo === "DIA_SIN_SALIDA").mensaje).toContain("martes, miércoles, jueves, viernes, sábados y domingos");
  });

  it("exige al menos un pasajero y respeta el máximo por solicitud", () => {
    expect(cotizarTour({ ...base, fecha: "2026-09-26", hora: "08:00", pasajeros: [] }).errores[0].codigo).toBe("SIN_PASAJEROS");
    const c = cotizarTour({ ...base, fecha: "2026-09-26", hora: "08:00", pasajeros: [{ tipoId: "adulto", cantidad: 11 }] });
    expect(c.errores.map(e => e.codigo)).toContain("MAX_PASAJEROS");
  });

  it("un tipo inactivo o ajeno no se cobra y avisa", () => {
    const c = cotizarTour({ ...base, fecha: "2026-09-26", hora: "08:00", pasajeros: [{ tipoId: "adulto", cantidad: 1 }, { tipoId: "viejo", cantidad: 1 }] });
    expect(c.total).toBe(60);
    expect(c.errores.map(e => e.codigo)).toContain("TIPO_PASAJERO_INVALIDO");
  });

  it("una fecha cerrada por la agencia no se puede elegir", () => {
    const c = cotizarTour({
      ...base, fecha: "2026-09-26", hora: "08:00", pasajeros: [{ tipoId: "adulto", cantidad: 1 }],
      cierres: [{ fechaDesde: "2026-09-26", fechaHasta: "2026-09-27" }]
    });
    expect(c.errores.map(e => e.codigo)).toEqual(["FECHA_CERRADA"]);
  });

  it("la salida de hoy que ya pasó no se puede pedir; la de las 10:00 sí, con aviso", () => {
    const pasada = cotizarTour({ ...base, fecha: "2026-09-24", hora: "08:00", pasajeros: [{ tipoId: "adulto", cantidad: 1 }] });
    expect(pasada.errores.map(e => e.codigo)).toContain("FECHA_PASADA");
    const proxima = cotizarTour({ ...base, fecha: "2026-09-24", hora: "10:00", pasajeros: [{ tipoId: "adulto", cantidad: 1 }] });
    expect(proxima.errores).toEqual([]);
    expect(proxima.aviso).toEqual({ texto: "Tu tour sale pronto (10:00).", hora: "10:00" });
  });

  it("la anticipación mínima es un límite duro", () => {
    const c = cotizarTour({
      ...base, config: { ...config, anticipacionMinHoras: 12 },
      fecha: "2026-09-24", hora: "10:00", pasajeros: [{ tipoId: "adulto", cantidad: 1 }]
    });
    expect(c.errores.map(e => e.codigo)).toContain("ANTICIPACION_INSUFICIENTE");
  });

  it("valida el idioma contra los del tour", () => {
    const c = cotizarTour({ ...base, fecha: "2026-09-26", hora: "08:00", idioma: "fr", pasajeros: [{ tipoId: "adulto", cantidad: 1 }] });
    expect(c.errores.map(e => e.codigo)).toContain("IDIOMA_INVALIDO");
  });

  it("sin duración en horas, el tour termina a medianoche: no se completa al salir", () => {
    const c = cotizarTour({
      ...base, tour: { ...tour, duracionHoras: null },
      fecha: "2026-09-26", hora: "08:00", pasajeros: [{ tipoId: "adulto", cantidad: 1 }]
    });
    expect(fechaLima(c.fin)).toBe("2026-09-27");
    expect(horaLima(c.fin)).toBe("00:00");
    const enCurso = instanteLima("2026-09-26", "09:00");
    expect(estadoEfectivo({ estado: "confirmada", inicio: c.inicio, fin: c.fin }, enCurso)).toBe("confirmada");
  });
});

// Tours en inglés (docs/specs/hospedaje-completo C3, extendido a tours)
describe("cotizarTour en inglés", () => {
  it("describe los días de salida en inglés", () => {
    expect(textoDiasSalida([1, 2, 3, 4, 5, 6, 7], "en")).toBe("every day");
    expect(textoDiasSalida([5, 1, 3], "en")).toBe("Mondays, Wednesdays and Fridays");
  });

  it("explica las reglas en inglés y deja el español igual", () => {
    const lunes = { ...base, fecha: "2026-09-28", hora: "09:00", pasajeros: [{ tipoId: "adulto", cantidad: 11 }] };
    const en = cotizarTour({ ...lunes, lang: "en" }).errores.map(e => e.mensaje);
    expect(en).toEqual([
      "This tour departs at 08:00, 10:00",
      "This tour departs on Tuesdays, Wednesdays, Thursdays, Fridays, Saturdays and Sundays. Please choose another date",
      "You can request up to 10 people per booking. For larger groups, please contact the agency"
    ]);
    expect(cotizarTour(lunes).errores[1].mensaje).toBe("Este tour sale los martes, miércoles, jueves, viernes, sábados y domingos. Elige otra fecha");
  });

  it("fecha cerrada con el mes en inglés", () => {
    const c = cotizarTour({
      ...base, fecha: "2026-09-26", hora: "08:00", pasajeros: [{ tipoId: "adulto", cantidad: 1 }],
      cierres: [{ fechaDesde: "2026-09-26", fechaHasta: "2026-09-26" }], lang: "en"
    });
    expect(c.errores.map(e => e.mensaje)).toEqual(["There is no departure on Sep 26. Please choose another date"]);
  });
});
