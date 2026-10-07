import {
  asignarConsumo, corteEn, finTransmision, montoExcedente, saldoConReservas, tocaAvisoFin, tocaExtensionAuto
} from "../transmisiones.reglas.js";

// Fase 3 (paquetes, extensión y excedente): reglas puras.
const en = (iso) => new Date(iso);
const funcion = { inicio: en("2026-10-17T16:00:00-05:00"), fin: en("2026-10-17T19:00:00-05:00") };
const p = (extra = {}) => ({
  plan: "privado", estado: "programada", duracionMin: 180, factor: 1, terminadaEn: null, extensionMin: 0,
  extensionAutoMaxMin: 0, noExtender: false, avisoFinEn: null, senal: "conectada", ...extra
});

describe("asignarConsumo (R7.3)", () => {
  const paquetes = [{ id: "viejo", restante: 100 }, { id: "nuevo", restante: 600 }];

  it("plan del mes → paquete que vence primero → siguiente paquete", () => {
    expect(asignarConsumo({ minutos: 300, planRestante: 180, paquetes, excedenteAutorizado: 0 })).toEqual({
      plan: 180, paquetes: [{ id: "viejo", minutos: 100 }, { id: "nuevo", minutos: 20 }], excedente: 0, absorbido: 0
    });
  });

  it("lo que no alcanza va al excedente confirmado; sin confirmación no se cobra (R7.6)", () => {
    expect(asignarConsumo({ minutos: 250, planRestante: 0, paquetes: [{ id: "a", restante: 100 }], excedenteAutorizado: 90 }))
      .toEqual({ plan: 0, paquetes: [{ id: "a", minutos: 100 }], excedente: 90, absorbido: 60 });
    expect(asignarConsumo({ minutos: 50, planRestante: 0, paquetes: [], excedenteAutorizado: 0 }).absorbido).toBe(50);
  });

  it("si se usó menos, el excedente confirmado no se toca (R6.3)", () => {
    expect(asignarConsumo({ minutos: 60, planRestante: 180, paquetes, excedenteAutorizado: 60 }))
      .toEqual({ plan: 60, paquetes: [], excedente: 0, absorbido: 0 });
  });
});

describe("saldoConReservas", () => {
  it("cada reserva usa primero el plan de su mes y luego la bolsa de paquetes", () => {
    const s = saldoConReservas({
      periodo: "2026-10",
      planRestantePorMes: { "2026-10": 120 },
      planIncluido: 180,
      paquetesRestante: 600,
      reservas: [{ periodo: "2026-10", minutos: 200 }, { periodo: "2026-11", minutos: 100 }]
    });
    // Octubre: 120 del plan + 80 de paquetes. Noviembre: sus 180 de plan cubren los 100.
    expect(s).toEqual({ reservadas: 300, planDisponible: 0, paquetesDisponible: 520, disponibles: 520 });
  });

  it("un mes sin uso todavía tiene su plan completo", () => {
    expect(saldoConReservas({ periodo: "2026-12", planRestantePorMes: {}, planIncluido: 360, paquetesRestante: 0, reservas: [] }).disponibles).toBe(360);
  });
});

describe("excedente, aviso y extensión", () => {
  it("S/ 20 por bloque de 30 min, redondeando hacia arriba", () => {
    expect(montoExcedente(0)).toBe(0);
    expect(montoExcedente(1)).toBe(20);
    expect(montoExcedente(30)).toBe(20);
    expect(montoExcedente(31)).toBe(40);
    expect(montoExcedente(120)).toBe(80);
  });

  it("la extensión corre el fin y el corte", () => {
    expect(finTransmision(p({ extensionMin: 30 }), funcion)).toEqual(en("2026-10-17T19:30:00-05:00"));
    expect(corteEn(p({ extensionMin: 60 }), funcion)).toEqual(en("2026-10-17T20:05:00-05:00"));
  });

  it("el aviso toca a los 15 min del fin, una vez, y no en Básico ni ya terminada", () => {
    expect(tocaAvisoFin(p(), funcion, en("2026-10-17T18:44:00-05:00"))).toBe(false);
    expect(tocaAvisoFin(p(), funcion, en("2026-10-17T18:45:00-05:00"))).toBe(true);
    expect(tocaAvisoFin(p({ avisoFinEn: en("2026-10-17T18:45:00-05:00") }), funcion, en("2026-10-17T18:50:00-05:00"))).toBe(false);
    expect(tocaAvisoFin(p({ plan: "basico" }), funcion, en("2026-10-17T18:50:00-05:00"))).toBe(false);
    expect(tocaAvisoFin(p({ terminadaEn: en("2026-10-17T18:00:00-05:00") }), funcion, en("2026-10-17T18:50:00-05:00"))).toBe(false);
  });

  it("la extensión automática: al llegar al fin, con señal, hasta lo autorizado y sin 'Terminar a la hora'", () => {
    const fin = en("2026-10-17T19:00:00-05:00");
    expect(tocaExtensionAuto(p({ extensionAutoMaxMin: 60 }), funcion, fin)).toBe(true);
    expect(tocaExtensionAuto(p({ extensionAutoMaxMin: 60 }), funcion, en("2026-10-17T18:59:00-05:00"))).toBe(false);
    expect(tocaExtensionAuto(p({ extensionAutoMaxMin: 0 }), funcion, fin)).toBe(false);
    expect(tocaExtensionAuto(p({ extensionAutoMaxMin: 30, extensionMin: 30 }), funcion, en("2026-10-17T19:30:00-05:00"))).toBe(false);
    expect(tocaExtensionAuto(p({ extensionAutoMaxMin: 60, noExtender: true }), funcion, fin)).toBe(false);
    expect(tocaExtensionAuto(p({ extensionAutoMaxMin: 60, senal: "desconectada" }), funcion, fin)).toBe(false);
  });
});
