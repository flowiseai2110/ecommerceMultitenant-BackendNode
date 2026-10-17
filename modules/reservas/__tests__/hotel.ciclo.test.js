import { jest } from "@jest/globals";
import { estadoEfectivo, tieneCicloEstadia, TIPOS_CON_CICLO, transicionar } from "../estados.js";
import { instanteLima } from "../tiempo.js";

// Ciclo de la reserva del hotel (docs/specs/ciclo-reserva-hotel).

const TIENDA = "11111111-1111-4111-8111-111111111111";
const PEDIDO = "22222222-2222-4222-8222-222222222222";

const tx = {
  pagos: { create: jest.fn() },
  pedidos: { update: jest.fn() },
  reservas: { update: jest.fn() },
  pedido_detalles: { deleteMany: jest.fn(), createMany: jest.fn(), create: jest.fn() },
  pedido_historial_estados: { create: jest.fn() }
};
const prisma = {
  $transaction: jest.fn(async (fn) => (typeof fn === "function" ? fn(tx) : Promise.all(fn))),
  $executeRaw: jest.fn(async () => 1),
  reservas: { findFirst: jest.fn(async () => null), update: jest.fn() },
  pedido_historial_estados: { create: jest.fn() },
  hotel_modalidades: { findFirst: jest.fn(async () => ({ id: "mod-suite" })) }
};
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma, Prisma: {}, default: prisma }));

let efectivo = "confirmada";
let pedido;
const svc = {
  pedidoDeReserva: jest.fn(async () => pedido),
  efectivoDe: jest.fn(() => efectivo),
  aplicarAccion: jest.fn(async () => {}),
  detalleReservaAdmin: jest.fn(async () => ({ id: PEDIDO }))
};
jest.unstable_mockModule("../reservas.service.js", () => svc);

const config = { cancelacionGratisHoras: 48, penalidadNoches: 1, horaCheckin: "14:00", horaCheckout: "12:00" };
jest.unstable_mockModule("../reservas.config.service.js", () => ({ obtenerConfig: jest.fn(async () => config) }));
let cotizacion;
const vertical = {
  cotizar: jest.fn(async () => cotizacion),
  enTransaccion: jest.fn(async () => {})
};
jest.unstable_mockModule("../hotel/vertical.js", () => ({ verticalHotel: vertical }));

const {
  registrarCheckin, registrarCheckout, guardarCodigoPms, agregarNota,
  modificarReserva, cambiarSalida, cancelarHotel, marcarNoLlego, penalidadCancelacion, tarifaPorNoche, totalFinalExtra, responderHorario, darSalidaTardia
} = await import("../hotel/ciclo.service.js");

const ahora = instanteLima("2026-10-16", "16:45");
const usuario = { email: "recepcion@hotel.pe" };
const acompanante = { nombres: "Luis", apellidos: "Quispe", docTipo: "DNI", docNumero: "70221346" };

beforeEach(() => {
  jest.clearAllMocks();
  efectivo = "confirmada";
  pedido = {
    id: PEDIDO, tiendaId: TIENDA, tipo: "hotel", estado: "confirmada", total: 400, montoPagado: 200,
    reserva: {
      inicio: instanteLima("2026-10-16", "14:00"), fin: instanteLima("2026-10-18", "12:00"), noches: 2, adultos: 2, ninos: 0,
      saldoDestino: 200, codigoPms: null, productoId: "hab-deluxe", modalidadId: "mod-deluxe", habitaciones: 1,
      extras: [], plan: null, producto: { nombre: "Habitación Deluxe" }
    }
  };
  cotizacion = {
    producto: { id: "hab-deluxe", nombre: "Habitación Deluxe" },
    c: { errores: [], total: 600, montoAPagar: 600, saldoDestino: 0, inicio: instanteLima("2026-10-20", "14:00"), fin: instanteLima("2026-10-23", "12:00"), habitaciones: 1, lineas: [{ descripcion: "3 noches", cantidad: 3, precioUnitario: 200, total: 600 }] },
    detalle: { modalidadId: "mod-deluxe", noches: 3, adultos: 2, ninos: 0, apartadoHasta: null, idiomaHuesped: "es" },
    inventario: { productoId: "hab-deluxe", unidades: 4, fecha: "2026-10-20", noches: 3 }
  };
});

