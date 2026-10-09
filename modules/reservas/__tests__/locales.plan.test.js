import { jest } from "@jest/globals";
import { generarPlan, montoPagadoDe, planBloqueado, resumenPlan, validarPlan } from "../locales/plan-pagos.js";
import { datosContrato, hashContrato, PLANTILLA_BASE, renderContrato, textoTramos, variablesDesconocidas } from "../locales/contrato.js";

jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: {}, Prisma: {}, default: {} }));
const { esExclusion } = await import("../locales/ocupaciones.js");

// Plan de pagos (R7) y contrato (R8) del alquiler de locales.

const config = { saldoDiasAntes: 30, maxCuotas: 3, apartadoHoras: 48 };

describe("generarPlan (R7.2)", () => {
  test("separación + 3 cuotas iguales hasta 30 días antes + garantía con el saldo", () => {
    const plan = generarPlan({ total: 7500, separacion: 500, garantia: 500, config, fechaEvento: "2026-12-05", hoy: "2026-10-09" });
    expect(plan.map(c => c.concepto)).toEqual(["separacion", "cuota", "cuota", "saldo", "garantia"]);
    expect(plan[0]).toMatchObject({ numero: 1, monto: 500, venceEn: "2026-10-11" });
    expect(plan.slice(1, 4).map(c => c.monto)).toEqual([2333.33, 2333.33, 2333.34]);
    expect(plan[3].venceEn).toBe("2026-11-05");
    expect(plan[4]).toMatchObject({ concepto: "garantia", monto: 500, venceEn: "2026-11-05" });
    // Las cuotas (sin garantía) suman el total.
    expect(plan.filter(c => c.concepto !== "garantia").reduce((s, c) => s + c.monto, 0)).toBeCloseTo(7500, 2);
    // Fechas crecientes.
    const fechas = plan.slice(0, 4).map(c => c.venceEn);
    expect([...fechas].sort()).toEqual(fechas);
  });

  test("evento dentro del plazo del saldo: todo el resto vence en 2 días", () => {
    const plan = generarPlan({ total: 2000, separacion: 800, garantia: 0, config, fechaEvento: "2026-10-25", hoy: "2026-10-09" });
    expect(plan.map(c => [c.concepto, c.monto, c.venceEn])).toEqual([
      ["separacion", 800, "2026-10-11"],
      ["saldo", 1200, "2026-10-11"]
    ]);
  });

  test("pago total (por horas) = solo la separación", () => {
    const plan = generarPlan({ total: 1000, separacion: 1000, config, fechaEvento: "2026-10-20", hoy: "2026-10-09" });
    expect(plan).toEqual([{ numero: 1, concepto: "separacion", monto: 1000, venceEn: "2026-10-11" }]);
  });
});

describe("resumen, mora y edición del plan (R7.5, R7.7, R7.8)", () => {
  const cuotas = [
    { id: "a", numero: 1, concepto: "separacion", monto: 500, venceEn: "2026-10-11", estado: "pagada" },
    { id: "b", numero: 2, concepto: "cuota", monto: 1000, venceEn: "2026-10-20", estado: "pendiente" },
    { id: "c", numero: 3, concepto: "saldo", monto: 1000, venceEn: "2026-11-05", estado: "pendiente" },
    { id: "d", numero: 4, concepto: "garantia", monto: 500, venceEn: "2026-11-05", estado: "pagada" }
  ];

  test("monto pagado sin la garantía; garantía en custodia aparte", () => {
    expect(montoPagadoDe(cuotas)).toBe(500);
    const r = resumenPlan(cuotas, "2026-10-15");
    expect(r).toMatchObject({ total: 2500, pagado: 500, saldo: 2000, garantia: 500, garantiaEnCustodia: 500, enMora: false });
    expect(r.proximaCuota).toMatchObject({ numero: 2, monto: 1000 });
  });

  test("mora: una cuota pendiente vencida", () => {
    expect(resumenPlan(cuotas, "2026-10-21").enMora).toBe(true);
  });

  test("el plan se bloquea con el primer pago", () => {
    expect(planBloqueado(cuotas)).toBe(true);
    expect(planBloqueado(cuotas.map(c => ({ ...c, estado: "pendiente" })))).toBe(false);
  });

  test("validarPlan: suma, garantía, fechas y separación primero", () => {
    const ok = [
      { concepto: "separacion", monto: 500, venceEn: "2026-10-11" },
      { concepto: "saldo", monto: 2000, venceEn: "2026-11-05" },
      { concepto: "garantia", monto: 500, venceEn: "2026-11-05" }
    ];
    const ctx = { total: 2500, garantia: 500, fechaEvento: "2026-12-05", hoy: "2026-10-09" };
    expect(validarPlan(ok, ctx)).toEqual([]);
    expect(validarPlan([{ ...ok[0], monto: 400 }, ok[1], ok[2]], ctx)[0]).toMatch(/suman/);
    expect(validarPlan([ok[0], { ...ok[1], venceEn: "2026-12-06" }, ok[2]], ctx)).toContain("Una cuota no puede vencer después del evento");
  });
});

