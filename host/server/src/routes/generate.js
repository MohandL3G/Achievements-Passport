const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const config = require('../config');
const { parseAppId } = require('../utils');
const { requireLogin, requireGenerateAllowed } = require('./guards');
const { readSettings, readSecrets, readUsersIndex, saveUserCard, clearCr, writeCrJson } = require('../lib/storage');
const { SteamApi } = require('../lib/steamApi');
const { aggregate } = require('../lib/aggregator');
const { buildCrGame, parseCrJson } = require('../lib/cloudRedirect');
const { fetchCrFiles } = require('../lib/s3Client');
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
      const mode = String(req.body.mode || 'steam');
      const limits = readSettings().limits;
      let crRaw = [];
      let usedPrefix = null;

      if (mode === 's3') {
        if (steamid !== config.OWNER_STEAMID) {
          return res.status(403).json({ ok: false, error: 'S3 auto-pull is owner only' });
        }
        const secrets = readSecrets();
        if (!secrets.s3 || !secrets.s3.bucket) {
          return res.status(400).json({ ok: false, error: 'S3 is not configured. Ask the site owner.' });
        }
        const result = await fetchCrFiles(secrets.s3, toAccountId(steamid));
        crRaw = result.files;
        usedPrefix = result.usedPrefix;
      } else if (mode === 'zip') {
        if (!crZip[0]) return res.status(400).json({ ok: false, error: 'No zip file received' });
        crRaw = await parseZipFile(crZip[0], limits);
      } else if (mode === 'folder') {
        crRaw = await parseFolderFiles(crFiles, limits);
      }

      // Persist snapshot for nightly auto-updates.
      clearCr(steamid);
      for (const f of crRaw) writeCrJson(steamid, f.appId, f.data);

      const crGames = crRaw.map((f) => buildCrGame(f.appId, f.data));
      const api = new SteamApi(config.STEAM_API_KEY);
      const card = await aggregate(api, steamid, crGames);
      saveUserCard(steamid, card);

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

module.exports = router;