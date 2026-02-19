# Developer Quality Gates

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
