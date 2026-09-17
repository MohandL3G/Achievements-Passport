function pluckUnlockTimestamps(a) {
  const ut = a.unlock_times;
  if (Array.isArray(ut)) return ut.map(Number).filter((n) => !Number.isNaN(n) && n > 0);
  if (ut && typeof ut === 'object') {
    return Object.values(ut)
      .map(Number)
      .filter((n) => !Number.isNaN(n) && n > 0);
  }
  const single = Number(a.unlock_time || 0);
  return single > 0 ? [single] : [];
}

function isUnlocked(a) {
  if (a.unlocked === true || a.unlocked === 1 || a.unlocked === 'true') return true;
  if (a.unlocked === false || a.unlocked === 0 || a.unlocked === 'false') return false;
  return pluckUnlockTimestamps(a).length > 0 || Number(a.bits || 0) > 0;
}

// A game's raw achievements can be either:
//   - An ARRAY of blocks (one per stat_id), each with parallel names[]/unlock_times[] arrays.
//     A blank name at index i means padding (not a real achievement, excluded from totals);
//     a non-blank name is a real achievement, unlocked iff unlock_times[i] is nonzero.
//   - An OBJECT keyed by achievement name (legacy/single-game shape), each value holding
//     { name, description, achieved, unlock_time(s), bits }.
// Returns a flat list of achievement entries with totals already computed across all blocks.
function buildCrAchievements(achievementsObj) {
  const out = [];
  if (Array.isArray(achievementsObj)) {
    for (const block of achievementsObj) {
      if (!block || typeof block !== 'object') continue;
      const names = Array.isArray(block.names) ? block.names : [];
      const times = Array.isArray(block.unlock_times) ? block.unlock_times : [];
      const blockId = block.stat_id != null ? String(block.stat_id) : '';
      for (let i = 0; i < names.length; i++) {
        const name = names[i];
        if (typeof name !== 'string' || name.trim() === '') continue;
        const ts = Number(times[i] || 0);
        out.push({
          name,
          description: '',
          apiname: blockId ? `${blockId}:${i}` : String(i),
          achieved: ts > 0,
          globalPercent: null,
          unlockTimestamps: ts > 0 ? [ts] : [],
        });
      }
    }
    return out;
  }
  if (achievementsObj && typeof achievementsObj === 'object') {
    return Object.keys(achievementsObj).map((key) => {
      const a = achievementsObj[key] || {};
      const done = isUnlocked(a);
      const timestamps = pluckUnlockTimestamps(a);
      return {
        name: a.name || key,
        description: a.description || '',
        apiname: key,
        achieved: done,
        globalPercent: null,
        unlockTimestamps: timestamps,
      };
    });
  }
  return out;
}

function buildCrGame(appId, json) {
  const achievements = buildCrAchievements(json && json.achievements);
  const unlocked = achievements.filter((a) => a.achieved).length;

  const playtime = json && json.playtime && typeof json.playtime === 'object' ? json.playtime : {};
  const playtimeForever = Number(playtime.minutes_forever ?? json.playtime_forever ?? 0);
  const playtime2weeks = Number(playtime.minutes_2weeks ?? json.minutes_2weeks ?? 0);
  const lastPlayed = Number(playtime.last_played ?? json.last_played ?? 0);

  return {
    AppId: Number(appId),
    Name: `App ${appId}`,
    HeaderImageUrl: '',
    IconUrl: '',
    Source: 2,
    PlaytimeForeverMinutes: playtimeForever,
    PlaytimeLastTwoWeeksMinutes: playtime2weeks,
    LastPlayedTimestamp: lastPlayed,
    AchievementsUnlocked: unlocked,
    AchievementsTotal: achievements.length,
    CompletionPercentage:
      achievements.length > 0 ? Math.round((unlocked / achievements.length) * 1000) / 10 : 0,
    IsPerfect: achievements.length > 0 && unlocked === achievements.length,
    Achievements: achievements,
  };
}

function parseCrJson(text) {
  try {
    const obj = JSON.parse(text);
    return obj && typeof obj === 'object' ? obj : null;
  } catch (err) {
    return null;
  }
}

const CR_GAME_KEYS = ['playtime', 'achievements', 'stats', 'crc_stats'];

function isCrGameData(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    CR_GAME_KEYS.some((k) => k in value)
  );
}

// CloudRedirect data comes in two shapes:
//   Format A: one game per file, filename = "<appid>.json", value = {achievements, stats, playtime, crc_stats}.
//   Format B: one consolidated file (e.g. stats.json) where every top-level key is a numeric AppID
//             string and each value is that game's {achievements, stats, playtime, crc_stats} object.
// Parses a file's text: if it looks like Format B, returns [{ appId, data }, ...] for every entry,
// regardless of the outer filename. Returns null otherwise (caller falls back to filename-based logic).
function parseCrBundle(text) {
  const obj = parseCrJson(text);
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const keys = Object.keys(obj);
  if (keys.length === 0) return null;
  const entries = [];
  for (const key of keys) {
    if (!/^\d+$/.test(key)) return null;
    if (!isCrGameData(obj[key])) return null;
    entries.push({ appId: key, data: obj[key] });
  }
  return entries;
}

// Derives a game's AppID from an S3 object key when the content is single-game Format A data:
//   - "<appid>.json" (classic per-game export)
//   - "<accountId>/<appid>/stats.json" (per-game stats.json inside an AppID folder)
// Returns null when no numeric AppID can be inferred.
function crAppIdFromKey(key) {
  const base = String(key || '').trim();
  const basename = base.split('/').pop() || '';
  const m = /^(\d+)\.json$/i.exec(basename);
  if (m) return m[1];
  if (/^stats\.json$/i.test(basename)) {
    const segs = base.split('/');
    const parent = segs[segs.length - 2];
    if (parent && /^\d+$/.test(parent) && parent !== '0') return parent;
  }
  return null;
}

// Converts raw objects ({ key, text }) fetched from S3 (or uploaded manually) into
// [{ appId, data }] entries. Handles Format A and Format B interchangeably:
//   - Format B: parsed for every entry, key-independent.
//   - Format A: AppID inferred from the object key (filename or folder).
// Deduplicates by AppID (first occurrence wins).
function crEntriesFromObjects(objects) {
  const out = [];
  const seen = new Set();
  for (const obj of objects || []) {
    if (!obj || typeof obj.text !== 'string') continue;
    const bundle = parseCrBundle(obj.text);
    if (bundle) {
      for (const entry of bundle) {
        if (seen.has(entry.appId)) continue;
        seen.add(entry.appId);
        out.push(entry);
      }
      continue;
    }
    const appId = crAppIdFromKey(obj.key);
    if (!appId || seen.has(appId)) continue;
    const data = parseCrJson(obj.text);
    if (!data) continue;
    seen.add(appId);
    out.push({ appId, data });
  }
  return out;
}

module.exports = { buildCrGame, buildCrAchievements, parseCrJson, parseCrBundle, isCrGameData, crAppIdFromKey, crEntriesFromObjects, pluckUnlockTimestamps, isUnlocked };