describe("máquina del hotel", () => {
  it("confirmada → check-in → hospedada → check-out → completada", () => {
    expect(transicionar("confirmada", "check_in", "hotel")).toBe("hospedada");
    expect(transicionar("hospedada", "check_out", "hotel")).toBe("completada");
    expect(() => transicionar("hospedada", "cancelar_negocio", "hotel")).toThrow();
    expect(() => transicionar("hospedada", "no_show", "hotel")).toThrow();
  });

  it("los tours no tienen check-in", () => {
    expect(() => transicionar("confirmada", "check_in", "tour")).toThrow();
    expect(tieneCicloEstadia("hotel")).toBe(true);
    expect(tieneCicloEstadia("tour")).toBe(false);
    expect(TIPOS_CON_CICLO).toEqual(["hotel"]);
  });

  it("con ciclo, la confirmada no pasa sola a completada (la cierra el check-out)", () => {
    const r = { estado: "confirmada", inicio: instanteLima("2026-10-14", "14:00"), fin: instanteLima("2026-10-15", "12:00") };
    expect(estadoEfectivo({ ...r, tipo: "hotel" }, ahora)).toBe("confirmada");
    expect(estadoEfectivo({ ...r, tipo: "tour" }, ahora)).toBe("completada");
    expect(estadoEfectivo(r, ahora)).toBe("completada");
    expect(estadoEfectivo({ ...r, estado: "hospedada", tipo: "hotel" }, ahora)).toBe("hospedada");
  });
});

describe("check-in", () => {
  it("registra la entrada, los acompañantes y cobra el saldo si se pide", async () => {
    await registrarCheckin(TIENDA, PEDIDO, { acompanantes: [{ ...acompanante, docNumero: "70221346" }], hora: "14:20", cobro: { formaPago: "efectivo", comprobante: "boleta" } }, usuario, ahora);
    expect(svc.aplicarAccion).toHaveBeenCalledWith(tx, pedido, "check_in", expect.objectContaining({ nota: "Check-in 14:20" }));
    expect(tx.reservas.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ checkinEn: instanteLima("2026-10-16", "14:20"), acompanantes: [acompanante] })
    }));
    expect(tx.pagos.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ monto: 200, metodo: "efectivo", proveedor: "mostrador" }) }));
    expect(tx.pedidos.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ montoPagado: 400, estadoPago: "pagado" }) }));
  });

  it("exige a cada acompañante", async () => {
    await expect(registrarCheckin(TIENDA, PEDIDO, { acompanantes: [] }, usuario, ahora)).rejects.toThrow("Falta registrar 1 acompañante");
  });

  it("no antes del día de llegada ni con una hora futura", async () => {
    pedido.reserva.inicio = instanteLima("2026-10-17", "14:00");
    await expect(registrarCheckin(TIENDA, PEDIDO, { acompanantes: [acompanante] }, usuario, ahora)).rejects.toThrow("se registra desde ese día");
    pedido.reserva.inicio = instanteLima("2026-10-16", "14:00");
    await expect(registrarCheckin(TIENDA, PEDIDO, { acompanantes: [acompanante], hora: "18:00" }, usuario, ahora)).rejects.toThrow("posterior a la actual");
  });

  it("solo desde una confirmada", async () => {
    efectivo = "aceptada";
    await expect(registrarCheckin(TIENDA, PEDIDO, { acompanantes: [acompanante] }, usuario, ahora)).rejects.toThrow("Solo una reserva confirmada");
  });
});

