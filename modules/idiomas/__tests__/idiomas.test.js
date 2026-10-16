import { jest } from "@jest/globals";

// docs/specs/idiomas D1 · diseno.md B1
const filas = [
  { codigo: "es", nombre: "Español", pais: "PE", locale: "es-PE", ia: false, avisoIa: false, activo: true, orden: 0 },
  { codigo: "qu", nombre: "Runasimi", pais: "PE", locale: "es-PE", ia: true, avisoIa: true, activo: true, orden: 1 },
  { codigo: "en", nombre: "English", pais: "US", locale: "en-US", ia: true, avisoIa: false, activo: true, orden: 10 }
];
const idiomas = {
  findMany: jest.fn(async () => filas),
  findUnique: jest.fn(async ({ where }) => filas.find((f) => f.codigo === where.codigo) ?? null),
  create: jest.fn(async ({ data }) => data),
  update: jest.fn(async ({ where, data }) => ({ ...filas.find((f) => f.codigo === where.codigo), ...data }))
};
const TIENDA = "11111111-1111-4111-8111-111111111111";
// Eligió inglés y quechua; solo el inglés está publicado (P5).
const tiendas = { findUnique: jest.fn(async ({ where }) => (where.id === TIENDA ? { idiomas: ["es", "en", "qu"], idiomasPublicados: ["en"], slug: "hostal-prueba" } : null)) };
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: { idiomas, tiendas }, default: { idiomas, tiendas } }));
// Antes de cargar la configuración: firma los permisos de vista previa de estos tests.
process.env.IDIOMAS_VISTA_PREVIA_SECRET = "secreto-de-prueba-de-vista-previa-32+caracteres";

const { crearIdioma, IDIOMA_BASE } = await import("../idioma.js");
const servicio = await import("../idiomas.service.js");
const { crearIdiomaSchema, actualizarIdiomaSchema } = await import("../idiomas.schema.js");
const { updateTiendaSchema } = await import("../../tenants/tiendas.schema.js");
const { idiomasDePeticion, idiomasElegidos, idiomasVisibles, invalidarIdiomasDeTienda, permisoVistaPrevia, resolverIdioma } = await import("../idiomas-tienda.js");
const { firmarPermisoVistaPrevia, sinCachePublica, verificarPermisoVistaPrevia } = await import("../vista-previa.js");
const { firmarTokenReserva } = await import("../../reservas/reservas.token.js");

beforeEach(() => {
  servicio.invalidarIdiomas();
  invalidarIdiomasDeTienda();
  jest.clearAllMocks();
});

describe("crearIdioma", () => {
  it("solo el idioma base es base, y el objeto no se puede modificar", () => {
    const [es, qu] = filas.map(crearIdioma);
    expect(IDIOMA_BASE).toBe("es");
    expect(es.esBase).toBe(true);
    expect(qu.esBase).toBe(false);
    expect(Object.isFrozen(qu)).toBe(true);
    expect(qu).toMatchObject({ codigo: "qu", locale: "es-PE", ia: true, avisoIa: true });
  });
});

describe("idiomas activos", () => {
  it("se leen una vez y se cachean hasta que se edita uno", async () => {
    await servicio.idiomasActivos();
    await servicio.idiomasActivos();
    expect(idiomas.findMany).toHaveBeenCalledTimes(1);
    expect(idiomas.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { activo: true } }));

    await servicio.actualizarIdioma("qu", { nombre: "Runa simi" }, { email: "admin@plataforma.pe" });
    await servicio.idiomasActivos();
    expect(idiomas.findMany).toHaveBeenCalledTimes(2);
  });

  it("idiomaActivo devuelve el idioma o null; idiomaBase, el español", async () => {
    expect((await servicio.idiomaActivo("qu")).nombre).toBe("Runasimi");
    expect(await servicio.idiomaActivo("pt")).toBeNull();
    expect((await servicio.idiomaBase()).codigo).toBe("es");
  });
});

describe("idiomas que elige una tienda", () => {
  it("quedan sin repetidos y en el orden de la plataforma", async () => {
    expect(await servicio.validarIdiomasDeTienda(["en", "es", "qu", "en"])).toEqual(["es", "qu", "en"]);
  });

  it("rechaza un idioma que la plataforma no ofrece", async () => {
    await expect(servicio.validarIdiomasDeTienda(["es", "pt"])).rejects.toMatchObject({ statusCode: 400, message: "Idioma no disponible: pt" });
  });

  it("el schema exige el idioma base y un código válido", () => {
    const idiomasSchema = updateTiendaSchema.innerType().shape.idiomas;
    expect(idiomasSchema.safeParse(["es", "qu", "ay"]).success).toBe(true);
    expect(idiomasSchema.safeParse(["qu"]).success).toBe(false);
    expect(idiomasSchema.safeParse(["es", "EN"]).success).toBe(false);
  });
});

