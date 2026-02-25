# RPM Demo Portal (Local)

## Purpose
Demo-only interaction portal for local laptop runs. This is not production-safe.

## Run
From `Telemedicine-Remote-Monitoring-System/`:

```bash
npm run demo:portal
```

One-command PoA E2E validation (3 validators + deploy + submit + receipt check):

```bash
npm run demo:poa:e2e
```

Useful overrides:
- `GETH_BIN=/path/to/geth npm run demo:poa:e2e`
- `PORTAL_PORT=8119 npm run demo:poa:e2e`
- `PORTAL_HOST=0.0.0.0 npm run demo:poa:e2e` (required for phone/LAN access)
- `KEEP_RUNNING=1 npm run demo:poa:e2e` (leaves nodes + portal up after success)

Default URL:
- `http://127.0.0.1:8099/`
- Liveness endpoint: `http://127.0.0.1:8099/healthz`

One-command Docker Compose (3 geth nodes + portal):

```bash
./scripts/demo-compose-up.sh
```

This generates `.env.compose` with validator addresses and encryption keys, then starts:
- `node1` RPC: `8545`
- `node2` RPC: `8546`
- `node3` RPC: `8547`
- portal: `8099`

Optional env vars:
- `RPM_STORAGE_KEY_HEX` (64 hex chars): encryption key override for persisted records
- `RPM_KEYSTORE_MASTER_KEY_HEX` (64 hex chars): master key for encrypted private-key blobs in keystore
- `ALLOW_DEMO_INSECURE_KEYS`: set `1` only for explicit demo-only fallback key mode
- `DEMO_API_KEY`: legacy single key (treated as both viewer/operator)
- `DEMO_VIEWER_KEY`: read-only key (`/api/ledger`, `/api/record/:txHash`)
- `DEMO_OPERATOR_KEY`: write/admin key (`/api/init`, `/api/submit`, `/api/reset`)
- `AUTH_ENABLED`: defaults to `1`; set `0` only for explicit local demo mode
- `ALLOW_UNAUTHENTICATED_DEMO`: set `1` to bypass startup failure when auth keys are not set
- `TRUST_PROXY`: set `1` only when behind a trusted reverse proxy (enables `X-Forwarded-For`)
- `RECORD_TTL_SECONDS`: purge encrypted records older than this many seconds (`0` disables purge)
- `AUDIT_TTL_SECONDS`: purge audit log entries older than this many seconds (`0` disables purge)
- `ALERT_TTL_SECONDS`: purge alert log entries older than this many seconds (`0` disables purge)
- `TELEMETRY_TTL_SECONDS`: purge validator telemetry entries older than this many seconds (`0` disables purge)
- `PROPOSAL_TELEMETRY_TTL_SECONDS`: purge proposal telemetry entries older than this many seconds (`0` disables purge)
- `PURGE_INTERVAL_SECONDS`: retention sweep interval (default `60`)
- `CHAIN_RPC_URL`: JSON-RPC endpoint for proposal event indexing (optional)
- `VALIDATOR_MANAGER_ADDRESS`: on-chain `ValidatorManager` address for log indexing (optional)
- `MEASUREMENT_CONTRACT_ADDRESS`: on-chain `Measurement` contract for tx anchoring from `/api/submit` (optional)
- `CHAIN_SYNC_START_BLOCK`: initial block number for first proposal sync (default `0`)
- `CHAIN_SYNC_INTERVAL_SECONDS`: background chain sync interval (`0` disables background sync)
- `CHAIN_REORG_LOOKBACK_BLOCKS`: overlap window for reorg-safe resync (default `12`)
- `CHAIN_SYNC_MAX_BACKOFF_SECONDS`: max exponential backoff for chain sync retry (default `300`)
- `AUDIT_SIGNER_MODE`: `keystore` (default) or `remote`
- `AUDIT_SIGNER_REMOTE_ENDPOINT`: remote signer HTTP endpoint (`POST`, returns `{ "signature": "..." }`)
- `AUDIT_SIGNER_REMOTE_KEY_ID`: key identifier recorded in signed package metadata/history
- `AUDIT_SIGNER_REMOTE_PUBKEY_PATH`: PEM file path for remote signer public key
- `CUSTOM_HOOKS_FILE`: optional path to a local hook module file
  - If unset, the portal runs with silent no-op hooks
- `MONITOR_WINDOW_SECONDS`: anomaly detection window (default `300`)
- `UNAUTHORIZED_ALERT_THRESHOLD`: trigger count for unauthorized spike (default `5`)
- `SUBMIT_FAILURE_ALERT_THRESHOLD`: trigger count for submit-failure spike (default `3`)
- `VALIDATOR_FAILURE_ALERT_THRESHOLD`: trigger count for validator failure spike (default `3`)
- `GAS_ANOMALY_GAS_USED`: gas-used threshold for high-gas anomaly detection (default `500000`)
- `GAS_ANOMALY_COUNT_THRESHOLD`: event count threshold for gas anomaly spike (default `3`)
- `PROPOSAL_FAILURE_ALERT_THRESHOLD`: trigger count for proposal failure spike (default `3`)
- `PENDING_PROPOSAL_ALERT_THRESHOLD`: trigger count for pending proposal backlog alert (default `3`)
- `ALERT_COOLDOWN_SECONDS`: suppress duplicate alerts by type for this many seconds (default `300`)
- `RATE_LIMIT_WINDOW_SECONDS`: API rate-limit window size (default `60`)
- `RATE_LIMIT_MAX_PER_WINDOW`: max API requests per subject per window (default `120`)

## What it uses
- `shared/runtime/services/BLEService.js`
- `shared/runtime/services/BlockchainService.js`
- `shared/runtime/utils/CryptoUtils.js`

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

Auth is enabled by default:
- Header `x-api-key: <value>` or
- Header `Authorization: Bearer <value>`

Startup fails if auth is enabled but keys are missing, unless `ALLOW_UNAUTHENTICATED_DEMO=1`.

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
- Startup now fails fast if fallback demo encryption keys would be used unintentionally.
  - Set both `RPM_STORAGE_KEY_HEX` and `RPM_KEYSTORE_MASTER_KEY_HEX`, or explicitly opt in with `ALLOW_DEMO_INSECURE_KEYS=1`.
- Startup now fails fast if auth keys are not set while auth is enabled.
  - Set `DEMO_OPERATOR_KEY` (and optionally `DEMO_VIEWER_KEY`), or explicitly opt in with `ALLOW_UNAUTHENTICATED_DEMO=1`.
- For real deployments, replace with hardware-backed signers (Android Keystore / iOS Secure Enclave / HSM/KMS).
- Ledger is in memory only; encrypted file persistence is for local demo prototyping.
- Local geth startup uses `--allow-insecure-unlock` only for localhost demo flows; do not expose these RPC ports publicly.

## Optional on-chain anchoring

If all are set:

- `CHAIN_RPC_URL`
- `MEASUREMENT_CONTRACT_ADDRESS`

then `/api/submit` also sends `submitMeasurementHash(...)` to the chain through RPC using the selected validator address from `/api/init`.

The submission record will include:

- `onChainTxHash`
- `onChainGasUsed`
