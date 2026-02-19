#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -s "${ROOT_DIR}/genesis.json" ]]; then
  echo "No usable genesis.json found. Generating one now..."
  "${ROOT_DIR}/scripts/bootstrap-network.sh"
  exit 0
fi

geth --datadir "${ROOT_DIR}/node1" init "${ROOT_DIR}/genesis.json"
geth --datadir "${ROOT_DIR}/node2" init "${ROOT_DIR}/genesis.json"

echo "Blockchain network initialized from existing genesis.json"
