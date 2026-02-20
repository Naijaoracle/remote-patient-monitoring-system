#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_NAME="${1:-}"
NETWORK_ID="${NETWORK_ID:-1234}"
HTTP_HOST="${HTTP_HOST:-127.0.0.1}"
GETH_BIN="${GETH_BIN:-geth}"

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

require_pinned_geth() {
  local version_line
  version_line="$("$GETH_BIN" version 2>/dev/null | sed -n 's/^Version: //p' | head -n1)"
  if [[ ! "$version_line" =~ ^1\.13\. ]]; then
    echo "Unsupported geth version: ${version_line:-unknown}" >&2
    echo "This local Clique flow is pinned to geth 1.13.x for clique_propose support." >&2
    echo "Set GETH_BIN to a 1.13.x binary path." >&2
    exit 1
  fi
}

if [[ -z "$NODE_NAME" ]]; then
  echo "Usage: ./scripts/start-node.sh <node1|node2>"
  exit 1
fi

require_cmd "$GETH_BIN"
require_pinned_geth

case "$NODE_NAME" in
  node1)
    PORT=30303
    HTTP_PORT=8545
    ;;
  node2)
    PORT=30304
    HTTP_PORT=8546
    ;;
  *)
    echo "Unknown node: $NODE_NAME (expected node1 or node2)"
    exit 1
    ;;
esac

NODE_DIR="${ROOT_DIR}/${NODE_NAME}"
PASSWORD_FILE="${NODE_DIR}/password.txt"
GENESIS_FILE="${ROOT_DIR}/genesis.json"
IPC_PATH="/tmp/rpm-${NODE_NAME}.ipc"
ACCOUNT_FILE="${NODE_DIR}/account.txt"

if [[ ! -s "$GENESIS_FILE" ]]; then
  echo "Missing genesis file. Run ./scripts/bootstrap-network.sh first."
  exit 1
fi

if [[ ! -f "$PASSWORD_FILE" ]]; then
  echo "Missing ${PASSWORD_FILE}. Run ./scripts/bootstrap-network.sh first."
  exit 1
fi

if [[ ! -f "$ACCOUNT_FILE" ]]; then
  echo "Missing ${ACCOUNT_FILE}. Run ./scripts/bootstrap-network.sh first."
  exit 1
fi

ETHERBASE="0x$(tr -d '[:space:]' < "$ACCOUNT_FILE")"

echo "Starting ${NODE_NAME} on http://${HTTP_HOST}:${HTTP_PORT}"
exec env -u GETH_BIN "$GETH_BIN" \
  --datadir "$NODE_DIR" \
  --ipcpath "$IPC_PATH" \
  --networkid "$NETWORK_ID" \
  --port "$PORT" \
  --http \
  --http.addr "$HTTP_HOST" \
  --http.port "$HTTP_PORT" \
  --http.api "admin,eth,net,web3,personal,miner,clique" \
  --allow-insecure-unlock \
  --unlock "0" \
  --password "$PASSWORD_FILE" \
  --miner.etherbase "$ETHERBASE" \
  --mine \
  --syncmode full \
  --verbosity 3 \
  console
