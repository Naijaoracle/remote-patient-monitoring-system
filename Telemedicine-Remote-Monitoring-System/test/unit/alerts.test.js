const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  exportAlerts,
  buildAnomalyCandidates,
  buildProposalAnomalyCandidates,
  buildValidatorAnomalyCandidates,
  evaluateAndPersistAlerts,
} = require('../../demo/alerts');

function createAlertFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-alerts-'));
  return path.join(dir, 'alerts.log.jsonl');
}

function createAuditEntries(nowIso) {
  return [
    { at: nowIso, path: '/api/ledger', status: 401 },
    { at: nowIso, path: '/api/consent/p1', status: 401 },
    { at: nowIso, path: '/api/submit', status: 400 },
    { at: nowIso, path: '/api/submit', status: 400 },
    { at: nowIso, path: '/api/submit', status: 500 },
  ];
}

test('alerts module builds candidates from audit anomalies', () => {
  const nowMs = Date.now();
  const entries = createAuditEntries(new Date(nowMs).toISOString());
  const candidates = buildAnomalyCandidates(entries, {
    windowSeconds: 300,
    unauthorizedThreshold: 2,
    submitFailureThreshold: 3,
  }, nowMs);

  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].type, 'unauthorized_spike');
  assert.equal(candidates[1].type, 'submit_failure_spike');
});

test('alerts module persists alerts and respects cooldown', () => {
  const filePath = createAlertFile();
  const nowMs = Date.now();
  const entries = createAuditEntries(new Date(nowMs).toISOString());

  const first = evaluateAndPersistAlerts(entries, {
    windowSeconds: 300,
    unauthorizedThreshold: 2,
    submitFailureThreshold: 3,
    cooldownSeconds: 600,
  }, filePath, nowMs);
  assert.equal(first.length, 2);

  const second = evaluateAndPersistAlerts(entries, {
    windowSeconds: 300,
    unauthorizedThreshold: 2,
    submitFailureThreshold: 3,
    cooldownSeconds: 600,
  }, filePath, nowMs + 1_000);
  assert.equal(second.length, 0);

  const all = exportAlerts({ limit: 10 }, filePath);
  assert.equal(all.length, 2);
});

test('alerts export supports filtering by type', () => {
  const filePath = createAlertFile();
  const nowMs = Date.now();
  const entries = createAuditEntries(new Date(nowMs).toISOString());
  evaluateAndPersistAlerts(entries, {
    windowSeconds: 300,
    unauthorizedThreshold: 2,
    submitFailureThreshold: 3,
    cooldownSeconds: 0,
  }, filePath, nowMs);

  const unauthorized = exportAlerts({ type: 'unauthorized_spike', limit: 10 }, filePath);
  assert.equal(unauthorized.length, 1);
  assert.equal(unauthorized[0].type, 'unauthorized_spike');
});

test('alerts module detects validator failure spikes', () => {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const candidates = buildValidatorAnomalyCandidates([
    { at: nowIso, validatorId: '0xval1', status: 'failure' },
    { at: nowIso, validatorId: '0xval1', status: 'failure' },
    { at: nowIso, validatorId: '0xval1', status: 'failure' },
  ], { windowSeconds: 300, validatorFailureThreshold: 3 }, nowMs);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].type, 'validator_failure_spike');
  assert.equal(candidates[0].metrics.validatorId, '0xval1');
});

test('validator failure alerts are cooldown-scoped per validator', () => {
  const filePath = createAlertFile();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const telemetry = [
    { at: nowIso, validatorId: '0xval1', status: 'failure' },
    { at: nowIso, validatorId: '0xval1', status: 'failure' },
    { at: nowIso, validatorId: '0xval1', status: 'failure' },
    { at: nowIso, validatorId: '0xval2', status: 'failure' },
    { at: nowIso, validatorId: '0xval2', status: 'failure' },
    { at: nowIso, validatorId: '0xval2', status: 'failure' },
  ];

  const first = evaluateAndPersistAlerts([], {
    validatorFailureThreshold: 3,
    cooldownSeconds: 600,
  }, filePath, nowMs, telemetry);
  assert.equal(first.length, 2);

  const second = evaluateAndPersistAlerts([], {
    validatorFailureThreshold: 3,
    cooldownSeconds: 600,
  }, filePath, nowMs + 1_000, telemetry);
  assert.equal(second.length, 0);
});

test('alerts module detects validator gas spikes', () => {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const candidates = buildValidatorAnomalyCandidates([
    { at: nowIso, validatorId: '0xval1', status: 'success', gasUsed: 700000 },
    { at: nowIso, validatorId: '0xval1', status: 'success', gasUsed: 800000 },
    { at: nowIso, validatorId: '0xval1', status: 'success', gasUsed: 900000 },
  ], { windowSeconds: 300, gasAnomalyGasUsed: 600000, gasAnomalyCountThreshold: 3 }, nowMs);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].type, 'validator_gas_spike');
  assert.equal(candidates[0].metrics.validatorId, '0xval1');
});

test('alerts module detects proposal failure and backlog anomalies', () => {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const candidates = buildProposalAnomalyCandidates([
    { at: nowIso, proposalId: 'p1', action: 'create', status: 'success' },
    { at: nowIso, proposalId: 'p2', action: 'create', status: 'success' },
    { at: nowIso, proposalId: 'p3', action: 'create', status: 'success' },
    { at: nowIso, proposalId: 'p4', action: 'create', status: 'failure' },
    { at: nowIso, proposalId: 'p5', action: 'approve', status: 'failure' },
    { at: nowIso, proposalId: 'p6', action: 'execute', status: 'failure' },
  ], {
    windowSeconds: 300,
    proposalFailureThreshold: 3,
    pendingProposalThreshold: 3,
  }, nowMs);

  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].type, 'proposal_failure_spike');
  assert.equal(candidates[1].type, 'proposal_pending_backlog');
});
