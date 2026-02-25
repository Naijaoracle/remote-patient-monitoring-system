# RPM Demo Portal — API Reference

Base URL: `http://127.0.0.1:8099` (configurable via `HOST` / `PORT`)

---

## Authentication

All `/api/*` endpoints (except `/api/health`) require an API key unless
`ALLOW_UNAUTHENTICATED_DEMO=1` is set.

| Header | Format |
|---|---|
| `X-Api-Key` | `<key>` |
| `Authorization` | `Bearer <key>` |

Two roles are supported:

| Role | Key env var | Can call |
|---|---|---|
| `operator` | `DEMO_OPERATOR_KEY` | All endpoints |
| `viewer` | `DEMO_VIEWER_KEY` | GET endpoints only |

---

## System

### `GET /healthz`
Liveness probe. No auth required. Never writes an audit entry.

**Response**
```json
{ "ok": true, "live": true, "ts": "2025-01-01T00:00:00.000Z" }
```

### `GET /api/health`
Returns current initialisation state.

**Response**
```json
{
  "ok": true,
  "initialized": true,
  "deviceId": "0xABC…",
  "centralId": "0xDEF…",
  "validatorId": "0x123…",
  "onChainAdapterEnabled": true,
  "chainRpcUrl": "http://node1:8545",
  "measurementContractAddress": "0x…"
}
```

---

## Session

### `POST /api/init` — operator
Initialises the demo session. Generates ephemeral key pairs for peripheral and
central devices, connects the simulated BLE device, and (when `CHAIN_RPC_URL`
is configured) attaches the on-chain measurement adapter.

Calling `/api/init` again resets all in-memory state first.

**Request**
```json
{
  "deviceId":   "0xPERIPHERAL_ADDRESS",
  "centralId":  "0xCENTRAL_ADDRESS",
  "validatorId":"0xVALIDATOR_ADDRESS"
}
```

**Response**
```json
{ "ok": true, "initialized": true, "deviceId": "…", "centralId": "…", "validatorId": "…" }
```

### `POST /api/reset` — operator
Tears down the current session (clears all in-memory state and key store
entries). Does not delete persisted records or audit logs.

**Response**
```json
{ "ok": true, "reset": true }
```

---

## Actors

### `POST /api/actors` — operator
Creates or updates an actor (clinician / system agent) in the actor registry.

**Request**
```json
{
  "actorId": "clinician-001",
  "role":    "clinician",
  "org":     "UHD",
  "scopes":  ["read", "submit"],
  "active":  true
}
```

**Response**
```json
{ "ok": true, "actor": { "actorId": "…", "role": "…", "org": "…", "scopes": […], "active": true } }
```

### `GET /api/actors` — viewer
Returns all registered actors.

**Response**
```json
{ "ok": true, "actors": [ { "actorId": "…", … } ] }
```

### `GET /api/actors/:actorId` — viewer
Returns a single actor by ID.

**Response**
```json
{ "ok": true, "actor": { "actorId": "…", … } }
```
`404` if not found.

---

## Consent

### `POST /api/consent` — operator
Records a consent decision for a patient.

**Request**
```json
{
  "patientId": "patient-001",
  "granted":   true,
  "reason":    "patient signed form",
  "purposes":  ["monitoring", "research"],
  "allowedActorIds": ["clinician-001"],
  "expiresAt": "2026-12-31T23:59:59Z"
}
```

All fields except `patientId` are optional. `granted` defaults to `true`.

**Response**
```json
{ "ok": true, "consent": { "patientId": "…", "granted": true, … } }
```

### `GET /api/consent/:patientId` — viewer
Returns the latest consent record and evaluates it against optional context.

**Query params**

| Param | Description |
|---|---|
| `purpose` | Purpose to evaluate against consent policy |
| `actorId` | Actor ID to evaluate against consent policy |

**Response**
```json
{
  "ok": true,
  "patientId": "patient-001",
  "active": true,
  "reason": "consent granted",
  "consent": { … }
}
```
`404` if no consent record exists.

---

## Measurements

### `POST /api/submit` — operator
Submits a measurement through the full BLE → signature → consensus pipeline.

**Headers**

| Header | Description |
|---|---|
| `X-Actor-Id` | Actor submitting the measurement (or pass in body) |

**Request**
```json
{
  "patientId": "patient-001",
  "purpose":   "monitoring",
  "type":      "heart_rate",
  "value":     "72",
  "unit":      "bpm",
  "actorId":   "clinician-001",
  "replay":    false
}
```

`replay: true` reuses the last challenge hash (for testing challenge-replay rejection).

**Response**
```json
{
  "ok": true,
  "txHash": "0x…",
  "stored": {
    "measurementHash": "0x…",
    "deviceAddress": "0x…",
    "centralDeviceAddress": "0x…",
    "timestampPeripheral": 1700000000,
    "timestampCentral": 1700000001,
    "onChainTxHash": "0x…",
    "onChainGasUsed": 85000
  }
}
```

### `GET /api/ledger` — viewer
Returns all submitted measurements for the current session in submission order.

**Response**
```json
{ "ok": true, "ledger": [ { "txHash": "0x…", "record": { … } } ] }
```

### `GET /api/record/:txHash` — viewer
Returns a single AES-256-GCM-encrypted record, decrypted on the fly.

