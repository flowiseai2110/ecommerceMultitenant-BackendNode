import { jest } from "@jest/globals";
import { SimuladorPasarela, SimuladorError, OTP_YAPE } from "../simulador/simulador.js";
import SimuladoProvider from "../pasarela/simulado.provider.js";
import { ProveedorPagoError } from "../pasarela/payment-provider.js";

// Simulador de pasarela (docs/specs/pago-automatico R6) y el proveedor que lo
// usa por HTTP. El "fetch" del proveedor se conecta en memoria al simulador.

const TARJETA = (numero) => ({ tarjeta: { numero, vencimiento: "12/30", cvv: "123" }, email: "c@x.pe" });

function nuevoSimulador(extra = {}) {
  let reloj = 1_000_000;
  const pendientes = [];
  const notificar = jest.fn();
  const sim = new SimuladorPasarela({
    ahora: () => reloj, notificar, programar: (fn) => pendientes.push(fn), ...extra
  });
  return { sim, notificar, pendientes, avanzar: (ms) => { reloj += ms; } };
}

/** fetch que enruta al simulador como lo haría simulador.routes.js. */
function fetchDe(sim) {
  return async (url, { method, body }) => {
    const ruta = new URL(url).pathname.replace("/api/v1/simulador-pagos", "");
    const datos = body ? JSON.parse(body) : {};
    try {
      let r;
      if (method === "POST" && ruta === "/cargos") r = sim.cobrar(datos);
      else if (method === "GET") r = sim.obtener(decodeURIComponent(ruta.split("/")[2]));
      else if (ruta.endsWith("/devolucion")) r = sim.devolver(decodeURIComponent(ruta.split("/")[2]));
      return { ok: true, status: 200, json: async () => r };
    } catch (e) {
      return { ok: false, status: e.status, json: async () => ({ codigo: e.codigo, mensaje: e.message }) };
    }
  };
}

describe("SimuladorPasarela", () => {
  test("la tarjeta 4111 se paga", () => {
    const { sim } = nuevoSimulador();
    const { id } = sim.tokenizar(TARJETA("4111 1111 1111 1111"));
    const cargo = sim.cobrar({ token: id, monto: 120.5 });
    expect(cargo).toMatchObject({ estado: "pagado", monto: 120.5, metodo: "tarjeta", ultimos4: "1111" });
    expect(sim.obtener(cargo.id).estado).toBe("pagado");
  });

  test.each([
    ["4000000000000002", "fondos_insuficientes"],
    ["4000000000000069", "tarjeta_vencida"],
    ["5555555555554444", "tarjeta_rechazada"]
  ])("la tarjeta %s se rechaza con 402 %s", (numero, codigo) => {
    const { sim } = nuevoSimulador();
    const { id } = sim.tokenizar(TARJETA(numero));
    expect(() => sim.cobrar({ token: id, monto: 10 })).toThrow(expect.objectContaining({ status: 402, codigo }));
  });

  test("la tarjeta 0119 queda pendiente, se paga después y avisa al webhook", async () => {
    const { sim, notificar, pendientes } = nuevoSimulador();
    const { id } = sim.tokenizar(TARJETA("4000000000000119"));
    const cargo = sim.cobrar({ token: id, monto: 10 });
    expect(cargo.estado).toBe("pendiente");
    expect(pendientes).toHaveLength(1);

    await pendientes[0]();
    expect(sim.obtener(cargo.id).estado).toBe("pagado");
    expect(notificar).toHaveBeenCalledWith(expect.objectContaining({ tipo: "cargo.actualizado", data: { id: cargo.id, estado: "pagado" } }));
  });

  test("el token sirve una sola vez y vence a los 10 minutos", () => {
    const { sim, avanzar } = nuevoSimulador();
    const uno = sim.tokenizar(TARJETA("4111111111111111"));
    sim.cobrar({ token: uno.id, monto: 10 });
    expect(() => sim.cobrar({ token: uno.id, monto: 10 })).toThrow(expect.objectContaining({ codigo: "token_invalido" }));

    const dos = sim.tokenizar(TARJETA("4111111111111111"));
    avanzar(10 * 60 * 1000);
    expect(() => sim.cobrar({ token: dos.id, monto: 10 })).toThrow(expect.objectContaining({ codigo: "token_invalido" }));
  });

  test("Yape aprueba solo con el OTP de prueba", () => {
    const { sim } = nuevoSimulador();
    const ok = sim.tokenizar({ yape: { celular: "987654321", otp: OTP_YAPE } });
    expect(sim.cobrar({ token: ok.id, monto: 30 }).estado).toBe("pagado");
    const mal = sim.tokenizar({ yape: { celular: "987654321", otp: "000000" } });
    expect(() => sim.cobrar({ token: mal.id, monto: 30 })).toThrow(expect.objectContaining({ codigo: "yape_rechazado" }));
  });

  test("valida la tarjeta al tokenizar", () => {
    const { sim } = nuevoSimulador();
    expect(() => sim.tokenizar({ tarjeta: { numero: "4111", vencimiento: "12/30", cvv: "123" } })).toThrow(SimuladorError);
    expect(() => sim.tokenizar({ tarjeta: { numero: "4111111111111111", vencimiento: "13/30", cvv: "123" } })).toThrow(/MM\/AA/);
    expect(() => sim.tokenizar({})).toThrow(/tarjeta o un pago con Yape/);
  });
});

describe("SimuladoProvider", () => {
  const url = "http://localhost:3000/api/v1/simulador-pagos";

  test("no pide credenciales de la tienda", () => {
    expect(new SimuladoProvider({ url }).requiereCredenciales).toBe(false);
  });

  test("cobra y normaliza el resultado", async () => {
    const { sim } = nuevoSimulador();
    const provider = new SimuladoProvider({ url, fetchImpl: fetchDe(sim) });
    const { id } = sim.tokenizar(TARJETA("4111111111111111"));
    const r = await provider.createCharge({ tokenId: id, amount: 50, currency: "PEN", email: "c@x.pe", description: "Reserva R-1" });
    expect(r).toMatchObject({ estado: "pagado", outcomeCode: "aprobado" });
    expect(r.proveedorCargoId).toMatch(/^chr_sim_/);
    expect((await provider.getChargeStatus({ chargeId: r.proveedorCargoId })).estado).toBe("pagado");
  });

  test("un rechazo lanza ProveedorPagoError con el mensaje para el comprador", async () => {
    const { sim } = nuevoSimulador();
    const provider = new SimuladoProvider({ url, fetchImpl: fetchDe(sim) });
    const { id } = sim.tokenizar(TARJETA("4000000000000002"));
    const error = await provider.createCharge({ tokenId: id, amount: 50, currency: "PEN" }).catch(e => e);
    expect(error).toBeInstanceOf(ProveedorPagoError);
    expect(error).toMatchObject({ code: "fondos_insuficientes", userMessage: "Tu tarjeta no tiene fondos suficientes." });
  });

  test("sin conexión con el simulador lanza un error legible", async () => {
    const provider = new SimuladoProvider({ url, fetchImpl: async () => { throw new Error("ECONNREFUSED"); } });
    await expect(provider.getChargeStatus({ chargeId: "chr_x" })).rejects.toMatchObject({ status: 502, userMessage: expect.any(String) });
  });

  test("lee el webhook del simulador", () => {
    const provider = new SimuladoProvider({ url });
    expect(provider.parseWebhook({ id: "evt_1", tipo: "cargo.actualizado", data: { id: "chr_1" } }))
      .toEqual({ proveedorEventoId: "evt_1", tipo: "cargo.actualizado", chargeId: "chr_1" });
  });
});
