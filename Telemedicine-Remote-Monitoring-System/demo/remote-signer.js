const fs = require('fs');
const path = require('path');

async function signWithRemoteSigner(endpoint, payload) {
  if (!endpoint) {
    throw new Error('Remote signer endpoint is required');
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload }),
  });
  if (!response.ok) {
    throw new Error(`Remote signer HTTP ${response.status}`);
  }
  const parsed = await response.json();
  if (!parsed || typeof parsed.signature !== 'string' || parsed.signature.length === 0) {
    throw new Error('Remote signer returned invalid signature payload');
  }
  return parsed.signature;
}

function readPemFile(filePath) {
  if (!filePath) {
    throw new Error('PEM path is required');
  }
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`PEM file not found: ${resolved}`);
  }
  return fs.readFileSync(resolved, 'utf8');
}

module.exports = {
  signWithRemoteSigner,
  readPemFile,
};
