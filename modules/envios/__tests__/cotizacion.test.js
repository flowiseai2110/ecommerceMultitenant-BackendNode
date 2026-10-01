import { resolverZona, cotizarMetodo } from "../cotizacion.js";

// Almacén en Lima: delivery propio solo dentro de Lima Metropolitana + Callao.
const MIRAFLORES = "150122";
const CARABAYLLO = "150106";
const CALLAO = "070101";
const TACNA = "230101";
const CAJAMARCA = "060101";

const zonasDelivery = [
  { nombre: "Lima Centro", costo: 8, diasMin: 1, diasMax: 2, ubigeos: [MIRAFLORES, "150131"], orden: 0 },
  { nombre: "Lima Metro", costo: 12, ubigeos: ["1501"], orden: 1 },
  { nombre: "Callao", costo: 15, ubigeos: ["0701"], orden: 2 }
];

const zonasCourier = [
  { nombre: "Lima", costo: 10, ubigeos: ["15"], orden: 0 },
  { nombre: "Provincias", costo: 18, diasMin: 3, diasMax: 5, ubigeos: ["*"], orden: 1 }
];

const delivery = { id: "d1", tipo: "delivery_propio", costoReferencial: null, fueraDeZona: "no_disponible", pagoEnDestino: false };
const courier = { id: "c1", tipo: "courier", costoReferencial: 15, fueraDeZona: "coordinar", pagoEnDestino: false };

describe("resolverZona", () => {
  it("gana el prefijo más específico (distrito sobre provincia)", () => {
    expect(resolverZona(zonasDelivery, MIRAFLORES).nombre).toBe("Lima Centro");
    expect(resolverZona(zonasDelivery, CARABAYLLO).nombre).toBe("Lima Metro");
  });

  it("'*' cubre todo el país pero pierde ante cualquier prefijo que coincida", () => {
    expect(resolverZona(zonasCourier, TACNA).nombre).toBe("Provincias");
    expect(resolverZona(zonasCourier, MIRAFLORES).nombre).toBe("Lima");
  });

  it("devuelve null si ninguna zona cubre el destino", () => {
    expect(resolverZona(zonasDelivery, TACNA)).toBeNull();
  });
});

describe("cotizarMetodo", () => {
  it("delivery propio con tarifa de su zona", () => {
    const r = cotizarMetodo(delivery, zonasDelivery, { ubigeo: CALLAO });
    expect(r).toMatchObject({ disponible: true, modo: "fijo", costo: 15, zona: "Callao" });
  });

  it("el delivery propio desde Lima NO llega a Tacna (fuera de zona → no disponible)", () => {
    expect(cotizarMetodo(delivery, zonasDelivery, { ubigeo: TACNA }).disponible).toBe(false);
  });

  it("el courier sí llega a Tacna con la tarifa de provincias", () => {
    const r = cotizarMetodo(courier, zonasCourier, { ubigeo: TACNA });
    expect(r).toMatchObject({ disponible: true, modo: "fijo", costo: 18, diasMin: 3, diasMax: 5 });
  });

  it("fuera de zona con 'coordinar' queda por WhatsApp con el costo referencial", () => {
    const soloLima = [{ nombre: "Lima", costo: 10, ubigeos: ["15"], orden: 0 }];
    const r = cotizarMetodo(courier, soloLima, { ubigeo: CAJAMARCA });
    expect(r).toMatchObject({ disponible: true, modo: "coordinar", costo: 0, costoReferencial: 15 });
  });

  it("sin zonas configuradas mantiene el comportamiento anterior (coordinar)", () => {
    const r = cotizarMetodo(delivery, [], { ubigeo: TACNA });
    expect(r).toMatchObject({ disponible: true, modo: "coordinar", costo: 0 });
  });

  it("sin destino todavía no oculta el método aunque sea 'no_disponible'", () => {
    expect(cotizarMetodo(delivery, zonasDelivery, {}).disponible).toBe(true);
  });

  it("envío gratis desde el mínimo de la tienda", () => {
    const r = cotizarMetodo(courier, zonasCourier, { ubigeo: TACNA, subtotal: 300, envioGratisMinimo: 299 });
    expect(r).toMatchObject({ modo: "gratis", costo: 0, costoReferencial: 18 });
  });

  it("pago en destino: no suma al total y muestra lo que se pagará al courier", () => {
    const r = cotizarMetodo({ ...courier, pagoEnDestino: true }, zonasCourier, { ubigeo: TACNA });
    expect(r).toMatchObject({ modo: "destino", costo: 0, costoReferencial: 18 });
  });

  it("recojo en tienda siempre es gratis", () => {
    const r = cotizarMetodo({ id: "r1", tipo: "recojo_tienda" }, [], { ubigeo: TACNA });
    expect(r).toMatchObject({ disponible: true, modo: "gratis", costo: 0 });
  });

  it("acepta costos Decimal de Prisma (llegan como objeto/string)", () => {
    const zonas = [{ nombre: "Lima", costo: "9.90", ubigeos: ["15"], orden: 0 }];
    expect(cotizarMetodo(courier, zonas, { ubigeo: MIRAFLORES }).costo).toBe(9.9);
  });
});
