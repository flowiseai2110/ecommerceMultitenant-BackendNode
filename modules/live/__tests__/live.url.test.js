import { jest } from "@jest/globals";
import {
  normalizeTiktok,
  normalizeYoutube,
  normalizeFacebook,
  normalizarLinks
} from "../live.url.js";

describe("normalizeTiktok", () => {
  it("normaliza un usuario suelto con @", () => {
    expect(normalizeTiktok("@zapateria")).toBe("https://www.tiktok.com/@zapateria/live");
  });

  it("normaliza un usuario suelto sin @", () => {
    expect(normalizeTiktok("zapateria")).toBe("https://www.tiktok.com/@zapateria/live");
  });

  it("acepta punto y guion bajo en el usuario", () => {
    expect(normalizeTiktok("mi.tienda_01")).toBe("https://www.tiktok.com/@mi.tienda_01/live");
  });

  it("extrae el usuario de una URL de tiktok.com", () => {
    expect(normalizeTiktok("https://www.tiktok.com/@zapateria")).toBe(
      "https://www.tiktok.com/@zapateria/live"
    );
  });

  it("extrae el usuario de una URL que ya trae /live", () => {
    expect(normalizeTiktok("https://tiktok.com/@zapateria/live")).toBe(
      "https://www.tiktok.com/@zapateria/live"
    );
  });

  it("acepta URL sin esquema (www.)", () => {
    expect(normalizeTiktok("www.tiktok.com/@zapateria")).toBe(
      "https://www.tiktok.com/@zapateria/live"
    );
  });

  it("rechaza otro dominio", () => {
    expect(() => normalizeTiktok("https://instagram.com/@zapateria")).toThrow(/tiktok\.com/i);
  });

  it("rechaza protocolo no https", () => {
    expect(() => normalizeTiktok("http://www.tiktok.com/@zapateria")).toThrow(/https/i);
  });

  it("rechaza usuario con caracteres inválidos", () => {
    expect(() => normalizeTiktok("mi tienda!")).toThrow(/usuario/i);
  });

  it("rechaza vacío", () => {
    expect(() => normalizeTiktok("")).toThrow();
  });
});

describe("normalizeYoutube", () => {
  it("normaliza watch?v=", () => {
    expect(normalizeYoutube("https://www.youtube.com/watch?v=abc123")).toBe(
      "https://www.youtube.com/watch?v=abc123"
    );
  });

  it("descarta parámetros extra en watch", () => {
    expect(normalizeYoutube("https://www.youtube.com/watch?v=abc123&t=30s&list=xyz")).toBe(
      "https://www.youtube.com/watch?v=abc123"
    );
  });

  it("normaliza youtu.be a watch", () => {
    expect(normalizeYoutube("https://youtu.be/abc123")).toBe(
      "https://www.youtube.com/watch?v=abc123"
    );
  });

  it("conserva /live/ID", () => {
    expect(normalizeYoutube("https://www.youtube.com/live/abc123")).toBe(
      "https://www.youtube.com/live/abc123"
    );
  });

  it("conserva @canal/live", () => {
    expect(normalizeYoutube("https://www.youtube.com/@micanal/live")).toBe(
      "https://www.youtube.com/@micanal/live"
    );
  });

  it("acepta m.youtube.com", () => {
    expect(normalizeYoutube("https://m.youtube.com/watch?v=abc123")).toBe(
      "https://www.youtube.com/watch?v=abc123"
    );
  });

  it("rechaza otro dominio", () => {
    expect(() => normalizeYoutube("https://vimeo.com/123")).toThrow(/YouTube/i);
  });

  it("rechaza http", () => {
    expect(() => normalizeYoutube("http://youtu.be/abc123")).toThrow(/https/i);
  });

  it("rechaza watch sin v=", () => {
    expect(() => normalizeYoutube("https://www.youtube.com/watch")).toThrow();
  });
});

describe("normalizeFacebook", () => {
  it("acepta facebook.com", () => {
    expect(normalizeFacebook("https://facebook.com/mitienda/videos/123")).toBe(
      "https://www.facebook.com/mitienda/videos/123"
    );
  });

  it("normaliza m.facebook.com a www", () => {
    expect(normalizeFacebook("https://m.facebook.com/mitienda")).toBe(
      "https://www.facebook.com/mitienda"
    );
  });

  it("conserva fb.watch", () => {
    expect(normalizeFacebook("https://fb.watch/abc123/")).toBe("https://fb.watch/abc123/");
  });

  it("rechaza otro dominio", () => {
    expect(() => normalizeFacebook("https://twitch.tv/mitienda")).toThrow(/Facebook/i);
  });

  it("rechaza http", () => {
    expect(() => normalizeFacebook("http://facebook.com/mitienda")).toThrow(/https/i);
  });
});

describe("normalizarLinks", () => {
  it("solo procesa las claves presentes", () => {
    const out = normalizarLinks({ tiktokUrl: "@tienda" });
    expect(out).toEqual({ tiktokUrl: "https://www.tiktok.com/@tienda/live" });
  });

  it("un valor vacío o null limpia el link", () => {
    expect(normalizarLinks({ youtubeUrl: "" })).toEqual({ youtubeUrl: null });
    expect(normalizarLinks({ facebookUrl: null })).toEqual({ facebookUrl: null });
  });

  it("normaliza varias plataformas a la vez", () => {
    const out = normalizarLinks({
      tiktokUrl: "tienda",
      youtubeUrl: "https://youtu.be/abc",
      facebookUrl: "https://m.facebook.com/tienda"
    });
    expect(out).toEqual({
      tiktokUrl: "https://www.tiktok.com/@tienda/live",
      youtubeUrl: "https://www.youtube.com/watch?v=abc",
      facebookUrl: "https://www.facebook.com/tienda"
    });
  });

  it("propaga el error de un link inválido", () => {
    expect(() => normalizarLinks({ tiktokUrl: "https://instagram.com/x" })).toThrow();
  });
});
