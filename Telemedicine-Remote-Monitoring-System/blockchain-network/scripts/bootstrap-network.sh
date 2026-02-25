#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE1_DIR="${ROOT_DIR}/node1"
NODE2_DIR="${ROOT_DIR}/node2"
NODE3_DIR="${ROOT_DIR}/node3"
GENESIS_FILE="${ROOT_DIR}/genesis.json"
NETWORK_ID="${NETWORK_ID:-1234}"
DEFAULT_PASSWORD="${NODE_PASSWORD:-dev-only-password-change-me}"
GETH_BIN="${GETH_BIN:-geth}"

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

extract_address() {
  local output="$1"
  local address
  address="$(printf '%s\n' "$output" | grep -Eo '0x[0-9a-fA-F]{40}' | head -n1 | sed 's/^0x//')"
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
    local existing
    existing="$(tr -d '[:space:]' < "$account_file" | tr '[:upper:]' '[:lower:]')"
    if [[ "$existing" =~ ^[0-9a-f]{40}$ ]]; then
      printf '%s\n' "$existing"
      return
    fi
  fi

  local output address
  output="$(env -u GETH_BIN "$GETH_BIN" --datadir "$node_dir" account new --password "${node_dir}/password.txt" 2>&1)"
  address="$(extract_address "$output")"
  printf '%s\n' "$address" > "$account_file"
  printf '%s\n' "$address"
}

build_extradata() {
  local signer1="$1"
  local signer2="$2"
  local signer3="$3"
  local vanity seal
  vanity="$(printf '0%.0s' {1..64})"
  seal="$(printf '0%.0s' {1..130})"
  printf '0x%s%s%s%s%s' "$vanity" "$signer1" "$signer2" "$signer3" "$seal"
}

write_genesis() {
  local signer1="$1"
  local signer2="$2"
  local signer3="$3"
  local extradata
  extradata="$(build_extradata "$signer1" "$signer2" "$signer3")"

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
    "terminalTotalDifficulty": 9223372036854775807,
    "terminalTotalDifficultyPassed": false,
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
    "${signer2}": { "balance": "0x3635C9ADC5DEA00000" },
    "${signer3}": { "balance": "0x3635C9ADC5DEA00000" }
  },
  "number": "0x0",
  "gasUsed": "0x0",
  "parentHash": "0x0000000000000000000000000000000000000000000000000000000000000000"
}
JSON
}

init_node() {
  local node_dir="$1"
  env -u GETH_BIN "$GETH_BIN" --datadir "$node_dir" init "$GENESIS_FILE" >/dev/null
}

main() {
  require_cmd "$GETH_BIN"
  require_supported_geth

  mkdir -p "$NODE1_DIR" "$NODE2_DIR" "$NODE3_DIR"

  local node1_account_file="${NODE1_DIR}/account.txt"
  local node2_account_file="${NODE2_DIR}/account.txt"
  local node3_account_file="${NODE3_DIR}/account.txt"
  local signer1 signer2 signer3

  signer1="$(ensure_account "$NODE1_DIR" "$node1_account_file")"
  signer2="$(ensure_account "$NODE2_DIR" "$node2_account_file")"
  signer3="$(ensure_account "$NODE3_DIR" "$node3_account_file")"

  write_genesis "$signer1" "$signer2" "$signer3"

  rm -rf "${NODE1_DIR}/geth" "${NODE2_DIR}/geth" "${NODE3_DIR}/geth"
  init_node "$NODE1_DIR"
  init_node "$NODE2_DIR"
  init_node "$NODE3_DIR"

  echo "Bootstrap complete."
  echo "Network ID: ${NETWORK_ID}"
  echo "Node1 signer address: 0x${signer1}"
  echo "Node2 signer address: 0x${signer2}"
  echo "Node3 signer address: 0x${signer3}"
  echo "Run: ./scripts/start-node.sh node1   (terminal 1)"
  echo "Run: ./scripts/start-node.sh node2   (terminal 2)"
  echo "Run: ./scripts/start-node.sh node3   (terminal 3)"
}

main "$@"
