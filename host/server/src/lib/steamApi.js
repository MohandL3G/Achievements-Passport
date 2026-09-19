const fs = require('fs');
const path = require('path');
const config = require('../config');
const { cacheRead, cacheWrite, writeLog } = require('./storage');
const { toAccountId } = require('../utils');

const TTL = {
  summaries: 6 * 3600 * 1000,
  owned: 24 * 3600 * 1000,
  detail: 24 * 3600 * 1000,
  rarity: 24 * 3600 * 1000,
  appList: 7 * 24 * 3600 * 1000,
  recently: 12 * 3600 * 1000,
};

class SteamApi {
  constructor(apiKey) {
    this.apiKey = apiKey || '';
    this.appList = null;
  }

  async call(interfaceName, method, version, params = {}) {
    const qs = new URLSearchParams({ key: this.apiKey, ...params });
    const url = `${config.STEAMAPI_BASE}/${interfaceName}/${method}/${version}/?${qs.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Steam ${method} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  }

  async getPlayerSummaries(steamid) {
    const key = `summaries/${steamid}`;
    const cached = cacheRead(key, TTL.summaries);
    if (cached) return cached;
    const json = await this.call('ISteamUser', 'GetPlayerSummaries', 'v0002', { steamids: steamid });
    const p = json && json.response && json.response.players ? json.response.players[0] : null;
    if (!p) return null;
    const out = {
      steamid64: String(p.steamid),
      personaName: p.personaname || 'Steam user',
      profileUrl: p.profileurl || '',
      avatarFullUrl: p.avatarfull || '',
      avatarMediumUrl: p.avatarmedium || '',
      customTitle: p.personastateflag ? p.customURL : null,
    };
    cacheWrite(key, out);
    return out;
  }

  async getOwnedGames(steamid) {
    const key = `owned/${steamid}`;
    const cached = cacheRead(key, TTL.owned);
    if (cached) return cached;
    let privateProfile = false;
    let games = [];
    try {
      const json = await this.call('IPlayerService', 'GetOwnedGames', 'v0001', {
        steamid,
        include_appinfo: 1,
        include_played_free_games: 1,
      });
      games = (json && json.response && json.response.games) || [];
    } catch (err) {
      if (/401|403|private|is not visible|requires.*profile/i.test(String(err.message))) {
        privateProfile = true;
      } else {
        throw err;
      }
    }
    const out = { privateProfile, games };
    cacheWrite(key, out);
    return out;
  }

  async getRecentlyPlayedGames(steamid) {
    const key = `recent/${steamid}`;
    const cached = cacheRead(key, TTL.recently);
    if (cached) return cached;
    try {
      const json = await this.call('IPlayerService', 'GetRecentlyPlayedGames', 'v0001', { steamid, count: 5 });
      const recent = (json && json.response && json.response.games) || [];
      const out = recent.map((g) => ({
        AppId: String(g.appid),
        Name: g.name || `App ${g.appid}`,
        PlaytimeLastTwoWeeksMinutes: Number(g.playtime_2weeks || 0),
        PlaytimeForeverMinutes: Number(g.playtime_forever || 0),
        HeaderImageUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg`,
      }));
      cacheWrite(key, out);
      return out;
    } catch (err) {
      return [];
    }
  }

  async getGlobalRarity(appId) {
    const key = `rarity/${appId}`;
    const cached = cacheRead(key, TTL.rarity);
    if (cached) return cached;
    try {
      const json = await this.call('ISteamUserStats', 'GetGlobalAchievementPercentagesForApp', 'v0002', {
        gameid: appId,
      });
      const arr =
        (json && json.achievementpercentages && json.achievementpercentages.achievements) || [];
      cacheWrite(key, arr);
      return arr;
    } catch (err) {
      return [];
    }
  }

  async getGameDetails(steamid, appId) {
    const key = `detail/${steamid}/${appId}`;
    const cached = cacheRead(key, TTL.detail);
    if (cached) return cached;

    const [schemaRes, achRes, rarityArr] = await Promise.allSettled([
      this.call('ISteamUserStats', 'GetSchemaForGame', 'v2', { appid: appId }),
      this.call('ISteamUserStats', 'GetPlayerAchievements', 'v0001', { steamid, appid: appId }),
      this.getGlobalRarity(appId),
    ]);

    const schema =
      schemaRes.status === 'fulfilled' &&
      schemaRes.value &&
      schemaRes.value.game &&
      schemaRes.value.game.availableGameStats &&
      schemaRes.value.game.availableGameStats.achievements
        ? schemaRes.value.game.availableGameStats.achievements
        : [];
    const schemaMap = new Map(
      schema.map((s) => [String(s.name || s.apiname), { name: s.displayName || s.name, description: s.description || '' }])
    );
    const playerAch =
      achRes.status === 'fulfilled' && achRes.value && achRes.value.playerstats && achRes.value.playerstats.achievements
        ? achRes.value.playerstats.achievements
        : [];
    const rarityMap = new Map(
      (rarityArr.status === 'fulfilled' && Array.isArray(rarityArr.value) ? rarityArr.value : []).map((r) => [
        String(r.name),
        Number(r.percent),
      ])
    );

    const achievements = (playerAch || []).map((p) => {
      const d = schemaMap.get(String(p.apiname));
      const gp = rarityMap.has(String(p.apiname)) ? rarityMap.get(String(p.apiname)) : null;
      return {
        name: (d && d.name) || p.name || String(p.apiname),
        description: (d && d.description) || '',
        apiname: String(p.apiname),
        achieved: p.achieved === 1 || p.achieved === true,
        globalPercent: gp,
      };
    });

    const total = achievements.length;
    const unlocked = achievements.filter((a) => a.achieved).length;
    const out = {
      achievements,
      total,
      unlocked,
      statsHidden: achRes.status === 'fulfilled' && achRes.value && achRes.value.playerstats && achRes.value.playerstats.error
        ? achRes.value.playerstats.error
        : null,
      schemaAvailable: schema.length > 0,
    };
    cacheWrite(key, out);
    return out;
  }

  async ensureAppList() {
    if (this.appList) return this.appList;
    const cached = cacheRead('applist', TTL.appList);
    if (cached) {
      this.appList = new Map(cached);
      return this.appList;
    }
    try {
      const json = await this.call('ISteamApps', 'GetAppList', 'v0002', {});
      const apps = (json && json.applist && json.applist.apps) || [];
      if (!apps.length) {
        writeLog('applist fetch returned no apps; game names may fall back to placeholders');
        this.appList = new Map();
        return this.appList;
      }
      const arr = apps.map((a) => [String(a.appid), a.name]);
      cacheWrite('applist', arr);
      this.appList = new Map(arr);
      writeLog(`applist loaded: ${arr.length} apps cached (7-day ttl)`);
    } catch (err) {
      const msg = (err && err.message ? String(err.message) : String(err)).slice(0, 160);
      writeLog(`applist fetch failed; game names may fall back to placeholders: ${msg}`);
      this.appList = new Map();
    }
    return this.appList;
  }

  async buildGameRecord(steamid, g) {
    const appId = String(g.appid);
    const details = await this.getGameDetails(steamid, appId);
    const name = (this.appList && this.appList.get(appId)) || g.name || `App ${appId}`;
    const header = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
    const icon = g.img_icon_url
      ? `https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${appId}/${g.img_icon_url}.jpg`
      : '';
    const total = details.total;
    const unlocked = details.unlocked;
    const pct = total > 0 ? Math.round((unlocked / total) * 1000) / 10 : 0;
    return {
      AppId: Number(appId),
      Name: name,
      HeaderImageUrl: header,
      IconUrl: icon,
      Source: 1,
      PlaytimeForeverMinutes: Number(g.playtime_forever || 0),
      PlaytimeLastTwoWeeksMinutes: Number(g.playtime_2weeks || 0),
      LastPlayedTimestamp: Number(g.rtime_last_played || 0),
      AchievementsUnlocked: unlocked,
      AchievementsTotal: total,
      CompletionPercentage: pct,
      IsPerfect: total > 0 && unlocked === total,
      Achievements: details.achievements,
    };
  }
}

function accountIdOfSteamId64(steamid64) {
  return toAccountId(steamid64);
}

module.exports = { SteamApi, accountIdOfSteamId64 };