const fs = require('fs');
const path = require('path');
const config = require('../config');
const { encrypt, decrypt } = require('./secrets');
const { parseAppId } = require('../utils');

const DATA_DIR = config.DATA_DIR;
const USERS_DIR = path.join(DATA_DIR, 'users');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const SECRETS_FILE = path.join(DATA_DIR, 'secrets.enc.json');
const CACHE_DIR = path.join(DATA_DIR, 'cache');
const TMP_DIR = path.join(DATA_DIR, 'tmp');
const CARD_BACKUP_KEEP = 30;

const CARD_BACKUP_RE = /^card_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/;

function ensureDirs() {
  for (const d of [DATA_DIR, USERS_DIR, CACHE_DIR, TMP_DIR]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

function userDir(steamid) {
  return path.join(USERS_DIR, steamid);
}

function ensureUserDirs(steamid) {
  const d = userDir(steamid);
  fs.mkdirSync(path.join(d, 'last_cr'), { recursive: true });
  fs.mkdirSync(path.join(d, 'backups'), { recursive: true });
  return d;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

// ---------- Admin settings (non-secret) ----------

function readSettings() {
  const defaults = {
    gateMode: 'protected',
    whitelist: [],
    scheduler: { enabled: true, cron: config.DEFAULT_CRON },
    limits: { maxZipBytes: 100 * 1024 * 1024, maxFiles: 5000, maxFileBytes: 20 * 1024 * 1024 },
  };
  const s = readJson(SETTINGS_FILE, defaults);
  return {
    ...defaults,
    ...s,
    scheduler: { ...defaults.scheduler, ...(s.scheduler || {}) },
    limits: { ...defaults.limits, ...(s.limits || {}) },
    whitelist: Array.isArray(s.whitelist) ? s.whitelist.filter(Boolean) : [],
  };
}

function saveSettings(s) {
  writeJson(SETTINGS_FILE, s);
}

// ---------- Admin secrets (encrypted at rest) ----------

function readSecrets() {
  return decrypt(readJson(SECRETS_FILE, null), config.ENCRYPTION_SECRET) || {};
}

function saveSecrets(secrets) {
  writeJson(SECRETS_FILE, encrypt(secrets, config.ENCRYPTION_SECRET));
}

// ---------- Per-user secrets (encrypted at rest) ----------

function userSecretsFile(steamid) {
  return path.join(userDir(steamid), 'secrets.enc.json');
}

function readUserSecrets(steamid) {
  return decrypt(readJson(userSecretsFile(steamid), null), config.ENCRYPTION_SECRET) || {};
}

function saveUserSecrets(steamid, secrets) {
  writeJson(userSecretsFile(steamid), encrypt(secrets, config.ENCRYPTION_SECRET));
}

// ---------- Users index ----------

function readUsersIndex() {
  const idx = readJson(path.join(USERS_DIR, 'index.json'), { users: [] });
  return Array.isArray(idx.users) ? idx.users : [];
}

function saveUsersIndex(users) {
  writeJson(path.join(USERS_DIR, 'index.json'), { users });
}

function findUser(users, steamid) {
  return users.find((u) => u.steamid64 === steamid);
}

function upsertUser(entry) {
  const users = readUsersIndex();
  const existing = findUser(users, entry.steamid64);
  if (existing) {
    const merged = { ...entry };
    delete merged.createdAt;
    delete merged.autoUpdate;
    delete merged.disabled;
    if (!('autoIncludeSteam' in existing)) existing.autoIncludeSteam = true;
    Object.assign(existing, merged);
  } else {
    users.push({ autoIncludeSteam: true, ...entry });
  }
  saveUsersIndex(users);
  return existing || entry;
}

function removeUserFromIndex(steamid) {
  const users = readUsersIndex().filter((u) => u.steamid64 !== steamid);
  saveUsersIndex(users);
}

// ---------- Cards ----------

function getUserCard(steamid) {
  return readJson(path.join(userDir(steamid), 'card.json'), null);
}

function cardExists(steamid) {
  return fs.existsSync(path.join(userDir(steamid), 'card.json'));
}

function saveUserCard(steamid, card, autoIncludeSteam) {
  ensureUserDirs(steamid);
  const cardFile = path.join(userDir(steamid), 'card.json');
  if (fs.existsSync(cardFile)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(userDir(steamid), 'backups', `card_${stamp}.json`);
    try {
      fs.copyFileSync(cardFile, backupFile);
    } catch (err) {
      /* ignore */
    }
  }
  trimCardBackups(steamid);
  writeJson(cardFile, card);
  const users = readUsersIndex();
  const u = findUser(users, steamid);
  if (u) {
    u.lastGeneratedAt = new Date().toISOString();
    u.gamesCount = card.Summary ? card.Summary.TotalGames : u.gamesCount;
    if (autoIncludeSteam !== undefined) u.autoIncludeSteam = autoIncludeSteam;
    else if (u.autoIncludeSteam === undefined) u.autoIncludeSteam = true;
    saveUsersIndex(users);
  }
  return card;
}

function deleteUser(steamid) {
  removeUserFromIndex(steamid);
  const dir = userDir(steamid);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

// Keeps card backups bounded: only files matching the exact card-backup name
// pattern produced by saveUserCard are candidates, and only the oldest beyond
// `keep` are removed. The live card.json, last_cr snapshot, staging/recovery
// dirs, and any unrelated or malformed-named files are never touched.
function trimCardBackups(steamid, keep = CARD_BACKUP_KEEP) {
  const dir = path.join(userDir(steamid), 'backups');
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (err) {
    return 0;
  }
  const matches = names.filter((n) => CARD_BACKUP_RE.test(n)).sort();
  if (matches.length <= keep) return 0;
  const excess = matches.length - keep;
  let removed = 0;
  for (const name of matches.slice(0, excess)) {
    try {
      fs.unlinkSync(path.join(dir, name));
      removed++;
    } catch (err) {
      /* ignore individual deletion failures */
    }
  }
  if (removed > 0) writeLog(`card backups trimmed: ${removed} old backup(s) removed, ${keep} kept`);
  return removed;
}

// ---------- CloudRedirect snapshot ----------

function crDir(steamid) {
  return path.join(userDir(steamid), 'last_cr');
}

function listCrFiles(steamid) {
  recoverSnapshotDir(steamid);
  const dir = crDir(steamid);
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir).filter((f) => /\.json$/i.test(f));
  } catch (err) {
    return [];
  }
}

function writeCrJson(steamid, appId, obj) {
  ensureUserDirs(steamid);
  writeJson(path.join(crDir(steamid), `${appId}.json`), obj);
}

function clearCr(steamid) {
  const dir = crDir(steamid);
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    try {
      fs.unlinkSync(path.join(dir, f));
    } catch (err) {
      /* ignore */
    }
  }
}

const SWAP_STALE_MS = 60 * 60 * 1000;

function recoverSnapshotDir(steamid) {
  const dir = crDir(steamid);
  if (fs.existsSync(dir)) return dir;
  const base = userDir(steamid);
  let names;
  try {
    names = fs.readdirSync(base);
  } catch (err) {
    return dir;
  }
  const outs = names.filter((n) => /^last_cr\.out\.[\w-]+$/i.test(n));
  let best = null;
  let bestM = -1;
  for (const n of outs) {
    const p = path.join(base, n);
    try {
      const m = fs.statSync(p).mtimeMs;
      if (m > bestM) {
        bestM = m;
        best = p;
      }
    } catch (err) {
      /* ignore */
    }
  }
  if (!best) return dir;
  try {
    fs.renameSync(best, dir);
  } catch (err) {
    return dir;
  }
  for (const n of outs) {
    const p = path.join(base, n);
    if (p === best) continue;
    try {
      fs.rmSync(p, { recursive: true, force: true });
    } catch (err) {
      /* ignore */
    }
  }
  return dir;
}

function sweepCrSwapLeftovers(base) {
  let names;
  try {
    names = fs.readdirSync(base);
  } catch (err) {
    return;
  }
  for (const name of names) {
    if (!/^last_cr\.(stage|out)\.[\w-]+$/i.test(name)) continue;
    const p = path.join(base, name);
    try {
      const st = fs.statSync(p);
      if (Date.now() - st.mtimeMs < SWAP_STALE_MS) continue;
      fs.rmSync(p, { recursive: true, force: true });
    } catch (err) {
      /* ignore */
    }
  }
}

// Transactionally replaces a user's CloudRedirect snapshot.
// The complete new snapshot is written to a sibling staging directory under
// the same filesystem, then the previous `last_cr` directory is atomically
// moved aside and the staged directory renamed into place. Readers only ever
// observe the fully-written staged snapshot (or the intact previous one); a
// failure between the two renames rolls the previous snapshot back.
function replaceCrSnapshot(steamid, entries) {
  recoverSnapshotDir(steamid);
  ensureUserDirs(steamid);
  const base = userDir(steamid);
  const snapshotDir = crDir(steamid);
  const rand = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const stage = path.join(base, `last_cr.stage.${rand}`);
  const out = path.join(base, `last_cr.out.${rand}`);
  sweepCrSwapLeftovers(base);

  fs.mkdirSync(stage, { recursive: true });
  for (const entry of entries || []) {
    const appId = String((entry && entry.appId) || '');
    if (!/^\d+$/.test(appId) || entry.data == null) continue;
    writeJson(path.join(stage, `${appId}.json`), entry.data);
  }

  try {
    fs.renameSync(snapshotDir, out);
  } catch (err) {
    fs.rmSync(stage, { recursive: true, force: true });
    throw err;
  }

  try {
    fs.renameSync(stage, snapshotDir);
  } catch (err) {
    try {
      fs.renameSync(out, snapshotDir);
    } catch (rollbackErr) {
      /* ignore */
    }
    fs.rmSync(stage, { recursive: true, force: true });
    throw err;
  }

  try {
    fs.rmSync(out, { recursive: true, force: true });
  } catch (err) {
    /* ignore */
  }
}

function readCrSnapshot(steamid) {
  const out = [];
  for (const f of listCrFiles(steamid)) {
    const appId = parseAppId(f);
    if (!appId) continue;
    const data = readJson(path.join(crDir(steamid), f), null);
    if (data) out.push({ appId, data });
  }
  return out;
}

// ---------- Disk cache (Steam API) ----------

function cacheRead(key, ttlMs) {
  const file = path.join(CACHE_DIR, `${key}.json`);
  try {
    const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!rec || typeof rec !== 'object') return null;
    if (Date.now() - rec._ts > ttlMs) {
      fs.unlinkSync(file);
      return null;
    }
    return rec._data;
  } catch (err) {
    return null;
  }
}

