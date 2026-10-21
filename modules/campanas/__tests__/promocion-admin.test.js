import { promocionSchema, guardarCampanaSchema } from "../promocion.schema.js";
import {
  cambiaLoQueSeCobra, promocionEnCalendario, promocionesDelProducto, textoFechaHora, ventanaConfirmadaCambiada
} from "../promocion.js";

// Reglas puras y forma de la entrada del paso 3 (docs/specs/campanas-descuento C3b).

const lima = (texto) => new Date(`${texto}:00-05:00`);
const ID = "22222222-2222-4222-8222-222222222222";
const base = { porcentaje: 20, alcance: "tienda" };

describe("promocionSchema (R4, CA-4.1)", () => {
  it.each([0, 91, 12.5, "20"])("rechaza el porcentaje %p", (porcentaje) => {
    expect(promocionSchema.safeParse({ ...base, porcentaje }).success).toBe(false);
  });

  it.each([1, 90])("acepta %p", (porcentaje) => {
    expect(promocionSchema.safeParse({ ...base, porcentaje }).success).toBe(true);
  });

  it("un solo alcance: categorías sin ids o ids que no son del alcance se rechazan", () => {
    expect(promocionSchema.safeParse({ ...base, alcance: "categorias" }).success).toBe(false);
    expect(promocionSchema.safeParse({ ...base, productoIds: [ID] }).success).toBe(false);
    expect(promocionSchema.safeParse({ ...base, alcance: "productos", productoIds: [ID] }).success).toBe(true);
  });

  it("topes: 200 categorías y 2.000 productos; campos de más se rechazan (estricto)", () => {
    const ids = (n) => Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect(promocionSchema.safeParse({ ...base, alcance: "categorias", categoriaIds: ids(201) }).success).toBe(false);
    expect(promocionSchema.safeParse({ ...base, alcance: "productos", productoIds: ids(2001) }).success).toBe(false);
    expect(promocionSchema.safeParse({ ...base, version: 3 }).success).toBe(false);
  });

  it("cupón de la campaña como los de la tienda: porcentaje hasta 100, código en mayúsculas", () => {
    const cupon = { codigo: "cyber10", tipo: "porcentaje", valor: 101 };
    expect(promocionSchema.safeParse({ ...base, cupon }).success).toBe(false);
    const ok = promocionSchema.parse({ ...base, cupon: { ...cupon, valor: 10 } });
    expect(ok.cupon).toEqual({ codigo: "CYBER10", tipo: "porcentaje", valor: 10, minimoCompra: 0, usoMaximo: null, usoMaximoPorCliente: 1 });
  });

  it("la confirmación trae la versión que vio y la ventana", () => {
    const campana = { id: ID, presetId: null, activa: true, nombre: "Aniv", inicio: "2026-11-20", fin: "2026-11-30" };
    const r = guardarCampanaSchema.safeParse({
      campana, promocion: base, confirmar: { version: 1, ventanaInicio: "2026-11-20T00:00:00-05:00", ventanaFin: "2026-12-01T00:00:00-05:00" }
    });
    expect(r.success).toBe(true);
    expect(r.data.confirmar.ventanaInicio).toEqual(lima("2026-11-20T00:00"));
  });
});

describe("cambiaLoQueSeCobra (R9.5)", () => {
  const p = { ...base, categoriaIds: [], productoIds: [], permitirCupones: false, permitirEnvioGratis: false, cupon: null };
  it("porcentaje, alcance, ids, permisos o cupón cambian lo que se cobra; el orden de los ids no", () => {
    expect(cambiaLoQueSeCobra(p, { ...p })).toBe(false);
    expect(cambiaLoQueSeCobra(p, { ...p, porcentaje: 25 })).toBe(true);
    expect(cambiaLoQueSeCobra(p, { ...p, permitirCupones: true })).toBe(true);
    expect(cambiaLoQueSeCobra(p, { ...p, cupon: { codigo: "X", tipo: "porcentaje", valor: 5 } })).toBe(true);
    const cats = { ...p, alcance: "categorias", categoriaIds: ["a", "b"] };
    expect(cambiaLoQueSeCobra(cats, { ...cats, categoriaIds: ["b", "a"] })).toBe(false);
    expect(cambiaLoQueSeCobra(cats, { ...cats, categoriaIds: ["a"] })).toBe(true);
  });

  it("el cupón guardado (Decimal) y el del formulario (número) se comparan por valor", () => {
    const cupon = { codigo: "CYBER10", tipo: "porcentaje", valor: 10, minimoCompra: 0, usoMaximo: null, usoMaximoPorCliente: 1 };
    expect(cambiaLoQueSeCobra({ ...p, cupon: { ...cupon, valor: "10.00", minimoCompra: "0" } }, { ...p, cupon })).toBe(false);
  });
});

