import { calendarioAnual, disenoPublico, efectiva } from "../resolver.js";
import { CAMPANA_PRESETS, buscarPreset } from "../presets.js";
import { EFECTOS } from "../efectos.js";
import { listaCampanasSchema } from "../campanas.schema.js";
import { vigente } from "../calendario.js";

// docs/specs/efectos-festivos

const lima = (texto) => new Date(`${texto}:00-05:00`);
const id = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const navidad = (extra = {}) => ({ id: id(1), presetId: "navidad", activa: true, ...extra });
const anioNuevo = (extra = {}) => ({ id: id(2), presetId: "anio-nuevo", activa: true, ...extra });
const propia = (extra = {}) => ({ id: id(3), presetId: null, activa: true, nombre: "Aniversario", inicio: "2026-12-10", fin: "2026-12-12", ...extra });

const efectoEn = (campanas, cuando) => disenoPublico({ campanas }, lima(cuando)).campana?.efecto;

describe("catálogo y presets (E1.1, E1.2)", () => {
  it("cada preset trae un efecto del catálogo, días clave y saludo opcional", () => {
    for (const p of CAMPANA_PRESETS) {
      expect(EFECTOS).toContain(p.efecto);
      expect(Array.isArray(p.diasEfecto) && p.diasEfecto.length > 0).toBe(true);
      expect(p.saludo === null || typeof p.saludo === "string").toBe(true);
    }
  });

  it("Navidad: nieve el 24 y 25; Año Nuevo: fuegos el 31 y el 1", () => {
    expect(buscarPreset("navidad")).toMatchObject({ efecto: "nieve", diasEfecto: [-1, 0], saludo: "¡Feliz Navidad!" });
    expect(buscarPreset("anio-nuevo")).toMatchObject({ efecto: "fuegos", diasEfecto: [0, 1] });
  });

  it("Año Nuevo no se cruza con Navidad ni con las rebajas de verano", () => {
    const activas = ["navidad", "anio-nuevo", "verano"].map((p, i) => efectiva({ id: id(i), presetId: p, activa: true }));
    expect(vigente(activas, lima("2026-12-25T23:00")).campana.presetId).toBe("navidad");
    expect(vigente(activas, lima("2026-12-26T00:00")).campana.presetId).toBe("anio-nuevo");
    expect(vigente(activas, lima("2027-01-01T23:00")).campana.presetId).toBe("anio-nuevo");
    expect(vigente(activas, lima("2027-01-02T00:00")).campana.presetId).toBe("verano");
  });
});

describe("efecto vigente (E2)", () => {
  it("modo clave: solo los días clave, desde las 00:00 de Lima", () => {
    expect(efectoEn([navidad()], "2026-12-20T12:00")).toBeNull();
    expect(efectoEn([navidad()], "2026-12-23T23:59")).toBeNull();
    expect(efectoEn([navidad()], "2026-12-24T00:00")).toEqual({ tipo: "nieve", saludo: "¡Feliz Navidad!" });
    expect(efectoEn([navidad()], "2026-12-25T23:00")).toEqual({ tipo: "nieve", saludo: "¡Feliz Navidad!" });
  });

  it("cruza el cambio de año (31 dic y 1 ene)", () => {
    expect(efectoEn([anioNuevo()], "2026-12-30T12:00")).toBeNull();
    expect(efectoEn([anioNuevo()], "2026-12-31T20:00")?.tipo).toBe("fuegos");
    expect(efectoEn([anioNuevo()], "2027-01-01T10:00")?.tipo).toBe("fuegos");
  });

  it("modo campaña: durante toda la ventana", () => {
    expect(efectoEn([navidad({ efectoModo: "campana" })], "2026-11-20T12:00")?.tipo).toBe("nieve");
  });

  it("se recorta a la ventana de la campaña", () => {
    // Año Nuevo sin días después: el 1 ene ya no hay campaña ni efecto.
    expect(disenoPublico({ campanas: [anioNuevo({ despuesDias: 0 })] }, lima("2027-01-01T10:00")).campana).toBeNull();
  });

  it("lo personalizado gana: otro efecto y otro saludo", () => {
    expect(efectoEn([navidad({ efecto: "estrellas", saludo: "¡Felices fiestas!" })], "2026-12-24T12:00")).toEqual({ tipo: "estrellas", saludo: "¡Felices fiestas!" });
  });

  it("sin efecto y sin saludo → null; sin efecto con saludo → solo el saludo (E2.3)", () => {
    expect(efectoEn([navidad({ efecto: "ninguno", saludo: "" })], "2026-12-24T12:00")).toBeNull();
    expect(efectoEn([navidad({ efecto: "ninguno" })], "2026-12-24T12:00")).toEqual({ tipo: "ninguno", saludo: "¡Feliz Navidad!" });
    expect(efectoEn([navidad({ saludo: "  " })], "2026-12-24T12:00")).toEqual({ tipo: "nieve", saludo: null });
  });

  it("una campaña propia empieza sin efecto; si se elige, va en su fecha de fin (E1.4)", () => {
    expect(efectoEn([propia()], "2026-12-12T12:00")).toBeNull();
    expect(efectoEn([propia({ efecto: "globos" })], "2026-12-11T12:00")).toBeNull();
    expect(efectoEn([propia({ efecto: "globos" })], "2026-12-12T12:00")).toEqual({ tipo: "globos", saludo: null });
  });
});

describe("calendario del admin (E4.1)", () => {
  it("cada fila trae el efecto y los días en que se ve", () => {
    const filas = calendarioAnual([navidad({ efecto: "estrellas" })], "general", 2026);
    const n = filas.find((f) => f.presetId === "navidad");
    expect(n).toMatchObject({ efecto: "estrellas", efectoModo: "clave", efectoInicio: "2026-12-24T00:00:00-05:00", efectoFin: "2026-12-26T00:00:00-05:00" });
    const madre = filas.find((f) => f.presetId === "madre");
    expect(madre).toMatchObject({ efecto: "petalos", saludo: "¡Feliz Día de la Madre!", activa: false });
  });

  it("sin efecto no hay días de efecto", () => {
    const n = calendarioAnual([navidad({ efecto: "ninguno" })], "general", 2026).find((f) => f.presetId === "navidad");
    expect(n).toMatchObject({ efecto: "ninguno", efectoInicio: null, efectoFin: null });
  });
});

describe("schema (E1.3)", () => {
  it("acepta efecto, modo y saludo", () => {
    expect(listaCampanasSchema.safeParse([navidad({ efecto: "fuegos", efectoModo: "campana", saludo: "¡Hola!" })]).success).toBe(true);
    expect(listaCampanasSchema.safeParse([navidad({ efecto: null, efectoModo: null, saludo: null })]).success).toBe(true);
  });

  it("rechaza un efecto fuera del catálogo, un modo inválido y un saludo largo", () => {
    expect(listaCampanasSchema.safeParse([navidad({ efecto: "lluvia-de-gatos" })]).success).toBe(false);
    expect(listaCampanasSchema.safeParse([navidad({ efectoModo: "siempre" })]).success).toBe(false);
    expect(listaCampanasSchema.safeParse([navidad({ saludo: "x".repeat(81) })]).success).toBe(false);
  });
});
