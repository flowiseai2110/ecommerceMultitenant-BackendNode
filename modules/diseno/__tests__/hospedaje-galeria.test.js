import { fotosAjenas, prefijoFotosDiseno, seccionesSchema, tiposPermitidos } from "../secciones.schema.js";

// docs/specs/hospedaje-completo B7: foto propia en "imagen y texto" y sección galería.
const PREFIJO = prefijoFotosDiseno("https://img.test/", "t1");
const foto = (n) => ({ url: `${PREFIJO}${n}.webp`, pie: null });
const hero = { id: "hero", tipo: "hero", variante: "imagen-completa" };
const galeria = (extra = {}) => ({ id: "galeria", tipo: "galeria", variante: "mosaico", fondo: "superficie", titulo: "El lugar", fotos: [], ...extra });

describe("sección galería", () => {
  it("está disponible para los negocios de reservas, no para productos", () => {
    expect(tiposPermitidos("hotel")).toContain("galeria");
    expect(tiposPermitidos("tours")).toContain("galeria");
    expect(tiposPermitidos("productos")).not.toContain("galeria");
  });

  it("oculta puede no tener fotos; visible necesita al menos 3", () => {
    expect(seccionesSchema.safeParse([hero, galeria({ oculto: true })]).success).toBe(true);
    const r = seccionesSchema.safeParse([hero, galeria({ fotos: [foto(1), foto(2)] })]);
    expect(r.success).toBe(false);
    expect(r.error.issues[0].path).toEqual([1, "fotos"]);
    expect(seccionesSchema.safeParse([hero, galeria({ fotos: [foto(1), foto(2), foto(3)] })]).success).toBe(true);
  });

  it("imagen y texto con foto propia exige la foto", () => {
    const it = { id: "it", tipo: "imagen-texto", fondo: "superficie", imagen: "propia", posicionImagen: "izquierda", titulo: "T", texto: "x" };
    expect(seccionesSchema.safeParse([hero, it]).success).toBe(false);
    expect(seccionesSchema.safeParse([hero, { ...it, imagenUrl: foto(1).url }]).success).toBe(true);
  });
});

describe("fotosAjenas", () => {
  it("rechaza fotos fuera de la carpeta de diseño de la tienda", () => {
    const secciones = [
      hero,
      { id: "it", tipo: "imagen-texto", imagen: "propia", imagenUrl: "https://otro.com/x.jpg" },
      galeria({ fotos: [foto(1), { url: `${PREFIJO}../../t2/diseno/x.webp` }] })
    ];
    expect(Object.keys(fotosAjenas(secciones, PREFIJO))).toEqual([
      "estructura.home.secciones.1.imagenUrl", "estructura.home.secciones.2.fotos"
    ]);
    expect(fotosAjenas([hero, galeria({ fotos: [foto(1)] })], PREFIJO)).toEqual({});
  });
});
