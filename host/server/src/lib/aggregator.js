const { mapLimit, nowIso } = require('../utils');
const { readCrSnapshot, cacheRead } = require('./storage');

const APPLIST_CACHE_TTL = 7 * 24 * 3600 * 1000;

function loadCachedAppList() {
  const cached = cacheRead('applist', APPLIST_CACHE_TTL);
  return cached && Array.isArray(cached) ? new Map(cached) : new Map();
}

function buildSummary(games) {
  const withAch = games.filter((g) => g.AchievementsTotal > 0);
  const perfect = withAch.filter((g) => g.IsPerfect).length;
  const totalUnlocked = withAch.reduce((acc, g) => acc + g.AchievementsUnlocked, 0);
  const totalAch = withAch.reduce((acc, g) => acc + g.AchievementsTotal, 0);
  const playtimeMinutes = games.reduce((acc, g) => acc + g.PlaytimeForeverMinutes, 0);
  const everPlayed = games.filter((g) => g.PlaytimeForeverMinutes > 0).length;
  const rareCount = withAch.filter((g) =>
    g.Achievements.some((a) => a.achieved && a.globalPercent != null && a.globalPercent < 10)
  ).length;

  return {
    PerfectGames: perfect,
    TotalGames: games.length,
    TotalAchievementsUnlocked: totalUnlocked,
    TotalAchievements: totalAch,
    CompletionPercentage: totalAch > 0 ? Math.round((totalUnlocked / totalAch) * 1000) / 10 : 0,
    TotalPlaytimeMinutes: playtimeMinutes,
    GamesEverPlayed: everPlayed,
    RareAchievementsCount: rareCount,
    GamesWithAchievements: withAch.length,
  };
}

function buildHighlights(games) {
  const withAch = games
    .filter((g) => g.AchievementsTotal > 0)
    .sort((a, b) => b.AchievementsUnlocked - a.AchievementsUnlocked)
    .slice(0, 3);
  const fill = games
    .filter((g) => g.AchievementsTotal === 0)
    .sort((a, b) => b.PlaytimeForeverMinutes - a.PlaytimeForeverMinutes)
    .slice(0, 3 - withAch.length);
  return [...withAch, ...fill].slice(0, 3).map((g) => ({
    AppId: g.AppId,
    Name: g.Name,
    HeaderImageUrl: g.HeaderImageUrl,
    Source: g.Source,
    AchievementsUnlocked: g.AchievementsUnlocked,
    AchievementsTotal: g.AchievementsTotal,
    IsPerfect: g.IsPerfect,
    PlaytimeForeverMinutes: g.PlaytimeForeverMinutes,
    CompletionPercentage: g.CompletionPercentage,
  }));
}

async function aggregateSteam(api, steamid) {
  const profile = await api.getPlayerSummaries(steamid);
  const owned = await api.getOwnedGames(steamid);
  await api.ensureAppList();

  const list = owned.privateProfile
    ? []
    : await mapLimit(owned.games, 2, (g) => api.buildGameRecord(steamid, g));

  return {
    profile,
    owned,
    games: list,
  };
}

function mergeAndFinalize(steamGames, crGames, appList) {
  const byId = new Map();
  for (const c of crGames) byId.set(String(c.AppId), c);
  for (const g of steamGames) byId.set(String(g.AppId), g);

  let games = Array.from(byId.values());

  // Drop rule: games with 0 playtime AND 0 achievements are excluded.
  games = games.filter((g) => g.PlaytimeForeverMinutes > 0 || g.AchievementsTotal > 0);

  for (const g of games) {
    if (!g.HeaderImageUrl) {
      g.HeaderImageUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.AppId}/header.jpg`;
    }
    if (!g.Name || g.Name === `App ${g.AppId}`) {
      const resolved = appList && appList.get(String(g.AppId));
      if (resolved) g.Name = resolved;
    }
  }

  games.sort((a, b) => {
    if (b.IsPerfect !== a.IsPerfect) return b.IsPerfect - a.IsPerfect;
    if (b.PlaytimeForeverMinutes !== a.PlaytimeForeverMinutes) {
      return b.PlaytimeForeverMinutes - a.PlaytimeForeverMinutes;
    }
    return String(a.Name).localeCompare(String(b.Name));
  });

  return games;
}

async function aggregate(api, steamid, crGamesOverride) {
  let profile = null;
  let owned = { privateProfile: false };
  let steamGames = [];

  if (api) {
    const steam = await aggregateSteam(api, steamid);
    profile = steam.profile;
    owned = steam.owned;
    steamGames = steam.games;
  }

  let crGames = crGamesOverride;
  const appList = api && api.appList ? api.appList : loadCachedAppList();
  if (!crGames) {
    crGames = readCrSnapshot(steamid).map(({ appId, data }) => {
      const { buildCrGame } = require('./cloudRedirect');
      return buildCrGame(appId, data, appList);
    });
  }

  const games = mergeAndFinalize(steamGames, crGames, appList);
  const summary = buildSummary(games);
  const highlights = buildHighlights(games);

  const player = profile || {
    steamid64: steamid,
    personaName: `Unknown (${steamid})`,
    profileUrl: `https://steamcommunity.com/profiles/${steamid}`,
    avatarFullUrl: '',
    avatarMediumUrl: '',
  };

  const generated = new Date();
  return {
    Player: player,
    Summary: summary,
    HighlightGames: highlights,
    Games: games,
    PrivateProfile: owned.privateProfile,
    GeneratedAtTimestamp: Math.floor(generated.getTime() / 1000),
    GeneratedAtFormatted: generated.toLocaleString('en-US', {
      timeZone: 'UTC',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).replace(',', '') + ' UTC',
    Version: 2,
  };
}

module.exports = { aggregate, aggregateSteam, mergeAndFinalize, buildSummary, buildHighlights };