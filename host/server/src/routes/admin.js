const express = require('express');
const config = require('../config');
const { isValidSteamId64 } = require('../utils');
const {
  readSettings,
  saveSettings,
  readSecrets,
  saveSecrets,
  readUsersIndex,
  saveUsersIndex,
  findUser,
  deleteUser,
  readLogText,
} = require('../lib/storage');
const { requireAdmin, requireCsrf } = require('./guards');
const { testConnection, fetchCrFiles } = require('../lib/s3Client');
const { SteamApi } = require('../lib/steamApi');
const { aggregate } = require('../lib/aggregator');
const { saveUserCard } = require('../lib/storage');
const { writeLog } = require('../lib/storage');
const { startScheduler } = require('../lib/scheduler');

const router = express.Router();
router.use(requireAdmin);

function publicS3(secrets) {
  if (!secrets.s3) return { configured: false };
  return {
    configured: true,
    endpoint: secrets.s3.endpoint || '',
    bucket: secrets.s3.bucket || '',
    region: secrets.s3.region || 'us-east-1',
    prefix: secrets.s3.prefix || '',
    forcePathStyle: secrets.s3.forcePathStyle !== false,
  };
}

router.get('/state', (req, res) => {
  const s = readSettings();
  const users = readUsersIndex();
  const logLines = readLogText().split('\n').filter(Boolean).slice(-50);
  res.json({
    ownerSteamid: config.OWNER_STEAMID,
    gate: { mode: s.gateMode, whitelist: s.whitelist },
    scheduler: s.scheduler,
    limits: s.limits,
    s3: publicS3(readSecrets()),
    users: users.map((u) => ({
      steamid64: u.steamid64,
      personaName: u.personaName,
      avatarUrl: u.avatarUrl,
      autoUpdate: !!u.autoUpdate,
      disabled: !!u.disabled,
      lastGeneratedAt: u.lastGeneratedAt,
      createdAt: u.createdAt,
      gamesCount: u.gamesCount || null,
    })),
    log: logLines,
  });
});

router.post('/gate', requireCsrf, (req, res) => {
  const s = readSettings();
  if (req.body.mode === 'open' || req.body.mode === 'protected') {
    s.gateMode = req.body.mode;
  }
  if (Array.isArray(req.body.whitelist)) {
    s.whitelist = req.body.whitelist.map((v) => String(v).trim()).filter(isValidSteamId64);
  } else if (typeof req.body.whitelistText === 'string') {
    s.whitelist = req.body.whitelistText
      .split(/[\s,\n]+/)
      .map((v) => v.trim())
      .filter(isValidSteamId64);
  }
  saveSettings(s);
  writeLog(`gate updated: mode=${s.gateMode}, whitelist=${s.whitelist.length}`);
  res.json({ ok: true, gateMode: s.gateMode, whitelist: s.whitelist });
});

router.post('/scheduler', requireCsrf, (req, res) => {
  const s = readSettings();
  s.scheduler.enabled = !!req.body.enabled;
  if (typeof req.body.cron === 'string' && /^[\d\s*\/,\-]+$/.test(req.body.cron.trim())) {
    s.scheduler.cron = req.body.cron.trim();
  }
  saveSettings(s);
  writeLog(`scheduler updated: enabled=${s.scheduler.enabled}, cron=${s.scheduler.cron}`);
  startScheduler();
  res.json({ ok: true, scheduler: s.scheduler });
});

router.post('/s3', requireCsrf, (req, res) => {
  const secrets = readSecrets() || {};
  const prev = secrets.s3 || {};
  secrets.s3 = {
    endpoint: String(req.body.endpoint || '').trim() || prev.endpoint || '',
    bucket: String(req.body.bucket || '').trim() || prev.bucket || '',
    region: String(req.body.region || '').trim() || prev.region || 'us-east-1',
    accessKeyId: String(req.body.accessKeyId || '').trim() || prev.accessKeyId || '',
    secretAccessKey: String(req.body.secretAccessKey || '').trim() || prev.secretAccessKey || '',
    prefix: String(req.body.prefix || '').trim().replace(/^\/+|\/+$/g, ''),
    forcePathStyle: req.body.forcePathStyle === false ? false : true,
  };
  saveSecrets(secrets);
  writeLog('s3 settings saved');
  res.json({ ok: true });
});

router.post('/s3/test', requireCsrf, async (req, res, next) => {
  try {
    const secrets = readSecrets();
    if (!secrets.s3 || !secrets.s3.bucket) {
      return res.status(400).json({ ok: false, error: 'Save S3 settings first' });
    }
    const raw = req.body || {};
    const cfg = {
      endpoint: raw.endpoint || secrets.s3.endpoint,
      bucket: raw.bucket || secrets.s3.bucket,
      region: raw.region || secrets.s3.region || 'us-east-1',
      accessKeyId: raw.accessKeyId || secrets.s3.accessKeyId,
      secretAccessKey: raw.secretAccessKey || secrets.s3.secretAccessKey,
      forcePathStyle: raw.forcePathStyle === false ? false : true,
    };
    await testConnection(cfg);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err && err.message ? err.message : 'Connection failed' });
  }
});

router.post('/s3/pull-check', requireCsrf, async (req, res, next) => {
  try {
    const secrets = readSecrets();
    if (!secrets.s3 || !secrets.s3.bucket) {
      return res.status(400).json({ ok: false, error: 'Save S3 settings first' });
    }
    if (!config.OWNER_STEAMID) {
      return res.status(400).json({ ok: false, error: 'OWNER_STEAMID not configured' });
    }
    const { toAccountId } = require('../utils');
    const result = await fetchCrFiles(secrets.s3, toAccountId(config.OWNER_STEAMID));
    res.json({ ok: true, files: result.objects.length, prefix: result.usedPrefix });
  } catch (err) {
    res.status(400).json({ ok: false, error: err && err.message ? err.message : 'Pull failed' });
  }
});

router.post('/users/:steamid', requireCsrf, (req, res) => {
  const { steamid } = req.params;
  if (!isValidSteamId64(steamid)) return res.status(400).json({ ok: false, error: 'Invalid Steam ID' });
  const users = readUsersIndex();
  const u = findUser(users, steamid);
  if (!u) return res.status(404).json({ ok: false, error: 'User not found' });
  if (typeof req.body.autoUpdate === 'boolean') u.autoUpdate = req.body.autoUpdate;
  if (typeof req.body.disabled === 'boolean') u.disabled = req.body.disabled;
  saveUsersIndex(users);
  writeLog(`user ${steamid} updated: autoUpdate=${u.autoUpdate}, disabled=${u.disabled}`);
  res.json({ ok: true, user: u });
});

router.delete('/users/:steamid', requireCsrf, (req, res) => {
  const { steamid } = req.params;
  if (!isValidSteamId64(steamid)) return res.status(400).json({ ok: false, error: 'Invalid Steam ID' });
  deleteUser(steamid);
  writeLog(`user ${steamid} deleted`);
  res.json({ ok: true });
});

router.post('/users/:steamid/regenerate', requireCsrf, async (req, res, next) => {
  const { steamid } = req.params;
  if (!isValidSteamId64(steamid)) return res.status(400).json({ ok: false, error: 'Invalid Steam ID' });
  try {
    const api = new SteamApi(config.STEAM_API_KEY);
    const card = await aggregate(api, steamid);
    saveUserCard(steamid, card);
    writeLog(`manual regenerate ${steamid}: ${card.Summary.TotalGames} games`);
    res.json({ ok: true, games: card.Summary.TotalGames, perfect: card.Summary.PerfectGames });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

module.exports = router;