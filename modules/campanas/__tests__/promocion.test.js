import {
  promocionesVigentes, estadoPromocion, resumenPromocion, proximoCambioPromociones, conSubcategorias, promocionesPublicas,
  cuponDeCampanaVigente
} from "../promocion.js";
import { precioVigente } from "../../precios/precio-vigente.js";

// Cuándo aplica una promoción de campaña (docs/specs/campanas-descuento R5, R9; impacto C3a). Pura.
const lima = (texto) => new Date(`${texto}:00-05:00`);

// Campaña propia del 20 al 30 de noviembre (fin inclusive → termina el 1 dic a las 00:00).
const aniversario = (extra = {}) => ({ id: "c-aniv", activa: true, nombre: "Aniversario", inicio: "2026-11-20", fin: "2026-11-30", ...extra });
const promo = (extra = {}) => ({
  id: "p-aniv", campanaId: "c-aniv", porcentaje: 20, alcance: "tienda", permitirCupones: false, permitirEnvioGratis: false,
  version: 2, categoriaIds: [], productoIds: [], ...extra
});
const conf = (promocionId, version, inicio, fin) => ({ promocionId, promocionVersion: version, ventanaInicio: lima(inicio), ventanaFin: lima(fin) });
const confAniv = conf("p-aniv", 2, "2026-11-20T00:00", "2026-12-01T00:00");

const vigentes = (ahora, { campanas = [aniversario()], promociones = [promo()], confirmaciones = [confAniv], categorias = [], ediciones = null } = {}) =>
  promocionesVigentes(campanas, promociones, confirmaciones, categorias, ahora, ediciones);

describe("promocionesVigentes: ventana de la campaña (CA-5.2)", () => {
  it.each([
    ["2026-11-19T23:59", 0],
    ["2026-11-20T00:00", 1],
    ["2026-11-30T23:59", 1],
    ["2026-12-01T00:00", 0]
  ])("%s → %i promoción(es)", (hora, n) => {
    expect(vigentes(lima(hora))).toHaveLength(n);
  });

  it("devuelve nombre, porcentaje, permisos y hasta el fin de la ventana", () => {
    const [p] = vigentes(lima("2026-11-25T12:00"));
    expect(p).toMatchObject({ campanaId: "c-aniv", nombre: "Aniversario", porcentaje: 20, permitirCupones: false, orden: 0 });
    expect(p.hasta).toEqual(lima("2026-12-01T00:00"));
  });

  it("campaña apagada → no aplica (R8.6)", () => {
    expect(vigentes(lima("2026-11-25T12:00"), { campanas: [aniversario({ activa: false })] })).toEqual([]);
  });

  it("campaña que ya no está en el JSON → no aplica", () => {
    expect(vigentes(lima("2026-11-25T12:00"), { campanas: [] })).toEqual([]);
  });
});

describe("promocionesVigentes: confirmación (R5.7, R9.5, R9.6)", () => {
  it("sin confirmar no cambia precios (CA-5.7)", () => {
    expect(vigentes(lima("2026-11-25T12:00"), { confirmaciones: [] })).toEqual([]);
  });

  it("versión cambiada después de confirmar → no aplica (CA-9.4)", () => {
    expect(vigentes(lima("2026-11-25T12:00"), { promociones: [promo({ version: 3 })] })).toEqual([]);
  });

  it("confirmada para otra ventana (fechas cambiadas) → no aplica", () => {
    expect(vigentes(lima("2026-11-25T12:00"), { campanas: [aniversario({ fin: "2026-11-29" })] })).toEqual([]);
  });

  describe("Cyber Wow confirmado en julio no aplica en noviembre (CA-9.5)", () => {
    const wow = { id: "c-wow", activa: true, presetId: "cyber-wow", anticipacionDias: 0 };
    const ed = (clave, inicio, fin) => ({ presetId: "cyber-wow", anio: 2026, clave, nombre: clave, inicio, horaInicio: null, fin, horaFin: null });
    const ediciones = [ed("julio", "2026-07-14", "2026-07-16"), ed("noviembre", "2026-11-04", "2026-11-06")];
    const p = promo({ id: "p-wow", campanaId: "c-wow", version: 1 });
    const julio = conf("p-wow", 1, "2026-07-14T00:00", "2026-07-17T00:00");
    const opciones = { campanas: [wow], promociones: [p], confirmaciones: [julio], ediciones };

    it("aplica en julio y no en noviembre", () => {
      expect(vigentes(lima("2026-07-15T12:00"), opciones)).toHaveLength(1);
      expect(vigentes(lima("2026-11-05T12:00"), opciones)).toEqual([]);
    });

    it("estado: por confirmar la edición de noviembre, con recordatorio desde 30 días antes", () => {
      expect(estadoPromocion(wow, p, [julio], lima("2026-10-01T12:00"), ediciones))
        .toMatchObject({ estado: "por-confirmar-edicion", recordar: false });
      expect(estadoPromocion(wow, p, [julio], lima("2026-10-10T12:00"), ediciones))
        .toMatchObject({ estado: "por-confirmar-edicion", recordar: true });
      const noviembre = conf("p-wow", 1, "2026-11-04T00:00", "2026-11-07T00:00");
      expect(estadoPromocion(wow, p, [julio, noviembre], lima("2026-10-10T12:00"), ediciones).estado).toBe("confirmada");
    });
  });
});

