// docs/specs/campanas-cuando R8: validaciones de sentido común al guardar.
import { errorDeSentido } from "../sentido.js";

const lima = (texto) => new Date(`${texto}:00-05:00`);
const ahora = lima("2026-10-20T12:00");
const id = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const propia = (extra = {}) => ({ id: id(1), presetId: null, activa: true, nombre: "Aniversario", inicio: "2026-11-25", fin: "2026-11-28", ...extra });
const bf = (extra = {}) => ({ id: id(2), presetId: "black-friday", activa: true, ...extra });
const cm = (extra = {}) => ({ id: id(3), presetId: "cyber-monday", activa: true, ...extra });

describe("errorDeSentido (R8)", () => {
  it("R8.1 una activa que ya terminó (año equivocado) se rechaza", () => {
    const e = errorDeSentido([propia({ inicio: "2025-10-01", fin: "2025-10-05" })], [], ahora);
    expect(e).toMatch(/ya terminó el 5 oct 2025/);
  });

  it("R8.1 apagada o sin tocar no bloquea", () => {
    const vieja = propia({ inicio: "2025-10-01", fin: "2025-10-05" });
    expect(errorDeSentido([{ ...vieja, activa: false }], [], ahora)).toBeNull();
    expect(errorDeSentido([vieja], [vieja], ahora)).toBeNull();
  });

  it("R8.2 empieza en más de un año", () => {
    expect(errorDeSentido([propia({ inicio: "2062-11-25", fin: "2062-11-28" })], [], ahora)).toMatch(/más de un año/);
    expect(errorDeSentido([propia({ inicio: "2027-01-01", fin: "2027-01-05" })], [], ahora)).toBeNull();
  });

  it("R8.3 el uso termina antes de que empiece la campaña", () => {
    expect(errorDeSentido([propia({ uso: { hasta: "2026-11-20" } })], [], ahora)).toMatch(/terminan antes de que empiece/);
  });

  it("R8.4 el uso ya pasó", () => {
    const c = propia({ inicio: "2026-10-15", fin: "2026-10-25", uso: { hasta: "2026-10-18" } });
    expect(errorDeSentido([c], [], ahora)).toMatch(/fechas de uso .* ya pasaron/);
  });

  it("R8.5 una propia que se cruza con Black Friday se rechaza, con el rango del cruce", () => {
    expect(errorDeSentido([propia(), bf()], [bf()], ahora)).toMatch(/Aniversario se cruza con Black Friday del 25 nov 2026 al 28 nov 2026/);
  });

  it("R8.5 activar Black Friday sobre una propia ya guardada también se rechaza", () => {
    expect(errorDeSentido([propia(), bf()], [propia()], ahora)).toMatch(/Black Friday se cruza con Aniversario/);
  });

  it("R8.5 los cruces del catálogo se permiten (Black Friday con Cyber Monday)", () => {
    expect(errorDeSentido([bf(), cm()], [], ahora)).toBeNull();
  });

  it("R8.5 'Mis fechas' cuenta como fechas de la tienda", () => {
    const wow = { id: id(4), presetId: "cyber-wow", activa: true, inicio: "2026-11-26", fin: "2026-11-27" };
    expect(errorDeSentido([wow, bf()], [bf()], ahora)).toMatch(/se cruza con Black Friday/);
  });

  it("sin cruce ni errores, null", () => {
    expect(errorDeSentido([propia({ inicio: "2026-12-10", fin: "2026-12-12" }), bf()], [], ahora)).toBeNull();
  });
});

describe("errorDeSentido: fechas de uso ocultas (R1.11)", () => {
  it("un uso ya guardado que no cambia no bloquea otros cambios de la campaña", () => {
    const antes = propia({ inicio: "2026-10-15", fin: "2026-10-25", uso: { hasta: "2026-10-18" } });
    const ahoraEditada = { ...antes, horaFin: "20:00" };
    expect(errorDeSentido([ahoraEditada], [antes], ahora)).toBeNull();
  });
});
