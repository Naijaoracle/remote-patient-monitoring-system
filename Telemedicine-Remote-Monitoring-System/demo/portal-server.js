const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BLEService = require('../shared/runtime/services/BLEService');
const BlockchainService = require('../shared/runtime/services/BlockchainService');
const KeyStoreService = require('../shared/runtime/services/KeyStoreService');
const CryptoUtils = require('../shared/runtime/utils/CryptoUtils');
const { appendEncryptedRecord, getEncryptedRecord, purgeEncryptedRecords } = require('./persistence');
const { setConsent, getLatestConsent, evaluateConsent, purgeExpiredConsents } = require('./consent');
const { upsertActor, getActor, loadActors } = require('./identity');
const {
  syncValidatorManagerProposalEvents,
  getLastSyncedBlock,
} = require('./chain-indexer');
const { signWithRemoteSigner, readPemFile } = require('./remote-signer');
const { loadCustomHooks } = require('./custom-hooks');
const { buildRpcMeasurementAdapter } = require('./onchain-adapter');
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
const { handleCoreRoutes } = require('./routes/core-routes');
const { handleAuditRoutes } = require('./routes/audit-routes');
const { handleMonitorRoutes } = require('./routes/monitor-routes');

const ALLOWED_MEASURE_TYPES = new Set([
  'heart_rate', 'blood_pressure', 'spo2', 'temperature',
  'respiratory_rate', 'glucose', 'weight',
]);

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 8099);
const LEGACY_API_KEY = process.env.DEMO_API_KEY || '';
const VIEWER_KEY = process.env.DEMO_VIEWER_KEY || LEGACY_API_KEY;
const OPERATOR_KEY = process.env.DEMO_OPERATOR_KEY || LEGACY_API_KEY;
const AUTH_ENABLED = process.env.AUTH_ENABLED !== '0';
const ALLOW_UNAUTHENTICATED_DEMO = process.env.ALLOW_UNAUTHENTICATED_DEMO === '1';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
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
const MEASUREMENT_CONTRACT_ADDRESS = process.env.MEASUREMENT_CONTRACT_ADDRESS || '';
const CHAIN_SYNC_START_BLOCK = Number(process.env.CHAIN_SYNC_START_BLOCK || 0);
const CHAIN_SYNC_INTERVAL_SECONDS = Number(process.env.CHAIN_SYNC_INTERVAL_SECONDS || 0);
const CHAIN_REORG_LOOKBACK_BLOCKS = Number(process.env.CHAIN_REORG_LOOKBACK_BLOCKS || 12);
const CHAIN_SYNC_MAX_BACKOFF_SECONDS = Number(process.env.CHAIN_SYNC_MAX_BACKOFF_SECONDS || 300);
const AUDIT_SIGNER_MODE = process.env.AUDIT_SIGNER_MODE || 'keystore';
const AUDIT_SIGNER_REMOTE_ENDPOINT = process.env.AUDIT_SIGNER_REMOTE_ENDPOINT || '';
const AUDIT_SIGNER_REMOTE_KEY_ID = process.env.AUDIT_SIGNER_REMOTE_KEY_ID || 'remote-audit-signer';
const AUDIT_SIGNER_REMOTE_PUBKEY_PATH = process.env.AUDIT_SIGNER_REMOTE_PUBKEY_PATH || '';
const ALLOW_DEMO_INSECURE_KEYS = process.env.ALLOW_DEMO_INSECURE_KEYS === '1';
const RATE_LIMIT_WINDOW_SECONDS = Number(process.env.RATE_LIMIT_WINDOW_SECONDS || 60);
const RATE_LIMIT_MAX_PER_WINDOW = Number(process.env.RATE_LIMIT_MAX_PER_WINDOW || 120);
const requestRateState = new Map();

