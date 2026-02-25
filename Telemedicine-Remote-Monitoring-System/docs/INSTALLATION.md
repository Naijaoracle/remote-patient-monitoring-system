# Installation Guide

This guide covers practical setup for the current repo state:
- demo portal API
- local 3-validator PoA network
- smart contracts
- Flutter app install/testing on Android phones

## Minimum Requirements

### Laptop/Host
- OS: Linux/macOS recommended (Windows with WSL is possible)
- CPU: 4 cores recommended
- RAM: 8 GB minimum (16 GB preferred)
- Disk: 10-20 GB free
- Network: same Wi-Fi LAN as test phones

### Software
- Node.js 18+ and npm
- `geth` 1.13.x or 1.17.x
- Flutter SDK (stable)
- Android SDK + platform tools (`adb`) for APK install/testing

### Phones (Flutter app)
- 2 Android phones recommended for BLE two-device demo
- Android 8+ with BLE support
- Both phones on same Wi-Fi as laptop

## 1) Clone and Install

From repo root:

```bash
cd Telemedicine-Remote-Monitoring-System
npm install
```

## 2) Run Quality Checks

```bash
npm run lint
npm test
```

## 3) One-Command PoA Demo Bring-Up

Recommended path for first run:

```bash
KEEP_RUNNING=1 PORTAL_HOST=0.0.0.0 PORTAL_PORT=8099 npm run demo:poa:e2e
```

What this does:
- bootstraps 3 validators (`node1`, `node2`, `node3`)
- deploys smart contracts (Truffle)
- starts portal with on-chain adapter
- runs init/submit smoke test and verifies on-chain receipt

## 4) Configure Mobile App API URL

Use laptop LAN IP, not localhost:

```bash
hostname -I | awk '{print $1}'
```

Set Flutter app base URL to:
- `http://<laptop-lan-ip>:8099`

Example:
- `http://192.168.0.7:8099`

## 5) Build/Install Flutter App

```bash
cd rpm_flutter_client
flutter pub get
flutter build apk --release
```

Install on connected phone:

```bash
adb install -r build/app/outputs/flutter-apk/app-release.apk
```

Repeat for second phone (or share the APK file and install manually).

## 6) Two-Phone BLE Demo Topology

1. Phone B: open app in Device Simulator mode, start advertising.
2. Phone A: open app in Gateway mode, scan/select Phone B.
3. Phone A: run Register Actor + Consent, then Init Demo, then Submit Measurement.

## 7) Verify Submission

From laptop:

```bash
curl http://127.0.0.1:8099/api/health
curl http://127.0.0.1:8099/api/ledger
```

For PoA-anchored success, latest ledger record should include:
- `validatedBy`
- `onChainTxHash`
- `onChainGasUsed`

## Troubleshooting

- `SocketException / Connection refused` on phone:
  - ensure portal started with `PORTAL_HOST=0.0.0.0`
  - ensure app URL uses laptop LAN IP, not `127.0.0.1`
  - check firewall allows port `8099`
- Portal exits at startup:
  - set `RPM_STORAGE_KEY_HEX` and `RPM_KEYSTORE_MASTER_KEY_HEX`
  - or explicitly use `ALLOW_DEMO_INSECURE_KEYS=1` for demo-only mode
- BLE found but submit fails:
  - check actor/consent/init sequence in app
