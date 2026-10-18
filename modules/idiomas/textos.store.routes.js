import { Router } from "express";
import { apiResponse } from "../../utils/apiResponse.js";
import { ValidationError } from "../../utils/errors.js";
import { diccionario } from "./textos.service.js";
import { opcionesTraducidas } from "../traducciones/opciones.js";

/**
 * GET /store/textos?tiendaId=&lang= — textos fijos de la tienda en el idioma
 * resuelto (req.idioma, docs/specs/idiomas D7). La tienda los pide antes de
 * pintar; lo que no está en el diccionario se muestra en el idioma base.
 * También `opciones`: Talla, Color y sus valores traducidos una vez por
 * tienda (traducciones/opciones.js), aparte para no mezclarlos con los fijos.
 */

const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get("/", async (req, res) => {
  const tiendaId = req.tiendaId ?? (UUID.test(req.query.tiendaId ?? "") ? req.query.tiendaId : null);
  if (!tiendaId) throw new ValidationError("Falta la tienda", { message: "Falta la tienda" });
  // Cambia solo cuando el dueño guarda una traducción: un minuto basta.
  res.set("Cache-Control", "public, max-age=60");
  return apiResponse(res, {
    status: 200, type: "SUCCESS", code: "TEXTOS_TIENDA",
    data: {
      idioma: req.idioma,
      textos: await diccionario(tiendaId, req.idioma),
      opciones: await opcionesTraducidas(tiendaId, req.idioma)
    }
  });
});

export default router;
