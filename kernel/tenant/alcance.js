/**
 * Dónde vive cada modelo con columna `tienda_id` (docs/specs/antipatrones A1,
 * docs/specs/multi-sede S2.1). Es la respuesta única a "¿de quién es esta fila?".
 *
 * - `tienda`: de una tienda. La extensión de Prisma (config/prisma.js) le agrega
 *   el tiendaId del contexto a toda lectura, edición y borrado.
 * - `global`: se consulta entre tiendas a propósito. Sin filtro automático; el
 *   motivo va en MOTIVO_GLOBAL.
 *
 * Seguro por defecto: un modelo nuevo con `tiendaId` que no esté aquí hace fallar
 * el test de contrato (__tests__/alcance.test.js). Multi-sede agrega los valores
 * `sede`, `sede:<padre>`, `presencia` y `razon_social`.
 */
export const ALCANCE = Object.freeze({
  // Catálogo
  categorias: "tienda",
  marcas: "tienda",
  productos: "tienda",
  producto_atributos: "tienda",

  // Clientes, pedidos y pagos
  clientes: "tienda",
  pedidos: "tienda",
  pagos: "tienda",
  cupones: "tienda",
  metodos_pago: "tienda",
  tienda_pasarela_config: "tienda",
  metodos_envio: "tienda",
  zonas_envio: "tienda",
  resenas: "tienda",
  libro_reclamaciones: "tienda",

  // Configuración, textos y consumo
  tienda_configuraciones: "tienda",
  tienda_textos: "tienda",
  tienda_uso_recursos: "tienda",
  agente_conversaciones: "tienda",
  agente_mensajes: "tienda",
  avisos_live: "tienda",

  // Mini booking (común)
  config_reservas: "tienda",
  cierres_fecha: "tienda",
  reservas: "tienda",
  reserva_partes: "tienda",
  reserva_cuotas: "tienda",
  reserva_cambios: "tienda",

  // Hotel
  hotel_tipos_habitacion: "tienda",
  hotel_modalidades: "tienda",
  hotel_habitaciones: "tienda",
  hotel_cupo_externo: "tienda",
  hotel_temporadas: "tienda",
  hotel_extras: "tienda",
  hotel_planes: "tienda",
  hotel_estadias: "tienda",
  hotel_cobros: "tienda",
  hotel_turnos: "tienda",
  hotel_caja_movimientos: "tienda",
  hotel_incidencias: "tienda",

  // Tours
  tours: "tienda",
  tour_tipos_pasajero: "tienda",

  // Eventos
  eventos: "tienda",
  evento_funciones: "tienda",
  evento_tipos_entrada: "tienda",
  evento_compra_items: "tienda",
  evento_entradas: "tienda",
  evento_invitaciones: "tienda",
  evento_transmisiones: "tienda",

  // Alquiler de locales
  local_salones: "tienda",
  local_turnos: "tienda",
  local_paquetes: "tienda",
  local_ocupaciones: "tienda",
  local_cotizaciones: "tienda",

  // Alquiler de canchas
  cancha_canchas: "tienda",
  cancha_ocupaciones: "tienda",

  // Transmisiones
  transmision_paquetes: "tienda",
  transmision_movimientos: "tienda",
  transmision_cargos: "tienda",
  transmision_excedentes: "tienda",
  transmision_destinos: "tienda",
  transmision_grabaciones: "tienda",
  transmision_vinculaciones: "tienda",

  // Entre tiendas
  usuario_tiendas: "global",
  invitaciones: "global"
});

/** Por qué cada modelo `global` no lleva filtro automático. */
export const MOTIVO_GLOBAL = Object.freeze({
  usuario_tiendas: "Auth y el selector de tiendas leen todas las membresías del usuario, antes de saber la tienda.",
  invitaciones: "Se aceptan por token desde cualquier tienda; el token ya identifica la tienda."
});

/** Modelos con filtro automático por tienda. */
export const MODELOS_DE_TIENDA = new Set(
  Object.entries(ALCANCE).filter(([, alcance]) => alcance === "tienda").map(([modelo]) => modelo)
);