function purgeExpiredRateLimitWindows(nowMs = Date.now()) {
  for (const [subject, entry] of requestRateState) {
    if (nowMs >= entry.resetAtMs) {
      requestRateState.delete(subject);
    }
  }
}
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
  chainSyncTimer: null,
  chainSyncDelayMs: 0,
  txOrder: [],
  lastChallenge: null,
};
const customHooks = loadCustomHooks();
let measurementContractAdapterEnabled = false;

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function assertNonNegativeNumber(name, value) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid ${name}: expected non-negative number`);
  }
}

function isHexAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || ''));
}

function validateStartupConfig() {
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  if (!HOST || typeof HOST !== 'string') {
    throw new Error('HOST must be a non-empty string');
  }

  const numericChecks = [
    ['RECORD_TTL_SECONDS', RECORD_TTL_SECONDS],
    ['AUDIT_TTL_SECONDS', AUDIT_TTL_SECONDS],
    ['ALERT_TTL_SECONDS', ALERT_TTL_SECONDS],
    ['TELEMETRY_TTL_SECONDS', TELEMETRY_TTL_SECONDS],
    ['PROPOSAL_TELEMETRY_TTL_SECONDS', PROPOSAL_TELEMETRY_TTL_SECONDS],
    ['PURGE_INTERVAL_SECONDS', PURGE_INTERVAL_SECONDS],
    ['MONITOR_WINDOW_SECONDS', MONITOR_WINDOW_SECONDS],
    ['UNAUTHORIZED_ALERT_THRESHOLD', UNAUTHORIZED_ALERT_THRESHOLD],
    ['SUBMIT_FAILURE_ALERT_THRESHOLD', SUBMIT_FAILURE_ALERT_THRESHOLD],
    ['VALIDATOR_FAILURE_ALERT_THRESHOLD', VALIDATOR_FAILURE_ALERT_THRESHOLD],
    ['GAS_ANOMALY_GAS_USED', GAS_ANOMALY_GAS_USED],
    ['GAS_ANOMALY_COUNT_THRESHOLD', GAS_ANOMALY_COUNT_THRESHOLD],
    ['PROPOSAL_FAILURE_ALERT_THRESHOLD', PROPOSAL_FAILURE_ALERT_THRESHOLD],
    ['PENDING_PROPOSAL_ALERT_THRESHOLD', PENDING_PROPOSAL_ALERT_THRESHOLD],
    ['ALERT_COOLDOWN_SECONDS', ALERT_COOLDOWN_SECONDS],
    ['CHAIN_SYNC_START_BLOCK', CHAIN_SYNC_START_BLOCK],
    ['CHAIN_SYNC_INTERVAL_SECONDS', CHAIN_SYNC_INTERVAL_SECONDS],
    ['CHAIN_REORG_LOOKBACK_BLOCKS', CHAIN_REORG_LOOKBACK_BLOCKS],
    ['CHAIN_SYNC_MAX_BACKOFF_SECONDS', CHAIN_SYNC_MAX_BACKOFF_SECONDS],
    ['RATE_LIMIT_WINDOW_SECONDS', RATE_LIMIT_WINDOW_SECONDS],
    ['RATE_LIMIT_MAX_PER_WINDOW', RATE_LIMIT_MAX_PER_WINDOW],
  ];
  for (const [name, value] of numericChecks) {
    assertNonNegativeNumber(name, value);
  }

  if (!ALLOW_DEMO_INSECURE_KEYS) {
    const missingStorageKey = !process.env.RPM_STORAGE_KEY_HEX;
    const missingMasterKey = !process.env.RPM_KEYSTORE_MASTER_KEY_HEX;
    if (missingStorageKey || missingMasterKey) {
      throw new Error(
        'Refusing startup with demo encryption keys. Set RPM_STORAGE_KEY_HEX and RPM_KEYSTORE_MASTER_KEY_HEX, or ALLOW_DEMO_INSECURE_KEYS=1 for explicit demo-only mode.'
      );
    }
  }

  if (AUTH_ENABLED && VIEWER_KEY.length === 0 && OPERATOR_KEY.length === 0 && !ALLOW_UNAUTHENTICATED_DEMO) {
    throw new Error(
      'AUTH_ENABLED requires DEMO_OPERATOR_KEY/DEMO_VIEWER_KEY (or DEMO_API_KEY). Set ALLOW_UNAUTHENTICATED_DEMO=1 for explicit demo-only public mode.'
    );
  }

  const hasChainRpc = CHAIN_RPC_URL.length > 0;
  const hasMeasurementAddress = MEASUREMENT_CONTRACT_ADDRESS.length > 0;
  if (hasChainRpc !== hasMeasurementAddress) {
    throw new Error('CHAIN_RPC_URL and MEASUREMENT_CONTRACT_ADDRESS must be set together');
  }
  if (hasMeasurementAddress && !isHexAddress(MEASUREMENT_CONTRACT_ADDRESS)) {
    throw new Error('MEASUREMENT_CONTRACT_ADDRESS must be a valid 0x-prefixed 20-byte hex address');
  }

  if (CHAIN_SYNC_INTERVAL_SECONDS > 0) {
    if (!CHAIN_RPC_URL || !VALIDATOR_MANAGER_ADDRESS) {
      throw new Error('CHAIN_SYNC_INTERVAL_SECONDS>0 requires CHAIN_RPC_URL and VALIDATOR_MANAGER_ADDRESS');
    }
    if (!isHexAddress(VALIDATOR_MANAGER_ADDRESS)) {
      throw new Error('VALIDATOR_MANAGER_ADDRESS must be a valid 0x-prefixed 20-byte hex address');
    }
  }

  if (!['keystore', 'remote'].includes(AUDIT_SIGNER_MODE)) {
    throw new Error("AUDIT_SIGNER_MODE must be either 'keystore' or 'remote'");
  }
  if (AUDIT_SIGNER_MODE === 'remote') {
    if (!AUDIT_SIGNER_REMOTE_ENDPOINT) {
      throw new Error('AUDIT_SIGNER_REMOTE_ENDPOINT is required when AUDIT_SIGNER_MODE=remote');
    }
    if (!AUDIT_SIGNER_REMOTE_PUBKEY_PATH) {
      throw new Error('AUDIT_SIGNER_REMOTE_PUBKEY_PATH is required when AUDIT_SIGNER_MODE=remote');
    }
  }
}

function ensureAuditDir() {
  fs.mkdirSync(path.join(__dirname, '.data'), { recursive: true });
}

function getRequesterIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (TRUST_PROXY && typeof forwarded === 'string' && forwarded.length > 0) {
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
  maybeEvaluateAlerts().catch((error) => logNonFatal('alert-evaluation', error));
}

function logNonFatal(context, error) {
  const message = `Non-fatal ${context}: ${error?.message || 'unknown error'}`;
  console.warn(message);
  try {
    ensureAuditDir();
    const entry = {
      at: new Date().toISOString(),
      ip: 'local',
      method: 'SYSTEM',
      path: `/non-fatal/${context}`,
      role: 'system',
      status: 500,
      message,
    };
    fs.appendFileSync(AUDIT_LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');
  } catch (_logError) {
    // Never crash on non-fatal logging.
  }
}

async function maybeEvaluateAlerts() {
  const nowMs = Date.now();
  const from = new Date(nowMs - (MONITOR_WINDOW_SECONDS * 1000)).toISOString();
  const auditEntries = exportAuditEntries({ from, limit: 1000 });
  const telemetryEntries = await exportValidatorTelemetry({ from, limit: 1000 });
  const proposalEntries = await exportProposalTelemetry({ from, limit: 1000 });
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

function safeLogSubject(subject) {
  if (!subject || !subject.startsWith('key:')) {
    return subject || '';
  }
  const hash = crypto.createHash('sha256').update(subject.slice(4)).digest('hex').slice(0, 8);
  return `key:[sha256:${hash}]`;
}

function secureEquals(a, b) {
  const left = crypto.createHash('sha256').update(String(a || ''), 'utf8').digest();
  const right = crypto.createHash('sha256').update(String(b || ''), 'utf8').digest();
  return crypto.timingSafeEqual(left, right);
}

function resolveRateLimitSubject(req, pathname) {
  if (!pathname.startsWith('/api/')) {
    return null;
  }
  const suppliedApiKey = extractApiKey(req);
  if (suppliedApiKey) {
    return `key:${suppliedApiKey}`;
  }
  return `ip:${getRequesterIp(req)}`;
}

function consumeRateLimit(subject, nowMs = Date.now()) {
  if (!subject || RATE_LIMIT_MAX_PER_WINDOW <= 0 || RATE_LIMIT_WINDOW_SECONDS <= 0) {
    return { allowed: true, remaining: RATE_LIMIT_MAX_PER_WINDOW, resetAtMs: nowMs };
  }
  const windowMs = RATE_LIMIT_WINDOW_SECONDS * 1000;
  const current = requestRateState.get(subject);
  if (!current || nowMs >= current.resetAtMs) {
    const next = {
      count: 1,
      resetAtMs: nowMs + windowMs,
    };
    requestRateState.set(subject, next);
    return { allowed: true, remaining: Math.max(0, RATE_LIMIT_MAX_PER_WINDOW - 1), resetAtMs: next.resetAtMs };
  }

  if (current.count >= RATE_LIMIT_MAX_PER_WINDOW) {
    return { allowed: false, remaining: 0, resetAtMs: current.resetAtMs };
  }

  current.count += 1;
  requestRateState.set(subject, current);
  return { allowed: true, remaining: Math.max(0, RATE_LIMIT_MAX_PER_WINDOW - current.count), resetAtMs: current.resetAtMs };
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
  if (required === 'public') {
    return { ok: true, role: 'public', required };
  }
  if (!AUTH_ENABLED) {
    return { ok: true, role: 'public', required };
  }

  const supplied = extractApiKey(req);
  const isOperator = OPERATOR_KEY.length > 0 && secureEquals(supplied, OPERATOR_KEY);
  const isViewer = VIEWER_KEY.length > 0 && secureEquals(supplied, VIEWER_KEY);

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

async function runRetentionPurge() {
  purgeExpiredRateLimitWindows();
  ensureAuditDir();
  const removedRecords = purgeEncryptedRecords(RECORD_TTL_SECONDS);
  const removedAudit = purgeJsonlByTimestamp(AUDIT_LOG_FILE, AUDIT_TTL_SECONDS);
  const removedAlerts = purgeJsonlByTimestamp(ALERT_LOG_FILE, ALERT_TTL_SECONDS);
  const removedTelemetry = purgeJsonlByTimestamp(TELEMETRY_FILE, TELEMETRY_TTL_SECONDS);
  const removedProposalTelemetry = purgeJsonlByTimestamp(
    PROPOSAL_TELEMETRY_FILE,
    PROPOSAL_TELEMETRY_TTL_SECONDS
  );
  const removedConsent = await purgeExpiredConsents();
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
  if (state.chainSyncTimer) {
    clearTimeout(state.chainSyncTimer);
    state.chainSyncTimer = null;
  }
  state.chainSyncDelayMs = 0;
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
  if (CHAIN_RPC_URL && MEASUREMENT_CONTRACT_ADDRESS) {
    BlockchainService.setContractAdapter(buildRpcMeasurementAdapter({
      rpcUrl: CHAIN_RPC_URL,
      measurementContractAddress: MEASUREMENT_CONTRACT_ADDRESS,
      getValidatorAddress: () => state.validatorId || validatorId,
    }));
    measurementContractAdapterEnabled = true;
  }

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

  const rawType = String(payload.type || '').trim();
  const measureType = rawType || 'heart_rate';
  if (rawType && !ALLOWED_MEASURE_TYPES.has(measureType)) {
    throw new Error(`Invalid measurement type. Allowed: ${[...ALLOWED_MEASURE_TYPES].join(', ')}`);
  }
  const rawValue = String(payload.value || '').trim();
  const measureValue = rawValue || '75';
  if (rawValue && !Number.isFinite(Number(rawValue))) {
    throw new Error('payload.value must be a finite number');
  }
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
  const consentCheck = await evaluateConsent(patientId, {
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
  } catch (error) {
    // Do not fail successful core submission because of extension-side effects.
    logNonFatal('custom-hooks-after-submit', error);
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
    const persisted = await appendProposalTelemetry({
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
    return true;
  }
  state.chainSyncRunning = true;
  try {
    await syncProposalEventsFromChain({});
    return true;
  } catch (_error) {
    // Never crash demo server because of indexing failures.
    logNonFatal('chain-sync', _error);
    return false;
  } finally {
    state.chainSyncRunning = false;
  }
}

function scheduleChainSync(delayMs = 0) {
  if (CHAIN_SYNC_INTERVAL_SECONDS <= 0) {
    return;
  }
  if (state.chainSyncTimer) {
    clearTimeout(state.chainSyncTimer);
    state.chainSyncTimer = null;
  }
  state.chainSyncTimer = setTimeout(async () => {
    const ok = await runScheduledChainSync();
    const baseMs = CHAIN_SYNC_INTERVAL_SECONDS * 1000;
    const maxBackoffMs = Math.max(baseMs, CHAIN_SYNC_MAX_BACKOFF_SECONDS * 1000);
    if (ok) {
      state.chainSyncDelayMs = baseMs;
    } else if (state.chainSyncDelayMs <= 0) {
      state.chainSyncDelayMs = Math.min(maxBackoffMs, baseMs * 2);
    } else {
      state.chainSyncDelayMs = Math.min(maxBackoffMs, Math.floor(state.chainSyncDelayMs * 2));
    }
    const jitterMs = Math.floor(Math.random() * 300);
    scheduleChainSync(Math.max(baseMs, state.chainSyncDelayMs) + jitterMs);
  }, Math.max(0, Math.floor(delayMs)));
  state.chainSyncTimer.unref();
}

validateStartupConfig();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const rateSubject = resolveRateLimitSubject(req, url.pathname);
  const rate = consumeRateLimit(rateSubject);
  if (!rate.allowed) {
    writeAudit(req, 429, `Rate limit exceeded subject=${safeLogSubject(rateSubject)}`, 'unauthorized');
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rate.resetAtMs - Date.now()) / 1000))));
    return json(res, 429, { error: 'Rate limit exceeded' });
  }
  const auth = resolveRole(req, url.pathname, req.method);
  const actorId = extractActorId(req);

  try {
    if (!auth.ok) {
      writeAudit(req, 401, `Unauthorized required=${auth.required}`, auth.role);
      return json(res, 401, { error: 'Unauthorized' });
    }

    if (handleCoreRoutes({
      req,
      res,
      url,
      auth,
      json,
      serveFile,
      writeAudit,
      state,
      measurementContractAdapterEnabled,
      chainRpcUrl: CHAIN_RPC_URL,
      measurementContractAddress: MEASUREMENT_CONTRACT_ADDRESS,
      webRootDir: __dirname,
    })) {
      return;
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
        await appendValidatorTelemetry({
          validatorId: state.validatorId,
          status: 'failure',
          reason: error.message,
          durationMs: Date.now() - startedAt,
        });
        throw error;
      }
      await appendValidatorTelemetry({
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
      const consent = await setConsent({
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
      const consent = await getLatestConsent(patientId);
      if (!consent) {
        writeAudit(req, 404, `Consent miss patientId=${patientId}`, auth.role);
        return json(res, 404, { error: 'Consent not found' });
      }
      const purpose = String(url.searchParams.get('purpose') || '').trim();
      const queryActorId = String(url.searchParams.get('actorId') || '').trim();
      const resolvedActorId = queryActorId || actorId;
      const actor = getActor(resolvedActorId);
      const check = await evaluateConsent(patientId, {
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

    if (await handleAuditRoutes({
      req,
      res,
      url,
      auth,
      json,
      readBody,
      writeAudit,
      exportAuditEntries,
      createSignedAuditPackageFromRequest,
      loadAuditKeyHistory,
      getActiveAuditSigningKey,
      rotateAuditSigner,
    })) {
      return;
    }

    if (await handleMonitorRoutes({
      req,
      res,
      url,
      auth,
      json,
      readBody,
      writeAudit,
      exportAuditEntries,
      summarizeAuditEntries,
      exportAlerts,
      exportValidatorTelemetry,
      summarizeValidatorTelemetry: (entries) => summarizeValidatorTelemetry(entries, { gasAnomalyGasUsed: GAS_ANOMALY_GAS_USED }),
      exportProposalTelemetry,
      summarizeProposalTelemetry,
      appendProposalTelemetry,
      syncProposalEventsFromChain,
      getLastSyncedBlock,
      validatorManagerAddress: VALIDATOR_MANAGER_ADDRESS,
    })) {
      return;
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
  runRetentionPurge().catch((error) => logNonFatal('retention-purge-startup', error));
  setInterval(() => {
    runRetentionPurge().catch((error) => logNonFatal('retention-purge-interval', error));
  }, PURGE_INTERVAL_SECONDS * 1000).unref();
  if (CHAIN_SYNC_INTERVAL_SECONDS > 0) {
    state.chainSyncDelayMs = CHAIN_SYNC_INTERVAL_SECONDS * 1000;
    scheduleChainSync(0);
  }
  console.log(`RPM demo portal running on http://${HOST}:${PORT}`);
});
