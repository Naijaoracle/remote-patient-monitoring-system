#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GETH_BIN="${GETH_BIN:-geth}"

if [[ ! -s "${ROOT_DIR}/genesis.json" ]]; then
  echo "No usable genesis.json found. Generating one now..."
  "${ROOT_DIR}/scripts/bootstrap-network.sh"
  exit 0
fi

env -u GETH_BIN "$GETH_BIN" --datadir "${ROOT_DIR}/node1" init "${ROOT_DIR}/genesis.json"
env -u GETH_BIN "$GETH_BIN" --datadir "${ROOT_DIR}/node2" init "${ROOT_DIR}/genesis.json"

echo "Blockchain network initialized from existing genesis.json"
