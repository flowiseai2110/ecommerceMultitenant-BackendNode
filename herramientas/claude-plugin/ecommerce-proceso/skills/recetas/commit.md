# Receta: commit

Solo cuando Diego lo pide. En `main`, sin ramas, sin `--no-verify`.

1. Por cada repo tocado: `git -C <repo> status --short`. Si hay archivos que no son del cambio, pregunta antes de incluirlos.
2. Un commit por repo y por pieza. Mensaje en español, corto, qué y por qué (estilo de los commits de Diego: `pieza 1 y 2`,
   `mejora en reserva`). **Decide** solo el texto del mensaje.
3. `git -C <repo> add <archivos>` y `git -C <repo> commit -m "<mensaje>"`, terminando con la línea de coautoría que indique la sesión.
4. Si la pieza tiene carpeta en `docs/specs/`, pon el hash en la línea **Commits** de su `cambios.md`.
5. `git push` solo si Diego lo pide.
