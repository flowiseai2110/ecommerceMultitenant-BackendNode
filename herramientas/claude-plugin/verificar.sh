#!/usr/bin/env bash
# Valida, prueba y revisa los tipos del plugin. Uso: bash herramientas/claude-plugin/verificar.sh
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"

# El claude de npm puede ser viejo (los módulos de hooks piden 2.1.287+): se prefiere el de la extensión de VS Code.
CLAUDE="$(ls -d "$HOME"/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude.exe 2>/dev/null | sort -V | tail -1 || true)"
CLAUDE="${CLAUDE:-claude}"
echo "Claude Code: $("$CLAUDE" --version)"

"$CLAUDE" plugin validate "$AQUI"
"$CLAUDE" plugin validate "$AQUI/ecommerce-proceso"
"$CLAUDE" plugin test "$AQUI/ecommerce-proceso"
npx -y -p typescript@5.6.3 tsc -p "$AQUI/ecommerce-proceso/tsconfig.json"
echo "Tipos: OK"
