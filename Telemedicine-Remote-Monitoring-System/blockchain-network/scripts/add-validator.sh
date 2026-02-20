#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 1 ]]; then
  echo "Usage: ./scripts/add-validator.sh <validator_address>"
  exit 1
fi

VALIDATOR_ADDRESS="$1"
RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
GETH_BIN="${GETH_BIN:-geth}"

version_line="$("$GETH_BIN" version 2>/dev/null | sed -n 's/^Version: //p' | head -n1)"
if [[ ! "$version_line" =~ ^1\.13\. ]]; then
  echo "Unsupported geth version: ${version_line:-unknown}" >&2
  echo "This script expects geth 1.13.x with clique_propose support." >&2
  exit 1
fi

echo "Proposing validator on ${RPC_URL}: ${VALIDATOR_ADDRESS}"
env -u GETH_BIN "$GETH_BIN" attach "${RPC_URL}" <<EOF_INNER
clique.propose('${VALIDATOR_ADDRESS}', true)
EOF_INNER
