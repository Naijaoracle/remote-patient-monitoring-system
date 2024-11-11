// Filepath: /test/unit/encryption-tests.js

const assert = require('assert');
const CryptoUtils = require('../../mobile-app/utils/CryptoUtils');

describe('CryptoUtils', () => {
  it('should sign data correctly', () => {
    const data = 'TestData';
    const privateKey = 'PrivateKey';
    const signature = CryptoUtils.signData(data, privateKey);
    assert.ok(signature, 'Signature should not be null');
  });

  it('should verify signature correctly', () => {
    const data = 'TestData';
    const privateKey = 'PrivateKey';
    const publicKey = 'PublicKey';
    const signature = CryptoUtils.signData(data, privateKey);
    const isValid = CryptoUtils.verifySignature(data, signature, publicKey);
    assert.strictEqual(isValid, true, 'Signature should be valid');
  });
});
