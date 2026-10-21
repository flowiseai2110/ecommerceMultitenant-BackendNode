import { A, B, C, ID, NO_EXISTE } from "./crud.fixtures.js";

/**
 * Comportamiento fijado de los CRUD del catálogo (docs/specs/antipatrones A7.3):
 * mismas rutas, códigos y respuestas que antes de `crearCrud`, incluidos 403, 404,
 * 409, 400 y la paginación. `esperado` es [status, code].
 *
 * `sinCampos`: un PUT con `{}` es 400, salvo donde el schema de edición tiene
 * defaults (orden 0, activo true) que cuentan como campos: ahí es 200 y pisa esos
 * valores. Es así desde antes; anotado como pendiente en cambios.md.
 */

const T = (q = "") => `?tiendaId=${A}${q}`;

/** Recurso con columna tiendaId propia: categorías, marcas, atributos. */
function propio({ base, a, a2, b, crear, editar, duplicado, filtro, sinCampos = 400 }) {
  return [
    // Listado (con paginación, filtro, búsqueda y orden)
    { caso: "lista la tienda", ruta: `${base}${T()}`, usuario: "vic", esperado: [200, "LIST"] },
    { caso: "pagina", ruta: `${base}${T("&page=2&limit=1")}`, usuario: "vic", esperado: [200, "LIST"] },
    { caso: "filtra", ruta: `${base}${T(`&${filtro}`)}`, usuario: "ana", esperado: [200, "LIST"] },
    { caso: "busca", ruta: `${base}${T("&search=o")}`, usuario: "ana", esperado: [200, "LIST"] },
    { caso: "ordena", ruta: `${base}${T("&orderBy=nombre:desc")}`, usuario: "ana", esperado: [200, "LIST"] },
    { caso: "orden no permitido cae al de siempre", ruta: `${base}${T("&orderBy=usuarioRegistro:desc")}`, usuario: "ana", esperado: [200, "LIST"] },
    { caso: "lista sin tienda", ruta: base, usuario: "ana", esperado: [403, "FORBIDDEN"] },
    { caso: "lista otra tienda", ruta: `${base}?tiendaId=${B}`, usuario: "ana", esperado: [403, "FORBIDDEN"] },
    { caso: "lista sin sesión", ruta: `${base}${T()}`, esperado: [401, "UNAUTHORIZED"] },
    { caso: "página inválida", ruta: `${base}${T("&page=abc")}`, usuario: "ana", esperado: [400, "VALIDATION_ERROR"] },
    // Detalle
    { caso: "ve la suya", ruta: `${base}/${a}${T()}`, usuario: "vic", esperado: [200, "FOUND"] },
    { caso: "ve la suya sin tiendaId", ruta: `${base}/${a}`, usuario: "vic", esperado: [200, "FOUND"] },
    { caso: "ve otra tienda", ruta: `${base}/${b}`, usuario: "ana", esperado: [403, "FORBIDDEN"] },
    { caso: "ve otra tienda con la suya en la query", ruta: `${base}/${b}${T()}`, usuario: "ana", esperado: [403, "FORBIDDEN"] },
    { caso: "miembro de las dos abre un link de la otra", ruta: `${base}/${b}${T()}`, usuario: "doble", esperado: [200, "FOUND"] },
    { caso: "ve uno que no existe", ruta: `${base}/${NO_EXISTE}${T()}`, usuario: "ana", esperado: [404, "NOT_FOUND"] },
    { caso: "ve uno que no existe sin tienda", ruta: `${base}/${NO_EXISTE}`, usuario: "ana", esperado: [403, "FORBIDDEN"] },
    { caso: "id inválido", ruta: `${base}/no-es-uuid${T()}`, usuario: "ana", esperado: [400, "VALIDATION_ERROR"] },
    // Crear
    { caso: "crea", metodo: "POST", ruta: base, usuario: "edu", body: { tiendaId: A, ...crear }, esperado: [201, "CREATED"] },
    { caso: "viewer no crea", metodo: "POST", ruta: base, usuario: "vic", body: { tiendaId: A, ...crear }, esperado: [403, "FORBIDDEN"] },
    { caso: "crea en otra tienda", metodo: "POST", ruta: base, usuario: "ana", body: { tiendaId: B, ...crear }, esperado: [403, "FORBIDDEN"] },
    { caso: "crea sin tienda", metodo: "POST", ruta: base, usuario: "ana", body: crear, esperado: [403, "FORBIDDEN"] },
    { caso: "crea sin nombre", metodo: "POST", ruta: base, usuario: "edu", body: { tiendaId: A, ...crear, nombre: "" }, esperado: [400, "VALIDATION_ERROR"] },
    ...(duplicado ? [{ caso: "crea duplicado", metodo: "POST", ruta: base, usuario: "edu", body: { tiendaId: A, ...crear, ...duplicado }, esperado: [409, "DUPLICATE_RECORD"] }] : []),
    // Editar
    { caso: "edita", metodo: "PUT", ruta: `${base}/${a}`, usuario: "edu", body: editar, esperado: [200, "UPDATED"] },
    { caso: "edita con la tienda en la query", metodo: "PUT", ruta: `${base}/${a}${T()}`, usuario: "edu", body: editar, esperado: [200, "UPDATED"] },
    { caso: "viewer no edita", metodo: "PUT", ruta: `${base}/${a}`, usuario: "vic", body: editar, esperado: [403, "FORBIDDEN"] },
    { caso: "edita otra tienda", metodo: "PUT", ruta: `${base}/${b}`, usuario: "ana", body: editar, esperado: [403, "FORBIDDEN"] },
    { caso: "edita otra tienda con la suya en la query", metodo: "PUT", ruta: `${base}/${b}${T()}`, usuario: "ana", body: editar, esperado: [404, "NOT_FOUND"] },
    { caso: "edita uno que no existe", metodo: "PUT", ruta: `${base}/${NO_EXISTE}`, usuario: "ana", body: editar, esperado: [403, "FORBIDDEN"] },
    { caso: "edita uno que no existe con tienda", metodo: "PUT", ruta: `${base}/${NO_EXISTE}${T()}`, usuario: "ana", body: editar, esperado: [404, "NOT_FOUND"] },
    // Los defaults del schema (orden 0, activo true) cuentan como campos: no es 400 (ver cambios.md, pendiente)
    { caso: "edita sin campos", metodo: "PUT", ruta: `${base}/${a}`, usuario: "edu", body: {}, esperado: [sinCampos, sinCampos === 400 ? "VALIDATION_ERROR" : "UPDATED"] },
    ...(duplicado ? [{ caso: "edita a un slug que ya existe", metodo: "PUT", ruta: `${base}/${a2}`, usuario: "edu", body: duplicado, esperado: [409, "DUPLICATE_RECORD"] }] : []),
    // Borrar
    { caso: "editor no borra", metodo: "DELETE", ruta: `${base}/${a}`, usuario: "edu", esperado: [403, "FORBIDDEN"] },
    { caso: "borra", metodo: "DELETE", ruta: `${base}/${a}`, usuario: "ana", esperado: [200, "DELETED"] },
    { caso: "borra otra tienda", metodo: "DELETE", ruta: `${base}/${b}`, usuario: "ana", esperado: [403, "FORBIDDEN"] },
    { caso: "borra otra tienda con la suya en la query", metodo: "DELETE", ruta: `${base}/${b}${T()}`, usuario: "ana", esperado: [404, "NOT_FOUND"] },
    { caso: "borra uno que no existe", metodo: "DELETE", ruta: `${base}/${NO_EXISTE}${T()}`, usuario: "ana", esperado: [404, "NOT_FOUND"] },
    { caso: "borra con id inválido", metodo: "DELETE", ruta: `${base}/no-es-uuid${T()}`, usuario: "ana", esperado: [400, "VALIDATION_ERROR"] }
  ];
}

