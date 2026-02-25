const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  appendProposalTelemetry,
  appendValidatorTelemetry,
  exportProposalTelemetry,
  exportValidatorTelemetry,
  summarizeProposalTelemetry,
  summarizeValidatorTelemetry,
} = require('../../demo/telemetry');

function createTelemetryFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-telemetry-'));
  return path.join(dir, 'validator-telemetry.jsonl');
}

function createProposalTelemetryFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-proposal-telemetry-'));
  return path.join(dir, 'proposal-telemetry.jsonl');
}

test('telemetry appends and exports validator events', async () => {
  const filePath = createTelemetryFile();
  await appendValidatorTelemetry({
    validatorId: '0xval1',
    status: 'success',
    txHash: '0xtx1',
    onChainTxHash: '0xchain1',
    gasUsed: 650000,
    durationMs: 120,
  }, filePath);
  await appendValidatorTelemetry({
    validatorId: '0xval1',
    status: 'failure',
    reason: 'rejected',
    durationMs: 50,
  }, filePath);

  const events = await exportValidatorTelemetry({ limit: 10 }, filePath);
  assert.equal(events.length, 2);
  assert.equal(events[0].validatorId, '0xval1');
  assert.equal(events[1].status, 'failure');
  assert.equal(events[0].gasUsed, 650000);
});

test('telemetry summary groups per validator', () => {
  const summary = summarizeValidatorTelemetry([
    { validatorId: 'v1', status: 'success', onChainTxHash: '0x1', durationMs: 100, gasUsed: 100000 },
    { validatorId: 'v1', status: 'success', onChainTxHash: '', durationMs: 200, gasUsed: 700000 },
    { validatorId: 'v1', status: 'failure', durationMs: 10 },
    { validatorId: 'v2', status: 'success', onChainTxHash: '0x2', durationMs: 300, gasUsed: 300000 },
  ]);

  assert.equal(summary.totalEvents, 4);
  assert.equal(summary.totalSuccess, 3);
  assert.equal(summary.totalFailure, 1);
  assert.equal(summary.byValidator.v1.success, 2);
  assert.equal(summary.byValidator.v1.failure, 1);
  assert.equal(summary.byValidator.v1.anchored, 1);
  assert.equal(summary.byValidator.v1.avgDurationMs, 150);
  assert.equal(summary.byValidator.v1.avgGasUsed, 400000);
  assert.equal(summary.byValidator.v1.maxGasUsed, 700000);
  assert.equal(summary.gasAnomalyCount, 1);
  assert.equal(summary.byValidator.v2.success, 1);
});

test('proposal telemetry exports and summarizes lifecycle', async () => {
  const filePath = createProposalTelemetryFile();
  await appendProposalTelemetry({
    proposalId: 'proposal-1',
    proposalType: 'addValidator',
    validatorId: 'v1',
    action: 'create',
    status: 'success',
  }, filePath);
  await appendProposalTelemetry({
    proposalId: 'proposal-1',
    proposalType: 'addValidator',
    validatorId: 'v2',
    action: 'approve',
    status: 'success',
  }, filePath);
  await appendProposalTelemetry({
    proposalId: 'proposal-2',
    proposalType: 'removeValidator',
    validatorId: 'v3',
    action: 'create',
    status: 'failure',
    reason: 'quorum',
  }, filePath);

  const events = await exportProposalTelemetry({ limit: 10 }, filePath);
  assert.equal(events.length, 3);
  const summary = summarizeProposalTelemetry(events);
  assert.equal(summary.totalEvents, 3);
  assert.equal(summary.created, 2);
  assert.equal(summary.approved, 1);
  assert.equal(summary.executed, 0);
  assert.equal(summary.failed, 1);
  assert.equal(summary.pendingProposalCount, 2);
  assert.equal(summary.byValidator.v3.failures, 1);
});

test('proposal telemetry deduplicates by eventUid', async () => {
  const filePath = createProposalTelemetryFile();
  const first = await appendProposalTelemetry({
    proposalId: 'proposal-dup',
    validatorId: 'v1',
    action: 'create',
    status: 'success',
    eventUid: 'tx1:0:create',
  }, filePath);
  const duplicate = await appendProposalTelemetry({
    proposalId: 'proposal-dup',
    validatorId: 'v1',
    action: 'create',
    status: 'success',
    eventUid: 'tx1:0:create',
  }, filePath);

  assert.equal(Boolean(first), true);
  assert.equal(duplicate, null);
  assert.equal((await exportProposalTelemetry({ limit: 10 }, filePath)).length, 1);
});
