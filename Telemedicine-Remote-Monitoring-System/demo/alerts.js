const fs = require('fs');
const path = require('path');

const ALERT_LOG_FILE = path.join(__dirname, '.data', 'alerts.log.jsonl');

function readAlerts(filePath = ALERT_LOG_FILE) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean);
}

function exportAlerts(options = {}, filePath = ALERT_LOG_FILE) {
  const fromMs = options.from ? new Date(options.from).getTime() : null;
  const toMs = options.to ? new Date(options.to).getTime() : null;
  const limit = Number(options.limit || 200);
  const resolvedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 1000) : 200;
  const type = String(options.type || '').trim();

  const filtered = readAlerts(filePath).filter((entry) => {
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
    if (type && entry.type !== type) {
      return false;
    }
    return true;
  });

  return filtered.slice(-resolvedLimit);
}

function buildAnomalyCandidates(auditEntries, options = {}, nowMs = Date.now()) {
  const windowSeconds = Number(options.windowSeconds || 300);
  const unauthorizedThreshold = Number(options.unauthorizedThreshold || 5);
  const submitFailureThreshold = Number(options.submitFailureThreshold || 3);
  const windowStartMs = nowMs - (windowSeconds * 1000);

  const inWindow = auditEntries.filter((entry) => {
    const tsMs = new Date(entry.at).getTime();
    return Number.isFinite(tsMs) && tsMs >= windowStartMs;
  });

  const unauthorizedCount = inWindow.filter((entry) => Number(entry.status) === 401).length;
  const submitFailureCount = inWindow.filter((entry) => (
    typeof entry.path === 'string' &&
    entry.path.startsWith('/api/submit') &&
    Number(entry.status) >= 400
  )).length;

  const candidates = [];
  if (unauthorizedCount >= unauthorizedThreshold) {
    candidates.push({
      type: 'unauthorized_spike',
      severity: 'high',
      message: `Unauthorized spike detected: ${unauthorizedCount} in last ${windowSeconds}s`,
      metrics: { count: unauthorizedCount, threshold: unauthorizedThreshold, windowSeconds },
    });
  }
  if (submitFailureCount >= submitFailureThreshold) {
    candidates.push({
      type: 'submit_failure_spike',
      severity: 'medium',
      message: `Submit failure spike detected: ${submitFailureCount} in last ${windowSeconds}s`,
      metrics: { count: submitFailureCount, threshold: submitFailureThreshold, windowSeconds },
    });
  }

  return candidates;
}

function buildValidatorAnomalyCandidates(validatorEvents, options = {}, nowMs = Date.now()) {
  const windowSeconds = Number(options.windowSeconds || 300);
  const failureThreshold = Number(options.validatorFailureThreshold || 3);
  const gasAnomalyGasUsed = Number(options.gasAnomalyGasUsed || 500000);
  const gasAnomalyCountThreshold = Number(options.gasAnomalyCountThreshold || 3);
  const windowStartMs = nowMs - (windowSeconds * 1000);
  const failuresByValidator = new Map();
  const gasAnomaliesByValidator = new Map();

  for (const event of validatorEvents || []) {
    const tsMs = new Date(event.at).getTime();
    if (!Number.isFinite(tsMs) || tsMs < windowStartMs) {
      continue;
    }
    if (event.status !== 'failure') {
      const gasUsed = Number(event.gasUsed || 0);
      if (gasUsed >= gasAnomalyGasUsed) {
        const validatorId = String(event.validatorId || 'unknown');
        gasAnomaliesByValidator.set(validatorId, (gasAnomaliesByValidator.get(validatorId) || 0) + 1);
      }
      continue;
    }
    const validatorId = String(event.validatorId || 'unknown');
    failuresByValidator.set(validatorId, (failuresByValidator.get(validatorId) || 0) + 1);
  }

  const candidates = [];
  for (const [validatorId, count] of failuresByValidator.entries()) {
    if (count < failureThreshold) {
      continue;
    }
    candidates.push({
      type: 'validator_failure_spike',
      dedupeKey: `validator_failure_spike:${validatorId}`,
      severity: 'high',
      message: `Validator failure spike detected for ${validatorId}: ${count} in last ${windowSeconds}s`,
      metrics: { validatorId, count, threshold: failureThreshold, windowSeconds },
    });
  }
  for (const [validatorId, count] of gasAnomaliesByValidator.entries()) {
    if (count < gasAnomalyCountThreshold) {
      continue;
    }
    candidates.push({
      type: 'validator_gas_spike',
      dedupeKey: `validator_gas_spike:${validatorId}`,
      severity: 'medium',
      message: `Validator gas anomaly spike for ${validatorId}: ${count} >= ${gasAnomalyGasUsed} gas in ${windowSeconds}s`,
      metrics: {
        validatorId,
        count,
        gasAnomalyGasUsed,
        threshold: gasAnomalyCountThreshold,
        windowSeconds,
      },
    });
  }
  return candidates;
}