/** Recurso que hereda la tienda del producto: variantes, imágenes. */
function hijo({ base, a, b, crear, editar, filtro, sinCampos = 400 }) {
  return [
    { caso: "lista la tienda", ruta: `${base}${T()}`, usuario: "vic", esperado: [200, "LIST"] },
    { caso: "pagina", ruta: `${base}${T("&page=1&limit=1")}`, usuario: "vic", esperado: [200, "LIST"] },
    { caso: "filtra", ruta: `${base}${T(`&${filtro}`)}`, usuario: "ana", esperado: [200, "LIST"] },
    { caso: "lista sin tienda", ruta: base, usuario: "ana", esperado: [403, "FORBIDDEN"] },
    { caso: "lista otra tienda", ruta: `${base}?tiendaId=${B}`, usuario: "ana", esperado: [403, "FORBIDDEN"] },
    { caso: "lista sin sesión", ruta: `${base}${T()}`, esperado: [401, "UNAUTHORIZED"] },
    { caso: "ve la suya", ruta: `${base}/${a}`, usuario: "vic", esperado: [200, "FOUND"] },
    { caso: "ve otra tienda", ruta: `${base}/${b}`, usuario: "ana", esperado: [403, "FORBIDDEN"] },
    { caso: "ve otra tienda con la suya en la query", ruta: `${base}/${b}${T()}`, usuario: "ana", esperado: [403, "FORBIDDEN"] },
    { caso: "miembro de las dos abre un link de la otra", ruta: `${base}/${b}${T()}`, usuario: "doble", esperado: [200, "FOUND"] },
    { caso: "ve uno que no existe", ruta: `${base}/${NO_EXISTE}${T()}`, usuario: "ana", esperado: [404, "NOT_FOUND"] },
    { caso: "ve uno que no existe sin tienda", ruta: `${base}/${NO_EXISTE}`, usuario: "ana", esperado: [403, "FORBIDDEN"] },
    { caso: "id inválido", ruta: `${base}/no-es-uuid${T()}`, usuario: "ana", esperado: [400, "VALIDATION_ERROR"] },
    { caso: "crea", metodo: "POST", ruta: base, usuario: "edu", body: { productoId: ID.prodA, ...crear }, esperado: [201, "CREATED"] },
    { caso: "viewer no crea", metodo: "POST", ruta: base, usuario: "vic", body: { productoId: ID.prodA, ...crear }, esperado: [403, "FORBIDDEN"] },
    { caso: "crea en un producto de otra tienda", metodo: "POST", ruta: base, usuario: "ana", body: { productoId: ID.prodB, ...crear }, esperado: [403, "FORBIDDEN"] },
    { caso: "crea en un producto que no existe", metodo: "POST", ruta: base, usuario: "ana", body: { productoId: NO_EXISTE, ...crear }, esperado: [403, "FORBIDDEN"] },
    { caso: "crea con datos inválidos", metodo: "POST", ruta: base, usuario: "edu", body: { productoId: ID.prodA }, esperado: [400, "VALIDATION_ERROR"] },
    { caso: "edita", metodo: "PUT", ruta: `${base}/${a}`, usuario: "edu", body: editar, esperado: [200, "UPDATED"] },
    { caso: "viewer no edita", metodo: "PUT", ruta: `${base}/${a}`, usuario: "vic", body: editar, esperado: [403, "FORBIDDEN"] },
    { caso: "edita otra tienda", metodo: "PUT", ruta: `${base}/${b}`, usuario: "ana", body: editar, esperado: [403, "FORBIDDEN"] },
    { caso: "edita uno que no existe", metodo: "PUT", ruta: `${base}/${NO_EXISTE}`, usuario: "ana", body: editar, esperado: [403, "FORBIDDEN"] },
    { caso: "edita uno que no existe con tienda", metodo: "PUT", ruta: `${base}/${NO_EXISTE}${T()}`, usuario: "ana", body: editar, esperado: [404, "RECORD_NOT_FOUND"] },
    { caso: "edita sin campos", metodo: "PUT", ruta: `${base}/${a}`, usuario: "edu", body: {}, esperado: [sinCampos, sinCampos === 400 ? "VALIDATION_ERROR" : "UPDATED"] },
    { caso: "editor no borra", metodo: "DELETE", ruta: `${base}/${a}`, usuario: "edu", esperado: [403, "FORBIDDEN"] },
    { caso: "borra", metodo: "DELETE", ruta: `${base}/${a}`, usuario: "ana", esperado: [200, "DELETED"] },
    { caso: "borra otra tienda", metodo: "DELETE", ruta: `${base}/${b}`, usuario: "ana", esperado: [403, "FORBIDDEN"] },
    { caso: "borra uno que no existe", metodo: "DELETE", ruta: `${base}/${NO_EXISTE}${T()}`, usuario: "ana", esperado: [404, "NOT_FOUND"] },
    { caso: "borra con id inválido", metodo: "DELETE", ruta: `${base}/no-es-uuid${T()}`, usuario: "ana", esperado: [400, "VALIDATION_ERROR"] }
  ];
}

