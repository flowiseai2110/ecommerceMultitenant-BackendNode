import { SignJWT } from "jose";
import { firmarTokenHoja, verificarTokenHoja } from "../libro.token.js";
import { NotFoundError } from "../../../utils/errors.js";

const SECRET = "secreto-de-prueba-de-al-menos-32-bytes!!";
const opts = { secret: SECRET };

describe("token de la constancia", () => {
  it("firma y verifica hoja y tienda", async () => {
    const token = await firmarTokenHoja({ hojaId: "h-1", tiendaId: "t-1" }, { ...opts, ttlDias: 1095 });
    await expect(verificarTokenHoja(token, opts)).resolves.toEqual({ hojaId: "h-1", tiendaId: "t-1" });
  });

  it("con otro secreto → 404", async () => {
    const token = await firmarTokenHoja({ hojaId: "h-1", tiendaId: "t-1" }, { ...opts, ttlDias: 1 });
    await expect(verificarTokenHoja(token, { secret: `${SECRET}-otro` })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("un token de otro uso (aud de reseñas) no sirve", async () => {
    const ajeno = await new SignJWT({ tid: "t-1" })
      .setProtectedHeader({ alg: "HS256" }).setSubject("h-1").setAudience("resena-pedido")
      .setExpirationTime("1d").sign(new TextEncoder().encode(SECRET));
    await expect(verificarTokenHoja(ajeno, opts)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("vencido → 404", async () => {
    const vencido = await new SignJWT({ tid: "t-1" })
      .setProtectedHeader({ alg: "HS256" }).setSubject("h-1").setAudience("libro-hoja")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(new TextEncoder().encode(SECRET));
    await expect(verificarTokenHoja(vencido, opts)).rejects.toBeInstanceOf(NotFoundError);
  });
});
