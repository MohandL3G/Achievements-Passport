const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const config = require('../config');
const {
  readSettings,
  readSecrets,
  readUserSecrets,
  readUsersIndex,
  saveUserCard,
  readCrSnapshot,
  replaceCrSnapshot,
  writeLog,
} = require('./storage');
const { SteamApi, accountIdOfSteamId64 } = require('./steamApi');
const { aggregate } = require('./aggregator');
const { buildCrGame, crEntriesFromObjects, mergeCrEntries, applyResolvedNames } = require('./cloudRedirect');
const { fetchCrFiles } = require('./s3Client');

const LOCK_FILE = path.join(config.DATA_DIR, 'scheduler.lock');
let currentTask = null;
let running = false;

function normalizeCronExpression(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const normalized = trimmed.replace(/\s+/g, ' ');
  if (normalized.length > 200) return null;
  const fields = normalized.split(' ');
  if (fields.length !== 5) return null;
  try {
    if (!cron.validate(normalized)) return null;
  } catch {
    return null;
  }
  return normalized;
}

function pidExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err.code === 'ESRCH') return false;
    if (err.code === 'EPERM') return true;
    return null;
  }
}

function procStartTicks(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const end = stat.lastIndexOf(')');
    if (end < 0) return null;
    const fields = stat.slice(end + 2).trim().split(' ');
    const ticks = Number(fields[19]);
    return Number.isFinite(ticks) ? ticks : null;
  } catch {
    return null;
  }
}

function currentStartTicks() {
  return procStartTicks(process.pid);
}

function analyzeLockFile(lockPath) {
  let raw;
  try {
    raw = fs.readFileSync(lockPath, 'utf8');
  } catch (err) {
    return { state: err && err.code === 'ENOENT' ? 'absent' : 'error' };
  }
  if (raw.trim() === '') return { state: 'empty' };
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { state: 'malformed' };
  }
  if (!payload || typeof payload !== 'object' || !Number.isInteger(payload.pid) || payload.pid <= 0) {
    return { state: 'malformed' };
  }
  const liveness = pidExists(payload.pid);
  if (liveness === false) return { state: 'dead', pid: payload.pid };
  if (liveness === null) return { state: 'unknown', pid: payload.pid };
  if (typeof payload.startTicks === 'number' && Number.isFinite(payload.startTicks)) {
    const actual = procStartTicks(payload.pid);
    if (typeof actual === 'number' && Number.isFinite(actual) && actual !== payload.startTicks) {
      return { state: 'dead', pid: payload.pid };
    }
  }
  return { state: 'held', pid: payload.pid };
}

function tryCreateLock(lockPath, payload) {
  let fd;
  try {
    fd = fs.openSync(lockPath, 'wx');
  } catch (err) {
    return err.code === 'EEXIST' ? false : null;
  }
  try {
    fs.writeFileSync(fd, JSON.stringify(payload), 'utf8');
  } catch (err) {
    try {
      fs.closeSync(fd);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(lockPath);
    } catch {
      /* ignore */
    }
    writeLog(`scheduler lock write failed: ${err.message}; removed partial lock`);
    return null;
  }
  try {
    fs.closeSync(fd);
  } catch {
    /* ignore */
  }
  return true;
}

function acquireSchedulerLock(lockPath = LOCK_FILE) {
  const payload = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    startTicks: currentStartTicks(),
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = tryCreateLock(lockPath, payload);
    if (result === true) {
      writeLog('scheduler lock acquired');
      return true;
    }
    if (result === null) return null;
    const info = analyzeLockFile(lockPath);
    if (info.state === 'dead') {
      writeLog(`scheduler lock recovered: owner pid ${info.pid} is not alive; removing stale lock`);
      try {
        fs.unlinkSync(lockPath);
      } catch (err) {
        if (err.code !== 'ENOENT') {
          writeLog(`scheduler lock recovery unlink failed (${err.code}); skipped`);
          return null;
        }
      }
      continue;
    }
    switch (info.state) {
      case 'held':
        writeLog(`scheduler lock held by live owner (pid ${info.pid}); skipped`);
        break;
      case 'unknown':
        writeLog(`scheduler lock owner unknown (pid ${info.pid}); refusing to remove; skipped`);
        break;
      case 'malformed':
        writeLog('scheduler lock malformed; preserved and skipped');
        break;
      case 'empty':
        writeLog('scheduler lock present but empty; preserved and skipped');
        break;
      default:
        writeLog('scheduler lock unreadable; skipped');
    }
    return null;
  }
  writeLog('scheduler lock contention; could not acquire');
  return null;
}