const IMG = "/admin/producto-imagenes";

export const CASOS = {
  categorias: propio({
    base: "/admin/categorias", a: ID.catA, a2: ID.catA2, b: ID.catB,
    crear: { nombre: "Casacas", slug: "casacas" }, editar: { nombre: "Polos nuevos" },
    duplicado: { slug: "polos" }, filtro: "activo=false", sinCampos: 200
  }),
  marcas: [
    ...propio({
      base: "/admin/marcas", a: ID.marA, b: ID.marB,
      crear: { nombre: "Adidas", slug: "adidas" }, editar: { nombre: "Nike Pro" },
      filtro: "activo=true"
    }),
    { caso: "edita a un slug que ya existe", metodo: "PUT", ruta: `/admin/marcas/${ID.marA}`, usuario: "edu", body: { slug: "nike" }, esperado: [200, "UPDATED"] },
    { caso: "crea duplicado", metodo: "POST", ruta: "/admin/marcas", usuario: "edu", body: { tiendaId: A, nombre: "Nike", slug: "NIKE" }, esperado: [409, "DUPLICATE_RECORD"] },
    // Capacidad `marcas`: solo al listar y al crear (igual que antes)
    { caso: "lista sin la capacidad", ruta: `/admin/marcas?tiendaId=${C}`, usuario: "ana", esperado: [400, "VALIDATION_ERROR"] },
    { caso: "crea sin la capacidad", metodo: "POST", ruta: "/admin/marcas", usuario: "ana", body: { tiendaId: C, nombre: "X", slug: "x" }, esperado: [400, "VALIDATION_ERROR"] },
    { caso: "sin la capacidad, primero la capacidad y después la entrada", metodo: "POST", ruta: "/admin/marcas", usuario: "ana", body: { tiendaId: C, nombre: "" }, esperado: [400, "VALIDATION_ERROR"] },
    { caso: "ve sin la capacidad", ruta: `/admin/marcas/${ID.marC}`, usuario: "ana", esperado: [200, "FOUND"] },
    { caso: "edita sin la capacidad", metodo: "PUT", ruta: `/admin/marcas/${ID.marC}`, usuario: "ana", body: { nombre: "Y" }, esperado: [200, "UPDATED"] },
    { caso: "borra sin la capacidad", metodo: "DELETE", ruta: `/admin/marcas/${ID.marC}`, usuario: "ana", esperado: [200, "DELETED"] }
  ],
  atributos: propio({
    base: "/admin/producto-atributos", a: ID.atrA, b: ID.atrB,
    crear: { nombre: "Material", valores: ["Algodón"] }, editar: { valores: ["S", "M", "L"] },
    filtro: "aplicaA=null"
  }),
  variantes: [
    ...hijo({
      base: "/admin/producto-variantes", a: ID.varA, b: ID.varB,
      crear: { nombre: "XL", precio: 60 }, editar: { stock: 9 }, filtro: `productoId=${ID.prodA}&activo=true`, sinCampos: 200
    }),
    // R10.5: la guarda de promoción corre con la entrada ya validada
    { caso: "sube el precio en promoción", metodo: "PUT", ruta: `/admin/producto-variantes/${ID.varA}`, usuario: "edu", body: { precio: 5000 }, esperado: [409, "CONFLICT"] },
    { caso: "precio inválido antes que la promoción", metodo: "PUT", ruta: `/admin/producto-variantes/${ID.varA}`, usuario: "edu", body: { precio: -5000 }, esperado: [400, "VALIDATION_ERROR"] }
  ],
  imagenes: [
    ...hijo({
      base: IMG, a: ID.imgA, b: ID.imgB,
      crear: { url: "https://img.test/n.webp" }, editar: { orden: 3 }, filtro: "esPrincipal=true", sinCampos: 200
    }).filter((c) => c.caso !== "borra uno que no existe"),
    // El borrado limpia los archivos: lo hace su propio handler
    { caso: "subir imagen", metodo: "POST", ruta: `${IMG}/upload`, usuario: "edu", body: { productoId: ID.prodA }, esperado: [201, "SUBIDA"] },
    { caso: "subir imagen a otra tienda", metodo: "POST", ruta: `${IMG}/upload`, usuario: "ana", body: { productoId: ID.prodB }, esperado: [403, "FORBIDDEN"] },
    { caso: "viewer no sube", metodo: "POST", ruta: `${IMG}/upload`, usuario: "vic", body: { productoId: ID.prodA }, esperado: [403, "FORBIDDEN"] },
    { caso: "IA sobre una imagen", metodo: "POST", ruta: `${IMG}/${ID.imgA}/generar-ia`, usuario: "edu", body: {}, esperado: [200, "IA_INICIADA"] },
    { caso: "IA sobre una imagen de otra tienda", metodo: "POST", ruta: `${IMG}/${ID.imgB}/generar-ia`, usuario: "ana", body: {}, esperado: [403, "FORBIDDEN"] },
    { caso: "IA con prompt largo", metodo: "POST", ruta: `${IMG}/${ID.imgA}/generar-ia`, usuario: "edu", body: { prompt: "x".repeat(1001) }, esperado: [400, "VALIDATION_ERROR"] },
    { caso: "estado de la IA", ruta: `${IMG}/generar-ia/tarea-a`, usuario: "vic", esperado: [200, "IA_ESTADO"] },
    { caso: "estado de la IA de otra tienda", ruta: `${IMG}/generar-ia/tarea-b`, usuario: "vic", esperado: [403, "FORBIDDEN"] },
    { caso: "estado de una tarea vencida", ruta: `${IMG}/generar-ia/tarea-x`, usuario: "vic", esperado: [200, "IA_ESTADO"] },
    { caso: "confirma la IA", metodo: "POST", ruta: `${IMG}/generar-ia/tarea-a/confirmar`, usuario: "edu", body: { productoId: ID.prodA }, esperado: [201, "IA_CONFIRMADA"] },
    { caso: "confirma la IA en otra tienda", metodo: "POST", ruta: `${IMG}/generar-ia/tarea-a/confirmar`, usuario: "ana", body: { productoId: ID.prodB }, esperado: [403, "FORBIDDEN"] }
  ],
  vitrinaCategorias: [
    { caso: "lista por ?tiendaId=", ruta: `/store/categorias${T()}`, esperado: [200, "LIST"] },
    { caso: "lista activas por ?tiendaId=", ruta: `/store/categorias${T("&activo=true")}`, esperado: [200, "LIST"] },
    { caso: "el subdominio manda sobre ?tiendaId=", ruta: `/store/categorias?tiendaId=${B}`, tienda: A, esperado: [200, "LIST"] },
    { caso: "busca por slug", ruta: `/store/categorias${T("&search=gorr")}`, esperado: [200, "LIST"] },
    { caso: "lista sin tienda", ruta: "/store/categorias", esperado: [400, "VALIDATION_ERROR"] },
    { caso: "ve una de la tienda", ruta: `/store/categorias/${ID.catA}`, tienda: A, esperado: [200, "FOUND"] },
    { caso: "ve una de otra tienda", ruta: `/store/categorias/${ID.catB}`, tienda: A, esperado: [404, "NOT_FOUND"] },
    { caso: "ve sin tienda", ruta: `/store/categorias/${ID.catA}`, esperado: [404, "NOT_FOUND"] },
    { caso: "id inválido", ruta: "/store/categorias/no-es-uuid", tienda: A, esperado: [400, "VALIDATION_ERROR"] },
    { caso: "no se escribe desde la vitrina", metodo: "POST", ruta: "/store/categorias", tienda: A, body: { tiendaId: A, nombre: "X", slug: "x" }, esperado: [404, "ROUTE_NOT_FOUND"] }
  ]
};

