import { jest } from "@jest/globals";
import { cacheRespuesta, invalidarCacheStore } from "../store-cache.js";

// Caché de respuestas GET del storefront; con permiso de vista previa (docs/specs/idiomas B3) se salta.
describe("cacheRespuesta", () => {
  const pasar = (mw, req) => {
    const res = { statusCode: 200, set: jest.fn(), get: () => undefined, status() { return this; }, json: jest.fn((b) => b) };
    const next = jest.fn();
    mw({ method: "GET", tiendaId: "t1", originalUrl: "/api/v1/store/categorias?lang=qu", ...req }, res, next);
    return { res, next };
  };

  beforeEach(() => invalidarCacheStore("prueba"));

  it("guarda la primera respuesta y sirve la siguiente desde memoria", () => {
    const mw = cacheRespuesta("prueba");
    const primera = pasar(mw);
    expect(primera.next).toHaveBeenCalled();
    primera.res.json({ data: "es" });
    const segunda = pasar(mw);
    expect(segunda.next).not.toHaveBeenCalled();
    expect(segunda.res.json).toHaveBeenCalledWith({ data: "es" });
  });

  it("con permiso de vista previa ni lee ni guarda: un idioma sin publicar no queda para otros", () => {
    const mw = cacheRespuesta("prueba");
    const conPermiso = pasar(mw, { permisoVistaPrevia: { tiendaId: "t1", idioma: "qu" } });
    expect(conPermiso.next).toHaveBeenCalled();
    conPermiso.res.json({ data: "qu sin publicar" });
    // La misma URL sin permiso no recibe lo de la vista previa.
    expect(pasar(mw).next).toHaveBeenCalled();
  });
});