describe("check-out", () => {
  beforeEach(() => { efectivo = "hospedada"; });

  it("con saldo pide cómo pagó", async () => {
    await expect(registrarCheckout(TIENDA, PEDIDO, {}, usuario, ahora)).rejects.toThrow("Falta cobrar S/ 200.00");
  });

  it("cobra el saldo, cierra la reserva y guarda la salida", async () => {
    await registrarCheckout(TIENDA, PEDIDO, { formaPago: "tarjeta", comprobante: "factura" }, usuario, ahora);
    expect(tx.pagos.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ metadata: expect.objectContaining({ comprobante: "factura" }) }) }));
    expect(svc.aplicarAccion).toHaveBeenCalledWith(tx, pedido, "check_out", expect.objectContaining({ nota: expect.stringContaining("cobró S/ 200.00 (tarjeta, factura)") }));
    expect(tx.reservas.update).toHaveBeenCalledWith({ where: { pedidoId: PEDIDO }, data: { checkoutEn: ahora } });
  });

  it("solo con check-in", async () => {
    efectivo = "confirmada";
    await expect(registrarCheckout(TIENDA, PEDIDO, { formaPago: "efectivo" }, usuario, ahora)).rejects.toThrow("Solo una reserva con check-in");
  });
});

describe("código PMS y notas", () => {
  it("rechaza un código ya usado en otra reserva", async () => {
    prisma.reservas.findFirst.mockResolvedValueOnce({ pedido: { numeroPedido: "PED-0007" } });
    await expect(guardarCodigoPms(TIENDA, PEDIDO, { codigo: "NB-1" }, usuario, ahora)).rejects.toThrow("ya está asociado a PED-0007");
  });

  it("guarda el código con historial y vacío lo quita", async () => {
    await guardarCodigoPms(TIENDA, PEDIDO, { codigo: " NB-20431 " }, usuario, ahora);
    expect(prisma.reservas.update).toHaveBeenCalledWith({ where: { pedidoId: PEDIDO }, data: { codigoPms: "NB-20431" } });
    pedido.reserva.codigoPms = "NB-20431";
    await guardarCodigoPms(TIENDA, PEDIDO, { codigo: "" }, usuario, ahora);
    expect(prisma.reservas.update).toHaveBeenLastCalledWith({ where: { pedidoId: PEDIDO }, data: { codigoPms: null } });
  });

  it("la nota se agrega al final con autor y hora", async () => {
    await agregarNota(TIENDA, PEDIDO, { texto: " Pidió cuna " }, usuario, ahora);
    const valores = prisma.$executeRaw.mock.calls[0].slice(1);
    expect(JSON.parse(valores[0])).toEqual([{ texto: "Pidió cuna", autor: "recepcion@hotel.pe", en: ahora.toISOString() }]);
  });
});

