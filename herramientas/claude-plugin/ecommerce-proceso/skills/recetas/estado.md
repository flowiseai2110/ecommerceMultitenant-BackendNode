# Receta: actualizar el tablero

Archivo: `BackendNode/docs/ESTADO.md`. Una fila por funcionalidad abierta.

1. Busca la fila de la funcionalidad; si no hay, agrégala en "En curso".
2. Columna **Etapa**: uno de `borrador`, `aprobado`, `diseñado`, `planificado`, `en desarrollo (pieza N)`, `en QA`, `listo para desplegar`, `desplegado`, `cerrado`.
3. Columna **Te toca**: solo lo que Diego tiene que hacer él (aprobar, correr un SQL, poner una llave, probar en el navegador), en una frase.
4. Columna **Actualizado**: la fecha de hoy.
5. Al desplegar: mueve la fila a "Desplegado" con la fecha y el tag `prod-AAAA-MM-DD`.

No cambies otras filas ni reescribas el archivo entero.
