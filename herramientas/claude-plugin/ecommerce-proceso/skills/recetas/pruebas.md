# Receta: pruebas y tipos

Corre solo los repos tocados. Reporta el resultado real; si falla, pega la salida relevante, no la interpretes como "casi bien".

| Repo | Comandos |
|---|---|
| BackendNode | `npm test` (Jest; un archivo: `npm test -- <ruta>`) |
| FrontendAdmin | `npx tsc --noEmit -p tsconfig.app.json` y `npm test -- --watch=false` |
| FrontendStore | `npx tsc --noEmit -p tsconfig.app.json`, `npm test -- --watch=false` y, si tocó el checkout, `npm run e2e` |

- Si cambiaste un perfil o una UI por rubro, `negocio/perfiles.spec.ts` y `negocio/uis.spec.ts` deben fallar primero y luego
  actualizarse a propósito: dilo en el reporte.
- **Decide** solo qué repos tocaste. Si una prueba falla por algo que no tocaste, repórtalo aparte, no lo arregles de paso.
