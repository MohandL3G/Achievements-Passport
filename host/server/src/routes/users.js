const express = require('express');
const { isValidSteamId64 } = require('../utils');
const { readUsersIndex, getUserCard } = require('../lib/storage');

const router = express.Router();

function cleanCard(game) {
  return {
    AppId: game.AppId,
    Name: game.Name,
    HeaderImageUrl: game.HeaderImageUrl,
    IconUrl: game.IconUrl,
    Source: game.Source,
    PlaytimeForeverMinutes: game.PlaytimeForeverMinutes,
    PlaytimeLastTwoWeeksMinutes: game.PlaytimeLastTwoWeeksMinutes,
    LastPlayedTimestamp: game.LastPlayedTimestamp,
    AchievementsUnlocked: game.AchievementsUnlocked,
    AchievementsTotal: game.AchievementsTotal,
    CompletionPercentage: game.CompletionPercentage,
    IsPerfect: game.IsPerfect,
  };
}

router.get('/u', (req, res) => {
  const users = readUsersIndex()
    .filter((u) => !u.disabled)
    .map((u) => ({
      steamid64: u.steamid64,
      personaName: u.personaName,
      avatarUrl: u.avatarUrl,
      lastGeneratedAt: u.lastGeneratedAt,
    }));
  res.json({ users });
});

router.get('/u/:steamid/card', (req, res) => {
  const { steamid } = req.params;
  if (!isValidSteamId64(steamid)) return res.status(400).json({ ok: false, error: 'Invalid Steam ID' });
  const card = getUserCard(steamid);
  if (!card) return res.status(404).json({ ok: false, error: 'No card generated for this account yet' });
  res.json(card);
});

router.get('/u/:steamid/games', (req, res) => {
  const { steamid } = req.params;
  if (!isValidSteamId64(steamid)) return res.status(400).json({ ok: false, error: 'Invalid Steam ID' });
  const card = getUserCard(steamid);
  if (!card) return res.status(404).json({ ok: false, error: 'No card generated for this account yet' });
  res.json({
    summary: card.Summary,
    player: card.Player,
    games: (card.Games || []).map(cleanCard),
  });
});

router.get('/u/:steamid/games/:appid', (req, res) => {
  const { steamid, appid } = req.params;
  if (!isValidSteamId64(steamid)) return res.status(400).json({ ok: false, error: 'Invalid Steam ID' });
  const card = getUserCard(steamid);
  if (!card) return res.status(404).json({ ok: false, error: 'No card generated for this account yet' });
  const game = (card.Games || []).find((g) => String(g.AppId) === appid);
  if (!game) return res.status(404).json({ ok: false, error: 'Game not found on this card' });
  res.json(game);
});

router.get('/u/:steamid/badge.svg', (req, res) => {
  const { steamid } = req.params;
  if (!isValidSteamId64(steamid)) return res.status(400).send('Invalid Steam ID');
  const card = getUserCard(steamid);
  const { renderBadge } = require('../lib/badgesvg');
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'no-store');
  res.send(renderBadge(card, steamid));
});

module.exports = router;