#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 1 ]]; then
  echo "Usage: ./scripts/add-validator.sh <validator_address>"
  exit 1
fi

VALIDATOR_ADDRESS="$1"
RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"

echo "Proposing validator on ${RPC_URL}: ${VALIDATOR_ADDRESS}"
geth attach "${RPC_URL}" <<EOF_INNER
clique.propose('${VALIDATOR_ADDRESS}', true)
EOF_INNER
