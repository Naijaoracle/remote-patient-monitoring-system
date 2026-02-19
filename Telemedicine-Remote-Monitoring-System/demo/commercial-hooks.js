'use strict';

function noop() {}

function normalizeHooks(candidate) {
  return {
    beforeInit: typeof candidate?.beforeInit === 'function' ? candidate.beforeInit : noop,
    beforeSubmit: typeof candidate?.beforeSubmit === 'function' ? candidate.beforeSubmit : noop,
    afterSubmit: typeof candidate?.afterSubmit === 'function' ? candidate.afterSubmit : noop,
  };
}

function loadCommercialHooks() {
  const hookFile = process.env.COMMERCIAL_HOOKS_FILE;
  if (hookFile) {
    const loaded = require(hookFile);
    return normalizeHooks(loaded || {});
  }

  try {
    const loaded = require('rpm-commercial-hooks');
    return normalizeHooks(loaded || {});
  } catch {
    return normalizeHooks({});
  }
}

module.exports = { loadCommercialHooks };
