#!/usr/bin/env bash
set -euo pipefail

get_node_info() {
  local port="$1"
  curl -s -X POST "http://127.0.0.1:${port}" \
    -H 'Content-Type: application/json' \
    --data '{"jsonrpc":"2.0","method":"admin_nodeInfo","params":[],"id":1}'
}

extract_enode() {
  node -e "const x = JSON.parse(process.argv[1]); console.log((x.result && x.result.enode) ? x.result.enode : '')" "$1"
}

add_peer() {
  local port="$1"
  local enode="$2"
  curl -s -X POST "http://127.0.0.1:${port}" \
    -H 'Content-Type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"method\":\"admin_addPeer\",\"params\":[\"${enode}\"],\"id\":1}" >/dev/null
}

ports=(8545 8546 8547)
declare -A enodes

for p in "${ports[@]}"; do
  info="$(get_node_info "$p" || true)"
  enode="$(extract_enode "$info" 2>/dev/null || true)"
  if [[ -n "${enode}" ]]; then
    enodes["$p"]="$enode"
  fi
done

for from_port in "${!enodes[@]}"; do
  for to_port in "${!enodes[@]}"; do
    if [[ "$from_port" == "$to_port" ]]; then
      continue
    fi
    add_peer "$from_port" "${enodes[$to_port]}"
  done
done

echo "Connected peers among active nodes:"
for p in "${!enodes[@]}"; do
  count="$(curl -s -X POST "http://127.0.0.1:${p}" -H 'Content-Type: application/json' --data '{"jsonrpc":"2.0","method":"net_peerCount","params":[],"id":1}' | node -e 'const x=JSON.parse(require("fs").readFileSync(0,"utf8")); console.log(x.result||"0x0")')"
  echo "  port ${p} -> peerCount=${count}"
done
