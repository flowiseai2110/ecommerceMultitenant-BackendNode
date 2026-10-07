import {
  corteEn, debeEstarHabilitada, enlaceWhatsapp, etapaTransmision, finTransmision, grabacionHasta, hayVideo, mensajeInvitacion,
  minutosADescontar, minutosConsumidos, numeroWhatsapp, periodoTransmision, salaAbreEn, sesionViva
} from "../transmisiones.reglas.js";
import { youtubeVideoId } from "../transmisiones.youtube.js";
import { activarSchema, invitadosSchema } from "../transmisiones.schema.js";
import { eventoSchema } from "../../reservas/reservas.schema.js";

// Cumpleaños de Mateo: sábado 17/10/2026 de 16:00 a 19:00 (hora de Lima).
const inicio = new Date("2026-10-17T16:00:00-05:00");
const funcion = { inicio, fin: new Date("2026-10-17T19:00:00-05:00") };
const sinFin = { inicio, fin: null };
const t = { plan: "basico", estado: "programada", duracionMin: 120 };
const en = (iso) => new Date(iso);

describe("etapaTransmision", () => {
  it("recorre próxima → espera → en vivo → terminada → vencida", () => {
    expect(etapaTransmision(t, funcion, en("2026-10-17T14:59:00-05:00"))).toBe("proxima");
    expect(etapaTransmision(t, funcion, en("2026-10-17T15:00:00-05:00"))).toBe("espera");
    expect(etapaTransmision(t, funcion, en("2026-10-17T16:00:00-05:00"))).toBe("en_vivo");
    expect(etapaTransmision(t, funcion, en("2026-10-17T18:59:00-05:00"))).toBe("en_vivo");
    expect(etapaTransmision(t, funcion, en("2026-10-17T19:00:00-05:00"))).toBe("terminada");
    expect(etapaTransmision(t, funcion, en("2026-11-16T18:59:00-05:00"))).toBe("terminada");
    expect(etapaTransmision(t, funcion, en("2026-11-16T19:00:00-05:00"))).toBe("vencida");
  });

  it("una transmisión cancelada siempre está cancelada", () => {
    expect(etapaTransmision({ ...t, estado: "cancelada" }, funcion, en("2026-10-17T17:00:00-05:00"))).toBe("cancelada");
  });

  it("sin hora de fin, usa la duración indicada (R1.2)", () => {
    expect(finTransmision(t, sinFin)).toEqual(en("2026-10-17T18:00:00-05:00"));
    expect(etapaTransmision(t, sinFin, en("2026-10-17T18:30:00-05:00"))).toBe("terminada");
    expect(finTransmision(t, funcion)).toEqual(funcion.fin);
  });

  it("la sala abre 1 h antes y la grabación del Básico dura 30 días", () => {
    expect(salaAbreEn(funcion)).toEqual(en("2026-10-17T15:00:00-05:00"));
    expect(grabacionHasta(t, funcion)).toEqual(en("2026-11-16T19:00:00-05:00"));
  });
});

describe("WhatsApp de la invitación (R3.5)", () => {
  it("agrega el 51 a un celular peruano y respeta otros formatos", () => {
    expect(numeroWhatsapp("987 654 321")).toBe("51987654321");
    expect(numeroWhatsapp("+34 600 123 456")).toBe("34600123456");
    expect(numeroWhatsapp(null)).toBeNull();
  });

  it("escribe el mensaje con fecha y hora de Lima", () => {
    const texto = mensajeInvitacion({ nombre: "Tía Rosa", evento: "Cumpleaños de Mateo", inicio, enlace: "https://x.pe/t/abc" });
    expect(texto).toMatch(/^Hola Tía Rosa, te invitamos a ver en vivo "Cumpleaños de Mateo" el sábado 17 de octubre a las 4:00/);
    expect(texto).toContain("(hora de Perú). Entra aquí: https://x.pe/t/abc");
  });

  it("sin teléfono, wa.me deja elegir el contacto", () => {
    const url = enlaceWhatsapp({ telefono: null, nombre: "Ana", evento: "Bautizo", inicio, enlace: "https://x.pe/t/1" });
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(enlaceWhatsapp({ telefono: "987654321", nombre: "Ana", evento: "Bautizo", inicio, enlace: "e" }))
      .toMatch(/^https:\/\/wa\.me\/51987654321\?text=/);
  });
});

