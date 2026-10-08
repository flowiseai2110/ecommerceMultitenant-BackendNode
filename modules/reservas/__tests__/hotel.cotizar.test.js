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

// ── hospedaje-completo, fase B ──
describe("cotizarHotel — temporadas (B2)", () => {
  const fiestas = { nombre: "Fiestas Patrias", desde: "2026-09-25", hasta: "2026-09-26", ajustePct: 50, minNoches: 2 };

  it("ajusta las noches de la temporada y la nombra en la línea", () => {
    // jue 24 normal (160); vie 25 y sáb 26 en temporada: 180 × 1.5 = 270
    const c = cotizarHotel({ tipo, modalidad: noche, fecha: "2026-09-24", noches: 3, adultos: 2, config, ahora, temporadas: [fiestas] });
    expect(c.errores).toEqual([]);
    expect(c.lineas).toEqual([
      { descripcion: "1 noche (jue 24/09)", cantidad: 1, precioUnitario: 160, total: 160 },
      { descripcion: "2 noches Fiestas Patrias (vie 25/09, sáb 26/09)", cantidad: 2, precioUnitario: 270, total: 540 }
    ]);
    expect(c.total).toBe(700);
  });

  it("si dos temporadas se superponen, rige la de mayor ajuste", () => {
    const alta = { nombre: "Temporada alta", desde: "2026-09-01", hasta: "2026-09-30", ajustePct: 20, minNoches: null };
    const c = cotizarHotel({ tipo, modalidad: noche, fecha: "2026-09-25", noches: 2, adultos: 2, config, ahora, temporadas: [alta, fiestas] });
    expect(c.lineas[0].descripcion).toContain("Fiestas Patrias");
    expect(c.lineas[0].precioUnitario).toBe(270);
  });

  it("exige el mínimo de noches si la llegada cae en la temporada", () => {
    const c = cotizarHotel({ tipo, modalidad: noche, fecha: "2026-09-25", noches: 1, adultos: 2, config, ahora, temporadas: [fiestas] });
    expect(c.errores).toEqual([expect.objectContaining({ codigo: "MIN_NOCHES", campo: "noches" })]);
  });

  it("no toca la fracción por horas", () => {
    const c = cotizarHotel({ tipo, modalidad: seisHoras, fecha: "2026-09-25", hora: "18:00", adultos: 2, config, ahora, temporadas: [fiestas] });
    expect(c.errores).toEqual([]);
    expect(c.total).toBe(100);
  });
});

describe("cotizarHotel — niños (B4)", () => {
  const familiar = { capacidadAdultos: 2, capacidadNinos: 2, capacidadMax: 4, porPersona: false };
  const conCargo = { ...config, ninosGratisHasta: 5, cargoNinoNoche: 40 };

  it("cobra por noche solo a los niños mayores a la edad gratuita", () => {
    const c = cotizarHotel({ tipo: familiar, modalidad: noche, fecha: "2026-09-21", noches: 2, adultos: 2, ninos: 2, edadesNinos: [3, 9], config: conCargo, ahora: instanteLima("2026-09-20", "09:00") });
    expect(c.errores).toEqual([]);
    expect(c.lineas.at(-1)).toEqual({ descripcion: "1 niño mayor de 5 años × 2 noches", cantidad: 2, precioUnitario: 40, total: 80 });
    expect(c.total).toBe(400);
    expect(c.edadesNinos).toEqual([3, 9]);
  });

  it("sin la edad de cada niño no se puede cotizar el cargo", () => {
    const c = cotizarHotel({ tipo: familiar, modalidad: noche, fecha: "2026-09-21", noches: 1, adultos: 2, ninos: 1, config: conCargo, ahora: instanteLima("2026-09-20", "09:00") });
    expect(c.errores.map(e => e.codigo)).toContain("EDADES_NINOS");
  });
});

