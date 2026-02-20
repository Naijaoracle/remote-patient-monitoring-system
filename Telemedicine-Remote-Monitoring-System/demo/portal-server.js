const http = require('http');
const fs = require('fs');
const path = require('path');

const BLEService = require('../mobile-app/services/BLEService');
const BlockchainService = require('../mobile-app/services/BlockchainService');
const KeyStoreService = require('../mobile-app/services/KeyStoreService');
const CryptoUtils = require('../mobile-app/utils/CryptoUtils');
const { appendEncryptedRecord, getEncryptedRecord, purgeEncryptedRecords } = require('./persistence');
const { setConsent, getLatestConsent, evaluateConsent, purgeExpiredConsents } = require('./consent');
const { upsertActor, getActor, loadActors } = require('./identity');
const {
  syncValidatorManagerProposalEvents,
  getLastSyncedBlock,
} = require('./chain-indexer');
const { signWithRemoteSigner, readPemFile } = require('./remote-signer');
const { loadCustomHooks } = require('./custom-hooks');
const {
  loadAuditKeyHistory,
  getActiveAuditSigningKey,
  rotateAuditSigningKey: persistAuditSigningKeyRotation,
} = require('./audit-keys');
const { ALERT_LOG_FILE, exportAlerts, evaluateAndPersistAlerts } = require('./alerts');
const {
  TELEMETRY_FILE,
  PROPOSAL_TELEMETRY_FILE,
  appendValidatorTelemetry,
  exportValidatorTelemetry,
  summarizeValidatorTelemetry,
  appendProposalTelemetry,
  exportProposalTelemetry,
  summarizeProposalTelemetry,
} = require('./telemetry');
const {
  AUDIT_LOG_FILE,
  exportAuditEntries,
  summarizeAuditEntries,
  buildAuditExportPackage,
} = require('./audit');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 8099);
const LEGACY_API_KEY = process.env.DEMO_API_KEY || '';
const VIEWER_KEY = process.env.DEMO_VIEWER_KEY || LEGACY_API_KEY;
const OPERATOR_KEY = process.env.DEMO_OPERATOR_KEY || LEGACY_API_KEY;
const AUTH_ENABLED = VIEWER_KEY.length > 0 || OPERATOR_KEY.length > 0;
const RECORD_TTL_SECONDS = Number(process.env.RECORD_TTL_SECONDS || 0);
const AUDIT_TTL_SECONDS = Number(process.env.AUDIT_TTL_SECONDS || 0);
const ALERT_TTL_SECONDS = Number(process.env.ALERT_TTL_SECONDS || 0);
const TELEMETRY_TTL_SECONDS = Number(process.env.TELEMETRY_TTL_SECONDS || 0);
const PROPOSAL_TELEMETRY_TTL_SECONDS = Number(process.env.PROPOSAL_TELEMETRY_TTL_SECONDS || 0);
const PURGE_INTERVAL_SECONDS = Number(process.env.PURGE_INTERVAL_SECONDS || 60);
const MONITOR_WINDOW_SECONDS = Number(process.env.MONITOR_WINDOW_SECONDS || 300);
const UNAUTHORIZED_ALERT_THRESHOLD = Number(process.env.UNAUTHORIZED_ALERT_THRESHOLD || 5);
const SUBMIT_FAILURE_ALERT_THRESHOLD = Number(process.env.SUBMIT_FAILURE_ALERT_THRESHOLD || 3);
const VALIDATOR_FAILURE_ALERT_THRESHOLD = Number(process.env.VALIDATOR_FAILURE_ALERT_THRESHOLD || 3);
const GAS_ANOMALY_GAS_USED = Number(process.env.GAS_ANOMALY_GAS_USED || 500000);
const GAS_ANOMALY_COUNT_THRESHOLD = Number(process.env.GAS_ANOMALY_COUNT_THRESHOLD || 3);
const PROPOSAL_FAILURE_ALERT_THRESHOLD = Number(process.env.PROPOSAL_FAILURE_ALERT_THRESHOLD || 3);
const PENDING_PROPOSAL_ALERT_THRESHOLD = Number(process.env.PENDING_PROPOSAL_ALERT_THRESHOLD || 3);
const ALERT_COOLDOWN_SECONDS = Number(process.env.ALERT_COOLDOWN_SECONDS || 300);
const CHAIN_RPC_URL = process.env.CHAIN_RPC_URL || '';
const VALIDATOR_MANAGER_ADDRESS = process.env.VALIDATOR_MANAGER_ADDRESS || '';
const CHAIN_SYNC_START_BLOCK = Number(process.env.CHAIN_SYNC_START_BLOCK || 0);
const CHAIN_SYNC_INTERVAL_SECONDS = Number(process.env.CHAIN_SYNC_INTERVAL_SECONDS || 0);
const CHAIN_REORG_LOOKBACK_BLOCKS = Number(process.env.CHAIN_REORG_LOOKBACK_BLOCKS || 12);
const AUDIT_SIGNER_MODE = process.env.AUDIT_SIGNER_MODE || 'keystore';
const AUDIT_SIGNER_REMOTE_ENDPOINT = process.env.AUDIT_SIGNER_REMOTE_ENDPOINT || '';
const AUDIT_SIGNER_REMOTE_KEY_ID = process.env.AUDIT_SIGNER_REMOTE_KEY_ID || 'remote-audit-signer';
const AUDIT_SIGNER_REMOTE_PUBKEY_PATH = process.env.AUDIT_SIGNER_REMOTE_PUBKEY_PATH || '';
const state = {
  initialized: false,
  deviceId: null,
  centralId: null,
  validatorId: null,
  peripheralKeyId: null,
  centralKeyId: null,
  auditSignerKeyId: null,
  auditSignerPublicKeyPem: null,
  auditSignerMode: null,
  chainSyncRunning: false,
  txOrder: [],
  lastChallenge: null,
};
const customHooks = loadCustomHooks();

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function ensureAuditDir() {
  fs.mkdirSync(path.join(__dirname, '.data'), { recursive: true });
}

function getRequesterIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function writeAudit(req, status, message, role = 'public') {
  ensureAuditDir();
  const entry = {
    at: new Date().toISOString(),
    ip: getRequesterIp(req),
    method: req.method,
    path: req.url,
    role,
    status,
    message,
  };
  fs.appendFileSync(AUDIT_LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');
  try {
    maybeEvaluateAlerts();
  } catch (_error) {
    // Monitoring should never break request flow in demo mode.
  }
}

function maybeEvaluateAlerts() {
  const nowMs = Date.now();
  const from = new Date(nowMs - (MONITOR_WINDOW_SECONDS * 1000)).toISOString();
  const auditEntries = exportAuditEntries({ from, limit: 1000 });
  const telemetryEntries = exportValidatorTelemetry({ from, limit: 1000 });
  const proposalEntries = exportProposalTelemetry({ from, limit: 1000 });
  evaluateAndPersistAlerts(
    auditEntries,
    {
      windowSeconds: MONITOR_WINDOW_SECONDS,
      unauthorizedThreshold: UNAUTHORIZED_ALERT_THRESHOLD,
      submitFailureThreshold: SUBMIT_FAILURE_ALERT_THRESHOLD,
      validatorFailureThreshold: VALIDATOR_FAILURE_ALERT_THRESHOLD,
      gasAnomalyGasUsed: GAS_ANOMALY_GAS_USED,
      gasAnomalyCountThreshold: GAS_ANOMALY_COUNT_THRESHOLD,
      proposalFailureThreshold: PROPOSAL_FAILURE_ALERT_THRESHOLD,
      pendingProposalThreshold: PENDING_PROPOSAL_ALERT_THRESHOLD,
      cooldownSeconds: ALERT_COOLDOWN_SECONDS,
    },
    ALERT_LOG_FILE,
    nowMs,
    telemetryEntries,
    proposalEntries
  );
}

function requiredRoleForRoute(pathname, method) {
  if (pathname === '/api/health') {
    return 'public';
  }
  if (
    pathname === '/api/ledger' ||
    pathname.startsWith('/api/record/') ||
    pathname.startsWith('/api/consent/') ||
    pathname === '/api/actors' ||
    pathname.startsWith('/api/actors/') ||
    pathname === '/api/audit/export' ||
    pathname === '/api/audit/package' ||
    pathname === '/api/audit/keys' ||
    pathname === '/api/monitor/summary' ||
    pathname === '/api/monitor/alerts' ||
    pathname === '/api/monitor/validators' ||
    (pathname === '/api/monitor/proposals' && method === 'GET')
  ) {
    return 'viewer';
  }
  if (
    pathname === '/api/init' ||
    pathname === '/api/submit' ||
    pathname === '/api/reset' ||
    pathname === '/api/audit/rotate-key' ||
    (pathname === '/api/actors' && method === 'POST') ||
    (pathname === '/api/monitor/proposals' && method === 'POST') ||
    (pathname === '/api/consent' && method === 'POST')
  ) {
    return 'operator';
  }
  if (pathname.startsWith('/api/')) {
    return 'operator';
  }
  if (method === 'GET' && (pathname === '/' || pathname === '/rpm-demo.html')) {
    return 'public';
  }
  return 'public';
}

function extractApiKey(req) {
  const headerKey = req.headers['x-api-key'];
  if (typeof headerKey === 'string' && headerKey.length > 0) {
    return headerKey;
  }

  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length).trim();
  }
  return '';
}