/**
 * Ataques entre tiendas (tests negativos de A7.3): ana es admin de A y apunta a
 * la fila `b` de la tienda B mandando su propia tienda donde el acceso la lee.
 * `esperado` es solo el status. Ninguno debe leer ni tocar nada de B.
 */
function ataquesComunes({ base, b, editar, crear, hijo }) {
  return [
    { caso: "lee con la suya en la query", ruta: `${base}/${b}${T()}`, esperado: 403 },
    { caso: "lee con la suya en el body", ruta: `${base}/${b}`, body: { tiendaId: A }, esperado: 404 },
    { caso: "lista la otra con la suya en el body", ruta: `${base}?tiendaId=${B}`, body: { tiendaId: A }, esperado: 200 },
    { caso: "edita con la suya en la query", metodo: "PUT", ruta: `${base}/${b}${T()}`, body: editar, esperado: 404 },
    { caso: "edita con la suya en el body", metodo: "PUT", ruta: `${base}/${b}`, body: { tiendaId: A, ...editar }, esperado: 404 },
    { caso: "borra con la suya en la query", metodo: "DELETE", ruta: `${base}/${b}${T()}`, esperado: 404 },
    { caso: "borra con la suya en el body", metodo: "DELETE", ruta: `${base}/${b}`, body: { tiendaId: A }, esperado: 404 },
    ...(hijo
      ? [
        { caso: "edita apuntando a un producto suyo", metodo: "PUT", ruta: `${base}/${b}`, body: { productoId: ID.prodA, ...editar }, esperado: 403 },
        { caso: "crea en un producto de la otra con la suya en la query", metodo: "POST", ruta: `${base}${T()}`, body: { productoId: ID.prodB, ...crear }, esperado: 404 }
      ]
      : [
        { caso: "crea en la otra con la suya en la query", metodo: "POST", ruta: `${base}${T()}`, body: { tiendaId: B, ...crear }, esperado: 403 }
      ])
  ];
}

