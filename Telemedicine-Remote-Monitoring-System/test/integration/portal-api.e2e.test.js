const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..', '..');

function randomHex(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function randomAddress(label) {
  return `0x${crypto.createHash('sha256').update(label).digest('hex').slice(0, 40)}`;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitForHealth(baseUrl, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) {
        return;
      }
    } catch (_error) {
      // Retry until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Portal did not become healthy before timeout');
}

async function stopChild(child) {
  if (!child || child.killed) {
    return;
  }
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (!child.killed) {
    child.kill('SIGKILL');
  }
}

async function jsonRequest(baseUrl, method, pathname, apiKey, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await response.text();
  let parsed = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch (_error) {
    parsed = { raw };
  }
  return { status: response.status, body: parsed, raw };
}

test('Portal API integration: auth + actor/consent/init/submit/ledger flow', async (t) => {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const operatorKey = `test-operator-${randomHex(8)}`;

  const env = {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(port),
    DEMO_OPERATOR_KEY: operatorKey,
    RPM_STORAGE_KEY_HEX: randomHex(32),
    RPM_KEYSTORE_MASTER_KEY_HEX: randomHex(32),
  };

  const child = spawn('node', ['demo/portal-server.js'], {
    cwd: ROOT_DIR,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let portalLogs = '';
  child.stdout.on('data', (chunk) => { portalLogs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { portalLogs += chunk.toString(); });
  t.after(async () => {
    await stopChild(child);
  });

  await waitForHealth(baseUrl);

  const unauthorizedActor = await jsonRequest(baseUrl, 'POST', '/api/actors', '', {
    actorId: `clinician-${randomHex(4)}`,
    role: 'clinician',
    org: 'clinic-a',
    scopes: ['vitals:write'],
    active: true,
  });
  assert.equal(
    unauthorizedActor.status,
    401,
    `Expected unauthorized actor request to fail. Logs: ${portalLogs}`
  );

  const actorId = `clinician-${randomHex(4)}`;
  const patientId = `patient-${randomHex(4)}`;
  const purpose = 'treatment';

  const actorResponse = await jsonRequest(baseUrl, 'POST', '/api/actors', operatorKey, {
    actorId,
    role: 'clinician',
    org: 'clinic-a',
    scopes: ['vitals:write'],
    active: true,
  });
  assert.equal(actorResponse.status, 200, `Actor create failed. Logs: ${portalLogs}`);
  assert.equal(actorResponse.body?.ok, true);
  assert.equal(actorResponse.body?.actor?.actorId, actorId);

  const consentResponse = await jsonRequest(baseUrl, 'POST', '/api/consent', operatorKey, {
    patientId,
    granted: true,
    actorId,
    purposes: [purpose],
    allowedActorIds: [actorId],
    requiredScopes: ['vitals:write'],
  });
  assert.equal(consentResponse.status, 200, `Consent failed. Logs: ${portalLogs}`);
  assert.equal(consentResponse.body?.ok, true);

  const validatorId = randomAddress(`validator-${randomHex(4)}`);
  const initResponse = await jsonRequest(baseUrl, 'POST', '/api/init', operatorKey, {
    deviceId: randomAddress(`device-${randomHex(4)}`),
    centralId: randomAddress(`central-${randomHex(4)}`),
    validatorId,
  });
  assert.equal(initResponse.status, 200, `Init failed. Logs: ${portalLogs}`);
  assert.equal(initResponse.body?.ok, true);
  assert.equal(initResponse.body?.validatorId, validatorId);

  const submitResponse = await jsonRequest(baseUrl, 'POST', '/api/submit', operatorKey, {
    actorId,
    type: 'heart_rate',
    value: '77',
    unit: 'bpm',
    patientId,
    purpose,
  });
  assert.equal(submitResponse.status, 200, `Submit failed. Logs: ${portalLogs}`);
  assert.equal(submitResponse.body?.ok, true);
  assert.ok(
    typeof submitResponse.body?.txHash === 'string' && submitResponse.body.txHash.startsWith('0x'),
    `Missing txHash in submit response: ${JSON.stringify(submitResponse.body)}`
  );

  const unauthorizedLedger = await jsonRequest(baseUrl, 'GET', '/api/ledger', '', null);
  assert.equal(unauthorizedLedger.status, 401);

  const ledgerResponse = await jsonRequest(baseUrl, 'GET', '/api/ledger', operatorKey, null);
  assert.equal(ledgerResponse.status, 200, `Ledger read failed. Logs: ${portalLogs}`);
  assert.equal(ledgerResponse.body?.ok, true);
  assert.ok(Array.isArray(ledgerResponse.body?.ledger), 'Ledger should be an array');
  assert.ok(
    ledgerResponse.body.ledger.some((entry) => entry.txHash === submitResponse.body.txHash),
    'Expected submitted txHash to appear in /api/ledger'
  );
});