**Response**
```json
{ "ok": true, "record": { "txHash": "0x…", "createdAt": "…", "payload": { … } } }
```
`404` if not found.

---

## Audit

### `GET /api/audit/export` — viewer
Exports raw audit log entries.

**Query params**

| Param | Description |
|---|---|
| `from` | ISO 8601 start timestamp |
| `to` | ISO 8601 end timestamp |
| `limit` | Max entries (default 500, max 5000) |

**Response**
```json
{ "ok": true, "entries": [ { "at": "…", "ip": "…", "method": "…", "path": "…", "role": "…", "status": 200, "message": "…" } ] }
```

### `GET /api/audit/package` — viewer
Returns a signed audit export package. The `manifest.signature` can be verified
against the active signing public key.

**Query params** — same as `/api/audit/export`

**Response**
```json
{
  "ok": true,
  "exportPackage": {
    "manifest": {
      "exportedAt": "…",
      "entryCount": 12,
      "from": "…",
      "to": "…",
      "signerId": "audit-export-signer-…",
      "publicKeyPem": "-----BEGIN PUBLIC KEY-----…",
      "signature": "…"
    },
    "entries": [ … ]
  }
}
```

### `GET /api/audit/keys` — viewer
Returns the audit signing key history and the currently active key.

**Response**
```json
{
  "ok": true,
  "active": { "keyId": "…", "publicKeyPem": "…", "rotatedAt": "…" },
  "keys": [ { "keyId": "…", "publicKeyPem": "…", "rotatedAt": "…", "reason": "startup" } ]
}
```

### `POST /api/audit/rotate-key` — operator
Rotates the audit signing key.

**Request**
```json
{ "reason": "scheduled" }
```

**Response**
```json
{ "ok": true, "keyId": "audit-export-signer-…", "reason": "scheduled", "mode": "keystore" }
```

---

## Monitoring

### `GET /api/monitor/summary` — viewer
Returns aggregate summaries of the audit log, validator telemetry, and proposal
telemetry.

**Response**
```json
{
  "ok": true,
  "summary": { "totalRequests": 42, "totalErrors": 1, … },
  "validatorSummary": {
    "totalEvents": 10,
    "totalSuccess": 9,
    "totalFailure": 1,
    "gasAnomalyCount": 0,
    "byValidator": { "0x…": { "success": 9, "failure": 1, "anchored": 9, "avgDurationMs": 320, "avgGasUsed": 84200, "maxGasUsed": 91000 } }
  },
  "proposalSummary": { "totalEvents": 3, "created": 1, "approved": 1, "executed": 1, "failed": 0, "pendingProposalCount": 0, "byValidator": { … } }
}
```

### `GET /api/monitor/alerts` — viewer
Returns fired alerts within an optional time window.

**Query params**: `from`, `to`, `limit`, `type`

**Response**
```json
{ "ok": true, "alerts": [ { "at": "…", "type": "unauthorized_burst", "count": 6, … } ] }
```

### `GET /api/monitor/validators` — viewer
Returns per-validator telemetry events and a summary.

**Query params**: `from`, `to`, `limit`, `validatorId`

**Response**
```json
{ "ok": true, "summary": { … }, "events": [ { "at": "…", "validatorId": "0x…", "status": "success", "gasUsed": 84200, … } ] }
```

### `GET /api/monitor/proposals` — viewer
Returns proposal telemetry events and a summary.

**Query params**: `from`, `to`, `limit`, `proposalId`, `validatorId`, `action`

**Response**
```json
{ "ok": true, "summary": { … }, "events": [ { "at": "…", "proposalId": "…", "action": "create", "status": "success", … } ] }
```

### `POST /api/monitor/proposals` — operator
Manually appends a proposal telemetry event (used by the demo UI).

**Request**
```json
{
  "proposalId":   "prop-001",
  "proposalType": "add",
  "validatorId":  "0x…",
  "action":       "create",
  "status":       "success",
  "txHash":       "0x…",
  "reason":       ""
}
```

**Response**
```json
{ "ok": true, "event": { … } }
```
Returns `{ "ok": true, "event": null }` if the `eventUid` was already recorded (deduplicated).

### `POST /api/monitor/proposals/sync` — operator
Fetches `ValidatorManager` proposal events from the chain and appends any new
ones to proposal telemetry.

**Request**
```json
{
  "fromBlock":       0,
  "toBlock":         null,
  "rpcUrl":          "http://node1:8545",
  "contractAddress": "0x…"
}
```

All fields are optional; defaults come from `CHAIN_RPC_URL` / `VALIDATOR_MANAGER_ADDRESS`.

**Response**
```json
{
  "ok": true,
  "fromBlock": 0,
  "toBlock": 142,
  "latestBlock": 142,
  "synced": 3,
  "appended": 2,
  "lastSyncedBlock": 142
}
```

---

## Error responses

All errors return HTTP `400` (or `401` / `404` / `429` where applicable):

```json
{ "error": "descriptive message" }
```

| Status | Meaning |
|---|---|
| `400` | Bad request / validation failure |
| `401` | Missing or invalid API key |
| `404` | Resource not found |
| `429` | Rate limit exceeded — check `Retry-After` header |
