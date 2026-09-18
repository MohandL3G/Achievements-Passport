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
const { buildCrGame, crEntriesFromObjects, mergeCrEntries } = require('./cloudRedirect');
const { fetchCrFiles } = require('./s3Client');

const LOCK_FILE = path.join(config.DATA_DIR, 'scheduler.lock');
let currentTask = null;
let running = false;

async function runNightlyJob() {
  if (running) return;
  if (fs.existsSync(LOCK_FILE)) {
    const age = Date.now() - fs.statSync(LOCK_FILE).mtimeMs;
    if (age < 6 * 3600 * 1000) {
      writeLog('nightly job skipped: lock file present');
      return;
    }
  }
  running = true;
  writeLog('nightly job started');
  try {
    fs.writeFileSync(LOCK_FILE, String(Date.now()), 'utf8');
    const users = readUsersIndex().filter((u) => u.autoUpdate && !u.disabled);
    const secrets = readSecrets();
    const canS3 = Boolean(secrets.s3 && secrets.s3.bucket);

    for (const u of users) {
      writeLog(`  -> regenerating ${u.steamid64} (${u.personaName || 'unknown'})`);
      try {
        let crGames = null;
        const userS3 = readUserSecrets(u.steamid64).s3;
        if (userS3 && userS3.bucket) {
          const result = await fetchCrFiles(userS3, accountIdOfSteamId64(u.steamid64));
          const parsed = crEntriesFromObjects(result.objects);
          const existing = readCrSnapshot(u.steamid64);
          if (parsed.length > 0) {
            const merged = mergeCrEntries(existing, parsed);
            replaceCrSnapshot(u.steamid64, merged);
            crGames = merged.map((f) => buildCrGame(f.appId, f.data));
            writeLog(`    s3 pull (user): ${parsed.length} usable -> snapshot ${crGames.length} entries (prefix ${result.usedPrefix || 'auto'})`);
          } else {
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
            writeLog(`    s3 pull (admin): ${parsed.length} usable -> snapshot ${crGames.length} entries (prefix ${result.usedPrefix || 'auto'})`);
          } else {
            writeLog(`    s3 pull (admin): 0 usable, keeping previous snapshot (${existing.length} entries)`);
          }
        }
        const api = u.autoIncludeSteam !== false ? new SteamApi(config.STEAM_API_KEY) : null;
        const card = await aggregate(api, u.steamid64, crGames);
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
    try {
      fs.unlinkSync(LOCK_FILE);
    } catch (err) {
      /* ignore */
    }
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
  currentTask = cron.schedule(settings.scheduler.cron, runNightlyJob);
  writeLog(`scheduler started (cron: ${settings.scheduler.cron}, timezone: server local)`);
}

module.exports = { startScheduler, runNightlyJob };