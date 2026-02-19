# RPM Demo Portal (Local)

## Purpose
Demo-only interaction portal for local laptop runs. This is not production-safe.

## Run
From `Telemedicine-Remote-Monitoring-System/`:

```bash
npm run demo:portal
```

Default URL:
- `http://127.0.0.1:8099/`

Optional env vars:
- `RPM_STORAGE_KEY_HEX` (64 hex chars): encryption key override for persisted records
- `RPM_KEYSTORE_MASTER_KEY_HEX` (64 hex chars): master key for encrypted private-key blobs in keystore
- `DEMO_API_KEY`: legacy single key (treated as both viewer/operator)
- `DEMO_VIEWER_KEY`: read-only key (`/api/ledger`, `/api/record/:txHash`)
- `DEMO_OPERATOR_KEY`: write/admin key (`/api/init`, `/api/submit`, `/api/reset`)
- `RECORD_TTL_SECONDS`: purge encrypted records older than this many seconds (`0` disables purge)
- `AUDIT_TTL_SECONDS`: purge audit log entries older than this many seconds (`0` disables purge)
- `ALERT_TTL_SECONDS`: purge alert log entries older than this many seconds (`0` disables purge)
- `TELEMETRY_TTL_SECONDS`: purge validator telemetry entries older than this many seconds (`0` disables purge)
- `PROPOSAL_TELEMETRY_TTL_SECONDS`: purge proposal telemetry entries older than this many seconds (`0` disables purge)
- `PURGE_INTERVAL_SECONDS`: retention sweep interval (default `60`)
- `CHAIN_RPC_URL`: JSON-RPC endpoint for proposal event indexing (optional)
- `VALIDATOR_MANAGER_ADDRESS`: on-chain `ValidatorManager` address for log indexing (optional)
- `CHAIN_SYNC_START_BLOCK`: initial block number for first proposal sync (default `0`)
- `CHAIN_SYNC_INTERVAL_SECONDS`: background chain sync interval (`0` disables background sync)
- `CHAIN_REORG_LOOKBACK_BLOCKS`: overlap window for reorg-safe resync (default `12`)
- `AUDIT_SIGNER_MODE`: `keystore` (default) or `remote`
- `AUDIT_SIGNER_REMOTE_ENDPOINT`: remote signer HTTP endpoint (`POST`, returns `{ "signature": "..." }`)
- `AUDIT_SIGNER_REMOTE_KEY_ID`: key identifier recorded in signed package metadata/history
- `AUDIT_SIGNER_REMOTE_PUBKEY_PATH`: PEM file path for remote signer public key
- `COMMERCIAL_HOOKS_FILE`: optional path to a commercial hook module file (overrides the `rpm-commercial-hooks` npm package; use for dev/test without reinstalling)
  - If unset, the portal tries `require('rpm-commercial-hooks')` (install via `npm install ../rpm-commercial-hooks`)
  - If the package is not installed, the portal runs with silent no-op hooks
- `MONITOR_WINDOW_SECONDS`: anomaly detection window (default `300`)
- `UNAUTHORIZED_ALERT_THRESHOLD`: trigger count for unauthorized spike (default `5`)
- `SUBMIT_FAILURE_ALERT_THRESHOLD`: trigger count for submit-failure spike (default `3`)
- `VALIDATOR_FAILURE_ALERT_THRESHOLD`: trigger count for validator failure spike (default `3`)
- `GAS_ANOMALY_GAS_USED`: gas-used threshold for high-gas anomaly detection (default `500000`)
- `GAS_ANOMALY_COUNT_THRESHOLD`: event count threshold for gas anomaly spike (default `3`)
- `PROPOSAL_FAILURE_ALERT_THRESHOLD`: trigger count for proposal failure spike (default `3`)
- `PENDING_PROPOSAL_ALERT_THRESHOLD`: trigger count for pending proposal backlog alert (default `3`)
- `ALERT_COOLDOWN_SECONDS`: suppress duplicate alerts by type for this many seconds (default `300`)

## What it uses
- `mobile-app/services/BLEService.js`
- `mobile-app/services/BlockchainService.js`
- `mobile-app/utils/CryptoUtils.js`

The portal server (`demo/portal-server.js`) exposes local API endpoints and the HTML UI (`demo/portal.html`) calls those endpoints.

