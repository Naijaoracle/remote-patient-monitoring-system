#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_NAME="${1:-}"
NETWORK_ID="${NETWORK_ID:-1234}"
HTTP_HOST="${HTTP_HOST:-127.0.0.1}"

if [[ -z "$NODE_NAME" ]]; then
  echo "Usage: ./scripts/start-node.sh <node1|node2>"
  exit 1
fi

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

if [[ ! -s "$GENESIS_FILE" ]]; then
  echo "Missing genesis file. Run ./scripts/bootstrap-network.sh first."
  exit 1
fi

if [[ ! -f "$PASSWORD_FILE" ]]; then
  echo "Missing ${PASSWORD_FILE}. Run ./scripts/bootstrap-network.sh first."
  exit 1
fi

echo "Starting ${NODE_NAME} on http://${HTTP_HOST}:${HTTP_PORT}"
exec geth \
  --datadir "$NODE_DIR" \
  --networkid "$NETWORK_ID" \
  --port "$PORT" \
  --http \
  --http.addr "$HTTP_HOST" \
  --http.port "$HTTP_PORT" \
  --http.api "admin,eth,net,web3,personal,miner,clique" \
  --allow-insecure-unlock \
  --unlock "0" \
  --password "$PASSWORD_FILE" \
  --mine \
  --syncmode full \
  --verbosity 3 \
  console
