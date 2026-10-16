// Escribe modules/idiomas/claves/claves-servidor.json (los textos fijos del
// servidor marcados con clave("…"), con su grupo y sus ubicaciones) y
// modules/idiomas/pantallas/pantallas-servidor.json (docs/specs/idiomas D8,
// diseno.md A6). Correrlo después de agregar o cambiar uno; el test de claves
// falla si quedaron viejos.
//
// Uso (desde la raíz del backend):
//   node scripts/claves-servidor.mjs

import { writeFileSync } from "node:fs";
import { extraerClavesServidor } from "../modules/idiomas/claves-servidor.js";

const { claves, pantallas, sinUbicacion, sinUso } = extraerClavesServidor();
// Contrato 10: cada texto tiene dónde mostrarse en Traducciones.
if (sinUbicacion.length || sinUso.length) {
  if (sinUbicacion.length) console.error(`✗ Textos sin sección en Traducciones (agrégalos a PANTALLAS_SERVIDOR): ${sinUbicacion.join(", ")}`);
  if (sinUso.length) console.error(`✗ Prefijos de PANTALLAS_SERVIDOR sin textos: ${sinUso.join(", ")}`);
  process.exit(1);
}
const json = (v) => `${JSON.stringify(v, null, 2)}\n`;
writeFileSync(new URL("../modules/idiomas/claves/claves-servidor.json", import.meta.url), json(claves));
writeFileSync(new URL("../modules/idiomas/pantallas/pantallas-servidor.json", import.meta.url), json(pantallas));
console.log(`claves-servidor.json: ${claves.length} claves; pantallas-servidor.json: ${pantallas.length} pantallas.`);