describe("youtubeVideoId (R2.1)", () => {
  it.each([
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10", "dQw4w9WgXcQ"],
    ["youtube.com/live/dQw4w9WgXcQ?feature=share", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"]
  ])("%s → %s", (url, id) => {
    expect(youtubeVideoId(url)).toBe(id);
  });

  it("rechaza el enlace del canal, otros dominios e ids raros", () => {
    expect(() => youtubeVideoId("https://www.youtube.com/@mitienda/live")).toThrow(/no el de tu canal/);
    expect(() => youtubeVideoId("https://vimeo.com/123")).toThrow();
    expect(() => youtubeVideoId("https://youtu.be/abc")).toThrow(/No pude identificar/);
    expect(() => youtubeVideoId("http://youtu.be/dQw4w9WgXcQ")).toThrow(/https/);
  });
});

describe("schemas", () => {
  const TIENDA = "22222222-2222-4222-8222-222222222222";
  const base = { tiendaId: TIENDA, plan: "basico", youtubeUrl: "https://youtu.be/dQw4w9WgXcQ", anfitrionNombre: "Carla Pérez", consentimiento: true };

  it("activar exige el consentimiento del anfitrión (R9.1)", () => {
    expect(activarSchema.safeParse(base).success).toBe(true);
    const sin = activarSchema.safeParse({ ...base, consentimiento: false });
    expect(sin.success).toBe(false);
    expect(sin.error.issues[0].message).toMatch(/autorizó/);
  });

  it("Premium todavía no está disponible, Privado pide el tope y el Básico pide YouTube", () => {
    expect(activarSchema.safeParse({ ...base, plan: "premium", maxInvitados: 50 }).error.issues[0].message).toMatch(/disponible pronto/);
    expect(activarSchema.safeParse({ ...base, plan: "privado", youtubeUrl: null, maxInvitados: 50 }).success).toBe(true);
    expect(activarSchema.safeParse({ ...base, plan: "privado", maxInvitados: 60 }).error.issues[0].path).toEqual(["maxInvitados"]);
    expect(activarSchema.safeParse({ ...base, youtubeUrl: "" }).error.issues[0].path).toEqual(["youtubeUrl"]);
  });

  it("invitados: nombre obligatorio y teléfono limpio", () => {
    const r = invitadosSchema.parse({ tiendaId: TIENDA, invitados: [{ nombre: " Tía Rosa ", telefono: "987-654 321" }, { nombre: "Tío Juan" }] });
    expect(r.invitados).toEqual([{ nombre: "Tía Rosa", telefono: "987654321" }, { nombre: "Tío Juan", telefono: null }]);
    expect(invitadosSchema.safeParse({ tiendaId: TIENDA, invitados: [{ nombre: "" }] }).success).toBe(false);
    expect(invitadosSchema.safeParse({ tiendaId: TIENDA, invitados: [{ nombre: "X", telefono: "abc" }] }).success).toBe(false);
  });

  it("un evento privado no necesita tipos de entrada; uno público sí", () => {
    const ficha = { tiendaId: TIENDA, funciones: [{ inicio: "2026-10-17T16:00", tipos: [] }] };
    expect(eventoSchema.safeParse({ ...ficha, privado: true }).success).toBe(true);
    const publico = eventoSchema.safeParse(ficha);
    expect(publico.success).toBe(false);
    expect(publico.error.issues[0].message).toMatch(/al menos un tipo de entrada/);
  });
});

describe("plan Privado (Fase 2)", () => {
  const p = { plan: "privado", estado: "programada", duracionMin: 180, factor: 2, terminadaEn: null, pruebaHasta: null };

  it("en vivo hasta el corte (fin + 5 min); sin grabación, al terminar no hay video", () => {
    expect(corteEn(p, funcion)).toEqual(en("2026-10-17T19:05:00-05:00"));
    expect(etapaTransmision(p, funcion, en("2026-10-17T19:03:00-05:00"))).toBe("en_vivo");
    expect(etapaTransmision(p, funcion, en("2026-10-17T19:05:00-05:00"))).toBe("terminada");
    expect(hayVideo(p, "en_vivo")).toBe(true);
    expect(hayVideo(p, "terminada")).toBe(false);
    expect(hayVideo({ plan: "basico" }, "terminada")).toBe(true);
  });

  it("\"Terminar\" antes de tiempo la deja terminada desde ese momento (R6.3)", () => {
    const terminada = { ...p, terminadaEn: en("2026-10-17T17:30:00-05:00") };
    expect(etapaTransmision(terminada, funcion, en("2026-10-17T17:29:00-05:00"))).toBe("en_vivo");
    expect(etapaTransmision(terminada, funcion, en("2026-10-17T17:31:00-05:00"))).toBe("terminada");
  });

  it("la entrada acepta señal solo en la prueba y desde la sala hasta el corte", () => {
    expect(debeEstarHabilitada(p, funcion, en("2026-10-17T14:00:00-05:00"))).toBe(false);
    expect(debeEstarHabilitada({ ...p, pruebaHasta: en("2026-10-17T14:05:00-05:00") }, funcion, en("2026-10-17T14:00:00-05:00"))).toBe(true);
    expect(debeEstarHabilitada(p, funcion, en("2026-10-17T15:00:00-05:00"))).toBe(true);
    expect(debeEstarHabilitada(p, funcion, en("2026-10-17T19:05:00-05:00"))).toBe(false);
    expect(debeEstarHabilitada({ ...p, estado: "cancelada" }, funcion, en("2026-10-17T16:00:00-05:00"))).toBe(false);
    expect(debeEstarHabilitada({ ...p, plan: "basico" }, funcion, en("2026-10-17T16:00:00-05:00"))).toBe(false);
  });

  it("consumo: desde la primera señal (no antes del inicio), con tope en lo contratado + 5 min (R7.1)", () => {
    const conSenal = (iso) => ({ ...p, inicioRealEn: en(iso) });
    expect(minutosConsumidos(p, funcion, en("2026-10-17T19:00:00-05:00"))).toBe(0);
    expect(minutosConsumidos(conSenal("2026-10-17T15:20:00-05:00"), funcion, en("2026-10-17T17:00:00-05:00"))).toBe(60);
    expect(minutosConsumidos(conSenal("2026-10-17T16:10:00-05:00"), funcion, en("2026-10-17T17:00:30-05:00"))).toBe(51);
    expect(minutosConsumidos(conSenal("2026-10-17T16:00:00-05:00"), funcion, en("2026-10-17T23:00:00-05:00"))).toBe(185);
    expect(minutosADescontar(185, 2)).toBe(370);
    expect(minutosADescontar(51, 0.5)).toBe(26);
  });

  it("el mes que se carga es el del inicio en hora de Lima", () => {
    expect(periodoTransmision({ inicio: en("2026-10-31T23:30:00-05:00") })).toBe("2026-10");
    expect(periodoTransmision({ inicio: en("2026-11-01T00:30:00-05:00") })).toBe("2026-11");
  });

  it("una sesión de invitado está viva si dio señal en los últimos 75 s", () => {
    const ahora = en("2026-10-17T17:00:00-05:00");
    expect(sesionViva({ sesionVistaEn: en("2026-10-17T16:59:00-05:00") }, ahora)).toBe(true);
    expect(sesionViva({ sesionVistaEn: en("2026-10-17T16:58:00-05:00") }, ahora)).toBe(false);
    expect(sesionViva({ sesionVistaEn: null }, ahora)).toBe(false);
  });
});
