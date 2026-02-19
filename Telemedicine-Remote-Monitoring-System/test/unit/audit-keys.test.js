const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  loadAuditKeyHistory,
  getActiveAuditSigningKey,
  rotateAuditSigningKey,
} = require('../../demo/audit-keys');

function createKeyHistoryFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-audit-keys-'));
  return path.join(dir, 'audit-signing-keys.json');
}

test('audit key history records active key and rotation', () => {
  const filePath = createKeyHistoryFile();
  rotateAuditSigningKey({
    keyId: 'key-1',
    publicKeyPem: 'pub-1',
    rotatedAt: '2026-01-01T00:00:00.000Z',
    reason: 'init',
  }, filePath);

  let active = getActiveAuditSigningKey(filePath);
  assert.equal(active.keyId, 'key-1');
  assert.equal(active.retiredAt, null);

  rotateAuditSigningKey({
    keyId: 'key-2',
    publicKeyPem: 'pub-2',
    rotatedAt: '2026-01-02T00:00:00.000Z',
    reason: 'manual',
  }, filePath);

  const history = loadAuditKeyHistory(filePath);
  assert.equal(history.length, 2);
  assert.equal(history[0].keyId, 'key-2');
  assert.equal(history[0].retiredAt, null);
  assert.equal(history[1].keyId, 'key-1');
  assert.equal(history[1].retiredAt, '2026-01-02T00:00:00.000Z');

  active = getActiveAuditSigningKey(filePath);
  assert.equal(active.keyId, 'key-2');
});
