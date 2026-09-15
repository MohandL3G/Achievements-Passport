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
    Object.assign(existing, merged);
  } else {
    users.push({ ...entry });
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

function saveUserCard(steamid, card) {
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
  writeJson(cardFile, card);
  const users = readUsersIndex();
  const u = findUser(users, steamid);
  if (u) {
    u.lastGeneratedAt = new Date().toISOString();
    u.gamesCount = card.Summary ? card.Summary.TotalGames : u.gamesCount;
    saveUsersIndex(users);
  }
  return card;
}

function deleteUser(steamid) {
  removeUserFromIndex(steamid);
  const dir = userDir(steamid);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

// ---------- CloudRedirect snapshot ----------

function crDir(steamid) {
  return path.join(userDir(steamid), 'last_cr');
}

function listCrFiles(steamid) {
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
  readUsersIndex,
  saveUsersIndex,
  findUser,
  upsertUser,
  removeUserFromIndex,
  getUserCard,
  cardExists,
  saveUserCard,
  deleteUser,
  listCrFiles,
  writeCrJson,
  clearCr,
  readCrSnapshot,
  cacheRead,
  cacheWrite,
  writeLog,
  readLogText,
  tmpDirFor,
};