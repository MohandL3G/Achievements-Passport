const express = require('express');
const { isValidSteamId64 } = require('../utils');
const { getUserCard } = require('../lib/storage');
const { renderBadge } = require('../lib/badgesvg');

const router = express.Router();

router.get('/', (req, res) => {
  const steamid = String(req.query.steamid || '');
  const card = isValidSteamId64(steamid) ? getUserCard(steamid) : null;
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'no-store');
  res.send(renderBadge(card, steamid));
});

module.exports = router;