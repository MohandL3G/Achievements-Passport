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

function buildCrGame(appId, json) {
  const achievementsObj =
    json && json.achievements && typeof json.achievements === 'object' ? json.achievements : {};
  const achievements = Object.keys(achievementsObj).map((key) => {
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

  return {
    AppId: Number(appId),
    Name: `App ${appId}`,
    HeaderImageUrl: '',
    IconUrl: '',
    Source: 2,
    PlaytimeForeverMinutes: Number(json.playtime_forever || 0),
    PlaytimeLastTwoWeeksMinutes: Number(json.minutes_2weeks || 0),
    LastPlayedTimestamp: Number(json.last_played || 0),
    AchievementsUnlocked: achievements.filter((a) => a.achieved).length,
    AchievementsTotal: achievements.length,
    CompletionPercentage:
      achievements.length > 0
        ? Math.round((achievements.filter((a) => a.achieved).length / achievements.length) * 1000) / 10
        : 0,
    IsPerfect: achievements.length > 0 && achievements.every((a) => a.achieved),
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

module.exports = { buildCrGame, parseCrJson, pluckUnlockTimestamps, isUnlocked };