// Validaciones de sentido común al guardar campañas (docs/specs/campanas-cuando R8).
// Lógica pura (sin BD): recibe el reloj y las ediciones. Solo revisa las
// campañas que se tocan en este guardado (nuevas o con fechas, horas, uso o
// estado cambiados), para que una campaña vieja no bloquee otros cambios.

import { efectiva } from "./resolver.js";
import { fechaCivilLima, inicioDiaLima, parsearFecha, ventanas } from "./calendario.js";

const DIA_MS = 86_400_000;
const CAMPOS = ["presetId", "activa", "inicio", "fin", "horaInicio", "horaFin", "anticipacionDias", "despuesDias", "uso"];

const fmt = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Lima" });
const fecha = (d) => fmt.format(d).replace(/\./g, "");

/** Fechas elegidas por la tienda: una propia o un preset con "Mis fechas" (R2.9). */
const fechadaPorTienda = (c) => !c.presetId || Boolean(c.inicio && c.fin);

const firma = (c) => JSON.stringify(CAMPOS.map((k) => c[k] ?? null));

function tocadas(campanas, anteriores) {
  const antes = new Map((anteriores ?? []).map((c) => [c.id, firma(c)]));
  return campanas.filter((c) => antes.get(c.id) !== firma(c));
}

/** Ventanas que aún no terminan, en los años alrededor de `ahora`. */
function ventanasFuturas(c, ahora, ediciones) {
  const ef = efectiva(c);
  if (!ef) return [];
  const { anio } = fechaCivilLima(ahora);
  const anios = ef.regla ? [anio - 1, anio, anio + 1, anio + 2] : [anio];
  return anios.flatMap((a) => ventanas(ef, a, ediciones)).filter((v) => v.fin > ahora);
}

/**
 * Primer error de sentido de las campañas tocadas, o null:
 * R8.1 ya terminó · R8.2 empieza en más de un año · R8.3 el uso termina antes
 * de la campaña · R8.4 el uso ya pasó · R8.5 se cruza con otra activa (si una
 * de las dos tiene fechas de la tienda; los cruces del catálogo se permiten).
 */
export function errorDeSentido(campanas = [], anteriores = [], ahora = new Date(), ediciones = null) {
  const activas = campanas.filter((c) => c.activa);
  const usoAntes = new Map((anteriores ?? []).map((c) => [c.id, JSON.stringify(c.uso ?? null)]));
  for (const c of tocadas(campanas, anteriores)) {
    const nombre = efectiva(c)?.nombre ?? "La campaña";

    if (fechadaPorTienda(c) && c.inicio && c.fin) {
      const inicio = parsearFecha(c.inicio);
      if (inicio && inicioDiaLima(inicio).getTime() > ahora.getTime() + 366 * DIA_MS) {
        return `${nombre} empieza el ${fecha(inicioDiaLima(inicio))}, en más de un año. Revisa el año.`;
      }
      const [v] = ventanas(efectiva(c));
      if (c.activa && v && v.fin <= ahora) {
        return `${nombre} ya terminó el ${fecha(new Date(v.fin.getTime() - 1))}. Revisa el año, o apágala si ya no la usas.`;
      }
    }

    // Las fechas de uso están ocultas en el Admin (R1.11): se revisan solo si cambian en este
    // guardado, para que un dato que el dueño ya no ve no le bloquee otros cambios.
    const usoCambio = usoAntes.get(c.id) !== JSON.stringify(c.uso ?? null);
    if (!c.presetId && c.uso?.hasta && usoCambio) {
      const hasta = parsearFecha(c.uso.hasta);
      const inicio = parsearFecha(c.inicio);
      if (hasta && inicio && inicioDiaLima(hasta) < inicioDiaLima(inicio)) {
        return `Las fechas de uso de ${nombre} terminan antes de que empiece la campaña.`;
      }
      if (c.activa && hasta && inicioDiaLima(hasta, 1) <= ahora) {
        return `Las fechas de uso de ${nombre} ya pasaron (${fecha(inicioDiaLima(hasta))}).`;
      }
    }

    if (!c.activa) continue;
    const mias = ventanasFuturas(c, ahora, ediciones);
    for (const o of activas) {
      if (o.id === c.id || !(fechadaPorTienda(c) || fechadaPorTienda(o))) continue;
      for (const w of ventanasFuturas(o, ahora, ediciones)) {
        const cruce = mias.find((v) => v.inicio < w.fin && w.inicio < v.fin);
        if (!cruce) continue;
        const desde = new Date(Math.max(cruce.inicio, w.inicio));
        const hasta = new Date(Math.min(cruce.fin, w.fin) - 1);
        const otra = efectiva(o)?.nombre ?? "otra campaña";
        return `${nombre} se cruza con ${otra} del ${fecha(desde)} al ${fecha(hasta)}. Apaga una de las dos o cambia las fechas.`;
      }
    }
  }
  return null;
}