describe("dos campañas cruzadas (CA-5.5)", () => {
  const corta = { id: "c-flash", activa: true, nombre: "Flash", inicio: "2026-11-24", fin: "2026-11-25" };
  const promoFlash = promo({ id: "p-flash", campanaId: "c-flash", porcentaje: 30, version: 1 });
  const confFlash = conf("p-flash", 1, "2026-11-24T00:00", "2026-11-26T00:00");
  const opciones = { campanas: [aniversario(), corta], promociones: [promo(), promoFlash], confirmaciones: [confAniv, confFlash] };

  it("las dos aplican a la vez; la ventana más corta va primero en el desempate", () => {
    const v = vigentes(lima("2026-11-24T12:00"), opciones);
    expect(v.map((p) => [p.campanaId, p.orden])).toEqual([["c-flash", 0], ["c-aniv", 1]]);
  });

  it("por producto gana el mayor descuento", () => {
    const contexto = { promociones: vigentes(lima("2026-11-24T12:00"), opciones) };
    expect(precioVigente({ id: "x", precioBase: 100 }, null, contexto)).toMatchObject({ unitario: 7000, origen: "campana", campana: { id: "c-flash" } });
  });
});

describe("alcance", () => {
  const categorias = [
    { id: "zap", categoriaPadreId: null },
    { id: "running", categoriaPadreId: "zap" },
    { id: "trail", categoriaPadreId: "running" },
    { id: "polos", categoriaPadreId: null }
  ];

  it("subcategorías incluidas: Running y Trail dentro de Zapatillas (CA-4.3, Q6)", () => {
    expect([...conSubcategorias(["zap"], categorias)].sort()).toEqual(["running", "trail", "zap"]);
    const [p] = vigentes(lima("2026-11-25T12:00"), { promociones: [promo({ alcance: "categorias", categoriaIds: ["zap"] })], categorias });
    expect(p.alcance.elegidas).toEqual(["zap"]);
    const contexto = { promociones: [p] };
    expect(precioVigente({ id: "x", categoriaId: "trail", precioBase: 100 }, null, contexto).unitario).toBe(8000);
    expect(precioVigente({ id: "y", categoriaId: "polos", precioBase: 100 }, null, contexto).unitario).toBe(10000);
  });

  it("toda la tienda cubre productos nuevos (CA-4.2); seleccionados no (CA-4.4)", () => {
    const nuevo = { id: "nuevo", categoriaId: "polos", precioBase: 50 };
    const tienda = { promociones: vigentes(lima("2026-11-25T12:00")) };
    const seleccionados = { promociones: vigentes(lima("2026-11-25T12:00"), { promociones: [promo({ alcance: "productos", productoIds: ["viejo"] })] }) };
    expect(precioVigente(nuevo, null, tienda).unitario).toBe(4000);
    expect(precioVigente(nuevo, null, seleccionados).unitario).toBe(5000);
    expect(precioVigente({ ...nuevo, id: "viejo" }, null, seleccionados).unitario).toBe(4000);
  });
});

