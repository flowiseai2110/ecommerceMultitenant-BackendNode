import { cotizarEvento, disponibles, estadoVenta, finFuncion } from "../eventos/cotizar.js";
import { estadoEfectivo, transicionar } from "../estados.js";
import { horaLima, instanteLima } from "../tiempo.js";
import { eventoSchema } from "../reservas.schema.js";

// Stand up en un teatro de Lima: función del sábado 26/09/2026 a las 20:00.
const funcion = { id: "f1", inicio: instanteLima("2026-09-26", "20:00"), fin: null, activa: true };
const general = { id: "gen", nombre: "General", precio: 50, cupo: 100, vendidos: 60, activo: true, ventaHasta: null };
const vip = { id: "vip", nombre: "VIP", precio: 120, cupo: 20, vendidos: 18, activo: true, ventaHasta: null };
const preventa = { id: "pre", nombre: "Preventa", precio: 40, cupo: 50, vendidos: 10, activo: true, ventaHasta: instanteLima("2026-09-20", "23:59") };
const config = {
  apartadoManualMin: 120, maxEntradasPorCompra: 6, umbralUltimasEntradas: 5, cierrePagoManualHoras: null,
  avisoProximoHoras: 6, avisoProximoTexto: "Si tu pago no se verifica antes de la función ({hora}), lleva tu captura."
};
// Miércoles 24/09/2026, 9:43 de Lima.
const ahora = instanteLima("2026-09-24", "09:43");
const base = { funcion, tipos: [general, vip, preventa], config, ahora };

describe("cupo y estado de venta", () => {
  it("descuenta lo vendido y lo apartado", () => {
    expect(disponibles(general, 30)).toBe(10);
    expect(disponibles(vip, 5)).toBe(0);
  });

  it("marca últimas entradas, agotado y venta cerrada", () => {
    expect(estadoVenta({ tipo: general, funcion, config, ahora })).toBe("disponible");
    expect(estadoVenta({ tipo: vip, funcion, config, ahora })).toBe("ultimas");
    expect(estadoVenta({ tipo: vip, funcion, apartadas: 2, config, ahora })).toBe("agotado");
    expect(estadoVenta({ tipo: preventa, funcion, config, ahora })).toBe("cerrado");
  });

  it("con cierre del pago manual, la venta en línea cierra N horas antes", () => {
    const tarde = instanteLima("2026-09-26", "17:30");
    expect(estadoVenta({ tipo: general, funcion, config: { ...config, cierrePagoManualHoras: 3 }, ahora: tarde })).toBe("cerrado");
  });

  it("una función sin hora de fin termina 6 horas después", () => {
    expect(horaLima(finFuncion(funcion))).toBe("02:00");
  });
});

