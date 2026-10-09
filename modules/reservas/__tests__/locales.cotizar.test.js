import { instanteLima } from "../tiempo.js";
import { estadoEfectivo, transicionar } from "../estados.js";
import { claveDia, cruzaMedianoche, domingoDePascua, esFeriado, franjaDe, precioDia, topeDe } from "../locales/franja.js";
import { cotizarLocal, separacionDe } from "../locales/cotizar.js";
import { alternativas, calendario, estadoFecha } from "../locales/disponibilidad.js";

// Alquiler de locales (docs/specs/alquiler-locales): franjas en hora de Lima,
// precio por día, aforo, separación, disponibilidad y máquina de estados.

const ahora = instanteLima("2026-10-09", "10:00");

const salon = { productoId: "salon-1", nombre: "Salón Imperial", aforoMaximo: 200, preparacionMin: 60, porHoras: true, precioHora: 250, minHoras: 3, horasDesde: "09:00", horasHasta: "18:00" };
const noche = { id: "t-noche", nombre: "Noche", horaInicio: "19:00", horaFin: "03:00", diasSemana: [5, 6], precios: { lj: 1800, v: 2300, s: 2700, f: 2700 }, activo: true, orden: 1 };
const dia = { id: "t-dia", nombre: "Día", horaInicio: "10:00", horaFin: "17:00", diasSemana: [1, 2, 3, 4, 5, 6, 7], precios: { lj: 1200, s: 1500 }, activo: true, orden: 0 };
const turnos = [dia, noche];
const soloLocal = { id: "p-solo", nombre: "Solo local", modalidad: "solo_local", precioTipo: "fijo", activo: true, turnoIds: [], tiposEvento: [] };
const reina = {
  id: "p-reina", nombre: "Reina", modalidad: "paquete", precioTipo: "por_persona", precios: { lj: 60, s: 75 }, minPersonas: 100, maxPersonas: 180,
  incluye: ["Buffet", "DJ 5 h", "Hora loca"], horaExtraPrecio: 400, activo: true, turnoIds: ["t-noche"], tiposEvento: ["quinceanos", "cumpleanos"]
};
const porHoras = { id: "p-horas", nombre: "Por horas", modalidad: "por_horas", precioTipo: "fijo", activo: true, turnoIds: [], tiposEvento: [] };
const config = {
  separacionTipo: "porcentaje", adelantoPct: 40, separacionMonto: null, garantiaMonto: 500, anticipacionMinHoras: 0,
  proveedoresExternos: true, tarifaCoordinacion: 150, descorcheBotella: 20, horaTope: "03:00", politicaTramos: null
};

describe("franja (R1.3, CE-06)", () => {
  test("un turno que pasa la medianoche termina al día siguiente y pertenece al día en que empieza", () => {
    const f = franjaDe("2026-12-05", "19:00", "03:00", 60);
    expect(cruzaMedianoche("19:00", "03:00")).toBe(true);
    expect(f.inicio).toEqual(instanteLima("2026-12-05", "19:00"));
    expect(f.fin).toEqual(instanteLima("2026-12-06", "03:00"));
    // La preparación se suma antes y después (R3.3).
    expect(f.ocupaInicio).toEqual(instanteLima("2026-12-05", "18:00"));
    expect(f.ocupaFin).toEqual(instanteLima("2026-12-06", "04:00"));
  });

  test("hora tope de madrugada es del día siguiente; de noche, del mismo día", () => {
    expect(topeDe("2026-12-05", "03:00")).toEqual(instanteLima("2026-12-06", "03:00"));
    expect(topeDe("2026-12-05", "23:00")).toEqual(instanteLima("2026-12-05", "23:00"));
  });

  test("clave de precio por día y feriados nacionales (R2.6)", () => {
    expect(claveDia("2026-12-04")).toBe("v");
    expect(claveDia("2026-12-05")).toBe("s");
    expect(claveDia("2026-12-06")).toBe("d");
    expect(claveDia("2026-12-02")).toBe("lj");
    expect(claveDia("2026-07-28")).toBe("f");
    expect(domingoDePascua(2026)).toBe("2026-04-05");
    expect(esFeriado("2026-04-03")).toBe(true); // Viernes Santo
    expect(esFeriado("2026-12-05", ["2026-12-05"])).toBe(true);
    // Una clave ausente cae en lj.
    expect(precioDia({ lj: 1200, s: 1500 }, "d")).toBe(1200);
  });
});

