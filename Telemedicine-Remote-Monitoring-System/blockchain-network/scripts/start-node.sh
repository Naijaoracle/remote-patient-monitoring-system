#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_NAME="${1:-}"
NETWORK_ID="${NETWORK_ID:-1234}"
HTTP_HOST="${HTTP_HOST:-127.0.0.1}"
P2P_HOST="${P2P_HOST:-127.0.0.1}"
GETH_BIN="${GETH_BIN:-geth}"
ALLOW_INSECURE_UNLOCK="${ALLOW_INSECURE_UNLOCK:-1}"
ALLOW_NONLOCAL_RPC="${ALLOW_NONLOCAL_RPC:-0}"

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

require_supported_geth() {
  local version_line
  version_line="$("$GETH_BIN" version 2>/dev/null | sed -n 's/^Version: //p' | head -n1)"
  if [[ "$version_line" =~ ^1\.13\. ]]; then
    return
  fi
  if [[ "$version_line" =~ ^1\.17\. ]]; then
    echo "Using geth ${version_line} (supported with Clique legacy mode)." >&2
    return
  fi
  if [[ ! "$version_line" =~ ^1\.13\.|^1\.17\. ]]; then
    echo "Unsupported geth version: ${version_line:-unknown}" >&2
    echo "This local Clique flow supports geth 1.13.x and 1.17.x." >&2
    echo "Set GETH_BIN to a supported binary path." >&2
    exit 1
  fi
}

if [[ -z "$NODE_NAME" ]]; then
  echo "Usage: ./scripts/start-node.sh <node1|node2|node3>"
  exit 1
fi

require_cmd "$GETH_BIN"
require_supported_geth

case "$NODE_NAME" in
  node1)
    PORT=30303
    HTTP_PORT=8545
    AUTHRPC_PORT=8551
    ;;
  node2)
    PORT=30304
    HTTP_PORT=8546
    AUTHRPC_PORT=8552
    ;;
  node3)
    PORT=30305
    HTTP_PORT=8547
    AUTHRPC_PORT=8553
    ;;
  *)
    echo "Unknown node: $NODE_NAME (expected node1, node2, or node3)"
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
cmd=(
  env -u GETH_BIN "$GETH_BIN"
  --datadir "$NODE_DIR"
  --ipcpath "$IPC_PATH"
  --networkid "$NETWORK_ID"
  --port "$PORT"
  --nat "extip:${P2P_HOST}"
  --http
  --http.addr "$HTTP_HOST"
  --http.port "$HTTP_PORT"
  --http.api "admin,eth,net,web3,miner,clique"
  --authrpc.addr "$HTTP_HOST"
  --authrpc.port "$AUTHRPC_PORT"
  --miner.etherbase "$ETHERBASE"
  --mine
  --syncmode full
  --verbosity 3
)

if [[ "$ALLOW_INSECURE_UNLOCK" == "1" ]]; then
  if [[ "$HTTP_HOST" != "127.0.0.1" && "$HTTP_HOST" != "localhost" && "$ALLOW_NONLOCAL_RPC" != "1" ]]; then
    echo "Refusing to start with --allow-insecure-unlock on non-local HTTP host ${HTTP_HOST}."
    echo "Set ALLOW_NONLOCAL_RPC=1 only for isolated demo networks."
    exit 1
  fi
  cmd+=(
    --allow-insecure-unlock
    --unlock "$ETHERBASE"
    --password "$PASSWORD_FILE"
  )
fi

if [[ "${NO_CONSOLE:-0}" != "1" ]]; then
  cmd+=(console)
fi

exec "${cmd[@]}"