describe("administración de la plataforma", () => {
  it("no deja desactivar el idioma base", async () => {
    await expect(servicio.actualizarIdioma("es", { activo: false })).rejects.toMatchObject({ statusCode: 400 });
    expect(idiomas.update).not.toHaveBeenCalled();
  });

  it("deja desactivar otro idioma y registra quién", async () => {
    const qu = await servicio.actualizarIdioma("qu", { activo: false }, { email: "admin@plataforma.pe" });
    expect(qu.activo).toBe(false);
    expect(idiomas.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { codigo: "qu" }, data: expect.objectContaining({ activo: false, usuarioActualizacion: "admin@plataforma.pe" })
    }));
  });

  it("no crea un código repetido; uno nuevo sale con sus valores por defecto", async () => {
    await expect(servicio.crearIdiomaPlataforma({ codigo: "qu", nombre: "x", pais: "PE", locale: "es-PE" })).rejects.toMatchObject({ statusCode: 409 });

    const datos = crearIdiomaSchema.parse({ codigo: "pt", nombre: "Português", pais: "BR", locale: "pt-BR" });
    expect(datos).toMatchObject({ ia: false, avisoIa: false, activo: true, orden: 0 });
    const pt = await servicio.crearIdiomaPlataforma(datos, { email: "admin@plataforma.pe" });
    expect(pt).toMatchObject({ codigo: "pt", esBase: false });
  });

  it("el código no se puede cambiar al editar", () => {
    expect(actualizarIdiomaSchema.safeParse({ codigo: "qx" }).success).toBe(false);
    expect(actualizarIdiomaSchema.safeParse({}).success).toBe(false);
    expect(actualizarIdiomaSchema.safeParse({ ia: true }).success).toBe(true);
  });
});

// docs/specs/idiomas D2 · diseno.md B2
describe("idioma de una petición a la tienda", () => {
  const resolver = async (req) => {
    const r = { query: {}, body: {}, ...req };
    await new Promise((ok, mal) => resolverIdioma(r, {}, (e) => (e ? mal(e) : ok())));
    return r.idioma;
  };

  it("la tienda muestra el base y los que eligió y están publicados, en el orden de la plataforma", async () => {
    expect((await idiomasVisibles(TIENDA)).map((i) => i.codigo)).toEqual(["es", "en"]);
  });

  it("un idioma elegido sin publicar no se muestra, pero el dueño trabaja con él en Traducciones", async () => {
    expect((await idiomasElegidos(TIENDA)).map((i) => i.codigo)).toEqual(["es", "qu", "en"]);
    expect((await resolver({ tiendaId: TIENDA, query: { lang: "qu" } })).codigo).toBe("es");
  });

  it("toma el ?lang= pedido si la tienda lo ofrece", async () => {
    expect((await resolver({ tiendaId: TIENDA, query: { lang: "en" } })).codigo).toBe("en");
    expect((await resolver({ body: { tiendaId: TIENDA, lang: "en" } })).codigo).toBe("en");
  });

  it("un idioma que la tienda no eligió, desconocido o ausente cae al base sin error", async () => {
    expect((await resolver({ tiendaId: TIENDA, query: { lang: "ay" } })).codigo).toBe("es");
    expect((await resolver({ tiendaId: TIENDA, query: { lang: "xx" } })).codigo).toBe("es");
    expect((await resolver({ tiendaId: TIENDA })).esBase).toBe(true);
  });

  it("sin tienda conocida basta con que la plataforma lo tenga activo", async () => {
    expect((await resolver({ query: { lang: "qu" } })).codigo).toBe("qu");
    expect((await resolver({ query: { lang: "pt" } })).codigo).toBe("es");
  });

  it("los idiomas de la tienda se cachean", async () => {
    await idiomasVisibles(TIENDA);
    await idiomasVisibles(TIENDA);
    expect(tiendas.findUnique).toHaveBeenCalledTimes(1);
  });
});

