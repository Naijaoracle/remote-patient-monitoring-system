const fs = require('fs');
const path = require('path');

const CONSENT_FILE = path.join(__dirname, '.data', 'consent.jsonl');

function ensureConsentDir(filePath = CONSENT_FILE) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readConsentEntries(filePath = CONSENT_FILE) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean);
}

function writeConsentEntries(entries, filePath = CONSENT_FILE) {
  ensureConsentDir(filePath);
  fs.writeFileSync(
    filePath,
    entries.map((entry) => JSON.stringify(entry)).join('\n') + (entries.length ? '\n' : ''),
    'utf8'
  );
}

function normalizeExpiresAt(expiresAt) {
  if (!expiresAt) {
    return null;
  }
  const expires = new Date(expiresAt).toISOString();
  return expires;
}

function normalizeStringArray(input, fallback = []) {
  if (Array.isArray(input)) {
    const values = input
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    return values.length > 0 ? values : fallback;
  }
  if (typeof input === 'string') {
    const values = input
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    return values.length > 0 ? values : fallback;
  }
  return fallback;
}

function setConsent(payload, filePath = CONSENT_FILE) {
  const patientId = String(payload.patientId || '').trim();
  if (!patientId) {
    throw new Error('patientId is required');
  }

  const granted = Boolean(payload.granted);
  const entry = {
    at: new Date().toISOString(),
    patientId,
    granted,
    actor: String(payload.actor || 'operator'),
    actorId: String(payload.actorId || '').trim() || null,
    reason: String(payload.reason || ''),
    purposes: normalizeStringArray(payload.purposes, granted ? ['treatment'] : []),
    allowedActorIds: normalizeStringArray(payload.allowedActorIds, []),
    allowedRoles: normalizeStringArray(payload.allowedRoles, []),
    allowedOrgs: normalizeStringArray(payload.allowedOrgs, []),
    requiredScopes: normalizeStringArray(payload.requiredScopes, []),
    expiresAt: normalizeExpiresAt(payload.expiresAt),
  };

  ensureConsentDir(filePath);
  fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf8');
  return entry;
}

function getLatestConsent(patientId, filePath = CONSENT_FILE) {
  const resolvedPatientId = String(patientId || '').trim();
  if (!resolvedPatientId) {
    return null;
  }

  const entries = readConsentEntries(filePath);
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (entries[i].patientId === resolvedPatientId) {
      return entries[i];
    }
  }
  return null;
}

function hasActiveConsent(patientId, nowMs = Date.now(), filePath = CONSENT_FILE) {
  return evaluateConsent(patientId, { nowMs }, filePath).ok;
}

function evaluateConsent(patientId, options = {}, filePath = CONSENT_FILE) {
  const entry = getLatestConsent(patientId, filePath);
  if (!entry || !entry.granted) {
    return { ok: false, reason: 'missing_or_revoked', consent: entry };
  }

  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  if (entry.expiresAt) {
    const expiresMs = new Date(entry.expiresAt).getTime();
    if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) {
      return { ok: false, reason: 'expired', consent: entry };
    }
  }

  const purpose = String(options.purpose || '').trim();
  if (purpose) {
    const purposes = normalizeStringArray(entry.purposes, []);
    if (purposes.length > 0 && !purposes.includes(purpose)) {
      return { ok: false, reason: 'purpose_not_allowed', consent: entry };
    }
  }

  const actorId = String(options.actorId || '').trim();
  const allowedActorIds = normalizeStringArray(entry.allowedActorIds, []);
  if (allowedActorIds.length > 0 && actorId && !allowedActorIds.includes(actorId)) {
    return { ok: false, reason: 'actor_not_allowed', consent: entry };
  }

  const actorRole = String(options.actorRole || '').trim();
  const allowedRoles = normalizeStringArray(entry.allowedRoles, []);
  if (allowedRoles.length > 0 && (!actorRole || !allowedRoles.includes(actorRole))) {
    return { ok: false, reason: 'role_not_allowed', consent: entry };
  }

  const actorOrg = String(options.actorOrg || '').trim();
  const allowedOrgs = normalizeStringArray(entry.allowedOrgs, []);
  if (allowedOrgs.length > 0 && (!actorOrg || !allowedOrgs.includes(actorOrg))) {
    return { ok: false, reason: 'org_not_allowed', consent: entry };
  }

  const actorScopes = normalizeStringArray(options.actorScopes, []);
  const requiredScopes = normalizeStringArray(entry.requiredScopes, []);
  if (requiredScopes.length > 0 && !requiredScopes.every((scope) => actorScopes.includes(scope))) {
    return { ok: false, reason: 'scope_not_allowed', consent: entry };
  }

  return { ok: true, reason: 'ok', consent: entry };
}

function purgeExpiredConsents(filePath = CONSENT_FILE, nowMs = Date.now()) {
  if (!fs.existsSync(filePath)) {
    return 0;
  }

  const entries = readConsentEntries(filePath);
  const latestByPatient = new Map();
  for (const entry of entries) {
    latestByPatient.set(entry.patientId, entry);
  }

  const kept = [];
  let removed = 0;
  for (const entry of latestByPatient.values()) {
    if (!entry.expiresAt) {
      kept.push(entry);
      continue;
    }
    const expiresMs = new Date(entry.expiresAt).getTime();
    if (!Number.isFinite(expiresMs) || expiresMs > nowMs || entry.granted === false) {
      kept.push(entry);
    } else {
      removed += 1;
    }
  }

  writeConsentEntries(kept, filePath);
  return removed;
}

module.exports = {
  CONSENT_FILE,
  setConsent,
  getLatestConsent,
  hasActiveConsent,
  evaluateConsent,
  purgeExpiredConsents,
};
