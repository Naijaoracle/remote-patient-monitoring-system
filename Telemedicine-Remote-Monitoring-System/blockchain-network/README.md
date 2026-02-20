# Blockchain Network Setup (Local Dev)

This folder provides a minimal two-node Clique (PoA) network for local development.

## Scope
- Intended for local testing and demo validation.
- Not hardened for production.
- Secrets are generated locally and should remain untracked.

## Prerequisites
- `geth` **1.13.x** (required for `clique_propose` support).

If your system has newer geth installed, use the helper to install a pinned local binary:

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
- writes `node1/password.txt` and `node2/password.txt` if missing,
- generates `genesis.json` with the node signers,
- initializes both node data dirs.

Then start nodes in separate terminals:

```bash
./scripts/start-node.sh node1
./scripts/start-node.sh node2
```

Optional validator proposal (against node1 RPC by default):

```bash
./scripts/add-validator.sh 0x<validator_address>
```

## Files generated locally
- `node1/password.txt`
- `node2/password.txt`
- `node1/account.txt`
- `node2/account.txt`
- `genesis.json`
- geth runtime artifacts under each node directory

## Notes
- The network ID defaults to `1234` and can be overridden with `NETWORK_ID`.
- Scripts use `GETH_BIN` (default `geth`) and enforce a pinned `1.13.x` version.
- `start-node.sh` exposes RPC on `127.0.0.1` ports `8545` (node1) and `8546` (node2).
- If `genesis.json` is missing, `./scripts/init-network.sh` will call bootstrap automatically.
