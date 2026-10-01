import { jest } from "@jest/globals";

// Sin BD: Prisma y el correo se simulan.
const prismaMock = {
  tiendas: { findUnique: jest.fn() },
  tienda_configuraciones: { findUnique: jest.fn(), upsert: jest.fn() },
  tienda_uso_recursos: { findMany: jest.fn(), updateMany: jest.fn() },
  $queryRaw: jest.fn(),
  $executeRaw: jest.fn()
};
const sendAviso = jest.fn();

jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: prismaMock }));
jest.unstable_mockModule("../../../services/email.service.js", () => ({ sendConsumoIaAvisoEmail: sendAviso }));

const {
  TIPOS, periodoActual, fechaReinicio, calcularLimite, cruzoAviso, sumarUso, conConsulta, guardarAjustes,
  diaActual, diaSiguiente, calcularLimiteDiario
} = await import("../consumo-ia.service.js");
const { QuotaExceededError, ValidationError } = await import("../../../utils/errors.js");

const TIENDA_ID = "11111111-1111-1111-1111-111111111111";
const PLAN_FREE = { codigo: "free", nombre: "Free", limiteConsultasAsesorMes: 100, limiteConsultasAsistenteMes: 50 };

function tienda({ plan = PLAN_FREE, ajustes = {}, email = "dueno@test.pe" } = {}) {
  prismaMock.tiendas.findUnique.mockResolvedValue({ nombre: "Tienda", email, plan });
  prismaMock.tienda_configuraciones.findUnique.mockResolvedValue({ valor: ajustes });
}

beforeEach(() => jest.clearAllMocks());

describe("periodo", () => {
  it("corta el mes en hora de Lima, no en UTC", () => {
    // 1 nov 03:00 UTC = 31 oct 22:00 en Lima
    expect(periodoActual(new Date("2026-11-01T03:00:00Z"))).toBe("2026-10");
    expect(periodoActual(new Date("2026-11-01T06:00:00Z"))).toBe("2026-11");
  });

  it("se reinicia el 1ro del mes siguiente, también en diciembre", () => {
    expect(fechaReinicio("2026-10")).toBe("2026-11-01");
    expect(fechaReinicio("2026-12")).toBe("2027-01-01");
  });
});

describe("calcularLimite", () => {
  it("sin ajuste del dueño usa el tope del plan", () => {
    expect(calcularLimite(TIPOS.asesor, PLAN_FREE, {}).limite).toBe(100);
  });

  it("el dueño solo puede bajar el tope", () => {
    expect(calcularLimite(TIPOS.asesor, PLAN_FREE, { limite: 30 }).limite).toBe(30);
    expect(calcularLimite(TIPOS.asesor, PLAN_FREE, { limite: 500 }).limite).toBe(100);
  });

  it("plan ilimitado (null) respeta el ajuste del dueño", () => {
    const plan = { ...PLAN_FREE, limiteConsultasAsesorMes: null };
    expect(calcularLimite(TIPOS.asesor, plan, {}).limite).toBeNull();
    expect(calcularLimite(TIPOS.asesor, plan, { limite: 20 }).limite).toBe(20);
  });

  it("tienda sin plan usa el tope por defecto de config", () => {
    expect(calcularLimite(TIPOS.asistente, null, {}).limite).toBe(50);
  });
});

describe("cruzoAviso", () => {
  it("avisa al llegar al % configurado", () => {
    expect(cruzoAviso({ usadas: 79, limite: 100, avisoPct: 80 })).toBe(false);
    expect(cruzoAviso({ usadas: 80, limite: 100, avisoPct: 80 })).toBe(true);
  });

  it("sin aviso o sin límite no avisa", () => {
    expect(cruzoAviso({ usadas: 99, limite: 100, avisoPct: null })).toBe(false);
    expect(cruzoAviso({ usadas: 99, limite: null, avisoPct: 80 })).toBe(false);
  });
});

describe("sumarUso", () => {
  it("cuenta la cache como entrada", () => {
    const uso = { entrada: 0, salida: 0 };
    sumarUso(uso, { input_tokens: 10, cache_creation_input_tokens: 5, cache_read_input_tokens: 100, output_tokens: 7 });
    sumarUso(uso, { input_tokens: 1, output_tokens: 1 });
    expect(uso).toEqual({ entrada: 116, salida: 8 });
  });
});

