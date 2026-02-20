'use strict';

function noop() {}

function normalizeHooks(candidate) {
  return {
    beforeInit: typeof candidate?.beforeInit === 'function' ? candidate.beforeInit : noop,
    beforeSubmit: typeof candidate?.beforeSubmit === 'function' ? candidate.beforeSubmit : noop,
    afterSubmit: typeof candidate?.afterSubmit === 'function' ? candidate.afterSubmit : noop,
  };
}

function loadCustomHooks() {
  const hookFile = process.env.CUSTOM_HOOKS_FILE;
  if (!hookFile) {
    return normalizeHooks({});
  }
  const loaded = require(hookFile);
  return normalizeHooks(loaded || {});
}

module.exports = { loadCustomHooks };
