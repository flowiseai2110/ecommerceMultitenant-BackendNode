import { jest } from "@jest/globals";
import { readdirSync, readFileSync } from "node:fs";

jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: {}, default: {} }));
const { ARCHIVOS_PANTALLAS, crearUbicaciones, ubicacionVisible, ubicaciones } = await import("../ubicaciones.js");
const { leerCatalogo } = await import("../claves.service.js");
const { DATOS } = await import("../../negocio/datos.js");
const { grupoPrincipal } = await import("../textos.service.js");

/** Las claves que traduce un rubro, con su grupo principal (como clavesDeTienda). */
const clavesDelRubro = (gruposTextos) => leerCatalogo()
  .filter((c) => c.grupos.some((g) => gruposTextos.includes(g)))
  .map((c) => ({ clave: c.clave, grupo: grupoPrincipal(c.grupos, gruposTextos) }));

// docs/specs/idiomas, diseno.md A3 (Specification por capacidad) y A7 (metadato en el JSON)
describe("lugares de un texto fijo", () => {
  const indice = crearUbicaciones({
    claves: [
      { clave: "Ver todas", ubicaciones: ["habitaciones/lista", "evento/ficha"] },
      { clave: "Ver todas", ubicaciones: ["correos/confirmada"] },   // la misma clave en el catálogo del servidor
      { clave: "Antes de salir", ubicaciones: ["evento/ficha"] }
    ],
    pantallas: [
      { id: "habitaciones", nombre: "Habitaciones", secciones: [{ id: "lista", nombre: "Lista de habitaciones", grupos: ["hotel"] }] },
      { id: "evento", nombre: "Ficha del evento", secciones: [{ id: "ficha", nombre: "Ficha", grupos: ["eventos"] }] },
      { id: "correos", nombre: "Correos al cliente", zona: "mensajes", secciones: [{ id: "otra", nombre: "Otra", grupos: ["correos"] }, { id: "confirmada", nombre: "Reserva confirmada", grupos: ["correos"] }] }
    ]
  });
  const HOTEL = ["comun", "reservas", "hotel", "correos"];

  it("solo las ubicaciones de los grupos del rubro, juntando tienda y servidor", () => {
    expect(indice.lugaresDeClave("Ver todas", { gruposTextos: HOTEL, grupo: "comun" })).toEqual([
      { lugar: { id: "pantallas/habitaciones", zona: "pantallas", nombre: "Habitaciones", orden: 0 }, seccion: { id: "lista", nombre: "Lista de habitaciones", orden: 0 } },
      { lugar: { id: "mensajes/correos", zona: "mensajes", nombre: "Correos al cliente", orden: 2 }, seccion: { id: "confirmada", nombre: "Reserva confirmada", orden: 1 } }
    ]);
  });

  it("sin ubicación visible para el rubro, cae en Otros textos con el nombre de su grupo: no se pierde", () => {
    expect(indice.lugaresDeClave("Antes de salir", { gruposTextos: HOTEL, grupo: "comun" })).toEqual([{
      lugar: { id: "pantallas/otros", zona: "pantallas", nombre: "Otros textos", orden: Number.MAX_SAFE_INTEGER },
      seccion: { id: "comun", nombre: "Textos generales de la tienda" }
    }]);
    expect(indice.lugaresDeClave("No está en el catálogo", { gruposTextos: HOTEL, grupo: "hotel" })[0].lugar.id).toBe("pantallas/otros");
  });

  it("ubicacionVisible pregunta por la capacidad (gruposTextos), no por el rubro: basta un grupo en común", () => {
    expect(ubicacionVisible({ grupos: ["hotel"] }, HOTEL)).toBe(true);
    expect(ubicacionVisible({ grupos: ["eventos", "hotel"] }, HOTEL)).toBe(true);
    expect(ubicacionVisible({ grupos: ["eventos", "tours"] }, HOTEL)).toBe(false);
  });

  it("una sección repetida en los catálogos es un error", () => {
    const p = { id: "x", nombre: "X", secciones: [{ id: "a", nombre: "A", grupos: ["comun"] }] };
    expect(() => crearUbicaciones({ claves: [], pantallas: [p, p] })).toThrow(/x\/a/);
  });
});

describe("los catálogos desplegados", () => {
  const leer = (ruta) => JSON.parse(readFileSync(new URL(ruta, import.meta.url), "utf8"));
  const pantallas = ARCHIVOS_PANTALLAS.flatMap((a) => leer(`../pantallas/${a}`));
  const secciones = new Set(pantallas.flatMap((p) => p.secciones.map((s) => `${p.id}/${s.id}`)));

  it("la carpeta pantallas/ tiene exactamente los archivos que se leen (y en ese orden se muestran)", () => {
    expect(readdirSync(new URL("../pantallas/", import.meta.url)).filter((a) => a.endsWith(".json")).sort()).toEqual([...ARCHIVOS_PANTALLAS].sort());
  });

  it("toda ubicación de una clave existe en los catálogos de pantallas", () => {
    const claves = readdirSync(new URL("../claves/", import.meta.url)).filter((a) => a.endsWith(".json")).flatMap((a) => leer(`../claves/${a}`));
    const rotas = claves.flatMap((c) => (c.ubicaciones ?? []).filter((u) => !secciones.has(u)).map((u) => `${c.clave} → ${u}`));
    expect(rotas).toEqual([]);
    expect(claves.every((c) => c.ubicaciones?.length)).toBe(true);
  });

  it.each(Object.keys(DATOS))("%s: cada texto que traduce tiene al menos un lugar", (rubro) => {
    const { gruposTextos } = DATOS[rubro];
    const indice = ubicaciones();
    const sinLugar = clavesDelRubro(gruposTextos)
      .filter((c) => !indice.lugaresDeClave(c.clave, { gruposTextos, grupo: c.grupo }).length);
    expect(sinLugar).toEqual([]);
  });

  it.each(["productos", "hotel", "tours"])("%s (con sus pantallas en la fase 1): ningún texto cae en Otros textos", (rubro) => {
    const { gruposTextos } = DATOS[rubro];
    const indice = ubicaciones();
    const enOtros = clavesDelRubro(gruposTextos)
      .filter((c) => indice.lugaresDeClave(c.clave, { gruposTextos, grupo: c.grupo })[0].lugar.id === "pantallas/otros")
      .map((c) => c.clave);
    expect(enOtros).toEqual([]);
  });
});
