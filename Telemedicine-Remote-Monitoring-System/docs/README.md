# Telemedicine Remote Monitoring System Docs

This project is a prototype remote patient monitoring system that combines:

- BLE proximity-based measurement flow
- Signature verification and auditability
- Local blockchain-backed validation

## Consensus + Flow

The local blockchain design is **Proof of Authority (PoA)**.

- **PoA network:** Clique validators (`geth 1.13.x` or `1.17.x`) with validator governance via `ValidatorManager`.
- **BLE proximity gate:** client confirms nearby BLE connectivity before submission.
- **Submission path:** BLE/proximity -> signed payload -> validator acceptance -> optional on-chain hash anchoring.

This matches the paper-level intended workflow at prototype scope.

## Quick Start

From `Telemedicine-Remote-Monitoring-System`:

```bash
npm install
npm test
npm run demo:portal
npm run demo:poa:e2e
```

`demo:poa:e2e` runs a full local validation: 3 validators, Truffle deploy, portal init/submit, and on-chain receipt success check.

Demo URL:

- `http://127.0.0.1:8099/`

Optional local PoA chain:

```bash
cd blockchain-network
# Optional if you want a local pinned binary:
./scripts/install-geth-1.13.sh
export GETH_BIN=/tmp/geth-1.13.15/bin/geth
./scripts/bootstrap-network.sh
./scripts/start-node.sh node1
./scripts/start-node.sh node2
./scripts/start-node.sh node3
./scripts/connect-peers.sh
```

## Smart Contract Validation

From `smart-contracts`:

```bash
npm run test:hardhat
```

With local nodes running, Truffle can target the Clique network:

```bash
npm run test:truffle
```

Foundry tests:

```bash
npm run test:foundry
```

## Flutter MVP Client

The minimal Flutter client is at:

- `rpm_flutter_client/`

It supports:

1. BLE scan/connect (proximity confirmation)
2. Actor + consent setup against demo API
3. Demo init (`/api/init`)
4. Measurement submit (`/api/submit`)
5. Device Simulator mode for two-phone BLE advertising tests

Run:

```bash
cd rpm_flutter_client
flutter pub get
flutter run
```

Default API URL in app:

- `http://127.0.0.1:8099`

Two-phone topology:

1. Laptop runs demo API + PoA nodes
2. Phone B runs app in Device Simulator mode (BLE peripheral advertiser)
3. Phone A runs app in Gateway mode (BLE scan + submit)

To enable on-chain anchoring from `/api/submit`, set:

- `CHAIN_RPC_URL`
- `MEASUREMENT_CONTRACT_ADDRESS`

For secure startup, set both:

- `RPM_STORAGE_KEY_HEX`
- `RPM_KEYSTORE_MASTER_KEY_HEX`

Or explicitly opt into demo fallback keys with:

- `ALLOW_DEMO_INSECURE_KEYS=1`

Note: demo backend `/api/init` currently validates simulated device IDs as EVM-style addresses (e.g. `0x1111...`), not BLE MAC strings.

## Developer Quality Gates

Repository-level commands:

- `npm run lint`
- `npm test`
- `npm run security:baseline`
- `npm run ci:check`
- `npm run audit:verify -- <path/to/export-package.json>`

CI workflow:

- `.github/workflows/ci.yml`
  - App quality checks (lint + JS tests)
  - Smart contract Hardhat tests
  - Security baseline scan with artifact export (`reports/security`)

BLE adapter conformance:

- `test/helpers/ble-adapter-contract.js` defines the adapter contract suite.
- `test/unit/ble-adapter-contract.test.js` applies the suite to `SimulatedBleAdapter`.
- Any future real BLE adapter should add a matching conformance test file before merge.

Compliance governance:

- `docs/compliance/GOVERNANCE.md` defines audit export schema versioning and signing key lifecycle procedures.

## Related Docs

- Demo portal usage: `demo/README.md`
- Local chain setup: `blockchain-network/README.md`
- Installation details: `docs/INSTALLATION.md`
- API notes: `docs/API.md`
- Architecture diagram notes: `docs/architecture/README.md`
