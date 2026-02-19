#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if ! command -v rg >/dev/null 2>&1; then
  echo "rg is required for lint-static.sh" >&2
  exit 1
fi

mapfile -t JS_FILES < <(
  rg --files . \
    -g '*.js' \
    -g '!**/node_modules/**' \
    -g '!**/.data/**'
)

if [[ "${#JS_FILES[@]}" -eq 0 ]]; then
  echo "No JavaScript files found."
  exit 0
fi

echo "Checking JavaScript syntax (${#JS_FILES[@]} files)..."
for file in "${JS_FILES[@]}"; do
  node --check "${file}"
done

echo "Checking for zero-byte source files in active runtime paths..."
if find ./demo ./mobile-app/services ./mobile-app/utils ./test ./smart-contracts/contracts ./scripts \
  -type f \( -name '*.js' -o -name '*.sol' -o -name '*.sh' \) -size 0 \
  -not -path '*/node_modules/*' \
  -not -path '*/.git/*' | grep -q .; then
  echo "Zero-byte source files detected:" >&2
  find ./demo ./mobile-app/services ./mobile-app/utils ./test ./smart-contracts/contracts ./scripts \
    -type f \( -name '*.js' -o -name '*.sol' -o -name '*.sh' \) -size 0 \
    -not -path '*/node_modules/*' \
    -not -path '*/.git/*' >&2
  exit 1
fi

echo "Lint/static baseline passed."
