import { jest } from "@jest/globals";

jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: {}, default: {} }));
const { seccionesSchema } = await import("../../diseno/secciones.schema.js");
const { CAMPOS_DISENO_NO_TRADUCIBLES, CAMPOS_DISENO_TRADUCIBLES, textosDiseno } = await import("../fuentes.js");

/**
 * Contrato 8 (docs/specs/idiomas): todo campo de texto de una sección de la
 * home (incluidas las de plantillas nuevas) se traduce o está marcado como no
 * traducible. Recorre el schema real con Zod: no hay listas que mantener a mano.
 */

/** Quita optional/nullable/default/effects hasta llegar al tipo. */
function desenvolver(t) {
  let d = t?._def;
  while (d && (d.innerType || d.schema)) { t = d.innerType ?? d.schema; d = t._def; }
  return t;
}

/** Rutas de los campos string de un objeto Zod: "titulo", "items[].texto", "items[]". */
function camposDeTexto(objeto, prefijo = "") {
  return Object.entries(objeto.shape).flatMap(([k, v]) => {
    const t = desenvolver(v);
    const tipo = t?._def?.typeName;
    if (tipo === "ZodString") return [prefijo + k];
    if (tipo === "ZodObject") return camposDeTexto(t, `${prefijo}${k}.`);
    if (tipo !== "ZodArray") return [];
    const el = desenvolver(t._def.type);
    if (el?._def?.typeName === "ZodString") return [`${prefijo}${k}[]`];
    return el?._def?.typeName === "ZodObject" ? camposDeTexto(el, `${prefijo}${k}[].`) : [];
  });
}

const union = desenvolver(desenvolver(seccionesSchema)._def.type);
const secciones = (union._def.options ?? [...union._def.optionsMap.values()]).map(desenvolver);
const porTipo = secciones.map((s) => [s.shape.tipo._def.value, camposDeTexto(s)]);

describe("campos de texto de las secciones de diseño", () => {
  it("se leen del schema (si esto falla, cambió la forma del schema)", () => {
    expect(porTipo.length).toBeGreaterThan(10);
    expect(porTipo.find(([t]) => t === "hero")[1]).toContain("titulo");
  });

  it.each(porTipo)("%s: cada campo de texto se traduce o está marcado como no traducible", (_tipo, campos) => {
    const sinClasificar = campos.filter((c) => !CAMPOS_DISENO_TRADUCIBLES.includes(c) && !(c in CAMPOS_DISENO_NO_TRADUCIBLES));
    expect(sinClasificar).toEqual([]);
  });

  it("los campos nuevos de las canchas llegan a Traducciones", () => {
    const estructura = { home: { secciones: [
      { id: "portada", tipo: "canchas-portada", titulo: "Reserva tu cancha", acento: "en 1 minuto", textoBotonSecundario: "Ver precios" },
      { id: "liga", tipo: "liga", titulo: "Tabla", campeonato: "Copa de verano", nota: "Se juega los sábados", equipos: [{ nombre: "Los Pumas" }] }
    ] } };
    expect(textosDiseno(estructura, null)).toEqual({
      "s.portada.titulo": "Reserva tu cancha", "s.portada.textoBotonSecundario": "Ver precios", "s.portada.acento": "en 1 minuto",
      "s.liga.titulo": "Tabla", "s.liga.campeonato": "Copa de verano", "s.liga.nota": "Se juega los sábados"
    });
  });
});
