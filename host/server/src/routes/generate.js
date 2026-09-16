const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const config = require('../config');
const { parseAppId } = require('../utils');
const { requireLogin, requireGenerateAllowed, requireCsrf } = require('./guards');
const {
  readSettings,
  readUsersIndex,
  saveUserCard,
  clearCr,
  writeCrJson,
  readUserSecrets,
  saveUserSecrets,
} = require('../lib/storage');
const { SteamApi } = require('../lib/steamApi');
const { aggregate } = require('../lib/aggregator');
const { buildCrGame, parseCrJson } = require('../lib/cloudRedirect');
const { fetchCrFiles, testConnection } = require('../lib/s3Client');
const { toAccountId } = require('../utils');

const router = express.Router();

const settings = readSettings();
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(config.DATA_DIR, 'tmp')),
    filename: (req, file, cb) =>
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname) || '.json'}`),
  }),
  limits: {
    fileSize: settings.limits.maxZipBytes,
    files: settings.limits.maxFiles,
  },
});

function cleanupFiles(list) {
  for (const f of list) {
    try {
      fs.unlinkSync(f.path);
    } catch (err) {
      /* ignore */
    }
  }
}

async function parseFolderFiles(files, limits) {
  const out = [];
  for (const file of files || []) {
    if (file.size > limits.maxFileBytes) continue;
    const name = path.basename(file.originalname);
    const appId = parseAppId(name);
    if (!appId) continue;
    try {
      const text = fs.readFileSync(file.path, 'utf8');
      const obj = parseCrJson(text);
      if (obj) out.push({ appId, data: obj });
    } catch (err) {
      /* skip malformed */
    }
  }
  return out;
}

async function parseZipFile(file, limits) {
  const out = [];
  const zip = new AdmZip(file.path);
  const entries = zip.getEntries();
  if (entries.length > limits.maxFiles) throw new Error('Zip contains too many entries');
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const appId = parseAppId(path.basename(entry.entryName));
    if (!appId) continue;
    if (entry.header && entry.header.size > limits.maxFileBytes) continue;
    const obj = parseCrJson(entry.getData().toString('utf8'));
    if (obj) out.push({ appId, data: obj });
  }
  return out;
}

router.post(
  '/',
  requireLogin,
  requireGenerateAllowed,
  upload.fields([
    { name: 'crZip', maxCount: 1 },
    { name: 'crFiles', maxCount: 5000 },
  ]),
  async (req, res, next) => {
    const allFiles = [];
    const crZip = req.files && req.files.crZip ? req.files.crZip : [];
    const crFiles = req.files && req.files.crFiles ? req.files.crFiles : [];
    allFiles.push(...crZip, ...crFiles);

    try {
      const steamid = req.session.steamid;
      const includeSteam = req.body.includeSteam === true || req.body.includeSteam === 'true';
      const crSource = String(req.body.crSource || 'none');
      const limits = readSettings().limits;
      let crRaw = [];
      let usedPrefix = null;

      const crSources = ['none', 'folder', 'zip', 's3'];
      if (!crSources.includes(crSource)) {
        return res.status(400).json({ ok: false, error: 'Unknown CloudRedirect source. Use "none", "folder", "zip", or "s3".' });
      }
      if (!includeSteam && crSource === 'none') {
        return res
          .status(400)
          .json({ ok: false, error: 'At least one source is required: enable Steam data or choose a CloudRedirect source.' });
      }

      if (crSource === 's3') {
        const userS3 = readUserSecrets(steamid).s3;
        if (!userS3 || !userS3.bucket) {
          return res.status(400).json({ ok: false, error: "You haven't configured your S3/RustFS connection yet." });
        }
        const result = await fetchCrFiles(userS3, toAccountId(steamid));
        crRaw = result.files;
        usedPrefix = result.usedPrefix;
      } else if (crSource === 'zip') {
        if (!crZip[0]) return res.status(400).json({ ok: false, error: 'No zip file received' });
        crRaw = await parseZipFile(crZip[0], limits);
      } else if (crSource === 'folder') {
        crRaw = await parseFolderFiles(crFiles, limits);
      }

      // Persist snapshot for nightly auto-updates.
      clearCr(steamid);
      for (const f of crRaw) writeCrJson(steamid, f.appId, f.data);

      const crGames = crRaw.map((f) => buildCrGame(f.appId, f.data));
      const api = includeSteam ? new SteamApi(config.STEAM_API_KEY) : null;
      const card = await aggregate(api, steamid, crGames);
      saveUserCard(steamid, card, includeSteam);

      const users = readUsersIndex().map((u) => u.steamid64);
      res.json({
        ok: true,
        games: card.Summary.TotalGames,
        perfect: card.Summary.PerfectGames,
        generatedAt: card.GeneratedAtFormatted,
        privateProfile: card.PrivateProfile,
        usedPrefix,
        registered: users.includes(steamid),
      });
    } catch (err) {
      next(err);
    } finally {
      cleanupFiles(allFiles);
    }
  }
);

// ---------- Per-user S3/RustFS connection ----------

function s3FromBody(req, prev) {
  return {
    endpoint: String(req.body.endpoint || '').trim() || prev.endpoint || '',
    bucket: String(req.body.bucket || '').trim() || prev.bucket || '',
    region: String(req.body.region || '').trim() || prev.region || 'us-east-1',
    accessKeyId: String(req.body.accessKeyId || '').trim() || prev.accessKeyId || '',
    secretAccessKey: String(req.body.secretAccessKey || '').trim() || prev.secretAccessKey || '',
    prefix: String(req.body.prefix || '').trim().replace(/^\/+|\/+$/g, ''),
    forcePathStyle: req.body.forcePathStyle === false ? false : true,
  };
}

router.get('/s3', requireLogin, (req, res) => {
  const saved = readUserSecrets(req.session.steamid).s3;
  if (!saved || !saved.bucket) {
    return res.json({ configured: false });
  }
  res.json({
    configured: true,
    endpoint: saved.endpoint || '',
    bucket: saved.bucket || '',
    region: saved.region || 'us-east-1',
    prefix: saved.prefix || '',
    forcePathStyle: saved.forcePathStyle !== false,
  });
});

router.post('/s3', requireLogin, requireCsrf, (req, res) => {
  const steamid = req.session.steamid;
  const prev = readUserSecrets(steamid).s3 || {};
  saveUserSecrets(steamid, { s3: s3FromBody(req, prev) });
  res.json({ ok: true });
});

router.post('/s3/test', requireLogin, requireCsrf, async (req, res) => {
  try {
    const steamid = req.session.steamid;
    const saved = readUserSecrets(steamid).s3 || {};
    const raw = req.body || {};
    const cfg = {
      endpoint: raw.endpoint || saved.endpoint,
      bucket: raw.bucket || saved.bucket,
      region: raw.region || saved.region || 'us-east-1',
      accessKeyId: raw.accessKeyId || saved.accessKeyId,
      secretAccessKey: raw.secretAccessKey || saved.secretAccessKey,
      forcePathStyle: raw.forcePathStyle === false ? false : true,
    };
    if (!cfg.bucket) return res.status(400).json({ ok: false, error: 'Bucket name is required' });
    await testConnection(cfg);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err && err.message ? err.message : 'Connection failed' });
  }
});

module.exports = router;