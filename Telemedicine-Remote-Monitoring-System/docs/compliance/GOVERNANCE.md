# Compliance Governance (Demo Baseline)

## Audit Export Schema Governance

- Current schema version: `rpm-audit-export/v1`
- Compatibility policy:
  - `v1` changes must be backward-compatible for verifiers.
  - Breaking changes require a new major version tag (for example `rpm-audit-export/v2`).
- Change control:
  - Any schema change must include:
    - updated verification logic
    - updated docs and migration notes
    - tests covering old and new formats where applicable

## Audit Signing Key Procedures

- Key lifecycle states:
  - `active` (`retiredAt = null`)
  - `retired` (`retiredAt` populated)
- Key history file: `demo/.data/audit-signing-keys.json`
- Rotation trigger examples:
  - scheduled interval (for example every 90 days)
  - compromise suspicion
  - signer backend migration
- Rotation process:
  1. Rotate key (`POST /api/audit/rotate-key` for local mode, or update remote signer key ID + PEM path for remote mode)
  2. Verify new signer in `/api/audit/keys`
  3. Produce a signed export package and verify with `scripts/verify-audit-package.js`
  4. Mark operational ticket/change record as completed

## Remote/KMS Signer Integration

- `AUDIT_SIGNER_MODE=remote` allows signing through an external service.
- Required:
  - `AUDIT_SIGNER_REMOTE_ENDPOINT`
  - `AUDIT_SIGNER_REMOTE_KEY_ID`
  - `AUDIT_SIGNER_REMOTE_PUBKEY_PATH`
- Minimum remote signer contract:
  - request: `POST` JSON `{ "payload": <manifest-object> }`
  - response: JSON `{ "signature": "<base64>" }`

## Known Gaps

- This repo does not yet enforce HSM/KMS attestation.
- Rotation approval workflow is operational/process-driven, not yet workflow-enforced in code.