describe("conConsulta", () => {
  it("reserva, ejecuta y registra tokens", async () => {
    tienda();
    prismaMock.$queryRaw.mockResolvedValue([{ cantidad_usada: 3, aviso_enviado_en: null }]);
    prismaMock.$executeRaw.mockResolvedValue(1);

    const { resultado, consumo } = await conConsulta(TIENDA_ID, "asesor", async () => ({
      mensaje: "hola", uso: { entrada: 10, salida: 2 }
    }));

    expect(resultado.mensaje).toBe("hola");
    expect(consumo).toEqual({ usadas: 3, limite: 100 });
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1); // solo tokens
  });

  it("sin consultas disponibles lanza 402 y NO llama al LLM", async () => {
    tienda();
    prismaMock.$queryRaw.mockResolvedValue([]);
    const llm = jest.fn();

    await expect(conConsulta(TIENDA_ID, "asesor", llm)).rejects.toBeInstanceOf(QuotaExceededError);
    expect(llm).not.toHaveBeenCalled();
  });

  it("límite 0 bloquea sin tocar la BD", async () => {
    tienda({ ajustes: { asesor: { limite: 0 } } });
    await expect(conConsulta(TIENDA_ID, "asesor", jest.fn())).rejects.toBeInstanceOf(QuotaExceededError);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it("si el LLM falla, devuelve la consulta y relanza el error", async () => {
    tienda();
    prismaMock.$queryRaw.mockResolvedValue([{ cantidad_usada: 3, aviso_enviado_en: null }]);
    prismaMock.$executeRaw.mockResolvedValue(1);

    await expect(conConsulta(TIENDA_ID, "asistente", async () => { throw new Error("proveedor caído"); }))
      .rejects.toThrow("proveedor caído");
    const sql = prismaMock.$executeRaw.mock.calls[0][0].join("?");
    expect(sql).toContain("GREATEST(cantidad_usada - 1, 0)");
  });

  it("al cruzar el % manda UN correo al dueño", async () => {
    tienda({ ajustes: { asesor: { limite: null, avisoPct: 80 } } });
    prismaMock.$queryRaw.mockResolvedValue([{ cantidad_usada: 80, aviso_enviado_en: null }]);
    prismaMock.$executeRaw.mockResolvedValue(1);

    await conConsulta(TIENDA_ID, "asesor", async () => ({ uso: { entrada: 0, salida: 0 } }));
    await new Promise(r => setImmediate(r));

    expect(sendAviso).toHaveBeenCalledTimes(1);
    expect(sendAviso.mock.calls[0][1]).toMatchObject({ usadas: 80, limite: 100, avisoPct: 80 });
  });

  it("si el aviso ya se mandó este mes, no reenvía", async () => {
    tienda({ ajustes: { asesor: { limite: null, avisoPct: 80 } } });
    prismaMock.$queryRaw.mockResolvedValue([{ cantidad_usada: 90, aviso_enviado_en: new Date() }]);
    prismaMock.$executeRaw.mockResolvedValue(1);

    await conConsulta(TIENDA_ID, "asesor", async () => ({ uso: { entrada: 0, salida: 0 } }));
    await new Promise(r => setImmediate(r));

    expect(sendAviso).not.toHaveBeenCalled();
  });
});

describe("tope diario de la Guía", () => {
  const PLAN_CON_DIA = { ...PLAN_FREE, limiteConsultasAsistenteDia: 40 };
  // $queryRaw es un tagged template: [strings, ...valores]. El recurso va en los valores.
  const recursoDe = (call) => call.slice(1).find(v => typeof v === "string" && v.startsWith("consultas_"));
  const fila = (n) => [{ cantidad_usada: n, aviso_enviado_en: null }];

  it("el día se corta en hora de Lima y reinicia al día siguiente", () => {
    // 2 oct 04:00 UTC = 1 oct 23:00 en Lima
    expect(diaActual(new Date("2026-10-02T04:00:00Z"))).toBe("2026-10-01");
    expect(diaSiguiente("2026-12-31")).toBe("2027-01-01");
  });

  it("el tope diario sale del plan; sin plan usa config; el asesor no tiene", () => {
    expect(calcularLimiteDiario(TIPOS.asistente, PLAN_CON_DIA)).toBe(40);
    expect(calcularLimiteDiario(TIPOS.asistente, { ...PLAN_FREE, limiteConsultasAsistenteDia: null })).toBeNull();
    expect(calcularLimiteDiario(TIPOS.asistente, null)).toBe(40);
    expect(calcularLimiteDiario(TIPOS.asesor, PLAN_CON_DIA)).toBeNull();
  });

  it("reserva primero el día y luego el mes", async () => {
    tienda({ plan: PLAN_CON_DIA });
    prismaMock.$queryRaw.mockResolvedValueOnce(fila(5)).mockResolvedValueOnce(fila(12));

    const { consumo } = await conConsulta(TIENDA_ID, "asistente", async () => ({ uso: { entrada: 0, salida: 0 } }));

    expect(recursoDe(prismaMock.$queryRaw.mock.calls[0])).toBe("consultas_asistente_ia_dia");
    expect(recursoDe(prismaMock.$queryRaw.mock.calls[1])).toBe("consultas_asistente_ia");
    expect(consumo).toEqual({ usadas: 12, limite: 50 });
  });

  it("día agotado: 402 con alcance 'dia', sin tocar el mes ni llamar al LLM", async () => {
    tienda({ plan: PLAN_CON_DIA });
    prismaMock.$queryRaw.mockResolvedValueOnce([]);
    const llm = jest.fn();

    const err = await conConsulta(TIENDA_ID, "asistente", llm).catch(e => e);

    expect(err).toBeInstanceOf(QuotaExceededError);
    expect(err.details).toMatchObject({ alcance: "dia", limite: 40 });
    expect(err.message).toContain("por hoy");
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(llm).not.toHaveBeenCalled();
  });

  it("mes agotado: devuelve la consulta del día ya reservada", async () => {
    tienda({ plan: PLAN_CON_DIA });
    prismaMock.$queryRaw.mockResolvedValueOnce(fila(3)).mockResolvedValueOnce([]);
    prismaMock.$executeRaw.mockResolvedValue(1);

    const err = await conConsulta(TIENDA_ID, "asistente", jest.fn()).catch(e => e);

    expect(err.details).toMatchObject({ alcance: "mes" });
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
    expect(recursoDe(prismaMock.$executeRaw.mock.calls[0])).toBe("consultas_asistente_ia_dia");
  });

  it("si el LLM falla, devuelve la consulta del mes y la del día", async () => {
    tienda({ plan: PLAN_CON_DIA });
    prismaMock.$queryRaw.mockResolvedValue(fila(3));
    prismaMock.$executeRaw.mockResolvedValue(1);

    await expect(conConsulta(TIENDA_ID, "asistente", async () => { throw new Error("caído"); }))
      .rejects.toThrow("caído");

    const recursos = prismaMock.$executeRaw.mock.calls.map(recursoDe);
    expect(recursos).toEqual(["consultas_asistente_ia", "consultas_asistente_ia_dia"]);
  });

  it("el asesor sigue con un solo contador (mensual)", async () => {
    tienda({ plan: PLAN_CON_DIA });
    prismaMock.$queryRaw.mockResolvedValue(fila(1));
    prismaMock.$executeRaw.mockResolvedValue(1);

    await conConsulta(TIENDA_ID, "asesor", async () => ({ uso: { entrada: 0, salida: 0 } }));

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe("guardarAjustes", () => {
  it("rechaza un límite mayor al del plan", async () => {
    tienda();
    await expect(guardarAjustes(TIENDA_ID, "asistente", { limite: 51, avisoPct: null }))
      .rejects.toBeInstanceOf(ValidationError);
    expect(prismaMock.tienda_configuraciones.upsert).not.toHaveBeenCalled();
  });

  it("guarda sin pisar el ajuste del otro tipo y rearma el aviso", async () => {
    tienda({ ajustes: { asesor: { limite: 40, avisoPct: 90 } } });
    prismaMock.tienda_uso_recursos.findMany.mockResolvedValue([]);

    await guardarAjustes(TIENDA_ID, "asistente", { limite: 30, avisoPct: 80 }, { email: "a@b.pe" });

    const { update } = prismaMock.tienda_configuraciones.upsert.mock.calls[0][0];
    expect(update.valor).toEqual({ asesor: { limite: 40, avisoPct: 90 }, asistente: { limite: 30, avisoPct: 80 } });
    expect(prismaMock.tienda_uso_recursos.updateMany.mock.calls[0][0]).toMatchObject({
      where: { tiendaId: TIENDA_ID, recurso: "consultas_asistente_ia" },
      data: { avisoEnviadoEn: null }
    });
  });
});
