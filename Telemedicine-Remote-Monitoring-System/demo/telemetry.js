const fs = require('fs');
const path = require('path');
const { withFileLock } = require('./file-lock');

const TELEMETRY_FILE = path.join(__dirname, '.data', 'validator-telemetry.jsonl');
const PROPOSAL_TELEMETRY_FILE = path.join(__dirname, '.data', 'proposal-telemetry.jsonl');

// In-memory cache of seen proposal eventUids for the default file path.
// Avoids O(n) full-file scan on every blockchain event while keeping
// the file as the source of truth. Custom filePaths (e.g. tests) bypass this.
const _proposalUidCache = new Set();
let _proposalUidCacheSeeded = false;

function _seedProposalUidCache() {
  if (_proposalUidCacheSeeded) return;
  _proposalUidCacheSeeded = true;
  if (!fs.existsSync(PROPOSAL_TELEMETRY_FILE)) return;
  const lines = fs.readFileSync(PROPOSAL_TELEMETRY_FILE, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.eventUid) _proposalUidCache.add(parsed.eventUid);
    } catch (_e) {
      // skip unparseable lines
    }
  }
}

async function appendValidatorTelemetry(event, filePath = TELEMETRY_FILE) {
  const entry = {
    at: new Date().toISOString(),
    validatorId: String(event.validatorId || '').trim() || 'unknown',
    status: String(event.status || 'unknown'),
    reason: String(event.reason || ''),
    txHash: String(event.txHash || ''),
    onChainTxHash: String(event.onChainTxHash || ''),
    gasUsed: Number(event.gasUsed || 0),
    durationMs: Number(event.durationMs || 0),
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lockPath = `${filePath}.lock`;
  await withFileLock(lockPath, () => {
    fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf8');
  });
  return entry;
}

async function exportValidatorTelemetry(options = {}, filePath = TELEMETRY_FILE) {
  let raw;
  try {
    raw = await fs.promises.readFile(filePath, 'utf8');
  } catch (_error) {
    return [];
  }

  const fromMs = options.from ? new Date(options.from).getTime() : null;
  const toMs = options.to ? new Date(options.to).getTime() : null;
  const limit = Number(options.limit || 500);
  const resolvedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 5000) : 500;
  const validatorId = String(options.validatorId || '').trim();

  const entries = raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean)
    .filter((entry) => {
      const tsMs = new Date(entry.at).getTime();
      if (!Number.isFinite(tsMs)) {
        return false;
      }
      if (Number.isFinite(fromMs) && tsMs < fromMs) {
        return false;
      }
      if (Number.isFinite(toMs) && tsMs > toMs) {
        return false;
      }
      if (validatorId && entry.validatorId !== validatorId) {
        return false;
      }
      return true;
    });

  return entries.slice(-resolvedLimit);
}

function summarizeValidatorTelemetry(entries, options = {}) {
  const gasAnomalyGasUsed = Number(options.gasAnomalyGasUsed || 500000);
  const summary = {
    totalEvents: entries.length,
    totalSuccess: 0,
    totalFailure: 0,
    gasAnomalyCount: 0,
    byValidator: {},
  };

  for (const entry of entries) {
    const id = String(entry.validatorId || 'unknown');
    if (!summary.byValidator[id]) {
      summary.byValidator[id] = {
        success: 0,
        failure: 0,
        anchored: 0,
        avgDurationMs: 0,
        avgGasUsed: 0,
        maxGasUsed: 0,
      };
    }
    const bucket = summary.byValidator[id];

    if (entry.status === 'success') {
      summary.totalSuccess += 1;
      bucket.success += 1;
      if (entry.onChainTxHash) {
        bucket.anchored += 1;
      }
      const samples = bucket.success;
      const duration = Number(entry.durationMs || 0);
      const gasUsed = Number(entry.gasUsed || 0);
      bucket.avgDurationMs = samples > 0
        ? Math.round(((bucket.avgDurationMs * (samples - 1)) + duration) / samples)
        : 0;
      bucket.avgGasUsed = samples > 0
        ? Math.round(((bucket.avgGasUsed * (samples - 1)) + gasUsed) / samples)
        : 0;
      if (gasUsed > bucket.maxGasUsed) {
        bucket.maxGasUsed = gasUsed;
      }
      if (gasUsed > 0 && gasUsed >= gasAnomalyGasUsed) {
        summary.gasAnomalyCount += 1;
      }
    } else if (entry.status === 'failure') {
      summary.totalFailure += 1;
      bucket.failure += 1;
    }
  }

  return summary;
}

