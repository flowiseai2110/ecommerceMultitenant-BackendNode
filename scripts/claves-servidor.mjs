// Escribe modules/idiomas/claves/claves-servidor.json con los textos fijos del
// servidor marcados con clave("…") (docs/specs/idiomas D8). Correrlo después
// de agregar o cambiar uno; el test de claves falla si el JSON quedó viejo.
//
// Uso (desde la raíz del backend):
//   node scripts/claves-servidor.mjs

import { writeFileSync } from "node:fs";
import { extraerClavesServidor } from "../modules/idiomas/claves-servidor.js";

const claves = extraerClavesServidor();
writeFileSync(new URL("../modules/idiomas/claves/claves-servidor.json", import.meta.url), `${JSON.stringify(claves, null, 2)}\n`);
console.log(`claves-servidor.json: ${claves.length} claves.`);
