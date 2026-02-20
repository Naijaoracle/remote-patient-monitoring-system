# Optional Hook Slot (Private)

This directory is a boundary between public core code and optional private logic.

## Hook interface contract

An optional local file can export any combination of these async functions:

```js
module.exports = {
  async beforeInit(context) { /* ... */ },
  async beforeSubmit(context) { /* ... */ },
  async afterSubmit(context) { /* ... */ },
};
```

All hooks are optional. Missing exports default to no-ops.

## Local override

Set `CUSTOM_HOOKS_FILE` to the module path to load.

Example:

```bash
CUSTOM_HOOKS_FILE=./extensions/hooks/hooks.local.js npm run demo:portal
```
