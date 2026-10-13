import {
  parsearVideo,
  videoLinkSchema,
  metadataConVideo,
  serializeVideoStore,
  serializeVideoAdmin,
  MENSAJE_LINK_INVALIDO
} from "../video.js";

const reconocido = (link) => {
  const v = parsearVideo(link);
  return v && { proveedor: v.proveedor, id: v.id, formato: v.formato };
};

describe("parsearVideo", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "horizontal"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc123", "horizontal"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=30s", "horizontal"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "horizontal"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ?feature=share", "horizontal"],
    ["https://youtube.com/shorts/dQw4w9WgXcQ?feature=share", "vertical"],
    ["youtu.be/dQw4w9WgXcQ", "horizontal"]
  ])("YouTube: %s", (link, formato) => {
    expect(reconocido(link)).toEqual({ proveedor: "youtube", id: "dQw4w9WgXcQ", formato });
  });

  it("Vimeo público y del player", () => {
    expect(reconocido("https://vimeo.com/76979871")).toEqual({ proveedor: "vimeo", id: "76979871", formato: "horizontal" });
    expect(reconocido("https://player.vimeo.com/video/76979871")?.id).toBe("76979871");
  });

  it("TikTok con el link completo", () => {
    expect(reconocido("https://www.tiktok.com/@salonlasbrisas/video/7234567890123456789?is_from_webapp=1"))
      .toEqual({ proveedor: "tiktok", id: "7234567890123456789", formato: "vertical" });
  });

  it("Instagram reel, reels y post", () => {
    expect(reconocido("https://www.instagram.com/reel/C8xYz12AbCd/?igsh=MWQ")).toEqual({ proveedor: "instagram", id: "C8xYz12AbCd", formato: "vertical" });
    expect(reconocido("https://instagram.com/reels/C8xYz12AbCd/")?.id).toBe("C8xYz12AbCd");
    expect(reconocido("https://www.instagram.com/p/C8xYz12AbCd/")?.id).toBe("C8xYz12AbCd");
  });

  it("Facebook watch, videos de página y reel", () => {
    expect(reconocido("https://www.facebook.com/watch/?v=1234567890123")).toEqual({ proveedor: "facebook", id: "1234567890123", formato: "horizontal" });
    expect(reconocido("https://www.facebook.com/salonlasbrisas/videos/1234567890123/")?.id).toBe("1234567890123");
    expect(reconocido("https://m.facebook.com/salonlasbrisas/videos/recorrido-del-salon/1234567890123/")?.id).toBe("1234567890123");
    expect(reconocido("https://www.facebook.com/reel/1234567890123")).toEqual({ proveedor: "facebook", id: "1234567890123", formato: "vertical" });
  });

  it.each([
    "",
    "   ",
    "no es un link",
    "https://vm.tiktok.com/ZMabc123/",
    "https://fb.watch/abc123/",
    "https://www.youtube.com/watch?v=corto",
    "https://www.youtube.com/@canal",
    "https://www.instagram.com/salonlasbrisas/",
    "https://evil.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ",
    "javascript:alert(1)//youtube.com/watch?v=dQw4w9WgXcQ"
  ])("rechaza %p", (link) => {
    expect(parsearVideo(link)).toBeNull();
  });

  it("guarda el link que pegó el dueño, con https", () => {
    expect(parsearVideo("youtu.be/dQw4w9WgXcQ").link).toBe("https://youtu.be/dQw4w9WgXcQ");
  });
});

describe("videoLinkSchema", () => {
  it("vacío o null = quitar el video", () => {
    expect(videoLinkSchema.parse("")).toBeNull();
    expect(videoLinkSchema.parse(null)).toBeNull();
  });

  it("link válido sale reconocido", () => {
    expect(videoLinkSchema.parse("https://youtu.be/dQw4w9WgXcQ")).toMatchObject({ proveedor: "youtube", id: "dQw4w9WgXcQ" });
  });

  it("link no reconocido da el mensaje para el dueño", () => {
    const r = videoLinkSchema.safeParse("https://vm.tiktok.com/ZMabc123/");
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe(MENSAJE_LINK_INVALIDO);
  });
});

describe("metadataConVideo", () => {
  const video = { proveedor: "youtube", id: "dQw4w9WgXcQ", formato: "horizontal", link: "https://youtu.be/dQw4w9WgXcQ" };
  const opciones = [{ nombre: "Talla", tipo: "texto", valores: ["S"] }];

  it("pone el video sin tocar las opciones", () => {
    expect(metadataConVideo({ opciones }, video)).toEqual({ opciones, video });
  });

  it("null quita solo el video", () => {
    expect(metadataConVideo({ opciones, video }, null)).toEqual({ opciones });
  });

  it("parte de vacío si no había metadata", () => {
    expect(metadataConVideo(null, video)).toEqual({ video });
    expect(metadataConVideo([], video)).toEqual({ video });
  });
});

describe("serializeVideoStore / serializeVideoAdmin", () => {
  it("arma el embed desde el proveedor y no expone el link", () => {
    const v = serializeVideoStore({ proveedor: "youtube", id: "dQw4w9WgXcQ", formato: "horizontal", link: "https://youtu.be/dQw4w9WgXcQ" });
    expect(v).toEqual({
      proveedor: "youtube",
      formato: "horizontal",
      embed: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&playsinline=1",
      enlace: null,
      miniatura: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
    });
  });

  it("Instagram no se incrusta: el ▶ abre el reel en Instagram", () => {
    const v = serializeVideoStore({ proveedor: "instagram", id: "DUi_4XTDjj4", formato: "vertical" });
    expect(v).toMatchObject({ embed: null, enlace: "https://www.instagram.com/p/DUi_4XTDjj4/", miniatura: null });
  });

  it("sin miniatura propia (TikTok) la tienda usa la foto del ítem", () => {
    const v = serializeVideoStore({ proveedor: "tiktok", id: "7234567890123456789", formato: "vertical" });
    expect(v.embed).toBe("https://www.tiktok.com/player/v1/7234567890123456789?autoplay=1&rel=0");
    expect(v.miniatura).toBeNull();
  });

  it("descarta lo que no es un video guardado válido", () => {
    expect(serializeVideoStore(undefined)).toBeNull();
    expect(serializeVideoStore({ proveedor: "otro", id: "x" })).toBeNull();
    expect(serializeVideoStore({ proveedor: "youtube", id: "\"><script>" })).toBeNull();
  });

  it("el admin recibe además el link pegado", () => {
    const v = serializeVideoAdmin({ proveedor: "vimeo", id: "76979871", formato: "horizontal", link: "https://vimeo.com/76979871" });
    expect(v.link).toBe("https://vimeo.com/76979871");
    expect(v.embed).toBe("https://player.vimeo.com/video/76979871?autoplay=1");
  });
});