async function appendProposalTelemetry(event, filePath = PROPOSAL_TELEMETRY_FILE) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lockPath = `${filePath}.lock`;
  return withFileLock(lockPath, () => {
    const eventUid = String(event.eventUid || '').trim();
    if (eventUid && hasProposalEvent(eventUid, filePath)) {
      return null;
    }

    const entry = {
      at: new Date().toISOString(),
      proposalId: String(event.proposalId || '').trim() || 'unknown',
      proposalType: String(event.proposalType || 'unknown'),
      validatorId: String(event.validatorId || '').trim() || 'unknown',
      action: String(event.action || 'unknown'),
      status: String(event.status || 'unknown'),
      txHash: String(event.txHash || ''),
      eventUid: eventUid || null,
      blockNumber: Number(event.blockNumber || 0),
      logIndex: Number(event.logIndex || 0),
      removed: Boolean(event.removed),
      gasUsed: Number(event.gasUsed || 0),
      source: String(event.source || 'api'),
      reason: String(event.reason || ''),
    };
    fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf8');
    if (filePath === PROPOSAL_TELEMETRY_FILE && eventUid) {
      _proposalUidCache.add(eventUid);
    }
    return entry;
  });
}

function hasProposalEvent(eventUid, filePath = PROPOSAL_TELEMETRY_FILE) {
  if (!eventUid || !fs.existsSync(filePath)) {
    return false;
  }
  // Use in-memory cache for the default file path to avoid O(n) scan per submission.
  if (filePath === PROPOSAL_TELEMETRY_FILE) {
    _seedProposalUidCache();
    return _proposalUidCache.has(eventUid);
  }
  // Custom filePath (e.g. tests): fall back to file scan.
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.eventUid === eventUid) {
        return true;
      }
    } catch (_error) {
      // ignore parse failures in demo telemetry scan
    }
  }
  return false;
}

async function exportProposalTelemetry(options = {}, filePath = PROPOSAL_TELEMETRY_FILE) {
  let raw;
  try {
    raw = await fs.promises.readFile(filePath, 'utf8');
  } catch (_error) {
    return [];
  }

  const fromMs = options.from ? new Date(options.from).getTime() : null;
  const toMs = options.to ? new Date(options.to).getTime() : null;
  const limit = Number(options.limit || 500);
  const resolvedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 5000) : 500;
  const proposalId = String(options.proposalId || '').trim();
  const validatorId = String(options.validatorId || '').trim();
  const action = String(options.action || '').trim();

  const entries = raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean)
    .filter((entry) => {
      const tsMs = new Date(entry.at).getTime();
      if (!Number.isFinite(tsMs)) {
        return false;
      }
      if (Number.isFinite(fromMs) && tsMs < fromMs) {
        return false;
      }
      if (Number.isFinite(toMs) && tsMs > toMs) {
        return false;
      }
      if (proposalId && entry.proposalId !== proposalId) {
        return false;
      }
      if (validatorId && entry.validatorId !== validatorId) {
        return false;
      }
      if (action && entry.action !== action) {
        return false;
      }
      return true;
    });

  return entries.slice(-resolvedLimit);
}

function summarizeProposalTelemetry(entries) {
  const summary = {
    totalEvents: entries.length,
    created: 0,
    approved: 0,
    executed: 0,
    failed: 0,
    pendingProposalCount: 0,
    byValidator: {},
  };

  const stateByProposal = new Map();
  for (const entry of entries) {
    if (entry.action === 'create') {
      summary.created += 1;
      stateByProposal.set(entry.proposalId, 'created');
    } else if (entry.action === 'approve') {
      summary.approved += 1;
    } else if (entry.action === 'execute') {
      summary.executed += 1;
      stateByProposal.set(entry.proposalId, 'executed');
    }
    if (entry.status === 'failure') {
      summary.failed += 1;
    }
    if (entry.removed) {
      summary.failed += 1;
    }

    const validatorId = String(entry.validatorId || 'unknown');
    if (!summary.byValidator[validatorId]) {
      summary.byValidator[validatorId] = { events: 0, failures: 0 };
    }
    summary.byValidator[validatorId].events += 1;
    if (entry.status === 'failure') {
      summary.byValidator[validatorId].failures += 1;
    }
  }

  let pending = 0;
  for (const status of stateByProposal.values()) {
    if (status !== 'executed') {
      pending += 1;
    }
  }
  summary.pendingProposalCount = pending;

  return summary;
}

module.exports = {
  TELEMETRY_FILE,
  PROPOSAL_TELEMETRY_FILE,
  appendValidatorTelemetry,
  exportValidatorTelemetry,
  summarizeValidatorTelemetry,
  appendProposalTelemetry,
  exportProposalTelemetry,
  summarizeProposalTelemetry,
  hasProposalEvent,
};
