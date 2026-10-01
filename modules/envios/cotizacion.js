// Cotización de envío por zonas — lógica pura (sin BD) para poder testearla.
//
// Una zona agrupa prefijos UBIGEO INEI ("15" depto, "1501" provincia,
// "150122" distrito, "*" todo el país). Para un destino gana la zona cuyo
// prefijo sea el MÁS específico; a igual especificidad, la de menor `orden`.

export const PREFIJO_TODO_EL_PAIS = "*";
export const PREFIJO_UBIGEO_REGEX = /^(\*|\d{2}|\d{4}|\d{6})$/;

/**
 * Devuelve la zona que cubre el ubigeo (código de distrito de 6 dígitos) o null.
 */
export function resolverZona(zonas, ubigeo) {
  let mejor = null;
  let mejorScore = -1;
  for (const zona of [...zonas].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))) {
    for (const prefijo of zona.ubigeos ?? []) {
      let score = -1;
      if (prefijo === PREFIJO_TODO_EL_PAIS) score = 0;
      else if (ubigeo && ubigeo.startsWith(prefijo)) score = prefijo.length;
      if (score > mejorScore) {
        mejor = zona;
        mejorScore = score;
      }
    }
  }
  return mejor;
}

/**
 * Cotiza un método de envío para un destino.
 *
 * modo:
 *  - "fijo":      costo definido por la zona (suma al total)
 *  - "gratis":    recojo en tienda o el pedido supera envioGratisMinimo
 *  - "destino":   pago en destino; `costoReferencial` es lo que pagará al courier
 *  - "coordinar": sin tarifa configurada para el destino → por WhatsApp
 *
 * `disponible: false` = el método no llega a ese destino (no se ofrece).
 */
export function cotizarMetodo(metodo, zonas, { ubigeo = null, subtotal = 0, envioGratisMinimo = null } = {}) {
  const base = {
    metodoEnvioId: metodo.id,
    disponible: true,
    modo: "coordinar",
    costo: 0,
    costoReferencial: metodo.costoReferencial != null ? Number(metodo.costoReferencial) : null,
    zona: null,
    diasMin: null,
    diasMax: null
  };

  if (metodo.tipo === "recojo_tienda") return { ...base, modo: "gratis", costoReferencial: null };

  // Sin zonas configuradas: comportamiento anterior (costo por WhatsApp).
  if (!zonas?.length) return base;

  const zona = ubigeo ? resolverZona(zonas, ubigeo) : null;
  if (!zona) {
    // Sin destino todavía no se puede descartar el método: queda por coordinar.
    if (ubigeo && metodo.fueraDeZona === "no_disponible") return { ...base, disponible: false };
    return base;
  }

  const costoZona = Number(zona.costo);
  const conZona = {
    ...base,
    zona: zona.nombre,
    diasMin: zona.diasMin ?? null,
    diasMax: zona.diasMax ?? null
  };

  if (metodo.pagoEnDestino) return { ...conZona, modo: "destino", costoReferencial: costoZona };

  if (envioGratisMinimo != null && Number(envioGratisMinimo) > 0 && subtotal >= Number(envioGratisMinimo)) {
    return { ...conZona, modo: "gratis", costoReferencial: costoZona };
  }

  return { ...conZona, modo: "fijo", costo: costoZona, costoReferencial: null };
}
