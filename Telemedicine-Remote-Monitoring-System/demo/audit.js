const fs = require('fs');
const path = require('path');
const CryptoUtils = require('../shared/runtime/utils/CryptoUtils');

const AUDIT_LOG_FILE = path.join(__dirname, '.data', 'audit.log.jsonl');

function readAuditEntries(filePath = AUDIT_LOG_FILE) {
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

function exportAuditEntries(options = {}, filePath = AUDIT_LOG_FILE) {
  const fromMs = options.from ? new Date(options.from).getTime() : null;
  const toMs = options.to ? new Date(options.to).getTime() : null;
  const limit = Number(options.limit || 200);
  const resolvedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 1000) : 200;

  const entries = readAuditEntries(filePath).filter((entry) => {
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
    return true;
  });

  return entries.slice(-resolvedLimit);
}

function summarizeAuditEntries(entries) {
  const summary = {
    total: entries.length,
    success2xx: 0,
    client4xx: 0,
    server5xx: 0,
    unauthorized: 0,
    measurementSubmitSuccess: 0,
    measurementSubmitFailures: 0,
  };

  for (const entry of entries) {
    const status = Number(entry.status || 0);
    if (status >= 200 && status < 300) {
      summary.success2xx += 1;
    } else if (status >= 400 && status < 500) {
      summary.client4xx += 1;
    } else if (status >= 500) {
      summary.server5xx += 1;
    }

    if (status === 401) {
      summary.unauthorized += 1;
    }

    if (typeof entry.path === 'string' && entry.path.startsWith('/api/submit')) {
      if (status >= 200 && status < 300) {
        summary.measurementSubmitSuccess += 1;
      } else {
        summary.measurementSubmitFailures += 1;
      }
    }
  }

  return summary;
}

async function buildAuditExportPackage(entries, options = {}) {
  if (!Array.isArray(entries)) {
    throw new Error('entries must be an array');
  }
  if (typeof options.sign !== 'function') {
    throw new Error('sign function is required');
  }

  const generatedAt = new Date().toISOString();
  const payloadHash = `0x${CryptoUtils.digest(entries)}`;
  const manifest = {
    version: 'rpm-audit-export/v1',
    generatedAt,
    from: options.from || null,
    to: options.to || null,
    limit: Number(options.limit || entries.length),
    entryCount: entries.length,
    payloadHash,
  };

  const signature = {
    signerId: String(options.signerId || 'demo-audit-signer'),
    algorithm: String(options.algorithm || 'ECDSA-SHA256'),
    publicKeyPem: String(options.publicKeyPem || ''),
    value: await options.sign(manifest),
  };

  return {
    manifest,
    signature,
    entries,
  };
}

function verifyAuditExportPackage(exportPackage) {
  if (!exportPackage || typeof exportPackage !== 'object') {
    return false;
  }
  const { manifest, signature, entries } = exportPackage;
  if (!manifest || !signature || !Array.isArray(entries)) {
    return false;
  }
  if (!signature.publicKeyPem || !signature.value) {
    return false;
  }
  const expectedPayloadHash = `0x${CryptoUtils.digest(entries)}`;
  if (manifest.payloadHash !== expectedPayloadHash) {
    return false;
  }

  return CryptoUtils.verifySignature(manifest, signature.value, signature.publicKeyPem);
}

module.exports = {
  AUDIT_LOG_FILE,
  exportAuditEntries,
  summarizeAuditEntries,
  buildAuditExportPackage,
  verifyAuditExportPackage,
};
