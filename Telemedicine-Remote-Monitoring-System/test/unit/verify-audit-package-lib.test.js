const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildAuditExportPackage } = require('../../demo/audit');
const CryptoUtils = require('../../shared/runtime/utils/CryptoUtils');
const { verifyAuditPackageFile } = require('../../scripts/lib/verify-audit-package-lib');

function createTempJsonFile(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-audit-cli-'));
  const filePath = path.join(dir, 'package.json');
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');
  return filePath;
}

test('verify-audit-package library validates signed export packages', async () => {
  const signingKeys = CryptoUtils.generateKeyPair();
  const exportPackage = await buildAuditExportPackage(
    [{ at: '2026-01-01T00:00:00.000Z', path: '/api/health', status: 200 }],
    {
      signerId: 'cli-test-signer',
      publicKeyPem: signingKeys.publicKey,
      sign: (manifest) => CryptoUtils.signData(manifest, signingKeys.privateKey),
    }
  );
  const filePath = createTempJsonFile({ exportPackage });

  const result = verifyAuditPackageFile(filePath);
  assert.equal(result.ok, true);
  assert.equal(result.signerId, 'cli-test-signer');
});

test('verify-audit-package library rejects tampered packages', async () => {
  const signingKeys = CryptoUtils.generateKeyPair();
  const exportPackage = await buildAuditExportPackage(
    [{ at: '2026-01-01T00:00:00.000Z', path: '/api/health', status: 200 }],
    {
      signerId: 'cli-test-signer',
      publicKeyPem: signingKeys.publicKey,
      sign: (manifest) => CryptoUtils.signData(manifest, signingKeys.privateKey),
    }
  );
  exportPackage.entries.push({ at: '2026-01-01T00:01:00.000Z', path: '/api/x', status: 200 });
  const filePath = createTempJsonFile({ exportPackage });

  const result = verifyAuditPackageFile(filePath);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid_package');
});
