/**
 * Textos del formato de la Hoja de Reclamación (Anexo I del Reglamento del
 * Libro de Reclamaciones, DS 011-2011-PCM y modificatorias). Si cambia el
 * reglamento, se cambian acá (correos) y en el modelo del storefront
 * (src/app/models/libro-reclamaciones.model.ts).
 */

export const TEXTO_VIAS_ALTERNAS =
  "La formulación del reclamo no impide acudir a otras vías de solución de controversias " +
  "ni es requisito previo para interponer una denuncia ante el INDECOPI.";

export const TEXTO_PLAZO =
  "El proveedor deberá dar respuesta al reclamo o queja en un plazo no mayor a quince (15) " +
  "días hábiles improrrogables.";

export const DEFINICION_RECLAMO =
  "Reclamo: disconformidad relacionada a los productos o servicios.";

export const DEFINICION_QUEJA =
  "Queja: disconformidad no relacionada a los productos o servicios; o malestar o " +
  "descontento respecto a la atención al público.";

export const ETIQUETAS = {
  tipo: { reclamo: "Reclamo", queja: "Queja" },
  bienTipo: { producto: "Producto", servicio: "Servicio" },
  docTipo: { DNI: "DNI", CE: "Carné de extranjería", PASAPORTE: "Pasaporte" },
  medioRespuesta: { email: "Correo electrónico", domicilio: "Carta a su domicilio" },
  estado: { pendiente: "Pendiente", en_atencion: "En atención", respondida: "Respondida" }
};
