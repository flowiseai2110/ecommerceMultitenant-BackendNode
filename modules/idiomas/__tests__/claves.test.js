import { jest } from "@jest/globals";

jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: {}, default: {} }));
const { leerCatalogo, planDeCarga, sincronizarClavesAlIniciar } = await import("../claves.service.js");
const { GRUPOS_TEXTOS } = await import("../grupos.js");
const { DATOS } = await import("../../negocio/datos.js");
const { extraerClavesServidor, ubicarServidor } = await import("../claves-servidor.js");
const { idDeNombre, porPrefijo } = await import("../prefijos.js");
const { readFileSync } = await import("node:fs");

// docs/specs/idiomas D8 · diseno.md B8 · contrato 5
describe("catálogo de textos fijos", () => {
  const catalogo = leerCatalogo();

  it("trae las claves de la tienda, sin repetidas y con grupos conocidos", () => {
    expect(catalogo.length).toBeGreaterThan(300);
    expect(new Set(catalogo.map((c) => c.clave)).size).toBe(catalogo.length);
    expect(catalogo.every((c) => c.grupos.length && c.grupos.every((g) => GRUPOS_TEXTOS.includes(g)))).toBe(true);
  });

  it("todo grupo con claves lo muestra al menos un rubro (si no, nadie lo traduciría)", () => {
    const usados = new Set(Object.values(DATOS).flatMap((d) => d.gruposTextos));
    const huerfanos = [...new Set(catalogo.flatMap((c) => c.grupos))].filter((g) => !usados.has(g));
    expect(huerfanos).toEqual([]);
  });

  it.each(Object.keys(DATOS))("%s declara sus grupos: incluye comun y todos existen", (rubro) => {
    const g = DATOS[rubro].gruposTextos;
    expect(g).toContain("comun");
    expect(g.every((x) => GRUPOS_TEXTOS.includes(x))).toBe(true);
  });
});

describe("claves del servidor (marcadas con clave())", () => {
  const extraido = extraerClavesServidor();
  const leer = (ruta) => JSON.parse(readFileSync(new URL(ruta, import.meta.url), "utf8"));

  it("claves-servidor.json y pantallas-servidor.json están al día: si falla, corre `node scripts/claves-servidor.mjs`", () => {
    expect(leer("../claves/claves-servidor.json")).toEqual(extraido.claves);
    expect(leer("../pantallas/pantallas-servidor.json")).toEqual(extraido.pantallas);
  });

  it("contrato 10: todo texto tiene sección en Traducciones y todo prefijo del registro tiene textos", () => {
    expect(extraido.sinUbicacion).toEqual([]);
    expect(extraido.sinUso).toEqual([]);
    expect(extraido.claves.every((c) => c.ubicaciones.length > 0)).toBe(true);
  });

  it("cada correo al cliente es su propia sección", () => {
    const secciones = extraido.pantallas.find((p) => p.id === "correos").secciones.map((s) => s.id);
    expect(secciones).toEqual(expect.arrayContaining(["reserva-confirmada", "reserva-rechazada", "partes-comunes-de-los-correos"]));
  });
});

