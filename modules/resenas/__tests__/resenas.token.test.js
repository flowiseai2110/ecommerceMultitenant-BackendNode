import { jest } from "@jest/globals";
import { SignJWT } from "jose";
import { firmarTokenResena, verificarTokenResena } from "../resenas.token.js";
import { UnauthorizedError } from "../../../utils/errors.js";

const SECRET = "secreto-de-prueba-de-al-menos-32-bytes!!";
const OTRO_SECRET = "otro-secreto-de-prueba-de-32-bytes-o-mas";
const PEDIDO = { pedidoId: "11111111-1111-4111-8111-111111111111", tiendaId: "22222222-2222-4222-8222-222222222222" };

describe("token del link de reseña", () => {
  afterEach(() => jest.restoreAllMocks());

  it("firma y verifica: devuelve el pedido y la tienda", async () => {
    const token = await firmarTokenResena(PEDIDO, { secret: SECRET, ttlDias: 60 });

    await expect(verificarTokenResena(token, { secret: SECRET })).resolves.toEqual(PEDIDO);
  });

  it("rechaza un token con el payload alterado", async () => {
    const token = await firmarTokenResena(PEDIDO, { secret: SECRET, ttlDias: 60 });
    const [header, , firma] = token.split(".");
    const payloadFalso = Buffer.from(JSON.stringify({
      sub: "33333333-3333-4333-8333-333333333333", tid: PEDIDO.tiendaId, aud: "resena-pedido",
      exp: Math.floor(Date.now() / 1000) + 3600
    })).toString("base64url");

    await expect(verificarTokenResena(`${header}.${payloadFalso}.${firma}`, { secret: SECRET }))
      .rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rechaza un token firmado con otro secreto", async () => {
    const token = await firmarTokenResena(PEDIDO, { secret: OTRO_SECRET, ttlDias: 60 });

    await expect(verificarTokenResena(token, { secret: SECRET })).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rechaza un token vencido con un mensaje específico", async () => {
    const token = await firmarTokenResena(PEDIDO, { secret: SECRET, ttlDias: 60 });
    // jose lee la hora con `new Date()`: hace falta el reloj falso de Jest, no un spy de Date.now.
    jest.useFakeTimers({ now: Date.now() + 61 * 24 * 60 * 60 * 1000, doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });

    const err = await verificarTokenResena(token, { secret: SECRET }).catch(e => e);
    jest.useRealTimers();

    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(err.message).toMatch(/venció/);
  });

  it("rechaza un JWT del mismo secreto pero de otro uso (audience distinta)", async () => {
    const token = await new SignJWT({ tid: PEDIDO.tiendaId })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(PEDIDO.pedidoId)
      .setAudience("authenticated")
      .setExpirationTime("1d")
      .sign(new TextEncoder().encode(SECRET));

    await expect(verificarTokenResena(token, { secret: SECRET })).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rechaza basura que no es un JWT", async () => {
    await expect(verificarTokenResena("no-es-un-token", { secret: SECRET })).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("sin RESENAS_LINK_SECRET configurado falla explícitamente al firmar", async () => {
    await expect(firmarTokenResena(PEDIDO, { secret: "" })).rejects.toThrow("RESENAS_LINK_SECRET");
  });
});
