const fs = require('fs');
const path = require('path');

const ACTOR_REGISTRY_FILE = path.join(__dirname, '.data', 'actors.json');

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

function loadActors(filePath = ACTOR_REGISTRY_FILE) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function saveActors(actors, filePath = ACTOR_REGISTRY_FILE) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(actors, null, 2) + '\n', 'utf8');
}

function upsertActor(payload, filePath = ACTOR_REGISTRY_FILE) {
  const actorId = String(payload.actorId || '').trim();
  const role = String(payload.role || '').trim();
  const org = String(payload.org || '').trim();
  if (!actorId || !role || !org) {
    throw new Error('actorId, role, and org are required');
  }

  const scopes = normalizeStringArray(payload.scopes, []);
  const active = payload.active === undefined ? true : Boolean(payload.active);
  const actor = {
    actorId,
    role,
    org,
    scopes,
    active,
    updatedAt: new Date().toISOString(),
  };

  const actors = loadActors(filePath);
  const idx = actors.findIndex((entry) => entry.actorId === actorId);
  if (idx >= 0) {
    actors[idx] = actor;
  } else {
    actors.push(actor);
  }
  saveActors(actors, filePath);
  return actor;
}

function getActor(actorId, filePath = ACTOR_REGISTRY_FILE) {
  const id = String(actorId || '').trim();
  if (!id) {
    return null;
  }
  return loadActors(filePath).find((entry) => entry.actorId === id) || null;
}

module.exports = {
  ACTOR_REGISTRY_FILE,
  upsertActor,
  getActor,
  loadActors,
};