describe("ubicarServidor (diseno.md A2, A6)", () => {
  const REGISTRO = {
    correos: { nombre: "Correos al cliente", zona: "mensajes", secciones: {
      "Reserva confirmada": ["reservas/reservas.emails.js#confirmadaEmail"],
      "Partes comunes": ["reservas/reservas.emails.js#resumen"]
    } },
    sistema: { nombre: "Mensajes del sistema", zona: "mensajes", secciones: {
      "Estados": ["reservas/estados.js"],
      "Pedidos": ["ordenes"]
    } }
  };

  it("ubica por archivo y por declaración; el archivo cubre sus declaraciones y la carpeta sus archivos", () => {
    const { claves, sinUbicacion, sinUso } = ubicarServidor([
      { clave: "Total", grupos: ["comun"], componentes: new Set(["reservas/reservas.emails.js#resumen", "reservas/reservas.emails.js#confirmadaEmail"]) },
      { clave: "Solicitada", grupos: ["reservas"], componentes: new Set(["reservas/estados.js#ESTADOS"]) },
      { clave: "Sin stock", grupos: ["productos"], componentes: new Set(["ordenes/pedidos.service.js#crear"]) }
    ], REGISTRO);
    expect(claves.map((c) => c.ubicaciones)).toEqual([
      ["correos/reserva-confirmada", "correos/partes-comunes"],
      ["sistema/estados"],
      ["sistema/pedidos"]
    ]);
    expect(sinUbicacion).toEqual([]);
    expect(sinUso).toEqual([]);
  });

  it("contrato 10: un texto fuera del registro y un prefijo sin textos se reportan", () => {
    const { sinUbicacion, sinUso } = ubicarServidor([
      { clave: "Nuevo", grupos: ["correos"], componentes: new Set(["reservas/reservas.emails.js#nuevoCorreoEmail"]) }
    ], REGISTRO);
    expect(sinUbicacion).toEqual(["reservas/reservas.emails.js#nuevoCorreoEmail"]);
    expect(sinUso).toEqual(["ordenes", "reservas/estados.js", "reservas/reservas.emails.js#confirmadaEmail", "reservas/reservas.emails.js#resumen"]);
  });

  it("catálogo con la zona y los grupos de cada sección (salen de GRUPO_POR_RUTA)", () => {
    const { pantallas } = ubicarServidor([
      { clave: "Total", grupos: ["correos"], componentes: new Set(["reservas/reservas.emails.js#confirmadaEmail"]) },
      { clave: "Solicitada", grupos: ["reservas"], componentes: new Set(["reservas/estados.js"]) }
    ], REGISTRO);
    expect(pantallas).toEqual([
      { id: "correos", nombre: "Correos al cliente", zona: "mensajes", secciones: [{ id: "reserva-confirmada", nombre: "Reserva confirmada", grupos: ["correos"] }] },
      { id: "sistema", nombre: "Mensajes del sistema", zona: "mensajes", secciones: [{ id: "estados", nombre: "Estados", grupos: ["reservas"] }] }
    ]);
  });

  it("un prefijo en dos secciones es un error del registro", () => {
    const repetido = { ...REGISTRO, otra: { nombre: "Otra", zona: "mensajes", secciones: { X: ["ordenes"] } } };
    expect(() => ubicarServidor([], repetido)).toThrow(/ordenes/);
  });
});

describe("prefijos: la regla única de grupo y ubicación", () => {
  const mapa = { reservas: "reservas", "reservas/hotel": "hotel", "reservas/reservas.emails.js": "correos" };

  it("gana el más largo; cubre carpeta, archivo y declaraciones del archivo", () => {
    expect(porPrefijo(mapa, "reservas/hotel/cotizar.js")).toBe("hotel");
    expect(porPrefijo(mapa, "reservas/estados.js")).toBe("reservas");
    expect(porPrefijo(mapa, "reservas/reservas.emails.js#layout")).toBe("correos");
    expect(porPrefijo(mapa, "reservas-x/a.js")).toBeUndefined();
  });

  it("idDeNombre: sin tildes ni signos", () => {
    expect(idDeNombre("Calendario de la estadía")).toBe("calendario-de-la-estadia");
    expect(idDeNombre("Menú inferior (celular)")).toBe("menu-inferior-celular");
  });
});

describe("plan de carga", () => {
  const existentes = [
    { clave: "Buscar", grupos: ["comun"], obsoleta: false },
    { clave: "Noches", grupos: ["comun"], obsoleta: false },
    { clave: "Desde", grupos: ["tours", "hotel"], obsoleta: false },
    { clave: "Vieja", grupos: ["comun"], obsoleta: false },
    { clave: "Volvió", grupos: ["hotel"], obsoleta: true },
    { clave: "Ya obsoleta", grupos: ["comun"], obsoleta: true }
  ];
  const catalogo = [
    { clave: "Buscar", grupos: ["comun"] },
    { clave: "Noches", grupos: ["hotel", "tours"] },
    { clave: "Desde", grupos: ["hotel", "tours"] },
    { clave: "Volvió", grupos: ["hotel"] },
    { clave: "Agregar al carrito", grupos: ["productos"] }
  ];

  it("crea las nuevas, actualiza grupos o reactiva, y marca obsoletas las que ya no están (los mismos grupos en otro orden no cuentan como cambio)", () => {
    expect(planDeCarga(existentes, catalogo)).toEqual({
      crear: [{ clave: "Agregar al carrito", grupos: ["productos"] }],
      actualizar: [{ clave: "Noches", grupos: ["hotel", "tours"] }, { clave: "Volvió", grupos: ["hotel"] }],
      obsoletas: ["Vieja"]
    });
  });

  it("si la tabla ya refleja el catálogo, no hay nada que hacer", () => {
    const iguales = catalogo.map((c) => ({ ...c, obsoleta: false }));
    expect(planDeCarga(iguales, catalogo)).toEqual({ crear: [], actualizar: [], obsoletas: [] });
  });
});

describe("al arrancar el backend", () => {
  it("si la base falla, no lanza: el servidor arranca igual", async () => {
    // El prisma de este test no tiene textos_claves: la consulta revienta.
    await expect(sincronizarClavesAlIniciar()).resolves.toBeUndefined();
  });
});
