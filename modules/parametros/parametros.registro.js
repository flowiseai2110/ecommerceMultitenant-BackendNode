import { z } from "zod";
import config from "../../config/index.js";

/**
 * Parámetros de la plataforma: valores que el administrador de la plataforma
 * cambia sin deploy, desde el admin (pantalla "Parámetros de la plataforma").
 *
 * Este registro es la ÚNICA lista de parámetros que existen. Cada uno trae su
 * validación y su valor por defecto; la tabla parametros_plataforma solo guarda
 * los que alguien cambió. Una clave que no está aquí no se puede leer ni guardar.
 *
 * Parámetro nuevo: agregarlo aquí (lo exige un test) y leerlo con
 * `parametro(clave)` de parametros.service.js.
 */

export const PARAMETROS = Object.freeze({
  "transmision.baja_latencia": {
    grupo: "Transmisión en vivo",
    titulo: "Menor retraso (LL-HLS)",
    descripcion:
      "Cloudflare intenta bajar el retraso del video de unos 20 s a unos 3 s. Está en beta: si la red del local es mala, el video puede " +
      "pararse más seguido. Pide en la app que transmite: keyframe de 1 a 2 s y B-frames apagados. Se aplica cuando la entrada se " +
      "habilita (al abrir la sala o en la transmisión de prueba) y en las transmisiones que se activen desde ahora.",
    schema: z.boolean(),
    porDefecto: () => true // decisión 2026-10-16: activado para probarlo
  },
  "transmision.timeout_segundos": {
    grupo: "Transmisión en vivo",
    titulo: "Segundos sin señal antes de abrir otra grabación",
    descripcion:
      "Si la señal se corta más que esto, Cloudflare guarda lo anterior como una parte y empieza otra. 0 = el valor de Cloudflare " +
      "(su recomendación). Un valor más alto deja menos partes cuando el 4G se corta, pero la grabación tarda más en quedar lista. " +
      "Se aplica igual que el anterior.",
    schema: z.number().int().min(0).max(1800),
    porDefecto: () => config.streaming.cloudflare.timeoutSeconds
  },
  "consumo_ia.traducciones_sin_plan": {
    grupo: "Consumo de IA",
    titulo: "Traducciones con IA al mes (tiendas sin plan)",
    descripcion:
      "Cuántas veces al mes una tienda sin plan puede pulsar \"Traducir con IA\" en Traducciones (cada pulsación traduce todo lo " +
      "que le falta a un idioma). El dueño puede bajarlo para su tienda en Consumo IA, no subirlo. Los planes fijan el suyo.",
    schema: z.number().int().min(1).max(500),
    porDefecto: () => config.consumoIa.limiteTraduccionesSinPlan
  }
});

export const CLAVES = Object.freeze(Object.keys(PARAMETROS));

export const existeParametro = (clave) => Object.hasOwn(PARAMETROS, clave);