export const ATAQUES = {
  categorias: ataquesComunes({ base: "/admin/categorias", b: ID.catB, editar: { nombre: "Mía" }, crear: { nombre: "X", slug: "x" } }),
  marcas: ataquesComunes({ base: "/admin/marcas", b: ID.marB, editar: { nombre: "Mía" }, crear: { nombre: "X", slug: "x" } }),
  atributos: ataquesComunes({ base: "/admin/producto-atributos", b: ID.atrB, editar: { valores: ["Mío"] }, crear: { nombre: "X", valores: ["x"] } }),
  variantes: ataquesComunes({ base: "/admin/producto-variantes", b: ID.varB, editar: { stock: 0 }, crear: { nombre: "X" }, hijo: true }),
  imagenes: [
    ...ataquesComunes({ base: IMG, b: ID.imgB, editar: { orden: 9 }, crear: { url: "https://img.test/x.webp" }, hijo: true }),
    { caso: "sube a un producto de la otra con la suya en la query", metodo: "POST", ruta: `${IMG}/upload${T()}`, body: { productoId: ID.prodB }, esperado: 404 },
    { caso: "IA sobre una imagen de la otra con la suya en la query", metodo: "POST", ruta: `${IMG}/${ID.imgB}/generar-ia${T()}`, body: {}, esperado: 404 },
    { caso: "IA sobre una imagen de la otra apuntando a un producto suyo", metodo: "POST", ruta: `${IMG}/${ID.imgB}/generar-ia`, body: { productoId: ID.prodA }, esperado: 403 },
    { caso: "confirma la IA en un producto de la otra con la suya en la query", metodo: "POST", ruta: `${IMG}/generar-ia/tarea-a/confirmar${T()}`, body: { productoId: ID.prodB }, esperado: 404 }
  ],
  vitrinaCategorias: [
    { caso: "la vitrina de A no muestra una de B", ruta: `/store/categorias/${ID.catB}`, tienda: A, sinUsuario: true, esperado: 404 },
    { caso: "la vitrina de A no lista las de B", ruta: `/store/categorias?tiendaId=${B}`, tienda: A, sinUsuario: true, esperado: 200 }
  ]
};
