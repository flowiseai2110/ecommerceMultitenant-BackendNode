import {
  conGrabacion, descargaHasta, grabacionHasta, hayVideo, nombreArchivo, tocaAvisoBorrado, tocaAvisoDescarga
} from "../transmisiones.reglas.js";

// Fase 4 (grabación): reglas puras.
const en = (iso) => new Date(iso);
const funcion = { inicio: en("2026-10-17T16:00:00-05:00"), fin: en("2026-10-17T19:00:00-05:00") };
const p = (extra = {}) => ({
  plan: "privado", estado: "programada", grabar: true, guardarAnio: false, grabacionBorradaEn: null, extensionMin: 0,
  terminadaEn: en("2026-10-17T19:05:00-05:00"), avisoBorradoEn: null, avisoDescargaEn: null, ...extra
});

describe("plazos de la grabación (R8.1)", () => {
  it("30 días en línea y para descargar; con \"Guardar 1 año\", la descarga dura un año", () => {
    expect(grabacionHasta(p(), funcion)).toEqual(en("2026-11-16T19:00:00-05:00"));
    expect(descargaHasta(p(), funcion)).toEqual(en("2026-11-16T19:00:00-05:00"));
    expect(descargaHasta(p({ guardarAnio: true }), funcion)).toEqual(en("2027-10-17T19:00:00-05:00"));
  });

  it("sin grabación: Básico, \"Solo en vivo\", cancelada o ya borrada", () => {
    expect(conGrabacion(p())).toBe(true);
    expect(conGrabacion(p({ plan: "basico" }))).toBe(false);
    expect(conGrabacion(p({ grabar: false }))).toBe(false);
    expect(conGrabacion(p({ estado: "cancelada" }))).toBe(false);
    expect(conGrabacion(p({ grabacionBorradaEn: en("2026-10-20T00:00:00-05:00") }))).toBe(false);
  });
});

describe("avisos 7 días antes de borrar (R8.1.2)", () => {
  it("en línea: desde 7 días antes hasta el borrado, una vez", () => {
    expect(tocaAvisoBorrado(p(), funcion, en("2026-11-09T18:59:00-05:00"))).toBe(false);
    expect(tocaAvisoBorrado(p(), funcion, en("2026-11-09T19:00:00-05:00"))).toBe(true);
    expect(tocaAvisoBorrado(p({ avisoBorradoEn: en("2026-11-09T19:00:00-05:00") }), funcion, en("2026-11-10T00:00:00-05:00"))).toBe(false);
    expect(tocaAvisoBorrado(p(), funcion, en("2026-11-16T19:00:00-05:00"))).toBe(false);
  });

  it("descarga de un año: solo con \"Guardar 1 año\"", () => {
    expect(tocaAvisoDescarga(p(), funcion, en("2027-10-12T00:00:00-05:00"))).toBe(false);
    expect(tocaAvisoDescarga(p({ guardarAnio: true }), funcion, en("2027-10-12T00:00:00-05:00"))).toBe(true);
  });
});

describe("video en la página del invitado", () => {
  it("Privado terminado: solo si hay grabación lista; Básico: la de YouTube", () => {
    expect(hayVideo(p(), "terminada")).toBe(false);
    expect(hayVideo(p(), "terminada", { hayGrabacion: true })).toBe(true);
    expect(hayVideo(p(), "en_vivo")).toBe(true);
    expect(hayVideo({ plan: "basico" }, "terminada")).toBe(true);
  });
});

describe("nombreArchivo", () => {
  it("sin tildes ni símbolos, y con la parte si hay varias", () => {
    expect(nombreArchivo("Cumpleaños de Mateo 🎉", 1, 1)).toBe("cumpleanos-de-mateo.mp4");
    expect(nombreArchivo("Boda de Lucía & Diego", 2, 3)).toBe("boda-de-lucia-diego-parte-2.mp4");
    expect(nombreArchivo("!!!", 1, 1)).toBe("grabacion.mp4");
  });
});
