# Receta: parámetro de plataforma

Para valores que el administrador de la plataforma (`PLATFORM_ADMIN_EMAILS`) cambia sin deploy, desde Admin › "Parámetros de la plataforma".

1. Agrégalo a `PARAMETROS` en `BackendNode/modules/parametros/parametros.registro.js`, copiando la forma de los vecinos:
   clave `"<grupo>.<nombre>"`, `grupo`, `titulo`, `descripcion` (para el dueño, en lenguaje simple), `schema` (Zod) y `porDefecto`.
   **Decide** solo la clave, los textos y los límites del `schema`.
2. Léelo con `parametro(clave)` de `parametros.service.js`. Nunca leas la tabla `parametros_plataforma` directo.
3. Si antes era una variable de entorno, deja la variable solo como `porDefecto` (`config.<…>`).
4. `npm test` en BackendNode: un test exige que todo parámetro esté en el registro.
5. No necesita SQL ni deploy de llaves: la tabla guarda solo los valores cambiados.
