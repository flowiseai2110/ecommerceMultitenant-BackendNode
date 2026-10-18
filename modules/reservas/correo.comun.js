import { escapeHtml } from "../../services/email.service.js";
import { clave } from "../idiomas/clave.js";
import { rellenar, TRADUCTOR_BASE } from "../idiomas/traductor.js";
import { fechaCortaLocal } from "./textos-fecha.js";

// Piezas de HTML que comparten los correos de reservas.emails.js y los de cada
// rubro (reservas/<rubro>/correo.js; docs/specs/antipatrones 3b).

export const e = escapeHtml;
export const soles = (n) => `S/ ${Number(n ?? 0).toFixed(2)}`;
export const b = (html) => `<strong>${html}</strong>`;

/** Texto HTML traducido: plantilla escapada + valores (`params`) ya listos para HTML. */
export const html = (t, k, params) => rellenar(e(t.plantilla(k)), params);

export const hora = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false });
const partesLima = new Intl.DateTimeFormat("en-US", { timeZone: "America/Lima", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit" });
const DIAS = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
export const DIAS_CORTOS = [
  clave("lun|día corto"), clave("mar|día corto"), clave("mié|día corto"), clave("jue|día corto"),
  clave("vie|día corto"), clave("sáb|día corto"), clave("dom|día corto")
];

/** "jue, 24/09, 14:00" en español, "Thu, Sep 24, 14:00" en inglés. */
export function fechaHora(v, t = TRADUCTOR_BASE) {
  if (!v) return "—";
  const d = new Date(v);
  const p = Object.fromEntries(partesLima.formatToParts(d).map((x) => [x.type, x.value]));
  return t(clave("{dia}, {fecha}, {hora}|fecha y hora"), {
    dia: t(DIAS_CORTOS[DIAS[p.weekday]]), fecha: fechaCortaLocal(t, `${p.year}-${p.month}-${p.day}`), hora: hora.format(d)
  });
}

export const texto = (contenido) => `<p style="margin: 0 0 10px; font-size: 15px; line-height: 1.6; color: #4a4a4a;">${contenido}</p>`;

export const fila = (etiqueta, valor) => `
  <tr>
    <td style="padding: 6px 10px; width: 40%; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">${etiqueta}</td>
    <td style="padding: 6px 10px; font-size: 14px; color: #1a1a1a; border-bottom: 1px solid #f1f5f9;">${valor}</td>
  </tr>`;
