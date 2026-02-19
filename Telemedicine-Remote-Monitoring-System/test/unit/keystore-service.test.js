const test = require('node:test');
const assert = require('node:assert/strict');

const KeyStoreService = require('../../mobile-app/services/KeyStoreService');
const CryptoUtils = require('../../mobile-app/utils/CryptoUtils');

test.beforeEach(() => {
  KeyStoreService.resetForTests();
});

test('KeyStoreService signs payloads via imported private key', () => {
  const keys = CryptoUtils.generateKeyPair();
  const payload = { type: 'hr', value: 72 };

  KeyStoreService.importPrivateKey('central:test', keys.privateKey);
  const signature = KeyStoreService.signPayload('central:test', payload);

  assert.equal(CryptoUtils.verifySignature(payload, signature, keys.publicKey), true);
  assert.equal(KeyStoreService.hasKey('central:test'), true);
});

test('KeyStoreService supports external signer providers', () => {
  const keys = CryptoUtils.generateKeyPair();
  const payload = { type: 'spo2', value: 98 };

  KeyStoreService.registerExternalSigner('hsm:test', (data) => CryptoUtils.signData(data, keys.privateKey));
  const signature = KeyStoreService.signPayload('hsm:test', payload);

  assert.equal(CryptoUtils.verifySignature(payload, signature, keys.publicKey), true);
});

test('KeyStoreService rejects unknown key ids', () => {
  assert.throws(() => KeyStoreService.signPayload('missing:key', { ok: true }), /Unknown keyId/);
});
