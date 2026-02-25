const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  setConsent,
  getLatestConsent,
  hasActiveConsent,
  evaluateConsent,
  purgeExpiredConsents,
} = require('../../demo/consent');

function createTmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-consent-'));
  return path.join(dir, 'consent.jsonl');
}

test('consent store sets and retrieves latest consent', async () => {
  const filePath = createTmpFile();
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  await setConsent({
    patientId: 'patient-1',
    granted: true,
    actor: 'operator',
    actorId: 'clinician-1',
    purposes: ['treatment'],
    allowedActorIds: ['clinician-1'],
    expiresAt,
  }, filePath);

  const consent = getLatestConsent('patient-1', filePath);
  assert.equal(consent.patientId, 'patient-1');
  assert.equal(consent.granted, true);
  assert.equal(hasActiveConsent('patient-1', Date.now(), filePath), true);
  const policyCheck = evaluateConsent('patient-1', { purpose: 'treatment', actorId: 'clinician-1' }, filePath);
  assert.equal(policyCheck.ok, true);
});

test('consent store treats expired consent as inactive', async () => {
  const filePath = createTmpFile();
  const expiresAt = new Date(Date.now() - 1_000).toISOString();
  await setConsent({ patientId: 'patient-2', granted: true, expiresAt }, filePath);

  assert.equal(hasActiveConsent('patient-2', Date.now(), filePath), false);
});

test('consent purge removes expired latest grants', async () => {
  const filePath = createTmpFile();
  await setConsent({
    patientId: 'patient-3',
    granted: true,
    expiresAt: new Date(Date.now() - 1_000).toISOString(),
  }, filePath);
  await setConsent({
    patientId: 'patient-4',
    granted: true,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }, filePath);

  const removed = await purgeExpiredConsents(filePath, Date.now());
  assert.equal(removed, 1);
  assert.equal(getLatestConsent('patient-3', filePath), null);
  assert.equal(hasActiveConsent('patient-4', Date.now(), filePath), true);
});

test('consent policy rejects unknown purpose and actor', async () => {
  const filePath = createTmpFile();
  await setConsent({
    patientId: 'patient-5',
    granted: true,
    purposes: ['treatment'],
    allowedActorIds: ['clinician-allowed'],
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }, filePath);

  const badPurpose = evaluateConsent(
    'patient-5',
    { purpose: 'research', actorId: 'clinician-allowed' },
    filePath
  );
  assert.equal(badPurpose.ok, false);
  assert.equal(badPurpose.reason, 'purpose_not_allowed');

  const badActor = evaluateConsent(
    'patient-5',
    { purpose: 'treatment', actorId: 'clinician-other' },
    filePath
  );
  assert.equal(badActor.ok, false);
  assert.equal(badActor.reason, 'actor_not_allowed');
});

test('consent policy enforces role/org/scope constraints', async () => {
  const filePath = createTmpFile();
  await setConsent({
    patientId: 'patient-6',
    granted: true,
    purposes: ['treatment'],
    allowedRoles: ['doctor'],
    allowedOrgs: ['hospital-a'],
    requiredScopes: ['vitals:write'],
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }, filePath);

  const ok = evaluateConsent('patient-6', {
    purpose: 'treatment',
    actorId: 'clinician-6',
    actorRole: 'doctor',
    actorOrg: 'hospital-a',
    actorScopes: ['vitals:read', 'vitals:write'],
  }, filePath);
  assert.equal(ok.ok, true);

  const badRole = evaluateConsent('patient-6', {
    purpose: 'treatment',
    actorId: 'clinician-6',
    actorRole: 'nurse',
    actorOrg: 'hospital-a',
    actorScopes: ['vitals:read', 'vitals:write'],
  }, filePath);
  assert.equal(badRole.ok, false);
  assert.equal(badRole.reason, 'role_not_allowed');

  const badOrg = evaluateConsent('patient-6', {
    purpose: 'treatment',
    actorId: 'clinician-6',
    actorRole: 'doctor',
    actorOrg: 'hospital-b',
    actorScopes: ['vitals:read', 'vitals:write'],
  }, filePath);
  assert.equal(badOrg.ok, false);
  assert.equal(badOrg.reason, 'org_not_allowed');

  const badScope = evaluateConsent('patient-6', {
    purpose: 'treatment',
    actorId: 'clinician-6',
    actorRole: 'doctor',
    actorOrg: 'hospital-a',
    actorScopes: ['vitals:read'],
  }, filePath);
  assert.equal(badScope.ok, false);
  assert.equal(badScope.reason, 'scope_not_allowed');
});

test('consent revocation propagation through lifecycle transitions', async () => {
  const filePath = createTmpFile();
  const nowMs = Date.now();

  await setConsent({
    patientId: 'patient-7',
    granted: true,
    purposes: ['treatment'],
    allowedActorIds: ['clinician-7'],
    expiresAt: new Date(nowMs + 60_000).toISOString(),
  }, filePath);
  let check = evaluateConsent('patient-7', {
    purpose: 'treatment',
    actorId: 'clinician-7',
  }, filePath);
  assert.equal(check.ok, true);

  await setConsent({
    patientId: 'patient-7',
    granted: false,
    reason: 'revoked-by-patient',
  }, filePath);
  check = evaluateConsent('patient-7', {
    purpose: 'treatment',
    actorId: 'clinician-7',
  }, filePath);
  assert.equal(check.ok, false);
  assert.equal(check.reason, 'missing_or_revoked');

  await setConsent({
    patientId: 'patient-7',
    granted: true,
    purposes: ['research'],
    allowedActorIds: ['clinician-7'],
    expiresAt: new Date(nowMs + 120_000).toISOString(),
  }, filePath);
  check = evaluateConsent('patient-7', {
    purpose: 'treatment',
    actorId: 'clinician-7',
  }, filePath);
  assert.equal(check.ok, false);
  assert.equal(check.reason, 'purpose_not_allowed');
});
