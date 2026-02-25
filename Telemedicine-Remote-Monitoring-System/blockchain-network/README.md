# Blockchain Network Setup (Local Dev)

This folder provides a minimal local Clique (PoA) network for development.

## Scope
- Intended for local testing and demo validation.
- Not hardened for production.
- Secrets are generated locally and should remain untracked.

## Prerequisites
- `geth` **1.13.x or 1.17.x** for local Clique dev.

If you want to use a local pinned binary instead of the system one:

```bash
./scripts/install-geth-1.13.sh
export GETH_BIN=/tmp/geth-1.13.15/bin/geth
```

## Quick Start
From `Telemedicine-Remote-Monitoring-System/blockchain-network`:

```bash
./scripts/bootstrap-network.sh
```

This command:
- creates node accounts if missing,
- writes `node1/password.txt`, `node2/password.txt`, and `node3/password.txt` if missing,
- generates `genesis.json` with the node signers,
- initializes all node data dirs.

Then start nodes in separate terminals:

```bash
./scripts/start-node.sh node1
./scripts/start-node.sh node2
./scripts/start-node.sh node3
```

For headless/background runs (no interactive geth console), use:

```bash
NO_CONSOLE=1 ./scripts/start-node.sh node1
```

Then connect active nodes as peers:

```bash
./scripts/connect-peers.sh
```

Optional validator proposal (against node1 RPC by default):

```bash
./scripts/add-validator.sh 0x<validator_address>
```

## Files generated locally
- `node1/password.txt`
- `node2/password.txt`
- `node3/password.txt`
- `node1/account.txt`
- `node2/account.txt`
- `node3/account.txt`
- `genesis.json`
- geth runtime artifacts under each node directory

## Notes
- The network ID defaults to `1234` and can be overridden with `NETWORK_ID`.
- Scripts use `GETH_BIN` (default `geth`) and accept `1.13.x` and `1.17.x`.
- `start-node.sh` exposes RPC on `127.0.0.1` ports `8545` (node1), `8546` (node2), and `8547` (node3).
- `start-node.sh` includes `--allow-insecure-unlock` only for local demo signing flows and refuses non-local `HTTP_HOST` unless `ALLOW_NONLOCAL_RPC=1`.
- `personal` RPC namespace is disabled; unlocked-account transaction submission uses `eth_sendTransaction`.
- If `genesis.json` is missing, `./scripts/init-network.sh` will call bootstrap automatically.