## API endpoints
- `GET /api/health`
- `POST /api/init`
- `POST /api/submit`
- `GET /api/ledger`
- `GET /api/record/:txHash`
- `POST /api/consent` (operator)
- `GET /api/consent/:patientId` (viewer)
- `GET /api/actors` (viewer)
- `GET /api/actors/:actorId` (viewer)
- `POST /api/actors` (operator)
- `GET /api/audit/export` (viewer)
- `GET /api/audit/package` (viewer, signed/tamper-evident export bundle)
- `GET /api/audit/keys` (viewer, signing key history)
- `POST /api/audit/rotate-key` (operator)
- `GET /api/monitor/summary` (viewer)
- `GET /api/monitor/alerts` (viewer)
- `GET /api/monitor/validators` (viewer)
- `GET /api/monitor/proposals` (viewer)
- `POST /api/monitor/proposals` (operator, proposal event ingestion)
 - `POST /api/monitor/proposals/sync` (operator, on-chain proposal event sync)
- `POST /api/reset`

Auth when `DEMO_API_KEY` is set:
- Header `x-api-key: <value>` or
- Header `Authorization: Bearer <value>`

Role behavior:
- `viewer` can read ledger/record/consent/audit-export/monitor-summary routes
- `viewer` can read monitor alerts
- `operator` can initialize/submit/reset
- `/api/health` stays public

Consent behavior:
- `POST /api/submit` requires `patientId`
- `POST /api/submit` also requires `purpose` and `actorId` (`x-actor-id` header or request body)
- actor must be present and active in actor registry (`/api/actors`)
- submission is rejected unless active consent policy allows `(patientId, purpose, actorId)`
- set consent via `POST /api/consent`
  - supports `purposes`, `allowedActorIds`, `allowedRoles`, `allowedOrgs`, `requiredScopes`

Identity behavior:
- register/update actor via `POST /api/actors`
- actor profile includes `role`, `org`, `scopes`, `active`
- policy checks consume actor profile during submission authorization

## Phase 3 storage slice
- Accepted payloads are also persisted encrypted at rest:
  - `demo/.data/records.enc.jsonl`
- Encryption: `AES-256-GCM`
- Key:
  - Preferred: set `RPM_STORAGE_KEY_HEX` (64 hex chars)
- Fallback: demo-only built-in key
- Audit logging:
  - `demo/.data/audit.log.jsonl`
  - includes request role and status
  - export via `GET /api/audit/export?from=<iso>&to=<iso>&limit=<n>`
  - signed package via `GET /api/audit/package?from=<iso>&to=<iso>&limit=<n>`
  - key history via `GET /api/audit/keys`
  - rotate signer via `POST /api/audit/rotate-key` with `{ "reason": "..." }`
- Consent log:
  - `demo/.data/consent.jsonl`
- Actor registry:
  - `demo/.data/actors.json`
- Alerts log:
  - `demo/.data/alerts.log.jsonl`
  - export via `GET /api/monitor/alerts?type=<alertType>&from=<iso>&to=<iso>&limit=<n>`
- Validator telemetry log:
  - `demo/.data/validator-telemetry.jsonl`
  - export + summary via `GET /api/monitor/validators?validatorId=<id>&from=<iso>&to=<iso>&limit=<n>`
- Proposal telemetry log:
  - `demo/.data/proposal-telemetry.jsonl`
  - ingest via `POST /api/monitor/proposals`
  - chain sync via `POST /api/monitor/proposals/sync` (uses `CHAIN_RPC_URL` + `VALIDATOR_MANAGER_ADDRESS` by default)
  - export + summary via `GET /api/monitor/proposals?proposalId=<id>&validatorId=<id>&action=<action>&from=<iso>&to=<iso>&limit=<n>`
- Audit signing key history:
  - `demo/.data/audit-signing-keys.json`

Verification CLI:
- `node scripts/verify-audit-package.js <path/to/export-package.json>`
- or `npm run audit:verify -- <path/to/export-package.json>`

## Security warning
- Raw private keys are wrapped by `KeyStoreService` and stored encrypted in memory.
- For real deployments, replace with hardware-backed signers (Android Keystore / iOS Secure Enclave / HSM/KMS).
- Ledger is in memory only; encrypted file persistence is for local demo prototyping.
- No production authentication/authorization.
