import { clave } from "../idiomas/clave.js";

/**
 * Fecha corta en el idioma de quien reserva (docs/specs/idiomas B7): "24/09"
 * en español, "Sep 24" en inglés. La comparten las cotizaciones de los rubros.
 */

const FECHA_CORTA = clave("{dd}/{mm}|fecha corta; también {d} y {mes}");
const MESES = [
  clave("ene.|mes corto"), clave("feb.|mes corto"), clave("mar.|mes corto"), clave("abr.|mes corto"),
  clave("may.|mes corto"), clave("jun.|mes corto"), clave("jul.|mes corto"), clave("ago.|mes corto"),
  clave("set.|mes corto"), clave("oct.|mes corto"), clave("nov.|mes corto"), clave("dic.|mes corto")
];

/** @param {(clave: string, params?: object) => string} t @param {string} f - "YYYY-MM-DD" */
export const fechaCortaLocal = (t, f) => t(FECHA_CORTA, {
  dd: f.slice(8, 10), mm: f.slice(5, 7), d: Number(f.slice(8, 10)), mes: t(MESES[Number(f.slice(5, 7)) - 1])
});