describe("estadoPromocion", () => {
  it("sin promoción, sin confirmar, confirmada y terminó", () => {
    const ahora = lima("2026-11-10T12:00");
    expect(estadoPromocion(aniversario(), null, [], ahora).estado).toBe("sin-promocion");
    expect(estadoPromocion(aniversario(), promo(), [], ahora).estado).toBe("sin-confirmar");
    expect(estadoPromocion(aniversario(), promo(), [confAniv], ahora)).toMatchObject({
      estado: "confirmada", ventana: { inicio: lima("2026-11-20T00:00"), fin: lima("2026-12-01T00:00") }
    });
    expect(estadoPromocion(aniversario(), promo({ version: 3 }), [confAniv], ahora).estado).toBe("sin-confirmar");
    expect(estadoPromocion(aniversario(), promo(), [confAniv], lima("2026-12-02T12:00")).estado).toBe("termino");
  });
});

describe("resumenPromocion", () => {
  it("una categoría por su nombre, varias, productos y toda la tienda", () => {
    expect(resumenPromocion({ porcentaje: 20, alcance: "categorias", categoriaIds: ["zap"] }, () => "Zapatillas")).toBe("−20 % en Zapatillas");
    expect(resumenPromocion({ porcentaje: 20, alcance: "categorias", categoriaIds: ["a", "b", "c"] })).toBe("−20 % en 3 categorías");
    expect(resumenPromocion({ porcentaje: 20, alcance: "productos", productoIds: Array(12).fill("x") })).toBe("−20 % en 12 productos");
    expect(resumenPromocion({ porcentaje: 15, alcance: "tienda" })).toBe("−15 % en toda la tienda");
  });
});

describe("proximoCambioPromociones", () => {
  it("la próxima frontera de una campaña activa con promoción; null sin promociones", () => {
    expect(proximoCambioPromociones([aniversario()], [promo()], lima("2026-11-10T12:00"))).toEqual(lima("2026-11-20T00:00"));
    expect(proximoCambioPromociones([aniversario()], [promo()], lima("2026-11-25T12:00"))).toEqual(lima("2026-12-01T00:00"));
    expect(proximoCambioPromociones([aniversario()], [], lima("2026-11-10T12:00"))).toBeNull();
  });
});

describe("promocionesPublicas", () => {
  it("sin datos internos: categorías con nombre y slug, conteo de productos", () => {
    const [cat] = vigentes(lima("2026-11-25T12:00"), { promociones: [promo({ alcance: "categorias", categoriaIds: ["zap"] })] });
    const nombres = new Map([["zap", { id: "zap", nombre: "Zapatillas", slug: "zapatillas", tiendaId: "t" }]]);
    expect(promocionesPublicas([cat], nombres)).toEqual([{
      campanaId: "c-aniv", nombre: "Aniversario", porcentaje: 20, hasta: "2026-12-01T00:00:00-05:00",
      alcance: { tipo: "categorias", categorias: [{ id: "zap", nombre: "Zapatillas", slug: "zapatillas" }], productos: null },
      combinaCupones: false, combinaEnvioGratis: false
    }]);
    const [prod] = vigentes(lima("2026-11-25T12:00"), { promociones: [promo({ alcance: "productos", productoIds: ["a", "b"] })] });
    expect(promocionesPublicas([prod])[0].alcance).toEqual({ tipo: "productos", categorias: null, productos: 2 });
  });
});

describe("cuponDeCampanaVigente: el cupón de la campaña vence con ella (R4.8, CA-4.7)", () => {
  const cyber10 = { codigo: "CYBER10", campanaPromocionId: "p-aniv" };

  it("vale mientras su promoción aplica y se rechaza el 1 dic, aunque la tienda muestre un dato viejo", () => {
    expect(cuponDeCampanaVigente(cyber10, vigentes(lima("2026-11-30T23:59")))).toBe(true);
    expect(cuponDeCampanaVigente(cyber10, vigentes(lima("2026-12-01T00:00")))).toBe(false);
  });

  it("sin confirmar la versión de su promoción tampoco vale", () => {
    expect(cuponDeCampanaVigente(cyber10, vigentes(lima("2026-11-25T12:00"), { confirmaciones: [] }))).toBe(false);
  });

  it("un cupón de la tienda no depende de ninguna campaña", () => {
    expect(cuponDeCampanaVigente({ codigo: "BIENVENIDA", campanaPromocionId: null }, [])).toBe(true);
  });
});
