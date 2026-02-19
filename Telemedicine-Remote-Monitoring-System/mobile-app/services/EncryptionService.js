const CryptoUtils = require('../utils/CryptoUtils');

function signPayload(payload, privateKeyPem) {
  return CryptoUtils.signData(payload, privateKeyPem);
}

function verifyPayload(payload, signature, publicKeyPem) {
  return CryptoUtils.verifySignature(payload, signature, publicKeyPem);
}

module.exports = {
  signPayload,
  verifyPayload,
};
