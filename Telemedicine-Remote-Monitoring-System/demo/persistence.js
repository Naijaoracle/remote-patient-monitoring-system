const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '.data');
const DB_FILE = path.join(DATA_DIR, 'records.enc.jsonl');

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function resolveKey() {
  const keyHex = process.env.RPM_STORAGE_KEY_HEX;
  if (keyHex) {
    if (!/^[a-fA-F0-9]{64}$/.test(keyHex)) {
      throw new Error('RPM_STORAGE_KEY_HEX must be 64 hex chars (32 bytes)');
    }
    return Buffer.from(keyHex, 'hex');
  }

  // Demo-only deterministic fallback key.
  return crypto.createHash('sha256').update('rpm-demo-insecure-dev-key').digest();
}

function encryptObject(payload, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
  };
}

function decryptObject(enc, key) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(enc.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(enc.authTag, 'hex'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(enc.ciphertext, 'hex')),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString('utf8'));
}

function appendEncryptedRecord(txHash, record) {
  ensureDataDir();
  const key = resolveKey();
  const encrypted = encryptObject(record, key);

  const envelope = {
    txHash,
    createdAt: new Date().toISOString(),
    ...encrypted,
  };

  fs.appendFileSync(DB_FILE, JSON.stringify(envelope) + '\n', 'utf8');
}

function getEncryptedRecord(txHash) {
  ensureDataDir();
  if (!fs.existsSync(DB_FILE)) {
    return null;
  }

  const key = resolveKey();
  const lines = fs.readFileSync(DB_FILE, 'utf8').split('\n').filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i--) {
    const parsed = JSON.parse(lines[i]);
    if (parsed.txHash !== txHash) {
      continue;
    }

    const payload = decryptObject(parsed, key);
    return {
      txHash: parsed.txHash,
      createdAt: parsed.createdAt,
      payload,
    };
  }

  return null;
}

function purgeEncryptedRecords(ttlSeconds) {
  ensureDataDir();
  if (!ttlSeconds || ttlSeconds <= 0 || !fs.existsSync(DB_FILE)) {
    return 0;
  }

  const nowMs = Date.now();
  const ttlMs = ttlSeconds * 1000;
  const lines = fs.readFileSync(DB_FILE, 'utf8').split('\n').filter(Boolean);
  const kept = [];
  let removed = 0;

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      const createdAtMs = new Date(parsed.createdAt).getTime();
      if (!Number.isFinite(createdAtMs) || nowMs - createdAtMs <= ttlMs) {
        kept.push(line);
      } else {
        removed += 1;
      }
    } catch (_error) {
      kept.push(line);
    }
  }

  fs.writeFileSync(DB_FILE, kept.join('\n') + (kept.length ? '\n' : ''), 'utf8');
  return removed;
}

module.exports = {
  appendEncryptedRecord,
  getEncryptedRecord,
  purgeEncryptedRecords,
  DB_FILE,
};
