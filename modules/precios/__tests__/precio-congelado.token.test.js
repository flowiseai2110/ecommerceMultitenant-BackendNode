import { firmar, verificar } from "../precio-congelado.token.js";

// Precio asegurado mientras se paga (docs/specs/campanas-descuento C6, R8.4, E5).
const SECRET = "secreto-de-prueba-del-precio-asegurado-0123456789";
const TIENDA = "11111111-1111-4111-8111-111111111111";
const lineas = [{ productoId: "p1", varianteId: null, unitario: 8000, regular: 10000, origen: "campana",
  campana: { id: "c-bf", nombre: "Black Friday", porcentaje: 20, permitirCupones: false, permitirEnvioGratis: false } }];
const a = (hora) => new Date(`2026-11-29T${hora}:00-05:00`);

describe("precio-congelado.token", () => {
  it("vence a los 15 minutos y devuelve las líneas firmadas", async () => {
    const r = await firmar({ tiendaId: TIENDA, lineas }, { secret: SECRET, ahora: a("21:50") });
    expect(r.vence).toBe("2026-11-30T03:05:00.000Z");
    expect(await verificar(r.token, TIENDA, { secret: SECRET, ahora: a("22:05") })).toEqual(lineas);
  });

  it("vencido (con su minuto de gracia) → null", async () => {
    const { token } = await firmar({ tiendaId: TIENDA, lineas }, { secret: SECRET, ahora: a("21:50") });
    expect(await verificar(token, TIENDA, { secret: SECRET, ahora: a("22:07") })).toBeNull();
  });

  it("de otra tienda, alterado, con otra llave o vacío → null", async () => {
    const { token } = await firmar({ tiendaId: TIENDA, lineas }, { secret: SECRET, ahora: a("21:50") });
    const opts = { secret: SECRET, ahora: a("21:55") };
    expect(await verificar(token, "otra-tienda", opts)).toBeNull();
    const [cabecera, , firma] = token.split(".");
    const cuerpo = Buffer.from(JSON.stringify({ tid: TIENDA, aud: "precio-congelado", lineas: [{ ...lineas[0], unitario: 1 }] })).toString("base64url");
    expect(await verificar(`${cabecera}.${cuerpo}.${firma}`, TIENDA, opts)).toBeNull();
    expect(await verificar(token, TIENDA, { ...opts, secret: "otra-llave-cualquiera-0123456789" })).toBeNull();
    expect(await verificar(null, TIENDA, opts)).toBeNull();
  });

  it("sin llave configurada no asegura nada", async () => {
    expect(await firmar({ tiendaId: TIENDA, lineas }, { secret: "" })).toBeNull();
  });
});