function cacheWrite(key, data) {
  const file = path.join(CACHE_DIR, `${key}.json`);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ _ts: Date.now(), _data: data }));
    fs.renameSync(tmp, file);
  } catch (err) {
    /* ignore */
  }
}

// ---------- Logs & tmp ----------

function writeLog(line) {
  const file = path.join(DATA_DIR, 'scheduler.log');
  try {
    fs.appendFileSync(file, `${new Date().toISOString()} ${line}\n`);
  } catch (err) {
    /* ignore */
  }
}

function readLogText() {
  try {
    return fs.readFileSync(path.join(DATA_DIR, 'scheduler.log'), 'utf8');
  } catch (err) {
    return '';
  }
}

function tmpDirFor(prefix) {
  const d = path.join(TMP_DIR, `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

module.exports = {
  ensureDirs,
  readSettings,
  saveSettings,
  readSecrets,
  saveSecrets,
  readUserSecrets,
  saveUserSecrets,
  readUsersIndex,
  saveUsersIndex,
  findUser,
  upsertUser,
  removeUserFromIndex,
  getUserCard,
  cardExists,
  saveUserCard,
  trimCardBackups,
  deleteUser,
  listCrFiles,
  writeCrJson,
  clearCr,
  replaceCrSnapshot,
  readCrSnapshot,
  cacheRead,
  cacheWrite,
  writeLog,
  readLogText,
  tmpDirFor,
};