describe("política de cancelación (C5)", () => {
  const base = { pagado: 200, reembolsable: true, tarifaNoche: 200, config };
  it("gratis con anticipación, primera noche si no, todo si no es reembolsable, nada si cancela el hotel", () => {
    expect(penalidadCancelacion({ ...base, quien: "huesped", horasAntes: 72 })).toBe(0);
    expect(penalidadCancelacion({ ...base, quien: "huesped", horasAntes: 10 })).toBe(200);
    expect(penalidadCancelacion({ ...base, quien: "huesped", horasAntes: 10, pagado: 50 })).toBe(50);
    expect(penalidadCancelacion({ ...base, quien: "huesped", horasAntes: 72, reembolsable: false })).toBe(200);
    expect(penalidadCancelacion({ ...base, quien: "hotel", horasAntes: 1, reembolsable: false })).toBe(0);
  });

  it("la tarifa por noche no cuenta los extras", () => {
    expect(tarifaPorNoche({ total: 460, reserva: { noches: 2, extras: [{ total: 60 }] } })).toBe(200);
  });

  it("sin impuestos, el extra se descuenta con su IGV y servicio; el del mostrador ya es final (reserva-hotel-mejoras H2)", () => {
    const impuestos = { incluidos: false, igvPct: 18, servicioPct: 10 };
    expect(totalFinalExtra({ total: 50 }, impuestos)).toBe(64);
    expect(totalFinalExtra({ total: 50, origen: "mostrador" }, impuestos)).toBe(50);
    expect(totalFinalExtra({ total: 50 }, { ...impuestos, incluidos: true })).toBe(50);
    // 2 noches de 273 + extra 50, todo con 28 %: (698.88 + 64) − 64 = 349.44 por noche.
    expect(tarifaPorNoche({ total: 762.88, reserva: { noches: 2, impuestos, extras: [{ total: 50 }] } })).toBe(349.44);
  });

  it("cancelar guarda quién, motivo, retenido y reembolso", async () => {
    await cancelarHotel(TIENDA, PEDIDO, { quien: "huesped", motivo: "Vuelo cancelado" }, usuario, ahora);
    expect(svc.aplicarAccion).toHaveBeenCalledWith(tx, pedido, "cancelar_cliente", expect.objectContaining({ nota: "Cancelada por el huésped: Vuelo cancelado · retiene S/ 200.00" }));
    expect(tx.reservas.update).toHaveBeenCalledWith({
      where: { pedidoId: PEDIDO },
      data: { retenido: 200, cancelacion: expect.objectContaining({ quien: "huesped", penalidad: 200, reembolso: 0 }) }
    });
  });

  it("no se cancela una reserva hospedada", async () => {
    efectivo = "hospedada";
    await expect(cancelarHotel(TIENDA, PEDIDO, { quien: "hotel", motivo: "Otro" }, usuario, ahora)).rejects.toThrow("todavía no llega");
  });
});

describe("no llegó (C6)", () => {
  it("retiene la primera noche hasta lo pagado", async () => {
    await marcarNoLlego(TIENDA, PEDIDO, usuario, ahora);
    expect(svc.aplicarAccion).toHaveBeenCalledWith(tx, pedido, "no_show", expect.objectContaining({ nota: "No se presentó · retiene S/ 200.00" }));
  });

  it("no antes de la hora de llegada", async () => {
    pedido.reserva.inicio = instanteLima("2026-10-16", "18:00");
    await expect(marcarNoLlego(TIENDA, PEDIDO, usuario, ahora)).rejects.toThrow("después de la hora de llegada");
  });
});

