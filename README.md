# Remote Patient Monitoring System (Prototype)

This repository contains a prototype remote patient monitoring system that combines:
- BLE proximity-based measurement flow
- Signature verification and auditability
- A local blockchain-backed validation pipeline

Goal: reduce risk of fake or replayed measurements by requiring trusted-device and validation steps.

This project is a work in progress and is **not** production-ready.

## Quick Start

### 1. Install dependencies
```bash
cd Telemedicine-Remote-Monitoring-System
npm install
```

### 2. Run tests
```bash
npm test
```

### 3. Run the local demo portal
```bash
npm run demo:portal
```
Then open:
- `http://127.0.0.1:8099/`

### 4. (Optional) Start local blockchain network
Requires `geth 1.13.x` (for Clique validator proposal APIs).

```bash
cd Telemedicine-Remote-Monitoring-System/blockchain-network
./scripts/install-geth-1.13.sh
export GETH_BIN=/tmp/geth-1.13.15/bin/geth
./scripts/bootstrap-network.sh
./scripts/start-node.sh node1
./scripts/start-node.sh node2
```

## Documentation

- System docs: `Telemedicine-Remote-Monitoring-System/docs/README.md`
- Demo portal usage: `Telemedicine-Remote-Monitoring-System/demo/README.md`
- Local chain setup: `Telemedicine-Remote-Monitoring-System/blockchain-network/README.md`
- Installation details: `Telemedicine-Remote-Monitoring-System/docs/INSTALLATION.md`
- API notes: `Telemedicine-Remote-Monitoring-System/docs/API.md`

## Security and Repo Hygiene

- Keep secrets in untracked env files (`Telemedicine-Remote-Monitoring-System/.env.example`).
- Generated local chain data and node secrets are ignored.
- Keep private extension logic outside public source control.
- Optional local hook file path: `Telemedicine-Remote-Monitoring-System/extensions/hooks/hooks.local.js` (gitignored).

## Research Context

Background paper:
- https://www.researchgate.net/publication/377029947_A_proposal_for_improving_the_data_security_of_remote_patient_monitoring_systems_by_proximity_verification_using_blockchain
