# Receta: llave (variable de entorno) nueva o quitada

Primero pregunta: **¿cambia sin deploy?** Si el dueño de la plataforma debería poder cambiarla, no es una llave: es un
[parámetro](parametro.md). Una llave es para secretos y valores por entorno.

**Backend (Railway)**
1. `.env.example`: la línea `LLAVE=` en la sección que corresponde, con un comentario de para qué sirve y cómo generarla
   (secretos: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
2. `config/index.js`: leerla ahí, con su valor por defecto si tiene; el resto del código usa `config`, no `process.env`.

**Tienda (Vercel)**: valores del build en `scripts/generate-env.js` (y el campo en `src/environments/environment.prod.ts`);
valores del SSR en `src/server.ts`. Documentarla también en el comentario de cabecera de `generate-env.js`.

**Admin (Vercel)**: `src/environments/environment.ts` y `src/environments/environment.prod.ts`.

En los dos fronts, la carpeta `environments/` de la raíz no la usa el build (`angular.json` reemplaza `src/environments/…`): no la edites.

**Quitar una llave**: borra la lectura y la línea de `.env.example`, y anótala como "quitar" para el despliegue.

En todos los casos: anótala en `cambios.md` → "Afecta al despliegue" (nueva / cambia / se quita, plataforma, si es secreta).
**Nunca** escribas el valor real de un secreto en un archivo versionado ni en el chat.
