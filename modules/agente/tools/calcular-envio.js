/**
 * Tool `calcular_envio` — costo y plazo de envío a un distrito.
 *
 * El distrito llega como texto del cliente y se resuelve en código
 * (distritos.js); la cotización es la misma del checkout (cotizarEnvios), así
 * que lo que dice el chat coincide con lo que se cobra.
 *
 * El modelo NO recibe montos (spec R6): solo el tipo de envío y el plazo. El
 * costo va en una tarjeta de envío que pinta el frontend.
 *
 * @see docs/specs/agente-ventas/spec.md — R9.
 */

import { cotizarEnvios } from "../../envios/cotizacion.service.js";
import { resolverDistrito, etiquetaDistrito } from "../distritos.js";

const MAX_CARACTERES_DISTRITO = 60;

// modo de cotizarMetodo → lo que el modelo puede decir sin conocer el monto.
const TIPO_PARA_MODELO = {
  fijo: "con_costo",
  gratis: "gratis",
  destino: "pago_al_recibir",
  coordinar: "por_coordinar"
};

export const calcularEnvioToolDef = {
  name: "calcular_envio",
  description:
    "Cotiza el envío de ESTA tienda a un distrito de Perú. Úsala cuando el cliente pregunte " +
    "por delivery, envío, costo o plazo de entrega a un lugar. Devuelve las formas de envío " +
    "disponibles con su tipo y plazo; el costo lo muestra la interfaz en una tarjeta, no lo " +
    "escribas. Si responde DISTRITO_AMBIGUO, pregunta cuál de las opciones es (la interfaz " +
    "las muestra como botones). Si responde DISTRITO_NO_CUBIERTO, dilo y ofrece recojo si existe.",
  input_schema: {
    type: "object",
    properties: {
      distrito: {
        type: "string",
        description: "Distrito tal como lo dijo el cliente, con provincia si la mencionó. Ej: 'Surco', 'Cayma, Arequipa'."
      }
    },
    required: ["distrito"]
  }
};

function plazo(diasMin, diasMax) {
  if (diasMin == null && diasMax == null) return null;
  if (diasMin != null && diasMax != null && diasMin !== diasMax) return `${diasMin} a ${diasMax} días`;
  const dias = diasMax ?? diasMin;
  return dias === 0 ? "el mismo día" : `${dias} día${dias === 1 ? "" : "s"}`;
}

/**
 * @param {object} params
 * @param {string} params.tiendaId - Server-side.
 * @param {object} params.input - Input del modelo ({ distrito }).
 * @param {object} params.facetas - De obtenerFacetas (ubigeo y envío gratis de la tienda).
 * @returns {Promise<{ paraModelo: object, envio?: object, sugerencias?: string[] }>}
 */
export async function ejecutarCalcularEnvio({ tiendaId, input, facetas }) {
  if (!tiendaId) throw new Error("calcular_envio: falta tiendaId (scope multi-tenant).");

  const texto = typeof input?.distrito === "string" ? input.distrito.trim().slice(0, MAX_CARACTERES_DISTRITO) : "";
  if (!texto) {
    return { paraModelo: { error: "PARAMETRO_INVALIDO", mensaje: "Pide el distrito de entrega, ej: 'Surco'." } };
  }

  const r = resolverDistrito(texto, { ubigeoTienda: facetas?.tienda?.ubigeo });
  if (r.estado === "no_encontrado") {
    return {
      paraModelo: {
        error: "DISTRITO_NO_ENCONTRADO",
        mensaje: "No se reconoció el distrito. Pídelo de nuevo con un ejemplo: 'Surco' o 'Cayma, Arequipa'."
      }
    };
  }
  if (r.estado === "ambiguo") {
    const opciones = r.opciones.map(etiquetaDistrito);
    return { paraModelo: { error: "DISTRITO_AMBIGUO", opciones }, sugerencias: opciones };
  }

  const distrito = etiquetaDistrito(r.distrito);
  const cotizaciones = (await cotizarEnvios(tiendaId, { ubigeo: r.distrito.ubigeo })).filter(c => c.disponible);
  if (cotizaciones.length === 0) {
    return { paraModelo: { error: "DISTRITO_NO_CUBIERTO", distrito } };
  }

  const envioGratisMinimo = facetas?.tienda?.envioGratisMinimo ?? null;
  return {
    paraModelo: {
      distrito,
      opciones: cotizaciones.map(c => ({
        metodo: c.nombre,
        tipo: TIPO_PARA_MODELO[c.modo] ?? "por_coordinar",
        plazo: plazo(c.diasMin, c.diasMax)
      })),
      hay_envio_gratis_por_monto: envioGratisMinimo != null && envioGratisMinimo > 0
    },
    // Tarjeta del frontend: aquí sí van los montos (vienen de la BD).
    envio: {
      distrito,
      ubigeo: r.distrito.ubigeo,
      opciones: cotizaciones.map(c => ({
        nombre: c.nombre,
        modo: c.modo,
        costo: c.costo,
        costoReferencial: c.costoReferencial,
        diasMin: c.diasMin,
        diasMax: c.diasMax
      })),
      envioGratisMinimo
    }
  };
}
