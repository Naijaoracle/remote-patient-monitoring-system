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

  if (process.env.ALLOW_DEMO_INSECURE_KEYS !== '1') {
    throw new Error(
      'RPM_STORAGE_KEY_HEX is required. Set it to a 64-char hex string (32 random bytes), ' +
      'or set ALLOW_DEMO_INSECURE_KEYS=1 for explicit demo-only mode.'
    );
  }
  // Demo-only deterministic fallback (only reachable when ALLOW_DEMO_INSECURE_KEYS=1).
  return crypto.createHash('sha256').update('rpm-demo-insecure-dev-key').digest();
}

function deriveRecordKey(masterKey, txHash, kdfSaltHex) {
  if (!kdfSaltHex) {
    return masterKey;
  }
  const salt = Buffer.from(kdfSaltHex, 'hex');
  const info = Buffer.from(`rpm-record:${String(txHash || '')}`, 'utf8');
  return crypto.hkdfSync('sha256', masterKey, salt, info, 32);
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
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(enc.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(enc.authTag, 'hex'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(enc.ciphertext, 'hex')),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString('utf8'));
  } catch (_error) {
    throw new Error('Decryption failed: invalid or corrupted ciphertext');
  }
}

function appendEncryptedRecord(txHash, record) {
  ensureDataDir();
  const key = resolveKey();
  const kdfSaltHex = crypto.randomBytes(16).toString('hex');
  const perRecordKey = deriveRecordKey(key, txHash, kdfSaltHex);
  const encrypted = encryptObject(record, perRecordKey);

  const envelope = {
    version: 2,
    txHash,
    createdAt: new Date().toISOString(),
    kdfSalt: kdfSaltHex,
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
    let parsed;
    try {
      parsed = JSON.parse(lines[i]);
    } catch (_error) {
      continue;
    }
    if (parsed.txHash !== txHash) {
      continue;
    }

    const recordKey = deriveRecordKey(key, parsed.txHash, parsed.kdfSalt);
    const payload = decryptObject(parsed, recordKey);
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
