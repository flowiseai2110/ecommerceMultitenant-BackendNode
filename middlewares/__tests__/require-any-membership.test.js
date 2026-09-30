import { jest } from "@jest/globals";

// Sin BD: la membresía se simula. roles.service también se mockea porque
// importa Prisma y este middleware no lo necesita.
const hasAnyActiveMembership = jest.fn();

jest.unstable_mockModule("../../kernel/tenant/membership.js", () => ({
  findActiveMembership: jest.fn(),
  hasAnyActiveMembership
}));
jest.unstable_mockModule("../../services/roles.service.js", () => ({
  getCodigoRol: jest.fn(),
  getRolesUsuario: jest.fn()
}));

const { requireAnyMembership } = await import("../tienda-access.middleware.js");
const { ForbiddenError, UnauthorizedError } = await import("../../utils/errors.js");

const CACHE_TTL = 5 * 60 * 1000;

// Ejecuta el middleware y devuelve con qué se llamó next (undefined = pasa).
async function run(user) {
  const next = jest.fn();
  await requireAnyMembership()({ user }, {}, next);
  expect(next).toHaveBeenCalledTimes(1);
  return next.mock.calls[0][0];
}

// El cache es de módulo: cada test usa su propio userId para no contaminarse.
let seq = 0;
const nuevoUsuario = () => ({ id: `user-${++seq}`, email: `u${seq}@test.com` });

describe("requireAnyMembership", () => {
  beforeEach(() => {
    hasAnyActiveMembership.mockReset();
    jest.restoreAllMocks();
  });

  it("responde 401 si no hay usuario autenticado, sin consultar la BD", async () => {
    const err = await run(undefined);

    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(err.statusCode).toBe(401);
    expect(hasAnyActiveMembership).not.toHaveBeenCalled();
  });

  it("bloquea con 403 a un comprador del storefront (sin membresías)", async () => {
    hasAnyActiveMembership.mockResolvedValue(false);
    const user = nuevoUsuario();

    const err = await run(user);

    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err.statusCode).toBe(403);
    expect(hasAnyActiveMembership).toHaveBeenCalledWith(user.id);
  });

  it("deja pasar a un comerciante con al menos una membresía activa", async () => {
    hasAnyActiveMembership.mockResolvedValue(true);

    const err = await run(nuevoUsuario());

    expect(err).toBeUndefined();
  });

  it("cachea el resultado positivo: la segunda petición no consulta la BD", async () => {
    hasAnyActiveMembership.mockResolvedValue(true);
    const user = nuevoUsuario();

    await run(user);
    const err = await run(user);

    expect(err).toBeUndefined();
    expect(hasAnyActiveMembership).toHaveBeenCalledTimes(1);
  });

  it("no cachea el rechazo: quien acepta su primera invitación entra de inmediato", async () => {
    const user = nuevoUsuario();
    hasAnyActiveMembership.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const antes = await run(user);
    const despues = await run(user);

    expect(antes).toBeInstanceOf(ForbiddenError);
    expect(despues).toBeUndefined();
    expect(hasAnyActiveMembership).toHaveBeenCalledTimes(2);
  });

  it("vuelve a consultar al vencer el cache y bloquea si la membresía se desactivó", async () => {
    const user = nuevoUsuario();
    const t0 = 1_000_000;
    const now = jest.spyOn(Date, "now").mockReturnValue(t0);
    hasAnyActiveMembership.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    expect(await run(user)).toBeUndefined();

    now.mockReturnValue(t0 + CACHE_TTL - 1);
    expect(await run(user)).toBeUndefined();
    expect(hasAnyActiveMembership).toHaveBeenCalledTimes(1);

    now.mockReturnValue(t0 + CACHE_TTL + 1);
    expect(await run(user)).toBeInstanceOf(ForbiddenError);
    expect(hasAnyActiveMembership).toHaveBeenCalledTimes(2);
  });

  it("propaga el error si falla la consulta a la BD (no deja pasar)", async () => {
    const dbError = new Error("connection refused");
    hasAnyActiveMembership.mockRejectedValue(dbError);

    const err = await run(nuevoUsuario());

    expect(err).toBe(dbError);
  });
});
