const crypto = require('crypto');
const CryptoUtils = require('../utils/CryptoUtils');

const keyBlobs = new Map();
const externalSigners = new Map();

const MASTER_KEY_HEX = process.env.RPM_KEYSTORE_MASTER_KEY_HEX || '';
const DEMO_MASTER_KEY = crypto.createHash('sha256').update('rpm-demo-keystore-master-key').digest();

function resolveMasterKey() {
  if (MASTER_KEY_HEX) {
    if (!/^[a-fA-F0-9]{64}$/.test(MASTER_KEY_HEX)) {
      throw new Error('RPM_KEYSTORE_MASTER_KEY_HEX must be 64 hex chars');
    }
    return Buffer.from(MASTER_KEY_HEX, 'hex');
  }
  return DEMO_MASTER_KEY;
}

function encryptPrivateKey(privateKeyPem) {
  const key = resolveMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(privateKeyPem, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: encrypted.toString('base64'),
    createdAt: new Date().toISOString(),
  };
}

function decryptPrivateKey(blob) {
  const key = resolveMasterKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(blob.authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

function importPrivateKey(keyId, privateKeyPem) {
  if (!keyId || !privateKeyPem) {
    throw new Error('keyId and privateKeyPem are required');
  }
  keyBlobs.set(keyId, encryptPrivateKey(privateKeyPem));
  externalSigners.delete(keyId);
}

function registerExternalSigner(keyId, signerFn) {
  if (!keyId || typeof signerFn !== 'function') {
    throw new Error('keyId and signerFn are required');
  }
  externalSigners.set(keyId, signerFn);
  keyBlobs.delete(keyId);
}

function hasKey(keyId) {
  return keyBlobs.has(keyId) || externalSigners.has(keyId);
}

function signPayload(keyId, payload) {
  if (!keyId) {
    throw new Error('keyId is required');
  }
  const externalSigner = externalSigners.get(keyId);
  if (externalSigner) {
    return externalSigner(payload);
  }
  const encrypted = keyBlobs.get(keyId);
  if (!encrypted) {
    throw new Error(`Unknown keyId: ${keyId}`);
  }

  let privateKeyPem = '';
  try {
    privateKeyPem = decryptPrivateKey(encrypted);
    return CryptoUtils.signData(payload, privateKeyPem);
  } finally {
    privateKeyPem = '';
  }
}

function removeKey(keyId) {
  keyBlobs.delete(keyId);
  externalSigners.delete(keyId);
}

function resetForTests() {
  keyBlobs.clear();
  externalSigners.clear();
}

module.exports = {
  importPrivateKey,
  registerExternalSigner,
  hasKey,
  signPayload,
  removeKey,
  resetForTests,
};
