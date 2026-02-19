const fs = require('fs');
const path = require('path');

const AUDIT_KEY_HISTORY_FILE = path.join(__dirname, '.data', 'audit-signing-keys.json');

function loadAuditKeyHistory(filePath = AUDIT_KEY_HISTORY_FILE) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function saveAuditKeyHistory(history, filePath = AUDIT_KEY_HISTORY_FILE) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2) + '\n', 'utf8');
}

function getActiveAuditSigningKey(filePath = AUDIT_KEY_HISTORY_FILE) {
  const history = loadAuditKeyHistory(filePath);
  return history.find((entry) => !entry.retiredAt) || null;
}

function rotateAuditSigningKey(metadata, filePath = AUDIT_KEY_HISTORY_FILE) {
  const keyId = String(metadata.keyId || '').trim();
  const publicKeyPem = String(metadata.publicKeyPem || '').trim();
  const reason = String(metadata.reason || 'rotation');
  const rotatedAt = metadata.rotatedAt || new Date().toISOString();

  if (!keyId || !publicKeyPem) {
    throw new Error('keyId and publicKeyPem are required');
  }

  const history = loadAuditKeyHistory(filePath);
  for (const entry of history) {
    if (!entry.retiredAt) {
      entry.retiredAt = rotatedAt;
    }
  }

  const next = [{
    keyId,
    publicKeyPem,
    activatedAt: rotatedAt,
    retiredAt: null,
    reason,
  }, ...history];
  saveAuditKeyHistory(next, filePath);
  return next[0];
}

module.exports = {
  AUDIT_KEY_HISTORY_FILE,
  loadAuditKeyHistory,
  getActiveAuditSigningKey,
  rotateAuditSigningKey,
};
