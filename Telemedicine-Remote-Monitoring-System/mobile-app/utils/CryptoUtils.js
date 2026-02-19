const crypto = require('crypto');
const Config = require('./Config');

function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }

  const keys = Object.keys(value).sort();
  const body = keys
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
    .join(',');
  return `{${body}}`;
}

function digest(value) {
  return crypto.createHash(Config.HASH_ALGORITHM).update(canonicalize(value)).digest('hex');
}

function signData(data, privateKeyPem) {
  const signer = crypto.createSign(Config.SIGNATURE_ALGORITHM);
  signer.update(canonicalize(data));
  signer.end();
  return signer.sign(privateKeyPem, 'base64');
}

function verifySignature(data, signatureBase64, publicKeyPem) {
  try {
    const verifier = crypto.createVerify(Config.SIGNATURE_ALGORITHM);
    verifier.update(canonicalize(data));
    verifier.end();
    return verifier.verify(publicKeyPem, signatureBase64, 'base64');
  } catch (_error) {
    return false;
  }
}

function generateKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'secp256k1',
  });

  return {
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
  };
}

module.exports = {
  canonicalize,
  digest,
  signData,
  verifySignature,
  generateKeyPair,
};