describe("promociones del producto, diseño y calendario", () => {
  const aniv = { id: "c-aniv", presetId: null, activa: true, nombre: "Aniversario", inicio: "2026-11-20", fin: "2026-11-30" };
  const promo = { id: "p1", campanaId: "c-aniv", version: 1, porcentaje: 20, alcance: "categorias", categoriaIds: ["zap"], productoIds: [] };
  const conf = { promocionId: "p1", promocionVersion: 1, ventanaInicio: lima("2026-11-20T00:00"), ventanaFin: lima("2026-12-01T00:00"), confirmadoPor: "d@x.com", confirmadoEn: lima("2026-11-01T10:00") };
  const arbol = [{ id: "zap", categoriaPadreId: null }, { id: "running", categoriaPadreId: "zap" }];

  it("R10.3/R10.5: cubre a la subcategoría; en curso o en los próximos 30 días; sin confirmar no cuenta", () => {
    const run = { id: "r1", categoriaId: "running" };
    const [enCurso] = promocionesDelProducto([aniv], [promo], [conf], arbol, run, lima("2026-11-25T12:00"));
    expect(enCurso).toMatchObject({ campanaId: "c-aniv", nombre: "Aniversario", enCurso: true, fin: lima("2026-12-01T00:00") });
    expect(promocionesDelProducto([aniv], [promo], [conf], arbol, run, lima("2026-11-05T12:00"))[0].enCurso).toBe(false);
    expect(promocionesDelProducto([aniv], [promo], [conf], arbol, run, lima("2026-10-01T12:00"))).toEqual([]);
    expect(promocionesDelProducto([aniv], [promo], [], arbol, run, lima("2026-11-25T12:00"))).toEqual([]);
    expect(promocionesDelProducto([aniv], [promo], [conf], arbol, { id: "x", categoriaId: "camisas" }, lima("2026-11-25T12:00"))).toEqual([]);
  });

  it("T3b.7: solo cambiar la ventana de una campaña confirmada la marca", () => {
    const ahora = lima("2026-11-10T12:00");
    expect(ventanaConfirmadaCambiada([aniv], [{ ...aniv, fin: "2026-12-02" }], [promo], [conf], ahora)).toBe("Aniversario");
    expect(ventanaConfirmadaCambiada([aniv], [{ ...aniv, nombre: "Aniversario", topBar: "x" }], [promo], [conf], ahora)).toBeNull();
    expect(ventanaConfirmadaCambiada([aniv], [{ ...aniv, fin: "2026-12-02" }], [promo], [], ahora)).toBeNull();
  });

  it("T3b.6: el calendario trae resumen, estado y quién confirmó", () => {
    const fila = promocionEnCalendario(aniv, promo, [conf], lima("2026-11-10T12:00"), null, (id) => (id === "zap" ? "Zapatillas" : null));
    expect(fila).toEqual({ resumen: "−20 % en Zapatillas", porcentaje: 20, estado: "confirmada", confirmacion: { por: "d@x.com", en: conf.confirmadoEn }, recordar: false });
    expect(promocionEnCalendario(aniv, null, [], new Date())).toBeNull();
  });

  it("fecha y hora del Admin con día de la semana (R9.2)", () => {
    expect(textoFechaHora(lima("2026-11-20T00:00"))).toBe("vie 20 nov, 00:00");
    expect(textoFechaHora(lima("2026-12-01T00:00"), { fin: true })).toBe("lun 30 nov, 23:59");
  });
});
