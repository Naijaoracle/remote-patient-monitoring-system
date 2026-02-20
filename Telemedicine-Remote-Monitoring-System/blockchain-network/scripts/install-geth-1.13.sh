#!/usr/bin/env bash
set -euo pipefail

GETH_113_URL="${GETH_113_URL:-https://gethstore.blob.core.windows.net/builds/geth-linux-amd64-1.13.15-c5ba367e.tar.gz}"
INSTALL_ROOT="${INSTALL_ROOT:-/tmp/geth-1.13.15}"
BIN_DIR="${INSTALL_ROOT}/bin"

mkdir -p "$INSTALL_ROOT" "$BIN_DIR"
TMP_TGZ="${INSTALL_ROOT}/geth-1.13.15.tar.gz"

curl -fL "$GETH_113_URL" -o "$TMP_TGZ"
tar -xzf "$TMP_TGZ" -C "$INSTALL_ROOT"
GETH_PATH="$(find "$INSTALL_ROOT" -type f -name geth | head -n1)"
if [[ -z "$GETH_PATH" ]]; then
  echo "Failed to locate geth binary after extraction" >&2
  exit 1
fi
install -m 0755 "$GETH_PATH" "${BIN_DIR}/geth"
"${BIN_DIR}/geth" version | sed -n '1,8p'

echo
echo "Installed geth 1.13.x binary:" 
echo "  ${BIN_DIR}/geth"
echo "Use it with:" 
echo "  export GETH_BIN=${BIN_DIR}/geth"