describe("cotizarEvento", () => {
  it("suma las entradas y aparta el cupo por el tiempo configurado", () => {
    const c = cotizarEvento({ ...base, entradas: [{ tipoId: "gen", cantidad: 2 }, { tipoId: "vip", cantidad: 1 }] });
    expect(c.errores).toEqual([]);
    expect(c.total).toBe(220);
    expect(c.montoAPagar).toBe(220);
    expect(c.saldoDestino).toBe(0);
    expect(c.personas).toBe(3);
    expect(c.items).toEqual([
      { tipoEntradaId: "gen", nombre: "General", cantidad: 2, precio: 50 },
      { tipoEntradaId: "vip", nombre: "VIP", cantidad: 1, precio: 120 }
    ]);
    expect(horaLima(c.apartadoHasta)).toBe("11:43");
  });

  it("el apartado no pasa del inicio de la función", () => {
    const c = cotizarEvento({ ...base, ahora: instanteLima("2026-09-26", "19:00"), entradas: [{ tipoId: "gen", cantidad: 1 }] });
    expect(c.apartadoHasta).toEqual(funcion.inicio);
    expect(c.aviso?.texto).toContain("20:00");
  });

  it("no deja comprar más de lo que queda ni lo agotado", () => {
    const c = cotizarEvento({ ...base, apartadas: new Map([["vip", 1]]), entradas: [{ tipoId: "vip", cantidad: 2 }] });
    expect(c.errores.map(e => e.codigo)).toEqual(["SIN_CUPO"]);
    expect(c.errores[0].mensaje).toBe('Solo queda 1 entrada "VIP"');
    const agotado = cotizarEvento({ ...base, apartadas: new Map([["vip", 2]]), entradas: [{ tipoId: "vip", cantidad: 1 }] });
    expect(agotado.errores.map(e => e.codigo)).toEqual(["AGOTADO"]);
  });

  it("respeta el máximo por compra y exige al menos una entrada", () => {
    expect(cotizarEvento({ ...base, entradas: [{ tipoId: "gen", cantidad: 7 }] }).errores.map(e => e.codigo)).toContain("MAX_ENTRADAS");
    expect(cotizarEvento({ ...base, entradas: [] }).errores.map(e => e.codigo)).toEqual(["SIN_ENTRADAS"]);
  });

  it("una preventa vencida o una función pasada no se venden", () => {
    expect(cotizarEvento({ ...base, entradas: [{ tipoId: "pre", cantidad: 1 }] }).errores.map(e => e.codigo)).toEqual(["VENTA_CERRADA_TIPO"]);
    const pasada = cotizarEvento({ ...base, ahora: instanteLima("2026-09-26", "20:30"), entradas: [{ tipoId: "gen", cantidad: 1 }] });
    expect(pasada.errores.map(e => e.codigo)).toEqual(["FUNCION_CERRADA"]);
  });

  it("entrada libre: total 0", () => {
    const libre = { ...general, id: "libre", nombre: "Libre", precio: 0 };
    expect(cotizarEvento({ ...base, tipos: [libre], entradas: [{ tipoId: "libre", cantidad: 2 }] }).total).toBe(0);
  });
});

describe("estados de una compra de entradas", () => {
  const inicio = funcion.inicio;
  it("por pagar vence al terminar el apartado o al empezar la función", () => {
    const apartadoHasta = instanteLima("2026-09-24", "11:43");
    expect(estadoEfectivo({ estado: "por_pagar", inicio, apartadoHasta }, ahora)).toBe("por_pagar");
    expect(estadoEfectivo({ estado: "por_pagar", inicio, apartadoHasta }, instanteLima("2026-09-24", "11:44"))).toBe("vencida");
  });

  it("en revisión no vence; confirmada se completa al terminar", () => {
    const despues = instanteLima("2026-09-27", "03:00");
    expect(estadoEfectivo({ estado: "pago_en_revision", inicio, apartadoHasta: ahora }, despues)).toBe("pago_en_revision");
    expect(estadoEfectivo({ estado: "confirmada", inicio, fin: finFuncion(funcion) }, despues)).toBe("completada");
  });

  it("una compra no se acepta ni rechaza como una solicitud", () => {
    expect(transicionar("por_pagar", "subir_captura", "evento")).toBe("pago_en_revision");
    expect(transicionar("pago_en_revision", "rechazar_pago", "evento")).toBe("por_pagar");
    expect(() => transicionar("por_pagar", "aceptar", "evento")).toThrow();
    expect(() => transicionar("confirmada", "no_show", "evento")).toThrow();
  });
});

describe("eventoSchema", () => {
  const TIENDA = "22222222-2222-4222-8222-222222222222";
  const ficha = {
    tiendaId: TIENDA, lugar: "Teatro Municipal",
    funciones: [{ inicio: "2026-10-10T20:00", tipos: [{ nombre: "General", precio: 50, cupo: 100 }] }]
  };

  it("acepta una ficha mínima", () => {
    const r = eventoSchema.parse(ficha);
    expect(r.funciones[0].tipos[0].activo).toBe(true);
    expect(r.mapaUrl).toBeNull();
  });

  it("rechaza fin antes del inicio, venta que cierra después de la función y tipos repetidos", () => {
    const f = ficha.funciones[0];
    expect(eventoSchema.safeParse({ ...ficha, funciones: [{ ...f, fin: "2026-10-10T19:00" }] }).success).toBe(false);
    expect(eventoSchema.safeParse({ ...ficha, funciones: [{ ...f, tipos: [{ ...f.tipos[0], ventaHasta: "2026-10-11T00:00" }] }] }).success).toBe(false);
    expect(eventoSchema.safeParse({ ...ficha, funciones: [{ ...f, tipos: [f.tipos[0], { ...f.tipos[0], nombre: "general" }] }] }).success).toBe(false);
  });
});
