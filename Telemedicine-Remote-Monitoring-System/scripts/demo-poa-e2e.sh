#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHAIN_DIR="${ROOT_DIR}/blockchain-network"
SC_DIR="${ROOT_DIR}/smart-contracts"
PORTAL_PORT="${PORTAL_PORT:-8113}"
PORTAL_HOST="${PORTAL_HOST:-127.0.0.1}"
CHAIN_RPC_PORT="${CHAIN_RPC_PORT:-8545}"
GETH_BIN="${GETH_BIN:-/tmp/geth-1.13.15/bin/geth}"
KEEP_RUNNING="${KEEP_RUNNING:-0}"
RPM_STORAGE_KEY_HEX="${RPM_STORAGE_KEY_HEX:-$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")}"
RPM_KEYSTORE_MASTER_KEY_HEX="${RPM_KEYSTORE_MASTER_KEY_HEX:-$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")}"
DEMO_OPERATOR_KEY="${DEMO_OPERATOR_KEY:-demo-operator-key}"

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

require_cmd node
require_cmd curl
require_cmd ss
require_cmd npx

detect_lan_ip() {
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  if [[ -z "${ip}" ]]; then
    ip="$(ip route get 1.1.1.1 2>/dev/null | awk '/src/ {for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}' || true)"
  fi
  printf '%s' "${ip}"
}

if [[ ! -x "$GETH_BIN" ]]; then
  if command -v geth >/dev/null 2>&1; then
    GETH_BIN="geth"
  else
    echo "No usable geth binary found. Set GETH_BIN to a valid path." >&2
    exit 1
  fi
fi

kill_listener_on_port() {
  local port="$1"
  local pid
  pid="$(ss -ltnp | awk -v port=":${port}" '$4 ~ port {print $NF}' | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | head -n1 || true)"
  if [[ -n "${pid}" ]]; then
    kill "$pid" 2>/dev/null || true
  fi
}

cleanup() {
  if [[ "$KEEP_RUNNING" == "1" ]]; then
    return
  fi
  set +e
  if [[ -f /tmp/rpm-e2e-portal.pid ]]; then kill "$(cat /tmp/rpm-e2e-portal.pid)" 2>/dev/null || true; fi
  if [[ -f /tmp/rpm-e2e-n1.pid ]]; then kill "$(cat /tmp/rpm-e2e-n1.pid)" 2>/dev/null || true; fi
  if [[ -f /tmp/rpm-e2e-n2.pid ]]; then kill "$(cat /tmp/rpm-e2e-n2.pid)" 2>/dev/null || true; fi
  if [[ -f /tmp/rpm-e2e-n3.pid ]]; then kill "$(cat /tmp/rpm-e2e-n3.pid)" 2>/dev/null || true; fi
}
trap cleanup EXIT

for port in "$PORTAL_PORT" 8545 8546 8547 30303 30304 30305; do
  kill_listener_on_port "$port"
done
sleep 1

echo "[1/6] Bootstrapping 3-validator PoA chain"
(
  cd "$CHAIN_DIR"
  GETH_BIN="$GETH_BIN" ./scripts/bootstrap-network.sh >/tmp/rpm-e2e-bootstrap.log 2>&1
  if [[ "$KEEP_RUNNING" == "1" ]]; then
    NO_CONSOLE=1 GETH_BIN="$GETH_BIN" nohup ./scripts/start-node.sh node1 >/tmp/rpm-e2e-node1.log 2>&1 & echo $! >/tmp/rpm-e2e-n1.pid
    NO_CONSOLE=1 GETH_BIN="$GETH_BIN" nohup ./scripts/start-node.sh node2 >/tmp/rpm-e2e-node2.log 2>&1 & echo $! >/tmp/rpm-e2e-n2.pid
    NO_CONSOLE=1 GETH_BIN="$GETH_BIN" nohup ./scripts/start-node.sh node3 >/tmp/rpm-e2e-node3.log 2>&1 & echo $! >/tmp/rpm-e2e-n3.pid
  else
    NO_CONSOLE=1 GETH_BIN="$GETH_BIN" ./scripts/start-node.sh node1 >/tmp/rpm-e2e-node1.log 2>&1 & echo $! >/tmp/rpm-e2e-n1.pid
    NO_CONSOLE=1 GETH_BIN="$GETH_BIN" ./scripts/start-node.sh node2 >/tmp/rpm-e2e-node2.log 2>&1 & echo $! >/tmp/rpm-e2e-n2.pid
    NO_CONSOLE=1 GETH_BIN="$GETH_BIN" ./scripts/start-node.sh node3 >/tmp/rpm-e2e-node3.log 2>&1 & echo $! >/tmp/rpm-e2e-n3.pid
  fi
  sleep 4
  ./scripts/connect-peers.sh >/tmp/rpm-e2e-peers.log 2>&1 || true
)

