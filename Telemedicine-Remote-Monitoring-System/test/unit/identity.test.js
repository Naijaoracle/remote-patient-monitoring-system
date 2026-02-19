const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { upsertActor, getActor, loadActors } = require('../../demo/identity');

function createActorFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-actors-'));
  return path.join(dir, 'actors.json');
}

test('identity registry upserts and loads actor profiles', () => {
  const filePath = createActorFile();
  upsertActor({
    actorId: 'clinician-1',
    role: 'doctor',
    org: 'hospital-a',
    scopes: ['vitals:read', 'vitals:write'],
    active: true,
  }, filePath);

  const actor = getActor('clinician-1', filePath);
  assert.equal(actor.role, 'doctor');
  assert.equal(actor.org, 'hospital-a');
  assert.deepEqual(actor.scopes, ['vitals:read', 'vitals:write']);
  assert.equal(loadActors(filePath).length, 1);
});

test('identity registry can deactivate actors', () => {
  const filePath = createActorFile();
  upsertActor({
    actorId: 'clinician-2',
    role: 'nurse',
    org: 'hospital-a',
    scopes: ['vitals:read'],
    active: true,
  }, filePath);
  upsertActor({
    actorId: 'clinician-2',
    role: 'nurse',
    org: 'hospital-a',
    scopes: ['vitals:read'],
    active: false,
  }, filePath);

  const actor = getActor('clinician-2', filePath);
  assert.equal(actor.active, false);
});
