const fs = require('fs');
const path = require('path');

const { verifyAuditExportPackage } = require('../../demo/audit');

function verifyAuditPackageFile(inputPath, cwd = process.cwd()) {
  if (!inputPath) {
    return { ok: false, code: 'missing_path', message: 'Missing input path' };
  }

  const resolvedPath = path.resolve(cwd, inputPath);
  if (!fs.existsSync(resolvedPath)) {
    return { ok: false, code: 'missing_file', message: `File not found: ${resolvedPath}` };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  } catch (error) {
    return { ok: false, code: 'invalid_json', message: `Invalid JSON: ${error.message}` };
  }

  const exportPackage = parsed.exportPackage || parsed;
  const verified = verifyAuditExportPackage(exportPackage);
  if (!verified) {
    return { ok: false, code: 'invalid_package', message: 'audit package verification failed' };
  }

  return {
    ok: true,
    code: 'valid',
    signerId: exportPackage.signature?.signerId || 'unknown',
    entryCount: Number(exportPackage.manifest?.entryCount || 0),
    payloadHash: String(exportPackage.manifest?.payloadHash || ''),
  };
}

module.exports = {
  verifyAuditPackageFile,
};