function extractActorId(req) {
  const headerActor = req.headers['x-actor-id'];
  if (typeof headerActor === 'string' && headerActor.trim().length > 0) {
    return headerActor.trim();
  }
  return '';
}

function resolveRole(req, pathname, method) {
  const required = requiredRoleForRoute(pathname, method);
  if (!AUTH_ENABLED || required === 'public') {
    return { ok: true, role: 'public', required };
  }

  const supplied = extractApiKey(req);
  const isOperator = OPERATOR_KEY.length > 0 && supplied === OPERATOR_KEY;
  const isViewer = VIEWER_KEY.length > 0 && supplied === VIEWER_KEY;

  if (required === 'viewer' && (isViewer || isOperator)) {
    return { ok: true, role: isOperator ? 'operator' : 'viewer', required };
  }
  if (required === 'operator' && isOperator) {
    return { ok: true, role: 'operator', required };
  }

  return { ok: false, role: 'unauthorized', required };
}

function purgeJsonlByTimestamp(filePath, ttlSeconds) {
  if (!ttlSeconds || ttlSeconds <= 0 || !fs.existsSync(filePath)) {
    return 0;
  }

  const nowMs = Date.now();
  const ttlMs = ttlSeconds * 1000;
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  const kept = [];
  let removed = 0;

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      const tsMs = new Date(parsed.at || parsed.createdAt || 0).getTime();
      if (!Number.isFinite(tsMs) || nowMs - tsMs <= ttlMs) {
        kept.push(line);
      } else {
        removed += 1;
      }
    } catch (_error) {
      kept.push(line);
    }
  }

  fs.writeFileSync(filePath, kept.join('\n') + (kept.length ? '\n' : ''), 'utf8');
  return removed;
}

