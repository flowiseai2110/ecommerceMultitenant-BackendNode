import { jest } from "@jest/globals";

const warn = jest.fn();
jest.unstable_mockModule("../../../config/logger.js", () => ({ logger: { warn, info: jest.fn(), error: jest.fn() } }));

const {
  FERIADOS, calcularFechaLimite, diasHabilesRestantes, esDiaHabil, fechaISO, hoyLima, semaforo, sumarDiasHabiles
} = await import("../plazos.js");

describe("hoyLima", () => {
  it("usa el día de Lima, no el de UTC", () => {
    // 2026-10-06 02:30 UTC = 2026-10-05 21:30 en Lima
    expect(hoyLima(new Date("2026-10-06T02:30:00Z"))).toBe("2026-10-05");
    expect(hoyLima(new Date("2026-10-06T05:00:00Z"))).toBe("2026-10-06");
  });
});

describe("esDiaHabil", () => {
  it("excluye fines de semana y feriados nacionales", () => {
    expect(esDiaHabil("2026-10-05")).toBe(true);   // lunes
    expect(esDiaHabil("2026-10-03")).toBe(false);  // sábado
    expect(esDiaHabil("2026-10-04")).toBe(false);  // domingo
    expect(esDiaHabil("2026-10-08")).toBe(false);  // Combate de Angamos
  });
});

describe("sumarDiasHabiles / calcularFechaLimite (spec R5.1)", () => {
  it("lunes 2026-10-05 → martes 2026-10-27 (no cuenta el 8 de octubre)", () => {
    expect(sumarDiasHabiles("2026-10-05", 15)).toBe("2026-10-27");
  });

  it("viernes 2026-12-04 → miércoles 2026-12-30 (no cuentan 8, 9 ni 25 de diciembre)", () => {
    expect(sumarDiasHabiles("2026-12-04", 15)).toBe("2026-12-30");
  });

  it("una hoja de las 23:30 de Lima cuenta desde el día de Lima", () => {
    // 2026-10-06 04:30 UTC = lunes 2026-10-05 23:30 en Lima
    expect(calcularFechaLimite(new Date("2026-10-06T04:30:00Z"))).toBe("2026-10-27");
  });

  it("registrada en fin de semana empieza a contar el lunes", () => {
    expect(sumarDiasHabiles("2026-10-03", 1)).toBe("2026-10-05");
  });

  it("cruza el año usando los feriados del siguiente", () => {
    // 2026-12-30 → 31 (1), [1 ene feriado], 4 (2) ...
    expect(sumarDiasHabiles("2026-12-30", 2)).toBe("2027-01-04");
  });

  it("sin feriados cargados para el año solo descuenta fines de semana y avisa una vez", () => {
    expect(sumarDiasHabiles("2030-01-01", 1)).toBe("2030-01-02");
    sumarDiasHabiles("2030-03-01", 3);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("diasHabilesRestantes y semaforo (spec R5.2)", () => {
  const hoja = (fechaLimite, estado = "pendiente") => ({ estado, fechaLimite });

  it("cuenta los días hábiles hasta la fecha límite", () => {
    expect(diasHabilesRestantes("2026-10-27", "2026-10-26")).toBe(1);
    expect(diasHabilesRestantes("2026-10-27", "2026-10-27")).toBe(0);
    expect(diasHabilesRestantes("2026-10-27", "2026-10-28")).toBe(-1);
    // del viernes 23 al martes 27 hay 2 hábiles (26 y 27)
    expect(diasHabilesRestantes("2026-10-27", "2026-10-23")).toBe(2);
  });

  it("verde > 5, ámbar 1–5, rojo ≤ 0, null si está respondida", () => {
    expect(semaforo(hoja("2026-10-27"), "2026-10-05")).toBe("verde");
    expect(semaforo(hoja("2026-10-27"), "2026-10-20")).toBe("ambar");
    expect(semaforo(hoja("2026-10-27"), "2026-10-27")).toBe("rojo");
    expect(semaforo(hoja("2026-10-27"), "2026-11-02")).toBe("rojo");
    expect(semaforo(hoja("2026-10-27", "respondida"), "2026-11-02")).toBeNull();
  });
});

describe("fechaISO", () => {
  it("convierte el Date de un @db.Date sin correrse de día", () => {
    expect(fechaISO(new Date("2026-10-27T00:00:00Z"))).toBe("2026-10-27");
    expect(fechaISO("2026-10-27")).toBe("2026-10-27");
    expect(fechaISO(null)).toBeNull();
  });
});

describe("FERIADOS", () => {
  it("en diciembre ya debe estar cargado el año siguiente", () => {
    const ahora = new Date();
    const anio = ahora.getFullYear();
    expect(FERIADOS[anio]).toBeDefined();
    if (ahora.getMonth() === 11) expect(FERIADOS[anio + 1]).toBeDefined();
  });
});