describe("modificar (C3)", () => {
  it("recotiza sin contarse en el cupo y el saldo absorbe la diferencia", async () => {
    await modificarReserva(TIENDA, PEDIDO, { fecha: "2026-10-20", noches: 3 }, usuario, ahora);
    expect(vertical.cotizar).toHaveBeenCalledWith(expect.objectContaining({
      datos: expect.objectContaining({ fecha: "2026-10-20", noches: 3, excluirPedidoId: PEDIDO, productoId: "hab-deluxe", modalidadId: "mod-deluxe" })
    }));
    expect(tx.pedidos.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ total: 600, estadoPago: "parcial" }) }));
    expect(tx.reservas.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ saldoDestino: 400, noches: 3 }) }));
    expect(tx.reservas.update.mock.calls[0][0].data).not.toHaveProperty("apartadoHasta");
    expect(tx.pedido_historial_estados.create).toHaveBeenCalledWith({ data: expect.objectContaining({ notas: expect.stringContaining("diferencia +S/ 200.00") }) });
    expect(vertical.enTransaccion).toHaveBeenCalled();
  });

  it("al cambiar de tipo usa su modalidad por noche", async () => {
    await modificarReserva(TIENDA, PEDIDO, { productoId: "33333333-3333-4333-8333-333333333333" }, usuario, ahora);
    expect(vertical.cotizar).toHaveBeenCalledWith(expect.objectContaining({ datos: expect.objectContaining({ modalidadId: "mod-suite" }) }));
  });

  it("sin cupo no guarda", async () => {
    cotizacion.c.errores = [{ codigo: "SIN_CUPO", mensaje: "No quedan habitaciones de este tipo para esas fechas" }];
    await expect(modificarReserva(TIENDA, PEDIDO, { noches: 5 }, usuario, ahora)).rejects.toThrow("No quedan habitaciones");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("cambiar salida (C4)", () => {
  beforeEach(() => { efectivo = "hospedada"; });

  it("extender cotiza solo las noches nuevas y las suma", async () => {
    cotizacion.c.total = 200;
    await cambiarSalida(TIENDA, PEDIDO, { fechaSalida: "2026-10-19" }, usuario, ahora);
    expect(vertical.cotizar).toHaveBeenCalledWith(expect.objectContaining({ datos: expect.objectContaining({ fecha: "2026-10-18", noches: 1, extras: [] }) }));
    expect(tx.pedidos.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ total: 600 }) }));
    expect(tx.reservas.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ noches: 3, fin: instanteLima("2026-10-19", "12:00") }) }));
  });

  it("salir antes descuenta las noches, salvo tarifa no reembolsable", async () => {
    cotizacion.c.total = 200;
    cotizacion.c.errores = [{ codigo: "FECHA_PASADA", mensaje: "x" }];
    await cambiarSalida(TIENDA, PEDIDO, { fechaSalida: "2026-10-17" }, usuario, ahora);
    expect(tx.pedidos.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ total: 200 }) }));
    jest.clearAllMocks();
    pedido.reserva.plan = { reembolsable: false };
    await cambiarSalida(TIENDA, PEDIDO, { fechaSalida: "2026-10-17" }, usuario, ahora);
    expect(tx.pedidos.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ total: 400 }) }));
  });

  it("no antes de hoy ni la misma fecha", async () => {
    await expect(cambiarSalida(TIENDA, PEDIDO, { fechaSalida: "2026-10-15" }, usuario, ahora)).rejects.toThrow("antes de hoy");
    await expect(cambiarSalida(TIENDA, PEDIDO, { fechaSalida: "2026-10-18" }, usuario, ahora)).rejects.toThrow("misma fecha");
  });
});

describe("early check-in y late check-out (C7)", () => {
  const EARLY = "44444444-4444-4444-8444-444444444444";
  beforeEach(() => {
    pedido.total = 460;
    pedido.reserva.extras = [{ id: EARLY, nombre: "Early check-in", total: 60, cantidad: 1, horario: "early", hora: "09:00", estado: "pedido" }];
  });

  it("aprobar lo deja como está", async () => {
    await responderHorario(TIENDA, PEDIDO, { extraId: EARLY, aprobar: true }, usuario, ahora);
    expect(prisma.reservas.update).toHaveBeenCalledWith({ where: { pedidoId: PEDIDO }, data: { extras: [expect.objectContaining({ estado: "aprobado" })] } });
    expect(tx.pedidos.update).not.toHaveBeenCalled();
  });

  it("rechazar lo descuenta del total", async () => {
    await responderHorario(TIENDA, PEDIDO, { extraId: EARLY, aprobar: false }, usuario, ahora);
    expect(tx.pedidos.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ total: 400 }) }));
    expect(tx.reservas.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ extras: [expect.objectContaining({ estado: "rechazado" })], saldoDestino: 200 }) }));
  });

  it("no se responde dos veces", async () => {
    pedido.reserva.extras[0].estado = "aprobado";
    await expect(responderHorario(TIENDA, PEDIDO, { extraId: EARLY, aprobar: false }, usuario, ahora)).rejects.toThrow("ya se respondió");
  });

  it("salida tardía desde el mostrador: suma al saldo y mueve la hora de salida", async () => {
    efectivo = "hospedada";
    await darSalidaTardia(TIENDA, PEDIDO, { hora: "16:00", precio: 100 }, usuario, ahora);
    expect(tx.pedidos.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ total: 560 }) }));
    expect(tx.reservas.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ fin: instanteLima("2026-10-18", "16:00"), extras: expect.arrayContaining([expect.objectContaining({ horario: "late", origen: "mostrador", estado: "aprobado" })]) })
    }));
  });
});