function runRetentionPurge() {
  ensureAuditDir();
  const removedRecords = purgeEncryptedRecords(RECORD_TTL_SECONDS);
  const removedAudit = purgeJsonlByTimestamp(AUDIT_LOG_FILE, AUDIT_TTL_SECONDS);
  const removedAlerts = purgeJsonlByTimestamp(ALERT_LOG_FILE, ALERT_TTL_SECONDS);
  const removedTelemetry = purgeJsonlByTimestamp(TELEMETRY_FILE, TELEMETRY_TTL_SECONDS);
  const removedProposalTelemetry = purgeJsonlByTimestamp(
    PROPOSAL_TELEMETRY_FILE,
    PROPOSAL_TELEMETRY_TTL_SECONDS
  );
  const removedConsent = purgeExpiredConsents();
  if (
    removedRecords > 0 ||
    removedAudit > 0 ||
    removedAlerts > 0 ||
    removedTelemetry > 0 ||
    removedProposalTelemetry > 0 ||
    removedConsent > 0
  ) {
    const entry = {
      at: new Date().toISOString(),
      ip: 'local',
      method: 'SYSTEM',
      path: '/retention/purge',
      role: 'system',
      status: 200,
      message: `purged records=${removedRecords} audit=${removedAudit} alerts=${removedAlerts} telemetry=${removedTelemetry} proposals=${removedProposalTelemetry} consent=${removedConsent}`,
    };
    fs.appendFileSync(AUDIT_LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');
  }
}

function serveFile(res, filePath, contentType = 'text/html; charset=utf-8') {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      json(res, 500, { error: 'Failed to read file' });
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (_error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function resetCoreState() {
  BLEService.resetForTests();
  BlockchainService.resetForTests();
  state.initialized = false;
  state.deviceId = null;
  state.centralId = null;
  state.validatorId = null;
  if (state.peripheralKeyId) {
    KeyStoreService.removeKey(state.peripheralKeyId);
  }
  if (state.centralKeyId) {
    KeyStoreService.removeKey(state.centralKeyId);
  }
  if (state.auditSignerMode === 'keystore' && state.auditSignerKeyId) {
    KeyStoreService.removeKey(state.auditSignerKeyId);
  }
  state.peripheralKeyId = null;
  state.centralKeyId = null;
  state.auditSignerKeyId = null;
  state.auditSignerPublicKeyPem = null;
  state.auditSignerMode = null;
  state.chainSyncRunning = false;
  state.txOrder = [];
  state.lastChallenge = null;
}

function ensureAuditSignerReady() {
  if (state.auditSignerKeyId && state.auditSignerPublicKeyPem && KeyStoreService.hasKey(state.auditSignerKeyId)) {
    return;
  }
  if (state.auditSignerMode === 'remote' && state.auditSignerKeyId && state.auditSignerPublicKeyPem) {
    return;
  }
  rotateAuditSigner('startup');
}

function rotateAuditSigner(reason = 'manual') {
  if (AUDIT_SIGNER_MODE === 'remote') {
    const publicKeyPem = readPemFile(AUDIT_SIGNER_REMOTE_PUBKEY_PATH);
    persistAuditSigningKeyRotation({
      keyId: AUDIT_SIGNER_REMOTE_KEY_ID,
      publicKeyPem,
      reason: `remote:${reason}`,
    });
    state.auditSignerMode = 'remote';
    state.auditSignerKeyId = AUDIT_SIGNER_REMOTE_KEY_ID;
    state.auditSignerPublicKeyPem = publicKeyPem;
    return {
      keyId: state.auditSignerKeyId,
      reason: `remote:${reason}`,
      mode: 'remote',
    };
  }

  if (state.auditSignerKeyId) {
    KeyStoreService.removeKey(state.auditSignerKeyId);
  }
  const signer = CryptoUtils.generateKeyPair();
  const keyId = `audit-export-signer-${Date.now()}`;
  KeyStoreService.importPrivateKey(keyId, signer.privateKey);
  persistAuditSigningKeyRotation({
    keyId,
    publicKeyPem: signer.publicKey,
    reason,
  });
  state.auditSignerMode = 'keystore';
  state.auditSignerKeyId = keyId;
  state.auditSignerPublicKeyPem = signer.publicKey;
  return {
    keyId,
    reason,
    mode: 'keystore',
  };
}

async function signAuditManifest(manifest) {
  ensureAuditSignerReady();
  if (state.auditSignerMode === 'remote') {
    return signWithRemoteSigner(AUDIT_SIGNER_REMOTE_ENDPOINT, manifest);
  }
  return KeyStoreService.signPayload(state.auditSignerKeyId, manifest);
}

async function initDemo(payload) {
  const deviceId = String(payload.deviceId || '').trim();
  const centralId = String(payload.centralId || '').trim();
  const validatorId = String(payload.validatorId || '').trim();

  if (!deviceId || !centralId || !validatorId) {
    throw new Error('deviceId, centralId, and validatorId are required');
  }
  await customHooks.beforeInit({
    deviceId,
    centralId,
    validatorId,
    payload,
  });

  resetCoreState();

  const peripheral = CryptoUtils.generateKeyPair();
  const central = CryptoUtils.generateKeyPair();
  const peripheralKeyId = `peripheral:${deviceId}`;
  const centralKeyId = `central:${centralId}`;

  KeyStoreService.importPrivateKey(peripheralKeyId, peripheral.privateKey);
  KeyStoreService.importPrivateKey(centralKeyId, central.privateKey);

  BLEService.registerDevice({
    deviceAddress: deviceId,
    signPayload: (payload) => KeyStoreService.signPayload(peripheralKeyId, payload),
    publicKeyPem: peripheral.publicKey,
  });

  const connected = await BLEService.connectToDevice(deviceId);
  if (!connected) {
    throw new Error('Failed to connect simulated BLE device');
  }

  BlockchainService.registerPeripheralKey(deviceId, peripheral.publicKey);
  BlockchainService.registerCentralKey(centralId, central.publicKey);
  BlockchainService.addValidator(validatorId);

  state.initialized = true;
  state.deviceId = deviceId;
  state.centralId = centralId;
  state.validatorId = validatorId;
  state.peripheralKeyId = peripheralKeyId;
  state.centralKeyId = centralKeyId;

  return { initialized: true, deviceId, centralId, validatorId };
}

async function submitMeasurement(payload, actorId) {
  if (!state.initialized) {
    throw new Error('System not initialized');
  }

  const measureType = String(payload.type || '').trim() || 'heart_rate';
  const measureValue = String(payload.value || '').trim() || '75';
  const measureUnit = String(payload.unit || '').trim() || 'bpm';
  const patientId = String(payload.patientId || '').trim();
  const purpose = String(payload.purpose || '').trim();
  const replay = Boolean(payload.replay);

  if (!patientId) {
    throw new Error('patientId is required');
  }
  if (!purpose) {
    throw new Error('purpose is required');
  }
  if (!actorId) {
    throw new Error('actorId is required');
  }
  const actor = getActor(actorId);
  if (!actor || !actor.active) {
    throw new Error('actorId is unknown or inactive');
  }
  await customHooks.beforeSubmit({
    payload,
    actorId,
    actor,
    state: {
      initialized: state.initialized,
      deviceId: state.deviceId,
      centralId: state.centralId,
      validatorId: state.validatorId,
    },
  });
  const consentCheck = evaluateConsent(patientId, {
    purpose,
    actorId,
    actorRole: actor.role,
    actorOrg: actor.org,
    actorScopes: actor.scopes,
  });
  if (!consentCheck.ok) {
    throw new Error(`Consent policy denied: ${consentCheck.reason}`);
  }

  const challenge = replay ? state.lastChallenge : undefined;

  const peripheralMeasurement = await BLEService.receiveMeasurement({
    deviceAddress: state.deviceId,
    centralDeviceAddress: state.centralId,
    challenge,
    measurementData: {
      type: measureType,
      value: measureValue,
      unit: measureUnit,
      patientId,
      purpose,
      actorId,
      actorRole: actor.role,
      actorOrg: actor.org,
    },
  });

  const withCentralTime = {
    ...peripheralMeasurement,
    timestampCentral: Math.floor(Date.now() / 1000),
  };

  const centralSignature = KeyStoreService.signPayload(
    state.centralKeyId,
    BlockchainService.buildCentralSignaturePayload(withCentralTime)
  );

  const txHash = await BlockchainService.submitMeasurement({
    ...withCentralTime,
    centralSignature,
  }, { validatorAddress: state.validatorId });

  state.lastChallenge = withCentralTime.challenge;
  state.txOrder.push(txHash);

  const stored = await BlockchainService.getMeasurement(txHash);
  appendEncryptedRecord(txHash, stored);
  try {
    await customHooks.afterSubmit({
      txHash,
      stored,
      payload,
      actorId,
      actor,
      state: {
        deviceId: state.deviceId,
        centralId: state.centralId,
        validatorId: state.validatorId,
      },
    });
  } catch (_error) {
    // Do not fail successful core submission because of extension-side effects.
  }
  return { txHash, stored };
}

async function getLedger() {
  const entries = [];
  for (const txHash of state.txOrder) {
    const record = await BlockchainService.getMeasurement(txHash);
    if (record) {
      entries.push({ txHash, record });
    }
  }
  return entries;
}

async function createSignedAuditPackageFromRequest(url) {
  ensureAuditSignerReady();
  const options = {
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to'),
    limit: url.searchParams.get('limit'),
  };
  const entries = exportAuditEntries(options);
  return buildAuditExportPackage(entries, {
    ...options,
    signerId: state.auditSignerKeyId,
    publicKeyPem: state.auditSignerPublicKeyPem,
    sign: (manifest) => signAuditManifest(manifest),
  });
}

async function syncProposalEventsFromChain(options = {}) {
  const rpcUrl = options.rpcUrl || CHAIN_RPC_URL;
  const contractAddress = options.contractAddress || VALIDATOR_MANAGER_ADDRESS;
  if (!rpcUrl || !contractAddress) {
    throw new Error('CHAIN_RPC_URL and VALIDATOR_MANAGER_ADDRESS are required');
  }
  const syncResult = await syncValidatorManagerProposalEvents({
    rpcUrl,
    contractAddress,
    fromBlock: Number.isFinite(options.fromBlock) ? options.fromBlock : undefined,
    toBlock: Number.isFinite(options.toBlock) ? options.toBlock : undefined,
    startBlock: CHAIN_SYNC_START_BLOCK,
    lookbackBlocks: CHAIN_REORG_LOOKBACK_BLOCKS,
  });

  let appended = 0;
  for (const event of syncResult.events) {
    const persisted = appendProposalTelemetry({
      proposalId: event.proposalId,
      proposalType: event.proposalType,
      validatorId: event.validatorId,
      action: event.action,
      status: event.status,
      txHash: event.txHash,
      reason: event.reason,
      gasUsed: event.gasUsed,
      eventUid: event.eventUid,
      blockNumber: event.blockNumber,
      logIndex: event.logIndex,
      removed: event.removed,
      source: event.source,
    });
    if (persisted) {
      appended += 1;
    }
  }

  return { ...syncResult, appended };
}

async function runScheduledChainSync() {
  if (state.chainSyncRunning || !CHAIN_RPC_URL || !VALIDATOR_MANAGER_ADDRESS) {
    return;
  }
  state.chainSyncRunning = true;
  try {
    await syncProposalEventsFromChain({});
  } catch (_error) {
    // Never crash demo server because of indexing failures.
  } finally {
    state.chainSyncRunning = false;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const auth = resolveRole(req, url.pathname, req.method);
  const actorId = extractActorId(req);

  try {
    if (!auth.ok) {
      writeAudit(req, 401, `Unauthorized required=${auth.required}`, auth.role);
      return json(res, 401, { error: 'Unauthorized' });
    }

    if (req.method === 'GET' && url.pathname === '/') {
      return serveFile(res, path.join(__dirname, 'portal.html'));
    }

    if (req.method === 'GET' && url.pathname === '/rpm-demo.html') {
      return serveFile(res, path.join(__dirname, 'rpm-demo.html'));
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      writeAudit(req, 200, 'Health check', auth.role);
      return json(res, 200, {
        ok: true,
        initialized: state.initialized,
        deviceId: state.deviceId,
        centralId: state.centralId,
        validatorId: state.validatorId,
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/init') {
      const body = await readBody(req);
      const result = await initDemo(body);
      writeAudit(req, 200, 'Demo initialized', auth.role);
      return json(res, 200, { ok: true, ...result });
    }

    if (req.method === 'POST' && url.pathname === '/api/actors') {
      const body = await readBody(req);
      const actor = upsertActor({
        actorId: body.actorId,
        role: body.role,
        org: body.org,
        scopes: body.scopes,
        active: body.active,
      });
      writeAudit(req, 200, `Actor upserted actorId=${actor.actorId} active=${actor.active}`, auth.role);
      return json(res, 200, { ok: true, actor });
    }

    if (req.method === 'POST' && url.pathname === '/api/submit') {
      const body = await readBody(req);
      const resolvedActorId = actorId || String(body.actorId || '').trim();
      const startedAt = Date.now();
      let result = null;
      try {
        result = await submitMeasurement(body, resolvedActorId);
      } catch (error) {
        appendValidatorTelemetry({
          validatorId: state.validatorId,
          status: 'failure',
          reason: error.message,
          durationMs: Date.now() - startedAt,
        });
        throw error;
      }
      appendValidatorTelemetry({
        validatorId: state.validatorId,
        status: 'success',
        txHash: result.txHash,
        onChainTxHash: result.stored?.onChainTxHash || '',
        gasUsed: Number(result.stored?.onChainGasUsed || body.gasUsed || 0),
        durationMs: Date.now() - startedAt,
      });
      writeAudit(req, 200, `Measurement submitted txHash=${result.txHash}`, auth.role);
      return json(res, 200, { ok: true, ...result });
    }

    if (req.method === 'POST' && url.pathname === '/api/consent') {
      const body = await readBody(req);
      const granted = body.granted === undefined ? true : Boolean(body.granted);
      const resolvedActorId = actorId || String(body.actorId || '').trim();
      const consent = setConsent({
        patientId: body.patientId,
        granted,
        actor: auth.role,
        actorId: resolvedActorId,
        reason: body.reason,
        purposes: body.purposes,
        allowedActorIds: body.allowedActorIds,
        expiresAt: body.expiresAt,
      });
      writeAudit(req, 200, `Consent updated patientId=${consent.patientId} granted=${consent.granted}`, auth.role);
      return json(res, 200, { ok: true, consent });
    }

    if (req.method === 'GET' && url.pathname === '/api/ledger') {
      const ledger = await getLedger();
      writeAudit(req, 200, `Ledger read count=${ledger.length}`, auth.role);
      return json(res, 200, { ok: true, ledger });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/record/')) {
      const txHash = decodeURIComponent(url.pathname.replace('/api/record/', ''));
      const record = getEncryptedRecord(txHash);
      if (!record) {
        writeAudit(req, 404, `Record miss txHash=${txHash}`, auth.role);
        return json(res, 404, { error: 'Record not found' });
      }
      writeAudit(req, 200, `Record read txHash=${txHash}`, auth.role);
      return json(res, 200, { ok: true, record });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/consent/')) {
      const patientId = decodeURIComponent(url.pathname.replace('/api/consent/', ''));
      const consent = getLatestConsent(patientId);
      if (!consent) {
        writeAudit(req, 404, `Consent miss patientId=${patientId}`, auth.role);
        return json(res, 404, { error: 'Consent not found' });
      }
      const purpose = String(url.searchParams.get('purpose') || '').trim();
      const queryActorId = String(url.searchParams.get('actorId') || '').trim();
      const resolvedActorId = queryActorId || actorId;
      const actor = getActor(resolvedActorId);
      const check = evaluateConsent(patientId, {
        purpose,
        actorId: resolvedActorId,
        actorRole: actor?.role,
        actorOrg: actor?.org,
        actorScopes: actor?.scopes,
      });
      const active = check.ok;
      writeAudit(req, 200, `Consent read patientId=${patientId} active=${active}`, auth.role);
      return json(res, 200, { ok: true, patientId, active, reason: check.reason, consent });
    }

    if (req.method === 'GET' && url.pathname === '/api/actors') {
      const actors = loadActors();
      writeAudit(req, 200, `Actor list read count=${actors.length}`, auth.role);
      return json(res, 200, { ok: true, actors });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/actors/')) {
      const requestedActorId = decodeURIComponent(url.pathname.replace('/api/actors/', ''));
      const actor = getActor(requestedActorId);
      if (!actor) {
        writeAudit(req, 404, `Actor miss actorId=${requestedActorId}`, auth.role);
        return json(res, 404, { error: 'Actor not found' });
      }
      writeAudit(req, 200, `Actor read actorId=${requestedActorId}`, auth.role);
      return json(res, 200, { ok: true, actor });
    }

    if (req.method === 'GET' && url.pathname === '/api/audit/export') {
      const entries = exportAuditEntries({
        from: url.searchParams.get('from'),
        to: url.searchParams.get('to'),
        limit: url.searchParams.get('limit'),
      });
      writeAudit(req, 200, `Audit export count=${entries.length}`, auth.role);
      return json(res, 200, { ok: true, entries });
    }

    if (req.method === 'GET' && url.pathname === '/api/audit/package') {
      const exportPackage = await createSignedAuditPackageFromRequest(url);
      writeAudit(req, 200, `Audit package exported count=${exportPackage.manifest.entryCount}`, auth.role);
      return json(res, 200, { ok: true, exportPackage });
    }

    if (req.method === 'GET' && url.pathname === '/api/audit/keys') {
      const keys = loadAuditKeyHistory();
      const active = getActiveAuditSigningKey();
      writeAudit(req, 200, `Audit key history read count=${keys.length}`, auth.role);
      return json(res, 200, { ok: true, active, keys });
    }

    if (req.method === 'POST' && url.pathname === '/api/audit/rotate-key') {
      const body = await readBody(req);
      const rotation = rotateAuditSigner(String(body.reason || 'manual'));
      writeAudit(req, 200, `Audit key rotated keyId=${rotation.keyId}`, auth.role);
      return json(res, 200, { ok: true, ...rotation });
    }

    if (req.method === 'GET' && url.pathname === '/api/monitor/summary') {
      const entries = exportAuditEntries({ limit: 1000 });
      const summary = summarizeAuditEntries(entries);
      const validatorTelemetry = exportValidatorTelemetry({ limit: 1000 });
      const validatorSummary = summarizeValidatorTelemetry(validatorTelemetry);
      const proposalTelemetry = exportProposalTelemetry({ limit: 1000 });
      const proposalSummary = summarizeProposalTelemetry(proposalTelemetry);
      writeAudit(req, 200, 'Monitor summary read', auth.role);
      return json(res, 200, { ok: true, summary, validatorSummary, proposalSummary });
    }

    if (req.method === 'GET' && url.pathname === '/api/monitor/alerts') {
      const alerts = exportAlerts({
        from: url.searchParams.get('from'),
        to: url.searchParams.get('to'),
        limit: url.searchParams.get('limit'),
        type: url.searchParams.get('type'),
      });
      writeAudit(req, 200, `Monitor alerts read count=${alerts.length}`, auth.role);
      return json(res, 200, { ok: true, alerts });
    }

    if (req.method === 'GET' && url.pathname === '/api/monitor/validators') {
      const events = exportValidatorTelemetry({
        from: url.searchParams.get('from'),
        to: url.searchParams.get('to'),
        limit: url.searchParams.get('limit'),
        validatorId: url.searchParams.get('validatorId'),
      });
      const summary = summarizeValidatorTelemetry(events);
      writeAudit(req, 200, `Monitor validators read count=${events.length}`, auth.role);
      return json(res, 200, { ok: true, summary, events });
    }

    if (req.method === 'GET' && url.pathname === '/api/monitor/proposals') {
      const events = exportProposalTelemetry({
        from: url.searchParams.get('from'),
        to: url.searchParams.get('to'),
        limit: url.searchParams.get('limit'),
        proposalId: url.searchParams.get('proposalId'),
        validatorId: url.searchParams.get('validatorId'),
        action: url.searchParams.get('action'),
      });
      const summary = summarizeProposalTelemetry(events);
      writeAudit(req, 200, `Monitor proposals read count=${events.length}`, auth.role);
      return json(res, 200, { ok: true, summary, events });
    }

    if (req.method === 'POST' && url.pathname === '/api/monitor/proposals') {
      const body = await readBody(req);
      const event = appendProposalTelemetry({
        proposalId: body.proposalId,
        proposalType: body.proposalType,
        validatorId: body.validatorId || state.validatorId,
        action: body.action,
        status: body.status || 'success',
        txHash: body.txHash,
        reason: body.reason,
      });
      writeAudit(req, 200, `Proposal telemetry appended proposalId=${event.proposalId}`, auth.role);
      return json(res, 200, { ok: true, event });
    }

    if (req.method === 'POST' && url.pathname === '/api/monitor/proposals/sync') {
      const body = await readBody(req);
      const parsedFromBlock = body.fromBlock === undefined ? undefined : Number(body.fromBlock);
      const parsedToBlock = body.toBlock === undefined ? undefined : Number(body.toBlock);
      const syncResult = await syncProposalEventsFromChain({
        rpcUrl: body.rpcUrl,
        contractAddress: body.contractAddress,
        fromBlock: Number.isFinite(parsedFromBlock) ? parsedFromBlock : undefined,
        toBlock: Number.isFinite(parsedToBlock) ? parsedToBlock : undefined,
      });
      writeAudit(req, 200, `Chain proposal sync count=${syncResult.events.length}`, auth.role);
      return json(res, 200, {
        ok: true,
        fromBlock: syncResult.fromBlock,
        toBlock: syncResult.toBlock,
        latestBlock: syncResult.latestBlock,
        synced: syncResult.events.length,
        appended: syncResult.appended,
        lastSyncedBlock: getLastSyncedBlock(body.contractAddress || VALIDATOR_MANAGER_ADDRESS),
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/reset') {
      resetCoreState();
      writeAudit(req, 200, 'Demo reset', auth.role);
      return json(res, 200, { ok: true, reset: true });
    }

    writeAudit(req, 404, 'Route not found', auth.role);
    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    writeAudit(req, 400, `Request failed: ${error.message || 'unknown error'}`, auth.role);
    return json(res, 400, { error: error.message || 'Request failed' });
  }
});

server.listen(PORT, HOST, () => {
  ensureAuditSignerReady();
  runRetentionPurge();
  setInterval(runRetentionPurge, PURGE_INTERVAL_SECONDS * 1000).unref();
  if (CHAIN_SYNC_INTERVAL_SECONDS > 0) {
    runScheduledChainSync();
    setInterval(runScheduledChainSync, CHAIN_SYNC_INTERVAL_SECONDS * 1000).unref();
  }
  console.log(`RPM demo portal running on http://${HOST}:${PORT}`);
});