describe("cotizarLocal (R2, R4)", () => {
  const base = { salon, turnos, fecha: "2026-12-05", invitados: 150, tipoEvento: "quinceanos", config, ahora };

  test("solo local: precio del turno del sábado, separación 40 % y garantía", () => {
    const c = cotizarLocal({ ...base, paquete: soloLocal, turnoId: "t-noche" });
    expect(c.errores).toEqual([]);
    expect(c.total).toBe(2700);
    expect(c.separacion).toBe(1080);
    expect(c.garantia).toBe(500);
    expect(c.fin).toEqual(instanteLima("2026-12-06", "03:00"));
    expect(c.snapshot.turno.nombre).toBe("Noche");
  });

  test("paquete por persona: cobra el mínimo si hay menos invitados", () => {
    const c = cotizarLocal({ ...base, paquete: reina, turnoId: "t-noche", invitados: 80 });
    expect(c.errores).toEqual([]);
    expect(c.lineas[0].cantidad).toBe(100);
    expect(c.total).toBe(7500);
    expect(c.lineas[0].descripcion).toMatch(/mínimo 100/);
  });

  test("aforo de la licencia y máximo del paquete (CE-08)", () => {
    const c = cotizarLocal({ ...base, paquete: reina, turnoId: "t-noche", invitados: 250 });
    expect(c.errores.map(e => e.codigo)).toEqual(expect.arrayContaining(["AFORO_EXCEDIDO", "PAQUETE_MAX_PERSONAS"]));
  });

  test("paquete fuera de su turno, tipo de evento o día", () => {
    const c = cotizarLocal({ ...base, paquete: reina, turnoId: "t-dia", tipoEvento: "corporativo" });
    expect(c.errores.filter(e => e.codigo === "PAQUETE_NO_OFRECIDO")).toHaveLength(2);
    const martes = cotizarLocal({ ...base, fecha: "2026-12-01", paquete: soloLocal, turnoId: "t-noche" });
    expect(martes.errores.map(e => e.codigo)).toContain("TURNO_NO_OFRECIDO");
  });

  test("temporada ajusta el precio y el feriado usa su tarifa", () => {
    const temporadas = [{ nombre: "Diciembre", desde: "2026-12-01", hasta: "2026-12-31", ajustePct: 10 }];
    const c = cotizarLocal({ ...base, paquete: soloLocal, turnoId: "t-noche", temporadas });
    expect(c.total).toBe(2970);
    const feriado = cotizarLocal({ ...base, fecha: "2026-12-25", paquete: soloLocal, turnoId: "t-noche" });
    expect(feriado.total).toBe(2700); // viernes feriado: tarifa f
  });

  test("por horas: mínimo, franja permitida y precio", () => {
    const ok = cotizarLocal({ ...base, paquete: porHoras, horaInicio: "10:00", horas: 4, tipoEvento: "conferencia", invitados: 40 });
    expect(ok.errores).toEqual([]);
    expect(ok.total).toBe(1000);
    expect(ok.horaFin).toBe("14:00");
    const corto = cotizarLocal({ ...base, paquete: porHoras, horaInicio: "10:00", horas: 2, tipoEvento: "conferencia" });
    expect(corto.errores.map(e => e.codigo)).toContain("MIN_HORAS");
    const tarde = cotizarLocal({ ...base, paquete: porHoras, horaInicio: "16:00", horas: 4, tipoEvento: "conferencia" });
    expect(tarde.errores.map(e => e.codigo)).toContain("FUERA_DE_HORARIO");
  });

  test("proveedores externos: tarifa de coordinación o prohibidos", () => {
    const c = cotizarLocal({ ...base, paquete: soloLocal, turnoId: "t-noche", proveedoresExternos: true });
    expect(c.total).toBe(2850);
    const no = cotizarLocal({ ...base, paquete: soloLocal, turnoId: "t-noche", proveedoresExternos: true, config: { ...config, proveedoresExternos: false } });
    expect(no.errores.map(e => e.codigo)).toContain("PROVEEDORES_NO_PERMITIDOS");
  });

  test("fecha pasada y fecha cerrada", () => {
    const pasada = cotizarLocal({ ...base, fecha: "2026-10-03", paquete: soloLocal, turnoId: "t-noche" });
    expect(pasada.errores.map(e => e.codigo)).toContain("FECHA_PASADA");
    const cierres = [{ fechaDesde: "2026-12-05", fechaHasta: "2026-12-05" }];
    expect(cotizarLocal({ ...base, paquete: soloLocal, turnoId: "t-noche", cierres }).errores.map(e => e.codigo)).toContain("FECHA_CERRADA");
  });

  test("separación de monto fijo nunca pasa del total", () => {
    expect(separacionDe(2700, { separacionTipo: "monto_fijo", separacionMonto: 500 })).toBe(500);
    expect(separacionDe(300, { separacionTipo: "monto_fijo", separacionMonto: 500 })).toBe(300);
    expect(separacionDe(0, config)).toBe(0);
  });
});

