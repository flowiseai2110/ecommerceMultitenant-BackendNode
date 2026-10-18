import { jest } from "@jest/globals";

// Filtro automático por tienda de config/prisma.js (docs/specs/antipatrones A1.4,
// A1.7). Se prueba la extensión real: el $extends del cliente falso devuelve la
// definición, y su hook se llama como lo haría Prisma.

jest.unstable_mockModule("../../../generated/prisma/client.ts", () => ({
  Prisma: {},
  PrismaClient: class {
    $on() {}
    $extends(definicion) { return definicion; }
  }
}));
jest.unstable_mockModule("@prisma/adapter-pg", () => ({ PrismaPg: class {} }));

const { prisma, conScopeDeTienda } = await import("../../../config/prisma.js");
const { runWithTenantContext, setContextTiendaId, runUnscoped } = await import("../tenant-store.js");

const A = "aaaaaaaa-0000-0000-0000-00000000000a";
const B = "bbbbbbbb-0000-0000-0000-00000000000b";
const ID = "11111111-0000-0000-0000-000000000001";

/** Lo que la extensión le pasa a Prisma para `model.operation(args)`. */
const hook = (model, operation, args) =>
  prisma.query.$allModels.$allOperations({ model, operation, args, query: async (a) => a });

/** Corre `fn` con la tienda `tiendaId` en el contexto, como tras requireTiendaAccess. */
const enTienda = (tiendaId, fn) =>
  new Promise((resolve, reject) => runWithTenantContext(() => {
    setContextTiendaId(tiendaId);
    Promise.resolve(fn()).then(resolve, reject);
  }));

describe("auto-scope por tienda", () => {
  describe("tests negativos: con la tienda A en el contexto, un registro de B no se alcanza por id", () => {
    const modelos = ["pedidos", "pagos", "clientes", "reservas", "hotel_cobros", "hotel_caja_movimientos", "transmision_movimientos"];

    test.each(modelos)("%s: findUnique, update y delete por id llevan la tienda A", async (modelo) => {
      await enTienda(A, async () => {
        for (const operation of ["findUnique", "findUniqueOrThrow", "update", "delete"]) {
          const args = await hook(modelo, operation, { where: { id: ID }, ...(operation === "update" ? { data: { x: 1 } } : {}) });
          // La clave queda en la raíz (Prisma lo exige) y la tienda va en AND.
          expect(args.where).toEqual({ id: ID, AND: [{ tiendaId: A }] });
        }
      });
    });

    test("pedir a propósito la tienda B no amplía: se suma la condición de A", async () => {
      await enTienda(A, async () => {
        const args = await hook("pedidos", "findMany", { where: { tiendaId: B } });
        expect(args.where).toEqual({ AND: [{ tiendaId: B }, { tiendaId: A }] });
      });
    });

    test("clave compuesta con la tienda B: se suma la condición de A", async () => {
      await enTienda(A, async () => {
        const args = await hook("tienda_configuraciones", "findUnique", { where: { uq_tienda_clave: { tiendaId: B, clave: "x" } } });
        expect(args.where).toEqual({ uq_tienda_clave: { tiendaId: B, clave: "x" }, AND: [{ tiendaId: A }] });
      });
    });
  });

  test("upsert por clave lleva la tienda", async () => {
    await enTienda(A, async () => {
      const args = await hook("avisos_live", "upsert", { where: { tiendaId: A }, create: { tiendaId: A }, update: {} });
      expect(args.where).toEqual({ tiendaId: A, AND: [{ tiendaId: A }] });
      expect(args.create).toEqual({ tiendaId: A });
    });
  });

  test("conserva un AND que ya traía el where", async () => {
    await enTienda(A, async () => {
      const arreglo = await hook("pedidos", "update", { where: { id: ID, AND: [{ estado: "x" }] }, data: {} });
      expect(arreglo.where).toEqual({ id: ID, AND: [{ estado: "x" }, { tiendaId: A }] });
      const objeto = await hook("pedidos", "delete", { where: { id: ID, AND: { estado: "x" } } });
      expect(objeto.where).toEqual({ id: ID, AND: [{ estado: "x" }, { tiendaId: A }] });
    });
  });

  test("lecturas y operaciones masivas, con y sin where", async () => {
    await enTienda(A, async () => {
      for (const operation of ["findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy", "updateMany", "updateManyAndReturn", "deleteMany"]) {
        expect((await hook("hotel_estadias", operation, { where: { estado: "en_curso" } })).where)
          .toEqual({ AND: [{ estado: "en_curso" }, { tiendaId: A }] });
      }
      expect((await hook("hotel_estadias", "findMany", {})).where).toEqual({ tiendaId: A });
      expect((await hook("hotel_estadias", "count", undefined)).where).toEqual({ tiendaId: A });
    });
  });

  test("las tablas que antes quedaban fuera ahora llevan filtro", async () => {
    await enTienda(A, async () => {
      for (const modelo of ["hotel_habitaciones", "transmision_paquetes", "zonas_envio", "evento_entradas", "tienda_textos"]) {
        expect((await hook(modelo, "findMany", {})).where).toEqual({ tiendaId: A });
      }
    });
  });

  test("create no se toca", async () => {
    await enTienda(A, async () => {
      const args = { data: { tiendaId: A, nombre: "x" } };
      expect(await hook("categorias", "create", args)).toBe(args);
      expect(await hook("categorias", "createMany", args)).toBe(args);
    });
  });

  test("los modelos global y los que no son de tienda no se tocan", async () => {
    await enTienda(A, async () => {
      for (const modelo of ["usuario_tiendas", "invitaciones", "tiendas", "producto_variantes"]) {
        const args = { where: { id: ID } };
        expect(await hook(modelo, "findUnique", args)).toBe(args);
      }
    });
  });

  test("sin tienda en el contexto (webhooks, jobs) no se toca", async () => {
    const args = { where: { id: ID } };
    expect(await hook("pedidos", "findUnique", args)).toBe(args);
    await new Promise((resolve) => runWithTenantContext(async () => {
      expect(await hook("pedidos", "findMany", args)).toBe(args);
      resolve();
    }));
  });

  test("runUnscoped desactiva el filtro solo dentro de fn", async () => {
    await enTienda(A, async () => {
      const args = { where: { id: ID } };
      expect(await runUnscoped(() => hook("pedidos", "findUnique", args))).toBe(args);
      expect((await hook("pedidos", "findUnique", args)).where).toEqual({ id: ID, AND: [{ tiendaId: A }] });
    });
  });

  test("el nombre del modelo no distingue mayúsculas", () => {
    expect(conScopeDeTienda("Pedidos", "findMany", {}, { tiendaId: A, bypass: false }).where).toEqual({ tiendaId: A });
  });
});
