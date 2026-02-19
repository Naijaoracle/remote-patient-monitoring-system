# Commercial Extension Slot (Private)

This directory is the boundary between public core code and private/commercial logic.

## New pattern: separate private npm package

Commercial hook implementations now live in a **fully separate private git repo**,
installed as an npm package. There is no commercial code file inside this public tree.

Private repo: `rpm-commercial-hooks` (separate repository, not a subdirectory here)

## Hook interface contract

The private package must export an object with any combination of these async functions:

```js
module.exports = {
  async beforeInit(context) { /* ... */ },
  async beforeSubmit(context) { /* ... */ },
  async afterSubmit(context) { /* ... */ },
};
```

All hooks are optional — missing exports default to no-ops.

### `beforeInit(context)`
Called before portal initialization. Throw an `Error` to abort startup.

### `beforeSubmit(context)`
Called before a `/api/submit` request is processed. Throw an `Error` to reject.

### `afterSubmit(context)`
Called after a successful `/api/submit`. Use for billing, analytics, or audit side-effects.

## Installing the private package locally

```bash
# From Telemedicine-Remote-Monitoring-System/
npm install ../rpm-commercial-hooks
```

Or, once published to a private registry:

```bash
npm install rpm-commercial-hooks
```

## Loading behavior

`demo/commercial-hooks.js` loads hooks in this priority order:

1. `COMMERCIAL_HOOKS_FILE` env var → `require(<path>)` (dev/test override)
2. `require('rpm-commercial-hooks')` — the installed private package
3. If not installed → silent no-ops (public core runs normally without the package)

## What to put in the private package

- Payer/provider-specific routing
- Proprietary risk/scoring checks
- Premium workflow gates
- Enterprise tenant policy rules
