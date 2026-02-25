# Remote Patient Monitoring System (Prototype)

This repository contains a prototype remote patient monitoring system that combines:
- BLE proximity-based measurement flow
- Signature verification and auditability
- A local blockchain-backed validation pipeline

Goal: reduce risk of fake or replayed measurements by requiring trusted-device and validation steps.

This project is a work in progress and is **not** production-ready.

## Consensus + Flow (Paper Alignment)

Yes, this implementation is based on a **Proof of Authority (PoA)** model for the local blockchain network.

- **PoA network:** local Clique validator network (`geth 1.13.x` or `1.17.x`) with validator governance via `ValidatorManager`.
- **BLE proximity gate:** mobile/client side first confirms nearby BLE connectivity (short-range signal).
- **Submission path:** BLE/proximity -> signed measurement payload -> validator acceptance -> optional on-chain hash anchoring.

In short: the implemented design matches the paper intent at prototype level.

## Minimum System Requirements

### Laptop/Host
- CPU: 4 cores recommended
- RAM: 8 GB minimum (16 GB preferred)
- Disk: 10-20 GB free
- OS: Linux/macOS recommended (Windows + WSL possible)

### Required Tooling
- Node.js 18+ and npm
- `geth` 1.13.x or 1.17.x
- Flutter SDK (for mobile app build/run)
- Android SDK + `adb` (for APK install/testing)

### Phones
- 2 Android phones recommended (Gateway + Device Simulator)
- Android 8+ with BLE support
- Same Wi-Fi LAN as laptop for API access

## Architecture Diagram

Architecture figure:

- `img/rmp_BLE_PoA.jpeg`

![RPM BLE + 3-Validator PoA Architecture](img/rmp_BLE_PoA.jpeg)

### ASCII Flow

```text
+-----------------------------+      BLE (RSSI)      +-----------------------------+
| Device B                    |  ------------------>  | Device A                    |
| (BLE Peripheral Simulator)  |                       | (Mobile Gateway App)        |
+-----------------------------+                       +-----------------------------+
            |                                                       |
            |              HTTP API (/api/init, /api/submit)        |
            +------------------------------->------------------------+
                                            |
                                            v
                              +--------------------------------------+
                              | Demo API / Validation Layer (Laptop) |
                              | - actor + consent checks             |
                              | - signature verification             |
                              | - accept/reject decision             |
                              | - app ledger entry                   |
                              +--------------------------------------+
                                            |
                                            | JSON-RPC (submit hash)
                                            v
               +-------------------------------------------------------------+
               | PoA Blockchain Network (3 validators)                      |
               |   Node1 <----> Node2 <----> Node3                          |
               |   Clique/PoA majority-based block production               |
               |   Contracts: Measurement, ValidatorManager                 |
               +-------------------------------------------------------------+
                                            |
                                            v
                           +------------------------------------+
                           | Query / Monitoring Outputs         |
                           | - /api/ledger                      |
                           | - /api/health                      |
                           | - on-chain receipt status (0x1)    |
                           +------------------------------------+

Decision rule:
- invalid policy/signature/consent -> rejected (no successful ledger/on-chain record)
- valid submission -> ledger + PoA on-chain anchoring (onChainTxHash, gasUsed)
```

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
- Liveness: `http://127.0.0.1:8099/healthz`

Security note:
- set `RPM_STORAGE_KEY_HEX` and `RPM_KEYSTORE_MASTER_KEY_HEX` before starting, or explicitly use `ALLOW_DEMO_INSECURE_KEYS=1` for demo fallback keys.
- auth is enabled by default; set `DEMO_OPERATOR_KEY` (and optionally `DEMO_VIEWER_KEY`) before starting, or explicitly use `ALLOW_UNAUTHENTICATED_DEMO=1`.

### 3b. Run full PoA E2E demo (recommended)
```bash
npm run demo:poa:e2e
```
Useful overrides:
- `KEEP_RUNNING=1 PORTAL_HOST=0.0.0.0 PORTAL_PORT=8099 npm run demo:poa:e2e` (phone/LAN testing)

### 3c. Docker Compose startup (3 geth + portal)
```bash
cd Telemedicine-Remote-Monitoring-System
./scripts/demo-compose-up.sh
```

### 4. (Optional) Start local blockchain network
Supports `geth 1.13.x` or `1.17.x`.

```bash
cd Telemedicine-Remote-Monitoring-System/blockchain-network
./scripts/install-geth-1.13.sh
export GETH_BIN=/tmp/geth-1.13.15/bin/geth
./scripts/bootstrap-network.sh
./scripts/start-node.sh node1
./scripts/start-node.sh node2
./scripts/start-node.sh node3
./scripts/connect-peers.sh
```

### 5. (Optional) Run smart-contract tests

```bash
cd Telemedicine-Remote-Monitoring-System/smart-contracts
npm run test:hardhat
```

Truffle tests can also run against the local Clique network after all 3 nodes are started:

```bash
npm run test:truffle
```

Foundry tests:

```bash
npm run test:foundry
```

## Flutter Client

A minimal Flutter app is included at:

- `Telemedicine-Remote-Monitoring-System/rpm_flutter_client`

It supports:

1. **Gateway mode** (phone app):
   - scans nearby BLE advertisements from a medical-device simulator phone
   - confirms proximity (service UUID + RSSI threshold)
   - submits measurement to demo API / PoA pipeline
