import { productos } from "./productos/datos.js";
import { hotel } from "./hotel/datos.js";
import { tours } from "./tours/datos.js";
import { eventos } from "./eventos/datos.js";
import { locales } from "./locales/datos.js";
import { canchas } from "./canchas/datos.js";

/**
 * Datos de cada rubro (docs/specs/perfil-negocio): capacidades, Diseño y
 * configuración de reservas por defecto. Sin imports pesados, para que los
 * módulos compartidos (diseño, config de reservas, onboarding) lo usen sin
 * arrastrar las verticales ni crear ciclos; el registro (registro.js) los
 * suma a cada estrategia.
 */
export const DATOS = { productos, hotel, tours, eventos, locales, canchas };

/** Datos del rubro; un tipo desconocido usa los de productos. */
export const datosDe = (tipoNegocio) => DATOS[tipoNegocio] ?? DATOS.productos;