function releaseSchedulerLock(lockPath = LOCK_FILE, acquired = false) {
  if (!acquired) return;
  let raw;
  try {
    raw = fs.readFileSync(lockPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      writeLog('scheduler lock already absent');
      return;
    }
    writeLog(`scheduler lock release: cannot read lock (${err.code}); not removed`);
    return;
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    writeLog('scheduler lock release skipped: lock malformed (ownership unknown)');
    return;
  }
  if (!payload || typeof payload !== 'object' || payload.pid !== process.pid) {
    writeLog('scheduler lock release skipped: lock not owned by this process');
    return;
  }
  if (typeof payload.startTicks === 'number' && Number.isFinite(payload.startTicks)) {
    const mine = currentStartTicks();
    if (typeof mine === 'number' && Number.isFinite(mine) && mine !== payload.startTicks) {
      writeLog('scheduler lock release skipped: pid matched but start identity mismatch');
      return;
    }
  }
  try {
    fs.unlinkSync(lockPath);
    writeLog('scheduler lock released');
  } catch (err) {
    writeLog(`scheduler lock release unlink failed (${err.code})`);
  }
}

async function runNightlyJob() {
  if (running) return;
  const acquired = acquireSchedulerLock();
  if (!acquired) return;
  running = true;
  writeLog('nightly job started');
  try {
    const users = readUsersIndex().filter((u) => u.autoUpdate && !u.disabled);
    const secrets = readSecrets();
    const canS3 = Boolean(secrets.s3 && secrets.s3.bucket);

    for (const u of users) {
      writeLog(`  -> regenerating ${u.steamid64} (${u.personaName || 'unknown'})`);
      try {
        let crGames = null;
        let baseEntries = null;
        const userS3 = readUserSecrets(u.steamid64).s3;
        if (userS3 && userS3.bucket) {
          const result = await fetchCrFiles(userS3, accountIdOfSteamId64(u.steamid64));
          const parsed = crEntriesFromObjects(result.objects);
          const existing = readCrSnapshot(u.steamid64);
          if (parsed.length > 0) {
            const merged = mergeCrEntries(existing, parsed);
            replaceCrSnapshot(u.steamid64, merged);
            crGames = merged.map((f) => buildCrGame(f.appId, f.data));
            baseEntries = merged;
            writeLog(`    s3 pull (user): ${parsed.length} usable -> snapshot ${crGames.length} entries (prefix ${result.usedPrefix || 'auto'})`);
          } else {
            baseEntries = existing;
            writeLog(`    s3 pull (user): 0 usable, keeping previous snapshot (${existing.length} entries)`);
          }
        } else if (u.steamid64 === config.OWNER_STEAMID && canS3) {
          const result = await fetchCrFiles(secrets.s3, accountIdOfSteamId64(u.steamid64));
          const parsed = crEntriesFromObjects(result.objects);
          const existing = readCrSnapshot(u.steamid64);
          if (parsed.length > 0) {
            const merged = mergeCrEntries(existing, parsed);
            replaceCrSnapshot(u.steamid64, merged);
            crGames = merged.map((f) => buildCrGame(f.appId, f.data));
            baseEntries = merged;
            writeLog(`    s3 pull (admin): ${parsed.length} usable -> snapshot ${crGames.length} entries (prefix ${result.usedPrefix || 'auto'})`);
          } else {
            baseEntries = existing;
            writeLog(`    s3 pull (admin): 0 usable, keeping previous snapshot (${existing.length} entries)`);
          }
        }
        const api = u.autoIncludeSteam !== false ? new SteamApi(config.STEAM_API_KEY) : null;
        const card = await aggregate(api, u.steamid64, crGames);
        // Persist real names the AppList resolved for CR-only games back into the
        // snapshot (only when something actually changed) so CR generations that
        // later lack the AppList can reuse previously known names.
        if (baseEntries && applyResolvedNames(baseEntries, card.Games) > 0) {
          replaceCrSnapshot(u.steamid64, baseEntries);
        }
        saveUserCard(u.steamid64, card);
        writeLog(`    ok: ${card.Summary.TotalGames} games, ${card.Summary.PerfectGames} perfect`);
      } catch (err) {
        writeLog(`    ERROR: ${err.message}`);
      }
    }
    writeLog('nightly job finished');
  } catch (err) {
    writeLog(`nightly job failed: ${err.message}`);
  } finally {
    running = false;
    releaseSchedulerLock(LOCK_FILE, acquired);
  }
}

function startScheduler() {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
  }
  const settings = readSettings();
  if (!settings.scheduler.enabled) {
    writeLog('scheduler disabled');
    return;
  }
  const expression = normalizeCronExpression(settings.scheduler.cron);
  if (expression === null) {
    writeLog(`scheduler not started: invalid cron "${settings.scheduler.cron}" in settings (expected exactly 5 fields accepted by node-cron)`);
    return;
  }
  try {
    currentTask = cron.schedule(expression, runNightlyJob);
    writeLog(`scheduler started (cron: ${expression}, timezone: server local)`);
  } catch (err) {
    writeLog(`scheduler not started: cron "${expression}" failed to schedule: ${err.message}`);
    currentTask = null;
  }
}

module.exports = {
  startScheduler,
  runNightlyJob,
  normalizeCronExpression,
  acquireSchedulerLock,
  releaseSchedulerLock,
  analyzeLockFile,
  pidExists,
  currentStartTicks,
};