describe("contrato (R8)", () => {
  test("variables desconocidas se detectan al guardar la plantilla", () => {
    expect(variablesDesconocidas("Hola {{titular.nombre}} {{precio_final}}")).toEqual(["precio_final"]);
    expect(variablesDesconocidas(PLANTILLA_BASE)).toEqual([]);
    expect(() => renderContrato("{{nope}}", {})).toThrow(/nope/);
  });

  test("render con los datos de la reserva y hash estable", () => {
    const datos = datosContrato({
      tienda: { nombre: "Salones Imperial", ruc: "20123456789", direccion: "Av. Perú 123" },
      config: { proveedoresExternos: true, tarifaCoordinacion: 150, descorcheBotella: 20, reprogramacionesMax: 1, reprogramacionMinDias: 30, cargoReprogramacion: 0, horaTope: "03:00" },
      reserva: {
        codigo: "PED-0001", titular: "Rosa Quispe", docTipo: "DNI", docNumero: "44836469", fecha: "2026-12-05", horaInicio: "19:00", horaFin: "03:00",
        invitados: 150, tipoEvento: "quinceanos", agasajado: "Camila", total: 7500,
        local: { salon: { nombre: "Imperial", aforoMaximo: 200 }, turno: { nombre: "Noche" }, paquete: { nombre: "Reina", incluye: ["Buffet"] }, garantia: 500,
          tramos: [{ desdeDias: 60, separacionPct: 0, restoPct: 100 }, { desdeDias: 30, separacionPct: 0, restoPct: 50 }, { desdeDias: 0, separacionPct: 0, restoPct: 0 }] }
      },
      cuotas: [{ numero: 1, concepto: "separacion", monto: 500, venceEn: "2026-10-11" }],
      etiquetaEvento: () => "Quinceaños"
    });
    const texto = renderContrato(PLANTILLA_BASE, datos);
    expect(texto).toContain("Rosa Quispe (DNI 44836469)");
    expect(texto).toContain("sábado 5 de diciembre de 2026");
    expect(texto).toContain("1. Separación — S/ 500.00 — vence el 11/10/2026");
    expect(texto).not.toMatch(/\{\{/);
    expect(hashContrato(texto)).toBe(hashContrato(texto));
    expect(hashContrato(texto)).toHaveLength(64);
  });

  test("tramos de cancelación en texto", () => {
    const t = textoTramos([{ desdeDias: 0, separacionPct: 0, restoPct: 0 }, { desdeDias: 60, separacionPct: 0, restoPct: 100 }, { desdeDias: 30, separacionPct: 0, restoPct: 50 }]);
    expect(t.split("\n")).toEqual([
      "- 60 días o más antes del evento: se devuelve el 0 % de la separación y el 100 % del resto de lo pagado.",
      "- De 30 a 59 días antes del evento: se devuelve el 0 % de la separación y el 50 % del resto de lo pagado.",
      "- Menos de 30 días antes del evento: se devuelve el 0 % de la separación y el 0 % del resto de lo pagado.",
      "- La garantía se devuelve completa si el evento no se realiza."
    ]);
  });
});

describe("ocupaciones: traducción del 23P01 (CE-01)", () => {
  test("reconoce la violación de exclusión en sus distintas formas", () => {
    expect(esExclusion({ code: "23P01" })).toBe(true);
    expect(esExclusion({ meta: { driverAdapterError: { cause: { originalCode: "23P01" } } } })).toBe(true);
    expect(esExclusion({ message: 'conflicting key value violates exclusion constraint "ex_local_ocupacion"' })).toBe(true);
    expect(esExclusion({ code: "23505", message: "duplicate key" })).toBe(false);
  });
});