2. **Device Simulator mode** (second phone app):
   - advertises as BLE medical device (`kServiceUuid`)
   - broadcasts compact simulated vitals payload (HR/SpO2)

Notes:
- `Telemedicine-Remote-Monitoring-System/rpm_flutter_client` is the active mobile demo client.
- `Telemedicine-Remote-Monitoring-System/mobile-app/App.js` is a placeholder and not an active React Native entrypoint.

Run:

```bash
cd Telemedicine-Remote-Monitoring-System/rpm_flutter_client
flutter pub get
flutter run
```

Keep demo portal running in another terminal:

```bash
cd Telemedicine-Remote-Monitoring-System
npm run demo:portal
```

Default API URL in app:
- `http://127.0.0.1:8099`

Two-phone test topology:

1. Laptop: run `demo:portal` + PoA validator nodes (`node1`, `node2`, `node3`)
2. Phone B: open app in **Device Simulator** mode and start BLE advertising
3. Phone A: open app in **Gateway** mode, scan/select Phone B, initialize demo, submit measurement

Note:
- On real phones, do **not** use `127.0.0.1` for the API URL; use the laptop's LAN IP (for example `http://192.168.1.10:8099`).

To enable on-chain anchoring from `/api/submit`, set in portal environment:

- `CHAIN_RPC_URL` (example: `http://127.0.0.1:8545`)
- `MEASUREMENT_CONTRACT_ADDRESS` (deployed `Measurement` contract address)

## Documentation

- System docs: `Telemedicine-Remote-Monitoring-System/docs/README.md`
- Demo portal usage: `Telemedicine-Remote-Monitoring-System/demo/README.md`
- Local chain setup: `Telemedicine-Remote-Monitoring-System/blockchain-network/README.md`
- Installation details: `Telemedicine-Remote-Monitoring-System/docs/INSTALLATION.md`
- API notes: `Telemedicine-Remote-Monitoring-System/docs/API.md`

## CI Artifacts and Releases

Mobile binaries are produced by GitHub Actions (not committed to git):

- CI artifacts workflow: `.github/workflows/mobile-artifacts.yml`
  - Android: `rpm-app-a-release.apk`, `rpm-app-b-release.apk`
  - iOS artifacts: `Runner-iphoneos-nosign.zip`, `Runner-iphonesimulator.zip`
- Release workflow: `.github/workflows/mobile-release.yml`
  - Trigger: push tag `v*` (example `v0.1.0`)
  - Publishes the same files as GitHub Release assets
- Signed iOS workflow: `.github/workflows/mobile-ios-signed-release.yml`
  - Trigger: manual (`workflow_dispatch`) or tag `v*`
  - Publishes `rpm-ios-signed.ipa` (requires Apple signing secrets)

Tag + release flow:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Notes:
- App A and App B artifacts are currently the same binary with runtime mode selection in-app.
- Default iOS artifacts are non-signed app bundles; signed IPA is produced by the dedicated workflow above.

Required GitHub secrets for signed IPA:
- `IOS_CERTIFICATE_P12_BASE64`: base64 of signing `.p12`
- `IOS_CERTIFICATE_PASSWORD`: password for the `.p12`
- `IOS_PROVISIONING_PROFILE_BASE64`: base64 of `.mobileprovision`
- `IOS_KEYCHAIN_PASSWORD`: temporary keychain password for CI job
- `IOS_TEAM_ID`: Apple Developer Team ID
- `IOS_BUNDLE_IDENTIFIER`: app bundle identifier (for Runner target)
- Optional: `IOS_EXPORT_METHOD` (`ad-hoc`, `app-store`, `enterprise`, etc.; defaults to `ad-hoc`)

Helper to generate base64 secret values locally:

```bash
scripts/generate-ios-ci-secrets.sh /path/to/cert.p12 /path/to/profile.mobileprovision <TEAM_ID> <BUNDLE_ID>
```

This prints:
- `IOS_CERTIFICATE_P12_BASE64`
- `IOS_PROVISIONING_PROFILE_BASE64`
- `IOS_KEYCHAIN_PASSWORD` (generated)
and reminds you to set `IOS_CERTIFICATE_PASSWORD`.

## Security and Repo Hygiene

- Keep secrets in untracked env files (`Telemedicine-Remote-Monitoring-System/.env.example`).
- Generated local chain data and node secrets are ignored.
- Keep private extension logic outside public source control.
- Optional local hook file path: `Telemedicine-Remote-Monitoring-System/extensions/hooks/hooks.local.js` (gitignored).
- Mobile binaries are not committed (`.apk`, `.aab`, `.ipa`); publish them via release artifacts instead.

## Validation Status (Current)

- Main JS unit/integration tests: passing
- Hardhat smart-contract tests: passing
- Truffle smart-contract tests against local Clique setup: passing
- Flutter APP: `flutter analyze` and `flutter test` passing

Known prototype limits:

- Mobile UI is not production-hardened.
- BLE connection is used as proximity evidence, but production anti-spoofing still requires hardened device identity and key storage.
- Local chain + portal demo uses unlocked validator accounts for RPC submission (`--allow-insecure-unlock`) and is restricted to localhost-only exposure.

## Research Context

Background paper:
- https://www.researchgate.net/publication/377029947_A_proposal_for_improving_the_data_security_of_remote_patient_monitoring_systems_by_proximity_verification_using_blockchain
