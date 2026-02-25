#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHAIN_DIR="${ROOT_DIR}/blockchain-network"
ENV_FILE="${ROOT_DIR}/.env.compose"
GETH_BIN="${GETH_BIN:-geth}"

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

require_cmd docker
require_cmd openssl

(
  cd "$CHAIN_DIR"
  GETH_BIN="$GETH_BIN" ./scripts/bootstrap-network.sh
)

NODE1_ACCOUNT="0x$(tr -d '[:space:]' < "${CHAIN_DIR}/node1/account.txt")"
NODE2_ACCOUNT="0x$(tr -d '[:space:]' < "${CHAIN_DIR}/node2/account.txt")"
NODE3_ACCOUNT="0x$(tr -d '[:space:]' < "${CHAIN_DIR}/node3/account.txt")"

RPM_STORAGE_KEY_HEX="${RPM_STORAGE_KEY_HEX:-$(openssl rand -hex 32)}"
RPM_KEYSTORE_MASTER_KEY_HEX="${RPM_KEYSTORE_MASTER_KEY_HEX:-$(openssl rand -hex 32)}"
DEMO_OPERATOR_KEY="${DEMO_OPERATOR_KEY:-demo-operator-key}"
DEMO_VIEWER_KEY="${DEMO_VIEWER_KEY:-demo-viewer-key}"
MEASUREMENT_CONTRACT_ADDRESS="${MEASUREMENT_CONTRACT_ADDRESS:-}"

cat > "$ENV_FILE" <<EOF
NODE1_ACCOUNT=${NODE1_ACCOUNT}
NODE2_ACCOUNT=${NODE2_ACCOUNT}
NODE3_ACCOUNT=${NODE3_ACCOUNT}
RPM_STORAGE_KEY_HEX=${RPM_STORAGE_KEY_HEX}
RPM_KEYSTORE_MASTER_KEY_HEX=${RPM_KEYSTORE_MASTER_KEY_HEX}
DEMO_OPERATOR_KEY=${DEMO_OPERATOR_KEY}
DEMO_VIEWER_KEY=${DEMO_VIEWER_KEY}
MEASUREMENT_CONTRACT_ADDRESS=${MEASUREMENT_CONTRACT_ADDRESS}
EOF

echo "Wrote ${ENV_FILE}"
docker compose --env-file "$ENV_FILE" -f "${ROOT_DIR}/docker-compose.yml" up -d

echo "Compose stack started."
echo "Portal: http://127.0.0.1:8099"
echo "Operator API key: ${DEMO_OPERATOR_KEY}"
echo "Viewer API key: ${DEMO_VIEWER_KEY}"
echo "Tip: if you deploy Measurement contract, set MEASUREMENT_CONTRACT_ADDRESS in ${ENV_FILE} and re-run."
