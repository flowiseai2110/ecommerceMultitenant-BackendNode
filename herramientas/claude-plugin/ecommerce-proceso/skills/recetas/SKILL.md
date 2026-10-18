---
name: recetas
description: >-
  Recetas paso a paso para las tareas que se repiten en los tres repos del ecommerce (commit, correr pruebas, SQL nuevo, llave nueva,
  parámetro de plataforma, capacidad o pieza por rubro, versión de diseño, actualizar ESTADO, levantar local, verificar el plugin) y
  los datos fijos del proyecto. Úsala antes de investigar una de esas tareas: la receta ya trae la respuesta.
---

# Recetas

**Regla:** si la tarea es una receta, lee solo ese archivo y síguelo. No explores el repo para redescubrir lo que la receta fija
(rutas, comandos, orden). Razona solo en los pasos marcados **Decide**. Si la receta no calza con lo que ves en el código,
detente, dilo y propón corregir la receta: no improvises otra.

## Datos fijos (no los busques)

- Raíz: `C:/Users/diego armando/repositorios/ecommerce/`. Repos: `ecommerceMultitenant-BackendNode` (Node/Express 5/Prisma, Jest),
  `ecommerceMultitenant-FrontendAdmin` y `ecommerceMultitenant-FrontendStore` (Angular 22, Karma; la tienda con SSR y Playwright).
- Se trabaja directo en `main`, en los tres repos; nunca ramas. Commit solo cuando Diego lo pide.
- Rubros: `productos`, `hotel`, `tours`, `eventos`, `locales`, `canchas`. Carpeta `negocio/<rubro>/` con el mismo nombre en los tres repos.
- Docs y tablero: BackendNode `docs/` (`ESTADO.md`, `specs/<feature>/`, `disenos/INDICE.md`, `rubros/`, `sql/`, `proceso/plantillas/`).
- Producción: backend en Railway (`GET /api/v1/health`), Admin y Tienda en Vercel, BD en Supabase (los SQL los corre Diego a mano).
- Local: backend `npm run dev` en el puerto 3000; los fronts `npm start` en 4200. **La tienda local apunta al backend de producción**
  salvo que su `.env` tenga `PROXY_TARGET=http://localhost:3000` (`proxy.conf.js`).
- Llaves: backend `.env.example` + `config/index.js`; tienda `scripts/generate-env.js` (build en Vercel) y `src/server.ts` (SSR);
  Admin `src/environments/*.ts` (la carpeta `environments/` de la raíz de cada front no la usa el build). Una llave del SSR (`SSR_API_KEY`) va igual en Railway y en Vercel.
- El `claude` de npm en el PATH puede ser viejo; el de la extensión de VS Code está en
  `~/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude.exe`.
- Tiendas demo: hospedaje `killa-hostal`, `mirador-miraflores`, `demobooking` (dueña booking@yopmail.com); canchas `los-cedros`.

## Índice

| Tarea | Archivo |
|---|---|
| Commit en uno o varios repos | [commit.md](commit.md) |
| Correr pruebas y tipos | [pruebas.md](pruebas.md) |
| SQL nuevo para Supabase | [sql.md](sql.md) |
| Llave (variable de entorno) nueva o quitada | [llave.md](llave.md) |
| Parámetro de plataforma (cambia sin deploy) | [parametro.md](parametro.md) |
| Capacidad nueva de un rubro | [capacidad-rubro.md](capacidad-rubro.md) |
| Pieza de UI que cambia por rubro (slot) | [pieza-ui.md](pieza-ui.md) |
| Nueva versión de un diseño | [version-diseno.md](version-diseno.md) |
| Actualizar el tablero ESTADO.md | [estado.md](estado.md) |
| Levantar el entorno local | [local.md](local.md) |
| Cambiar o verificar el plugin `ecommerce-proceso` | [plugin.md](plugin.md) |