describe("cotizarHotel — extras (B3) e IGV (B5)", () => {
  const traslado = { id: "x1", nombre: "Traslado al aeropuerto", precio: 60, cobro: "estadia", datoPedido: "Número de vuelo", activo: true };
  const desayuno = { id: "x2", nombre: "Desayuno", precio: 25, cobro: "persona_noche", datoPedido: null, activo: true };
  const lunes = instanteLima("2026-09-20", "09:00");

  it("cobra cada extra según su unidad y guarda la copia con el dato del huésped", () => {
    const c = cotizarHotel({
      tipo, modalidad: noche, fecha: "2026-09-21", noches: 2, adultos: 2, config, ahora: lunes,
      extrasCatalogo: [traslado, desayuno], extrasElegidos: [{ extraId: "x1", cantidad: 2, dato: "LA2470 22:15" }, { extraId: "x2" }]
    });
    expect(c.errores).toEqual([]);
    expect(c.lineas.slice(-2)).toEqual([
      { descripcion: "Traslado al aeropuerto × 2", cantidad: 2, precioUnitario: 60, total: 120 },
      { descripcion: "Desayuno × 4 (por persona y noche)", cantidad: 4, precioUnitario: 25, total: 100 }
    ]);
    expect(c.total).toBe(540);
    expect(c.extras[0]).toEqual(expect.objectContaining({ nombre: "Traslado al aeropuerto", dato: "LA2470 22:15", total: 120 }));
  });

  it("un extra desactivado da error", () => {
    const c = cotizarHotel({ tipo, modalidad: noche, fecha: "2026-09-21", noches: 1, adultos: 1, config, ahora: lunes,
      extrasCatalogo: [{ ...traslado, activo: false }], extrasElegidos: [{ extraId: "x1" }] });
    expect(c.errores.map(e => e.codigo)).toEqual(["EXTRA_INVALIDO"]);
  });

  it("al extranjero le descuenta el IGV del alojamiento, no de los extras", () => {
    const igv = { ...config, exoneraIgvExtranjeros: true };
    const c = cotizarHotel({ tipo, modalidad: noche, fecha: "2026-09-21", noches: 1, adultos: 1, config: igv, ahora: lunes,
      extrasCatalogo: [traslado], extrasElegidos: [{ extraId: "x1" }], nacionalidad: "US" });
    // 160 / 1.18 = 135.59 → descuento 24.41; el traslado (60) no se exonera.
    expect(c.exoneradoIgv).toBe(true);
    expect(c.lineas.at(-1)).toEqual({ descripcion: "Exoneración de IGV (turista extranjero)", cantidad: 1, precioUnitario: -24.41, total: -24.41 });
    expect(c.total).toBe(195.59);
  });

  it("sin nacionalidad informa el total para extranjeros; un peruano paga con IGV", () => {
    const igv = { ...config, exoneraIgvExtranjeros: true };
    const ficha = cotizarHotel({ tipo, modalidad: noche, fecha: "2026-09-21", noches: 1, adultos: 1, config: igv, ahora: lunes });
    expect(ficha.totalExtranjero).toBe(135.59);
    const peruano = cotizarHotel({ tipo, modalidad: noche, fecha: "2026-09-21", noches: 1, adultos: 1, config: igv, ahora: lunes, nacionalidad: "PE" });
    expect(peruano.exoneradoIgv).toBe(false);
    expect(peruano.total).toBe(160);
    expect(peruano.totalExtranjero).toBeNull();
  });
});

// ── hospedaje-completo, fase C ──
describe("cotizarHotel — varias habitaciones, cupo y plan (C1, C2, C5)", () => {
  const lunes = instanteLima("2026-09-20", "09:00");

  it("dos habitaciones duplican capacidad y precio", () => {
    const c = cotizarHotel({ tipo, modalidad: noche, fecha: "2026-09-21", noches: 2, adultos: 4, habitaciones: 2, config, ahora: lunes });
    expect(c.errores).toEqual([]);
    expect(c.lineas).toEqual([{ descripcion: "2 noches (lun 21/09, mar 22/09) · 2 habitaciones", cantidad: 4, precioUnitario: 160, total: 640 }]);
    expect(c.habitaciones).toBe(2);
  });

  it("con una sola habitación, 4 adultos no entran", () => {
    const c = cotizarHotel({ tipo, modalidad: noche, fecha: "2026-09-21", noches: 1, adultos: 4, config, ahora: lunes });
    expect(c.errores.map(e => e.codigo)).toContain("CAPACIDAD");
  });

  it("sin cupo suficiente da SIN_CUPO y dice cuántas quedan", () => {
    const c = cotizarHotel({ tipo, modalidad: noche, fecha: "2026-09-21", noches: 1, adultos: 4, habitaciones: 2, config, ahora: lunes, cupo: { unidades: 5, libres: 1 } });
    expect(c.errores).toEqual([expect.objectContaining({ codigo: "SIN_CUPO", mensaje: "Solo queda 1 habitación de este tipo para esas fechas" })]);
    expect(c.quedan).toBe(1);
  });

  it("en un dormitorio el cupo son camas", () => {
    const dorm = { capacidadAdultos: 8, capacidadNinos: 0, capacidadMax: 8, porPersona: true };
    const c = cotizarHotel({ tipo: dorm, modalidad: noche, fecha: "2026-09-21", noches: 1, adultos: 3, config, ahora: lunes, cupo: { unidades: 8, libres: 2 } });
    expect(c.errores[0]).toEqual(expect.objectContaining({ codigo: "SIN_CUPO", mensaje: "Solo quedan 2 camas para esas fechas" }));
  });

  it("el plan no reembolsable descuenta sobre el alojamiento y queda en la copia", () => {
    const plan = { id: "p1", nombre: "No reembolsable", ajustePct: -10, reembolsable: false };
    const c = cotizarHotel({ tipo, modalidad: noche, fecha: "2026-09-21", noches: 2, adultos: 2, config, ahora: lunes, plan });
    expect(c.lineas.at(-1)).toEqual({ descripcion: "No reembolsable (-10 %)", cantidad: 1, precioUnitario: -32, total: -32 });
    expect(c.total).toBe(288);
    expect(c.plan).toEqual({ id: "p1", nombre: "No reembolsable", ajustePct: -10, reembolsable: false });
  });
});

describe("estadoEfectivo — habitación apartada (C1)", () => {
  it("una aceptada con apartado vencido se anula; sin apartado, no", () => {
    const inicio = instanteLima("2026-09-30", "15:00");
    const ahora2 = instanteLima("2026-09-24", "12:00");
    expect(estadoEfectivo({ estado: "aceptada", inicio, apartadoHasta: instanteLima("2026-09-24", "11:00") }, ahora2)).toBe("vencida");
    expect(estadoEfectivo({ estado: "aceptada", inicio, apartadoHasta: null }, ahora2)).toBe("aceptada");
  });
});
