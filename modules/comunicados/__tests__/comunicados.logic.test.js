import { estadoDe, isoLima, listaAdmin, prepararLista, vigentesPublicos, MAX_EN_CURSO, MAX_HISTORIAL } from "../comunicados.logic.js";
import { linkSeguro, updateComunicadosSchema } from "../comunicados.schema.js";

const lima = (texto) => new Date(`${texto}:00-05:00`);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const AHORA = lima("2026-10-10T12:00");

const base = (extra = {}) => ({
  titulo: "Sauna en mantenimiento",
  mensaje: "Del 12 al 15 de octubre",
  nivel: "importante",
  formato: "modal",
  inicio: "2026-10-10T00:00:00-05:00",
  fin: "2026-10-16T00:00:00-05:00",
  pausado: false,
  afectaCompras: false,
  paginas: "todas",
  frecuencia: "una_vez",
  boton: null,
  ...extra
});

describe("isoLima", () => {
  it("expresa el instante con offset -05:00", () => {
    expect(isoLima(new Date("2026-10-10T05:00:00Z"))).toBe("2026-10-10T00:00:00-05:00");
  });
});

describe("estadoDe", () => {
  it("programado, activo, pausado y vencido", () => {
    expect(estadoDe(base({ inicio: "2026-10-11T00:00:00-05:00" }), AHORA)).toBe("programado");
    expect(estadoDe(base(), AHORA)).toBe("activo");
    expect(estadoDe(base({ pausado: true }), AHORA)).toBe("pausado");
    expect(estadoDe(base({ fin: "2026-10-10T12:00:00-05:00" }), AHORA)).toBe("vencido"); // fin exclusivo
  });

  it("vencido gana a pausado", () => {
    expect(estadoDe(base({ pausado: true, fin: "2026-10-01T00:00:00-05:00" }), AHORA)).toBe("vencido");
  });
});

