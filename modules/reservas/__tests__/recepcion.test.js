import {
  calcularEntrada, calcularExtension, descuentos, estadoHabitacion, numerosNuevos, ocupaNoche, precioLista, primeraNoche, resumenCaja
} from "../hotel/recepcion.js";
import { fechaLima, horaLima, instanteLima } from "../tiempo.js";

// docs/specs/recepcion: hostal al paso (Killa). Matrimonial: 3 h S/ 30, noche S/ 50 (vie/sáb S/ 60).
const tresHoras = { tipo: "horas", horas: 3, precio: 30, precioVieSab: null };
const noche = { tipo: "noche", horas: null, precio: 50, precioVieSab: 60 };
const horaCheckout = "12:00";
const miercoles = (hora) => instanteLima("2026-10-14", hora);

describe("recepción — entrada", () => {
  it("por horas sale a las N horas y cuesta el bloque", () => {
    const c = calcularEntrada({ modalidad: tresHoras, ahora: miercoles("15:20"), horaCheckout });
    expect(horaLima(c.fin)).toBe("18:20");
    expect(c.precioLista).toBe(30);
    expect(c.concepto).toBe("3 horas");
  });

  it("por noche sale al check-out del día siguiente", () => {
    const c = calcularEntrada({ modalidad: noche, ahora: miercoles("21:00"), horaCheckout });
    expect(fechaLima(c.fin)).toBe("2026-10-15");
    expect(horaLima(c.fin)).toBe("12:00");
    expect(c.precioLista).toBe(50);
  });

  it("de madrugada la noche es la de ayer: sale hoy al check-out", () => {
    const ahora = instanteLima("2026-10-15", "02:30");
    expect(primeraNoche(ahora)).toBe("2026-10-14");
    const c = calcularEntrada({ modalidad: noche, ahora, horaCheckout });
    expect(fechaLima(c.fin)).toBe("2026-10-15");
  });

  it("varias noches suman el precio de cada una (vie y sáb más caros)", () => {
    // Noches del jue 15, vie 16 y sáb 17: 50 + 60 + 60.
    const c = calcularEntrada({ modalidad: noche, ahora: instanteLima("2026-10-15", "20:00"), noches: 3, horaCheckout });
    expect(c.precioLista).toBe(170);
    expect(fechaLima(c.fin)).toBe("2026-10-18");
    expect(c.concepto).toBe("3 noches");
  });

  it("precio de lista de un viernes", () => {
    expect(precioLista(noche, "2026-10-16")).toBe(60);
    expect(precioLista(noche, "2026-10-14")).toBe(50);
    expect(precioLista(tresHoras, "2026-10-16")).toBe(30);
  });
});

describe("recepción — extender", () => {
  const estadiaHoras = { modalidad: "horas", inicio: miercoles("15:00"), fin: miercoles("18:00"), cargos: [{ monto: 30 }] };

  it("otro bloque suma horas a la salida prevista", () => {
    const c = calcularExtension({ estadia: estadiaHoras, modalidad: tresHoras, horaCheckout });
    expect(horaLima(c.fin)).toBe("21:00");
    expect(c.precioLista).toBe(30);
    expect(c.modalidad).toBe("horas");
  });

  it("pasa a noche: paga la diferencia con lo ya cargado y sale al check-out", () => {
    const c = calcularExtension({ estadia: estadiaHoras, modalidad: noche, horaCheckout });
    expect(c.modalidad).toBe("noche");
    expect(c.precioLista).toBe(20);
    expect(fechaLima(c.fin)).toBe("2026-10-15");
    expect(horaLima(c.fin)).toBe("12:00");
  });

  it("pasar a noche nunca sale negativo", () => {
    const caro = { ...estadiaHoras, cargos: [{ monto: 30 }, { monto: 30 }] };
    expect(calcularExtension({ estadia: caro, modalidad: noche, horaCheckout }).precioLista).toBe(0);
  });

  it("una noche más: la del día en que le tocaba salir", () => {
    // Salía el vie 16 al mediodía: suma la noche del viernes (S/ 60).
    const estadia = { modalidad: "noche", inicio: instanteLima("2026-10-15", "20:00"), fin: instanteLima("2026-10-16", "12:00"), cargos: [] };
    const c = calcularExtension({ estadia, modalidad: noche, horaCheckout });
    expect(c.precioLista).toBe(60);
    expect(fechaLima(c.fin)).toBe("2026-10-17");
  });
});

describe("recepción — tablero", () => {
  const h = { estado: "activa", limpieza: "limpia" };
  const ahora = miercoles("17:50");

  it("estado según la estadía y la limpieza", () => {
    expect(estadoHabitacion(h, null, ahora)).toEqual({ estado: "libre", minutos: null });
    expect(estadoHabitacion({ ...h, limpieza: "por_limpiar" }, null, ahora).estado).toBe("por_limpiar");
    expect(estadoHabitacion({ ...h, estado: "mantenimiento" }, null, ahora).estado).toBe("mantenimiento");
    expect(estadoHabitacion(h, { fin: miercoles("19:00") }, ahora)).toEqual({ estado: "ocupada", minutos: 70 });
    expect(estadoHabitacion(h, { fin: miercoles("18:00") }, ahora)).toEqual({ estado: "por_vencer", minutos: 10 });
    expect(estadoHabitacion(h, { fin: miercoles("17:30") }, ahora)).toEqual({ estado: "vencida", minutos: -20 });
  });

  it("numera las habitaciones nuevas sin repetir", () => {
    expect(numerosNuevos([], 3)).toEqual(["1", "2", "3"]);
    expect(numerosNuevos(["1", "3", "Jacuzzi"], 3)).toEqual(["2", "4", "5"]);
  });
});

describe("recepción — caja (R5)", () => {
  it("el efectivo esperado no cuenta Yape, Plin ni tarjeta", () => {
    const r = resumenCaja({
      montoInicial: "50",
      cobros: [
        { formaPago: "efectivo", monto: "30" }, { formaPago: "efectivo", monto: "15" },
        { formaPago: "yape", monto: "40" }, { formaPago: "tarjeta", monto: "80" }
      ],
      movimientos: [{ tipo: "egreso", monto: "12" }, { tipo: "ingreso", monto: "5" }]
    });
    expect(r.porForma).toEqual({ efectivo: 45, yape: 40, plin: 0, tarjeta: 80 });
    expect(r.totalCobrado).toBe(165);
    expect(r.efectivoEsperado).toBe(88); // 50 + 45 + 5 − 12
  });

  it("lista los cargos cobrados por debajo de la lista", () => {
    const d = descuentos([{ concepto: "3 horas", precioLista: 30, monto: 25 }, { concepto: "Noche", precioLista: 50, monto: 50 }]);
    expect(d).toEqual([expect.objectContaining({ concepto: "3 horas", descuento: 5 })]);
  });
});

describe("recepción — cupo de la web", () => {
  it("solo ocupa la noche quien está por noche a la medianoche", () => {
    const porNoche = { modalidad: "noche", inicio: miercoles("21:00"), fin: instanteLima("2026-10-15", "12:00") };
    expect(ocupaNoche(porNoche, "2026-10-14")).toBe(true);
    expect(ocupaNoche(porNoche, "2026-10-15")).toBe(false);
    const porHoras = { modalidad: "horas", inicio: miercoles("22:00"), fin: instanteLima("2026-10-15", "01:00") };
    expect(ocupaNoche(porHoras, "2026-10-14")).toBe(false);
  });
});
