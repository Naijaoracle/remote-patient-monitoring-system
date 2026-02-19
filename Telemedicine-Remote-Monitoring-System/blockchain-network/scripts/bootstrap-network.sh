#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE1_DIR="${ROOT_DIR}/node1"
NODE2_DIR="${ROOT_DIR}/node2"
GENESIS_FILE="${ROOT_DIR}/genesis.json"
NETWORK_ID="${NETWORK_ID:-1234}"
DEFAULT_PASSWORD="${NODE_PASSWORD:-dev-only-password-change-me}"

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

extract_address() {
  local output="$1"
  local address
  address="$(printf '%s\n' "$output" | sed -n "s/.*{\([0-9a-fA-F]\{40\)}.*/\1/p" | head -n1)"
  if [[ -z "$address" ]]; then
    echo "Failed to parse account address from: $output" >&2
    exit 1
  fi
  printf '%s' "${address,,}"
}

ensure_password_file() {
  local node_dir="$1"
  local password_file="${node_dir}/password.txt"
  if [[ ! -f "$password_file" ]]; then
    printf '%s\n' "$DEFAULT_PASSWORD" > "$password_file"
    chmod 600 "$password_file"
  fi
}

ensure_account() {
  local node_dir="$1"
  local account_file="$2"

  ensure_password_file "$node_dir"

  if [[ -f "$account_file" ]]; then
    cat "$account_file"
    return
  fi

  local output address
  output="$(geth --datadir "$node_dir" account new --password "${node_dir}/password.txt" 2>&1)"
  address="$(extract_address "$output")"
  printf '%s\n' "$address" > "$account_file"
  printf '%s\n' "$address"
}

build_extradata() {
  local signer1="$1"
  local signer2="$2"
  local vanity seal
  vanity="$(printf '0%.0s' {1..64})"
  seal="$(printf '0%.0s' {1..130})"
  printf '0x%s%s%s%s' "$vanity" "$signer1" "$signer2" "$seal"
}

write_genesis() {
  local signer1="$1"
  local signer2="$2"
  local extradata
  extradata="$(build_extradata "$signer1" "$signer2")"

  cat > "$GENESIS_FILE" <<JSON
{
  "config": {
    "chainId": ${NETWORK_ID},
    "homesteadBlock": 0,
    "eip150Block": 0,
    "eip155Block": 0,
    "eip158Block": 0,
    "byzantiumBlock": 0,
    "constantinopleBlock": 0,
    "petersburgBlock": 0,
    "istanbulBlock": 0,
    "berlinBlock": 0,
    "londonBlock": 0,
    "clique": {
      "period": 2,
      "epoch": 30000
    }
  },
  "nonce": "0x0",
  "timestamp": "0x0",
  "extraData": "${extradata}",
  "gasLimit": "0x1c9c380",
  "difficulty": "0x1",
  "mixHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
  "coinbase": "0x0000000000000000000000000000000000000000",
  "alloc": {
    "${signer1}": { "balance": "0x3635C9ADC5DEA00000" },
    "${signer2}": { "balance": "0x3635C9ADC5DEA00000" }
  },
  "number": "0x0",
  "gasUsed": "0x0",
  "parentHash": "0x0000000000000000000000000000000000000000000000000000000000000000"
}
JSON
}

init_node() {
  local node_dir="$1"
  geth --datadir "$node_dir" init "$GENESIS_FILE" >/dev/null
}

main() {
  require_cmd geth

  mkdir -p "$NODE1_DIR" "$NODE2_DIR"

  local node1_account_file="${NODE1_DIR}/account.txt"
  local node2_account_file="${NODE2_DIR}/account.txt"
  local signer1 signer2

  signer1="$(ensure_account "$NODE1_DIR" "$node1_account_file")"
  signer2="$(ensure_account "$NODE2_DIR" "$node2_account_file")"

  write_genesis "$signer1" "$signer2"

  init_node "$NODE1_DIR"
  init_node "$NODE2_DIR"

  echo "Bootstrap complete."
  echo "Network ID: ${NETWORK_ID}"
  echo "Node1 signer address: 0x${signer1}"
  echo "Node2 signer address: 0x${signer2}"
  echo "Run: ./scripts/start-node.sh node1   (terminal 1)"
  echo "Run: ./scripts/start-node.sh node2   (terminal 2)"
}

main "$@"
