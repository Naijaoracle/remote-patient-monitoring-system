const test = require('node:test');
const assert = require('node:assert/strict');

const CryptoUtils = require('../../shared/runtime/utils/CryptoUtils');

test('CryptoUtils signs and verifies canonicalized payload', () => {
  const payloadA = { b: 2, a: 1 };
  const payloadB = { a: 1, b: 2 };

  const keys = CryptoUtils.generateKeyPair();
  const signature = CryptoUtils.signData(payloadA, keys.privateKey);

  assert.ok(signature.length > 0);
  assert.equal(CryptoUtils.verifySignature(payloadB, signature, keys.publicKey), true);
});

test('CryptoUtils rejects signature with unrelated key pair', () => {
  const payload = { vital: 'heart_rate', value: 75 };
  const signer = CryptoUtils.generateKeyPair();
  const attacker = CryptoUtils.generateKeyPair();

  const signature = CryptoUtils.signData(payload, signer.privateKey);
  assert.equal(CryptoUtils.verifySignature(payload, signature, attacker.publicKey), false);
});