echo "[2/6] Deploying contracts (Truffle -> private_network)"
V1="0x$(cat "$CHAIN_DIR/node1/account.txt")"
V2="0x$(cat "$CHAIN_DIR/node2/account.txt")"
V3="0x$(cat "$CHAIN_DIR/node3/account.txt")"
INITIAL_VALIDATORS="${V1},${V2},${V3}"
(
  cd "$SC_DIR"
  INITIAL_VALIDATORS="$INITIAL_VALIDATORS" TRUFFLE_FROM="$V1" npx truffle migrate --network private_network --reset >/tmp/rpm-e2e-migrate.log 2>&1
)
MEASUREMENT_CONTRACT_ADDRESS="$(
  cd "$SC_DIR"
  node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync("build/contracts/Measurement.json","utf8"));const n=j.networks&&j.networks["1234"];if(!n||!n.address){process.exit(2)};console.log(n.address)'
)"

echo "[3/6] Starting portal with on-chain adapter"
(
  cd "$ROOT_DIR"
  if [[ "$KEEP_RUNNING" == "1" ]]; then
    HOST="$PORTAL_HOST" \
    PORT="$PORTAL_PORT" \
    DEMO_OPERATOR_KEY="$DEMO_OPERATOR_KEY" \
    CHAIN_RPC_URL="http://127.0.0.1:${CHAIN_RPC_PORT}" \
    MEASUREMENT_CONTRACT_ADDRESS="$MEASUREMENT_CONTRACT_ADDRESS" \
    RPM_STORAGE_KEY_HEX="$RPM_STORAGE_KEY_HEX" \
    RPM_KEYSTORE_MASTER_KEY_HEX="$RPM_KEYSTORE_MASTER_KEY_HEX" \
    nohup node demo/portal-server.js >/tmp/rpm-e2e-portal.log 2>&1 & echo $! >/tmp/rpm-e2e-portal.pid
  else
    HOST="$PORTAL_HOST" \
    PORT="$PORTAL_PORT" \
    DEMO_OPERATOR_KEY="$DEMO_OPERATOR_KEY" \
    CHAIN_RPC_URL="http://127.0.0.1:${CHAIN_RPC_PORT}" \
    MEASUREMENT_CONTRACT_ADDRESS="$MEASUREMENT_CONTRACT_ADDRESS" \
    RPM_STORAGE_KEY_HEX="$RPM_STORAGE_KEY_HEX" \
    RPM_KEYSTORE_MASTER_KEY_HEX="$RPM_KEYSTORE_MASTER_KEY_HEX" \
    node demo/portal-server.js >/tmp/rpm-e2e-portal.log 2>&1 & echo $! >/tmp/rpm-e2e-portal.pid
  fi
)
sleep 2

if [[ "$PORTAL_HOST" == "0.0.0.0" ]]; then
  LAN_IP="$(detect_lan_ip)"
  if [[ -n "${LAN_IP}" ]]; then
    echo "Mobile URL: http://${LAN_IP}:${PORTAL_PORT}"
  fi
fi

echo "[4/6] Running demo init + actor + consent + submit"
curl -s -X POST "http://127.0.0.1:${PORTAL_PORT}/api/init" \
  -H 'Content-Type: application/json' \
  -H "x-api-key: ${DEMO_OPERATOR_KEY}" \
  --data "{\"deviceId\":\"0x1111111111111111111111111111111111111111\",\"centralId\":\"0x2222222222222222222222222222222222222222\",\"validatorId\":\"${V1}\"}" \
  > /tmp/rpm-e2e-init.json

