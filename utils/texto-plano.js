/**
 * Texto con formato del dueño (Markdown liviano: descripciones, políticas,
 * instrucciones, contrato) → texto sin símbolos, para donde no se pinta el
 * formato: correos y mensajes. Igual a `textoPlano` de FrontendStore
 * shared/utils/texto-rico.ts.
 * @param {string | null | undefined} texto
 * @returns {string}
 */
export function textoPlano(texto) {
  if (!texto) return "";
  return texto
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/gm, "")
    .replace(/^[ \t]*>[ \t]?/gm, "")
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, "$2")
    .replace(/\*(?=\S)(.+?)(?<=\S)\*/g, "$1")
    .replace(/(^|[^\w])_(?=\S)(.+?)(?<=\S)_(?![\w])/g, "$1$2")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}