function buildProposalAnomalyCandidates(proposalEvents, options = {}, nowMs = Date.now()) {
  const windowSeconds = Number(options.windowSeconds || 300);
  const proposalFailureThreshold = Number(options.proposalFailureThreshold || 3);
  const pendingProposalThreshold = Number(options.pendingProposalThreshold || 3);
  const windowStartMs = nowMs - (windowSeconds * 1000);

  const inWindow = (proposalEvents || []).filter((entry) => {
    const tsMs = new Date(entry.at).getTime();
    return Number.isFinite(tsMs) && tsMs >= windowStartMs;
  });

  const failureCount = inWindow.filter((entry) => entry.status === 'failure').length;
  const proposalState = new Map();
  for (const entry of inWindow) {
    if (!entry.proposalId) {
      continue;
    }
    if (entry.action === 'execute' && entry.status !== 'failure') {
      proposalState.set(entry.proposalId, 'executed');
    } else if (!proposalState.has(entry.proposalId)) {
      proposalState.set(entry.proposalId, 'pending');
    }
  }
  let pendingCount = 0;
  for (const value of proposalState.values()) {
    if (value === 'pending') {
      pendingCount += 1;
    }
  }

  const candidates = [];
  if (failureCount >= proposalFailureThreshold) {
    candidates.push({
      type: 'proposal_failure_spike',
      dedupeKey: 'proposal_failure_spike',
      severity: 'high',
      message: `Proposal failure spike detected: ${failureCount} in last ${windowSeconds}s`,
      metrics: { count: failureCount, threshold: proposalFailureThreshold, windowSeconds },
    });
  }
  if (pendingCount >= pendingProposalThreshold) {
    candidates.push({
      type: 'proposal_pending_backlog',
      dedupeKey: 'proposal_pending_backlog',
      severity: 'medium',
      message: `Proposal pending backlog detected: ${pendingCount} pending in last ${windowSeconds}s`,
      metrics: { pendingCount, threshold: pendingProposalThreshold, windowSeconds },
    });
  }

  return candidates;
}

function evaluateAndPersistAlerts(
  auditEntries,
  options = {},
  filePath = ALERT_LOG_FILE,
  nowMs = Date.now(),
  validatorEvents = [],
  proposalEvents = []
) {
  const cooldownSeconds = Number(options.cooldownSeconds || 300);
  const candidates = buildAnomalyCandidates(auditEntries, options, nowMs)
    .concat(buildValidatorAnomalyCandidates(validatorEvents, options, nowMs))
    .concat(buildProposalAnomalyCandidates(proposalEvents, options, nowMs));
  if (candidates.length === 0) {
    return [];
  }

  const existingAlerts = exportAlerts({ limit: 1000 }, filePath);
  const latestByType = new Map();
  for (const alert of existingAlerts) {
    const key = alert.dedupeKey || alert.type;
    latestByType.set(key, alert);
  }

  const toPersist = [];
  for (const candidate of candidates) {
    const dedupeKey = candidate.dedupeKey || candidate.type;
    const previous = latestByType.get(dedupeKey);
    const prevMs = previous ? new Date(previous.at).getTime() : null;
    const withinCooldown = Number.isFinite(prevMs) && (nowMs - prevMs < (cooldownSeconds * 1000));
    if (withinCooldown) {
      continue;
    }

    toPersist.push({
      at: new Date(nowMs).toISOString(),
      dedupeKey,
      ...candidate,
    });
  }

  if (toPersist.length > 0) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const body = toPersist.map((entry) => JSON.stringify(entry)).join('\n') + '\n';
    fs.appendFileSync(filePath, body, 'utf8');
  }

  return toPersist;
}

module.exports = {
  ALERT_LOG_FILE,
  exportAlerts,
  buildAnomalyCandidates,
  buildValidatorAnomalyCandidates,
  buildProposalAnomalyCandidates,
  evaluateAndPersistAlerts,
};