curl -s -X POST "http://127.0.0.1:${PORTAL_PORT}/api/actors" \
  -H 'Content-Type: application/json' \
  -H "x-api-key: ${DEMO_OPERATOR_KEY}" \
  --data '{"actorId":"clinician-001","role":"clinician","org":"clinic-a","scopes":["treatment"],"active":true}' \
  > /tmp/rpm-e2e-actor.json

curl -s -X POST "http://127.0.0.1:${PORTAL_PORT}/api/consent" \
  -H 'Content-Type: application/json' \
  -H "x-api-key: ${DEMO_OPERATOR_KEY}" \
  --data '{"patientId":"patient-001","granted":true,"reason":"demo","purposes":["treatment"],"allowedActorIds":["clinician-001"]}' \
  > /tmp/rpm-e2e-consent.json

curl -s -X POST "http://127.0.0.1:${PORTAL_PORT}/api/submit" \
  -H 'Content-Type: application/json' \
  -H "x-api-key: ${DEMO_OPERATOR_KEY}" \
  --data '{"actorId":"clinician-001","type":"heart_rate","value":"76","unit":"bpm","patientId":"patient-001","purpose":"treatment"}' \
  > /tmp/rpm-e2e-submit.json

echo "[5/6] Verifying on-chain receipt and peer majority"
ONCHAIN_TX="$(node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync("/tmp/rpm-e2e-submit.json","utf8"));process.stdout.write((j.stored&&j.stored.onChainTxHash)||"")')"
if [[ -z "$ONCHAIN_TX" ]]; then
  echo "Submit response missing onChainTxHash." >&2
  cat /tmp/rpm-e2e-submit.json >&2
  exit 1
fi

RECEIPT_JSON="$(curl -s -X POST "http://127.0.0.1:${CHAIN_RPC_PORT}" -H 'Content-Type: application/json' --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getTransactionReceipt\",\"params\":[\"${ONCHAIN_TX}\"],\"id\":1}")"
RECEIPT_STATUS="$(printf '%s' "$RECEIPT_JSON" | node -e 'const x=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write((x.result&&x.result.status)||"")')"
if [[ "$RECEIPT_STATUS" != "0x1" ]]; then
  echo "On-chain receipt status is not success: ${RECEIPT_STATUS:-<empty>}" >&2
  echo "$RECEIPT_JSON" >&2
  exit 1
fi

PEER_8545="$(curl -s -X POST http://127.0.0.1:8545 -H 'Content-Type: application/json' --data '{"jsonrpc":"2.0","method":"net_peerCount","params":[],"id":1}' | node -e 'const x=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(String(x.result||""))')"
PEER_8546="$(curl -s -X POST http://127.0.0.1:8546 -H 'Content-Type: application/json' --data '{"jsonrpc":"2.0","method":"net_peerCount","params":[],"id":1}' | node -e 'const x=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(String(x.result||""))')"
PEER_8547="$(curl -s -X POST http://127.0.0.1:8547 -H 'Content-Type: application/json' --data '{"jsonrpc":"2.0","method":"net_peerCount","params":[],"id":1}' | node -e 'const x=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(String(x.result||""))')"

echo "[6/6] Success"
echo "validators=${V1},${V2},${V3}"
echo "measurementContract=${MEASUREMENT_CONTRACT_ADDRESS}"
echo "onChainTxHash=${ONCHAIN_TX}"
echo "receiptStatus=${RECEIPT_STATUS}"
echo "peerCount8545=${PEER_8545} peerCount8546=${PEER_8546} peerCount8547=${PEER_8547}"
echo "logs:"
echo "  /tmp/rpm-e2e-bootstrap.log"
echo "  /tmp/rpm-e2e-node1.log /tmp/rpm-e2e-node2.log /tmp/rpm-e2e-node3.log"
echo "  /tmp/rpm-e2e-migrate.log"
echo "  /tmp/rpm-e2e-portal.log"
echo "  /tmp/rpm-e2e-submit.json"
