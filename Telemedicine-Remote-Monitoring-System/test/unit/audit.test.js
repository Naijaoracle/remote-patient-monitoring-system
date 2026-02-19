const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  exportAuditEntries,
  summarizeAuditEntries,
  buildAuditExportPackage,
  verifyAuditExportPackage,
} = require('../../demo/audit');
const CryptoUtils = require('../../mobile-app/utils/CryptoUtils');

function createAuditFile(entries) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-audit-'));
  const filePath = path.join(dir, 'audit.log.jsonl');
  fs.writeFileSync(filePath, entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n', 'utf8');
  return filePath;
}

test('audit export filters by range and limit', () => {
  const entries = [
    { at: '2026-01-01T00:00:00.000Z', path: '/api/health', status: 200 },
    { at: '2026-01-01T00:01:00.000Z', path: '/api/submit', status: 200 },
    { at: '2026-01-01T00:02:00.000Z', path: '/api/submit', status: 400 },
  ];
  const filePath = createAuditFile(entries);

  const exported = exportAuditEntries({
    from: '2026-01-01T00:00:30.000Z',
    to: '2026-01-01T00:02:00.000Z',
    limit: 1,
  }, filePath);

  assert.equal(exported.length, 1);
  assert.equal(exported[0].status, 400);
});

test('audit summary returns key operational counts', () => {
  const summary = summarizeAuditEntries([
    { path: '/api/submit', status: 200 },
    { path: '/api/submit', status: 400 },
    { path: '/api/ledger', status: 401 },
    { path: '/api/health', status: 500 },
  ]);

  assert.equal(summary.total, 4);
  assert.equal(summary.success2xx, 1);
  assert.equal(summary.client4xx, 2);
  assert.equal(summary.server5xx, 1);
  assert.equal(summary.unauthorized, 1);
  assert.equal(summary.measurementSubmitSuccess, 1);
  assert.equal(summary.measurementSubmitFailures, 1);
});

test('audit export package is tamper-evident and verifiable', async () => {
  const signingKeys = CryptoUtils.generateKeyPair();
  const entries = [
    { at: '2026-01-01T00:00:00.000Z', path: '/api/health', status: 200 },
    { at: '2026-01-01T00:01:00.000Z', path: '/api/submit', status: 200 },
  ];

  const exportPackage = await buildAuditExportPackage(entries, {
    signerId: 'audit-signer-test',
    publicKeyPem: signingKeys.publicKey,
    sign: (manifest) => CryptoUtils.signData(manifest, signingKeys.privateKey),
  });

  assert.equal(verifyAuditExportPackage(exportPackage), true);

  const tampered = {
    ...exportPackage,
    entries: exportPackage.entries.concat([{ at: '2026-01-01T00:02:00.000Z', path: '/api/x', status: 200 }]),
  };
  assert.equal(verifyAuditExportPackage(tampered), false);
});
