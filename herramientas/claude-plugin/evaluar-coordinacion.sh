#!/usr/bin/env bash
# Le pasa cada caso de docs/proceso/casos-de-uso.md a una sesión nueva de Claude Code, en modo simulación
# (lee, pero no edita ni lanza agentes), y guarda lo que decidió la coordinación para compararlo con lo esperado.
# Uso: bash herramientas/claude-plugin/evaluar-coordinacion.sh [carpeta-de-salida] [modelo] [casos, p. ej. 2,6]
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$AQUI/../.." && pwd)"
SALIDA="${1:-$(mktemp -d)}"
MODELO="${2:-sonnet}"
CASOS="${3:-}"
mkdir -p "$SALIDA"

CLAUDE="$(ls -d "$HOME"/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude.exe 2>/dev/null | sort -V | tail -1 || true)"
export CLAUDE="${CLAUDE:-claude}" SALIDA MODELO REPO

simular() {
  local numero="$1" pedido="$2"
  "$CLAUDE" -p "MODO SIMULACIÓN DEL PROCESO: no modifiques archivos ni lances agentes; puedes leer lo que necesites para decidir.
Diego pide: «$pedido»
Responde solo esto, en máximo 12 líneas:
TIPO: receta | chica | mediana | crítica | pregunta
AGENTES: en orden, con el modelo y el esfuerzo que usarías (o 'ninguno')
RECETAS: las de ecommerce-proceso:recetas que cargarías (o 'ninguna')
APROBACIÓN: dónde te detienes a pedirle aprobación a Diego
PREGUNTAS: lo que le preguntarías antes de empezar (o 'ninguna')" \
    --model "$MODELO" --max-turns 8 --disallowedTools "Edit,Write,NotebookEdit,Agent,Bash" \
    > "$SALIDA/caso-$numero.txt" 2>&1 || echo "(la sesión terminó con error)" >> "$SALIDA/caso-$numero.txt"
  echo "caso $numero listo"
}
export -f simular

cd "$REPO"
grep -E '^\| [0-9]+ \|' docs/proceso/casos-de-uso.md \
  | awk -F'|' -v casos=",$CASOS," '{ gsub(/^ +| +$/, "", $2); gsub(/^ +"|" +$/, "", $3);
      if (casos == ",," || index(casos, "," $2 ",")) print $2 "\t" $3 }' \
  | while IFS=$'\t' read -r numero pedido; do printf '%s\0%s\0' "$numero" "$pedido"; done \
  | xargs -0 -n 2 -P 5 bash -c 'simular "$0" "$1"'

echo "Resultados en: $SALIDA"
