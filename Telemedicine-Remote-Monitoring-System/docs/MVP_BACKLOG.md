# Remote Patient Monitoring MVP Backlog

## Goal
Deliver one secure vertical slice proving "device is near patient" before accepting measurement data.

## Phase 1: First Slice (Implemented in this commit)
- Implement deterministic signing and verification utilities.
- Implement BLE service simulation with connected devices and signed peripheral payloads.
- Implement blockchain service validation for:
  - peripheral signature
  - central signature
  - challenge replay protection
  - proximity time window checks
  - validator presence (PoA gate)
- Add end-to-end smoke test for the full flow.

## Phase 2: Contract and Chain Hardening
- Move verification from in-memory service to smart contracts or verifier service + hash anchoring.
- Add strict validator governance:
  - quorum-based add/remove
  - no single-validator admin actions
  - prevent removal of last validator
- Add device and central key rotation + revocation lists.

## Phase 3: Mobile and BLE Runtime
- Replace BLE simulation with real platform BLE APIs.
- Add challenge-response handshake with bounded latency checks to reduce relay risk.
- Add secure key storage on device (hardware-backed where available).

## Phase 4: Data and Compliance
- Keep PHI off-chain; store encrypted payload off-chain and commit only immutable hash + metadata on-chain.
- Add audit export, consent enforcement, and retention policies.
- Add operational monitoring for validator behavior and anomaly detection.

## Definition of Done for MVP
- One registered BLE peripheral can produce signed measurement data.
- Central device adds second signature and timestamp.
- Measurement is accepted only when both signatures and proximity checks pass.
- Replay attempts are rejected.
- Stored transaction can be retrieved by transaction hash.
