const fs = require('fs');

const localQueue = new Map();

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(1, ms)));
}

async function runSerialized(lockPath, fn) {
  const previous = localQueue.get(lockPath) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  localQueue.set(lockPath, previous.catch(() => {}).then(() => current));

  await previous.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
    if (localQueue.get(lockPath) === current) {
      localQueue.delete(lockPath);
    }
  }
}

async function withFileLock(lockPath, fn, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 3000);
  const retryDelayMs = Number(options.retryDelayMs || 10);

  return runSerialized(lockPath, async () => {
    const startedAt = Date.now();
    let lockHandle = null;

    while (Date.now() - startedAt < timeoutMs) {
      try {
        lockHandle = await fs.promises.open(lockPath, 'wx');
        break;
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw error;
        }
        await sleepMs(retryDelayMs);
      }
    }

    if (lockHandle === null) {
      throw new Error(`Timed out acquiring lock: ${lockPath}`);
    }

    try {
      return await fn();
    } finally {
      try {
        await lockHandle.close();
      } catch (_error) {
        // Ignore close failures in demo utility.
      }
      try {
        await fs.promises.unlink(lockPath);
      } catch (_error) {
        // Ignore unlink failures in demo utility.
      }
    }
  });
}

module.exports = {
  withFileLock,
};
