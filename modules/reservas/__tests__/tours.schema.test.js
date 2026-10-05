import { cotizarSchema, tourSchema } from "../reservas.schema.js";

const TIENDA = "22222222-2222-4222-8222-222222222222";
const ficha = {
  tiendaId: TIENDA,
  diasSalida: [2, 3, 4],
  horasSalida: ["08:00", "10:00"],
  tiposPasajero: [{ nombre: "Adulto", precio: 60 }, { nombre: "Menor de 3", precio: 0 }]
};

describe("tourSchema", () => {
  it("acepta una ficha mínima y completa los defaults", () => {
    const r = tourSchema.parse(ficha);
    expect(r.idiomas).toEqual(["es"]);
    expect(r.incluye).toEqual([]);
    expect(r.itinerario).toEqual([]);
    expect(r.tiposPasajero[0].activo).toBe(true);
  });

  it("exige días y horas de salida válidos", () => {
    expect(tourSchema.safeParse({ ...ficha, diasSalida: [] }).success).toBe(false);
    expect(tourSchema.safeParse({ ...ficha, diasSalida: [0] }).success).toBe(false);
    expect(tourSchema.safeParse({ ...ficha, horasSalida: ["8:00"] }).success).toBe(false);
  });

  it("no admite tipos de pasajero repetidos ni un tour sin ningún precio", () => {
    const repetidos = tourSchema.safeParse({ ...ficha, tiposPasajero: [{ nombre: "Adulto", precio: 60 }, { nombre: "adulto", precio: 50 }] });
    expect(repetidos.success).toBe(false);
    const gratis = tourSchema.safeParse({ ...ficha, tiposPasajero: [{ nombre: "Adulto", precio: 0 }] });
    expect(gratis.success).toBe(false);
  });
});

describe("cotizarSchema", () => {
  it("una cotización de tour no exige modalidad ni adultos", () => {
    const r = cotizarSchema.parse({
      tiendaId: TIENDA, productoId: TIENDA, fecha: "2026-09-26", hora: "08:00",
      pasajeros: [{ tipoId: TIENDA, cantidad: 2 }], idioma: "EN"
    });
    expect(r.modalidadId).toBeNull();
    expect(r.adultos).toBeNull();
    expect(r.idioma).toBe("en");
  });
});