// docs/specs/idiomas, diseno.md B3: permiso firmado de vista previa
describe("vista previa de un idioma sin publicar", () => {
  const OTRA = "22222222-2222-4222-8222-222222222222";
  const res = () => {
    const cabeceras = {};
    return { cabeceras, set: (k, v) => { cabeceras[k.toLowerCase()] = v; }, vary: (k) => { cabeceras.vary = k; } };
  };
  const resolver = async ({ token, ...req }) => {
    const r = { query: {}, body: {}, get: (k) => (k === "x-vista-previa" ? token : undefined), ...req };
    const respuesta = res();
    await new Promise((ok, mal) => resolverIdioma(r, respuesta, (e) => (e ? mal(e) : ok())));
    return { idioma: r.idioma.codigo, permiso: r.permisoVistaPrevia, cabeceras: respuesta.cabeceras };
  };

  it("el permiso vuelve con su tienda e idioma; alterado, de otro uso o vencido no vale (y nunca lanza)", async () => {
    const { token, expiraEn } = await firmarPermisoVistaPrevia({ tiendaId: TIENDA, idioma: "qu" });
    expect(await verificarPermisoVistaPrevia(token)).toEqual({ tiendaId: TIENDA, idioma: "qu" });
    expect(new Date(expiraEn).getTime() - Date.now()).toBeGreaterThan(59 * 60_000);
    expect(await verificarPermisoVistaPrevia(`${token}x`)).toBeNull();
    expect(await verificarPermisoVistaPrevia(await firmarTokenReserva({ pedidoId: "p1", tiendaId: TIENDA }, { secret: process.env.IDIOMAS_VISTA_PREVIA_SECRET }))).toBeNull();
    const vencido = await firmarPermisoVistaPrevia({ tiendaId: TIENDA, idioma: "qu" }, { duracion: Math.floor(Date.now() / 1000) - 60 });
    expect(await verificarPermisoVistaPrevia(vencido.token)).toBeNull();
    expect(await verificarPermisoVistaPrevia(undefined)).toBeNull();
  });

  it("con permiso de esta tienda, el idioma elegido sin publicar se ve; sin permiso, no", async () => {
    const { token } = await firmarPermisoVistaPrevia({ tiendaId: TIENDA, idioma: "qu" });
    expect(await resolver({ tiendaId: TIENDA, query: { lang: "qu" }, token })).toMatchObject({ idioma: "qu", permiso: { tiendaId: TIENDA, idioma: "qu" } });
    expect((await resolver({ tiendaId: TIENDA, query: { lang: "qu" } })).idioma).toBe("es");
    // El selector de la tienda suma el idioma del permiso, en el orden de la plataforma.
    expect((await idiomasDePeticion(TIENDA, { tiendaId: TIENDA, idioma: "qu" })).map((i) => i.codigo)).toEqual(["es", "qu", "en"]);
  });

  it("un permiso de otra tienda o de otro idioma no abre nada", async () => {
    const deOtra = await firmarPermisoVistaPrevia({ tiendaId: OTRA, idioma: "qu" });
    expect((await resolver({ tiendaId: TIENDA, query: { lang: "qu" }, token: deOtra.token })).idioma).toBe("es");
    const deIngles = await firmarPermisoVistaPrevia({ tiendaId: TIENDA, idioma: "en" });
    expect((await resolver({ tiendaId: TIENDA, query: { lang: "qu" }, token: deIngles.token })).idioma).toBe("es");
    expect((await idiomasDePeticion(TIENDA, { tiendaId: OTRA, idioma: "qu" })).map((i) => i.codigo)).toEqual(["es", "en"]);
  });

  it("un permiso de un idioma que la tienda no eligió no lo agrega", async () => {
    expect((await idiomasDePeticion(TIENDA, { tiendaId: TIENDA, idioma: "ay" })).map((i) => i.codigo)).toEqual(["es", "en"]);
  });

  it("con permiso la respuesta no va a cachés compartidas, aunque la ruta pida public; sin permiso no se toca", async () => {
    const { token } = await firmarPermisoVistaPrevia({ tiendaId: TIENDA, idioma: "qu" });
    const con = await resolver({ tiendaId: TIENDA, query: { lang: "qu" }, token });
    expect(con.cabeceras).toEqual({ "cache-control": "private, no-store", vary: "x-vista-previa" });
    const respuesta = res();
    sinCachePublica(respuesta);
    respuesta.set("Cache-Control", "public, max-age=60");
    respuesta.set("X-Otra", "1");
    expect(respuesta.cabeceras).toMatchObject({ "cache-control": "private, no-store", "x-otra": "1" });
    expect((await resolver({ tiendaId: TIENDA, query: { lang: "en" } })).cabeceras).toEqual({});
  });

  it("el admin solo obtiene permiso de un idioma que la tienda eligió y no es el base", async () => {
    const { token, slug } = await permisoVistaPrevia(TIENDA, "qu");
    expect(await verificarPermisoVistaPrevia(token)).toEqual({ tiendaId: TIENDA, idioma: "qu" });
    expect(slug).toBe("hostal-prueba");
    await expect(permisoVistaPrevia(TIENDA, "ay")).rejects.toThrow(/no es uno de los que ofrece/);
    await expect(permisoVistaPrevia(TIENDA, "es")).rejects.toThrow(/no es uno de los que ofrece/);
  });
});
