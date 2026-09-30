/**
 * Contrato de salida del aviso de live para el Admin (Angular).
 * Nota: el storefront NO usa esto — lee las columnas directamente por Supabase
 * Realtime con el rol anon. Este serializer solo define la forma que ve el admin.
 */
export function serializeLive(row) {
  if (!row) return null;
  return {
    id: row.id,
    tiendaId: row.tiendaId,
    activo: row.activo,
    titulo: row.titulo ?? null,
    tiktokUrl: row.tiktokUrl ?? null,
    youtubeUrl: row.youtubeUrl ?? null,
    facebookUrl: row.facebookUrl ?? null,
    mostrarTiktok: row.mostrarTiktok,
    mostrarYoutube: row.mostrarYoutube,
    mostrarFacebook: row.mostrarFacebook,
    iniciadoEn: row.iniciadoEn ?? null,
    expiraEn: row.expiraEn ?? null,
    fechaActualizacion: row.fechaActualizacion ?? null
  };
}

/**
 * Forma pública para el storefront (fetch inicial). Solo expone los links de las
 * plataformas realmente marcadas, y solo cuando el live está activo. El evento
 * en tiempo real llega por Supabase Realtime; esto es únicamente el estado inicial.
 */
export function serializeLivePublic(row) {
  if (!row || !row.activo) return { activo: false };
  return {
    activo: true,
    titulo: row.titulo ?? null,
    tiktok: row.mostrarTiktok ? row.tiktokUrl : null,
    youtube: row.mostrarYoutube ? row.youtubeUrl : null,
    facebook: row.mostrarFacebook ? row.facebookUrl : null,
    iniciadoEn: row.iniciadoEn ?? null,
    expiraEn: row.expiraEn ?? null
  };
}

export default { serializeLive, serializeLivePublic };