describe("disponibilidad (R3)", () => {
  const ocupaSabadoNoche = [{ inicio: instanteLima("2026-12-05", "18:00"), fin: instanteLima("2026-12-06", "04:00") }];

  test("estado de la fecha: parcial si queda algún turno", () => {
    const e = estadoFecha({ fecha: "2026-12-05", salon, turnos, ocupadas: ocupaSabadoNoche, ahora });
    expect(e.estado).toBe("parcial");
    expect(e.turnos.find(t => t.id === "t-noche").libre).toBe(false);
    expect(e.turnos.find(t => t.id === "t-dia").libre).toBe(true);
  });

  test("la preparación hace chocar turnos pegados (CE-04)", () => {
    // Una ocupación que termina a las 18:30 choca con la noche (ocupa desde las 18:00).
    const ocupadas = [{ inicio: instanteLima("2026-12-05", "14:00"), fin: instanteLima("2026-12-05", "18:30") }];
    const e = estadoFecha({ fecha: "2026-12-05", salon, turnos: [noche], ocupadas, ahora });
    expect(e.estado).toBe("ocupada");
  });

  test("calendario con cierres", () => {
    const cal = calendario({ desde: "2026-12-05", hasta: "2026-12-07", salon, turnos, ocupadas: [], cierres: [{ fechaDesde: "2026-12-07", fechaHasta: "2026-12-07" }], ahora });
    expect(cal.map(f => f.estado)).toEqual(["libre", "libre", "cerrada"]);
  });

  test("alternativas: otro turno el mismo día y luego días cercanos (R3.4)", () => {
    const alt = alternativas({ fecha: "2026-12-05", salon, turnos, ocupadas: ocupaSabadoNoche, ahora });
    expect(alt[0]).toMatchObject({ fecha: "2026-12-05", turnoId: "t-dia" });
    expect(alt).toHaveLength(3);
    const soloNoche = alternativas({ fecha: "2026-12-05", salon, turnos, ocupadas: ocupaSabadoNoche, ahora, turnoIds: ["t-noche"] });
    expect(soloNoche.map(a => a.fecha)).toEqual(["2026-12-04", "2026-12-11", "2026-12-12"]);
  });
});

describe("estados de la vertical local (L1.2)", () => {
  test("la primera cuota verificada confirma y confirmada puede suspenderse", () => {
    expect(transicionar("solicitada", "aceptar", "local")).toBe("aceptada");
    expect(transicionar("pago_en_revision", "verificar", "local")).toBe("confirmada");
    expect(transicionar("confirmada", "suspender", "local")).toBe("suspendida");
    expect(transicionar("suspendida", "reprogramar", "local")).toBe("confirmada");
    // Sin confirmar_sin_pago: un local siempre cobra la separación.
    expect(() => transicionar("solicitada", "confirmar_sin_pago", "local")).toThrow();
    // Hotel no cambia.
    expect(() => transicionar("confirmada", "suspender", "hotel")).toThrow();
  });

  test("una solicitud vence al terminar su plazo de respuesta (R6.4)", () => {
    const inicio = instanteLima("2026-12-05", "19:00");
    const apartadoHasta = instanteLima("2026-10-10", "10:00");
    expect(estadoEfectivo({ estado: "solicitada", inicio, apartadoHasta }, ahora)).toBe("solicitada");
    expect(estadoEfectivo({ estado: "solicitada", inicio, apartadoHasta }, instanteLima("2026-10-10", "10:01"))).toBe("vencida");
    // Hotel y tours no ponen apartadoHasta en sus solicitudes: no cambian.
    expect(estadoEfectivo({ estado: "solicitada", inicio }, instanteLima("2026-10-10", "10:01"))).toBe("solicitada");
  });
});
