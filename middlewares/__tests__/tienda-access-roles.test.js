import { jest } from "@jest/globals";

// Sin BD: membresía y código de rol simulados.
// docs/specs/recepcion R6: el recepcionista entra solo donde la ruta lo nombra.
const findActiveMembership = jest.fn(async () => ({ rol: "rol-id" }));
const getCodigoRol = jest.fn();

jest.unstable_mockModule("../../kernel/tenant/membership.js", () => ({ findActiveMembership, hasAnyActiveMembership: jest.fn() }));
jest.unstable_mockModule("../../services/roles.service.js", () => ({ getCodigoRol, getRolesUsuario: jest.fn() }));
jest.unstable_mockModule("../../kernel/tenant/tenant-store.js", () => ({ setContextTiendaId: jest.fn() }));

const { requireTiendaAccess } = await import("../tienda-access.middleware.js");
const { ForbiddenError } = await import("../../utils/errors.js");

// El cache es por usuario y tienda: cada caso usa su propio usuario.
let seq = 0;
async function run(rol, ...args) {
  getCodigoRol.mockResolvedValueOnce(rol);
  const req = { user: { id: `u-${++seq}` }, query: { tiendaId: "t-1" } };
  const next = jest.fn();
  await requireTiendaAccess(...args)(req, {}, next);
  return { error: next.mock.calls[0][0], req };
}

describe("requireTiendaAccess — roles fuera de la jerarquía", () => {
  it("el recepcionista no pasa ni el mínimo de viewer", async () => {
    expect((await run("recepcionista", "viewer")).error).toBeInstanceOf(ForbiddenError);
  });

  it("entra donde la ruta lo nombra y deja su rol en el request", async () => {
    const { error, req } = await run("recepcionista", "editor", { tambien: ["recepcionista"] });
    expect(error).toBeUndefined();
    expect(req.tiendaRol).toBe("recepcionista");
  });

  it("la jerarquía sigue igual: un viewer no opera aunque la ruta acepte recepcionista", async () => {
    expect((await run("viewer", "editor", { tambien: ["recepcionista"] })).error).toBeInstanceOf(ForbiddenError);
    expect((await run("editor", "editor", { tambien: ["recepcionista"] })).error).toBeUndefined();
  });
});