describe("prepararLista", () => {
  it("asigna id, versión 1, auditoría y el inicio por defecto (ahora)", () => {
    const [c] = prepararLista([base({ inicio: null })], [], AHORA, "dueno@x.pe");
    expect(c.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(c).toMatchObject({ version: 1, inicio: "2026-10-10T12:00:00-05:00", actualizadoPor: "dueno@x.pe" });
  });

  it("ignora version, estado y emailEnvio que manda el cliente", () => {
    const [c] = prepararLista([{ ...base(), version: 99, estado: "activo", emailEnvio: { cantidad: 5 } }], [], AHORA);
    expect(c.version).toBe(1);
    expect(c.estado).toBeUndefined();
    expect(c.emailEnvio).toBeUndefined();
  });

  it("sube la versión solo si cambia el contenido", () => {
    const [previo] = prepararLista([base({ id: id(1) })], [], AHORA);
    const [soloFechas] = prepararLista([base({ id: id(1), fin: "2026-10-20T00:00:00-05:00", pausado: true })], [previo], AHORA);
    expect(soloFechas.version).toBe(1);
    const [otroTexto] = prepararLista([base({ id: id(1), mensaje: "Del 12 al 18" })], [previo], AHORA);
    expect(otroTexto.version).toBe(2);
    const [conBoton] = prepararLista([base({ id: id(1), boton: { texto: "Ver", link: "/x" } })], [previo], AHORA);
    expect(conBoton.version).toBe(2);
  });

  it("conserva el inicio guardado si el cliente lo manda null", () => {
    const [previo] = prepararLista([base({ id: id(1) })], [], AHORA);
    const [c] = prepararLista([base({ id: id(1), inicio: null })], [previo], lima("2026-10-11T08:00"));
    expect(c.inicio).toBe("2026-10-10T00:00:00-05:00");
  });

  it("preserva el registro del envío por email", () => {
    const previo = { ...prepararLista([base({ id: id(1) })], [], AHORA)[0], emailEnvio: { cantidad: 3 } };
    const [c] = prepararLista([base({ id: id(1) })], [previo], AHORA);
    expect(c.emailEnvio).toEqual({ cantidad: 3 });
  });

  it("rechaza fin anterior al inicio y vigencias de más de 180 días", () => {
    expect(() => prepararLista([base({ fin: "2026-10-09T00:00:00-05:00" })], [], AHORA)).toThrow("La fecha de fin debe ser posterior al inicio");
    expect(() => prepararLista([base({ fin: "2027-06-01T00:00:00-05:00" })], [], AHORA)).toThrow("180 días");
  });

  it(`rechaza más de ${MAX_EN_CURSO} en curso, sin contar los vencidos`, () => {
    const enCurso = Array.from({ length: MAX_EN_CURSO }, (_, i) => base({ id: id(i + 1) }));
    const vencido = base({ id: id(50), inicio: "2026-09-01T00:00:00-05:00", fin: "2026-09-05T00:00:00-05:00" });
    expect(() => prepararLista([...enCurso, vencido], [], AHORA)).not.toThrow();
    expect(() => prepararLista([...enCurso, base({ id: id(99) })], [], AHORA)).toThrow(`como máximo ${MAX_EN_CURSO}`);
  });

  it(`conserva solo los ${MAX_HISTORIAL} vencidos más recientes`, () => {
    const vencidos = Array.from({ length: MAX_HISTORIAL + 5 }, (_, i) => {
      const dia = String(i + 1).padStart(2, "0");
      const mes = i < 30 ? "08" : "09";
      const d = i < 30 ? dia : String(i - 29).padStart(2, "0");
      return base({ id: id(i + 1), inicio: `2026-${mes}-${d}T00:00:00-05:00`, fin: `2026-${mes}-${d}T10:00:00-05:00` });
    });
    const lista = prepararLista(vencidos, [], AHORA);
    expect(lista).toHaveLength(MAX_HISTORIAL);
    expect(lista.some((c) => c.id === id(1))).toBe(false); // el más antiguo se fue
    expect(lista.some((c) => c.id === id(MAX_HISTORIAL + 5))).toBe(true);
  });
});

describe("listaAdmin y vigentesPublicos", () => {
  const lista = [
    base({ id: id(1), nivel: "informativo", formato: "barra" }),
    base({ id: id(2), nivel: "urgente", inicio: "2026-10-09T00:00:00-05:00" }),
    base({ id: id(3), nivel: "urgente", inicio: "2026-10-10T08:00:00-05:00" }),
    base({ id: id(4), pausado: true }),
    base({ id: id(5), inicio: "2026-10-20T00:00:00-05:00", fin: "2026-10-25T00:00:00-05:00" }),
    base({ id: id(6), fin: "2026-10-01T00:00:00-05:00", inicio: "2026-09-25T00:00:00-05:00" })
  ].map((c) => ({ ...c, version: 1, actualizadoPor: "x@y.pe", actualizadoEn: "2026-10-01T00:00:00-05:00" }));

  it("el storefront recibe solo los vigentes, urgentes primero y el más reciente antes", () => {
    const publicos = vigentesPublicos(lista, AHORA);
    expect(publicos.map((c) => c.id)).toEqual([id(3), id(2), id(1)]);
    expect(publicos[0].actualizadoPor).toBeUndefined();
    expect(publicos[0].pausado).toBeUndefined();
  });

  it("el admin recibe todos con estado, en curso primero", () => {
    const admin = listaAdmin(lista, AHORA);
    expect(admin.map((c) => c.estado)).toEqual(["activo", "activo", "activo", "programado", "pausado", "vencido"]);
  });
});

describe("schema", () => {
  it("linkSeguro acepta rutas internas y https, rechaza el resto", () => {
    expect(linkSeguro("/paginas/politicas")).toBe(true);
    expect(linkSeguro("https://wa.me/51999")).toBe(true);
    for (const malo of ["javascript:alert(1)", "data:text/html,x", "http://x.pe", "//evil.com", "/\\evil.com", "ftp://x", "x.pe"]) {
      expect(linkSeguro(malo)).toBe(false);
    }
  });

  it("rechaza un botón con javascript: con mensaje en español", () => {
    const r = updateComunicadosSchema.safeParse({ comunicados: [base({ boton: { texto: "Ver", link: "javascript:alert(1)" } })] });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].path).toEqual(["comunicados", 0, "boton", "link"]);
    expect(r.error.issues[0].message).toMatch(/https/);
  });

  it("rechaza ids repetidos y fechas sin zona horaria", () => {
    expect(updateComunicadosSchema.safeParse({ comunicados: [base({ id: id(1) }), base({ id: id(1) })] }).success).toBe(false);
    expect(updateComunicadosSchema.safeParse({ comunicados: [base({ fin: "2026-10-16T00:00" })] }).success).toBe(false);
  });

  it("aplica los valores por defecto", () => {
    const { pausado, afectaCompras, paginas, frecuencia, ...minimo } = base();
    const r = updateComunicadosSchema.parse({ comunicados: [minimo] });
    expect(r.comunicados[0]).toMatchObject({ pausado: false, afectaCompras: false, paginas: "todas", frecuencia: "una_vez" });
  });
});
