# Phase 3 Notes (Initial Slice)

Implemented in this step:
- Encrypted off-chain persistence for accepted measurement payloads in local demo API.
- AES-256-GCM encryption at rest in `demo/.data/records.enc.jsonl`.
- Per-transaction retrieval endpoint: `GET /api/record/:txHash`.
- Simulated BLE challenge-response handshake metadata included in signed payload:
  - `handshakeRequestAtMs`
  - `handshakeResponseAtMs`
  - `handshakeLatencyMs`
- Validation rejects measurements when handshake latency exceeds configured bound.
- Added keystore abstraction (`mobile-app/services/KeyStoreService.js`):
  - private keys are encrypted in memory and referenced by key id
  - BLE peripheral and central signatures in demo portal use key ids, not raw keys in app state
  - supports pluggable external signers for future hardware-backed integration
- Added BLE adapter seam:
  - simulator moved to `mobile-app/services/adapters/SimulatedBleAdapter.js`
  - `BLEService.setAdapter()` enables plugging in real platform BLE implementation later

Key handling:
- Preferred: set `RPM_STORAGE_KEY_HEX` (64 hex chars).
- For private key blobs, optionally set `RPM_KEYSTORE_MASTER_KEY_HEX` (64 hex chars).
- Fallback: deterministic demo-only key (not production-safe).

This is a stepping stone toward full Phase 3/4 storage hardening.
