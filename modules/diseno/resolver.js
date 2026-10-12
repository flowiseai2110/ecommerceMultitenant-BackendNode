import { buscarPlantilla, plantillaPorDefecto, tipoNegocioDe } from "./plantillas.js";
import { buscarPaleta, PALETA_DEFAULT } from "./paletas.js";
import { buscarTipografia, TIPOGRAFIA_DEFAULT } from "./tipografias.js";
import { copiarPlantilla } from "./copia.js";
import { migrarEstructura } from "./migrar.js";
import { layoutDeNegocio } from "./secciones.schema.js";
import { datosDe } from "../negocio/datos.js";

/**
 * Tema tal como lo recibe el storefront (R6.1): estructura completa, paleta y
 * tipografía con sus valores. Pura, con `ahora` inyectado.
 *
 * - Sin estructura guardada (o ilegible): la plantilla por defecto de su tipo
 *   de negocio, con los textos de la clave `hero`. Para productos es la
 *   clásica: ninguna tienda cambia de aspecto sin que el dueño elija una
 *   plantilla (R2.4). Un hotel usa la Boutique, una agencia el Catálogo y un
 *   organizador de eventos la Cartelera (diseno-por-rubro H4).
 * - Sin tema: la del rubro si declara una (`diseno.temaPorDefecto`; canchas:
 *   verde cancha y tipografía deportiva) o la paleta y la tipografía que se ven hoy (R2.5).
 * - Las secciones ocultas no se publican, y una oferta sin fecha o vencida
 *   tampoco (R6.2).
 */
export function resolverTema({ tema, estructura, hero, tipoNegocio } = {}, ahora) {
  const porDefecto = plantillaPorDefecto(tipoNegocio);
  const guardada = estructura ? migrarEstructura(estructura) : null;
  // Una estructura de otro tipo de negocio (la tienda cambió de tipo después
  // de elegir plantilla) no se publica: tendría secciones que no aplican.
  const vigente = guardada && tipoNegocioDe(buscarPlantilla(guardada.plantillaId)) === tipoNegocioDe(porDefecto) ? guardada : null;
  const base = vigente ?? copiarPlantilla(porDefecto, { hero });

  const temaDelRubro = datosDe(tipoNegocio).diseno.temaPorDefecto ?? null;
  const secciones = base.home.secciones.filter((s) => {
    if (s.oculto) return false;
    if (s.tipo === "oferta") return Boolean(s.terminaEn) && new Date(s.terminaEn).getTime() > ahora.getTime();
    return true;
  });

  return {
    estructura: {
      ...base,
      // Solo el layout de su tipo de negocio, con sus defaults (layout-por-rubro RU8):
      // una estructura vieja trae las opciones de todos los rubros.
      layout: layoutDeNegocio(base.layout, tipoNegocioDe(porDefecto)),
      home: { secciones }
    },
    paleta: buscarPaleta(tema?.paleta) ?? buscarPaleta(temaDelRubro?.paleta) ?? buscarPaleta(PALETA_DEFAULT),
    tipografia: buscarTipografia(tema?.tipografia) ?? buscarTipografia(temaDelRubro?.tipografia) ?? buscarTipografia(TIPOGRAFIA_DEFAULT)
  };
}
